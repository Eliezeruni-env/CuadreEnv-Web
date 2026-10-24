import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { CustomerService } from '../../customers/services/customer.service';
import { CashRegisterService } from '../../cash-register/services/cash-register.service';
import { WarehouseOutletService } from '../../inventory/services/warehouse-outlet.service';
import type { ApiResponse, CustomerDto, SaleResponseDto } from '../../cuadreEnv/types/api';

export interface PaymentPlanDto {
  installmentAmount: number;
  totalInstallments: number;
  startDate: string;
  frequency: 'Semanal' | 'Quincenal' | 'Mensual' | 'Diaria';
}

export interface PaymentVoucherAttachment {
  name: string;
  type: string;
  dataUrl: string;
  size?: number;
  extractedText?: string | null;
}

export interface PaymentRecordDto {
  id: number;
  amount: number;
  date: string;
  method: string;
  bank?: string | null;
  reference?: string | null;
  notes?: string | null;
  registerInCash?: boolean;
  voucherAttachment?: PaymentVoucherAttachment | null;
  isCurrent?: boolean;
}

export interface ReceivableItemDto {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  barCode?: string;
  cost?: number;
}

export interface ReceivableDto {
  id: number;
  invoiceNumber: string;
  customerId?: number | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerIdentification?: string | null;
  description: string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  downPayment?: number;
  items?: ReceivableItemDto[];
  status: 'Pendiente' | 'Parcial' | 'Pagado' | 'Vencido';
  creationDate: string;
  dueDate?: string | null;
  paymentPlan?: PaymentPlanDto | null;
  payments: PaymentRecordDto[];
  warehouseId?: number | null;
  warehouseName?: string;
  avatarColor: string;
  isReopened?: boolean;
  reopenedDate?: string;
  settledDate?: string;
  active?: boolean;
  isDeleted?: boolean;
}

export interface CreateReceivableDto {
  customerId?: number | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  description: string;
  totalAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  startDate: string;
  frequency: 'Semanal' | 'Quincenal' | 'Mensual' | 'Diaria';
  downPayment?: number;
  deductStock?: boolean;
  warehouseId?: number;
  warehouseName?: string;
  items?: ReceivableItemDto[];
}

const AVATAR_COLORS = [
  { bg: '#ede9fe', color: '#7c3aed' }, // Purple
  { bg: '#dcfce7', color: '#16a34a' }, // Green
  { bg: '#e0f2fe', color: '#0284c7' }, // Blue
  { bg: '#ffedd5', color: '#ea580c' }, // Orange
  { bg: '#fce7f3', color: '#db2777' }, // Pink
  { bg: '#fef3c7', color: '#d97706' }, // Yellow
];

@Injectable({
  providedIn: 'root',
})
export class ReceivableService {
  private readonly api: ApiClientService;
  private readonly customerService: CustomerService;
  private readonly cashRegisterService?: CashRegisterService;
  private readonly warehouseOutletService?: WarehouseOutletService;

  constructor(
    api?: ApiClientService,
    customerService?: CustomerService,
    cashRegisterService?: CashRegisterService,
    warehouseOutletService?: WarehouseOutletService,
  ) {
    if (api) {
      this.api = api;
    } else {
      try {
        this.api = inject(ApiClientService, { optional: true }) as any;
      } catch {
        this.api = undefined as any;
      }
    }

    if (customerService) {
      this.customerService = customerService;
    } else {
      try {
        this.customerService = inject(CustomerService, { optional: true }) as any;
      } catch {
        this.customerService = undefined as any;
      }
    }

    if (cashRegisterService) {
      this.cashRegisterService = cashRegisterService;
    } else {
      try {
        this.cashRegisterService = inject(CashRegisterService, { optional: true }) as any;
      } catch {
        this.cashRegisterService = undefined;
      }
    }

    if (warehouseOutletService) {
      this.warehouseOutletService = warehouseOutletService;
    } else {
      try {
        this.warehouseOutletService = inject(WarehouseOutletService, { optional: true }) as any;
      } catch {
        this.warehouseOutletService = undefined;
      }
    }
  }

