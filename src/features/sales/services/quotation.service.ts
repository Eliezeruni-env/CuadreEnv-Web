import { Injectable, inject } from '@angular/core';
import { ApiClientService, getCompanyId } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type {
  QuotationDto,
  CreateQuotationDto,
  QuotationSummaryKpiDto,
  QuotationListResponseDto,
  QuotationStatus,
} from '../types/quotation.types';

const QUOTATION_STORAGE_KEY_BASE = 'cuadreenv_local_quotations_cache';
function getQuotationsStorageKey(): string {
  const compId = getCompanyId() || 'default';
  return `${QUOTATION_STORAGE_KEY_BASE}_${compId}`;
}

const SEED_QUOTATIONS: QuotationDto[] = [
  {
    id: 31,
    quotationNumber: 'COT-00031',
    customerId: 101,
    customerName: 'Ferretería El Progreso, S.R.L.',
    customerEmail: 'contacto@elprogreso.com.do',
    customerPhone: '809-555-0199',
    issueDate: '2025-01-22T09:00:00Z',
    expirationDate: '2025-01-29T18:00:00Z',
    paymentCondition: 'Contado',
    notes: 'Cotización especial materiales',
    status: 'SENT',
    subtotal: 7161.02,
    discountAmount: 0,
    itbisAmount: 1288.98,
    total: 8450.00,
    totalUnits: 15,
    totalItems: 3,
    createdAt: '2025-01-22T09:00:00Z',
    details: [
      {
        id: 1,
        quotationId: 31,
        productId: 1,
        productCode: 'TAL-750W',
        productName: 'Taladro Percutor Industrial 750W',
        quantity: 1,
        unitPrice: 4500,
        discountRate: 0,
        discountAmount: 0,
        itbisRate: 18,
        itbisAmount: 810,
        subtotal: 4500,
        total: 5310,
      },
      {
        id: 2,
        quotationId: 31,
        productId: 2,
        productCode: 'BRO-SET',
        productName: 'Juego de Brocas Mixtas 13 pcs',
        quantity: 2,
        unitPrice: 1330.51,
        discountRate: 0,
        discountAmount: 0,
        itbisRate: 18,
        itbisAmount: 478.98,
        subtotal: 2661.02,
        total: 3140,
      },
    ],
  },
  {
    id: 30,
    quotationNumber: 'COT-00030',
    customerId: 102,
    customerName: 'Inversiones Rivas, S.A.',
    customerEmail: 'compras@inversionesrivas.com',
    customerPhone: '809-555-0245',
    issueDate: '2025-01-21T10:30:00Z',
    expirationDate: '2025-01-28T18:00:00Z',
    paymentCondition: 'Crédito 15 días',
    notes: 'Válido por 7 días hábiles',
    status: 'DRAFT',
    subtotal: 4508.47,
    discountAmount: 0,
    itbisAmount: 811.53,
    total: 5320.00,
    totalUnits: 8,
    totalItems: 2,
    createdAt: '2025-01-21T10:30:00Z',
    details: [
      {
        id: 3,
        quotationId: 30,
        productId: 3,
        productCode: 'EXT-10M',
        productName: 'Extensión Eléctrica Uso Rudo 10M',
        quantity: 4,
        unitPrice: 1127.12,
        discountRate: 0,
        discountAmount: 0,
        itbisRate: 18,
        itbisAmount: 811.53,
        subtotal: 4508.47,
        total: 5320,
      },
    ],
  },
  {
    id: 28,
    quotationNumber: 'COT-00028',
    customerId: 103,
    customerName: 'Comercial Duarte, S.R.L.',
    customerEmail: 'ventas@comercialduarte.com',
    customerPhone: '809-555-0377',
    issueDate: '2025-01-20T14:00:00Z',
    expirationDate: '2025-01-27T18:00:00Z',
    paymentCondition: 'Contado',
    notes: 'Equipos de cómputo y accesorios oficina central',
    status: 'APPROVED',
    subtotal: 11000.00,
    discountAmount: 0,
    itbisAmount: 1980.00,
    total: 12980.00,
    totalUnits: 4,
    totalItems: 3,
    createdAt: '2025-01-20T14:00:00Z',
    details: [
      {
        id: 4,
        quotationId: 28,
        productId: 10,
        productCode: 'LAP-LEN-IP3',
        productName: 'Laptop Lenovo IdeaPad 3 (15.6", 8GB RAM, 512GB SSD)',
        quantity: 1,
        unitPrice: 10950.00,
        discountRate: 0,
        discountAmount: 0,
        itbisRate: 0,
        itbisAmount: 0,
        subtotal: 10950.00,
        total: 10950.00,
      },
      {
        id: 5,
        quotationId: 28,
        productId: 11,
        productCode: 'MOU-LOG-M185',
        productName: 'Mouse inalámbrico Logitech M185',
        quantity: 2,
        unitPrice: 650.00,
        discountRate: 0,
        discountAmount: 0,
        itbisRate: 0,
        itbisAmount: 0,
        subtotal: 1300.00,
        total: 1300.00,
      },
      {
        id: 6,
        quotationId: 28,
        productId: 12,
        productCode: 'EST-LAP-15',
        productName: 'Estuche para laptop 15.6"',
        quantity: 1,
        unitPrice: 730.00,
        discountRate: 0,
        discountAmount: 0,
        itbisRate: 0,
        itbisAmount: 0,
        subtotal: 730.00,
        total: 730.00,
      },
    ],
  },
  {
    id: 27,
    quotationNumber: 'COT-00027',
    customerId: 104,
    customerName: 'Distribuidora Metro, S.A.',
    customerEmail: 'logistica@distribuidorametro.do',
    customerPhone: '809-555-0488',
    issueDate: '2025-01-17T11:15:00Z',
    expirationDate: '2025-01-24T18:00:00Z',
    paymentCondition: 'Crédito 30 días',
    notes: 'Convertida en orden de venta VTA-0090',
    status: 'CONVERTED',
    subtotal: 8271.19,
    discountAmount: 0,
    itbisAmount: 1488.81,
    total: 9760.00,
    totalUnits: 10,
    totalItems: 2,
    convertedSaleId: 90,
    convertedSaleCode: 'VTA-0090',
    convertedAt: '2025-01-23T15:20:00Z',
    createdAt: '2025-01-17T11:15:00Z',
    details: [
      {
        id: 7,
        quotationId: 27,
        productId: 20,
        productCode: 'MON-DELL-24',
        productName: 'Monitor Dell 24" IPS Full HD',
        quantity: 2,
        unitPrice: 4880.00,
        discountRate: 0,
        discountAmount: 0,
        itbisRate: 0,
        itbisAmount: 0,
        subtotal: 9760.00,
        total: 9760.00,
      },
    ],
  },
  {
    id: 26,
    quotationNumber: 'COT-00026',
    customerId: 105,
    customerName: 'Suministros del Caribe, S.R.L.',
    customerEmail: 'info@suministroscaribe.com',
    customerPhone: '809-555-0521',
    issueDate: '2025-01-10T16:00:00Z',
    expirationDate: '2025-01-17T18:00:00Z',
    paymentCondition: 'Contado',
    notes: 'Plazo de vigencia concluido',
    status: 'EXPIRED',
    subtotal: 3881.36,
    discountAmount: 0,
    itbisAmount: 698.64,
    total: 4580.00,
    totalUnits: 5,
    totalItems: 1,
    createdAt: '2025-01-10T16:00:00Z',
    details: [
      {
        id: 8,
        quotationId: 26,
        productId: 30,
        productCode: 'PAP-BOND-A4',
        productName: 'Caja Papel Bond A4 5 Resmas',
        quantity: 5,
        unitPrice: 916.00,
        discountRate: 0,
        discountAmount: 0,
        itbisRate: 0,
        itbisAmount: 0,
        subtotal: 4580.00,
        total: 4580.00,
      },
    ],
  },
];

