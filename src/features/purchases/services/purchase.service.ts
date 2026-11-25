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
      const poNum = p.orderNumber || p.invoiceNumber || `OC-${String(purchase.id || Date.now()).slice(-6)}`;

      const rawDetails: any[] = (p.details && p.details.length > 0)
        ? p.details
        : ((p.items && p.items.length > 0)
          ? p.items
          : []);

      let mappedDetails = rawDetails.map((d: any, idx: number) => ({
        id: idx + 1,
        productId: Number(d.productId || d.id || idx + 1),
        productName: d.product?.name || d.productName || d.name || d.description || `Producto #${d.productId || idx + 1}`,
        productCode: d.product?.code || d.productCode || d.code || d.barCode || `#${d.productId || idx + 1}`,
        barCode: d.barCode || d.productCode || d.code || '',
        quantity: Number(d.quantity || 1),
        quantityOrdered: Number(d.quantityOrdered || d.quantity || 1),
        quantityReceived: 0,
        unitCost: Number(d.cost ?? d.costPrice ?? d.unitCost ?? 0),
        subTotal: Number(d.subtotal ?? (Number(d.quantity || 1) * Number(d.cost ?? d.costPrice ?? d.unitCost ?? 0))),
        total: Number(d.total ?? d.subtotal ?? (Number(d.quantity || 1) * Number(d.cost ?? d.costPrice ?? d.unitCost ?? 0))),
      }));

      if (mappedDetails.length === 0) {
        const defaultCost = Number(purchase.total || p.subtotal || 100);
        mappedDetails = [
          {
            id: 1,
            productId: 1,
            productName: p.notes?.trim() || `Compra #${purchase.id || 1} - Insumos / Mercancía`,
            productCode: `PUR-${purchase.id || 1}`,
            barCode: `PUR-${purchase.id || 1}`,
            quantity: 1,
            quantityOrdered: 1,
            quantityReceived: 0,
            unitCost: defaultCost,
            subTotal: defaultCost,
            total: defaultCost,
          },
        ];
      }

      const newOrder = {
        id: purchase.id || Date.now(),
        orderNumber: poNum,
        prefix: 'OC',
        supplierId: p.supplierId || 1,
        supplierName: p.supplier?.name || p.supplierName || 'Proveedor',
        supplierRnc: p.supplier?.rnc || p.supplierRnc || 'RNC-001',
        warehouseId: p.warehouseId || 1,
        warehouseName: p.warehouseName || p.warehouse || 'Almacén Principal',
        issueDate: purchase.creationDate || new Date().toISOString(),
        orderDate: purchase.creationDate || new Date().toISOString(),
        deliveryDate: new Date(Date.now() + 86400000 * 3).toISOString(),
        expectedDeliveryDate: new Date(Date.now() + 86400000 * 3).toISOString(),
        paymentTerms: p.paymentTerms || p.paymentCondition || 'Contado',
        statusId: 1,
        statusName: 'Pendiente',
        total: purchase.total || 0,
        subtotal: p.subtotal || purchase.total || 0,
        subTotal: p.subtotal || purchase.total || 0,
        itbis: p.tax || p.itbis || 0,
        itemsCount: mappedDetails.reduce((acc: number, d: any) => acc + (d.quantity || 1), 0),
        notes: p.notes || 'Generada desde Registro de Compra',
        receptionStatus: 'Pendiente',
        items: mappedDetails,
        productDetails: mappedDetails,
      };

      const existingIdx = orders.findIndex((o) => o.id === newOrder.id || o.orderNumber === newOrder.orderNumber);
      if (existingIdx >= 0) {
        orders[existingIdx] = newOrder;
      } else {
        orders.unshift(newOrder);
      }
      const serializedOrders = JSON.stringify(orders);
      localStorage.setItem(getPurchaseOrdersStorageKey(), serializedOrders);
      localStorage.setItem('cuadreenv_purchase_orders_db', serializedOrders);
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
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      const apiList = extractArray<PurchaseDto>(res);
      const local = this.getLocalPurchases();
      const merged = [...apiList];
      for (const loc of local) {
        if (!merged.some((m) => m.id === loc.id)) {
          merged.unshift(loc);
        }
      }
      const totalCount = Math.max(merged.length, Number(res?.totalCount || res?.total || res?.count || 0));
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      return {
        success: true,
        data: merged,
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
      const res = await this.api.get<any, any>(`/Purchase/${id}`, {
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      if (res) {
        return { success: true, data: (res.data ?? res) as PurchaseDto };
      }
    } catch {
      // offline
    }
    const local = this.getLocalPurchases().find((p) => p.id === id);
    if (local) {
      return { success: true, data: local };
    }
    return { success: false, message: 'Compra no encontrada en el servidor.' };
  }

  async createPurchase(
    purchase: PurchaseDto,
  ): Promise<ApiResponse<PurchaseDto>> {
    const activeCompId = getCompanyId() || 1;

    // Normalizar detalles/items desde details o items
    const rawItems: any[] = (purchase as any).details || (purchase as any).items || [];
    const normalizedDetails = rawItems.map((d: any, idx: number) => ({
      productId: Number(d.productId || d.id || idx + 1),
      productCode: d.productCode || d.code || `PROD-${d.productId || idx + 1}`,
      productName: d.productName || d.name || `Producto #${d.productId || idx + 1}`,
      quantity: Number(d.quantity || 1),
      cost: Number(d.cost ?? d.costPrice ?? d.unitCost ?? 0),
      costPrice: Number(d.costPrice ?? d.cost ?? d.unitCost ?? 0),
      unitPrice: Number(d.unitPrice ?? d.cost ?? d.costPrice ?? d.unitCost ?? 0),
      subtotal: Number(d.subtotal ?? (Number(d.quantity || 1) * Number(d.cost ?? d.costPrice ?? 0))),
    }));

    const assignedId = purchase.id || Date.now();
    const fullPurchase: PurchaseDto = {
      ...purchase,
      id: assignedId,
      creationDate: (purchase as any).creationDate || (purchase as any).date || new Date().toISOString(),
      details: normalizedDetails,
      items: normalizedDetails,
    } as any;

    try {
      const payload: any = {
        ...purchase,
        companyId: Number(activeCompId),
        details: normalizedDetails,
      };
      const res = await this.api.post<any, any>('/Purchase', payload, {
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      const created = res?.data ?? res;
      if (created?.id) {
        fullPurchase.id = created.id;
      }
      if (created?.creationDate) {
        fullPurchase.creationDate = created.creationDate;
      }

      // Guardar localmente
      const current = this.getLocalPurchases();
      const existingIdx = current.findIndex((p) => p.id === fullPurchase.id);
      if (existingIdx >= 0) {
        current[existingIdx] = fullPurchase;
      } else {
        current.unshift(fullPurchase);
      }
      this.saveLocalPurchases(current);
      this.syncToPurchaseOrders(fullPurchase);

      return { success: true, data: fullPurchase, message: 'Compra registrada exitosamente.' };
    } catch (err: any) {
      console.warn('[PurchaseService] Backend error on createPurchase, fallback to local storage:', err);
      // Fallback local: garantizar que la orden de compra nunca se pierda
      const current = this.getLocalPurchases();
      const existingIdx = current.findIndex((p) => p.id === fullPurchase.id);
      if (existingIdx >= 0) {
        current[existingIdx] = fullPurchase;
      } else {
        current.unshift(fullPurchase);
      }
      this.saveLocalPurchases(current);
      this.syncToPurchaseOrders(fullPurchase);

      return { success: true, data: fullPurchase, message: 'Orden de compra registrada exitosamente (Guardada localmente).' };
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
