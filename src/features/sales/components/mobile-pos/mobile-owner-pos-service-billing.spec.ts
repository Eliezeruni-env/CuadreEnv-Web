import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MobileOwnerPosComponent } from './mobile-owner-pos.component';
import { ProductService } from '../../../products/services/product.service';
import { CategoryService } from '../../../products/services/category.service';
import { UnitOfMeasurementService } from '../../../products/services/unit-of-measurement.service';
import { ProductPackagingService } from '../../../products/services/product-packaging.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { BillingService } from '../../../billing/services/billing.service';
import { NcfSequenceService } from '../../../billing/services/ncf-sequence.service';
import { SaleService } from '../../services/sale.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { FraudGuardianService } from '../../../cash-register/services/fraud-guardian.service';
import { PosOfflineSyncService } from '../../services/pos-offline-sync.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { CompanyService } from '../../../companies/services/company.service';
import { ServiceService } from '../../../services/services/service.service';
import { ReceivableService } from '../../services/receivable.service';
import { Router } from '@angular/router';

describe('MobileOwnerPosComponent - Módulo de Facturar Servicios PWA', () => {
  let component: MobileOwnerPosComponent;
  let mockServiceService: any;
  let mockSaleService: any;
  let mockCashRegisterService: any;
  let mockReceivableService: any;
  let mockNotificationService: any;
  let mockAuthService: any;

  beforeEach(async () => {
    mockServiceService = {
      getServices: vi.fn().mockResolvedValue([
        { id: 101, code: 'SERV-101', name: 'Cambio de Aceite', price: 1500, categoryName: 'Taller', isActive: true },
        { id: 102, code: 'SERV-102', name: 'Diagnóstico Computarizado', price: 800, categoryName: 'Mano de Obra', isActive: true },
      ]),
      createService: vi.fn().mockImplementation((dto) => Promise.resolve({
        id: 999,
        code: 'SERV-999',
        name: dto.name,
        price: dto.price,
        categoryName: dto.categoryName || 'General',
        isActive: true,
      })),
    };

    mockSaleService = {
      createSale: vi.fn().mockResolvedValue({ success: true, data: { id: 777 } }),
      saveLocalSale: vi.fn(),
      getSales: vi.fn().mockResolvedValue({ data: [] }),
    };

    mockCashRegisterService = {
      getActiveSession: vi.fn().mockResolvedValue({
        success: true,
        data: { id: 1, name: 'Caja Móvil #01', isOpen: true, currentBalance: 5000 },
      }),
      getMovements: vi.fn().mockResolvedValue({ data: [] }),
      addMovement: vi.fn().mockResolvedValue({ success: true }),
    };

    mockReceivableService = {
      createReceivable: vi.fn().mockResolvedValue({ success: true, id: 888 }),
    };

    mockNotificationService = {
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      showApiError: vi.fn(),
    };

    mockAuthService = {
      currentUser: vi.fn().mockReturnValue({ id: 1, fullName: 'Pedro Dueño' }),
      currentRole: vi.fn().mockReturnValue('Dueño'),
      companyId: vi.fn().mockReturnValue(1),
      logout: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ProductService, useValue: { getPagedProducts: vi.fn().mockResolvedValue({ data: { items: [] } }), searchProducts: vi.fn().mockResolvedValue({ data: [] }) } },
        { provide: CategoryService, useValue: { getCategories: vi.fn().mockResolvedValue({ data: [] }) } },
        { provide: UnitOfMeasurementService, useValue: { getUnitsOfMeasurement: vi.fn().mockResolvedValue({ data: [] }) } },
        { provide: ProductPackagingService, useValue: { getPackaging: vi.fn().mockReturnValue(null) } },
        { provide: CashRegisterService, useValue: mockCashRegisterService },
        { provide: BillingService, useValue: { createBilling: vi.fn().mockResolvedValue({ data: { ncf: 'B0200000001' } }) } },
        { provide: NcfSequenceService, useValue: {} },
        { provide: SaleService, useValue: mockSaleService },
        { provide: CustomerService, useValue: { getCustomers: vi.fn().mockResolvedValue({ data: [] }) } },
        { provide: FraudGuardianService, useValue: { activeFlags: vi.fn().mockReturnValue([]) } },
        { provide: PosOfflineSyncService, useValue: { queueOfflineSale: vi.fn() } },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: CompanyService, useValue: { currentSettings: vi.fn().mockReturnValue({ companyName: 'Taller Express' }) } },
        { provide: ServiceService, useValue: mockServiceService },
        { provide: ReceivableService, useValue: mockReceivableService },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });

    component = TestBed.runInInjectionContext(() => new MobileOwnerPosComponent());
    await component.ngOnInit();
  });

  it('debe iniciar en la pestaña inicio y permitir navegar a facturar servicios directamente', () => {
    expect(component.activeTab()).toBe('inicio');
    component.openServiceBilling();
    expect(component.activeTab()).toBe('ventas');
    expect(component.salesCatalogType()).toBe('services');
    expect(component.services().length).toBe(2);
  });

  it('debe permitir agregar servicios al carrito y calcular subtotal, ITBIS y total correctamente', () => {
    const serv1 = { id: 101, code: 'SERV-101', name: 'Cambio de Aceite', price: 1500, categoryName: 'Taller', isActive: true };
    component.addServiceToCart(serv1);

    expect(component.serviceCart().length).toBe(1);
    expect(component.totalServiceCartCount()).toBe(1);
    expect(component.serviceCartSubtotal()).toBe(1500);
    // 18% ITBIS = 270
    expect(component.serviceCartItbis()).toBe(270);
    expect(component.serviceCartTotal()).toBe(1770);

    // Agregar de nuevo el mismo servicio debe incrementar la cantidad
    component.addServiceToCart(serv1);
    expect(component.serviceCart().length).toBe(1);
    expect(component.totalServiceCartCount()).toBe(2);
    expect(component.serviceCartSubtotal()).toBe(3000);
    expect(component.serviceCartItbis()).toBe(540);
    expect(component.serviceCartTotal()).toBe(3540);
  });

  it('debe permitir ajustar el precio de mano de obra en vivo desde el carrito', () => {
    const serv = { id: 101, code: 'SERV-101', name: 'Cambio de Aceite', price: 1500, categoryName: 'Taller', isActive: true };
    component.addServiceToCart(serv);

    // Ajustar precio a 2000
    component.updateServiceCartPrice(0, 2000);
    expect(component.serviceCart()[0].unitPrice).toBe(2000);
    expect(component.serviceCartSubtotal()).toBe(2000);
    expect(component.serviceCartItbis()).toBe(360);
    expect(component.serviceCartTotal()).toBe(2360);
  });

  it('debe permitir alternar el ITBIS (exento o aplicado) en los servicios', () => {
    const serv = { id: 102, code: 'SERV-102', name: 'Diagnóstico', price: 1000, isActive: true };
    component.addServiceToCart(serv);
    expect(component.serviceApplyItbis()).toBe(true);
    expect(component.serviceCartTotal()).toBe(1180);

    // Desactivar ITBIS
    component.toggleServiceItbis();
    expect(component.serviceApplyItbis()).toBe(false);
    expect(component.serviceCartItbis()).toBe(0);
    expect(component.serviceCartTotal()).toBe(1000);
  });

  it('debe permitir crear un servicio rápido on-the-fly y agregarlo inmediatamente', async () => {
    component.openQuickServiceCreateModal();
    expect(component.isQuickServiceCreateModalOpen()).toBe(true);

    component.newServiceName.set('Alineación Láser');
    component.newServicePrice.set(1200);
    component.newServiceCategory.set('Alineación');

    await component.confirmQuickServiceCreate();

    expect(mockServiceService.createService).toHaveBeenCalledWith({
      name: 'Alineación Láser',
      price: 1200,
      categoryName: 'Alineación',
      isActive: true,
    });
    expect(component.isQuickServiceCreateModalOpen()).toBe(false);
    expect(component.serviceCart().some((s) => s.serviceName === 'Alineación Láser')).toBe(true);
  });

  it('debe procesar la venta de servicios en efectivo registrando entrada en la caja y generando comprobante', async () => {
    const serv = { id: 101, code: 'SERV-101', name: 'Cambio de Aceite', price: 1500, isActive: true };
    component.addServiceToCart(serv);

    component.servicePaymentMode.set('Efectivo');
    component.serviceCustomerName.set('Carlos Méndez');
    component.serviceNotes.set('Aceite sintético 5W-30');

    await component.processMobileServiceSale();

    expect(mockSaleService.createSale).toHaveBeenCalled();
    expect(mockCashRegisterService.addMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Entrada',
        category: 'Ventas',
        amount: 1770,
      })
    );
    expect(component.isServiceSuccessModalOpen()).toBe(true);
    expect(component.lastServiceSaleSummary()?.folio).toContain('SERV-M-');
    expect(component.lastServiceSaleSummary()?.customerName).toBe('Carlos Méndez');
    expect(component.serviceCart().length).toBe(0);
  });

  it('debe procesar la venta de servicios a crédito registrando una cuenta por cobrar (CxC)', async () => {
    const serv = { id: 101, code: 'SERV-101', name: 'Reparación Motor', price: 5000, isActive: true };
    component.addServiceToCart(serv);

    component.servicePaymentMode.set('Credito');
    component.serviceCustomerName.set('Transportes Quisqueya');
    component.serviceDueDate.set('2026-11-30');

    await component.processMobileServiceSale();

    expect(mockSaleService.createSale).toHaveBeenCalledWith(
      expect.objectContaining({
        originChannel: 'SERVICIO',
        paymentType: 'CREDIT',
      })
    );
    expect(mockReceivableService.createReceivable).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Transportes Quisqueya',
        totalAmount: 5900,
        startDate: '2026-11-30',
      })
    );
    expect(component.isServiceSuccessModalOpen()).toBe(true);
    expect(component.lastServiceSaleSummary()?.paymentMode).toBe('Crédito (CxC)');
  });
});
