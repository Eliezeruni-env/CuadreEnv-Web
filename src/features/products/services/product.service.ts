import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ProductDto, ApiResponse, PagedResult } from '../../cuadreEnv/types/api';
import { getCompanyId } from '../../cuadreEnv/services/apiClient';

export interface ProductFilters {
  description?: string;
  minCost?: number;
  maxCost?: number;
}

export interface PagedProductsResponse extends PagedResult<ProductDto> {
  total?: number;
  page?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl =
    (environment.apiUrl || 'http://localhost:8080').replace(/\/v1\/?$/, '').replace(/\/$/, '') + '/v1';
  private readonly PHOTO_STORAGE_KEY = 'cuadreenv_product_photos_v1';
  private readonly METRICS_STORAGE_KEY = 'cuadreenv_product_cost_metrics_v1';

  getProductPhoto(idOrBarcode: number | string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.PHOTO_STORAGE_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw);
      return map[String(idOrBarcode)] || null;
    } catch {
      return null;
    }
  }

  saveProductPhoto(idOrBarcode: number | string, photoDataUrl: string): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.PHOTO_STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[String(idOrBarcode)] = photoDataUrl;
      localStorage.setItem(this.PHOTO_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('Could not store product photo locally:', e);
    }
  }

  updateProductCostFromPurchase(productId: number, unitCost: number, supplierId?: number | null): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.METRICS_STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      const current = map[productId] || {};
      const price = current.price || unitCost * 1.35;
      const grossProfit = Math.round((price - unitCost) * 100) / 100;
      const profitMargin = price > 0 ? Math.round(((grossProfit / price) * 100) * 10) / 10 : 0;
      map[productId] = {
        ...current,
        cost: unitCost,
        price,
        grossProfit,
        profitMargin,
        supplierId: supplierId || current.supplierId,
        lastPurchaseDate: new Date().toISOString(),
      };
      localStorage.setItem(this.METRICS_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('Could not save product cost metrics:', e);
    }
  }

  getProductMetrics(productId: number): { cost?: number; price?: number; grossProfit?: number; profitMargin?: number; supplierId?: number } | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.METRICS_STORAGE_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw);
      return map[productId] || null;
    } catch {
      return null;
    }
  }

  /**
   * Observable reactivo para el listado paginado de productos:
   * GET /v1/product/paged?pageNumber=1&pageSize=10
   * El backend limita pageSize a un máximo de 100.
   */
  getPagedProducts$(
    pageNumber = 1,
    pageSize = 10,
    filters?: ProductFilters
  ): Observable<ApiResponse<PagedProductsResponse>> {
    // Validar y acotar según reglas: no menor a 1, no mayor a 100
    const validPage = Math.max(1, pageNumber || 1);
    const validSize = Math.min(100, Math.max(1, pageSize || 10));
    const activeCompanyId = Number(getCompanyId()) || 0;

    let params = new HttpParams()
      .set('pageNumber', validPage.toString())
      .set('pageSize', validSize.toString());

    if (activeCompanyId > 0) {
      params = params
        .set('companyId', activeCompanyId.toString())
        .set('CompanyId', activeCompanyId.toString());
    }

    if (filters?.description && filters.description.trim()) {
      const term = filters.description.trim();
      params = params.set('description', term).set('barcode', term);
    }
    if (filters?.minCost !== undefined && filters?.minCost !== null) {
      params = params.set('minCost', filters.minCost.toString());
    }
    if (filters?.maxCost !== undefined && filters?.maxCost !== null) {
      params = params.set('maxCost', filters.maxCost.toString());
    }

    const url = `${this.baseUrl}/product/paged`;

    return this.http.get<any>(url, { params }).pipe(
      map((res: any) => {
        const resData = res?.data ?? res?.Data ?? res?.value ?? res?.Value;
        let items: ProductDto[] = [];
        let total = 0;

        if (Array.isArray(res)) {
          items = res;
          total = res.length;
        } else if (Array.isArray(resData)) {
          items = resData;
          total = res?.totalItemCount ?? res?.TotalItemCount ?? res?.total ?? res?.Total ?? items.length;
        } else if (resData && typeof resData === 'object') {
          const rawItems =
            resData.items ??
            resData.Items ??
            resData.records ??
            resData.Records ??
            resData.data ??
            resData.Data;
          if (Array.isArray(rawItems)) {
            items = rawItems;
          }
          total =
            resData.totalItemCount ??
            resData.TotalItemCount ??
            resData.total ??
            resData.Total ??
            res?.totalItemCount ??
            res?.TotalItemCount ??
            items.length;
        } else if (res && typeof res === 'object') {
          const rawItems = res.items ?? res.Items ?? res.records ?? res.Records;
          if (Array.isArray(rawItems)) {
            items = rawItems;
          }
          total = res.totalItemCount ?? res.TotalItemCount ?? res.total ?? res.Total ?? items.length;
        }

        // Aislamiento multi-tenant estricto: un tenant jamás puede ver productos de otro
        if (activeCompanyId > 0) {
          items = items.filter((p: any) => {
            const pCid = p.companyId ?? p.CompanyId;
            return pCid == null || Number(pCid) === 0 || Number(pCid) === activeCompanyId;
          });
        }

        // Enriquecer productos con fotos y atributos guardados
        items = items.map((p) => {
          const photo = p.imageUrl || (p.id ? this.getProductPhoto(p.id) : null) || (p.barcode ? this.getProductPhoto(p.barcode) : null);
          return {
            ...p,
            imageUrl: photo || null,
          };
        });

        const pageCount = Math.max(1, Math.ceil(total / validSize));

        return {
          success: res?.success !== false && res?.Success !== false,
          data: {
            items,
            pageSize: validSize,
            pageCount,
            totalItemCount: total,
            total,
            page: validPage,
          },
          message: res?.message ?? res?.Message ?? null,
          errors: res?.errors ?? res?.Errors ?? [],
        };
      })
    );
  }

  /**
   * Versión Promise para compatibilidad directa en componentes existentes:
   * GET /v1/product/paged
   */
  async getPagedProducts(
    pageNumber = 1,
    pageSize = 10,
    description?: string,
    minCost?: number,
    maxCost?: number,
  ): Promise<ApiResponse<PagedProductsResponse>> {
    const validSize = Math.min(100, Math.max(1, pageSize || 10));
    const activeCompanyId = Number(getCompanyId()) || 0;
    try {
      return await firstValueFrom(
        this.getPagedProducts$(pageNumber, validSize, {
          description,
          minCost,
          maxCost,
        })
      );
    } catch {
      // Fallback a /v1/product sin /paged si el endpoint de paginación tiene otra ruta
      try {
        let params = new HttpParams()
          .set('pageNumber', pageNumber.toString())
          .set('pageSize', validSize.toString());
        if (activeCompanyId > 0) {
          params = params.set('companyId', activeCompanyId.toString()).set('CompanyId', activeCompanyId.toString());
        }
        if (description?.trim()) {
          const term = description.trim();
          params = params.set('description', term).set('barcode', term);
        }
        const res: any = await firstValueFrom(this.http.get<any>(`${this.baseUrl}/product`, { params }));
        let rawList: ProductDto[] = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : (res?.data?.items || []));
        if (activeCompanyId > 0) {
          rawList = rawList.filter((p: any) => {
            const pCid = p.companyId ?? p.CompanyId;
            return pCid == null || Number(pCid) === 0 || Number(pCid) === activeCompanyId;
          });
        }
        return {
          success: true,
          data: {
            items: rawList,
            pageSize: validSize,
            pageCount: 1,
            totalItemCount: rawList.length,
            total: rawList.length,
            page: pageNumber,
          },
        };
      } catch {
        return {
          success: false,
          data: {
            items: [],
            pageSize: validSize,
            pageCount: 1,
            totalItemCount: 0,
            total: 0,
            page: pageNumber,
          },
        };
      }
    }
  }

  /**
   * Obtener detalle de un producto por ID:
   * GET /v1/product/{id}
   */
  async getProduct(id: number): Promise<ApiResponse<ProductDto>> {
    const activeCompanyId = Number(getCompanyId()) || 0;
    try {
      const url = `${this.baseUrl}/product/${id}`;
      const res: any = await firstValueFrom(this.http.get<any>(url));
      const data = res?.data ?? res?.Data ?? res;
      if (data && activeCompanyId > 0) {
        const pCid = data.companyId ?? data.CompanyId;
        if (pCid != null && Number(pCid) > 0 && Number(pCid) !== activeCompanyId) {
          return { success: false, data: null as any, message: 'Producto no pertenece a la empresa activa.' };
        }
      }
      return { success: true, data };
    } catch {
      const url2 = `${this.baseUrl}/Product/${id}`;
      const res2: any = await firstValueFrom(this.http.get<any>(url2));
      const data2 = res2?.data ?? res2?.Data ?? res2;
      if (data2 && activeCompanyId > 0) {
        const pCid = data2.companyId ?? data2.CompanyId;
        if (pCid != null && Number(pCid) > 0 && Number(pCid) !== activeCompanyId) {
          return { success: false, data: null as any, message: 'Producto no pertenece a la empresa activa.' };
        }
      }
      return { success: true, data: data2 };
    }
  }

  /**
   * Búsqueda rápida por descripción o código:
   * GET /v1/product/search?description=arroz
   */
  async searchProducts(description: string): Promise<ApiResponse<ProductDto[]>> {
    const term = (description || '').trim();
    const activeCompanyId = Number(getCompanyId()) || 0;
    if (term) {
      try {
        const url = `${this.baseUrl}/product/search`;
        let params = new HttpParams().set('description', term).set('barcode', term);
        if (activeCompanyId > 0) {
          params = params.set('companyId', activeCompanyId.toString()).set('CompanyId', activeCompanyId.toString());
        }
        const res: any = await firstValueFrom(this.http.get<any>(url, { params }));
        let list: ProductDto[] = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.Data)
          ? res.Data
          : Array.isArray(res)
          ? res
          : (res?.data?.items || res?.Data?.Items || []);

        if (activeCompanyId > 0 && list.length > 0) {
          list = list.filter((p: any) => {
            const pCid = p.companyId ?? p.CompanyId;
            return pCid == null || Number(pCid) === 0 || Number(pCid) === activeCompanyId;
          });
        }

        if (list.length > 0) {
          return { success: true, data: list };
        }
      } catch {
        // Fallback to getPagedProducts
      }
    }
    const paged = await this.getPagedProducts(1, 100, term || undefined);
    return { success: true, data: paged.data?.items || [] };
  }

  /**
   * Obtener productos de tipo servicio:
   * GET /v1/product/services
   */
  async getServices(): Promise<ApiResponse<ProductDto[]>> {
    const activeCompanyId = Number(getCompanyId()) || 0;
    try {
      const url = `${this.baseUrl}/product/services`;
      let params = new HttpParams();
      if (activeCompanyId > 0) {
        params = params.set('companyId', activeCompanyId.toString()).set('CompanyId', activeCompanyId.toString());
      }
      const res: any = await firstValueFrom(this.http.get<any>(url, { params }));
      let list: ProductDto[] = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      if (activeCompanyId > 0 && list.length > 0) {
        list = list.filter((p: any) => {
          const pCid = p.companyId ?? p.CompanyId;
          return pCid == null || Number(pCid) === 0 || Number(pCid) === activeCompanyId;
        });
      }
      return { success: true, data: list };
    } catch {
      return { success: true, data: [] };
    }
  }

  /**
   * Crear nuevo producto:
   * POST /v1/product
   */
  async createProduct(product: ProductDto): Promise<ApiResponse<ProductDto>> {
    const url = `${this.baseUrl}/product`;
    const activeCompanyId = Number(getCompanyId()) || 0;
    const resolvedCompanyId = activeCompanyId > 0 ? activeCompanyId : (product.companyId && product.companyId > 0 ? product.companyId : 0);
    const payload = {
      ...product,
      ...(resolvedCompanyId > 0 ? { companyId: resolvedCompanyId } : {}),
    };
    return firstValueFrom(this.http.post<ApiResponse<ProductDto>>(url, payload));
  }

  /**
   * Actualizar producto existente:
   * PUT /v1/product
   */
  async updateProduct(product: ProductDto): Promise<ApiResponse<any>> {
    const url = `${this.baseUrl}/product`;
    const activeCompanyId = Number(getCompanyId()) || 0;
    const resolvedCompanyId = activeCompanyId > 0 ? activeCompanyId : (product.companyId && product.companyId > 0 ? product.companyId : 0);
    const payload = {
      ...product,
      ...(resolvedCompanyId > 0 ? { companyId: resolvedCompanyId } : {}),
    };
    return firstValueFrom(this.http.put<ApiResponse<any>>(url, payload));
  }

  /**
   * Eliminar producto:
   * DELETE /v1/product/{id}
   */
  async deleteProduct(id: number): Promise<ApiResponse<any>> {
    const url = `${this.baseUrl}/product/${id}`;
    return firstValueFrom(this.http.delete<ApiResponse<any>>(url));
  }

  /**
   * Obtiene los catálogos de plantillas precargadas consumiendo el endpoint del backend
   * con fallback asíncrono a asset desacoplado, evitando data hardcodeada en el frontend.
   */
  async getPreloadedCatalogs(): Promise<ApiResponse<PreloadedCatalog[]>> {
    // Consultar exclusivamente el endpoint del backend / DB del sistema
    try {
      const url = `${this.baseUrl}/product/catalogs/preloaded`;
      const res: any = await firstValueFrom(this.http.get<any>(url));
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      return { success: true, data: list };
    } catch {
      return { success: true, data: [] };
    }
  }
}

export interface PreloadedCatalog {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  color: string;
  items: {
    description: string;
    barcode: string;
    reference: string;
    category: string;
    cost: number;
    price: number;
    stock: number;
    minQuantity: number;
  }[];
}
