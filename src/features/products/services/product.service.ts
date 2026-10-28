import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ProductDto, ApiResponse, PagedResult } from '../../cuadreEnv/types/api';
import { ApiClientService, getCompanyId } from '../../cuadreEnv/services/apiClient';

export interface ProductFilters {
  description?: string;
  minCost?: number;
  maxCost?: number;
  excludeServices?: boolean;
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
  private readonly api = inject(ApiClientService);
  private readonly baseUrl =
    (environment.apiUrl || 'http://localhost:8080').replace(/\/v1\/?$/, '').replace(/\/$/, '') + '/v1';
  private readonly PHOTO_STORAGE_KEY = 'cuadreenv_product_photos_v1';
  private readonly METRICS_STORAGE_KEY = 'cuadreEnv_product_cost_metrics_v1';

  isServiceItem(p: any): boolean {
    if (!p) return false;
    if (p.isService === true || p.type === 'service' || p.type === 'Servicio') return true;
    if (p.productTypeId === 2 || p.ProductTypeId === 2) return true;
    if (p.invoiceWithoutStock === true) return true;
    const ref = String(p.barcode || p.reference || '').toUpperCase().trim();
    if (ref.startsWith('SERV-') || ref.startsWith('SERV')) return true;
    const typeName = String(p.productTypeName || p.productType?.name || '').toLowerCase();
    if (typeName.includes('serv')) return true;
    const catName = String(p.categoryName || p.category?.name || '').toLowerCase();
    if (catName.includes('serv')) return true;
    return false;
  }

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

        // Excluir servicios si se solicita (para catálogos que son estrictamente de productos tangibles)
        if (filters?.excludeServices) {
          const beforeCount = items.length;
          items = items.filter((p: any) => !this.isServiceItem(p));
          if (items.length < beforeCount) {
            total = items.length;
          }
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
    excludeServices = false,
  ): Promise<ApiResponse<PagedProductsResponse>> {
    const validSize = Math.min(100, Math.max(1, pageSize || 10));
    const activeCompanyId = Number(getCompanyId()) || 0;
    try {
      return await firstValueFrom(
        this.getPagedProducts$(pageNumber, validSize, {
          description,
          minCost,
          maxCost,
          excludeServices,
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
        if (excludeServices) {
          rawList = rawList.filter((p) => !this.isServiceItem(p));
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
   * Limpia y normaliza el payload del producto para cumplir con el esquema estricto del backend ASP.NET Core:
   * Evita enviar claves con valor undefined, strings vacíos para fechas, o claves de metadatos locales (imageUrl, hasPackaging).
   */
  private sanitizeProductPayload(product: ProductDto): any {
    const activeCompanyId = Number(getCompanyId()) || 0;
    const resolvedCompanyId = activeCompanyId > 0 ? activeCompanyId : (product.companyId && product.companyId > 0 ? product.companyId : 0);

    const cost = Number(product.cost) || 0;
    const price = Number(product.price) || (cost > 0 ? Math.round(cost * 1.35 * 100) / 100 : 0);

    const clean: Record<string, any> = {
      description: String(product.description || '').trim(),
      cost: cost,
      price: price,
      stock: Number(product.stock) || 0,
      productTypeId: Number(product.productTypeId) || 1,
      categoryId: Number(product.categoryId) || 1,
      unitOfMeasurementId: Number(product.unitOfMeasurementId) || 1,
      minimumQuantity: Number(product.minimumQuantity) || 0,
      maximumQuantity: Number(product.maximumQuantity) || 0,
      invoiceWithoutStock: Boolean(product.invoiceWithoutStock),
      allowFractional: Boolean(product.allowFractional),
      isOrganic: Boolean(product.isOrganic),
    };

    if (product.id != null && Number(product.id) > 0) {
      clean['id'] = Number(product.id);
    }
    if (resolvedCompanyId > 0) {
      clean['companyId'] = resolvedCompanyId;
    }
    if (product.barcode && String(product.barcode).trim()) {
      clean['barcode'] = String(product.barcode).trim();
    }
    if (product.reference && String(product.reference).trim()) {
      clean['reference'] = String(product.reference).trim();
    }
    if (product.shortDescription && String(product.shortDescription).trim()) {
      clean['shortDescription'] = String(product.shortDescription).trim();
    }
    if (product.expirationDate && String(product.expirationDate).trim()) {
      clean['expirationDate'] = String(product.expirationDate).trim();
    }

    return clean;
  }

  /**
   * Crear nuevo producto:
   * POST /v1/product con fallback a /v1/Product
   */
  async createProduct(product: ProductDto): Promise<ApiResponse<ProductDto>> {
    const payload = this.sanitizeProductPayload(product);
    try {
      const url = `${this.baseUrl}/product`;
      return await firstValueFrom(this.http.post<ApiResponse<ProductDto>>(url, payload));
    } catch (err: any) {
      // Fallback a PascalCase si el router del backend es sensible a mayúsculas
      if (err?.status === 404 || err?.status === 400) {
        try {
          const url2 = `${this.baseUrl}/Product`;
          return await firstValueFrom(this.http.post<ApiResponse<ProductDto>>(url2, payload));
        } catch {
          // Relanzar el error original con los datos de validación
          throw err;
        }
      }
      throw err;
    }
  }

  /**
   * Actualizar producto existente:
   * PUT /v1/product con fallback a /v1/Product
   */
  async updateProduct(product: ProductDto): Promise<ApiResponse<any>> {
    const payload = this.sanitizeProductPayload(product);
    try {
      const url = `${this.baseUrl}/product`;
      return await firstValueFrom(this.http.put<ApiResponse<any>>(url, payload));
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 400) {
        try {
          const url2 = `${this.baseUrl}/Product`;
          return await firstValueFrom(this.http.put<ApiResponse<any>>(url2, payload));
        } catch {
          throw err;
        }
      }
      throw err;
    }
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
