import { TestBed } from '@angular/core/testing';
import {
  PosOfflineSyncService,
  generateIdempotencyKey,
} from './pos-offline-sync.service';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { NotificationService } from '../../cuadreEnv/services/notification.service';

describe('PosOfflineSyncService (Offline Queue & Idempotency)', () => {
  let service: PosOfflineSyncService;

  const mockApiClient = {
    post: vi.fn().mockResolvedValue({ success: true, id: 999 }),
  };

  const mockNotificationService = {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        PosOfflineSyncService,
        { provide: ApiClientService, useValue: mockApiClient },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    });

    service = TestBed.inject(PosOfflineSyncService);
  });

  it('should generate a valid non-empty idempotency key', () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();
    expect(key1).toBeTruthy();
    expect(key2).toBeTruthy();
    expect(key1).not.toEqual(key2);
  });

  it('should allow queuing a CASH (Efectivo) sale in offline mode and return receipt', () => {
    const payload = {
      customerId: null,
      customerName: 'Consumidor final',
      items: [
        {
          productId: 1,
          productCode: 'PROD-001',
          productName: 'Arroz 10lb',
          unitPrice: 350,
          quantity: 2,
          total: 700,
        },
      ],
      subtotal: 700,
      discount: 0,
      itbis: 126,
      total: 826,
      paymentMethod: 'Efectivo',
      amountReceived: 1000,
      change: 174,
    };

    const res = service.queueOfflineSale(payload);

    expect(res.success).toBe(true);
    expect(res.receipt).toBeTruthy();
    expect(res.receipt?.invoiceNumber).toContain('VTA-OFFLINE-');
    expect(service.pendingCount()).toBe(1);
  });

  it('should strictly REJECT queuing an electronic Card or Transfer sale when offline', () => {
    const cardPayload = {
      customerId: null,
      customerName: 'Consumidor final',
      items: [],
      subtotal: 500,
      discount: 0,
      itbis: 90,
      total: 590,
      paymentMethod: 'Tarjeta DEBIT (****1234)',
      amountReceived: 590,
      change: 0,
    };

    const res = service.queueOfflineSale(cardPayload);

    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain('No es posible procesar pagos con tarjeta');
    expect(service.pendingCount()).toBe(0);
  });

  it('should synchronize pending sales with X-Idempotency-Key header when network returns', async () => {
    const payload = {
      customerId: null,
      customerName: 'Cliente Contado',
      items: [],
      subtotal: 100,
      discount: 0,
      itbis: 18,
      total: 118,
      paymentMethod: 'Efectivo',
      amountReceived: 150,
      change: 32,
    };

    service.queueOfflineSale(payload);
    expect(service.pendingCount()).toBe(1);

    const syncResult = await service.syncPendingSales();

    expect(syncResult.successCount).toBe(1);
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/Sale',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Idempotency-Key': expect.any(String),
        }),
      }),
    );
    expect(service.pendingCount()).toBe(0);
  });
});
