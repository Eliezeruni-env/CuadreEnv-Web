import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CashRegisterService } from './cash-register.service';

describe('CashRegisterService', () => {
  let service: CashRegisterService;
  let mockRegisters: any[] = [];
  let mockMovements: any[] = [];

  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }

    mockRegisters = [];
    mockMovements = [];

    const mockApi: any = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === '/cash-sessions/active-session') {
          const open = mockRegisters.find((r) => r.isOpen);
          if (!open) return Promise.resolve(null);
          let totalIn = 0;
          let totalOut = 0;
          for (const m of mockMovements) {
            const t = (m.type || '').toString().toLowerCase();
            if (t === '1' || t === 'in' || t === 'entrada') totalIn += Number(m.amount);
            else if (t === '2' || t === 'out' || t === 'salida') totalOut += Number(m.amount);
          }
          return Promise.resolve({
            success: true,
            data: {
              ...open,
              totalIn,
              totalOut,
              currentBalance: open.initialAmount + totalIn - totalOut,
            },
          });
        }
        if (url === '/CashRegister') {
          return Promise.resolve(mockRegisters);
        }
        if (url === '/CashMovement') {
          return Promise.resolve(mockMovements);
        }
        return Promise.resolve([]);
      }),
      post: vi.fn().mockImplementation((url: string, body?: any) => {
        if (url === '/cash-sessions/open' || url === '/CashRegister/open') {
          const initial = Number(body?.balance ?? body?.initialAmount ?? 0);
          const reg = {
            id: 1,
            name: body?.name || 'Caja Principal',
            balance: initial,
            initialAmount: initial,
            isOpen: true,
            createdDate: new Date().toISOString(),
          };
          mockRegisters.push(reg);
          return Promise.resolve({ success: true, id: 1, data: reg });
        }
        if (url.includes('/close')) {
          const reg = mockRegisters.find((r) => r.isOpen);
          const closingAmt = Number(body?.actualAmount ?? body?.closingAmount ?? 0);
          if (reg) {
            reg.isOpen = false;
            reg.balance = closingAmt;
            reg.updatedDate = new Date().toISOString();
          }
          return Promise.resolve({
            success: true,
            data: {
              expected: 15000,
              actual: closingAmt,
              diff: closingAmt - 15000,
            },
          });
        }
        if (url === '/CashMovement') {
          const mov = {
            id: mockMovements.length + 1,
            amount: body?.amount || 0,
            type: body?.type || 'In',
            description: body?.description || '',
            createdDate: new Date().toISOString(),
          };
          mockMovements.push(mov);
          return Promise.resolve(mov);
        }
        if (url === '/Sale' || url.includes('/sales')) {
          mockMovements.push({
            id: mockMovements.length + 1,
            amount: body?.total || 590,
            type: '1',
            description: 'Venta POS',
            createdDate: new Date().toISOString(),
          });
          return Promise.resolve({ id: 101, success: true });
        }
        return Promise.resolve({ success: true });
      }),
      put: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    };

    service = new CashRegisterService(mockApi);
  });

  it('should return null when no session has been opened', async () => {
    const sessionRes = await service.getActiveSession();
    expect(sessionRes.success).toBe(true);
    expect(sessionRes.data).toBeNull();
  });

  it('should open a cash register session and initialize with opening movement', async () => {
    const openRes = await service.openSession({
      name: 'Caja Principal 01',
      initialAmount: 10000,
      cashierName: 'Juan Cajero',
      notes: 'Fondo matutino',
    });

    expect(openRes.success).toBe(true);
    expect(openRes.data).toBeDefined();
    expect(openRes.data!.name).toBe('Caja Principal 01');
    expect(openRes.data!.initialAmount).toBe(10000);
    expect(openRes.data!.currentBalance).toBe(10000);
    expect(openRes.data!.isOpen).toBe(true);

    const activeRes = await service.getActiveSession();
    expect(activeRes.data).not.toBeNull();
    expect(activeRes.data!.isOpen).toBe(true);

    const movRes = await service.getMovements();
    expect(movRes.data!.length).toBe(1);
    expect(movRes.data![0].type).toBe('Saldo inicial');
    expect(movRes.data![0].inAmount).toBe(10000);
  });

  it('should register income and expense movements, adjusting the balance', async () => {
    await service.openSession({
      name: 'Caja Principal 01',
      initialAmount: 10000,
    });

    // Add Income
    const incomeRes = await service.addMovement({
      type: 'Entrada',
      category: 'Cobros',
      description: 'Cobro de cliente',
      amount: 3000,
    });
    expect(incomeRes.success).toBe(true);
    expect(incomeRes.data!.balance).toBe(13000);

    // Add Expense
    const expenseRes = await service.addMovement({
      type: 'Salida',
      category: 'Gastos',
      description: 'Gasto de transporte',
      amount: 700,
    });
    expect(expenseRes.success).toBe(true);
    expect(expenseRes.data!.balance).toBe(12300);

    const sessionRes = await service.getActiveSession();
    expect(sessionRes.data!.currentBalance).toBe(12300);
    expect(sessionRes.data!.totalIn).toBe(3000);
    expect(sessionRes.data!.totalOut).toBe(700);
  });

  it('should process quick sales and automatically create cash register entry', async () => {
    await service.openSession({
      name: 'Caja Principal',
      initialAmount: 10000,
    });

    const saleRes = await service.registerQuickSale({
      items: [
        {
          productId: 1,
          productName: 'Producto A',
          unitPrice: 250,
          quantity: 2,
          total: 500,
        },
      ],
      subtotal: 500,
      discount: 0,
      itbis: 90,
      total: 590,
      paymentMethod: 'Efectivo',
      amountReceived: 1000,
      change: 410,
    });

    expect(saleRes.success).toBe(true);
    expect(saleRes.data.invoiceNumber).toBeDefined();

    const sessionRes = await service.getActiveSession();
    expect(sessionRes.data!.currentBalance).toBe(10590);
  });

  it('should close cash register session, calculate discrepancy, and save to history', async () => {
    await service.openSession({
      name: 'Caja Principal',
      initialAmount: 10000,
    });

    await service.addMovement({
      type: 'Entrada',
      category: 'Ventas',
      description: 'Venta',
      amount: 5000,
    });

    // Close with exact match
    const closeRes = await service.closeSession({
      closingAmount: 15000,
      notes: 'Turno finalizado sin faltantes',
    });

    expect(closeRes.success).toBe(true);
    expect(closeRes.data!.expected).toBe(15000);
    expect(closeRes.data!.actual).toBe(15000);
    expect(closeRes.data!.diff).toBe(0);

    // Active session should be null
    const activeRes = await service.getActiveSession();
    expect(activeRes.data).toBeNull();

    // History should contain closed session
    const historyRes = await service.getSessionHistory();
    expect(historyRes.data!.length).toBe(1);
    expect(historyRes.data![0].isOpen).toBe(false);
    expect(historyRes.data![0].closingAmount).toBe(15000);
  });
});
