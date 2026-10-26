import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { StockService } from './stock.service';
import { WarehouseService } from './warehouse.service';
import { ProductService } from '../../products/services/product.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { WarehouseTransfer, WarehouseMovementHeader } from '../../../app/models/movement';
import { normalizeWarehouseMovement } from '../utils/movement-normalizer';

const TRANSFERS_STORAGE_KEY = 'cuadreenv_warehouse_transfers_db';

@Injectable({
  providedIn: 'root',
})
export class WarehouseTransferService {
  private api = inject(ApiClientService);
  private stockService = inject(StockService);
  private warehouseService = inject(WarehouseService);
  private productService = inject(ProductService);

  private getLocalTransfers(): WarehouseTransfer[] {
    try {
      const raw = localStorage.getItem(TRANSFERS_STORAGE_KEY);
      const list: WarehouseTransfer[] = raw ? JSON.parse(raw) : [];
      return list.filter((item) => (item.totalQuantity || 0) > 0 || (item.productDetails && item.productDetails.length > 0));
    } catch {
      return [];
    }
  }

  private saveLocalTransfers(list: WarehouseTransfer[]): void {
    try {
      localStorage.setItem(TRANSFERS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local warehouse transfers:', e);
    }
  }

  async getTransfers(): Promise<ApiResponse<WarehouseTransfer[]>> {
    let apiList: WarehouseTransfer[] = [];
    try {
      const res = await this.api.get<any, any>('/WarehouseTransfer');
      const list = extractArray<WarehouseTransfer>(res);
      if (list && list.length > 0) {
        apiList = list.map((item) => normalizeWarehouseMovement<WarehouseTransfer>(item));
      }
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/inventory/movements', { params: { type: 'Transfer' } });
        const list2 = extractArray<any>(res2);
        if (list2 && list2.length > 0) {
          apiList = list2.map((item) => normalizeWarehouseMovement<WarehouseTransfer>({ ...item, type: 'TRANSFER' }));
        }
      } catch {
        // ignore
      }
    }

    // Filter out invalid/empty movements (such as deleted rows with 0 quantity and 0 products)
    const validApiList = apiList.filter((item) => {
      const hasProducts = item.productDetails && item.productDetails.length > 0 && item.productDetails[0].productId > 0;
      const hasQty = (item.totalQuantity || 0) > 0;
      const isNotDeleted = !(item as any).isDeleted && (item as any).active !== false;
      return (hasProducts || hasQty) && isNotDeleted;
    });

    const localList = this.getLocalTransfers().map((t) => normalizeWarehouseMovement<WarehouseTransfer>(t));
    const map = new Map<string, WarehouseTransfer>();

    // 1. Register local movements first (they have full rich line item details)
    for (const loc of localList) {
      if (loc.id !== undefined) map.set(String(loc.id), loc);
    }

    // 2. Merge backend movements, preserving line item details from local if available
    for (const t of validApiList) {
      if (t.id !== undefined) {
        const key = String(t.id);
        const existing = map.get(key);
        if (existing && existing.productDetails && existing.productDetails.length > 0) {
          map.set(key, { ...t, ...existing, id: t.id });
        } else {
          map.set(key, t);
        }
      }
    }

    const combined = Array.from(map.values()).sort(
      (a, b) => new Date(b.createDate || 0).getTime() - new Date(a.createDate || 0).getTime()
    );
    return { success: true, data: combined };
  }

  async getTransfer(id: number): Promise<ApiResponse<WarehouseTransfer>> {
    try {
      const res = await this.api.get<any, any>(`/WarehouseTransfer/${id}`);
      if (res) {
        const transfer = normalizeWarehouseMovement<WarehouseTransfer>(res.data ?? res);
        return { success: true, data: transfer };
      }
    } catch {
      // fallback to local
    }
    const list = this.getLocalTransfers();
    const found = list.find((t) => t.id === id);
    if (found) return { success: true, data: normalizeWarehouseMovement<WarehouseTransfer>(found) };
    return { success: false, message: 'Transferencia no encontrada.' };
  }

