import { Injectable, inject } from '@angular/core';
import { Observable, of, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  ApiClientService,
  extractArray,
  getCompanyId,
} from '../../cuadreEnv/services/apiClient';
import { StockService } from '../../inventory/services/stock.service';
import { WarehouseService } from '../../inventory/services/warehouse.service';
import { ProductService } from '../../products/services/product.service';
import { KardexService } from '../../inventory/services/kardex.service';
import { PurchaseService } from './purchase.service';
import { SupplierService } from './supplier.service';
import type { ApiResponse, PurchaseDto } from '../../cuadreEnv/types/api';
import type {
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderReceipt,
} from '../../../app/models/purchase-order';

const PURCHASE_ORDERS_STORAGE_KEY = 'cuadreenv_purchase_orders_db';
const RECEIPTS_STORAGE_KEY = 'cuadreenv_po_receipts_db';

const DEFAULT_ORDERS: PurchaseOrder[] = [];

@Injectable({
  providedIn: 'root',
})
export class PurchaseOrderReceiptService {
  private api = inject(ApiClientService);
  private stockService = inject(StockService, { optional: true });
  private warehouseService = inject(WarehouseService, { optional: true });
  private productService = inject(ProductService, { optional: true });
  private kardexService = inject(KardexService, { optional: true });
  private purchaseService = inject(PurchaseService, { optional: true });
  private supplierService = inject(SupplierService, { optional: true });

