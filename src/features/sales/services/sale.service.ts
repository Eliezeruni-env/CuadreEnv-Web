import { Injectable, inject } from '@angular/core';
import {
  ApiClientService,
  extractArray,
  getCompanyId,
} from '../../cuadreEnv/services/apiClient';
import type {
  SaleRequestDto,
  SaleResponseDto,
  ApiResponse,
  SendInvoiceEmailRequest,
} from '../../cuadreEnv/types/api';

const SALES_STORAGE_KEY_BASE = 'cuadreenv_local_sales_cache';
export function getSalesStorageKey(): string {
  const compId = getCompanyId() || 'default';
  return `${SALES_STORAGE_KEY_BASE}_${compId}`;
}

@Injectable({
  providedIn: 'root',
})
export class SaleService {
  private readonly api: ApiClientService;

  constructor(api?: ApiClientService) {
    this.api = api ?? inject(ApiClientService, { optional: true })!;
  }

  getLocalSales(): SaleResponseDto[] {
    const list: SaleResponseDto[] = [];
    const seen = new Set<string>();

    const checkAndAdd = (arr: any[]) => {
      if (!Array.isArray(arr)) return;
      for (const item of arr) {
        if (!item) continue;
        const key = `${item.id ?? ''}_${item.invoiceNumber ?? item.invoiceFolio ?? item.billingNumber ?? ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      }
    };

    try {
      if (typeof localStorage !== 'undefined') {
        // 1. Scoped company key
        const currentKey = getSalesStorageKey();
        const rawCurrent = localStorage.getItem(currentKey);
        if (rawCurrent) {
          try { checkAndAdd(JSON.parse(rawCurrent)); } catch {}
        }

        // 2. Global unscoped cache keys
        const rawBase = localStorage.getItem(SALES_STORAGE_KEY_BASE);
        if (rawBase) {
          try { checkAndAdd(JSON.parse(rawBase)); } catch {}
        }

        const rawOld = localStorage.getItem('cuadreenv_local_sales');
        if (rawOld) {
          try { checkAndAdd(JSON.parse(rawOld)); } catch {}
        }

        const rawDefault = localStorage.getItem(`${SALES_STORAGE_KEY_BASE}_default`);
        if (rawDefault) {
          try { checkAndAdd(JSON.parse(rawDefault)); } catch {}
        }

        const rawOne = localStorage.getItem(`${SALES_STORAGE_KEY_BASE}_1`);
        if (rawOne) {
          try { checkAndAdd(JSON.parse(rawOne)); } catch {}
        }

        // 3. Scan all keys in localStorage for local sales or billing invoices
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;

          if (k.startsWith('cuadreenv_local_sales') || k.startsWith('cuadreenv_sales')) {
            try {
              const val = localStorage.getItem(k);
              if (val) checkAndAdd(JSON.parse(val));
            } catch {}
          } else if (k.startsWith('cuadreenv_billing_invoices_db')) {
            try {
              const val = localStorage.getItem(k);
              if (val) {
                const billings = JSON.parse(val);
                if (Array.isArray(billings)) {
                  for (const b of billings) {
                    const bKey = `${b.id ?? ''}_${b.billingNumber ?? b.invoiceNumber ?? ''}`;
                    if (!seen.has(bKey)) {
                      seen.add(bKey);
                      list.push({
                        id: b.id || Date.now(),
                        total: Number(b.amountTotal || b.total || 0),
                        paidAmount: Number(b.amountTotal || b.total || 0),
                        creationDate: b.creationDate || new Date().toISOString(),
                        customerId: b.clientId || b.customerId,
                        customerName: b.clientName || b.customerName || 'Consumidor Final',
                        invoiceNumber: b.billingNumber || b.ncf || `FAC-${b.id}`,
                        isCancelled: b.statusId === 3 || b.hasAFullCreditNote === true,
                        details: (b.productDetails || b.details || []).map((d: any) => ({
                          productId: d.productId || d.id || 1,
                          productName: d.productName || d.description || 'Producto',
                          productCode: d.barCode || d.barcode || `PROD-${d.productId || 1}`,
                          quantity: Number(d.quantity || 1),
                          unitPrice: Number(d.price || d.unitPrice || 0),
                          total: Number(d.totalAmount || (Number(d.quantity || 1) * Number(d.price || 0))),
                        })),
                        paymentMethod: b.billingTypeName || 'Efectivo',
                        originChannel: 'Facturación Directa',
                      } as any);
                    }
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch {}

    return list;
  }

  saveLocalSale(sale: SaleResponseDto): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const keysToSave = [
        getSalesStorageKey(),
        SALES_STORAGE_KEY_BASE,
        'cuadreenv_local_sales',
      ];

      for (const k of keysToSave) {
        try {
          const raw = localStorage.getItem(k);
          const list: SaleResponseDto[] = raw ? JSON.parse(raw) : [];
          const existingIdx = list.findIndex(
            (s) => s.id === sale.id || (sale.invoiceNumber && s.invoiceNumber === sale.invoiceNumber)
          );
          if (existingIdx >= 0) {
            list[existingIdx] = { ...list[existingIdx], ...sale };
          } else {
            list.unshift(sale);
          }
          localStorage.setItem(k, JSON.stringify(list));
        } catch {}
      }
    } catch (e) {
      console.error('Error saving local sale cache:', e);
    }
  }

  async getSales(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<SaleResponseDto[]>> {
    const validParams = {
      ...params,
      pageSize: params?.pageSize
        ? Math.min(100, Math.max(1, params.pageSize))
        : 100,
    };
    try {
      const res = await this.api.get<any, any>('/Sale', {
        params: validParams,
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      const apiSales = extractArray<SaleResponseDto>(res);
      const localList = this.getLocalSales();

      const merged = [...(apiSales || [])];
      for (const s of merged) {
        const locMatch = localList.find(
          (l) => l.id === s.id || (s.invoiceNumber && l.invoiceNumber === s.invoiceNumber)
        );
        if (locMatch) {
          if (!s.originChannel && locMatch.originChannel) {
            s.originChannel = locMatch.originChannel;
          }
          if (!s.notes && locMatch.notes) {
            s.notes = locMatch.notes;
          }
          if (!s.invoiceNumber && locMatch.invoiceNumber) {
            s.invoiceNumber = locMatch.invoiceNumber;
          }
          if (
            (!s.details || s.details.length === 0) &&
            locMatch.details &&
            locMatch.details.length > 0
          ) {
            s.details = locMatch.details;
          }
        }
      }
      for (const loc of localList) {
        if (!merged.some((m) => m.id === loc.id || (loc.invoiceNumber && m.invoiceNumber === loc.invoiceNumber))) {
          merged.unshift(loc);
        }
      }
      return { success: true, data: merged };
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/sales', {
          params: validParams,
          headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
        });
        const apiSales2 = extractArray<SaleResponseDto>(res2);
        const localList = this.getLocalSales();
        const merged2 = [...(apiSales2 || [])];
        for (const s of merged2) {
          const locMatch = localList.find((l) => l.id === s.id);
          if (locMatch) {
            if (!s.originChannel && locMatch.originChannel) s.originChannel = locMatch.originChannel;
            if (!s.notes && locMatch.notes) s.notes = locMatch.notes;
            if (!s.invoiceNumber && locMatch.invoiceNumber) s.invoiceNumber = locMatch.invoiceNumber;
            if ((!s.details || s.details.length === 0) && locMatch.details?.length) {
              s.details = locMatch.details;
            }
          }
        }
        for (const loc of localList) {
          if (!merged2.some((m) => m.id === loc.id)) {
            merged2.unshift(loc);
          }
        }
        return { success: true, data: merged2 };
      } catch {
        // Fallback to local storage sales cache
      }
      const localFallback = this.getLocalSales();
      return { success: true, data: localFallback };
    }
  }

  async getSale(id: number): Promise<ApiResponse<SaleResponseDto>> {
    try {
      const res = await this.api.get<any, any>(`/Sale/${id}`);
      const sale = (res?.data ?? res?.Data ?? res) as SaleResponseDto;
      if (sale && (!sale.details || sale.details.length === 0)) {
        const localMatch = this.getLocalSales().find((s) => s.id === id);
        if (localMatch?.details && localMatch.details.length > 0) {
          sale.details = localMatch.details;
        }
      }
      return { success: true, data: sale };
    } catch {
      try {
        const res2 = await this.api.get<any, any>(`/sales/${id}`);
        const sale2 = (res2?.data ?? res2?.Data ?? res2) as SaleResponseDto;
        if (sale2 && (!sale2.details || sale2.details.length === 0)) {
          const localMatch = this.getLocalSales().find((s) => s.id === id);
          if (localMatch?.details && localMatch.details.length > 0) {
            sale2.details = localMatch.details;
          }
        }
        return { success: true, data: sale2 };
      } catch {
        const localMatch = this.getLocalSales().find((s) => s.id === id);
        if (localMatch) {
          return { success: true, data: localMatch };
        }
        return {
          success: false,
          message: 'Venta no encontrada en el servidor.',
        };
      }
    }
  }

  async createSale(
    sale: SaleRequestDto,
  ): Promise<ApiResponse<SaleResponseDto>> {
    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });

    let createdSale: SaleResponseDto | null = null;

    try {
      // 1. Direct transaccional /Sale endpoint con Idempotency-Key
      const res = await this.api.post<any, any>('/Sale', sale, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });
      createdSale = (res?.data || res) as SaleResponseDto;
    } catch (err: any) {
      // Fallback a /caja/sales si la API tiene rutas unificadas de caja
      try {
        const cajaRes = await this.api.post<any, any>(
          '/caja/sales',
          {
            idempotencyKey,
            customerId: sale.customerId || null,
            cashRegisterId: sale.cashRegisterId || 1,
            date: new Date().toISOString(),
            createBy: 'system',
            items: (sale.details || []).map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
            })),
          },
          {
            headers: { 'X-Idempotency-Key': idempotencyKey },
          },
        );
        createdSale = (cajaRes?.data || cajaRes) as SaleResponseDto;
      } catch (cajaErr: any) {
        // Propagar el error oficial de la API (ej. stock insuficiente, caja cerrada, etc.)
        throw err?.mappedError || err?.error ? err : cajaErr;
      }
    }

    if (!createdSale) {
      throw new Error('No se pudo registrar la venta en el servidor.');
    }

    const isMobileDevice =
      typeof window !== 'undefined' &&
      ((sale as any).isMobile === true ||
        (sale as any).originChannel === 'MOBILE' ||
        (sale as any).originChannel === 'MOBILE_POS' ||
        window.innerWidth <= 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent || '',
        ));

    if (isMobileDevice) {
      createdSale.isMobile = true;
      if (
        !createdSale.originChannel ||
        createdSale.originChannel === 'POS_PRESENCIAL'
      ) {
        createdSale.originChannel = 'MOBILE_POS';
      }
    }

    if (!createdSale.originChannel && (sale as any).originChannel) {
      createdSale.originChannel = (sale as any).originChannel;
    }
    if (!createdSale.notes && (sale as any).notes) {
      createdSale.notes = (sale as any).notes;
    }
    if (!createdSale.invoiceNumber && (sale as any).invoiceNumber) {
      createdSale.invoiceNumber = (sale as any).invoiceNumber;
    }
    if (
      (!createdSale.details || createdSale.details.length === 0) &&
      sale.details &&
      sale.details.length > 0
    ) {
      createdSale.details = sale.details.map((d: any) => ({
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        productName: d.productName,
        productCode: d.productCode,
        isService: d.isService,
        total: (d.quantity || 1) * (d.unitPrice || 0),
      }));
    }

    this.saveLocalSale(createdSale);

    return {
      success: true,
      data: createdSale,
      message: 'Venta registrada exitosamente.',
    };
  }

  async updateSale(sale: SaleResponseDto): Promise<void> {
    try {
      await this.api.put<any, any>('/Sale', sale);
    } catch {
      // local cache
    }
    this.saveLocalSale(sale);
  }

  async deleteSale(id: number): Promise<void> {
    try {
      await this.api.delete<any, any>(`/Sale/${id}`);
    } catch {
      // local cache
    }
    const list = this.getLocalSales().filter((s) => s.id !== id);
    localStorage.setItem(getSalesStorageKey(), JSON.stringify(list));
  }

  async addPayment(
    saleId: number,
    amount: number,
    reference: string,
  ): Promise<void> {
    await this.api.post<any, any>(`/Sale/${saleId}/payments`, {
      amount,
      reference,
    });
  }

  async cancelSale(saleId: number, reason: string): Promise<void> {
    await this.api.post<any, any>(`/Sale/${saleId}/cancel`, { reason });
    try {
      const list = this.getLocalSales();
      const target = list.find((s) => s.id === saleId);
      if (target) {
        target.isCancelled = true;
        (target as any).cancellationReason = reason;
        localStorage.setItem(getSalesStorageKey(), JSON.stringify(list));
      }
    } catch {
      // ignore
    }
  }

  async sendInvoiceEmail(
    saleId: number | string,
    request: SendInvoiceEmailRequest,
  ): Promise<any> {
    return await this.api.post<SendInvoiceEmailRequest, any>(
      `/Sale/${saleId}/send-email`,
      request,
    );
  }
}
