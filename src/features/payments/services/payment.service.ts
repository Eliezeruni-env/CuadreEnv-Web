import { Injectable, inject } from '@angular/core';
import {
  ApiClientService,
  extractArray,
  getCompanyId,
} from '../../cuadreEnv/services/apiClient';
import type { PaymentDto, ApiResponse } from '../../cuadreEnv/types/api';

const PAYMENTS_STORAGE_KEY_BASE = 'cuadreenv_payments_db';

function getPaymentsStorageKey(): string {
  const compId = getCompanyId();
  return compId ? `${PAYMENTS_STORAGE_KEY_BASE}_${compId}` : `${PAYMENTS_STORAGE_KEY_BASE}_none`;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly api = inject(ApiClientService);

  getLocalPayments(): PaymentDto[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = localStorage.getItem(getPaymentsStorageKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveLocalPayments(list: PaymentDto[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(getPaymentsStorageKey(), JSON.stringify(list));
    } catch {}
  }

  async getPayments(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaymentDto[]>> {
    try {
      const res = await this.api.get<any, any>('/Payment', { params });
      const list = extractArray<PaymentDto>(res);
      if (list && list.length > 0) {
        this.saveLocalPayments(list);
        return { success: true, data: list };
      }
    } catch {}
    return { success: true, data: this.getLocalPayments() };
  }

  async getPayment(id: number): Promise<ApiResponse<PaymentDto>> {
    try {
      const res = await this.api.get<any, any>(`/Payment/${id}`);
      return { success: true, data: (res?.data ?? res) as PaymentDto };
    } catch {
      const local = this.getLocalPayments().find((p) => p.id === id);
      if (local) return { success: true, data: local };
    }
    return { success: false, message: 'Pago no encontrado.' };
  }

  async createPayment(payment: PaymentDto): Promise<ApiResponse<PaymentDto>> {
    const compId = getCompanyId();
    const newId = payment.id || Date.now();
    const fullPayment: PaymentDto = {
      ...payment,
      id: newId,
      creationDate: payment.creationDate || new Date().toISOString(),
    };

    try {
      const payload = { ...fullPayment, companyId: compId ? Number(compId) : undefined };
      const res = await this.api.post<any, any>('/Payment', payload);
      const created = (res?.data ?? res) as PaymentDto;
      const finalPayment = { ...fullPayment, ...(created || {}) };
      
      const local = this.getLocalPayments();
      local.unshift(finalPayment);
      this.saveLocalPayments(local);
      return { success: true, data: finalPayment };
    } catch {
      // Local fallback
      const local = this.getLocalPayments();
      local.unshift(fullPayment);
      this.saveLocalPayments(local);
      return { success: true, data: fullPayment };
    }
  }

  async updatePayment(payment: PaymentDto): Promise<void> {
    try {
      await this.api.put('/Payment', payment);
    } catch {}
    const local = this.getLocalPayments().map((p) => (p.id === payment.id ? { ...p, ...payment } : p));
    this.saveLocalPayments(local);
  }

  async deletePayment(id: number): Promise<void> {
    try {
      await this.api.delete(`/Payment/${id}`);
    } catch {}
    const local = this.getLocalPayments().filter((p) => p.id !== id);
    this.saveLocalPayments(local);
  }
}
