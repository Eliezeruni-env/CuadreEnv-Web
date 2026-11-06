import { Injectable, inject } from '@angular/core';
import {
  ApiClientService,
  extractArray,
} from '../../cuadreEnv/services/apiClient';
import type {
  WarehouseDto,
  MovementDto,
  MovementRequestDto,
  TransferRequestDto,
  ProductDto,
  ApiResponse,
} from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly api = inject(ApiClientService);
  private lastWarehousesFetch = 0;
  private cachedWarehouses: ApiResponse<WarehouseDto[]> | null = null;
  private inFlightWarehouses: Promise<ApiResponse<WarehouseDto[]>> | null = null;
  private readonly WAREHOUSES_TTL = 15000;

  // Warehouses
  async getWarehouses(params?: {
    pageNumber?: number;
    pageSize?: number;
  }, forceRefresh = false): Promise<ApiResponse<WarehouseDto[]>> {
    const now = Date.now();
    if (!forceRefresh && this.cachedWarehouses && now - this.lastWarehousesFetch < this.WAREHOUSES_TTL) {
      return this.cachedWarehouses;
    }
    if (this.inFlightWarehouses) {
      return this.inFlightWarehouses;
    }

    this.inFlightWarehouses = (async () => {
      try {
        const res = await this.api.get<any, any>('/warehouse', { params });
        const list = extractArray<WarehouseDto>(res) || [];
        const result: ApiResponse<WarehouseDto[]> = { success: true, data: list };
        this.lastWarehousesFetch = Date.now();
        this.cachedWarehouses = result;
        return result;
      } catch {
        const fallback: ApiResponse<WarehouseDto[]> = { success: true, data: [] };
        this.lastWarehousesFetch = Date.now();
        this.cachedWarehouses = fallback;
        return fallback;
      } finally {
        this.inFlightWarehouses = null;
      }
    })();

    return this.inFlightWarehouses;
  }

  async createWarehouse(name: string): Promise<ApiResponse<WarehouseDto>> {
    const res = await this.api.post<any, any>('/warehouse', { name });
    return { success: true, data: res as WarehouseDto };
  }

  async addWarehouseStock(dto: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/warehouse/stock/add', dto);
    return { success: true, data: res };
  }

  async removeWarehouseStock(dto: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/warehouse/stock/remove', dto);
    return { success: true, data: res };
  }

  async transferWarehouseStock(dto: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/warehouse/stock/transfer', dto);
    return { success: true, data: res };
  }

  // Inventory operations
  async addStock(dto: MovementRequestDto): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/inventory/inbound', dto);
    return { success: true, data: res };
  }

  async removeStock(dto: MovementRequestDto): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/inventory/outbound', dto);
    return { success: true, data: res };
  }

  async transferStock(dto: TransferRequestDto): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/inventory/transfer', dto);
    return { success: true, data: res };
  }

  async getLowStock(): Promise<ApiResponse<ProductDto[]>> {
    try {
      const res = await this.api.get<any, any>('/inventory/low-stock');
      return { success: true, data: extractArray<ProductDto>(res) };
    } catch {
      return { success: true, data: [] };
    }
  }

  private readonly MOVEMENTS_STORAGE_KEY = 'cuadreEnv_inventory_movements';

  private getLocalMovements(): MovementDto[] {
    try {
      const raw = localStorage.getItem(this.MOVEMENTS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return [];
  }

  private saveLocalMovements(list: MovementDto[]) {
    try {
      localStorage.setItem(this.MOVEMENTS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  async getMovements(params?: {
    productId?: number;
    warehouseId?: number;
    from?: string;
    to?: string;
    type?: string;
  }): Promise<ApiResponse<MovementDto[]>> {
    try {
      const res = await this.api.get<any, any>('/inventory/movements', {
        params,
      });
      const data = extractArray<MovementDto>(res);
      return { success: true, data: data || [] };
    } catch {
      // Try fallback endpoint
      try {
        const res2 = await this.api.get<any, any>('/v1/inventory/movements', { params });
        const data2 = extractArray<MovementDto>(res2);
        return { success: true, data: data2 || [] };
      } catch {
        return { success: false, data: [], message: 'No se pudo conectar con el servidor.' };
      }
    }
  }

  async getAuditMovements(): Promise<ApiResponse<MovementDto[]>> {
    try {
      const movements = await this.getMovements();
      if (movements.success && movements.data) {
        return movements;
      }
    } catch {
      // Graceful fallback
    }
    return { success: true, data: this.getLocalMovements() };
  }
}
