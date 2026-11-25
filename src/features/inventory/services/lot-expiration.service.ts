import { Injectable, inject } from '@angular/core';
import { ProductService } from '../../products/services/product.service';
import { StockService } from './stock.service';
import { getCompanyId } from '../../cuadreEnv/services/apiClient';
import type { ProductDto } from '../../cuadreEnv/types/api';

export type LotStatus = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'HEALTHY';

export interface LotBatchRecord {
  id: string;
  productId: number;
  productName: string;
  barcode?: string;
  lotNumber: string;
  expirationDate: string; // ISO date string (YYYY-MM-DD)
  quantity: number;
  unitCost: number;
  totalCost: number;
  warehouseName?: string;
  status: LotStatus;
  daysRemaining: number;
  recommendedAction: string;
}

const LOTS_STORAGE_KEY_PREFIX = 'cuadreenv_lot_batches_';

@Injectable({
  providedIn: 'root',
})
export class LotExpirationService {
  private readonly productService = inject(ProductService);
  private readonly stockService = inject(StockService);

  private getStorageKey(): string {
    const compId = getCompanyId() || 'default';
    return `${LOTS_STORAGE_KEY_PREFIX}${compId}`;
  }

  getStoredLots(): LotBatchRecord[] {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveStoredLots(lots: LotBatchRecord[]): void {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(lots));
    } catch (e) {
      console.warn('Error saving lot records:', e);
    }
  }

  calculateStatus(expirationDate: string): { status: LotStatus; daysRemaining: number; action: string } {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(expirationDate);
    exp.setHours(0, 0, 0, 0);

    const diffMs = exp.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return {
        status: 'EXPIRED',
        daysRemaining,
        action: '⛔ Producto Vencido: Retirar inmediatamente de anaquel / Merma.',
      };
    } else if (daysRemaining <= 15) {
      return {
        status: 'CRITICAL',
        daysRemaining,
        action: '🚨 Crítico (≤ 15 días): Liquidar con 30-40% descuento o devolver a suplidor.',
      };
    } else if (daysRemaining <= 60) {
      return {
        status: 'WARNING',
        daysRemaining,
        action: '⚠️ Rotación Prioritaria (FEFO): Ubicar al frente en góndola / Vender primero.',
      };
    } else {
      return {
        status: 'HEALTHY',
        daysRemaining,
        action: '✅ Vigente: Monitoreo rutinario.',
      };
    }
  }

  async getLotBatches(): Promise<LotBatchRecord[]> {
    let lots = this.getStoredLots();

    // Si aún no hay lotes guardados, generar ejemplos basados en productos existentes para que el usuario tenga datos reales iniciales
    if (lots.length === 0) {
      try {
        const pRes = await this.productService.getPagedProducts(1, 20, undefined, undefined, undefined, true);
        const products = (pRes.data?.items as ProductDto[]) || [];
        const initialLots: LotBatchRecord[] = [];

        products.slice(0, 6).forEach((p, idx) => {
          const pId = Number(p.id) || 1;
          const cost = Number(p.cost || 50);
          const stock = Number(p.stock || 20);

          // Generar fechas con diferentes rangos (crítico, warning, healthy)
          const targetDates = [
            new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 8 días (Crítico)
            new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 25 días (Warning)
            new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 90 días (Healthy)
          ];

          const expDate = targetDates[idx % targetDates.length];
          const calc = this.calculateStatus(expDate);

          initialLots.push({
            id: `LOT-${pId}-${idx + 1}`,
            productId: pId,
            productName: p.description || `Producto #${pId}`,
            barcode: p.barcode || undefined,
            lotNumber: `LOTE-2026-${String(idx + 101)}`,
            expirationDate: expDate,
            quantity: Math.max(5, Math.floor(stock / 2)),
            unitCost: cost,
            totalCost: Math.max(5, Math.floor(stock / 2)) * cost,
            warehouseName: 'Almacén Principal',
            status: calc.status,
            daysRemaining: calc.daysRemaining,
            recommendedAction: calc.action,
          });
        });

        if (initialLots.length > 0) {
          this.saveStoredLots(initialLots);
          lots = initialLots;
        }
      } catch {
        // ignore
      }
    }

    // Recalcular el estado al día actual
    const updated = lots.map((l) => {
      const calc = this.calculateStatus(l.expirationDate);
      return {
        ...l,
        status: calc.status,
        daysRemaining: calc.daysRemaining,
        recommendedAction: calc.action,
      };
    });

    // Ordenar por días restantes ascendente (los más próximos a vencer o vencidos primero)
    return updated.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  saveLotBatch(data: {
    productId: number;
    productName: string;
    barcode?: string;
    lotNumber: string;
    expirationDate: string;
    quantity: number;
    unitCost: number;
    warehouseName?: string;
  }): LotBatchRecord {
    const list = this.getStoredLots();
    const calc = this.calculateStatus(data.expirationDate);

    const newRecord: LotBatchRecord = {
      id: `LOT-${Date.now()}`,
      productId: data.productId,
      productName: data.productName,
      barcode: data.barcode,
      lotNumber: data.lotNumber,
      expirationDate: data.expirationDate,
      quantity: data.quantity,
      unitCost: data.unitCost,
      totalCost: data.quantity * data.unitCost,
      warehouseName: data.warehouseName || 'Almacén Principal',
      status: calc.status,
      daysRemaining: calc.daysRemaining,
      recommendedAction: calc.action,
    };

    list.unshift(newRecord);
    this.saveStoredLots(list);
    return newRecord;
  }

  deleteLotBatch(id: string): void {
    const list = this.getStoredLots().filter((l) => l.id !== id);
    this.saveStoredLots(list);
  }
}