@Injectable({
  providedIn: 'root',
})
export class QuotationService {
  private readonly api: ApiClientService;

  constructor(api?: ApiClientService) {
    this.api = api ?? inject(ApiClientService, { optional: true })!;
  }

  getLocalQuotations(): QuotationDto[] {
    try {
      const raw = localStorage.getItem(getQuotationsStorageKey());
      if (raw) {
        return JSON.parse(raw);
      }
      this.saveAllLocalQuotations(SEED_QUOTATIONS);
      return [...SEED_QUOTATIONS];
    } catch {
      return [...SEED_QUOTATIONS];
    }
  }

  saveAllLocalQuotations(list: QuotationDto[]): void {
    try {
      localStorage.setItem(getQuotationsStorageKey(), JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local quotation cache:', e);
    }
  }

  saveLocalQuotation(item: QuotationDto): void {
    const list = this.getLocalQuotations();
    const idx = list.findIndex((q) => q.id === item.id || q.quotationNumber === item.quotationNumber);
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.unshift(item);
    }
    this.saveAllLocalQuotations(list);
  }

  async getQuotations(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<QuotationListResponseDto> {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 10;
    const queryParams: Record<string, any> = { page, pageSize };
    if (params?.status) queryParams['status'] = params.status;
    if (params?.search) queryParams['search'] = params.search;
    if (params?.fromDate) queryParams['fromDate'] = params.fromDate;
    if (params?.toDate) queryParams['toDate'] = params.toDate;

    try {
      const res = await this.api.get<any, any>('/quotation', { params: queryParams });
      if (res && res.items && Array.isArray(res.items)) {
        return res as QuotationListResponseDto;
      }
    } catch (err) {
      console.warn('API /quotation fallback to local cache:', err);
    }

    // Local filter fallback
    let all = this.getLocalQuotations();
    if (params?.search) {
      const q = params.search.toLowerCase();
      all = all.filter(
        (x) =>
          x.quotationNumber.toLowerCase().includes(q) ||
          x.customerName.toLowerCase().includes(q) ||
          (x.notes && x.notes.toLowerCase().includes(q))
      );
    }
    if (params?.status && params.status !== 'ALL') {
      all = all.filter((x) => x.status.toUpperCase() === params.status?.toUpperCase());
    }

    const totalItems = all.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);
    const kpis = this.computeKpis(this.getLocalQuotations());

    return {
      items,
      totalItems,
      page,
      pageSize,
      totalPages,
      kpis,
    };
  }

