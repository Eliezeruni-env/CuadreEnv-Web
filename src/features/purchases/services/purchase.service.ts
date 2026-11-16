import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray, getCompanyId } from '../../cuadreEnv/services/apiClient';
import type { PurchaseDto, ApiResponse } from '../../cuadreEnv/types/api';

export interface PagedPurchaseResult {
  data: PurchaseDto[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

const PURCHASES_STORAGE_KEY_BASE = 'cuadreenv_purchases_db';
const PURCHASE_ORDERS_STORAGE_KEY_BASE = 'cuadreenv_purchase_orders_db';

function getPurchasesStorageKey(): string {
  const compId = getCompanyId();
  if (!compId) return `${PURCHASES_STORAGE_KEY_BASE}_none`;
  return `${PURCHASES_STORAGE_KEY_BASE}_${compId}`;
}

function getPurchaseOrdersStorageKey(): string {
  const compId = getCompanyId();
  if (!compId) return `${PURCHASE_ORDERS_STORAGE_KEY_BASE}_none`;
  return `${PURCHASE_ORDERS_STORAGE_KEY_BASE}_${compId}`;
}

@Injectable({
  providedIn: 'root',
})
export class PurchaseService {
  private api: ApiClientService;

  constructor(api?: ApiClientService) {
    this.api = api ?? inject(ApiClientService, { optional: true })!;
  }

  getLocalPurchases(): PurchaseDto[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = localStorage.getItem(getPurchasesStorageKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveLocalPurchases(list: PurchaseDto[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(getPurchasesStorageKey(), JSON.stringify(list));
    } catch (e) {
      console.warn('Error saving local purchases:', e);
    }
  }

  purgeLocalPurchases(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.removeItem(getPurchasesStorageKey());
      localStorage.removeItem(getPurchaseOrdersStorageKey());
    } catch {}
  }

  private syncToPurchaseOrders(purchase: PurchaseDto): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const p = purchase as any;
      const rawOrders = localStorage.getItem(getPurchaseOrdersStorageKey());
      const orders: any[] = rawOrders ? JSON.parse(rawOrders) : [];
      const poNum = `OC-${String(purchase.id || Date.now()).slice(-6)}`;
      
      const newOrder = {
        id: purchase.id || Date.now(),
        orderNumber: poNum,
        supplierName: p.supplier?.name || p.supplierName || 'Proveedor',
        supplierRnc: p.supplier?.rnc || 'RNC-001',
        issueDate: purchase.creationDate || new Date().toISOString(),
        deliveryDate: new Date(Date.now() + 86400000 * 3).toISOString(),
        paymentTerms: p.paymentTerms || 'Contado',
        status: 'RECEIVED',
        total: purchase.total || 0,
        subtotal: p.subtotal || purchase.total || 0,
        itbis: p.tax || p.itbis || 0,
        itemsCount: (purchase.details || []).reduce((acc: number, d: any) => acc + (d.quantity || 1), 0),
        notes: p.notes || 'Generada desde Registro de Compra',
        receptionStatus: 'Completada',
        items: (purchase.details || []).map((d: any, idx: number) => ({
          id: idx + 1,
          productId: d.productId,
          productName: d.product?.name || d.productName || `Producto #${d.productId}`,
          productCode: d.product?.code || d.productCode || `#${d.productId}`,
          quantity: d.quantity,
          receivedQuantity: d.quantity,
          unitCost: d.cost ?? d.costPrice ?? 0,
          total: (d.quantity || 1) * (d.cost ?? d.costPrice ?? 0),
        })),
      };

      const existingIdx = orders.findIndex((o) => o.id === newOrder.id || o.orderNumber === newOrder.orderNumber);
      if (existingIdx >= 0) {
        orders[existingIdx] = newOrder;
      } else {
        orders.unshift(newOrder);
      }
      localStorage.setItem(getPurchaseOrdersStorageKey(), JSON.stringify(orders));
    } catch (e) {
      console.warn('Could not sync purchase to purchase orders:', e);
    }
  }

  async getPurchases(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PurchaseDto[]> & { totalCount?: number; pageNumber?: number; pageSize?: number; totalPages?: number }> {
    const pageNumber = Math.max(1, params?.pageNumber || 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize || 25));

    try {
      const res = await this.api.get<any, any>('/Purchase', {
        params: { pageNumber, pageSize },
      });
      const apiList = extractArray<PurchaseDto>(res);
      const totalCount = Number(res?.totalCount || res?.total || res?.count || apiList.length);
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      return {
        success: true,
        data: apiList || [],
        totalCount,
        pageNumber,
        pageSize,
        totalPages,
      };
    } catch {
      const local = this.getLocalPurchases();
      const totalCount = local.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const paged = local.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
      return {
        success: true,
        data: paged,
        totalCount,
        pageNumber,
        pageSize,
        totalPages,
      };
    }
  }

  async getPurchase(id: number): Promise<ApiResponse<PurchaseDto>> {
    try {
      const res = await this.api.get<any, any>(`/Purchase/${id}`);
      if (res) {
        return { success: true, data: (res.data ?? res) as PurchaseDto };
      }
    } catch {
      // offline
    }
    return { success: false, message: 'Compra no encontrada en el servidor.' };
  }

  async createPurchase(
    purchase: PurchaseDto,
  ): Promise<ApiResponse<PurchaseDto>> {
    const activeCompId = getCompanyId();
    if (!activeCompId || Number(activeCompId) <= 0) {
      return {
        success: false,
        message: 'COMPANY_CONTEXT_REQUIRED: Se requiere una compañía activa para registrar compras.',
      };
    }

    try {
      const payload: any = {
        ...purchase,
        companyId: Number(activeCompId),
        details: (purchase.details || []).map((d: any) => ({
          ...d,
          cost: d.cost ?? d.costPrice ?? 0,
          costPrice: d.costPrice ?? d.cost ?? 0,
        })),
      };
      const res = await this.api.post<any, any>('/Purchase', payload);
      const created = res?.data ?? res;
      const assignedId = created?.id || purchase.id || Date.now();
      const fullPurchase: PurchaseDto = {
        ...purchase,
        id: assignedId,
        creationDate: created?.creationDate || new Date().toISOString(),
        details: (purchase.details || []).map((d: any) => ({
          ...d,
          cost: d.cost ?? d.costPrice ?? 0,
          costPrice: d.costPrice ?? d.cost ?? 0,
        })),
      };

      // Save locally
      const current = this.getLocalPurchases();
      current.unshift(fullPurchase);
      this.saveLocalPurchases(current);

      // Sync to purchase orders so it immediately appears in goods receipt (Recepciones)
      this.syncToPurchaseOrders(fullPurchase);

      return { success: true, data: fullPurchase, message: 'Compra registrada exitosamente.' };
    } catch (err: any) {
      console.error('[PurchaseService] Error al crear compra en backend:', err);
      const errMsg = err?.mappedError?.message || err?.message || 'Error del servidor al registrar la compra.';
      return { success: false, message: errMsg };
    }
  }

  async updatePurchase(purchase: PurchaseDto): Promise<void> {
    const activeCompId = getCompanyId();
    const payload = {
      ...purchase,
      ...(activeCompId ? { companyId: Number(activeCompId) } : {}),
    };
    try {
      await this.api.put('/Purchase', payload);
    } catch {
      // offline fallback
    }
    if (purchase.id) {
      const current = this.getLocalPurchases();
      const idx = current.findIndex((p) => p.id === purchase.id);
      if (idx !== -1) {
        current[idx] = { ...current[idx], ...purchase };
        this.saveLocalPurchases(current);
      }
    }
  }

  async deletePurchase(id: number): Promise<void> {
    try {
      await this.api.delete(`/Purchase/${id}`);
    } catch {
      // offline fallback
    }
    const current = this.getLocalPurchases().filter((p) => p.id !== id);
    this.saveLocalPurchases(current);
  }
}