  private readonly storageKey = 'cuadre_receivables_store_v1';

  private inMemoryCache: ReceivableDto[] | null = null;

  // Read stored data without fake mock seeds
  private getStoredReceivables(): ReceivableDto[] {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(this.storageKey);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch {
        // ignore
      }
    } else if (this.inMemoryCache) {
      return [...this.inMemoryCache];
    }
    return [];
  }

  private saveStoredReceivables(items: ReceivableDto[]) {
    this.inMemoryCache = [...items];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(items));
      } catch {
        // ignore
      }
    }
  }

  async getReceivables(): Promise<ApiResponse<ReceivableDto[]>> {
    const stored = this.getStoredReceivables();

    // 1. Intentar cargar desde el endpoint oficial de Cuentas por Cobrar (/AccountReceivable)
    try {
      const arRes = await this.api.get<any, any>('/AccountReceivable');
      const arList = extractArray<any>(arRes);
      if (arList && arList.length > 0) {
        for (const ar of arList) {
          const id = ar.id ?? ar.saleId;
          const pending = Math.max(0, (ar.totalAmount || ar.total || 0) - (ar.paidAmount || 0));
          const existing = stored.find((r) => r.id === id);
          const colorIdx = (id || 1) % AVATAR_COLORS.length;

          if (existing) {
            existing.totalAmount = ar.totalAmount || ar.total || existing.totalAmount;
            existing.paidAmount = Math.max(existing.paidAmount || 0, ar.paidAmount || 0);
            existing.pendingAmount = Math.max(0, existing.totalAmount - existing.paidAmount);
            existing.status = existing.pendingAmount === 0 ? 'Pagado' : existing.paidAmount > 0 ? 'Parcial' : 'Pendiente';
          } else {
            stored.unshift({
              id: id,
              invoiceNumber: ar.invoiceNumber || `INV-${String(id).padStart(6, '0')}`,
              customerId: ar.customerId,
              customerName: ar.customerName || `Cliente #${ar.customerId || id}`,
              customerPhone: ar.customerPhone || '',
              customerEmail: ar.customerEmail || '',
              description: ar.description || 'Cuenta por Cobrar',
              totalAmount: ar.totalAmount || ar.total || 0,
              paidAmount: ar.paidAmount || 0,
              pendingAmount: pending,
              status: pending === 0 ? 'Pagado' : (ar.paidAmount > 0 ? 'Parcial' : 'Pendiente'),
              creationDate: ar.creationDate || ar.createdAt || new Date().toISOString(),
              dueDate: ar.dueDate,
              avatarColor: AVATAR_COLORS[colorIdx].bg,
              payments: ar.payments || [],
            });
          }
        }
      }
    } catch {
      // offline / endpoint fallback
    }

    // 2. Integrar ventas a crédito desde /Sale
    try {
      const salesRes = await this.api.get<any, any>('/Sale');
      const sales = extractArray<SaleResponseDto>(salesRes);

      if (sales && sales.length > 0) {
        const custRes = await this.customerService.getCustomers();
        const customers = custRes.data || [];

        for (const s of sales) {
          if (s.isCancelled) continue;
          const pending = Math.max(0, (s.total || 0) - (s.paidAmount || 0));
          const existing = stored.find((r) => r.id === s.id);
          const customer = customers.find((c) => c.id === s.customerId);
          const colorIdx = s.id % AVATAR_COLORS.length;

          if (existing) {
            existing.paidAmount = Math.max(existing.paidAmount || 0, s.paidAmount || 0);
            existing.pendingAmount = Math.max(0, (s.total || existing.totalAmount) - existing.paidAmount);
            existing.status = existing.pendingAmount === 0 ? 'Pagado' : existing.paidAmount > 0 ? 'Parcial' : 'Pendiente';
          } else if (pending > 0) {
            stored.unshift({
              id: s.id,
              invoiceNumber: `INV-${String(s.id).padStart(6, '0')}`,
              customerId: s.customerId,
              customerName: customer?.name || `Cliente #${s.customerId || s.id}`,
              customerPhone: customer?.phone || '',
              customerEmail: customer?.email || '',
              description: 'Venta a crédito',
              totalAmount: s.total,
              paidAmount: s.paidAmount || 0,
              pendingAmount: pending,
              status: s.paidAmount > 0 ? 'Parcial' : 'Pendiente',
              creationDate: s.creationDate || new Date().toISOString(),
              dueDate: s.dueDate,
              avatarColor: AVATAR_COLORS[colorIdx].bg,
              payments: s.paidAmount > 0 ? [
                {
                  id: 1,
                  amount: s.paidAmount,
                  date: new Date().toLocaleDateString('es-DO'),
                  method: 'Efectivo',
                  reference: 'Abono inicial',
                }
              ] : [],
            });
          }
        }
      }
    } catch {
      // ignore
    }

    this.saveStoredReceivables(stored);
    return { success: true, data: stored };
  }

  async getReceivable(id: number): Promise<ApiResponse<ReceivableDto>> {
    const list = this.getStoredReceivables();
    const item = list.find((r) => r.id === id);
    if (!item) {
      return { success: false, message: 'Venta por cobrar no encontrada.' };
    }
    return { success: true, data: item };
  }

  async createReceivable(
    dto: CreateReceivableDto,
  ): Promise<ApiResponse<ReceivableDto>> {
    const list = this.getStoredReceivables();
    const nextId = Math.max(100, ...list.map((r) => r.id)) + 1;
    const colorIdx = nextId % AVATAR_COLORS.length;

    const freqMap: Record<string, string> = {
      'Mensual': 'Monthly',
      'Quincenal': 'Biweekly',
      'Semanal': 'Weekly',
      'Diaria': 'Daily',
    };

    let backendId = nextId;
    const downPayment = Math.max(0, Number(dto.downPayment) || 0);
    const pendingAmount = Math.max(0, dto.totalAmount - downPayment);
    const initialStatus: ReceivableDto['status'] = pendingAmount <= 0 ? 'Pagado' : downPayment > 0 ? 'Parcial' : 'Pendiente';

    // Attempt to record in new backend AccountReceivable API
    try {
      const arPayload = {
        companyId: 1,
        customerId: dto.customerId || null,
        saleId: null,
        totalAmount: dto.totalAmount,
        paidAmount: downPayment,
        dueDate: dto.startDate,
        plan: {
          installmentAmount: dto.installmentAmount,
          totalInstallments: dto.totalInstallments,
          frequency: freqMap[dto.frequency] || 'Monthly',
          startsAt: dto.startDate,
        },
      };

      const res = await this.api.post<any, any>('/AccountReceivable', arPayload);
      if (res?.id) {
        backendId = res.id;
      }
    } catch {
      // Fallback to /Sale if AccountReceivable not yet available
      try {
        await this.api.post('/Sale', {
          customerId: dto.customerId || null,
          total: dto.totalAmount,
          paidAmount: downPayment,
          dueDate: dto.startDate,
          details: (dto.items && dto.items.length > 0)
            ? dto.items.map((it) => ({
                productId: it.productId,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
              }))
            : [
                {
                  productId: 1,
                  quantity: 1,
                  unitPrice: dto.totalAmount,
                },
              ],
        });
      } catch {
        // ignore
      }
    }

    const initialPayments: PaymentRecordDto[] = downPayment > 0 ? [
      {
        id: 1,
        amount: downPayment,
        date: new Date().toISOString(),
        method: 'Efectivo',
        notes: 'Abono inicial / Monto de apartado',
        isCurrent: true,
      }
    ] : [];

    const newReceivable: ReceivableDto = {
      id: backendId,
      invoiceNumber: `INV-${String(backendId).padStart(6, '0')}`,
      customerId: dto.customerId || null,
      customerName: dto.customerName || 'Cliente General',
      customerPhone: dto.customerPhone || null,
      customerEmail: dto.customerEmail || null,
      description: dto.description,
      totalAmount: dto.totalAmount,
      paidAmount: downPayment,
      pendingAmount: pendingAmount,
      downPayment: downPayment,
      items: dto.items || [],
      warehouseId: dto.warehouseId || null,
      warehouseName: dto.warehouseName || '',
      status: initialStatus,
      creationDate: new Date().toISOString(),
      dueDate: dto.startDate,
      avatarColor: AVATAR_COLORS[colorIdx].bg,
      paymentPlan: {
        installmentAmount: dto.installmentAmount,
        totalInstallments: dto.totalInstallments,
        startDate: dto.startDate,
        frequency: dto.frequency,
      },
      payments: initialPayments,
    };

    list.unshift(newReceivable);
    this.saveStoredReceivables(list);

    // 1. Descontar existencias de almacén inmediatamente si se especificaron productos
    if (dto.items && dto.items.length > 0 && dto.deductStock !== false && this.warehouseOutletService) {
      try {
        const whId = dto.warehouseId || 1;
        await this.warehouseOutletService.createOutlet({
          warehouseId: whId,
          conceptId: 2, // Venta / Apartado
          statusId: 1,
          commentary: `Salida de almacén #${whId} por Venta a Crédito / Apartado #${newReceivable.invoiceNumber} - Cliente: ${newReceivable.customerName}`,
          productDetails: dto.items.map((it) => ({
            productId: it.productId,
            productName: it.productName,
            quantity: it.quantity,
            price: it.unitPrice,
            cost: it.cost || it.unitPrice,
            barCode: it.barCode,
            warehouseId: whId,
          })),
        });
      } catch (outletErr) {
        console.warn('Could not register automatic warehouse outlet for credit sale:', outletErr);
      }
    }

    // 2. Si hubo abono inicial / apartado en efectivo, registrar ingreso en caja registradora activa
    if (downPayment > 0 && this.cashRegisterService) {
      try {
        await this.cashRegisterService.addMovement({
          type: 'Entrada',
          category: 'Cobros',
          description: `Abono inicial / Apartado venta #${newReceivable.invoiceNumber} - Cliente: ${newReceivable.customerName}`,
          amount: downPayment,
          paymentMethod: 'Efectivo',
        });
      } catch (cashErr) {
        console.warn('Could not record down payment in cash register:', cashErr);
      }
    }

    return { success: true, data: newReceivable };
  }

  async addPayment(
    receivableId: number,
    payment: {
      amount: number;
      date?: string;
      method: string;
      bank?: string;
      reference?: string;
      notes?: string;
      registerInCash?: boolean;
      voucherAttachment?: PaymentVoucherAttachment | null;
    },
  ): Promise<ApiResponse<ReceivableDto>> {
    const list = this.getStoredReceivables();
    const item = list.find((r) => r.id === receivableId);
    if (!item) {
      return { success: false, message: 'Venta por cobrar no encontrada.' };
    }

    const payId = item.payments.length + 1;
    const newRecord: PaymentRecordDto = {
      id: payId,
      amount: payment.amount,
      date: payment.date || new Date().toLocaleString('es-DO'),
      method: payment.method,
      bank: payment.bank || null,
      reference: payment.reference || null,
      notes: payment.notes || null,
      registerInCash: payment.registerInCash ?? (payment.method === 'Efectivo'),
      voucherAttachment: payment.voucherAttachment || null,
      isCurrent: true,
    };

    // Mark previous payments as not current
    item.payments.forEach((p) => (p.isCurrent = false));
    item.payments.push(newRecord);

    item.paidAmount = item.payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    item.pendingAmount = Math.max(0, item.totalAmount - item.paidAmount);
    item.status = item.pendingAmount === 0 ? 'Pagado' : item.paidAmount > 0 ? 'Parcial' : 'Pendiente';

    // Check active cash register session
    let cashRegisterId: number | null = null;
    if (this.cashRegisterService) {
      try {
        const sessRes = await this.cashRegisterService.getActiveSession();
        if (sessRes.data?.isOpen) {
          cashRegisterId = sessRes.data.id;
        }
      } catch {
        // ignore
      }
    }

    const methodCode = payment.method === 'Efectivo' ? 'CASH' : payment.method === 'Transferencia' ? 'TRANSFER' : payment.method === 'Tarjeta' ? 'CARD' : 'CHECK';

    // Post to AccountReceivable payments endpoint with fallback
    try {
      await this.api.post(
        `/AccountReceivable/${receivableId}/payments`,
        {
          amount: payment.amount,
          method: methodCode,
          reference: payment.reference || null,
          cashRegisterId: cashRegisterId,
        },
        { headers: { 'X-Silent-Error': 'true', 'X-Silent-404': 'true' } }
      );
    } catch {
      // Fallback to Sale payments
      try {
        await this.api.post(
          `/Sale/${receivableId}/payments`,
          {
            amount: payment.amount,
            reference: payment.reference || payment.method,
            method: methodCode,
            cashRegisterId: cashRegisterId,
          },
          { headers: { 'X-Silent-Error': 'true', 'X-Silent-404': 'true' } }
        );
      } catch {
        // ignore - payment recorded in local state and cash register
      }
    }

    // Automatically sync with local Cash Register if active and registerInCash is enabled
    if (this.cashRegisterService && newRecord.registerInCash) {
      try {
        await this.cashRegisterService.addMovement({
          type: 'Entrada',
          category: 'Cobros',
          description: `Cobro de cliente ${item.customerName} (${item.invoiceNumber})`,
          amount: payment.amount,
          paymentMethod: payment.method,
          reference: payment.reference || item.invoiceNumber,
        });
      } catch {
        // ignore if cash register is closed
      }
    }

    this.saveStoredReceivables(list);
    return { success: true, data: item };
  }

  async payInstallment(
    receivableId: number,
    installmentId: number,
    params: {
      amount: number;
      method: string;
    },
  ): Promise<ApiResponse<any>> {
    let cashRegisterId: number | null = null;
    if (this.cashRegisterService) {
      try {
        const sessRes = await this.cashRegisterService.getActiveSession();
        if (sessRes.data?.isOpen) {
          cashRegisterId = sessRes.data.id;
        }
      } catch {
        // ignore
      }
    }

    const methodCode = params.method === 'Efectivo' ? 'CASH' : params.method === 'Transferencia' ? 'TRANSFER' : params.method === 'Tarjeta' ? 'CARD' : 'CHECK';

    // Try posting to backend pay installment endpoint
    try {
      await this.api.post(`/AccountReceivable/${receivableId}/installments/${installmentId}/pay`, {
        amount: params.amount,
        method: methodCode,
        cashRegisterId: cashRegisterId,
      });
    } catch {
      // ignore
    }

    // Register payment record in receivable
    return this.addPayment(receivableId, {
      amount: params.amount,
      method: params.method,
      reference: `Cuota #${installmentId}`,
      notes: `Pago de cuota #${installmentId}`,
    });
  }

  async updatePayment(
    receivableId: number,
    paymentId: number,
    payment: {
      amount: number;
      date?: string;
      method: string;
      bank?: string;
      reference?: string;
      notes?: string;
      registerInCash?: boolean;
      voucherAttachment?: PaymentVoucherAttachment | null;
    },
  ): Promise<ApiResponse<ReceivableDto>> {
    const list = this.getStoredReceivables();
    const item = list.find((r) => r.id === receivableId);
    if (!item) {
      return { success: false, message: 'Venta por cobrar no encontrada.' };
    }

    const payIdx = item.payments.findIndex((p) => p.id === paymentId);
    if (payIdx === -1) {
      return { success: false, message: 'Pago no encontrado en el historial.' };
    }

    item.payments[payIdx] = {
      ...item.payments[payIdx],
      amount: payment.amount,
      date: payment.date || item.payments[payIdx].date,
      method: payment.method,
      bank: payment.bank !== undefined ? payment.bank : item.payments[payIdx].bank,
      reference: payment.reference !== undefined ? payment.reference : item.payments[payIdx].reference,
      notes: payment.notes !== undefined ? payment.notes : item.payments[payIdx].notes,
      registerInCash: payment.registerInCash !== undefined ? payment.registerInCash : item.payments[payIdx].registerInCash,
      voucherAttachment: payment.voucherAttachment !== undefined ? payment.voucherAttachment : item.payments[payIdx].voucherAttachment,
    };

    // Recalculate total paid & pending balance
    item.paidAmount = item.payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    item.pendingAmount = Math.max(0, item.totalAmount - item.paidAmount);
    item.status = item.pendingAmount === 0 ? 'Pagado' : item.paidAmount > 0 ? 'Parcial' : 'Pendiente';

    this.saveStoredReceivables(list);
    return { success: true, data: item };
  }

  async deletePayment(
    receivableId: number,
    paymentId: number,
  ): Promise<ApiResponse<ReceivableDto>> {
    const list = this.getStoredReceivables();
    const item = list.find((r) => r.id === receivableId);
    if (!item) {
      return { success: false, message: 'Venta por cobrar no encontrada.' };
    }

    const payIdx = item.payments.findIndex((p) => p.id === paymentId);
    if (payIdx === -1) {
      return { success: false, message: 'Pago no encontrado en el historial.' };
    }

    item.payments.splice(payIdx, 1);

    // Recalculate total paid & pending balance
    item.paidAmount = item.payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    item.pendingAmount = Math.max(0, item.totalAmount - item.paidAmount);
    item.status = item.pendingAmount === 0 ? 'Pagado' : item.paidAmount > 0 ? 'Parcial' : 'Pendiente';

    this.saveStoredReceivables(list);
    return { success: true, data: item };
  }

  async updateReceivable(
    id: number,
    updates: Partial<ReceivableDto>,
  ): Promise<ApiResponse<ReceivableDto>> {
    const list = this.getStoredReceivables();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) {
      return { success: false, message: 'Venta no encontrada.' };
    }

    list[idx] = { ...list[idx], ...updates };
    this.saveStoredReceivables(list);
    return { success: true, data: list[idx] };
  }

  async deleteReceivable(id: number): Promise<ApiResponse<boolean>> {
    const list = this.getStoredReceivables();
    const filtered = list.filter((r) => r.id !== id);
    this.saveStoredReceivables(filtered);

    try {
      await this.api.delete(`/Sale/${id}`);
    } catch {
      // ignore
    }

    return { success: true, data: true };
  }

  async reopenReceivable(id: number, reason?: string): Promise<ApiResponse<ReceivableDto>> {
    const list = this.getStoredReceivables();
    const item = list.find((r) => r.id === id);
    if (!item) {
      return { success: false, message: 'Cuenta por cobrar no encontrada.' };
    }

    item.status = item.paidAmount > 0 ? 'Parcial' : 'Pendiente';
    if (item.pendingAmount <= 0) {
      item.pendingAmount = Math.max(1, item.totalAmount - item.paidAmount);
    }
    item.isReopened = true;
    item.reopenedDate = new Date().toISOString();

    this.saveStoredReceivables(list);

    try {
      if (this.api) {
        await this.api.post(`/v1/AccountReceivable/${id}/reopen`, {
          reason: reason || 'Reapertura para corrección contable',
        });
      }
    } catch {
      // offline fallback
    }

    return { success: true, data: item, message: 'Cuenta por cobrar reactivada correctamente.' };
  }
}
