export type QuotationStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'CONVERTED' | 'EXPIRED';

export interface QuotationDetailDto {
  id: number;
  quotationId: number;
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  itbisRate: number;
  itbisAmount: number;
  subtotal: number;
  total: number;
  notes?: string;
}

export interface QuotationDto {
  id: number;
  quotationNumber: string;
  customerId: number;
  customerName: string;
  customerRnc?: string;
  customerEmail?: string;
  customerPhone?: string;
  sellerId?: number;
  sellerName?: string;
  issueDate: string;
  expirationDate: string;
  paymentCondition: string;
  notes?: string;
  status: QuotationStatus;
  subtotal: number;
  discountAmount: number;
  itbisAmount: number;
  total: number;
  totalUnits: number;
  totalItems: number;
  convertedSaleId?: number;
  convertedSaleCode?: string;
  convertedAt?: string;
  details: QuotationDetailDto[];
  createdAt: string;
}

export interface CreateQuotationDetailDto {
  productId: number;
  productCode?: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  discountRate?: number;
  itbisRate?: number;
  notes?: string;
}

export interface CreateQuotationDto {
  customerId: number;
  customerName?: string;
  customerRnc?: string;
  customerEmail?: string;
  customerPhone?: string;
  sellerId?: number;
  sellerName?: string;
  issueDate: string;
  expirationDate: string;
  paymentCondition: string;
  notes?: string;
  status?: QuotationStatus;
  details: CreateQuotationDetailDto[];
}

export interface QuotationSummaryKpiDto {
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  convertedCount: number;
  expiredCount: number;
  draftCount: number;
}

export interface QuotationListResponseDto {
  items: QuotationDto[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
  kpis: QuotationSummaryKpiDto;
}
