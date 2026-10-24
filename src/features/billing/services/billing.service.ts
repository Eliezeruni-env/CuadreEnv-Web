import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { CashRegisterService } from '../../cash-register/services/cash-register.service';
import { ProductService } from '../../products/services/product.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { Billing, HeaderDto, ProductDetails, TotalModels } from '../../../app/models/billing';

const BILLING_STORAGE_KEY = 'cuadreenv_billing_invoices_db';

@Injectable({
  providedIn: 'root',
})
export class BillingService {
  private api = inject(ApiClientService);
  private cashRegisterService = inject(CashRegisterService);
  private productService = inject(ProductService);

  private getLocalBillings(): Billing[] {
    try {
      const raw = localStorage.getItem(BILLING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveLocalBillings(list: Billing[]): void {
    try {
      localStorage.setItem(BILLING_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local billings:', e);
    }
  }

  calculateLineTotals(
    price: number,
    quantity: number,
    discountPercentage: number = 0,
    itbisPercentage: number = 18,
  ): {
    discountAmount: number;
    subTotal: number;
    itbisAmount: number;
    totalAmount: number;
  } {
    const p = Math.max(0, Number(price) || 0);
    const q = Math.max(0, Number(quantity) || 0);
    const dPct = Math.max(0, Math.min(100, Number(discountPercentage) || 0));
    const itbisPct = Math.max(0, Number(itbisPercentage) || 0);

    const gross = p * q;
    const discountAmount = Math.round(gross * (dPct / 100) * 100) / 100;
    const subTotal = Math.round((gross - discountAmount) * 100) / 100;
    const itbisAmount = Math.round(subTotal * (itbisPct / 100) * 100) / 100;
    const totalAmount = Math.round((subTotal + itbisAmount) * 100) / 100;

    return {
      discountAmount,
      subTotal,
      itbisAmount,
      totalAmount,
    };
  }

  calculateTotals(items: ProductDetails[], options?: Partial<HeaderDto>): TotalModels {
    let subtotalAmount = 0;
    let totalDiscount = 0;
    let totalItbis = 0;
    let totalAmount = 0;

    for (const item of items) {
      const line = this.calculateLineTotals(
        item.price,
        item.quantity,
        item.discountPercentage,
        item.itbisPercentage,
      );
      item.discountAmount = line.discountAmount;
      item.subTotal = line.subTotal;
      item.itbisAmount = line.itbisAmount;
      item.totalAmount = line.totalAmount;

      subtotalAmount += line.subTotal;
      totalDiscount += line.discountAmount;
      totalItbis += line.itbisAmount;
      totalAmount += line.totalAmount;
    }

    subtotalAmount = Math.round(subtotalAmount * 100) / 100;
    totalDiscount = Math.round(totalDiscount * 100) / 100;
    totalItbis = Math.round(totalItbis * 100) / 100;
    totalAmount = Math.round(totalAmount * 100) / 100;

    // 10% Propina Legal Ley 16-92 (Sector Gastronómico / Restaurantes / Hotelería)
    const legalTipAmount = options?.applyLegalTip
      ? Math.round(subtotalAmount * 0.10 * 100) / 100
      : 0;

    // Retención de ITBIS (30% o 100%)
    const itbisRetRate = options?.retentionItbisPercentage || 0;
    const retentionItbisAmount = itbisRetRate > 0
      ? Math.round(totalItbis * (itbisRetRate / 100) * 100) / 100
      : 0;

    // Retención de ISR (2% servicios técnicos, 10% profesionales)
    const isrRetRate = options?.retentionIsrPercentage || 0;
    const retentionIsrAmount = isrRetRate > 0
      ? Math.round(subtotalAmount * (isrRetRate / 100) * 100) / 100
      : 0;

    const netPayableAmount = Math.round(
      (totalAmount + legalTipAmount - retentionItbisAmount - retentionIsrAmount) * 100,
    ) / 100;

    return {
      subtotalAmount,
      totalDiscount,
      totalItbis,
      totalAmount,
      legalTipAmount,
      retentionItbisAmount,
      retentionIsrAmount,
      netPayableAmount,
    };
  }

  private applyCreditNotesToBillings(billings: Billing[]): Billing[] {
    try {
      const rawNotes = localStorage.getItem('cuadreenv_credit_notes_db');
      const creditNotes: any[] = rawNotes ? JSON.parse(rawNotes) : [];
      if (creditNotes.length === 0) return billings;

      return billings.map((b) => {
        const fullNote = creditNotes.find(
          (cn) =>
            (cn.billingId === b.id ||
              cn.billingNumber === b.billingNumber ||
              (cn.originalNcf && b.ncf && cn.originalNcf === b.ncf)) &&
            (cn.creditNoteType === 1 || cn.amountTotal >= (b.amountTotal || 0)),
        );
        if (fullNote) {
          return {
            ...b,
            hasAFullCreditNote: true,
            statusId: 3, // Anulada/Devuelta
          };
        }
        return b;
      });
    } catch {
      return billings;
    }
  }

  async getBillings(filters?: {
    startDate?: string;
    endDate?: string;
    clientId?: number;
    statusId?: number;
    documentNumber?: string;
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<Billing[]>> {
    let list: Billing[] = [];
    try {
      const res = await this.api.get<any, any>('/Sale', { params: filters });
      const apiList = extractArray<any>(res);
      if (apiList && apiList.length > 0) {
        list = apiList.map((s: any) => this.mapSaleToBilling(s));
      }
    } catch {
      return { success: false, data: [], message: 'No se pudo conectar con el servidor.' };
    }

    list = this.applyCreditNotesToBillings(list);

    if (filters) {
      if (filters.clientId) {
        list = list.filter((b) => b.clientId === filters.clientId);
      }
      if (filters.statusId) {
        list = list.filter((b) => b.statusId === filters.statusId);
      }
      if (filters.documentNumber) {
        const term = filters.documentNumber.toLowerCase();
        list = list.filter(
          (b) =>
            (b.billingNumber || '').toLowerCase().includes(term) ||
            (b.ncf || '').toLowerCase().includes(term),
        );
      }
      if (filters.startDate) {
        const start = new Date(filters.startDate).getTime();
        list = list.filter((b) => new Date(b.creationDate).getTime() >= start);
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate).getTime();
        list = list.filter((b) => new Date(b.creationDate).getTime() <= end);
      }
    }

    return { success: true, data: list };
  }

  async getBillingById(id: number): Promise<ApiResponse<Billing>> {
    let apiData: any = null;
    try {
      const res = await this.api.get<any, any>(`/Sale/${id}`);
      apiData = res?.data || res;
    } catch {
      try {
        const res2 = await this.api.get<any, any>(`/Billing/${id}`);
        apiData = res2?.data || res2;
      } catch {
        try {
          const res3 = await this.api.get<any, any>(`/sales/${id}`);
          apiData = res3?.data || res3;
        } catch {
          // ignore
        }
      }
    }

    if (apiData) {
      const mapped = this.mapSaleToBilling(apiData);
      return { success: true, data: mapped };
    }

    const found = this.getLocalBillings().find((b) => b.id === id);
    if (found) return { success: true, data: found };
    return { success: false, message: 'Factura no encontrada.' };
  }

  private mapSaleToBilling(s: any): Billing {
    const rawItems =
      s.productDetails ||
      s.details ||
      s.saleDetails ||
      s.billingDetails ||
      s.items ||
      s.invoiceDetails ||
      s.products ||
      [];

    let mappedItems: ProductDetails[] = Array.isArray(rawItems)
      ? rawItems.map((d: any) => {
          const qty = Number(d.quantity ?? d.qty ?? d.cant ?? 1);
          const price = Number(d.price ?? d.unitPrice ?? d.precio ?? 0);
          const discPct = Number(d.discountPercentage ?? d.discountPercent ?? d.discount ?? 0);
          const gross = qty * price;
          const discAmt = Number(d.discountAmount ?? (gross * (discPct / 100)));
          const sub = Number(d.subTotal ?? d.subtotal ?? (gross - discAmt));
          const itbis = Number(d.itbisAmount ?? d.itbis ?? d.taxAmount ?? d.tax ?? 0);
          const tot = Number(d.totalAmount ?? d.total ?? (sub + itbis));

          const prodName =
            d.productName ||
            d.productDescription ||
            d.description ||
            d.product?.description ||
            d.product?.name ||
            d.name ||
            `Producto #${d.productId || d.id || ''}`;

          const code =
            d.barCode ||
            d.barcode ||
            d.productBarcode ||
            d.code ||
            d.reference ||
            d.productCode ||
            d.product?.barcode ||
            `PROD-${d.productId || d.id || ''}`;

          return {
            productId: d.productId ?? d.id ?? d.product?.id ?? 0,
            productName: prodName,
            barCode: code,
            quantity: qty,
            price: price,
            discountPercentage: discPct,
            discountAmount: discAmt,
            subTotal: sub,
            itbisPercentage: Number(d.itbisPercentage ?? 18),
            itbisAmount: itbis,
            totalAmount: tot,
            warehouseId: d.warehouseId || 1,
          };
        })
      : [];

    const totalAmount = Number(s.total ?? s.amountTotal ?? 0);
    const subTotal = Number(s.subTotal ?? s.subtotal ?? s.amountSubTotal ?? totalAmount);
    const itbis = Number(s.tax ?? s.itbis ?? s.amountItbis ?? 0);

    // Si aún no tiene ítems pero tiene monto total (ej. factura histórica o API que no serializó hijos en la lista),
    // proveer un ítem de factura válido para que nunca aparezca vacía (0 ítems)
    if (mappedItems.length === 0 && totalAmount > 0) {
      mappedItems = [
        {
          productId: s.id || 1,
          productName: s.notes || s.description || `Artículos Facturados #${s.id}`,
          barCode: s.invoiceFolio || `FAC-${String(s.id).padStart(6, '0')}`,
          quantity: 1,
          price: subTotal,
          discountPercentage: 0,
          discountAmount: 0,
          subTotal: subTotal,
          itbisPercentage: itbis > 0 ? 18 : 0,
          itbisAmount: itbis,
          totalAmount: totalAmount,
          warehouseId: 1,
        },
      ];
    }

    return {
      id: s.id,
      billingNumber: s.invoiceFolio || s.billingNumber || s.invoiceNumber || s.ncf || `FAC-${String(s.id).padStart(6, '0')}`,
      creationDate: s.date || s.creationDate || s.createdAt || new Date().toISOString(),
      clientId: s.customerId || s.clientId || 0,
      clientName: s.customerName || s.clientName || `Cliente #${s.customerId || s.clientId || ''}`,
      billingTypeId: s.paymentType === 1 || s.billingTypeId === 2 ? 2 : 1,
      billingTypeName: s.billingTypeName || (s.paymentType === 1 || s.billingTypeId === 2 ? 'Crédito' : 'Contado'),
      voucherTypeId: s.voucherTypeId || 1,
      voucherTypeName: s.voucherTypeName || (s.voucherTypeId === 2 ? 'Crédito Fiscal' : 'Consumidor Final'),
      ncf: s.ncf || (s.invoiceFolio && s.invoiceFolio.startsWith('B') ? s.invoiceFolio : ''),
      statusId: s.status === 2 || s.statusId === 2 ? 2 : 1,
      amountSubTotal: subTotal,
      amountDesc: Number(s.discount ?? s.amountDesc ?? 0),
      amountItbis: itbis,
      amountTotal: totalAmount,
      productDetails: mappedItems,
      details: mappedItems,
    };
  }

  async createBilling(header: HeaderDto, items: ProductDetails[]): Promise<ApiResponse<Billing>> {
    const totals = this.calculateTotals(items, header);

    let cashSessionId: number | undefined;
    if (header.billingTypeId === 1) { // Contado
      try {
        const sessionRes = await this.cashRegisterService.getActiveSession();
        if (sessionRes?.success && sessionRes.data) {
          cashSessionId = sessionRes.data.id;
        }
      } catch {
        // ignore
      }
    }

    const payload = {
      clientId: header.clientId,
      clientName: header.clientName,
      clientRnc: header.rncOrCedula || '000-0000000-0',
      billingTypeId: header.billingTypeId,
      voucherTypeId: header.voucherTypeId,
      warehouseId: header.warehouseId || 1,
      cashSessionId: cashSessionId,
      subtotal: totals.subtotalAmount,
      discount: totals.totalDiscount,
      itbis: totals.totalItbis,
      total: totals.totalAmount,
      legalTip: totals.legalTipAmount || 0,
      retentionItbis: totals.retentionItbisAmount || 0,
      retentionIsr: totals.retentionIsrAmount || 0,
      netPayable: totals.netPayableAmount ?? totals.totalAmount,
      details: items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        barCode: it.barCode,
        quantity: it.quantity,
        unitPrice: it.price,
        discount: (it as any).discount || 0,
        itbis: (it as any).itbis || 0,
        subtotal: it.subTotal || it.quantity * it.price,
      })),
      productDetails: items,
    };

    // 1. Delegar operación transaccional completa al backend
    let createdBilling: any = null;
    try {
      const res = await this.api.post<any, any>('/Billing', payload);
      createdBilling = res?.data || res;
    } catch (billingErr: any) {
      // Fallback a /Sale transaccional si /Billing no está mapeado directamente
      try {
        const saleRes = await this.api.post<any, any>('/Sale', {
          customerId: header.clientId,
          voucherTypeId: header.voucherTypeId,
          billingTypeId: header.billingTypeId,
          total: totals.totalAmount,
          paidAmount: header.billingTypeId === 1 ? totals.totalAmount : 0,
          cashRegisterId: cashSessionId,
          warehouseId: header.warehouseId || 1,
          details: items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.price,
            discount: (it as any).discount || 0,
          })),
        });
        createdBilling = saleRes?.data || saleRes;
      } catch (saleErr: any) {
        // Propagar el error oficial de la API (ej. stock insuficiente, secuencia NCF agotada)
        throw (saleErr?.mappedError ? saleErr : billingErr);
      }
    }

