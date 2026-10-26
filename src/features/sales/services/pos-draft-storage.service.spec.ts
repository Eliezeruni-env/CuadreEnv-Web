import { TestBed } from '@angular/core/testing';
import { PosDraftStorageService, PosSaleDraft } from './pos-draft-storage.service';

describe('PosDraftStorageService (Emergency Draft & Held Sales)', () => {
  let service: PosDraftStorageService;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [PosDraftStorageService],
    });

    service = TestBed.inject(PosDraftStorageService);
  });

  it('should save and retrieve active draft upon session expiration', () => {
    const draft: PosSaleDraft = {
      customerId: 5,
      customerName: 'Cliente VIP',
      items: [
        {
          productId: 10,
          productCode: 'BEV-001',
          productName: 'Jugo Natural',
          unitPrice: 150,
          quantity: 2,
          total: 300,
        },
      ],
      discountType: 'percent',
      discountValue: 10,
      selectedMethod: 'Efectivo',
      amountReceived: 500,
      timestamp: new Date().toISOString(),
    };

    expect(service.hasActiveDraft()).toBe(false);

    service.saveActiveDraft(draft);

    expect(service.hasActiveDraft()).toBe(true);
    const retrieved = service.getActiveDraft();
    expect(retrieved?.customerId).toBe(5);
    expect(retrieved?.items.length).toBe(1);
    expect(retrieved?.items[0].productName).toBe('Jugo Natural');

    service.clearActiveDraft();
    expect(service.hasActiveDraft()).toBe(false);
  });

  it('should hold a sale (venta en espera) and allow resuming it', () => {
    const draft: PosSaleDraft = {
      customerId: null,
      customerName: 'Consumidor final',
      items: [
        {
          productId: 1,
          productCode: 'P-1',
          productName: 'Producto A',
          unitPrice: 200,
          quantity: 3,
          total: 600,
        },
      ],
      discountType: 'percent',
      discountValue: 0,
      selectedMethod: 'Efectivo',
      amountReceived: 0,
      timestamp: new Date().toISOString(),
    };

    expect(service.heldCount()).toBe(0);

    const held = service.holdSale(draft, 'Mesa 4');
    expect(service.heldCount()).toBe(1);
    expect(held.label).toBe('Mesa 4');
    expect(held.totalAmount).toBe(600);

    const resumed = service.resumeHeldSale(held.id);
    expect(resumed).toBeTruthy();
    expect(resumed?.items.length).toBe(1);
    expect(service.heldCount()).toBe(0);
  });
});
