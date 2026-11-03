import { Injectable, signal, computed, inject } from '@angular/core';
import type { ProductDto } from '../../cuadreEnv/types/api';
import { ProductService } from '../../products/services/product.service';
import { getCompanyId } from '../../cuadreEnv/services/apiClient';

const BASE_DB_PREFIX = 'cuadre_pos_offline_db_';
const STORE_NAME = 'pos_products_catalog';
const META_STORE = 'pos_catalog_metadata';

@Injectable({
  providedIn: 'root',
})
export class PosCatalogCacheService {
  private productService = inject(ProductService);

  private inMemoryProducts = signal<ProductDto[]>([]);
  private barcodeIndex = new Map<string, ProductDto>();
  private idIndex = new Map<number, ProductDto>();

  readonly totalCached = computed(() => this.inMemoryProducts().length);
  readonly isLoaded = signal<boolean>(false);
  readonly isSyncing = signal<boolean>(false);
  readonly lastSyncTime = signal<Date | null>(null);

  constructor() {
    this.initCacheFromStorage();
  }

  /**
   * Resuelve el nombre de la base de datos particionada por Tenant/Empresa
   */
  private getDbName(): string {
    const compId = getCompanyId() || 'default';
    return `${BASE_DB_PREFIX}${compId}`;
  }

  /**
   * Limpia la memoria en RAM (usado en logout o cambio de empresa)
   */
  clearInMemoryCache(): void {
    this.inMemoryProducts.set([]);
    this.barcodeIndex.clear();
    this.idIndex.clear();
    this.isLoaded.set(false);
  }

  private async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject('IndexedDB no soportado');
      }
      const dbName = this.getDbName();
      const req = window.indexedDB.open(dbName, 2);
      req.onupgradeneeded = (e: any) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sales_outbox_queue')) {
          db.createObjectStore('sales_outbox_queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('barcode', 'barcode', { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Carga inicial desde IndexedDB a la memoria RAM al arrancar el POS
   */
  async initCacheFromStorage(): Promise<void> {
    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const items: ProductDto[] = req.result || [];
        if (items.length > 0) {
          this.rebuildMemoryIndex(items);
        }
        this.isLoaded.set(true);
      };
    } catch (e) {
      this.isLoaded.set(true);
    }
  }

  /**
   * Reconstruye índices en memoria RAM para búsquedas O(1) de escáner
   */
  private rebuildMemoryIndex(products: ProductDto[]): void {
    this.barcodeIndex.clear();
    this.idIndex.clear();

    for (const p of products) {
      if (p.id) {
        this.idIndex.set(Number(p.id), p);
      }
      const code = String(p.barcode || (p as any).code || p.reference || '').trim().toLowerCase();
      if (code) {
        this.barcodeIndex.set(code, p);
      }
      // Indexar también sin ceros a la izquierda
      const unpadded = code.replace(/^0+/, '');
      if (unpadded && unpadded !== code) {
        this.barcodeIndex.set(unpadded, p);
      }
    }

    this.inMemoryProducts.set(products);
  }

  /**
   * Búsqueda en memoria RAM instantánea (< 2ms)
   * Resuelve códigos de barra, SKUs y coincidencias por nombre
   */
  searchFast(query: string): ProductDto[] {
    if (!query || !query.trim()) {
      return this.inMemoryProducts().slice(0, 50);
    }

    const clean = query.trim().toLowerCase();

    // 1. Coincidencia exacta de código de barras O(1)
    const exactBarcode = this.barcodeIndex.get(clean) || this.barcodeIndex.get(clean.replace(/^0+/, ''));
    if (exactBarcode) {
      return [exactBarcode];
    }

    // 2. Coincidencia por ID numérico si corresponde
    const numId = Number(clean);
    if (!isNaN(numId) && this.idIndex.has(numId)) {
      const byId = this.idIndex.get(numId);
      if (byId) return [byId];
    }

    // 3. Filtrado por subcadena en nombre / descripción / código en memoria RAM
    const all = this.inMemoryProducts();
    const results: ProductDto[] = [];
    const tokens = clean.split(/\s+/).filter(Boolean);

    for (const p of all) {
      const name = ((p as any).name || p.description || p.shortDescription || '').toLowerCase();
      const code = (p.barcode || (p as any).code || p.reference || '').toLowerCase();

      // Debe coincidir con todos los tokens de búsqueda
      const matches = tokens.every(tok => name.includes(tok) || code.includes(tok));
      if (matches) {
        results.push(p);
        if (results.length >= 60) break; // Límite para evitar renderizado excesivo
      }
    }

    return results;
  }

  /**
   * Buscar exactamente por código de barra (para pistola / escáner)
   */
  findByBarcode(barcode: string): ProductDto | null {
    if (!barcode) return null;
    const clean = barcode.trim().toLowerCase();
    return this.barcodeIndex.get(clean) || this.barcodeIndex.get(clean.replace(/^0+/, '')) || null;
  }

  /**
   * Guarda o actualiza un lote de productos en IndexedDB y memoria
   */
  async cacheProducts(products: ProductDto[]): Promise<void> {
    if (!products || products.length === 0) return;

    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const p of products) {
        if (p.id) {
          store.put(p);
        }
      }

      // Reconstruir lista consolidada
      const existingMap = new Map<number, ProductDto>();
      for (const p of this.inMemoryProducts()) {
        if (p.id) existingMap.set(Number(p.id), p);
      }
      for (const p of products) {
        if (p.id) existingMap.set(Number(p.id), p);
      }

      this.rebuildMemoryIndex(Array.from(existingMap.values()));
      this.lastSyncTime.set(new Date());
    } catch (e) {
      console.warn('[PosCatalogCache] Error guardando productos en IndexedDB:', e);
    }
  }

  /**
   * Sincronización completa del catálogo en segundo plano
   */
  async prefetchFullCatalog(): Promise<number> {
    if (this.isSyncing()) return this.totalCached();
    this.isSyncing.set(true);

    try {
      // Descarga hasta 500 productos en un par de llamadas ligeras
      const res = await this.productService.getPagedProducts(1, 100);
      const firstBatch = res?.data?.items || [];
      const total = res?.data?.totalItemCount || firstBatch.length;

      let allItems: ProductDto[] = [...firstBatch];

      // Si hay más páginas, traerlas en paralelo
      if (total > 100) {
        const totalPages = Math.min(10, Math.ceil(total / 100)); // Límite seguro de 1000 items
        const promises = [];
        for (let page = 2; page <= totalPages; page++) {
          promises.push(this.productService.getPagedProducts(page, 100));
        }
        const rest = await Promise.all(promises);
        for (const r of rest) {
          if (r?.data?.items) {
            allItems = allItems.concat(r.data.items);
          }
        }
      }

      await this.cacheProducts(allItems);
      return allItems.length;
    } catch (e) {
      console.warn('[PosCatalogCache] Error en prefetch del catálogo:', e);
      return this.totalCached();
    } finally {
      this.isSyncing.set(false);
    }
  }
}
