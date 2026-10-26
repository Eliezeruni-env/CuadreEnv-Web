import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { StockService } from './stock.service';
import { WarehouseService } from './warehouse.service';
import { ProductService } from '../../products/services/product.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { WarehouseOutlet, WarehouseMovementHeader } from '../../../app/models/movement';
import { normalizeWarehouseMovement } from '../utils/movement-normalizer';

const OUTLETS_STORAGE_KEY = 'cuadreenv_warehouse_outlets_db';

@Injectable({
  providedIn: 'root',
})
export class WarehouseOutletService {
  private api = inject(ApiClientService);
  private stockService = inject(StockService);
  private warehouseService = inject(WarehouseService);
  private productService = inject(ProductService);

  private getLocalOutlets(): WarehouseOutlet[] {
    try {
      const raw = localStorage.getItem(OUTLETS_STORAGE_KEY);
      const list: WarehouseOutlet[] = raw ? JSON.parse(raw) : [];
      return list.filter((item) => (item.totalQuantity || 0) > 0 || (item.productDetails && item.productDetails.length > 0));
    } catch {
      return [];
    }
  }

  private saveLocalOutlets(list: WarehouseOutlet[]): void {
    try {
      localStorage.setItem(OUTLETS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local warehouse outlets:', e);
    }
  }

  async getOutlets(): Promise<ApiResponse<WarehouseOutlet[]>> {
    let apiList: WarehouseOutlet[] = [];
    try {
      const res = await this.api.get<any, any>('/WarehouseOutlet');
      const list = extractArray<WarehouseOutlet>(res);
      if (list && list.length > 0) {
        apiList = list.map((item) => normalizeWarehouseMovement<WarehouseOutlet>(item));
      }
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/inventory/movements', { params: { type: 'Outbound' } });
        const list2 = extractArray<any>(res2);
        if (list2 && list2.length > 0) {
          apiList = list2.map((item) => normalizeWarehouseMovement<WarehouseOutlet>({ ...item, type: 'OUTLET' }));
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

    const localList = this.getLocalOutlets().map((o) => normalizeWarehouseMovement<WarehouseOutlet>(o));
    const map = new Map<string, WarehouseOutlet>();

    // 1. Register local movements first (they have full rich line item details)
    for (const loc of localList) {
      if (loc.id !== undefined) map.set(String(loc.id), loc);
    }

    // 2. Merge backend movements, preserving line item details from local if available
    for (const o of validApiList) {
      if (o.id !== undefined) {
        const key = String(o.id);
        const existing = map.get(key);
        if (existing && existing.productDetails && existing.productDetails.length > 0) {
          map.set(key, { ...o, ...existing, id: o.id });
        } else {
          map.set(key, o);
        }
      }
    }

    const combined = Array.from(map.values()).sort(
      (a, b) => new Date(b.createDate || 0).getTime() - new Date(a.createDate || 0).getTime()
    );
    return { success: true, data: combined };
  }

  async getOutlet(id: number): Promise<ApiResponse<WarehouseOutlet>> {
    try {
      const res = await this.api.get<any, any>(`/WarehouseOutlet/${id}`);
      if (res) {
        const outlet = normalizeWarehouseMovement<WarehouseOutlet>(res.data ?? res);
        return { success: true, data: outlet };
      }
    } catch {
      // fallback to local
    }
    const list = this.getLocalOutlets();
    const found = list.find((o) => o.id === id);
    if (found) return { success: true, data: normalizeWarehouseMovement<WarehouseOutlet>(found) };
    return { success: false, message: 'Salida de almacén no encontrada.' };
  }

  async createOutlet(outlet: WarehouseMovementHeader): Promise<ApiResponse<WarehouseOutlet>> {
    const whId = outlet.warehouseId || 1;

    // Strict validation: check stock availability for each item
    for (const item of outlet.productDetails || []) {
      const pRes = await this.productService.getProduct(item.productId);
      const allowWithoutStock = pRes?.data?.invoiceWithoutStock ?? false;
      const currentStock = await this.stockService.getProductStockInWarehouse(whId, item.productId);

      if (!allowWithoutStock && item.quantity > currentStock) {
        return {
          success: false,
          message: `Stock insuficiente para "${item.productName}" en el almacén seleccionado. Disponible: ${currentStock}, Solicitado: ${item.quantity}.`,
        };
      }
    }

    const id = Date.now();
    const outletNumber = `SAL-${String(id).slice(-6)}`;
    const whRes = await this.warehouseService.getWarehouse(whId);
    const concepts = this.warehouseService.getConcepts('OUTLET');
    const concept = concepts.find((c) => c.id === outlet.conceptId);

    const totalQty = (outlet.productDetails || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
    const totalCost = (outlet.productDetails || []).reduce(
      (acc, it) => acc + (it.quantity || 0) * (it.cost || it.price || 0),
      0,
    );

    const newOutlet: WarehouseOutlet = {
      ...outlet,
      id,
      prefix: 'SAL',
      movementNumber: outletNumber,
      type: 'OUTLET',
      warehouseName: whRes?.data?.name || `Almacén #${whId}`,
      conceptName: concept?.name || 'Salida de Almacén',
      createDate: new Date().toISOString(),
      statusId: 1, // Aplicado
      statusName: 'Aplicado',
      totalQuantity: totalQty,
      totalCost: totalCost,
    };

    // 1. Post to backend endpoint POST /WarehouseOutlet
    for (const item of outlet.productDetails || []) {
      try {
        await this.api.post<any, any>('/WarehouseOutlet', {
          productId: item.productId,
          warehouseId: whId,
          quantity: item.quantity,
        });
      } catch {
        try {
          await this.api.post<any, any>('/Warehouse/stock/remove', {
            productId: item.productId,
            warehouseId: whId,
            quantity: item.quantity,
          });
        } catch {
          // offline fallback
        }
      }
    }

    // 2. Persist locally
    const currentList = this.getLocalOutlets();
    currentList.unshift(newOutlet);
    this.saveLocalOutlets(currentList);

    // 3. Atomically decrease stock in origin warehouse
    for (const item of outlet.productDetails) {
      await this.stockService.updateStock(
        whId,
        item.productId,
        -item.quantity,
        item.productName,
        item.barCode,
      );
    }

    return {
      success: true,
      data: newOutlet,
      message: `Salida ${outletNumber} procesada exitosamente. ${totalQty} unidades descontadas del inventario.`,
    };
  }
}
