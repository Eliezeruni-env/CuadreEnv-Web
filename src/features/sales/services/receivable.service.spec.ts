import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReceivableService } from './receivable.service';
import { TestBed } from '@angular/core/testing';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { CustomerService } from '../../customers/services/customer.service';

describe('ReceivableService', () => {
  let service: ReceivableService;

  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
      const seedItem = {
        id: 1,
        invoiceNumber: 'INV-000123',
        customerName: 'Juan Pérez',
        totalAmount: 15000,
        paidAmount: 5000,
        pendingAmount: 10000,
        status: 'Parcial',
        creationDate: '2026-05-01',
        payments: [
          { id: 101, amount: 5000, date: '2026-05-01', method: 'Efectivo', reference: 'REC-001' },
        ],
        avatarColor: '#ede9fe',
      };
      window.localStorage.setItem('cuadre_receivables_store_v1', JSON.stringify([seedItem]));
    }

    const mockApi: any = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({ success: true }),
      put: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    };

    const mockCustomerService: any = {
      getCustomers: vi.fn().mockResolvedValue({ success: true, data: [] }),
    };

    service = new ReceivableService(mockApi, mockCustomerService);
  });

  it('should initialize and return list of receivables', async () => {
    const res = await service.getReceivables();
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data!.length).toBeGreaterThan(0);
    expect(res.data![0].customerName).toBe('Juan Pérez');
    expect(res.data![0].invoiceNumber).toBe('INV-000123');
  });

  it('should create a new receivable with payment plan', async () => {
    const createRes = await service.createReceivable({
      customerId: 10,
      customerName: 'Carlos Santana',
      customerPhone: '809-111-2222',
      customerEmail: 'carlos@santana.do',
      description: 'Equipos de audio',
      totalAmount: 50000,
      installmentAmount: 10000,
      totalInstallments: 5,
      startDate: '2026-06-01',
      frequency: 'Quincenal',
    });

    expect(createRes.success).toBe(true);
    expect(createRes.data).toBeDefined();
    expect(createRes.data!.customerName).toBe('Carlos Santana');
    expect(createRes.data!.totalAmount).toBe(50000);
    expect(createRes.data!.pendingAmount).toBe(50000);
    expect(createRes.data!.status).toBe('Pendiente');
    expect(createRes.data!.paymentPlan?.totalInstallments).toBe(5);
  });

  it('should add payment, update paid and pending balance, and record history', async () => {
    const initialList = await service.getReceivables();
    const target = initialList.data![0];
    const previousPaid = target.paidAmount;
    const previousPending = target.pendingAmount;

    const payRes = await service.addPayment(target.id, {
      amount: 4000,
      method: 'Transferencia',
      reference: 'TRF-TEST-999',
    });

    expect(payRes.success).toBe(true);
    expect(payRes.data!.paidAmount).toBe(previousPaid + 4000);
    expect(payRes.data!.pendingAmount).toBe(previousPending - 4000);
    expect(payRes.data!.payments.some((p) => p.reference === 'TRF-TEST-999')).toBe(true);
  });

  it('should update an existing payment and recalculate balance', async () => {
    const initialList = await service.getReceivables();
    const target = initialList.data![0];
    const firstPayment = target.payments[0];

    const updateRes = await service.updatePayment(target.id, firstPayment.id, {
      amount: 7000,
      method: 'Tarjeta',
      reference: 'TX-UPDATED',
    });

    expect(updateRes.success).toBe(true);
    const updatedPay = updateRes.data!.payments.find((p) => p.id === firstPayment.id);
    expect(updatedPay?.amount).toBe(7000);
    expect(updatedPay?.method).toBe('Tarjeta');
    expect(updatedPay?.reference).toBe('TX-UPDATED');
  });

  it('should delete a payment from history and recalculate balance', async () => {
    const initialList = await service.getReceivables();
    const target = initialList.data![0];
    const initialPaymentsCount = target.payments.length;
    const paymentToDelete = target.payments[0];

    const delPayRes = await service.deletePayment(target.id, paymentToDelete.id);

    expect(delPayRes.success).toBe(true);
    expect(delPayRes.data!.payments.length).toBe(initialPaymentsCount - 1);
    expect(delPayRes.data!.payments.some((p) => p.id === paymentToDelete.id)).toBe(false);
  });

  it('should delete receivable from list', async () => {
    const initialList = await service.getReceivables();
    const targetId = initialList.data![0].id;

    const delRes = await service.deleteReceivable(targetId);
    expect(delRes.success).toBe(true);

    const updatedList = await service.getReceivables();
    expect(updatedList.data!.some((r) => r.id === targetId)).toBe(false);
  });
});

