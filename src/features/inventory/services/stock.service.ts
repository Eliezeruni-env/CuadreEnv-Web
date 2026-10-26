import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { WarehouseService } from './warehouse.service';
import { ProductService } from '../../products/services/product.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { Stock } from '../../../app/models/product';

const STOCK_STORAGE_KEY = 'cuadreenv_stock_db';

@Injectable({
  providedIn: 'root',
})
export class StockService {
  private api = inject(ApiClientService);
  private warehouseService = inject(WarehouseService);
  private productService = inject(ProductService);

  private getLocalStock(): Stock[] {
    try {
      const raw = localStorage.getItem(STOCK_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // fallback
    }
    return [];
  }

  private saveLocalStock(list: Stock[]): void {
    try {
      localStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local stock:', e);
    }
  }

  async initializeStockIfEmpty(): Promise<void> {
    const current = this.getLocalStock();
    if (current.length > 0) return;

    // Build initial stock matrix from warehouses and products
    const whRes = await this.warehouseService.getWarehouses();
    const prodRes = await this.productService.getPagedProducts(1, 100);

    const warehouses = whRes?.data || [];
    const products = prodRes?.data?.items || [];
    if (warehouses.length === 0 || products.length === 0) {
      return;
    }

    const initialStock: Stock[] = [];
    let idCounter = 1;

    for (const wh of warehouses) {
      for (const p of products) {
        const pId = p.id || 0;
        const pDesc = p.description || `Producto #${pId}`;
        const pBarcode = p.barcode || undefined;
        const pCost = p.cost || 0;
        const pPrice = (p as any).priceList || (p as any).price || (pCost ? pCost * 1.3 : 0);
        const baseQty = wh.isMain ? (Number(p.stock) || 0) : 0;

        initialStock.push({
          id: idCounter++,
          warehouseId: wh.id,
          warehouseName: wh.name,
          productId: pId,
          productName: pDesc,
          barcode: pBarcode,
          quantity: baseQty,
          minimumQuantity: p.minimumQuantity || 5,
          maximumQuantity: p.maximumQuantity || 100,
          cost: pCost,
          price: pPrice,
          lastUpdated: new Date().toISOString(),
        });
      }
    }

    this.saveLocalStock(initialStock);
  }

  async getStock(filters?: {
    warehouseId?: number;
    productId?: number;
    q?: string;
  }): Promise<ApiResponse<Stock[]>> {
    await this.initializeStockIfEmpty();
    let list = this.getLocalStock();

    if (filters?.warehouseId) {
      list = list.filter((s) => s.warehouseId === Number(filters.warehouseId));
    }
    if (filters?.productId) {
      list = list.filter((s) => s.productId === Number(filters.productId));
    }
    if (filters?.q?.trim()) {
      const query = filters.q.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.productName.toLowerCase().includes(query) ||
          (s.barcode && s.barcode.toLowerCase().includes(query)) ||
          s.warehouseName.toLowerCase().includes(query),
      );
    }

    return { success: true, data: list };
  }

  async getProductStockInWarehouse(warehouseId: number, productId: number): Promise<number> {
    await this.initializeStockIfEmpty();
    const list = this.getLocalStock();
    const item = list.find((s) => s.warehouseId === warehouseId && s.productId === productId);
    return item ? item.quantity : 0;
  }

  async updateStock(
    warehouseId: number,
    productId: number,
    quantityChange: number,
    productName?: string,
    barcode?: string,
  ): Promise<Stock> {
    await this.initializeStockIfEmpty();
    const list = this.getLocalStock();
    let item = list.find((s) => s.warehouseId === warehouseId && s.productId === productId);

    if (!item) {
      const whRes = await this.warehouseService.getWarehouse(warehouseId);
      const whName = whRes?.data?.name || `Almacén #${warehouseId}`;
      item = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        warehouseId,
        warehouseName: whName,
        productId,
        productName: productName || `Producto #${productId}`,
        barcode: barcode || '',
        quantity: 0,
        minimumQuantity: 5,
        maximumQuantity: 100,
        lastUpdated: new Date().toISOString(),
      };
      list.push(item);
    }

    item.quantity += quantityChange;
    item.lastUpdated = new Date().toISOString();
    this.saveLocalStock(list);

    // Sync global product stock
    try {
      const globalQty = list
        .filter((s) => s.productId === productId)
        .reduce((acc, s) => acc + s.quantity, 0);

      const p = await this.productService.getProduct(productId);
      if (p?.success && p.data) {
        await this.productService.updateProduct({
          ...p.data,
          stock: globalQty,
        });
      }
    } catch {
      // ignore
    }

    return item;
  }

  getStockStatus(
    quantity: number,
    minQty: number = 5,
    maxQty: number = 100,
  ): { label: string; badgeClass: string; color: string; type: 'CRITICAL' | 'LOW' | 'NORMAL' | 'OVERSTOCK' } {
    if (quantity <= 0) {
      return {
        label: 'Agotado / Crítico',
        badgeClass: 'status-badge-danger px-2.5 py-1 rounded-pill',
        color: '#dc3545',
        type: 'CRITICAL',
      };
    }
    if (quantity <= minQty) {
      return {
        label: 'Stock Mínimo',
        badgeClass: 'status-badge-warning px-2.5 py-1 rounded-pill',
        color: '#f59e0b',
        type: 'LOW',
      };
    }
    if (quantity >= maxQty) {
      return {
        label: 'Sobre-stock',
        badgeClass: 'status-badge-subtle-primary px-2.5 py-1 rounded-pill',
        color: '#252b46',
        type: 'OVERSTOCK',
      };
    }
    return {
      label: 'Normal',
      badgeClass: 'status-badge-success px-2.5 py-1 rounded-pill',
      color: '#198754',
      type: 'NORMAL',
    };
  }
}
