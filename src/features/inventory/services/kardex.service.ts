import { Injectable, signal, computed } from '@angular/core';

export interface KardexMovement {
  id: string;
  date: string;
  productId: number;
  productName: string;
  warehouseId: number;
  warehouseName?: string;
  movementType: 'COMPRA' | 'VENTA' | 'DEVOLUCION' | 'AJUSTE' | 'TRANSFERENCIA';
  documentReference: string; // ej. REC-000123, FAC-000456, NC-000078
  quantityIn: number;
  quantityOut: number;
  stockBalance: number;
  unitCost: number; // Costo de la operación o flete
  previousAverageCost: number;
  newAverageCost: number; // Costo Promedio Ponderado resultante
  sellingPrice?: number;
  profitMarginPercentage?: number; // Margen en vivo
  isMarginWarning?: boolean; // True si margen < 15% por inflación de costos
  notes?: string;
}

const KARDEX_STORAGE_KEY = 'cuadreenv_kardex_movements_db';

@Injectable({
  providedIn: 'root',
})
export class KardexService {
  private movementsSignal = signal<KardexMovement[]>(this.loadStoredMovements());

  readonly movements = computed(() => this.movementsSignal());

  private loadStoredMovements(): KardexMovement[] {
    try {
      const raw = localStorage.getItem(KARDEX_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveStoredMovements(list: KardexMovement[]) {
    try {
      localStorage.setItem(KARDEX_STORAGE_KEY, JSON.stringify(list));
      this.movementsSignal.set(list);
    } catch {
      // ignore
    }
  }

  recordMovement(entry: Omit<KardexMovement, 'id' | 'date'>): KardexMovement {
    const fullEntry: KardexMovement = {
      ...entry,
      id: `KDX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toISOString(),
    };

    const current = [fullEntry, ...this.movementsSignal()];
    this.saveStoredMovements(current);
    return fullEntry;
  }

  getProductMovements(productId: number): KardexMovement[] {
    return this.movementsSignal().filter((m) => m.productId === productId);
  }

  /**
   * Cálculo de Costo Promedio Ponderado Dinámico:
   * (Stock Anterior * Costo Anterior + Unidades Compradas * Costo Compra) / (Stock Total)
   */
  calculateWeightedAverageCost(
    currentStock: number,
    currentCost: number,
    incomingQty: number,
    incomingCost: number,
  ): number {
    const sOld = Math.max(0, currentStock);
    const cOld = Math.max(0, currentCost);
    const qIn = Math.max(0, incomingQty);
    const cIn = Math.max(0, incomingCost);

    const totalQty = sOld + qIn;
    if (totalQty <= 0) return cIn || cOld || 0;

    const totalValuation = (sOld * cOld) + (qIn * cIn);
    return Math.round((totalValuation / totalQty) * 100) / 100;
  }

  /**
   * Cálculo de Margen de Ganancia Bruta en Vivo:
   * ((Precio Venta - Costo Promedio) / Precio Venta) * 100
   */
  calculateProfitMargin(sellingPrice: number, cost: number): number {
    if (!sellingPrice || sellingPrice <= 0) return 0;
    return Math.round(((sellingPrice - cost) / sellingPrice) * 1000) / 10;
  }
}