  async getQuotationById(id: number): Promise<QuotationDto | null> {
    try {
      const res = await this.api.get<any, any>(`/quotation/${id}`);
      if (res && res.quotationNumber) {
        return res as QuotationDto;
      }
    } catch (err) {
      console.warn(`API /quotation/${id} fallback to local:`, err);
    }

    const local = this.getLocalQuotations().find((q) => q.id === id);
    return local || null;
  }

  async createQuotation(dto: CreateQuotationDto): Promise<{ success: boolean; data?: QuotationDto; message?: string }> {
    try {
      const res = await this.api.post<any, any>('/quotation', dto);
      if (res && (res.id || res.quotationNumber)) {
        this.saveLocalQuotation(res);
        return { success: true, data: res, message: 'Cotización creada exitosamente' };
      }
    } catch (err: any) {
      console.warn('API /quotation POST error, falling back locally:', err);
    }

    // Local creation
    const localList = this.getLocalQuotations();
    const nextSeq = localList.length + 32;
    const seqStr = String(nextSeq).padStart(5, '0');
    const newNum = `COT-${seqStr}`;

    let subtotal = 0;
    let itbis = 0;
    let totalUnits = 0;

    const details = dto.details.map((d, i) => {
      const dSub = d.quantity * d.unitPrice * (1 - (d.discountRate || 0) / 100);
      const dItbis = dSub * ((d.itbisRate || 0) / 100);
      const dTot = dSub + dItbis;
      subtotal += dSub;
      itbis += dItbis;
      totalUnits += d.quantity;

      return {
        id: Date.now() + i,
        quotationId: nextSeq,
        productId: d.productId,
        productCode: d.productCode || `PROD-${d.productId}`,
        productName: d.productName || 'Producto',
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        discountRate: d.discountRate || 0,
        discountAmount: (d.quantity * d.unitPrice * (d.discountRate || 0)) / 100,
        itbisRate: d.itbisRate || 0,
        itbisAmount: dItbis,
        subtotal: dSub,
        total: dTot,
        notes: d.notes,
      };
    });

    const newQuotation: QuotationDto = {
      id: nextSeq,
      quotationNumber: newNum,
      customerId: dto.customerId,
      customerName: dto.customerName || 'Cliente General',
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      sellerId: dto.sellerId,
      sellerName: dto.sellerName,
      issueDate: dto.issueDate || new Date().toISOString(),
      expirationDate: dto.expirationDate || new Date(Date.now() + 7 * 86400000).toISOString(),
      paymentCondition: dto.paymentCondition || 'Contado',
      notes: dto.notes,
      status: (dto.status as QuotationStatus) || 'DRAFT',
      subtotal,
      discountAmount: 0,
      itbisAmount: itbis,
      total: subtotal + itbis,
      totalUnits,
      totalItems: details.length,
      createdAt: new Date().toISOString(),
      details,
    };

    this.saveLocalQuotation(newQuotation);
    return { success: true, data: newQuotation, message: 'Cotización creada exitosamente' };
  }

