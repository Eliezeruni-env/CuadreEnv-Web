import { Injectable } from '@angular/core';
import { getCompanyId } from './apiClient';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs?: number;
}

@Injectable({
  providedIn: 'root',
})
export class TenantCacheService {
  private memoryCache = new Map<string, CacheEntry<any>>();

  /**
   * Construye la clave con el formato canónico estricto:
   * {resource}:{activeCompanyId}:{filters}:{page}:{pageSize}
   * Nunca permite crear claves con compañía nula, 'default' o fallbacks no validados.
   */
  buildKey(
    resource: string,
    filters: string | Record<string, any> = 'none',
    page: number = 1,
    pageSize: number = 25
  ): string {
    const activeCompId = getCompanyId();
    if (!activeCompId || String(activeCompId).trim() === '' || activeCompId === 'default' || activeCompId === 'null') {
      throw new Error(`TENANT_CONTEXT_REQUIRED: No se puede generar clave de caché para '${resource}' sin una compañía activa.`);
    }

    const filterString =
      typeof filters === 'string'
        ? filters.trim() || 'all'
        : JSON.stringify(filters || {});

    return `${resource}:${activeCompId}:${filterString}:${page}:${pageSize}`;
  }

  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.ttlMs && Date.now() - entry.timestamp > entry.ttlMs) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs,
    });
  }

  /**
   * Invalida de forma exhaustiva todos los datos cacheados para una compañía específica.
   * Purgando memoria y localStorage asociado a productos, compras, ventas, etc.
   */
  invalidateCompanyCache(companyId: string | number): void {
    const compStr = String(companyId);
    for (const key of this.memoryCache.keys()) {
      const parts = key.split(':');
      if (parts.length >= 2 && parts[1] === compStr) {
        this.memoryCache.delete(key);
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k.includes(`_${compStr}`) || k.includes(`:${compStr}:`))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      } catch {}
    }
  }

  clearAll(): void {
    this.memoryCache.clear();
  }
}

