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
  async getCustomers(params?: {
    pageNumber?: number;
    pageSize?: number;
    search?: string;
  }): Promise<ApiResponse<CustomerDto[]>> {
    const validParams = {
      ...params,
      pageSize: params?.pageSize ? Math.min(100, Math.max(1, params.pageSize)) : 100,
    };
    try {
      const res = await this.api.get<any, any>('/Customer', { params: validParams });
      const items = extractArray<CustomerDto>(res);
      return { success: true, data: items };
    } catch (err: any) {
      if (err?.status === 404) {
        try {
          const res2 = await this.api.get<any, any>('/customers', { params: validParams });
          return { success: true, data: extractArray<CustomerDto>(res2) };
        } catch {
          // Fallback failed
        }
      }
      return { success: true, data: [] };
    }
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