  getLocalOrders(): PurchaseOrder[] {
    try {
      const ordersMap = new Map<number | string, PurchaseOrder>();
      const compId = getCompanyId();
      const keys = [
        PURCHASE_ORDERS_STORAGE_KEY,
        compId ? `${PURCHASE_ORDERS_STORAGE_KEY}_${compId}` : null,
      ].filter(Boolean) as string[];

      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PURCHASE_ORDERS_STORAGE_KEY) && !keys.includes(k)) {
            keys.push(k);
          }
        }
      }

      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((o: any) => {
                const k = o.id || o.orderNumber;
                if (k && !ordersMap.has(k)) {
                  ordersMap.set(k, o);
                }
              });
            }
          } catch {}
        }
      }

      return Array.from(ordersMap.values());
    } catch {
      return [];
    }
  }

  saveLocalOrders(list: PurchaseOrder[]): void {
    try {
      const compId = getCompanyId();
      const raw = JSON.stringify(list);
      localStorage.setItem(PURCHASE_ORDERS_STORAGE_KEY, raw);
      if (compId) {
        localStorage.setItem(`${PURCHASE_ORDERS_STORAGE_KEY}_${compId}`, raw);
      }
    } catch (e) {
      console.error('Error saving local orders:', e);
    }
  }

  savePurchaseOrder(order: PurchaseOrder): void {
    const list = this.getLocalOrders();
    const idx = list.findIndex(
      (o) => o.id === order.id || o.orderNumber === order.orderNumber,
    );
    if (idx >= 0) {
      list[idx] = order;
    } else {
      list.unshift(order);
    }
    this.saveLocalOrders(list);
  }

  getLocalReceipts(): PurchaseOrderReceipt[] {
    try {
      const receiptsMap = new Map<number | string, PurchaseOrderReceipt>();
      const compId = getCompanyId();
      const keys = [
        RECEIPTS_STORAGE_KEY,
        compId ? `${RECEIPTS_STORAGE_KEY}_${compId}` : null,
      ].filter(Boolean) as string[];

      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(RECEIPTS_STORAGE_KEY) && !keys.includes(k)) {
            keys.push(k);
          }
        }
      }

      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((r: any) => {
                const k = r.id || r.receiptNumber;
                if (k && !receiptsMap.has(k)) {
                  receiptsMap.set(k, r);
                }
              });
            }
          } catch {}
        }
      }

      return Array.from(receiptsMap.values());
    } catch {
      return [];
    }
  }

  saveLocalReceipts(list: PurchaseOrderReceipt[]): void {
    try {
      const compId = getCompanyId();
      const raw = JSON.stringify(list);
      localStorage.setItem(RECEIPTS_STORAGE_KEY, raw);
      if (compId) {
        localStorage.setItem(`${RECEIPTS_STORAGE_KEY}_${compId}`, raw);
      }
    } catch (e) {
      console.error('Error saving local receipts:', e);
    }
  }

  private mapPurchaseToOrder(
    p: PurchaseDto,
    suppliersMap: Map<number, string>,
  ): PurchaseOrder {
    const id = p.id || 0;
    const supName =
      (p as any).supplierName ||
      (p.supplierId ? suppliersMap.get(p.supplierId) : null) ||
      'Proveedor General';

    const rawItems: any[] =
      p.details && p.details.length > 0
        ? p.details
        : (p as any).items && (p as any).items.length > 0
          ? (p as any).items
          : [];

    let details: PurchaseOrderDetail[] = rawItems.map(
      (d: any, idx: number) => ({
        productId: Number(d.productId || d.id || idx + 1),
        barCode: d.barCode || d.productCode || d.code || '',
        productName:
          d.productName ||
          d.name ||
          d.description ||
          `Producto #${d.productId || idx + 1}`,
        quantityOrdered: Number(d.quantityOrdered || d.quantity || 1),
        quantityReceived: Number(d.quantityReceived || 0),
        unitCost: Number(d.costPrice || d.cost || d.unitCost || 0),
        subTotal: Number(
          d.subtotal ??
            Number(d.quantity || 1) * Number(d.costPrice || d.cost || 0),
        ),
        total: Number(
          d.total ??
            d.subtotal ??
            Number(d.quantity || 1) * Number(d.costPrice || d.cost || 0),
        ),
      }),
    );

    // Si la orden no traía productos detallados, crear un renglón predeterminado con el monto total
    if (details.length === 0) {
      const orderTot = Number(p.total || (p as any).subTotal || 100);
      details = [
        {
          productId: 1,
          barCode: (p as any).orderNumber || p.invoiceNumber || `PUR-${id}`,
          productName: (p as any).notes?.trim() || `Compra #${id} - Insumos / Mercancía`,
          quantityOrdered: 1,
          quantityReceived: 0,
          unitCost: orderTot,
          subTotal: orderTot,
          total: orderTot,
        },
      ];
    }

    return {
      id,
      orderNumber:
        (p as any).orderNumber ||
        p.invoiceNumber ||
        `OC-${String(id).padStart(5, '0')}`,
      prefix: 'OC',
      supplierId: p.supplierId || 1,
      supplierName: supName,
      supplierRnc: (p as any).supplierRnc || '',
      warehouseId: (p as any).warehouseId || 1,
      warehouseName: (p as any).warehouseName || 'Almacén Principal',
      orderDate: p.creationDate || new Date().toISOString(),
      expectedDeliveryDate:
        (p as any).expectedDeliveryDate ||
        p.creationDate ||
        new Date().toISOString(),
      statusId: (p as any).statusId || (p.status === 'PAID' ? 3 : 1),
      statusName:
        (p as any).statusName ||
        (p.status === 'PAID' ? 'Completada' : 'Pendiente'),
      notes: (p as any).notes || '',
      subTotal: (p as any).subTotal || p.total || 0,
      itbis: (p as any).itbis || 0,
      total: p.total || 0,
      items: details,
      productDetails: details,
    } as any;
  }

  async getPurchaseOrders(): Promise<ApiResponse<PurchaseOrder[]>> {
    const combinedMap = new Map<number | string, PurchaseOrder>();

    // 1. Try server PO endpoint (silent to prevent outage toasts on downtime)
    try {
      const res = await this.api.get<any, any>('/PurchaseOrder', {
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      const list = extractArray<PurchaseOrder>(res);
      if (list && list.length > 0) {
        list.forEach((o) => {
          const k = o.id || o.orderNumber;
          if (k) combinedMap.set(k, o);
        });
      }
    } catch {}

    // 2. Query Purchases module (server or local cache)
    try {
      let purchases: PurchaseDto[] = [];
      if (this.purchaseService) {
        const pRes = await this.purchaseService.getPurchases();
        if (pRes?.success && pRes.data && pRes.data.length > 0) {
          purchases = pRes.data;
        } else {
          purchases = this.purchaseService.getLocalPurchases();
        }
      }

      // Preload supplier names
      const supMap = new Map<number, string>();
      if (this.supplierService) {
        const sRes = await this.supplierService.getSuppliers();
        if (sRes?.success && sRes.data) {
          sRes.data.forEach((s: any) => {
            if (s.id && s.name) supMap.set(s.id, s.name);
          });
        }
      }

      purchases.forEach((p) => {
        const k = p.id || (p as any).orderNumber || p.invoiceNumber;
        if (k && !combinedMap.has(k)) {
          combinedMap.set(k, this.mapPurchaseToOrder(p, supMap));
        }
      });
    } catch {}

    // 3. Fallback to local POs
    const local = this.getLocalOrders();
    local.forEach((o) => {
      const k = o.id || o.orderNumber;
      if (k && !combinedMap.has(k)) combinedMap.set(k, o);
    });

    const result = Array.from(combinedMap.values());
    if (result.length > 0) {
      this.saveLocalOrders(result);
    }
    return { success: true, data: result };
  }

  async getPurchaseOrder(id: number): Promise<ApiResponse<PurchaseOrder>> {
    try {
      const res = await this.api.get<any, any>(`/PurchaseOrder/${id}`, {
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      if (res?.data || res) {
        return { success: true, data: (res.data ?? res) as PurchaseOrder };
      }
    } catch {}

    // Fallback: look in combined orders
    const all = await this.getPurchaseOrders();
    const found = all.data?.find((o) => o.id === id);
    if (found) {
      return { success: true, data: found };
    }

    // Direct purchase lookup
    if (this.purchaseService) {
      try {
        const pRes = await this.purchaseService.getPurchase(id);
        if (pRes?.success && pRes.data) {
          const supMap = new Map<number, string>();
          return {
            success: true,
            data: this.mapPurchaseToOrder(pRes.data, supMap),
          };
        }
      } catch {}
    }

    return {
      success: false,
      message: 'Orden de compra no encontrada en el sistema.',
    };
  }

  existsReceiptOrRequest(purchaseOrderId: number): Observable<boolean> {
    return from(this.getReceipts()).pipe(
      map((res) => {
        const list = res.data || [];
        return list.some(
          (r) =>
            r.purchaseOrderId === purchaseOrderId &&
            (r.statusId === 1 || r.statusId === 2),
        );
      }),
      catchError(() => of(false)),
    );
  }

  async getReceipts(): Promise<ApiResponse<PurchaseOrderReceipt[]>> {
    try {
      const res = await this.api.get<any, any>('/PurchaseOrderReceipt', {
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      const list = extractArray<PurchaseOrderReceipt>(res);
      const local = this.getLocalReceipts();
      const merged = [...(list || [])];
      for (const loc of local) {
        if (!merged.some((m) => m.id === loc.id || m.receiptNumber === loc.receiptNumber)) {
          merged.unshift(loc);
        }
      }
      return { success: true, data: merged };
    } catch {
      return {
        success: true,
        data: this.getLocalReceipts(),
        message: 'Modo local activo.',
      };
    }
  }

  async createReceipt(
    receipt: Partial<PurchaseOrderReceipt>,
  ): Promise<ApiResponse<PurchaseOrderReceipt>> {
    const id = Date.now();
    const receiptNum = `REC-${String(id).slice(-6)}`;
    const orders = this.getLocalOrders();
    const poIndex = orders.findIndex((o) => o.id === receipt.purchaseOrderId);

    const newReceipt: PurchaseOrderReceipt = {
      id,
      receiptNumber: receiptNum,
      prefix: 'REC',
      purchaseOrderId: receipt.purchaseOrderId || 0,
      purchaseOrderNumber:
        receipt.purchaseOrderNumber || `OC-${receipt.purchaseOrderId}`,
      warehouseId: receipt.warehouseId || 1,
      warehouseName: receipt.warehouseName || 'Almacén Principal',
      supplierId: receipt.supplierId || 1,
      supplierName: receipt.supplierName || 'Proveedor',
      receiptDate: new Date().toISOString(),
      statusId: receipt.statusId || 1,
      statusName:
        receipt.statusId === 2 ? 'En Revisión (Manage Request)' : 'Aplicado',
      comments: receipt.comments || '',
      hasDiscrepancies: receipt.hasDiscrepancies || false,
      productDetails: receipt.productDetails || [],
    };

    // If directly applied, increment stock and update purchase order lines
    if (newReceipt.statusId === 1) {
      for (const item of newReceipt.productDetails) {
        if (item.quantityReceived > 0) {
          if (this.stockService) {
            await this.stockService.updateStock(
              newReceipt.warehouseId,
              item.productId,
              item.quantityReceived,
              item.productName,
              item.barCode,
            );
          }

          // Kardex Automático y Costo Promedio Ponderado Dinámico
          try {
            if (this.productService && this.kardexService) {
              const productRes = await this.productService.getProduct(
                item.productId,
              );
              if (productRes?.success && productRes.data) {
                const currentProd = productRes.data;
                const currentCost = Number(currentProd.cost || 0);
                const currentStock = Number(currentProd.stock || 0);
                const newWeightedCost =
                  this.kardexService.calculateWeightedAverageCost(
                    currentStock,
                    currentCost,
                    item.quantityReceived,
                    item.unitCost,
                  );

                const sellPrice =
                  currentProd.priceList ||
                  currentProd.price ||
                  (currentProd.cost ? currentProd.cost * 1.3 : 100);
                const margin = this.kardexService.calculateProfitMargin(
                  sellPrice,
                  newWeightedCost,
                );

                // Ajuste automático de stock y costo unitario promedio en catálogo
                await this.productService.updateProduct({
                  ...currentProd,
                  stock: currentStock + item.quantityReceived,
                  cost: newWeightedCost,
                });

                // Asiento de trazabilidad en Kardex
                this.kardexService.recordMovement({
                  productId: item.productId,
                  productName: item.productName,
                  warehouseId: newReceipt.warehouseId,
                  warehouseName: newReceipt.warehouseName,
                  movementType: 'COMPRA',
                  documentReference: receiptNum,
                  quantityIn: item.quantityReceived,
                  quantityOut: 0,
                  stockBalance: currentStock + item.quantityReceived,
                  unitCost: item.unitCost,
                  previousAverageCost: currentCost,
                  newAverageCost: newWeightedCost,
                  sellingPrice: sellPrice,
                  profitMarginPercentage: margin,
                  isMarginWarning: margin < 15,
                  notes: `Recepción de Orden de Compra ${newReceipt.purchaseOrderNumber}`,
                });
              }
            }
          } catch (kdxErr) {
            console.warn(
              'Error en cálculo de costo promedio ponderado Kardex:',
              kdxErr,
            );
          }
        }
      }

      // Update PO status
      if (poIndex !== -1) {
        const po = orders[poIndex];
        po.productDetails.forEach((line) => {
          const received = newReceipt.productDetails.find(
            (r) => r.productId === line.productId,
          );
          if (received) {
            line.quantityReceived += received.quantityReceived;
          }
        });
        const allCompleted = po.productDetails.every(
          (line) => line.quantityReceived >= line.quantityOrdered,
        );
        po.statusId = allCompleted ? 3 : 2; // 3: Completada, 2: Parcial
        po.statusName = allCompleted ? 'Completada' : 'Recepción Parcial';
        this.saveLocalOrders(orders);
      }

      if (this.purchaseService && newReceipt.purchaseOrderId) {
        try {
          const localPurchases = this.purchaseService.getLocalPurchases();
          const pMatch = localPurchases.find(
            (p) => p.id === newReceipt.purchaseOrderId,
          );
          if (pMatch) {
            (pMatch as any).statusId = 3;
            (pMatch as any).statusName = 'Recibida';
            (pMatch as any).receptionCompleted = true;
            this.purchaseService.saveLocalPurchases(localPurchases);
          }
        } catch {}
      }
    }

    const receipts = this.getLocalReceipts();
    receipts.unshift(newReceipt);
    this.saveLocalReceipts(receipts);

    return {
      success: true,
      data: newReceipt,
      message: `Recepción ${receiptNum} generada exitosamente.`,
    };
  }
}
