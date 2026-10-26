import { ProductDetails } from './product-details';

export interface CreditNote {
  id?: number;
  prefix?: string; // ej. 'NC'
  creditNoteNumber?: string;
  billingId: number; // Factura de origen obligatoria
  billingNumber: string; // ej. 'FAC-00123'
  customerId?: number;
  customerName?: string;
  cashSessionId?: number; // Sesión de caja si devuelve efectivo
  statusId: number; // 1: Emitida, 2: Aplicada, 3: Anulada
  creditNoteType: number; // 1: Devolución total, 2: Devolución parcial, 3: Ajuste de precio
  ncf: string; // NCF fiscal de Nota de Crédito (ej. 'B0400000001')
  originalNcf?: string;
  warehouseId?: number;
  amountSubTotal: number;
  amountDesc: number;
  amountItbis: number;
  amountTotal: number;
  creditNoteDetails: ProductDetails[];
  refundMethod?: 'CASH' | 'CREDIT' | 'BALANCE';
  observations?: string;
  creationDate?: string;
}

export interface WarehouseEntry {
  id?: number;
  warehouseId: number;
  creditNoteId?: number;
  concept: string;
  date: string;
  details: {
    productId: number;
    productName: string;
    quantity: number;
  }[];
}
