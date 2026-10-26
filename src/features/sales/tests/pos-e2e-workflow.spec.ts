import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import { CashRegisterService, type CashRegisterSessionDto } from '../../cash-register/services/cash-register.service';
import { PosDraftStorageService } from '../services/pos-draft-storage.service';
import { PosOfflineSyncService, generateIdempotencyKey } from '../services/pos-offline-sync.service';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { NotificationService } from '../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../cuadreEnv/services/translation.service';

/**
 * Complete End-to-End Orchestration Spec:
 * Flow: Login → Abrir Caja → Poner Venta en Espera → Venta Mixta (Efectivo+Tarjeta) → Retomar Venta en Espera → Cerrar Caja con Arqueo Ciego → Verificar Discrepancia.
 */
describe('E2E POS Workflow: Login → Open Register → Mixed Sale → Hold Sale → Resume → Blind Count Close', () => {
  let authService: AuthService;
  let cashRegisterService: CashRegisterService;
  let draftStorageService: PosDraftStorageService;
  let offlineSyncService: PosOfflineSyncService;

  // In-memory simulation of the Cash Register Drawer state machine
  let activeSession: CashRegisterSessionDto | null = null;
  let recordedSales: any[] = [];
  let drawerBalance = 0;

  const mockApiClient = {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/CashMovement')) {
        const netIn = drawerBalance - (activeSession?.initialAmount || 0);
        if (netIn > 0) {
          return Promise.resolve([{ amount: netIn, type: 'In' }]);
        }
        return Promise.resolve([]);
      }
      if (url.includes('/CashRegister')) {
        if (activeSession && activeSession.isOpen) {
          return Promise.resolve([
            {
              id: activeSession.id,
              name: activeSession.name,
              isOpen: true,
              balance: activeSession.initialAmount,
            },
          ]);
        }
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockImplementation((url: string, body: any, options?: any) => {
      // 1. Session Open
      if (
        url.includes('/cash-sessions/open') ||
        url.includes('/CashRegister/open') ||
        (url.includes('/CashRegister') && (body?.initialAmount !== undefined || body?.balance !== undefined))
      ) {
        const initial = Number(body?.balance ?? body?.initialAmount ?? 2000);
        drawerBalance = initial;
        activeSession = {
          id: 101,
          name: body?.name || 'Caja Principal E2E',
          cashierName: 'Admin POS',
          initialAmount: drawerBalance,
          currentBalance: drawerBalance,
          totalIn: 0,
          totalOut: 0,
          openedAt: new Date().toISOString(),
          isOpen: true,
          status: 'OPEN',
        };
        return Promise.resolve({ success: true, id: 101, data: activeSession });
      }

      // 2. Sales processing (/caja/sales or /Sale)
      if (url.includes('/caja/sales') || url.includes('/Sale')) {
        const saleId = 1000 + recordedSales.length + 1;
        const idempotencyKey = options?.headers?.['X-Idempotency-Key'] || body?.idempotencyKey || generateIdempotencyKey();

        // Idempotency check: if already registered, return existing
        const existing = recordedSales.find((s) => s.idempotencyKey === idempotencyKey);
        if (existing) {
          return Promise.resolve({ success: true, isExisting: true, data: { ...existing, isExisting: true } });
        }

        const saleRecord = {
          id: saleId,
          invoiceNumber: `VTA-E2E-${String(saleId).padStart(5, '0')}`,
          total: body.total || 0,
          idempotencyKey,
        };
        recordedSales.push(saleRecord);
        return Promise.resolve({ success: true, data: saleRecord });
      }

      // 3. Cash movement (Cash drop into drawer)
      if (url.includes('/CashMovement')) {
        if (body.type === 'In') {
          drawerBalance += Number(body.amount);
          if (activeSession) {
            activeSession.totalIn += Number(body.amount);
            activeSession.currentBalance = drawerBalance;
          }
        }
        return Promise.resolve({ success: true });
      }

      // 4. Session Close
      if (url.includes('/close')) {
        const counted = Number(body?.actualAmount ?? body?.closingAmount ?? 0);
        const expected = drawerBalance;
        const diff = Math.round((counted - expected) * 100) / 100;
        if (activeSession) {
          activeSession.isOpen = false;
          activeSession.status = 'CLOSED';
        }
        return Promise.resolve({
          success: true,
          data: {
            expected,
            actual: counted,
            diff,
          },
        });
      }

      return Promise.resolve({ success: true });
    }),
  };

  const mockNotificationService = {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    showApiError: vi.fn(),
  };

  const mockTranslationService = {
    translate: vi.fn().mockImplementation((k: string) => k),
  };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    recordedSales = [];
    activeSession = null;
    drawerBalance = 0;

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        CashRegisterService,
        PosDraftStorageService,
        PosOfflineSyncService,
        { provide: ApiClientService, useValue: mockApiClient },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: TranslationService, useValue: mockTranslationService },
      ],
    });

    authService = TestBed.inject(AuthService);
    cashRegisterService = TestBed.inject(CashRegisterService);
    draftStorageService = TestBed.inject(PosDraftStorageService);
    offlineSyncService = TestBed.inject(PosOfflineSyncService);
  });

  it('should successfully execute the complete 7-step E2E lifecycle with exact blind count reconciliation', async () => {
    // -------------------------------------------------------------
    // PASO 1: Login y Autenticación de Operador
    // -------------------------------------------------------------
    authService.currentUser.set({
      id: 1,
      email: 'admin@cuadreenv.local',
      fullName: 'Administrador POS',
      allowedModules: ['*'],
    });
    authService.currentRole.set('Admin');
    authService.companyId.set(1);
    authService.isAuthenticated.set(true);

    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.companyId()).toBe(1);
    expect(authService.isSuperUser()).toBe(true);

    // -------------------------------------------------------------
    // PASO 2: Abrir Caja con Fondo Inicial de RD$ 2,000.00
    // -------------------------------------------------------------
    const openResult = await cashRegisterService.openSession({
      initialAmount: 2000,
      notes: 'Apertura de turno matutino E2E',
    });

    expect(openResult.success).toBe(true);
    expect(activeSession).toBeTruthy();
    expect(activeSession?.currentBalance).toBe(2000);
    expect(drawerBalance).toBe(2000);

    // -------------------------------------------------------------
    // PASO 3: Poner Venta en Espera (Hold Sale - F8)
    // -------------------------------------------------------------
    const customer1Cart = [
      { productId: 1, productCode: 'ARR-01', productName: 'Arroz 10lb', unitPrice: 350, quantity: 2, total: 700 },
      { productId: 2, productCode: 'ACE-01', productName: 'Aceite 64oz', unitPrice: 350, quantity: 1, total: 350 },
    ];

    expect(draftStorageService.heldCount()).toBe(0);

    const heldSale = draftStorageService.holdSale(
      {
        customerId: null,
        customerName: 'Cliente con prisa',
        items: customer1Cart,
        discountType: 'percent',
        discountValue: 0,
        selectedMethod: 'Efectivo',
        amountReceived: 0,
        timestamp: new Date().toISOString(),
      },
      'Cliente 1 (2 productos)',
    );

    expect(draftStorageService.heldCount()).toBe(1);
    expect(heldSale.totalAmount).toBe(1050);
    expect(heldSale.itemCount).toBe(3);

    // -------------------------------------------------------------
    // PASO 4: Venta Mixta (Efectivo RD$ 136 + Tarjeta RD$ 100 = RD$ 236)
    // -------------------------------------------------------------
    const mixedSaleItems = [
      { productId: 3, productName: 'Leche 1L', unitPrice: 80, quantity: 1, total: 80 },
      { productId: 4, productName: 'Pan de Agua', unitPrice: 120, quantity: 1, total: 120 },
    ];
    const mixedSubtotal = 200;
    const mixedItbis = 36;
    const mixedTotal = 236;
    const idempotencyKeyMixed = generateIdempotencyKey();

    // The mixed payment has a cash portion of 136 deposited in the drawer
    const mixedSaleResponse = await cashRegisterService.registerQuickSale({
      customerId: null,
      customerName: 'Consumidor final',
      items: mixedSaleItems,
      subtotal: mixedSubtotal,
      discount: 0,
      itbis: mixedItbis,
      total: mixedTotal,
      paymentMethod: 'Efectivo RD$ 136 + Tarjeta DEBIT (****4321) Auth: AUT-7788',
      amountReceived: 136,
      change: 0,
      idempotencyKey: idempotencyKeyMixed,
    });

    expect(mixedSaleResponse.success).toBe(true);
    // Simulate cash movement for the cash portion
    await mockApiClient.post('/CashMovement', {
      cashRegisterId: activeSession?.id,
      amount: 136,
      type: 'In',
      description: 'Venta mixta porción efectivo',
    });

    expect(drawerBalance).toBe(2136); // 2000 initial + 136 cash sale

    // -------------------------------------------------------------
    // PASO 5: Retomar Venta en Espera y Cobrar (Resume Held - F9)
    // -------------------------------------------------------------
    const resumedSale = draftStorageService.resumeHeldSale(heldSale.id);
    expect(resumedSale).toBeTruthy();
    expect(resumedSale?.items.length).toBe(2);
    expect(draftStorageService.heldCount()).toBe(0);

    // Customer 1 finishes purchase in Cash: Subtotal 1050 + ITBIS 189 = RD$ 1,239.00
    const cust1Subtotal = 1050;
    const cust1Itbis = 189;
    const cust1Total = 1239;
    const idempotencyKeyCust1 = generateIdempotencyKey();

    const cust1SaleResponse = await cashRegisterService.registerQuickSale({
      customerId: null,
      customerName: 'Cliente 1 (Retomado)',
      items: resumedSale!.items,
      subtotal: cust1Subtotal,
      discount: 0,
      itbis: cust1Itbis,
      total: cust1Total,
      paymentMethod: 'Efectivo',
      amountReceived: 1500,
      change: 261,
      idempotencyKey: idempotencyKeyCust1,
    });

    expect(cust1SaleResponse.success).toBe(true);
    // Simulate cash movement for cash sale
    await mockApiClient.post('/CashMovement', {
      cashRegisterId: activeSession?.id,
      amount: 1239,
      type: 'In',
      description: 'Cobro Cliente 1 en efectivo',
    });

    // Total expected in drawer: 2000 (initial) + 136 (mixed cash) + 1239 (cust1 cash) = RD$ 3,375.00
    expect(drawerBalance).toBe(3375);

    // Idempotency check: Re-sending the same request must return existing record without adding money twice
    const duplicateCheck = await cashRegisterService.registerQuickSale({
      customerId: null,
      customerName: 'Cliente 1 (Retomado)',
      items: resumedSale!.items,
      subtotal: cust1Subtotal,
      discount: 0,
      itbis: cust1Itbis,
      total: cust1Total,
      paymentMethod: 'Efectivo',
      amountReceived: 1500,
      change: 261,
      idempotencyKey: idempotencyKeyCust1, // same key!
    });
    expect(duplicateCheck.success).toBe(true);
    expect(recordedSales.length).toBe(2); // exactly 2 unique sales registered, no duplication

    // -------------------------------------------------------------
    // PASO 6 & 7: Arqueo Ciego y Verificación de Discrepancia
    // -------------------------------------------------------------
    // El cajero cuenta el dinero físico sin que el frontend le sople el saldo esperado
    // Denominaciones contadas:
    // 1 de 2000 = 2000
    // 1 de 1000 = 1000
    // 3 de 100  =  300
    // 1 de 50   =   50
    // 1 de 25   =   25
    // Total Físico = 3,375.00
    const physicalCashCounted = 2000 + 1000 + 300 + 50 + 25; // 3375

    const closeResult = await cashRegisterService.closeSession({
      closingAmount: physicalCashCounted,
      notes: 'Arqueo físico ciego exacto',
    });

    expect(closeResult.success).toBe(true);
    expect(closeResult.data?.expected).toBe(3375);
    expect(closeResult.data?.actual).toBe(3375);
    expect(closeResult.data?.diff).toBe(0); // Cuadre Exacto
  });

  it('should accurately detect cash shortage in blind count when physical count is lower than expected', async () => {
    // Setup session with balance 5,000
    drawerBalance = 5000;
    activeSession = {
      id: 102,
      name: 'Caja Shortage Test',
      cashierName: 'Cajero 2',
      initialAmount: 5000,
      currentBalance: 5000,
      totalIn: 0,
      totalOut: 0,
      openedAt: new Date().toISOString(),
      isOpen: true,
      status: 'OPEN',
    };
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('cuadre_active_cash_register_session', JSON.stringify(activeSession));
    }

    // Cashier physically counts only 4,950 (Faltante de 50)
    const physicalCount = 4950;
    const closeResult = await cashRegisterService.closeSession({
      closingAmount: physicalCount,
      notes: 'Faltante de 50 identificado',
    });

    expect(closeResult.success).toBe(true);
    expect(closeResult.data?.expected).toBe(5000);
    expect(closeResult.data?.actual).toBe(4950);
    expect(closeResult.data?.diff).toBe(-50); // Shortage of 50
  });
});
