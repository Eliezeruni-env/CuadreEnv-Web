import { Injectable, inject } from '@angular/core';
import { SaleService } from '../../sales/services/sale.service';
import { ProductService } from '../../products/services/product.service';
import { StockService } from './stock.service';
import type { ProductDto } from '../../cuadreEnv/types/api';

export interface ReorderSuggestion {
  productId: number;
  productName: string;
  barcode?: string;
  currentStock: number;
  dailyVelocity: number; // Unidades vendidas por día (últimos 30 días)
  daysOfCover: number; // Días que durará el inventario actual
  leadTimeDays: number; // Tiempo estimado de entrega del suplidor (default: 5 días)
  safetyStock: number;
  reorderPoint: number;
  suggestedPurchaseQty: number; // Cantidad a pedir para cubrir 30 días
  unitCost: number;
  estimatedInvestment: number;
  supplierName?: string;
  urgency: 'CRITICAL' | 'WARNING' | 'HEALTHY';
}

export interface DeadStockItem {
  productId: number;
  productName: string;
  barcode?: string;
  currentStock: number;
  unitCost: number;
  unitPrice: number;
  immobilizedCapital: number; // Stock * Costo
  daysInactive: number; // Días sin movimiento (60+ o 90+)
  suggestedDiscountPercent: number; // Sugerencia de liquidación (ej: 15% o 25%)
  suggestedSalePrice: number;
}

export interface GrossProfitMetric {
  totalSalesNet: number;
  totalCogs: number; // Cost of Goods Sold
  grossProfit: number;
  grossMarginPercent: number;
}

@Injectable({
  providedIn: 'root',
})
export class InventoryIntelligenceService {
  private readonly saleService = inject(SaleService);
  private readonly productService = inject(ProductService);
  private readonly stockService = inject(StockService);

