import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class ProductTypeService {
  private readonly api = inject(ApiClientService);

  async getProductTypes(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<any[]>> {
    const res = await this.api.get<any, any>('/ProductType', { params });
    return { success: true, data: extractArray<any>(res) };
  }

  async getPagedProductTypes(pageNumber: number, pageSize: number): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>('/ProductType', {
      params: { pageNumber, pageSize }
    });
    return { success: true, data: res };
  }

  async getProductType(id: number): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>(`/ProductType/${id}`);
    return { success: true, data: res };
  }

  async createProductType(data: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/ProductType', data);
    return { success: true, data: res };
  }

  async updateProductType(data: any): Promise<ApiResponse<any>> {
    const res = await this.api.put<any, any>('/ProductType', data);
    return { success: true, data: res };
  }

  async deleteProductType(id: number): Promise<void> {
    await this.api.delete(`/ProductType/${id}`);
  }
}
