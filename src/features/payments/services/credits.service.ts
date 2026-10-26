import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class CreditsService {
  private readonly api = inject(ApiClientService);

  async getCredits(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<any[]>> {
    const res = await this.api.get<any, any>('/api/Credits', { params });
    return { success: true, data: extractArray<any>(res) };
  }

  async getCredit(id: number): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>(`/api/Credits/${id}`);
    return { success: true, data: res };
  }

  async createCredit(creditData: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/api/Credits', creditData);
    return { success: true, data: res };
  }

  async patchPayment(id: number, paymentData: any): Promise<ApiResponse<any>> {
    const res = await this.api.patch<any, any>(`/api/Credits/${id}/payments`, paymentData);
    return { success: true, data: res };
  }

  async patchStatus(id: number, statusData: any): Promise<ApiResponse<any>> {
    const res = await this.api.patch<any, any>(`/api/Credits/${id}/status`, statusData);
    return { success: true, data: res };
  }
}
