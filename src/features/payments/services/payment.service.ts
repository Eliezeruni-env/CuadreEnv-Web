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

  private mergeWithLocalPayments(remoteItems: PaymentDto[]): PaymentDto[] {
    const local = this.getLocalPayments();
    const result = [...remoteItems];
    for (const loc of local) {
      const exists = result.some(
        (r) =>
          (r.id && loc.id && r.id === loc.id) ||
          (r.purchaseId &&
            loc.purchaseId &&
            r.purchaseId === loc.purchaseId &&
            Math.abs((r.amount || 0) - (loc.amount || 0)) < 0.01 &&
            r.reference === loc.reference),
      );
      if (!exists) {
        result.unshift(loc);
      }
    }
    return result;
  }

  async getPayments(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaymentDto[]>> {
    try {
      const res = await this.api.get<any, any>('/Payment', { params });
      let list = extractArray<PaymentDto>(res);
      list = this.mergeWithLocalPayments(list);
      this.saveLocalPayments(list);
      return { success: true, data: list };
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

    const pmStr = String(payment.method || 'Efectivo');
    const pmUpper = pmStr.toUpperCase();
    const methodInt = pmUpper.includes('TRANS')
      ? 1
      : pmUpper.includes('TARJ') || pmUpper.includes('CARD')
      ? 2
      : pmUpper.includes('CHEQ') || pmUpper.includes('CHECK')
      ? 3
      : 0;

    const payload: any = {
      amount: Number(payment.amount),
      method: methodInt,
      paymentMethod: methodInt,
      methodName: payment.method || 'Efectivo',
      reference: payment.reference || '',
      notes: (payment as any).notes || payment.reference || '',
      date: fullPayment.creationDate,
    };
    if (payment.purchaseId) {
      payload.purchaseId = Number(payment.purchaseId);
    }
    if (payment.saleId) {
      payload.saleId = Number(payment.saleId);
    }
    if (compId) {
      payload.companyId = Number(compId);
    }

    try {
      const res = await this.api.post<any, any>('/Payment', payload);
      const created = (res?.data ?? res) as PaymentDto;
      const finalPayment = {
        ...fullPayment,
        ...(created || {}),
        id: created?.id || fullPayment.id,
      };

      const local = this.getLocalPayments();
      local.unshift(finalPayment);
      this.saveLocalPayments(local);
      this.syncPaymentWithPurchase(finalPayment);
      return { success: true, data: finalPayment };
    } catch (apiErr) {
      console.warn('API /Payment fallback, persisting payment locally:', apiErr);
      const local = this.getLocalPayments();
      local.unshift(fullPayment);
      this.saveLocalPayments(local);
      this.syncPaymentWithPurchase(fullPayment);
      return { success: true, data: fullPayment };
    }
  }

  private syncPaymentWithPurchase(payment: PaymentDto): void {
    if (!payment.purchaseId || typeof window === 'undefined' || !window.localStorage) return;
    try {
      // 1. Update purchase in Purchases cache
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cuadreenv_purchases_db')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const list: any[] = JSON.parse(raw);
              const p = list.find((it) => it.id === payment.purchaseId);
              if (p) {
                p.paidAmount = Math.round(((p.paidAmount || 0) + payment.amount) * 100) / 100;
                if (p.paidAmount >= (p.total || 0) - 0.01) {
                  p.status = 'PAID';
                  p.paymentStatus = 'PAID';
                }
                localStorage.setItem(k, JSON.stringify(list));
              }
            } catch {}
          }
        }
      }

      // 2. Update in Purchase Orders cache as well
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cuadreenv_purchase_orders_db')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const list: any[] = JSON.parse(raw);
              const po = list.find((it) => it.id === payment.purchaseId);
              if (po) {
                po.paidAmount = Math.round(((po.paidAmount || 0) + payment.amount) * 100) / 100;
                if (po.paidAmount >= (po.total || 0) - 0.01) {
                  po.paymentStatus = 'PAID';
                  po.status = 'PAID';
                }
                localStorage.setItem(k, JSON.stringify(list));
              }
            } catch {}
          }
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cuadre_payment_registered', { detail: payment }),
        );
      }
    } catch (e) {
      console.warn('Could not sync payment with purchase record:', e);
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
