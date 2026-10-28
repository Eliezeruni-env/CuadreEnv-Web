import { Injectable, inject } from '@angular/core';
import { ProductService } from '../../products/services/product.service';
import { CategoryService } from '../../products/services/category.service';
import { ProductTypeService } from '../../products/services/product-type.service';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import { LoggerService } from '../../cuadreEnv/services/logger.service';
import { ServiceItemDto } from '../models/service-item.model';
import { ProductDto } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class ServiceService {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly productTypeService = inject(ProductTypeService);
  private readonly authService = inject(AuthService);
  private readonly logger = inject(LoggerService);

  private get storageKey(): string {
    const cid = this.authService.companyId() || 'global';
    return `cuadre_services_${cid}`;
  }

  private getCachedServices(): ServiceItemDto[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      this.logger.warn('Error reading cached services from localStorage', 'ServiceService', e);
    }
    return [];
  }

  private setCachedServices(items: ServiceItemDto[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch (e) {
      this.logger.warn('Error persisting cached services to localStorage', 'ServiceService', e);
    }
  }

  /**
   * Retrieves all services for the active company/tenant.
   * Merges backend products flagged as services (SERV- prefix or invoiceWithoutStock) with local tenant cache.
   */
  async getServices(query?: { search?: string; categoryId?: number; activeOnly?: boolean }): Promise<ServiceItemDto[]> {
    const cached = this.getCachedServices();
    let backendServices: ServiceItemDto[] = [];
    const catMap = new Map<number, string>();

    try {
      // 1. Fetch categories for name resolution
      const catRes = await this.categoryService.getCategories();
      const categories = Array.isArray(catRes?.data) ? catRes.data : [];
      categories.forEach((c: any) => {
        if (c.id) {
          const name = c.description || c.name || c.Description || c.Name || '';
          catMap.set(c.id, name);
        }
      });

      // 2. Fetch products including services for the services catalog
      const prodRes = await this.productService.getPagedProducts(1, 200, undefined, undefined, undefined, false);
      const items: ProductDto[] = prodRes.data?.items || [];

      backendServices = items
        .filter((p) => {
          const ref = (p.reference || p.barcode || '').toUpperCase();
          return ref.startsWith('SERV-') || p.productTypeId === 2 || p.invoiceWithoutStock === true;
        })
        .map((p) => {
          const code = p.reference || p.barcode || `SERV-${p.id}`;
          return {
            id: p.id,
            code: code.startsWith('SERV-') ? code : `SERV-${code}`,
            name: p.description || p.shortDescription || 'Servicio Profesional',
            description: (p.shortDescription && p.shortDescription !== p.description) ? p.shortDescription : (p.description || null),
            price: Number(p.cost || 0),
            cost: Number(p.minimumQuantity || 0), // fallback representation
            categoryId: p.categoryId,
            categoryName: p.categoryId ? catMap.get(p.categoryId) : undefined,
            productTypeId: p.productTypeId || 2,
            isActive: true,
            taxRate: 0.18,
            createdAt: (p as any).creationDate || (p as any).createdAt || null,
          };
        });
    } catch (e) {
      this.logger.warn('Failed to load services from backend product endpoint, using cache', 'ServiceService', e);
    }

    // Merge backend services and cached items (avoiding duplicates by id or code)
    const map = new Map<string, ServiceItemDto>();
    for (const b of backendServices) {
      const key = b.id ? `id_${b.id}` : `code_${b.code}`;
      map.set(key, b);
    }
    for (const c of cached) {
      const key = c.id ? `id_${c.id}` : `code_${c.code}`;
      const existing = map.get(key) || {};
      const merged = { ...existing, ...c };
      if (merged.categoryId && catMap.has(merged.categoryId)) {
        merged.categoryName = catMap.get(merged.categoryId);
      }
      map.set(key, merged);
    }

    let result = Array.from(map.values());

    // Apply filtering
    if (query?.search) {
      const q = query.search.toLowerCase().trim();
      result = result.filter(
        (s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q))
      );
    }

    if (query?.categoryId) {
      result = result.filter((s) => s.categoryId === query.categoryId);
    }

    if (query?.activeOnly) {
      result = result.filter((s) => s.isActive);
    }

    return result;
  }

  /**
   * Generates a unique SERV code.
   */
  generateServiceCode(): string {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `SERV-${random}`;
  }

  /**
   * Creates a new service both in backend (as a service product) and tenant cache.
   */
  async createService(dto: Partial<ServiceItemDto>): Promise<ServiceItemDto> {
    const code = (dto.code && dto.code.trim().length > 0)
      ? (dto.code.toUpperCase().startsWith('SERV-') ? dto.code.toUpperCase() : `SERV-${dto.code.toUpperCase()}`)
      : this.generateServiceCode();

    const companyId = this.authService.companyId() || 0;

    // Resolve product type or category if missing
    let resolvedTypeId = dto.productTypeId;
    if (!resolvedTypeId) {
      try {
        const typesRes = await this.productTypeService.getProductTypes();
        const typeItems = Array.isArray(typesRes?.data) ? typesRes.data : [];
        const found = typeItems.find((t: any) =>
          (t.name || t.description || '').toLowerCase().includes('serv')
        );
        resolvedTypeId = found ? found.id : (typeItems[0]?.id || 2);
      } catch {
        resolvedTypeId = 2;
      }
    }

    let categoryName = dto.categoryName;
    if (dto.categoryId && !categoryName) {
      try {
        const cats = await this.categoryService.getCategories();
        const catList = Array.isArray(cats?.data) ? cats.data : [];
        const foundCat = catList.find((c: any) => c.id === dto.categoryId);
        if (foundCat) categoryName = foundCat.description || foundCat.name || foundCat.Description || foundCat.Name;
      } catch {
        // ignore
      }
    }

    const payload: ProductDto = {
      description: dto.name || 'Servicio',
      shortDescription: dto.description || dto.name || 'Servicio',
      cost: Number(dto.price || 0),
      stock: 0,
      invoiceWithoutStock: true,
      barcode: code,
      reference: code,
      minimumQuantity: Number(dto.cost || 0),
      maximumQuantity: 0,
      unitOfMeasurementId: 1,
      companyId: companyId,
      productTypeId: resolvedTypeId,
      categoryId: dto.categoryId,
    };

    let createdId: number | undefined;
    try {
      const res = await this.productService.createProduct(payload);
      if (res?.success && res.data?.id) {
        createdId = res.data.id;
      }
    } catch (e) {
      this.logger.warn('Backend product creation for service yielded notice; preserving in tenant cache', 'ServiceService', e);
    }

    const newService: ServiceItemDto = {
      id: createdId || Date.now(),
      code,
      name: dto.name || 'Servicio',
      description: dto.description,
      price: Number(dto.price || 0),
      cost: Number(dto.cost || 0),
      categoryId: dto.categoryId,
      categoryName,
      productTypeId: resolvedTypeId,
      isActive: dto.isActive !== false,
      taxRate: dto.taxRate ?? 0.18,
      estimatedDuration: dto.estimatedDuration,
      createdAt: new Date().toISOString(),
    };

    // Save to cache
    const cached = this.getCachedServices();
    cached.unshift(newService);
    this.setCachedServices(cached);

    return newService;
  }

  /**
   * Updates an existing service.
   */
  async updateService(id: number, dto: Partial<ServiceItemDto>): Promise<ServiceItemDto> {
    const cached = this.getCachedServices();
    const index = cached.findIndex((s) => s.id === id);

    let categoryName = dto.categoryName;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId) {
        try {
          const cats = await this.categoryService.getCategories();
          const catList = Array.isArray(cats?.data) ? cats.data : [];
          const foundCat = catList.find((c: any) => c.id === dto.categoryId);
          if (foundCat) categoryName = foundCat.description || foundCat.name || foundCat.Description || foundCat.Name;
        } catch {
          // ignore
        }
      } else {
        categoryName = undefined;
      }
    } else if (index >= 0) {
      categoryName = cached[index].categoryName;
    }

    const updated: ServiceItemDto = {
      ...(index >= 0 ? cached[index] : {}),
      ...dto,
      id,
      code: dto.code || (index >= 0 ? cached[index].code : `SERV-${id}`),
      name: dto.name || (index >= 0 ? cached[index].name : 'Servicio'),
      categoryId: dto.categoryId !== undefined ? dto.categoryId : (index >= 0 ? cached[index].categoryId : undefined),
      categoryName: categoryName !== undefined ? categoryName : (index >= 0 ? cached[index].categoryName : undefined),
      price: Number(dto.price !== undefined ? dto.price : (index >= 0 ? cached[index].price : 0)),
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      updatedAt: new Date().toISOString(),
    };

    // Try updating backend product
    try {
      await this.productService.updateProduct({
        id,
        description: updated.name,
        shortDescription: updated.description || updated.name,
        cost: updated.price,
        barcode: updated.code,
        reference: updated.code,
        categoryId: updated.categoryId,
        invoiceWithoutStock: true,
      } as any);
    } catch (e) {
      this.logger.warn(`Could not sync update of service #${id} to backend`, 'ServiceService', e);
    }

    if (index >= 0) {
      cached[index] = updated;
    } else {
      cached.push(updated);
    }
    this.setCachedServices(cached);

    return updated;
  }

  /**
   * Deletes or deactivates a service.
   */
  async deleteService(id: number): Promise<boolean> {
    try {
      await this.productService.deleteProduct(id);
    } catch (e) {
      this.logger.warn(`Could not delete service #${id} from backend`, 'ServiceService', e);
    }

    const cached = this.getCachedServices().filter((s) => s.id !== id);
    this.setCachedServices(cached);
    return true;
  }

  /**
   * Toggles active state of a service.
   */
  async toggleServiceStatus(id: number): Promise<boolean> {
    const cached = this.getCachedServices();
    const item = cached.find((s) => s.id === id);
    if (item) {
      item.isActive = !item.isActive;
      item.updatedAt = new Date().toISOString();
      this.setCachedServices(cached);
      return item.isActive;
    }
    return false;
  }
}
