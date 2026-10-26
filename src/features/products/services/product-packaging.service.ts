import { Injectable, signal } from '@angular/core';

export interface ProductPackaging {
  productId: number;
  hasPackaging: boolean;
  packageUnitName: string;       // ej: "Saco", "Caja", "Fardo", "Bulto", "Malla"
  packageUnitsCount: number;     // Factor de conversión: cuántas unidades base (lb, und, etc.) contiene 1 empaque (ej. 100, 125, 300, 24)
  packagePrice: number;          // Precio de venta por empaque completo (ej: 4,500)
  packageCost?: number;          // Costo de compra por empaque completo
  packageBarcode?: string;       // Código de barras del empaque
  hasIndividualUnit?: boolean;   // Si se vende también por unidad individual (ej: 1 cebolla, 1 plátano)
  individualUnitName?: string;   // Nombre de la unidad individual (ej: "Cebolla individual", "Pieza")
  individualUnitPrice?: number;  // Precio de la unidad individual (ej: RD$ 20.00 por cebolla)
  individualUnitWeight?: number; // Peso promedio estimado por unidad individual (ej: 0.35 lb por cebolla)
}

const STORAGE_KEY = 'cuadre_product_packagings';

@Injectable({
  providedIn: 'root'
})
export class ProductPackagingService {
  private readonly packagingsMap = signal<Map<number, ProductPackaging>>(new Map());

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed: ProductPackaging[] = JSON.parse(data);
        const map = new Map<number, ProductPackaging>();
        parsed.forEach(p => map.set(p.productId, p));
        this.packagingsMap.set(map);
      }
    } catch {
      // ignore
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = Array.from(this.packagingsMap().values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  getPackaging(productId: number): ProductPackaging | undefined {
    return this.packagingsMap().get(productId);
  }

  savePackaging(packaging: ProductPackaging): void {
    const current = new Map(this.packagingsMap());
    current.set(packaging.productId, packaging);
    this.packagingsMap.set(current);
    this.saveToStorage();
  }

  deletePackaging(productId: number): void {
    const current = new Map(this.packagingsMap());
    current.delete(productId);
    this.packagingsMap.set(current);
    this.saveToStorage();
  }

  /**
   * Genera el desglose o equivalencia legible del stock en almacén.
   * Ejemplo: Si stock = 550 lb y 1 Saco = 300 lb -> "1 Saco de 300 lb + 250 lb al detalle"
   */
  getEquivalenceText(productId: number, stockInBaseUnit: number, baseSymbol: string = 'lb'): string | null {
    const pkg = this.getPackaging(productId);
    if (!pkg || !pkg.hasPackaging || !pkg.packageUnitsCount || pkg.packageUnitsCount <= 0) {
      return null;
    }

    const conversion = pkg.packageUnitsCount;
    const name = pkg.packageUnitName || 'Empaque';

    if (stockInBaseUnit <= 0) {
      return `0 ${name}s`;
    }

    const fullPacks = Math.floor(stockInBaseUnit / conversion);
    const remainder = Math.round((stockInBaseUnit % conversion) * 100) / 100;

    if (fullPacks > 0 && remainder > 0) {
      return `${fullPacks} ${fullPacks === 1 ? name : name + 's'} + ${remainder} ${baseSymbol} al detalle`;
    } else if (fullPacks > 0) {
      return `${fullPacks} ${fullPacks === 1 ? name : name + 's'} completos`;
    } else {
      return `${remainder} ${baseSymbol} al detalle (< 1 ${name})`;
    }
  }

  /**
   * Calcula la deducción en inventario según el modo de venta elegido:
   * - 'detail': deduce la cantidad directa en la unidad base (ej: 2 lb de azúcar -> 2)
   * - 'package': deduce cantidad * factor (ej: 1 saco de azúcar de 300 lb -> 300)
   * - 'individual': deduce cantidad * peso unitario (ej: 2 cebollas * 0.35 lb -> 0.70 lb)
   */
  calculateInventoryDeduction(
    productId: number,
    mode: 'detail' | 'package' | 'individual',
    quantity: number
  ): number {
    const pkg = this.getPackaging(productId);
    if (!pkg || !pkg.hasPackaging) {
      return quantity;
    }

    if (mode === 'package') {
      const factor = pkg.packageUnitsCount || 1;
      return quantity * factor;
    }

    if (mode === 'individual') {
      const weight = pkg.individualUnitWeight || 1;
      return quantity * weight;
    }

    return quantity;
  }
}