  async updateStatus(id: number, status: QuotationStatus): Promise<{ success: boolean; message?: string }> {
    try {
      await this.api.put<any, any>(`/quotation/${id}/status`, { status });
    } catch (err) {
      console.warn(`API /quotation/${id}/status error, updating local:`, err);
    }

    const list = this.getLocalQuotations();
    const item = list.find((q) => q.id === id);
    if (item) {
      item.status = status;
      this.saveAllLocalQuotations(list);
    }
    return { success: true, message: `Estado actualizado a ${status}` };
  }

  async convertToSale(id: number): Promise<{ success: boolean; saleId?: number; saleCode?: string; message?: string }> {
    try {
      const res = await this.api.post<any, any>(`/quotation/${id}/convert-to-sale`, {});
      if (res && res.saleId) {
        const list = this.getLocalQuotations();
        const itm = list.find((q) => q.id === id);
        if (itm) {
          itm.status = 'CONVERTED';
          itm.convertedSaleId = res.saleId;
          itm.convertedSaleCode = res.saleCode || `VTA-${res.saleId}`;
          itm.convertedAt = new Date().toISOString();
          this.saveAllLocalQuotations(list);
        }
        return { success: true, saleId: res.saleId, saleCode: res.saleCode, message: 'Cotización convertida en venta exitosamente' };
      }
    } catch (err) {
      console.warn(`API convert-to-sale error, simulating locally:`, err);
    }

    const list = this.getLocalQuotations();
    const itm = list.find((q) => q.id === id);
    if (itm) {
      const fakeSaleId = 91;
      const fakeSaleCode = `VTA-0091`;
      itm.status = 'CONVERTED';
      itm.convertedSaleId = fakeSaleId;
      itm.convertedSaleCode = fakeSaleCode;
      itm.convertedAt = new Date().toISOString();
      this.saveAllLocalQuotations(list);
      return { success: true, saleId: fakeSaleId, saleCode: fakeSaleCode, message: 'Cotización convertida en venta exitosamente' };
    }

    return { success: false, message: 'No se encontró la cotización' };
  }

  private computeKpis(list: QuotationDto[]): QuotationSummaryKpiDto {
    return {
      totalCount: list.length,
      pendingCount: list.filter((x) => x.status === 'SENT' || x.status === 'DRAFT').length,
      approvedCount: list.filter((x) => x.status === 'APPROVED').length,
      convertedCount: list.filter((x) => x.status === 'CONVERTED').length,
      expiredCount: list.filter((x) => x.status === 'EXPIRED').length,
      draftCount: list.filter((x) => x.status === 'DRAFT').length,
    };
  }
}
