import { Injectable, inject } from '@angular/core';
import {
  ApiClientService,
  extractArray,
} from '../../cuadreEnv/services/apiClient';
import type { CustomerDto, ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class CustomerService {
  private readonly api = inject(ApiClientService);
  private inFlightMap = new Map<string, Promise<ApiResponse<CustomerDto[]>>>();
  private cacheMap = new Map<string, { time: number; data: ApiResponse<CustomerDto[]> }>();
  private readonly CACHE_TTL = 10000;

  async getCustomers(params?: {
    pageNumber?: number;
    pageSize?: number;
    search?: string;
  }, forceRefresh = false): Promise<ApiResponse<CustomerDto[]>> {
    const validParams = {
      ...params,
      pageSize: params?.pageSize ? Math.min(100, Math.max(1, params.pageSize)) : 100,
    };
    const key = JSON.stringify(validParams);
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.cacheMap.get(key);
      if (cached && now - cached.time < this.CACHE_TTL) {
        return cached.data;
      }
    }

    if (this.inFlightMap.has(key)) {
      return this.inFlightMap.get(key)!;
    }

    const promise = (async () => {
      try {
        const res = await this.api.get<any, any>('/Customer', { params: validParams });
        const items = extractArray<CustomerDto>(res);
        const result: ApiResponse<CustomerDto[]> = { success: true, data: items };
        this.cacheMap.set(key, { time: Date.now(), data: result });
        return result;
      } catch (err: any) {
        if (err?.status === 404) {
          try {
            const res2 = await this.api.get<any, any>('/customers', { params: validParams });
            const fallback: ApiResponse<CustomerDto[]> = { success: true, data: extractArray<CustomerDto>(res2) };
            this.cacheMap.set(key, { time: Date.now(), data: fallback });
            return fallback;
          } catch {}
        }
        const empty: ApiResponse<CustomerDto[]> = { success: true, data: [] };
        this.cacheMap.set(key, { time: Date.now(), data: empty });
        return empty;
      } finally {
        this.inFlightMap.delete(key);
      }
    })();

    this.inFlightMap.set(key, promise);
    return promise;
  }

  async getActiveCustomers(days?: number): Promise<ApiResponse<CustomerDto[]>> {
    try {
      const res = await this.api.get<any, any>('/Customer/active', {
        params: days !== undefined ? { days } : undefined,
      });
      return { success: true, data: extractArray<CustomerDto>(res) };
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/customers/active', {
          params: days !== undefined ? { days } : undefined,
        });
        return { success: true, data: extractArray<CustomerDto>(res2) };
      } catch {
        return { success: true, data: [] };
      }
    }
  }

  async getCustomer(id: number): Promise<ApiResponse<CustomerDto>> {
    try {
      const res = await this.api.get<any, any>(`/Customer/${id}`);
      return { success: true, data: (res?.data ?? res) as CustomerDto };
    } catch {
      try {
        const res2 = await this.api.get<any, any>(`/customers/${id}`);
        return { success: true, data: (res2?.data ?? res2) as CustomerDto };
      } catch {
        return { success: false, message: 'Cliente no encontrado' };
      }
    }
  }

  async createCustomer(
    customer: CustomerDto,
  ): Promise<ApiResponse<CustomerDto>> {
    const res = await this.api.post<any, any>('/Customer', customer);
    return { success: true, data: res as CustomerDto };
  }

  async updateCustomer(customer: CustomerDto): Promise<void> {
    await this.api.put('/Customer', customer);
  }

  async deleteCustomer(id: number): Promise<void> {
    await this.api.delete(`/Customer/${id}`);
  }
}