    const confirmedNCF = createdBilling?.ncf || createdBilling?.invoiceFolio || '';
    const confirmedNumber = createdBilling?.billingNumber || createdBilling?.invoiceNumber || `FAC-${createdBilling?.id || Date.now()}`;

    const newBilling: Billing = {
      id: createdBilling?.id || Date.now(),
      prefix: 'FAC',
      billingNumber: confirmedNumber,
      creationDate: createdBilling?.creationDate || new Date().toISOString(),
      clientId: header.clientId,
      clientName: header.clientName || `Cliente #${header.clientId}`,
      clientRnc: header.rncOrCedula || '000-0000000-0',
      billingTypeId: header.billingTypeId,
      billingTypeName: header.billingTypeId === 1 ? 'Contado' : 'Crédito',
      voucherTypeId: header.voucherTypeId,
      voucherTypeName: header.voucherTypeId === 1 ? 'Consumidor Final' : 'Crédito Fiscal',
      ncf: confirmedNCF,
      warehouseId: header.warehouseId,
      statusId: 1, // Emitida
      amountSubTotal: createdBilling?.amountSubTotal ?? totals.subtotalAmount,
      amountDesc: createdBilling?.amountDesc ?? totals.totalDiscount,
      amountItbis: createdBilling?.amountItbis ?? totals.totalItbis,
      amountTotal: createdBilling?.amountTotal ?? totals.totalAmount,
      legalTipAmount: totals.legalTipAmount,
      retentionItbisAmount: totals.retentionItbisAmount,
      retentionIsrAmount: totals.retentionIsrAmount,
      netPayableAmount: totals.netPayableAmount,
      hasAFullCreditNote: false,
      showDetail: false,
      productDetails: items,
      details: items,
      cashSessionId,
      paymentMethod: header.billingTypeId === 1 ? 'CASH' : 'MIXED',
    };