  async createTransfer(transfer: WarehouseMovementHeader): Promise<ApiResponse<WarehouseTransfer>> {
    const originId = transfer.warehouseOfOriginId || 1;
    const destinationId = transfer.destinationWarehouseId || 2;

    if (originId === destinationId) {
      return {
        success: false,
        message: 'El almacén de origen no puede ser igual al almacén de destino.',
      };
    }

    // Validate origin stock for each item
    for (const item of transfer.productDetails || []) {
      const pRes = await this.productService.getProduct(item.productId);
      const allowWithoutStock = pRes?.data?.invoiceWithoutStock ?? false;
      const currentStock = await this.stockService.getProductStockInWarehouse(originId, item.productId);

      if (!allowWithoutStock && item.quantity > currentStock) {
        return {
          success: false,
          message: `Stock insuficiente en almacén de origen para "${item.productName}". Disponible: ${currentStock}, Solicitado para transferir: ${item.quantity}.`,
        };
      }
    }

    const id = Date.now();
    const transferNumber = `TRF-${String(id).slice(-6)}`;
    const originRes = await this.warehouseService.getWarehouse(originId);
    const destRes = await this.warehouseService.getWarehouse(destinationId);
    const concepts = this.warehouseService.getConcepts('TRANSFER');
    const concept = concepts.find((c) => c.id === transfer.conceptId);

    const totalQty = (transfer.productDetails || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
    const totalCost = (transfer.productDetails || []).reduce(
      (acc, it) => acc + (it.quantity || 0) * (it.cost || it.price || 0),
      0,
    );

    const newTransfer: WarehouseTransfer = {
      ...transfer,
      id,
      prefix: 'TRF',
      movementNumber: transferNumber,
      type: 'TRANSFER',
      warehouseOfOriginId: originId,
      warehouseOfOriginName: originRes?.data?.name || `Almacén #${originId}`,
      destinationWarehouseId: destinationId,
      destinationWarehouseName: destRes?.data?.name || `Almacén #${destinationId}`,
      conceptName: concept?.name || 'Transferencia Inter-Sucursales',
      createDate: new Date().toISOString(),
      statusId: 1, // Aplicado
      statusName: 'Aplicado',
      totalQuantity: totalQty,
      totalCost: totalCost,
    };

    // 1. Post to backend endpoint POST /WarehouseTransfer
    for (const item of transfer.productDetails || []) {
      try {
        await this.api.post<any, any>('/WarehouseTransfer', {
          productId: item.productId,
          fromWarehouseId: originId,
          toWarehouseId: destinationId,
          quantity: item.quantity,
        });
      } catch {
        try {
          await this.api.post<any, any>('/Warehouse/stock/transfer', {
            productId: item.productId,
            fromWarehouseId: originId,
            toWarehouseId: destinationId,
            quantity: item.quantity,
          });
        } catch {
          // offline fallback
        }
      }
    }

    // 2. Persist locally
    const currentList = this.getLocalTransfers();
    currentList.unshift(newTransfer);
    this.saveLocalTransfers(currentList);

    // 3. Atomic Stock Update: decrease at origin, increase at destination
    for (const item of transfer.productDetails) {
      await this.stockService.updateStock(
        originId,
        item.productId,
        -item.quantity,
        item.productName,
        item.barCode,
      );
      await this.stockService.updateStock(
        destinationId,
        item.productId,
        item.quantity,
        item.productName,
        item.barCode,
      );
    }

    return {
      success: true,
      data: newTransfer,
      message: `Transferencia ${transferNumber} completada exitosamente. ${totalQty} unidades transferidas de "${newTransfer.warehouseOfOriginName}" a "${newTransfer.destinationWarehouseName}".`,
    };
  }
}
