import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModuleAccessService } from './module-access.service';

describe('ModuleAccessService', () => {
  let service: ModuleAccessService;

  beforeEach(() => {
    service = new ModuleAccessService();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return false if no modules are assigned', () => {
    service.init([]);
    expect(service.hasModule('sales')).toBe(false);
    expect(service.hasModule('dashboard')).toBe(false);
  });

  it('should grant access to all modules when allowedModules includes "*"', () => {
    service.init(['*']);
    expect(service.hasModule('sales')).toBe(true);
    expect(service.hasModule('cash-register')).toBe(true);
    expect(service.hasModule('random-module')).toBe(true);
    expect(service.hasModule('purchases-receipts')).toBe(true);
    expect(service.hasModule('inventory-entries')).toBe(true);
    expect(service.hasAllModules).toBe(true);
  });

  it('should grant access to exact assigned modules', () => {
    service.init(['sales', 'cash-register']);
    expect(service.hasModule('sales')).toBe(true);
    expect(service.hasModule('cash-register')).toBe(true);
    expect(service.hasModule('customers')).toBe(false);
  });

  it('should resolve equivalent IDs and canonical moduleCodes', () => {
    service.init(['cash-register', 'inventory-stock', 'fraud-guardian']);
    expect(service.hasModule('cashregister')).toBe(true);
    expect(service.hasModule('inventory')).toBe(true);
    expect(service.hasModule('audit')).toBe(true);

    service.init(['sales']);
    expect(service.hasModule('mobile-pos')).toBe(true);
  });

  it('should allow dashboard if at least one module is assigned', () => {
    service.init(['sales']);
    expect(service.hasModule('dashboard')).toBe(true);
  });

  it('should allow profile for any authenticated user', () => {
    service.init(['sales']);
    expect(service.hasModule('profile')).toBe(true);
  });

  describe('Granular module access for goods receipts and inventory entries', () => {
    it('should NOT allow purchases-receipts if only parent purchases is assigned', () => {
      service.init(['purchases', 'purchases-orders']);
      expect(service.hasModule('purchases')).toBe(true);
      expect(service.hasModule('purchases-orders')).toBe(true);
      expect(service.hasModule('purchases-receipts')).toBe(false);
    });

    it('should allow purchases-receipts when explicitly assigned', () => {
      service.init(['purchases', 'purchases-receipts']);
      expect(service.hasModule('purchases-receipts')).toBe(true);
    });

    it('should NOT allow inventory-entries if only parent inventory is assigned', () => {
      service.init(['inventory', 'inventory-stock']);
      expect(service.hasModule('inventory')).toBe(true);
      expect(service.hasModule('inventory-stock')).toBe(true);
      expect(service.hasModule('inventory-entries')).toBe(false);
    });

    it('should allow inventory-entries when explicitly assigned', () => {
      service.init(['inventory', 'inventory-entries']);
      expect(service.hasModule('inventory-entries')).toBe(true);
    });

    it('should isolate all inventory submodules when only inventory-stock is assigned', () => {
      service.init(['inventory-stock']);
      expect(service.hasModule('inventory-stock')).toBe(true);
      expect(service.hasModule('inventory-entries')).toBe(false);
      expect(service.hasModule('inventory-outlets')).toBe(false);
      expect(service.hasModule('inventory-transfers')).toBe(false);
      expect(service.hasModule('inventory-warehouses')).toBe(false);
      expect(service.hasModule('inventory-manage-requests')).toBe(false);
      expect(service.hasModule('purchases-orders')).toBe(false);
      expect(service.hasModule('payments')).toBe(false);
    });

    it('should isolate purchases submodules when only purchases-orders is assigned', () => {
      service.init(['purchases-orders']);
      expect(service.hasModule('purchases-orders')).toBe(true);
      expect(service.hasModule('purchases-receipts')).toBe(false);
      expect(service.hasModule('purchases-suppliers')).toBe(false);
      expect(service.hasModule('payments')).toBe(false);
      expect(service.hasModule('inventory-entries')).toBe(false);
    });

    it('should require explicit assignment for payments, services, and credit-notes', () => {
      service.init(['sales', 'billing']);
      expect(service.hasModule('sales')).toBe(true);
      expect(service.hasModule('billing')).toBe(true);
      expect(service.hasModule('services')).toBe(false);
      expect(service.hasModule('credit-notes')).toBe(false);
      expect(service.hasModule('payments')).toBe(false);

      service.init(['services', 'credit-notes', 'payments']);
      expect(service.hasModule('services')).toBe(true);
      expect(service.hasModule('credit-notes')).toBe(true);
      expect(service.hasModule('payments')).toBe(true);
    });
  });

  it('should persist modules to sessionStorage when available', () => {
    const mockStorage: Record<string, string> = {};
    const fakeSessionStorage = {
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      getItem: (k: string) => mockStorage[k] || null,
      removeItem: (k: string) => { delete mockStorage[k]; },
      clear: () => {}
    };

    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.sessionStorage = fakeSessionStorage;

    service.init(['sales', 'customers']);
    expect(mockStorage['allowedModules']).toBe(JSON.stringify(['sales', 'customers']));
  });
});
