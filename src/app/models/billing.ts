import type { ProductDetails } from './product-details';
export type { ProductDetails } from './product-details';

export interface HeaderDto {
  clientId: number;
  clientName?: string;
  billingTypeId: number; // Contado (1) o Crédito (2)
  voucherTypeId: number; // Consumidor Final, Crédito Fiscal (NCF), etc.
  warehouseId: number;
  rncOrCedula?: string;
  paymentTermDays?: number;
  retentionItbisPercentage?: number; // 0, 30, 100
  retentionIsrPercentage?: number;   // 0, 2, 10
  applyLegalTip?: boolean;           // 10% Propina Legal Ley 16-92
}

export interface TotalModels {
  totalItbis: number;
  totalDiscount: number;
  subtotalAmount: number;
  totalAmount: number;
  legalTipAmount?: number;
  retentionItbisAmount?: number;
  retentionIsrAmount?: number;
  netPayableAmount?: number;
}

export interface Billing {
  id?: number;
  prefix?: string; // ej. 'FAC'
  billingNumber?: string;
  creationDate: Date | string;
  clientId: number;
  clientName?: string;
  clientRnc?: string;
  billingTypeId: number;
  billingTypeName?: string;
  voucherTypeId: number;
  voucherTypeName?: string;
  ncf?: string;
  warehouseId?: number;
  statusId: number;
  amountSubTotal: number;
  amountDesc: number;
  amountItbis: number;
  amountTotal: number;
  legalTipAmount?: number;
  retentionItbisAmount?: number;
  retentionIsrAmount?: number;
  netPayableAmount?: number;
  hasAFullCreditNote?: boolean;
  showDetail?: boolean; // Control UI para expandir fila
  productDetails: ProductDetails[];
  details?: ProductDetails[]; // Compatibilidad
  cashSessionId?: number;
  paymentMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED' | string;
  notes?: string;
}
