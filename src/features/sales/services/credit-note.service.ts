import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { SaleService } from './sale.service';
import { CashRegisterService } from '../../cash-register/services/cash-register.service';
import { ProductService } from '../../products/services/product.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { CreditNote, WarehouseEntry } from '../../../app/models/credit-note';
import type { ProductDetails } from '../../../app/models/product-details';
import type { Billing } from '../../../app/models/billing';

const CREDIT_NOTES_STORAGE_KEY = 'cuadreenv_credit_notes_db';
const BILLING_STORAGE_KEY = 'cuadreenv_billing_invoices_db';

@Injectable({
  providedIn: 'root',
})
export class CreditNoteService {
  private api = inject(ApiClientService);
  private saleService = inject(SaleService);
  private cashRegisterService = inject(CashRegisterService);
  private productService = inject(ProductService);

  private getLocalCreditNotes(): CreditNote[] {
    try {
      const raw = localStorage.getItem(CREDIT_NOTES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveLocalCreditNotes(list: CreditNote[]): void {
    try {
      localStorage.setItem(CREDIT_NOTES_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local credit notes:', e);
    }
  }

  private getLocalBillings(): Billing[] {
    try {
      const raw = localStorage.getItem(BILLING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async getCreditNotes(): Promise<ApiResponse<CreditNote[]>> {
    return { success: true, data: this.getLocalCreditNotes() };
  }

  async getCreditNote(id: number): Promise<ApiResponse<CreditNote>> {
    const local = this.getLocalCreditNotes().find((cn) => cn.id === id);
    if (local) return { success: true, data: local };
    return { success: false, message: 'Nota de crédito no encontrada.' };
  }

  async searchInvoiceForCreditNote(invoiceNumberOrId: string): Promise<ApiResponse<{
    saleId: number;
    billingNumber: string;
    clientId: number;
    clientName: string;
    clientRnc?: string;
    originalNcf: string;
    warehouseId: number;
    creationDate: string;
    items: ProductDetails[];
  }>> {
    const clean = invoiceNumberOrId.trim();
    if (!clean) {
      return { success: false, message: 'Ingrese el número de factura a buscar.' };
    }

    // Extract ID if formatted as FAC-00123 or VTA-000123 or 12
    let targetId: number | null = null;
    const match = clean.match(/\d+$/);
    if (match) {
      targetId = parseInt(match[0], 10);
    }

    let foundInvoice: any = null;
    let isFromBillingModule = false;

    // 1. Try search in Billing module (local)
    const localBillings = this.getLocalBillings();
    const matchedBilling = localBillings.find(
      (b) =>
        b.id === targetId ||
        (b.billingNumber && b.billingNumber.toLowerCase() === clean.toLowerCase()) ||
        (b.ncf && b.ncf.toLowerCase() === clean.toLowerCase()) ||
        `FAC-${b.id}`.toLowerCase() === clean.toLowerCase(),
    );

    if (matchedBilling) {
      foundInvoice = matchedBilling;
      isFromBillingModule = true;
    }

    // 2. Try search in Sales POS module
    if (!foundInvoice) {
      try {
        const salesRes = await this.saleService.getSales({ pageNumber: 1, pageSize: 100 });
        if (salesRes?.success && salesRes.data) {
          const matchSale = salesRes.data.find(
            (s) =>
              s.id === targetId ||
              `FAC-${s.id}`.toLowerCase() === clean.toLowerCase() ||
              `VTA-${String(s.id).padStart(6, '0')}`.toLowerCase() === clean.toLowerCase() ||
              `VTA-${s.id}`.toLowerCase() === clean.toLowerCase(),
          );
          if (matchSale) {
            foundInvoice = matchSale;
          }
        }
      } catch (e) {
        console.warn('Error querying sales for credit note:', e);
      }
    }

    // 3. If found Sale, fetch detailed sale if items are empty
    if (foundInvoice && !isFromBillingModule && targetId) {
      try {
        const directRes = await this.saleService.getSale(targetId);
        if (directRes?.success && directRes.data) {
          foundInvoice = { ...foundInvoice, ...directRes.data };
        }
      } catch {
        // ignore
      }
    }

    if (!foundInvoice && targetId) {
      try {
        const directRes = await this.saleService.getSale(targetId);
        if (directRes?.success && directRes.data) {
          foundInvoice = directRes.data;
        }
      } catch {
        // ignore
      }
    }

    if (!foundInvoice) {
      return {
        success: false,
        message: `No se encontró ninguna factura con el identificador "${clean}". Verifique el formato (ej. FAC-00012, VTA-000012 o #12).`,
      };
    }

    // Check existing credit notes for this invoice to calculate max returnable quantities
    const invoiceId = foundInvoice.id || targetId || 1;
    const existingNotes = this.getLocalCreditNotes().filter(
      (n) => n.billingId === invoiceId || n.billingNumber === foundInvoice.billingNumber,
    );

    // Extract raw details
    let rawDetails: any[] =
      foundInvoice.productDetails ||
      foundInvoice.details ||
      foundInvoice.items ||
      foundInvoice.saleDetails ||
      [];

    // If still empty but invoice has total, create default line
    const invTotal = Number(foundInvoice.amountTotal ?? foundInvoice.total ?? 0) || 0;
    if (rawDetails.length === 0 && invTotal > 0) {
      rawDetails = [
        {
          productId: foundInvoice.productId || 1,
          productName: foundInvoice.notes || foundInvoice.description || `Venta / Factura #${invoiceId}`,
          quantity: 1,
          price: invTotal,
          unitPrice: invTotal,
          discountPercentage: 0,
          discountAmount: 0,
          itbisPercentage: 18,
          itbisAmount: Math.round((invTotal - invTotal / 1.18) * 100) / 100,
          subTotal: Math.round((invTotal / 1.18) * 100) / 100,
          totalAmount: invTotal,
        },
      ];
    }

    // Load products list for names if needed
    let catalogProducts: any[] = [];
    try {
      const pRes = await this.productService.getPagedProducts(1, 100);
      if (pRes?.success && pRes.data?.items) {
        catalogProducts = pRes.data.items;
      }
    } catch {
      // ignore
    }

    const items: ProductDetails[] = rawDetails.map((d: any, idx: number) => {
      const pId = Number(d.productId || d.id || idx + 1);
      const catP = catalogProducts.find((p) => p.id === pId);

      const pName =
        d.productName ||
        d.description ||
        d.name ||
        catP?.description ||
        `Producto #${pId}`;

      const qty = Number(d.quantity || 1);
      const price = Number(d.price ?? d.unitPrice ?? (invTotal / Math.max(1, rawDetails.length))) || 0;

      // Calculate previously returned quantity for this product
      const prevReturned = existingNotes.reduce((acc, note) => {
        const itemNote = (note.creditNoteDetails || []).find((it) => it.productId === pId);
        return acc + (itemNote ? Number(itemNote.quantity || 0) : 0);
      }, 0);

      const maxReturn = Math.max(0, qty - prevReturned);

      const discountPerc = Number(d.discountPercentage || 0);
      const discAmt = Math.round(price * qty * (discountPerc / 100) * 100) / 100;
      const sub = Math.round((price * qty - discAmt) * 100) / 100;
      const itbisAmt = Math.round(sub * 0.18 * 100) / 100;
      const tot = Math.round((sub + itbisAmt) * 100) / 100;

      return {
        productId: pId,
        barCode: d.barCode || d.barcode || catP?.barcode || `PROD-${pId}`,
        productName: pName,
        quantity: qty,
        price: price,
        discountPercentage: discountPerc,
        discountAmount: discAmt,
        itbisPercentage: 18,
        itbisAmount: itbisAmt,
        subTotal: sub,
        totalAmount: tot,
        maxReturnQuantity: maxReturn,
        warehouseId: foundInvoice.warehouseId || 1,
      };
    });

    const bNumber =
      foundInvoice.billingNumber ||
      `FAC-${String(invoiceId).padStart(5, '0')}`;
    const ncfCode =
      foundInvoice.ncf ||
      foundInvoice.originalNcf ||
      `B02${String(invoiceId).padStart(8, '0')}`;

    return {
      success: true,
      data: {
        saleId: invoiceId,
        billingNumber: bNumber,
        clientId: foundInvoice.clientId || foundInvoice.customerId || 1,
        clientName: foundInvoice.clientName || foundInvoice.customerName || 'Consumidor final',
        clientRnc: foundInvoice.clientRnc || foundInvoice.customerRnc || '000-0000000-0',
        originalNcf: ncfCode,
        warehouseId: foundInvoice.warehouseId || 1,
        creationDate: foundInvoice.creationDate || foundInvoice.date || new Date().toISOString(),
        items: items,
      },
    };
  }

  async createCreditNote(note: CreditNote): Promise<ApiResponse<CreditNote>> {
    const payload = {
      billingId: note.billingId,
      billingNumber: note.billingNumber,
      originalNcf: note.originalNcf,
      customerId: note.customerId,
      warehouseId: note.warehouseId || 1,
      reason: note.observations || (note as any).reason,
      refundMethod: note.refundMethod,
      voucherTypeId: 3, // B04 Nota de Crédito
      amountSubTotal: note.amountSubTotal,
      amountDesc: note.amountDesc,
      amountItbis: note.amountItbis,
      amountTotal: note.amountTotal,
      creditNoteDetails: note.creditNoteDetails,
      date: new Date().toISOString(),
    };

    let createdNote: any = null;
    try {
      const res = await this.api.post<any, any>('/CreditNote', payload);
      createdNote = res?.data || res;
    } catch (apiErr: any) {
      console.warn('API /CreditNote error:', apiErr);
      throw apiErr;
    }

    const assignedNumber = createdNote?.creditNoteNumber || `NC-${String(createdNote?.id || Date.now()).slice(-6)}`;
    const assignedNCF = createdNote?.ncf || '';

    const newNote: CreditNote = {
      ...note,
      id: createdNote?.id || Date.now(),
      prefix: 'NC',
      creditNoteNumber: assignedNumber,
      ncf: assignedNCF,
      statusId: 1, // Emitida
      creationDate: createdNote?.creationDate || new Date().toISOString(),
    };

    // Cache local de respaldo
    const currentList = this.getLocalCreditNotes();
    currentList.unshift(newNote);
    this.saveLocalCreditNotes(currentList);

    return {
      success: true,
      data: newNote,
      message: `Nota de Crédito ${assignedNumber} ${assignedNCF ? `(NCF: ${assignedNCF})` : ''} procesada exitosamente.`,
    };
  }

  async processWarehouseEntry(entry: WarehouseEntry): Promise<void> {
    try {
      await this.api.post<any, any>('/Warehouse/entry', entry);
    } catch {
      // Update local product inventory if needed
      for (const item of entry.details) {
        try {
          const p = await this.productService.getProduct(item.productId);
          if (p?.success && p.data) {
            await this.productService.updateProduct({
              ...p.data,
              stock: (p.data.stock || 0) + item.quantity,
            });
          }
        } catch {
          // ignore
        }
      }
    }
  }
}
