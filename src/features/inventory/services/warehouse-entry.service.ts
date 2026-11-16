import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray, getCompanyId } from '../../cuadreEnv/services/apiClient';
import { StockService } from './stock.service';
import { WarehouseService } from './warehouse.service';
import { ProductService } from '../../products/services/product.service';
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
  private productService = inject(ProductService);

  private getEntriesKey(): string {
    const compId = getCompanyId();
    return compId ? `${ENTRIES_STORAGE_KEY}_${compId}` : ENTRIES_STORAGE_KEY;
  }

  private getLocalEntries(): WarehouseEntry[] {
    try {
      const raw = localStorage.getItem(this.getEntriesKey()) || localStorage.getItem(ENTRIES_STORAGE_KEY);
      const list: WarehouseEntry[] = raw ? JSON.parse(raw) : [];
      return list.filter((item) => (item.totalQuantity || 0) > 0 || (item.productDetails && item.productDetails.length > 0));
    } catch {
      return [];
    }
  }

  private saveLocalEntries(list: WarehouseEntry[]): void {
    try {
      localStorage.setItem(this.getEntriesKey(), JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local warehouse entries:', e);
    }
  }

  private clearStaleLocalEntries(): void {
    try {
      const list = this.getLocalEntries();
      const pending = list.filter((e: any) => e.isPendingSync === true);
      this.saveLocalEntries(pending);
      if (localStorage.getItem(ENTRIES_STORAGE_KEY) && this.getEntriesKey() !== ENTRIES_STORAGE_KEY) {
        localStorage.removeItem(ENTRIES_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  async getEntries(): Promise<ApiResponse<WarehouseEntry[]>> {
    let apiList: WarehouseEntry[] = [];
    let isApiConnected = false;

    try {
      const res = await this.api.get<any, any>('/WarehouseEntry');
      const list = extractArray<WarehouseEntry>(res);
      if (list && list.length > 0) {
        apiList = list.map((item) => normalizeWarehouseMovement<WarehouseEntry>(item));
      }
      isApiConnected = true;
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/inventory/movements', { params: { type: 'Inbound' } });
        const list2 = extractArray<any>(res2);
        if (list2 && list2.length > 0) {
          apiList = list2.map((item) => normalizeWarehouseMovement<WarehouseEntry>({ ...item, type: 'ENTRY' }));
        }
        isApiConnected = true;
      } catch {
        // Backend offline
      }
    }

    // Filter out invalid/empty movements (such as deleted rows with 0 quantity and 0 products)
    const validApiList = apiList.filter((item) => {
      const hasProducts = item.productDetails && item.productDetails.length > 0 && item.productDetails[0].productId > 0;
      const hasQty = (item.totalQuantity || 0) > 0;
      const isNotDeleted = !(item as any).isDeleted && (item as any).active !== false;
      return (hasProducts || hasQty) && isNotDeleted;
    });

    if (isApiConnected) {
      // Backend is online and authoritative.
      // Purge any stale non-pending local entries to eliminate past duplicates
      this.clearStaleLocalEntries();

      // Only append pending offline entries that failed to reach the server
      const pendingOffline = this.getLocalEntries()
        .filter((e: any) => e.isPendingSync === true)
        .map((e) => normalizeWarehouseMovement<WarehouseEntry>(e));

      const combined = [...validApiList, ...pendingOffline].sort(
        (a, b) => new Date(b.createDate || 0).getTime() - new Date(a.createDate || 0).getTime()
      );
      return { success: true, data: combined };
    }

    // Offline fallback: load strictly from local storage
    const localList = this.getLocalEntries().map((e) => normalizeWarehouseMovement<WarehouseEntry>(e));
    return { success: true, data: localList };
  }

  async getEntry(id: number): Promise<ApiResponse<WarehouseEntry>> {
    try {
      const res = await this.api.get<any, any>(`/WarehouseEntry/${id}`);
      if (res) {
        const entry = normalizeWarehouseMovement<WarehouseEntry>(res.data ?? res);
        return { success: true, data: entry };
      }
    } catch {
      // fallback
    }

    try {
      const listRes = await this.getEntries();
      const match = listRes.data?.find((e) => e.id === id);
      if (match) return { success: true, data: match };
    } catch {
      // ignore
    }

    const list = this.getLocalEntries();
    const found = list.find((e) => e.id === id);
    if (found) return { success: true, data: normalizeWarehouseMovement<WarehouseEntry>(found) };
    return { success: false, message: 'Entrada de almacén no encontrada.' };
  }

  async createEntry(entry: WarehouseMovementHeader): Promise<ApiResponse<WarehouseEntry>> {
    const id = Date.now();
    const entryNumber = `ENT-${String(id).slice(-6)}`;

    // 1. Resolver y validar almacén destino contra lista autoritativa
    let targetWhId = entry.warehouseId;
    let whName = `Almacén #${targetWhId}`;
    try {
      const whRes = await this.warehouseService.getWarehouses();
      const validWhs = whRes?.data || [];
      const foundWh = validWhs.find((w) => w.id === targetWhId);
      if (foundWh) {
        whName = foundWh.name;
      } else if (validWhs.length > 0) {
        const fallbackWh = validWhs.find((w) => w.isMain) || validWhs[0];
        targetWhId = fallbackWh.id;
        whName = fallbackWh.name;
      }
    } catch {
      // Ignorar
    }
    targetWhId = targetWhId || 1;

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
      warehouseId: targetWhId,
      movementNumber: entryNumber,
      type: 'ENTRY',
      warehouseName: whName,
      conceptName: concept?.name || 'Entrada de Almacén',
      createDate: new Date().toISOString(),
      statusId: 1, // Aplicado
      statusName: 'Aplicado',
      totalQuantity: totalQty,
      totalCost: totalCost,
    };

    // 2. Persistir líneas en el backend usando endpoints oficiales
    let backendSuccess = false;
    let createdBackendId: number | undefined;

    for (const item of entry.productDetails || []) {
      const payload = {
        productId: item.productId,
        warehouseId: targetWhId,
        quantity: item.quantity,
        isPackage: false,
        packageFactor: 1,
      };

      try {
        const res = await this.api.post<any, any>('/warehouse/stock/add', payload);
        backendSuccess = true;
        const resData = res?.data ?? res;
        if (resData?.id && !createdBackendId) createdBackendId = Number(resData.id);
      } catch {
        try {
          const res = await this.api.post<any, any>('/Warehouse/stock/add', payload);
          backendSuccess = true;
          const resData = res?.data ?? res;
          if (resData?.id && !createdBackendId) createdBackendId = Number(resData.id);
        } catch {
          try {
            const res = await this.api.post<any, any>('/inventory/inbound', payload);
            backendSuccess = true;
            const resData = res?.data ?? res;
            if (resData?.id && !createdBackendId) createdBackendId = Number(resData.id);
          } catch {
            try {
              const res = await this.api.post<any, any>('/inventory/movements', {
                ...payload,
                type: 'Entrada',
              });
              backendSuccess = true;
            } catch (err: any) {
              console.warn('[WarehouseEntry] Error al persistir en backend:', err);
            }
          }
        }
      }
    }

    if (createdBackendId) {
      newEntry.id = createdBackendId;
      newEntry.movementNumber = `ENT-${String(createdBackendId).padStart(6, '0')}`;
    }

    // 3. Persistir en almacenamiento local SOLO si el backend no pudo ser alcanzado (modo offline)
    if (!backendSuccess) {
      (newEntry as any).isPendingSync = true;
      const currentList = this.getLocalEntries();
      currentList.unshift(newEntry);
      this.saveLocalEntries(currentList);
    }

    // 4. Aumentar stock de forma atómica en el inventario local por almacén
    for (const item of entry.productDetails || []) {
      await this.stockService.updateStock(
        targetWhId,
        item.productId,
        item.quantity,
        item.productName,
        item.barCode,
      );
    }

    // 5. Limpiar caché de productos e informar actualización de stock global
    this.productService.clearCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cuadre_stock_changed', {
          detail: { warehouseId: targetWhId, entries: entry.productDetails },
        })
      );
    }

    return {
      success: true,
      data: newEntry,
      message: `Entrada ${newEntry.movementNumber} registrada exitosamente. ${totalQty} unidades ingresadas a inventario.`,
    };
  }
}
