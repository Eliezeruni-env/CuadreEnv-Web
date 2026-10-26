import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { StockService } from './stock.service';
import { WarehouseService } from './warehouse.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { WarehouseEntry, WarehouseMovementHeader } from '../../../app/models/movement';
import { normalizeWarehouseMovement } from '../utils/movement-normalizer';

const ENTRIES_STORAGE_KEY = 'cuadreenv_warehouse_entries_db';

@Injectable({
  providedIn: 'root',
})
export class WarehouseEntryService {
  private api = inject(ApiClientService);
  private stockService = inject(StockService);
  private warehouseService = inject(WarehouseService);

  private getLocalEntries(): WarehouseEntry[] {
    try {
      const raw = localStorage.getItem(ENTRIES_STORAGE_KEY);
      const list: WarehouseEntry[] = raw ? JSON.parse(raw) : [];
      return list.filter((item) => (item.totalQuantity || 0) > 0 || (item.productDetails && item.productDetails.length > 0));
    } catch {
      return [];
    }
  }

  private saveLocalEntries(list: WarehouseEntry[]): void {
    try {
      localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local warehouse entries:', e);
    }
  }

  async getEntries(): Promise<ApiResponse<WarehouseEntry[]>> {
    let apiList: WarehouseEntry[] = [];
    try {
      const res = await this.api.get<any, any>('/WarehouseEntry');
      const list = extractArray<WarehouseEntry>(res);
      if (list && list.length > 0) {
        apiList = list.map((item) => normalizeWarehouseMovement<WarehouseEntry>(item));
      }
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/inventory/movements', { params: { type: 'Inbound' } });
        const list2 = extractArray<any>(res2);
        if (list2 && list2.length > 0) {
          apiList = list2.map((item) => normalizeWarehouseMovement<WarehouseEntry>({ ...item, type: 'ENTRY' }));
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

    const localList = this.getLocalEntries().map((e) => normalizeWarehouseMovement<WarehouseEntry>(e));
    const map = new Map<string, WarehouseEntry>();

    // 1. Register local movements first (they have full rich line item details)
    for (const loc of localList) {
      if (loc.id !== undefined) map.set(String(loc.id), loc);
    }

    // 2. Merge backend movements, preserving line item details from local if available
    for (const e of validApiList) {
      if (e.id !== undefined) {
        const key = String(e.id);
        const existing = map.get(key);
        if (existing && existing.productDetails && existing.productDetails.length > 0) {
          map.set(key, { ...e, ...existing, id: e.id });
        } else {
          map.set(key, e);
        }
      }
    }

    const combined = Array.from(map.values()).sort(
      (a, b) => new Date(b.createDate || 0).getTime() - new Date(a.createDate || 0).getTime()
    );
    return { success: true, data: combined };
  }

  async getEntry(id: number): Promise<ApiResponse<WarehouseEntry>> {
    try {
      const res = await this.api.get<any, any>(`/WarehouseEntry/${id}`);
      if (res) {
        const entry = normalizeWarehouseMovement<WarehouseEntry>(res.data ?? res);
        return { success: true, data: entry };
      }
    } catch {
      // fallback to local
    }
    const list = this.getLocalEntries();
    const found = list.find((e) => e.id === id);
    if (found) return { success: true, data: normalizeWarehouseMovement<WarehouseEntry>(found) };
    return { success: false, message: 'Entrada de almacén no encontrada.' };
  }

  async createEntry(entry: WarehouseMovementHeader): Promise<ApiResponse<WarehouseEntry>> {
    const id = Date.now();
    const entryNumber = `ENT-${String(id).slice(-6)}`;
    const whRes = await this.warehouseService.getWarehouse(entry.warehouseId || 1);
    const concepts = this.warehouseService.getConcepts('ENTRY');
    const concept = concepts.find((c) => c.id === entry.conceptId);

    const totalQty = (entry.productDetails || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
    const totalCost = (entry.productDetails || []).reduce(
      (acc, it) => acc + (it.quantity || 0) * (it.cost || it.price || 0),
      0,
    );

    const newEntry: WarehouseEntry = {
      ...entry,
      id,
      prefix: 'ENT',
      movementNumber: entryNumber,
      type: 'ENTRY',
      warehouseName: whRes?.data?.name || `Almacén #${entry.warehouseId}`,
      conceptName: concept?.name || 'Entrada de Almacén',
      createDate: new Date().toISOString(),
      statusId: 1, // Aplicado
      statusName: 'Aplicado',
      totalQuantity: totalQty,
      totalCost: totalCost,
    };

    // 1. Post each line item to backend endpoint POST /WarehouseEntry
    for (const item of entry.productDetails || []) {
      try {
        await this.api.post<any, any>('/WarehouseEntry', {
          productId: item.productId,
          warehouseId: entry.warehouseId || 1,
          quantity: item.quantity,
        });
      } catch {
        try {
          await this.api.post<any, any>('/Warehouse/stock/add', {
            productId: item.productId,
            warehouseId: entry.warehouseId || 1,
            quantity: item.quantity,
          });
        } catch {
          // offline fallback
        }
      }
    }

    // 2. Persist locally
    const currentList = this.getLocalEntries();
    currentList.unshift(newEntry);
    this.saveLocalEntries(currentList);

    // 3. Atomically increase stock in target warehouse for each line item
    for (const item of entry.productDetails) {
      await this.stockService.updateStock(
        entry.warehouseId || 1,
        item.productId,
        item.quantity,
        item.productName,
        item.barCode,
      );
    }

    return {
      success: true,
      data: newEntry,
      message: `Entrada ${entryNumber} registrada exitosamente. ${totalQty} unidades ingresadas a inventario.`,
    };
  }
}
