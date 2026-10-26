import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class ReturnService {
  private readonly api = inject(ApiClientService);

  async getReturns(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<any[]>> {
    const res = await this.api.get<any, any>('/Return', { params });
    return { success: true, data: extractArray<any>(res) };
  }

  async getReturn(id: number): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>(`/Return/${id}`);
    return { success: true, data: res };
  }

  async createReturn(data: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/Return', data);
    return { success: true, data: res };
  }

  async updateReturn(data: any): Promise<void> {
    await this.api.put('/Return', data);
  }

  async deleteReturn(id: number): Promise<void> {
    await this.api.delete(`/Return/${id}`);
  }
}