  async analyzeInventory(analysisPeriodDays = 30): Promise<{
    reorderSuggestions: ReorderSuggestion[];
    deadStockItems: DeadStockItem[];
    profitMetrics: GrossProfitMetric;
  }> {
    // 1. Obtener productos y ventas
    const [productsRes, salesRes] = await Promise.all([
      this.productService.getPagedProducts(1, 100, undefined, undefined, undefined, true),
      this.saleService.getSales({ pageSize: 300 }),
    ]);

    const itemsList: ProductDto[] = (productsRes.data?.items as ProductDto[]) || [];
    const products: ProductDto[] = itemsList.filter(
      (p: any) => !p.isService && p.productTypeId !== 2 && !(p.reference || '').startsWith('SERV-'),
    );
    const sales = salesRes.success && salesRes.data ? salesRes.data : [];

    const now = Date.now();
    const periodMs = analysisPeriodDays * 24 * 60 * 60 * 1000;
    const thresholdDate = now - periodMs;

    // 2. Mapear ventas por producto y calcular COGS
    const unitsSoldMap = new Map<number, number>();
    const lastSaleDateMap = new Map<number, number>();
    let totalSalesNet = 0;
    let totalCogs = 0;

    for (const sale of sales) {
      const anySale = sale as any;
      const saleTime = new Date(sale.creationDate || anySale.date || now).getTime();
      const isWithinPeriod = saleTime >= thresholdDate;

      if (isWithinPeriod) {
        totalSalesNet += Number(sale.total || 0) - Number(anySale.itbis || 0);
      }

      const details = sale.details || anySale.items || [];
      for (const d of details) {
        const pId = Number(d.productId || (d as any).id);
        const qty = Number(d.quantity || 1);

        if (pId > 0) {
          // Registrar última fecha de venta
          const prevLast = lastSaleDateMap.get(pId) || 0;
          if (saleTime > prevLast) {
            lastSaleDateMap.set(pId, saleTime);
          }

          if (isWithinPeriod) {
            const currentUnits = unitsSoldMap.get(pId) || 0;
            unitsSoldMap.set(pId, currentUnits + qty);

            // Calcular COGS
            const prod = products.find((p) => p.id === pId);
            const cost = Number(prod?.cost || 0);
            totalCogs += cost * qty;
          }
        }
      }
    }

    const grossProfit = Math.max(0, totalSalesNet - totalCogs);
    const grossMarginPercent = totalSalesNet > 0 ? (grossProfit / totalSalesNet) * 100 : 0;

    // 3. Generar Sugerencias de Reorden y Detección de Hueso
    const reorderSuggestions: ReorderSuggestion[] = [];
    const deadStockItems: DeadStockItem[] = [];

    for (const prod of products) {
      const prodId = Number(prod.id);
      if (!prodId) continue;

      const anyProd = prod as any;
      const stock = Number(prod.stock || anyProd.quantity || 0);
      const cost = Number(prod.cost || 0);
      const price = Number(prod.price || prod.priceList || cost * 1.3);
      const soldUnits = unitsSoldMap.get(prodId) || 0;
      const dailyVelocity = soldUnits / analysisPeriodDays; // Unidades / día

      const defaultLeadTime = 5; // Días de entrega estándar de proveedor
      const safetyStock = Math.ceil(dailyVelocity * 3); // 3 días de colchón
      const reorderPoint = Math.ceil(dailyVelocity * defaultLeadTime) + safetyStock;

      // Evaluación de Reorden: Si tiene rotación y stock por debajo o cerca del reorden
      if (dailyVelocity > 0 || stock <= (prod.minimumStock || 5)) {
        const daysOfCover = dailyVelocity > 0 ? Math.round(stock / dailyVelocity) : (stock <= 0 ? 0 : 999);
        const targetStockDays = 30; // Cubrir un mes de ventas
        const targetStock = Math.ceil(dailyVelocity * targetStockDays) + safetyStock;
        const suggestedQty = Math.max(0, targetStock - stock);

        let urgency: 'CRITICAL' | 'WARNING' | 'HEALTHY' = 'HEALTHY';
        if (stock <= 0 || daysOfCover <= 2) {
          urgency = 'CRITICAL';
        } else if (stock <= reorderPoint || daysOfCover <= defaultLeadTime + 2) {
          urgency = 'WARNING';
        }

        if (suggestedQty > 0 || urgency === 'CRITICAL' || urgency === 'WARNING') {
          reorderSuggestions.push({
            productId: prodId,
            productName: prod.description || `Producto #${prodId}`,
            barcode: prod.barcode || undefined,
            currentStock: stock,
            dailyVelocity: Math.round(dailyVelocity * 100) / 100,
            daysOfCover: daysOfCover === 999 ? 999 : daysOfCover,
            leadTimeDays: defaultLeadTime,
            safetyStock,
            reorderPoint: Math.max(reorderPoint, prod.minimumStock || 5),
            suggestedPurchaseQty: suggestedQty > 0 ? suggestedQty : (prod.minimumStock || 10),
            unitCost: cost,
            estimatedInvestment: (suggestedQty > 0 ? suggestedQty : (prod.minimumStock || 10)) * cost,
            supplierName: anyProd.supplierName || 'Proveedor Habitual',
            urgency,
          });
        }
      }

      // Evaluación de Producto Hueso (Baja Rotación / Capital Estancado)
      // Si tiene stock positivo (> 2 un) y 0 ventas en los últimos 30-60 días
      const lastSaleTime = lastSaleDateMap.get(prodId);
      const daysSinceLastSale = lastSaleTime
        ? Math.floor((now - lastSaleTime) / (24 * 60 * 60 * 1000))
        : 90; // Si nunca se ha vendido en el registro, asumir 90+

      if (stock > 0 && (soldUnits === 0 || daysSinceLastSale >= 45)) {
        const immobilizedCapital = stock * cost;
        const discountPct = daysSinceLastSale >= 90 ? 25 : 15;
        const suggestedSalePrice = Math.max(cost * 1.05, price * (1 - discountPct / 100));

        deadStockItems.push({
          productId: prodId,
          productName: prod.description || `Producto #${prodId}`,
          barcode: prod.barcode || undefined,
          currentStock: stock,
          unitCost: cost,
          unitPrice: price,
          immobilizedCapital,
          daysInactive: daysSinceLastSale,
          suggestedDiscountPercent: discountPct,
          suggestedSalePrice: Math.round(suggestedSalePrice * 100) / 100,
        });
      }
    }

    // Ordenar sugerencias de compra: Críticas primero, luego por urgencia y mayor velocidad
    const urgencyScore: Record<string, number> = { CRITICAL: 3, WARNING: 2, HEALTHY: 1 };
    reorderSuggestions.sort((a: ReorderSuggestion, b: ReorderSuggestion) => {
      return (urgencyScore[b.urgency] || 0) - (urgencyScore[a.urgency] || 0) || b.dailyVelocity - a.dailyVelocity;
    });

    // Ordenar productos hueso por capital inmovilizado descendente
    deadStockItems.sort((a: DeadStockItem, b: DeadStockItem) => b.immobilizedCapital - a.immobilizedCapital);

    return {
      reorderSuggestions,
      deadStockItems,
      profitMetrics: {
        totalSalesNet,
        totalCogs,
        grossProfit,
        grossMarginPercent,
      },
    };
  }
}
