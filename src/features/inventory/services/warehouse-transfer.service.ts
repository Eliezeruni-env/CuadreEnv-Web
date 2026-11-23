import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray, getCompanyId } from '../../cuadreEnv/services/apiClient';
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

  private getTransfersKey(): string {
    const compId = getCompanyId();
    return compId ? `${TRANSFERS_STORAGE_KEY}_${compId}` : TRANSFERS_STORAGE_KEY;
  }

  private getLocalTransfers(): WarehouseTransfer[] {
    try {
      const raw = localStorage.getItem(this.getTransfersKey()) || localStorage.getItem(TRANSFERS_STORAGE_KEY);
      const list: WarehouseTransfer[] = raw ? JSON.parse(raw) : [];
      return list.filter((item) => (item.totalQuantity || 0) > 0 || (item.productDetails && item.productDetails.length > 0));
    } catch {
      return [];
    }
  }

  private saveLocalTransfers(list: WarehouseTransfer[]): void {
    try {
      localStorage.setItem(this.getTransfersKey(), JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local warehouse transfers:', e);
    }
  }

  private clearStaleLocalTransfers(): void {
    try {
      const list = this.getLocalTransfers();
      const pending = list.filter((t: any) => t.isPendingSync === true);
      this.saveLocalTransfers(pending);
      if (localStorage.getItem(TRANSFERS_STORAGE_KEY) && this.getTransfersKey() !== TRANSFERS_STORAGE_KEY) {
        localStorage.removeItem(TRANSFERS_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  async getTransfers(): Promise<ApiResponse<WarehouseTransfer[]>> {
    let apiList: WarehouseTransfer[] = [];
    let isApiConnected = false;

    try {
      const res = await this.api.get<any, any>('/WarehouseTransfer');
      const list = extractArray<WarehouseTransfer>(res);
      if (list && list.length > 0) {
        apiList = list.map((item) => normalizeWarehouseMovement<WarehouseTransfer>(item));
      }
      isApiConnected = true;
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/inventory/movements', { params: { type: 'Transfer' } });
        const list2 = extractArray<any>(res2);
        if (list2 && list2.length > 0) {
          apiList = list2.map((item) => normalizeWarehouseMovement<WarehouseTransfer>({ ...item, type: 'TRANSFER' }));
        }
        isApiConnected = true;
      } catch {
        // Backend offline
      }
    }

    const validApiList = apiList.filter((item) => {
      const hasProducts = item.productDetails && item.productDetails.length > 0 && item.productDetails[0].productId > 0;
      const hasQty = (item.totalQuantity || 0) > 0;
      const isNotDeleted = !(item as any).isDeleted && (item as any).active !== false;
      return (hasProducts || hasQty) && isNotDeleted;
    });

    if (isApiConnected) {
      // Backend is online and authoritative.
      // Purge any stale non-pending local entries to eliminate past duplicates
      this.clearStaleLocalTransfers();

      // Only append pending offline entries that failed to reach the server
      const pendingOffline = this.getLocalTransfers()
        .filter((t: any) => t.isPendingSync === true)
        .map((t) => normalizeWarehouseMovement<WarehouseTransfer>(t));

      // Deduplicación estricta por id y número de movimiento
      const seenIds = new Set<number>();
      const seenNumbers = new Set<string>();
      const combined: WarehouseTransfer[] = [];

      for (const transfer of [...validApiList, ...pendingOffline]) {
        const idKey = transfer.id;
        const numKey = (transfer.movementNumber || '').trim().toUpperCase();

        if (idKey && seenIds.has(idKey)) continue;
        if (numKey && seenNumbers.has(numKey)) continue;

        if (idKey) seenIds.add(idKey);
        if (numKey) seenNumbers.add(numKey);
        combined.push(transfer);
      }

      combined.sort(
        (a, b) => new Date(b.createDate || 0).getTime() - new Date(a.createDate || 0).getTime()
      );
      return { success: true, data: combined };
    }

    const localList = this.getLocalTransfers().map((t) => normalizeWarehouseMovement<WarehouseTransfer>(t));
    return { success: true, data: localList };
  }

  async getTransfer(id: number): Promise<ApiResponse<WarehouseTransfer>> {
    try {
      const res = await this.api.get<any, any>(`/WarehouseTransfer/${id}`);
      if (res) {
        const transfer = normalizeWarehouseMovement<WarehouseTransfer>(res.data ?? res);
        return { success: true, data: transfer };
      }
    } catch {
      // fallback
    }

    try {
      const listRes = await this.getTransfers();
      const match = listRes.data?.find((t) => t.id === id);
      if (match) return { success: true, data: match };
    } catch {
      // ignore
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

    // 1. Post to backend endpoint POST /WarehouseTransfer (intenta encabezado completo primero)
    let createdBackendId: number | undefined;

    try {
      const headerPayload = {
        warehouseOfOriginId: originId,
        destinationWarehouseId: destinationId,
        conceptId: transfer.conceptId,
        commentary: transfer.commentary || '',
        totalQuantity: totalQty,
        totalCost: totalCost,
        productDetails: transfer.productDetails,
      };
      const res = await this.api.post<any, any>('/WarehouseTransfer', headerPayload);
      const resData = res?.data ?? res;
      if (resData?.id) createdBackendId = Number(resData.id);
    } catch {
      // Fallback a envío por renglón
      for (const item of transfer.productDetails || []) {
        try {
          const res = await this.api.post<any, any>('/WarehouseTransfer', {
            productId: item.productId,
            fromWarehouseId: originId,
            toWarehouseId: destinationId,
            quantity: item.quantity,
          });
          const resData = res?.data ?? res;
          if (resData?.id && !createdBackendId) createdBackendId = Number(resData.id);
        } catch (err: any) {
          console.error('[WarehouseTransfer] Error al persistir en backend:', err);
          const errMsg = err?.mappedError?.message || err?.message || 'Error al guardar la transferencia en el servidor.';
          return { success: false, message: errMsg };
        }
      }
    }

    if (createdBackendId) {
      newTransfer.id = createdBackendId;
      newTransfer.movementNumber = `TRF-${String(createdBackendId).padStart(6, '0')}`;
    }

    // 2. Atomic Stock Update in local cache: decrease at origin, increase at destination
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

    // 3. Clear product cache and dispatch event
    this.productService.clearCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cuadre_stock_changed', {
          detail: { fromWarehouseId: originId, toWarehouseId: destinationId, transfers: transfer.productDetails },
        })
      );
    }

    return {
      success: true,
      data: newTransfer,
      message: `Transferencia ${newTransfer.movementNumber} completada exitosamente. ${totalQty} unidades transferidas de "${newTransfer.warehouseOfOriginName}" a "${newTransfer.destinationWarehouseName}".`,
    };
  }
}
