import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray, getCompanyId } from '../../cuadreEnv/services/apiClient';
import { StockService } from './stock.service';
import { WarehouseService } from './warehouse.service';
import { ProductService } from '../../products/services/product.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { WarehouseOutlet, WarehouseMovementHeader } from '../../../app/models/movement';
import { normalizeWarehouseMovement, groupWarehouseMovements } from '../utils/movement-normalizer';

const OUTLETS_STORAGE_KEY = 'cuadreenv_warehouse_outlets_db';

@Injectable({
  providedIn: 'root',
})
export class WarehouseOutletService {
  private api = inject(ApiClientService);
  private stockService = inject(StockService);
  private warehouseService = inject(WarehouseService);
  private productService = inject(ProductService);

  private getOutletsKey(): string {
    const compId = getCompanyId();
    return compId ? `${OUTLETS_STORAGE_KEY}_${compId}` : OUTLETS_STORAGE_KEY;
  }

  private getLocalOutlets(): WarehouseOutlet[] {
    try {
      const raw = localStorage.getItem(this.getOutletsKey()) || localStorage.getItem(OUTLETS_STORAGE_KEY);
      const list: WarehouseOutlet[] = raw ? JSON.parse(raw) : [];
      return list.filter((item) => (item.totalQuantity || 0) > 0 || (item.productDetails && item.productDetails.length > 0));
    } catch {
      return [];
    }
  }