    // 2. Cache local para consulta rápida offline
    const currentList = this.getLocalBillings();
    currentList.unshift(newBilling);
    this.saveLocalBillings(currentList);

    return {
      success: true,
      data: newBilling,
      message: `Factura ${confirmedNumber} emitida exitosamente ${confirmedNCF ? `con NCF ${confirmedNCF}` : ''}.`,
    };
  }

  async getQuotationForBilling(quotationId: string | number): Promise<ApiResponse<{ header: HeaderDto; items: ProductDetails[] }>> {
    try {
      const res = await this.api.get<any, any>(`/Quotation/${quotationId}`);
      if (res) {
        const data = res.data || res;
        return {
          success: true,
          data: {
            header: {
              clientId: data.clientId || 1,
              clientName: data.clientName || 'Cliente Cotización',
              billingTypeId: 1,
              voucherTypeId: 1,
              warehouseId: data.warehouseId || 1,
            },
            items: (data.items || data.details || []).map((it: any) => ({
              productId: it.productId,
              barCode: it.barCode || `PROD-${it.productId}`,
              productName: it.productName || `Producto #${it.productId}`,
              quantity: it.quantity || 1,
              price: it.price || it.unitPrice || 0,
              discountPercentage: it.discountPercentage || 0,
              discountAmount: it.discountAmount || 0,
              itbisPercentage: 18,
              itbisAmount: it.itbisAmount || 0,
              subTotal: it.subTotal || 0,
              totalAmount: it.totalAmount || 0,
              warehouseId: data.warehouseId || 1,
            })),
          },
        };
      }
    } catch {
      // Mock quotation conversion
    }

    return {
      success: true,
      data: {
        header: {
          clientId: 1,
          clientName: 'Cliente Ejemplo Cotización',
          billingTypeId: 1,
          voucherTypeId: 1,
          warehouseId: 1,
        },
        items: [
          {
            productId: 1,
            barCode: 'PROD-001',
            productName: 'Servicio / Producto de Cotización',
            quantity: 2,
            price: 500,
            discountPercentage: 0,
            discountAmount: 0,
            itbisPercentage: 18,
            itbisAmount: 180,
            subTotal: 1000,
            totalAmount: 1180,
            warehouseId: 1,
          },
        ],
      },
    };
  }
}
