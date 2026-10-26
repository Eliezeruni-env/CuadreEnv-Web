import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class SupplierService {
  private readonly api = inject(ApiClientService);

  async getSuppliers(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<any[]>> {
    try {
      const res = await this.api.get<any, any>('/Supplier', { params });
      return { success: true, data: extractArray<any>(res) };
    } catch {
      return { success: true, data: [] };
    }
  }

  async getSupplier(id: number): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>(`/Supplier/${id}`);
    return { success: true, data: res };
  }

  async createSupplier(data: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/Supplier', data);
    return { success: true, data: res };
  }

  async updateSupplier(data: any): Promise<void> {
    await this.api.put('/Supplier', data);
  }

  async deleteSupplier(id: number): Promise<void> {
    await this.api.delete(`/Supplier/${id}`);
  }
}