  private saveLocalOutlets(list: WarehouseOutlet[]): void {
    try {
      localStorage.setItem(this.getOutletsKey(), JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local warehouse outlets:', e);
    }
  }

  private clearStaleLocalOutlets(): void {
    try {
      const list = this.getLocalOutlets();
      const pending = list.filter((o: any) => o.isPendingSync === true);
      this.saveLocalOutlets(pending);
      if (localStorage.getItem(OUTLETS_STORAGE_KEY) && this.getOutletsKey() !== OUTLETS_STORAGE_KEY) {
        localStorage.removeItem(OUTLETS_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  async getOutlets(): Promise<ApiResponse<WarehouseOutlet[]>> {
    let apiList: WarehouseOutlet[] = [];
    let isApiConnected = false;

    try {
      const res = await this.api.get<any, any>('/WarehouseOutlet', {
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      const list = extractArray<WarehouseOutlet>(res);
      if (list && list.length > 0) {
        apiList = list.map((item) => normalizeWarehouseMovement<WarehouseOutlet>(item));
      }
      isApiConnected = true;
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/inventory/movements', {
          params: { type: 'Outbound' },
          headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
        });
        const list2 = extractArray<any>(res2);
        if (list2 && list2.length > 0) {
          apiList = list2.map((item) => normalizeWarehouseMovement<WarehouseOutlet>({ ...item, type: 'OUTLET' }));
        }
        isApiConnected = true;
      } catch {
        // Backend offline
      }
    }

    // Filter out invalid/empty movements
    const validApiList = apiList.filter((item) => {
      const hasProducts = item.productDetails && item.productDetails.length > 0 && item.productDetails[0].productId > 0;
      const hasQty = (item.totalQuantity || 0) > 0;
      const isNotDeleted = !(item as any).isDeleted && (item as any).active !== false;
      return (hasProducts || hasQty) && isNotDeleted;
    });

    if (isApiConnected) {
      const localList = this.getLocalOutlets().map((o) => normalizeWarehouseMovement<WarehouseOutlet>(o));
      const localMap = new Map<string, WarehouseOutlet>();
      for (const loc of localList) {
        if (loc.id) localMap.set(String(loc.id), loc);
        if (loc.movementNumber) localMap.set(loc.movementNumber.trim().toUpperCase(), loc);
      }

      // Enrich remote outlets with richer local productDetails if present
      const enrichedApiList = validApiList.map((remote) => {
        const idKey = remote.id ? String(remote.id) : '';
        const numKey = (remote.movementNumber || '').trim().toUpperCase();
        const localMatch = (idKey && localMap.get(idKey)) || (numKey && localMap.get(numKey));

        if (localMatch && (localMatch.productDetails?.length || 0) > (remote.productDetails?.length || 0)) {
          return {
            ...remote,
            productDetails: localMatch.productDetails,
            totalQuantity: localMatch.totalQuantity || remote.totalQuantity,
            totalCost: localMatch.totalCost || remote.totalCost,
          };
        }
        return remote;
      });

      // Deduplicación estricta por id y número de movimiento
      const seenIds = new Set<number>();
      const seenNumbers = new Set<string>();
      const combined: WarehouseOutlet[] = [];

      for (const outlet of [...enrichedApiList, ...localList.filter((o: any) => o.isPendingSync === true)]) {
        const idKey = outlet.id;
        const numKey = (outlet.movementNumber || '').trim().toUpperCase();

        if (idKey && seenIds.has(idKey)) continue;
        if (numKey && seenNumbers.has(numKey)) continue;

        if (idKey) seenIds.add(idKey);
        if (numKey) seenNumbers.add(numKey);
        combined.push(outlet);
      }

      const grouped = groupWarehouseMovements(combined);
      grouped.sort(
        (a, b) => new Date(b.createDate || 0).getTime() - new Date(a.createDate || 0).getTime()
      );
      return { success: true, data: grouped };
    }

    const localList = this.getLocalOutlets().map((o) => normalizeWarehouseMovement<WarehouseOutlet>(o));
    const groupedLocal = groupWarehouseMovements(localList);
    return { success: true, data: groupedLocal };
  }

  async getOutlet(id: number): Promise<ApiResponse<WarehouseOutlet>> {
    try {
      const res = await this.api.get<any, any>(`/WarehouseOutlet/${id}`, {
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      if (res) {
        const outlet = normalizeWarehouseMovement<WarehouseOutlet>(res.data ?? res);
        return { success: true, data: outlet };
      }
    } catch {
      // fallback
    }

    try {
      const listRes = await this.getOutlets();
      const match = listRes.data?.find((o) => o.id === id);
      if (match) return { success: true, data: match };
    } catch {
      // ignore
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

    // 1. Post to backend endpoint POST /WarehouseOutlet (intenta encabezado completo primero)
    let createdBackendId: number | undefined;

    try {
      const headerPayload: any = {
        warehouseId: whId,
        conceptId: Number(outlet.conceptId),
        commentary: outlet.commentary || '',
        quantity: totalQty,
        totalQuantity: totalQty,
        qty: totalQty,
        cost: totalCost,
        totalCost: totalCost,
        unitCost: totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : 0,
        price: totalCost,
        movementNumber: newOutlet.movementNumber,
        reference: newOutlet.movementNumber,
        productId: outlet.productDetails?.[0]?.productId || 0,
        productDetails: (outlet.productDetails || []).map((it) => ({
          productId: it.productId,
          productName: it.productName,
          barCode: it.barCode,
          quantity: it.quantity,
          qty: it.quantity,
          cost: it.cost || 0,
          unitCost: it.cost || 0,
          price: it.price || it.cost || 0,
          warehouseId: whId,
        })),
        details: (outlet.productDetails || []).map((it) => ({
          productId: it.productId,
          productName: it.productName,
          barCode: it.barCode,
          quantity: it.quantity,
          qty: it.quantity,
          cost: it.cost || 0,
          unitCost: it.cost || 0,
          price: it.price || it.cost || 0,
          warehouseId: whId,
        })),
      };
      const res = await this.api.post<any, any>('/WarehouseOutlet', headerPayload);
      const resData = res?.data ?? res;
      if (resData?.id) createdBackendId = Number(resData.id);
    } catch {
      // Fallback a envío por renglón garantizando costo y referencia
      for (const item of outlet.productDetails || []) {
        try {
          const res = await this.api.post<any, any>('/WarehouseOutlet', {
            productId: item.productId,
            warehouseId: whId,
            quantity: item.quantity,
            cost: item.cost || 0,
            unitCost: item.cost || 0,
            price: item.price || item.cost || 0,
            movementNumber: newOutlet.movementNumber,
            reference: newOutlet.movementNumber,
          });
          const resData = res?.data ?? res;
          if (resData?.id && !createdBackendId) createdBackendId = Number(resData.id);
        } catch (err: any) {
          console.error('[WarehouseOutlet] Error al persistir en backend:', err);
          const errMsg = err?.mappedError?.message || err?.message || 'Error al guardar la salida en el servidor.';
          return { success: false, message: errMsg };
        }
      }
    }

    if (createdBackendId) {
      newOutlet.id = createdBackendId;
      newOutlet.movementNumber = `SAL-${String(createdBackendId).padStart(6, '0')}`;
    } else {
      (newOutlet as any).isPendingSync = true;
    }

    // Persist in local storage for instant availability and deduplication
    const currentOutlets = this.getLocalOutlets();
    if (!currentOutlets.some(o => o.id === newOutlet.id || (o.movementNumber && o.movementNumber === newOutlet.movementNumber))) {
      currentOutlets.unshift(newOutlet);
      this.saveLocalOutlets(currentOutlets);
    }

    // 2. Atomically decrease stock in origin warehouse local cache
    for (const item of outlet.productDetails) {
      await this.stockService.updateStock(
        whId,
        item.productId,
        -item.quantity,
        item.productName,
        item.barCode,
      );
    }

    // 3. Clear cache and notify
    this.productService.clearCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cuadre_stock_changed', {
          detail: { warehouseId: whId, outlets: outlet.productDetails },
        })
      );
    }

    return {
      success: true,
      data: newOutlet,
      message: `Salida ${newOutlet.movementNumber} procesada exitosamente. ${totalQty} unidades descontadas del inventario.`,
    };
  }
}
