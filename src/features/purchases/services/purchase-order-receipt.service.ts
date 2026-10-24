import { Injectable, inject } from '@angular/core';
import { Observable, of, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { StockService } from '../../inventory/services/stock.service';
import { WarehouseService } from '../../inventory/services/warehouse.service';
import { ProductService } from '../../products/services/product.service';
import { KardexService } from '../../inventory/services/kardex.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type {
  PurchaseOrder,
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
  private stockService = inject(StockService);
  private warehouseService = inject(WarehouseService);
  private productService = inject(ProductService);
  private kardexService = inject(KardexService);

  private getLocalOrders(): PurchaseOrder[] {
    try {
      const raw = localStorage.getItem(PURCHASE_ORDERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveLocalOrders(list: PurchaseOrder[]): void {
    try {
      localStorage.setItem(PURCHASE_ORDERS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local orders:', e);
    }
  }

  private getLocalReceipts(): PurchaseOrderReceipt[] {
    try {
      const raw = localStorage.getItem(RECEIPTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveLocalReceipts(list: PurchaseOrderReceipt[]): void {
    try {
      localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local receipts:', e);
    }
  }

  async getPurchaseOrders(): Promise<ApiResponse<PurchaseOrder[]>> {
    try {
      const res = await this.api.get<any, any>('/PurchaseOrder');
      const list = extractArray<PurchaseOrder>(res);
      return { success: true, data: list || [] };
    } catch {
      return { success: false, data: [], message: 'No se pudo conectar con el servidor.' };
    }
  }

  async getPurchaseOrder(id: number): Promise<ApiResponse<PurchaseOrder>> {
    try {
      const res = await this.api.get<any, any>(`/PurchaseOrder/${id}`);
      if (res?.data || res) {
        return { success: true, data: (res.data ?? res) as PurchaseOrder };
      }
    } catch {
      // offline / not found
    }
    return { success: false, message: 'Orden de compra no encontrada en el servidor.' };
  }

  existsReceiptOrRequest(purchaseOrderId: number): Observable<boolean> {
    return from(this.getReceipts()).pipe(
      map((res) => {
        const list = res.data || [];
        return list.some(
          (r) => r.purchaseOrderId === purchaseOrderId && (r.statusId === 1 || r.statusId === 2),
        );
      }),
      catchError(() => of(false))
    );
  }

  async getReceipts(): Promise<ApiResponse<PurchaseOrderReceipt[]>> {
    try {
      const res = await this.api.get<any, any>('/PurchaseOrderReceipt');
      const list = extractArray<PurchaseOrderReceipt>(res);
      return { success: true, data: list || [] };
    } catch {
      return { success: false, data: [], message: 'No se pudo conectar con el servidor.' };
    }
  }

  async createReceipt(receipt: Partial<PurchaseOrderReceipt>): Promise<ApiResponse<PurchaseOrderReceipt>> {
    const id = Date.now();
    const receiptNum = `REC-${String(id).slice(-6)}`;
    const orders = this.getLocalOrders();
    const poIndex = orders.findIndex((o) => o.id === receipt.purchaseOrderId);

    const newReceipt: PurchaseOrderReceipt = {
      id,
      receiptNumber: receiptNum,
      prefix: 'REC',
      purchaseOrderId: receipt.purchaseOrderId || 0,
      purchaseOrderNumber: receipt.purchaseOrderNumber || `OC-${receipt.purchaseOrderId}`,
      warehouseId: receipt.warehouseId || 0,
      warehouseName: receipt.warehouseName || '',
      supplierId: receipt.supplierId || 1,
      supplierName: receipt.supplierName || 'Proveedor',
      receiptDate: new Date().toISOString(),
      statusId: receipt.statusId || 1,
      statusName: receipt.statusId === 2 ? 'En Revisión (Manage Request)' : 'Aplicado',
      comments: receipt.comments || '',
      hasDiscrepancies: receipt.hasDiscrepancies || false,
      productDetails: receipt.productDetails || [],
    };

    // If directly applied, increment stock and update purchase order lines
    if (newReceipt.statusId === 1) {
      for (const item of newReceipt.productDetails) {
        if (item.quantityReceived > 0) {
          await this.stockService.updateStock(
            newReceipt.warehouseId,
            item.productId,
            item.quantityReceived,
            item.productName,
            item.barCode,
          );

          // Kardex Automático y Costo Promedio Ponderado Dinámico
          try {
            const productRes = await this.productService.getProduct(item.productId);
            if (productRes?.success && productRes.data) {
              const currentProd = productRes.data;
              const currentCost = Number(currentProd.cost || 0);
              const currentStock = Number(currentProd.stock || 0);
              const newWeightedCost = this.kardexService.calculateWeightedAverageCost(
                currentStock,
                currentCost,
                item.quantityReceived,
                item.unitCost,
              );

              const sellPrice = currentProd.priceList || currentProd.price || (currentProd.cost ? currentProd.cost * 1.3 : 100);
              const margin = this.kardexService.calculateProfitMargin(
                sellPrice,
                newWeightedCost,
              );

              // Ajuste automático de costo unitario por fletes/aumentos de proveedor
              await this.productService.updateProduct({
                ...currentProd,
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
          } catch (kdxErr) {
            console.warn('Error en cálculo de costo promedio ponderado Kardex:', kdxErr);
          }
        }
      }

      // Update PO status
      if (poIndex !== -1) {
        const po = orders[poIndex];
        po.productDetails.forEach((line) => {
          const received = newReceipt.productDetails.find((r) => r.productId === line.productId);
          if (received) {
            line.quantityReceived += received.quantityReceived;
          }
        });
        const allCompleted = po.productDetails.every((line) => line.quantityReceived >= line.quantityOrdered);
        po.statusId = allCompleted ? 3 : 2; // 3: Completada, 2: Parcial
        po.statusName = allCompleted ? 'Completada' : 'Recepción Parcial';
        this.saveLocalOrders(orders);
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
