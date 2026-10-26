import { Injectable, inject } from '@angular/core';
import {
  ApiClientService,
  extractArray,
} from '../../cuadreEnv/services/apiClient';
import type { PaymentDto, ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly api = inject(ApiClientService);
  async getPayments(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaymentDto[]>> {
    const res = await this.api.get<any, any>('/Payment', { params });
    return { success: true, data: extractArray<PaymentDto>(res) };
  }

  async getPayment(id: number): Promise<ApiResponse<PaymentDto>> {
    const res = await this.api.get<any, any>(`/Payment/${id}`);
    return { success: true, data: res as PaymentDto };
  }

  async createPayment(payment: PaymentDto): Promise<ApiResponse<PaymentDto>> {
    const res = await this.api.post<any, any>('/Payment', payment);
    return { success: true, data: res as PaymentDto };
  }

  async updatePayment(payment: PaymentDto): Promise<void> {
    await this.api.put('/Payment', payment);
  }

  async deletePayment(id: number): Promise<void> {
    await this.api.delete(`/Payment/${id}`);
  }
}
