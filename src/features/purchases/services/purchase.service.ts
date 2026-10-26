import { Injectable, inject } from '@angular/core';
import {
  ApiClientService,
  extractArray,
} from '../../cuadreEnv/services/apiClient';
import type { PurchaseDto, ApiResponse } from '../../cuadreEnv/types/api';

const PURCHASES_STORAGE_KEY = 'cuadreenv_purchases_db';
const PURCHASE_ORDERS_STORAGE_KEY = 'cuadreenv_purchase_orders_db';

@Injectable({
  providedIn: 'root',
})
export class PurchaseService {
  private readonly api = inject(ApiClientService);

  private getLocalPurchases(): PurchaseDto[] {
    try {
      const raw = localStorage.getItem(PURCHASES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveLocalPurchases(list: PurchaseDto[]): void {
    try {
      localStorage.setItem(PURCHASES_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Error saving local purchases:', e);
    }
  }

  private syncToPurchaseOrders(purchase: PurchaseDto): void {
    try {
      const rawOrders = localStorage.getItem(PURCHASE_ORDERS_STORAGE_KEY);
      const orders: any[] = rawOrders ? JSON.parse(rawOrders) : [];
      const poNum = `OC-${String(purchase.id || Date.now()).slice(-6)}`;

      const exists = orders.some((o) => o.id === purchase.id || o.orderNumber === poNum);
      if (!exists) {
        const newOrder = {
          id: purchase.id || Date.now(),
          orderNumber: poNum,
          prefix: 'OC',
          supplierId: purchase.supplierId || 1,
          supplierName: (purchase as any).supplierName || (purchase.supplierId ? `Proveedor #${purchase.supplierId}` : 'Proveedor General'),
          warehouseId: (purchase as any).warehouseId || null,
          warehouseName: (purchase as any).warehouseName || '',
          orderDate: purchase.creationDate || new Date().toISOString(),
          expectedDeliveryDate: new Date(Date.now() + 86400000 * 3).toISOString(),
          statusId: 1, // Pendiente de Recepción
          statusName: 'Pendiente de Recepción',
          notes: (purchase as any).notes || `Orden de compra generada desde módulo de compras #${purchase.id}`,
          subTotal: purchase.total || 0,
          itbis: 0,
          total: purchase.total || 0,
          productDetails: (purchase.details || []).map((d: any, idx: number) => ({
            productId: d.productId || idx + 1,
            barCode: d.barCode || d.productCode || `PROD-${d.productId || idx + 1}`,
            productName: d.productName || d.description || `Artículo #${d.productId || idx + 1}`,
            quantityOrdered: d.quantity || 1,
            quantityReceived: 0,
            unitCost: d.costPrice || d.unitPrice || 0,
            subTotal: (d.quantity || 1) * (d.costPrice || d.unitPrice || 0),
            itbis: 0,
            total: (d.quantity || 1) * (d.costPrice || d.unitPrice || 0),
          })),
        };
        orders.unshift(newOrder);
        localStorage.setItem(PURCHASE_ORDERS_STORAGE_KEY, JSON.stringify(orders));
      }
    } catch (e) {
      console.warn('Could not sync purchase to purchase orders:', e);
    }
  }

  async getPurchases(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PurchaseDto[]>> {
    try {
      const res = await this.api.get<any, any>('/Purchase', { params });
      const apiList = extractArray<PurchaseDto>(res);
      return { success: true, data: apiList || [] };
    } catch {
      return { success: false, data: [], message: 'No se pudo conectar con el servidor.' };
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
    let created: any = null;
    try {
      const res = await this.api.post<any, any>('/Purchase', purchase);
      created = res?.data ?? res;
    } catch {
      // offline fallback
    }

    const assignedId = created?.id || Date.now();
    const fullPurchase: PurchaseDto = {
      ...purchase,
      id: assignedId,
      creationDate: created?.creationDate || new Date().toISOString(),
      details: purchase.details || [],
    };

    // Save locally
    const current = this.getLocalPurchases();
    current.unshift(fullPurchase);
    this.saveLocalPurchases(current);

    // Sync to purchase orders so it immediately appears in goods receipt (Recepciones)
    this.syncToPurchaseOrders(fullPurchase);

    return { success: true, data: fullPurchase, message: 'Compra registrada exitosamente.' };
  }

  async updatePurchase(purchase: PurchaseDto): Promise<void> {
    try {
      await this.api.put('/Purchase', purchase);
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
