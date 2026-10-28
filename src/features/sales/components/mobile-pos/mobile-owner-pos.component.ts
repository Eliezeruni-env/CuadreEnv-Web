import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  inject,
  signal,
  computed,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { getCompanyId } from '../../../cuadreEnv/services/apiClient';
import { ProductService } from '../../../products/services/product.service';
import { CategoryService } from '../../../products/services/category.service';
import {
  UnitOfMeasurementService,
  type UnitOfMeasurement,
} from '../../../products/services/unit-of-measurement.service';
import {
  ProductPackagingService,
  type ProductPackaging,
} from '../../../products/services/product-packaging.service';
import {
  CashRegisterService,
  type CashRegisterSessionDto,
} from '../../../cash-register/services/cash-register.service';
import { BillingService } from '../../../billing/services/billing.service';
import { NcfSequenceService } from '../../../billing/services/ncf-sequence.service';
import { SaleService } from '../../services/sale.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { FraudGuardianService } from '../../../cash-register/services/fraud-guardian.service';
import { PosOfflineSyncService } from '../../services/pos-offline-sync.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import {
  CompanyService,
  DEFAULT_BANK_ACCOUNTS,
} from '../../../companies/services/company.service';
import { CloseRegisterModalComponent } from '../../../cash-register/components/cash-register/close-register-modal.component';
import { PwaControlBarComponent } from '../../../cuadreEnv/components/pwa-control-bar/pwa-control-bar.component';
import { ServiceService } from '../../../services/services/service.service';
import {
  ReceivableService,
  type ReceivableDto,
} from '../../services/receivable.service';
import { ThemeService } from '../../../cuadreEnv/services/theme.service';
import {
  PosDraftStorageService,
  type PosHeldSale,
  type PosDraftItem,
} from '../../services/pos-draft-storage.service';
import {
  ThermalPrinterService,
  type TicketData,
} from '../../services/thermal-printer.service';
import {
  triggerHaptic,
  triggerHapticSuccess,
} from '../../../cuadreEnv/utils/haptics';
import { soundEffects } from '../../../cuadreEnv/utils/sound-effects';
import {
  WhatsAppShareService,
  type WhatsAppInvoiceData,
  type WhatsAppDebtPaymentData,
} from '../../services/whatsapp-share.service';
import {
  getRDGreeting,
  formatDateInRD,
  formatTimeInRD,
  formatDateTimeInRD,
  formatInvoiceDateTime,
  formatInvoiceDate,
  formatInvoiceTime,
} from '../../../cuadreEnv/utils/rd-date.util';
import { generateBarcodeSvg } from '../../../cuadreEnv/utils/barcode.util';

import type {
  ProductDto,
  CompanyBankAccountDto,
} from '../../../cuadreEnv/types/api';
import type { HeaderDto, ProductDetails } from '../../../../app/models/billing';
import type { ServiceItemDto } from '../../../services/models/service-item.model';

export interface MobileServiceCartItem {
  serviceId: number;
  serviceCode: string;
  serviceName: string;
  categoryName?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  itbis: number;
  total: number;
}

export interface MobileCartItem {
  product: ProductDto;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  itbis: number;
  total: number;
  unitSymbol?: string;
  allowsDecimals?: boolean;
  saleMode?: 'detail' | 'package' | 'individual';
  modeLabel?: string;
  conversionFactor?: number;
  deductionQuantity?: number;
}

export interface MobileClientOption {
  id: number;
  name: string;
  rnc: string;
  type: string;
}

function getStableDeviceId(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    let id = localStorage.getItem('cuadre_device_id');
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'device-' + Math.random().toString(36).substring(2, 12);
      localStorage.setItem('cuadre_device_id', id);
    }
    return id;
  }
  return 'web-browser';
}

@Component({
  selector: 'app-mobile-owner-pos',
  templateUrl: './mobile-owner-pos.component.html',
  styleUrls: ['./mobile-owner-pos.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CloseRegisterModalComponent,
    PwaControlBarComponent,
  ],
})
export class MobileOwnerPosComponent implements OnInit, OnDestroy {
  readonly Math = Math;
  private readonly sanitizer = inject(DomSanitizer);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  readonly unitService = inject(UnitOfMeasurementService);
  readonly packagingService = inject(ProductPackagingService);
  private readonly cashRegisterService = inject(CashRegisterService);
  private readonly billingService = inject(BillingService);
  private readonly ncfService = inject(NcfSequenceService);
  private readonly saleService = inject(SaleService);
  private readonly customerService = inject(CustomerService);
  readonly fraudService = inject(FraudGuardianService);
  private readonly offlineSyncService = inject(PosOfflineSyncService);
  readonly notificationService = inject(NotificationService);
  readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);
  private readonly serviceService = inject(ServiceService);
  private readonly receivableService = inject(ReceivableService);
  private readonly router = inject(Router);
  readonly whatsAppShareService = inject(WhatsAppShareService);

  @ViewChild('closeRegisterModal')
  closeRegisterModal?: CloseRegisterModalComponent;

  readonly themeService = inject(ThemeService);
  readonly isDarkMode = computed(() => this.themeService.isDark);
  readonly draftStorageService = inject(PosDraftStorageService);
  isHeldSalesModalOpen = signal<boolean>(false);

  // =========================================================================
  // Mobile Session Authentication (Reconoce sesión existente sin doble login)
  // =========================================================================
  readonly isMobileAuthenticated = signal<boolean>(
    typeof window !== 'undefined' && this.authService.isAuthenticated(),
  );

  readonly isFullscreen = signal<boolean>(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );

  mobileLoginEmail =
    (typeof window !== 'undefined' &&
      (localStorage.getItem('cuadre_remember_user') ||
        localStorage.getItem('cuadre_last_mobile_email') ||
        localStorage.getItem('cuadre_last_email') ||
        localStorage.getItem('userEmail') ||
        '')) ||
    '';
  mobileLoginPassword = '';
  mobileRememberUser =
    typeof window !== 'undefined'
      ? localStorage.getItem('cuadre_remember_me_checked') !== 'false'
      : true;
  isMobileLoggingIn = signal<boolean>(false);
  mobileLoginError = signal<string | null>(null);
  showMobilePassword = signal<boolean>(false);

  // Recuperación de Contraseña en Mobile
  isMobileForgotPasswordModalOpen = signal<boolean>(false);
  mobileForgotEmail = signal<string>('');
  isMobileForgotSubmitting = signal<boolean>(false);
  mobileForgotSuccess = signal<string | null>(null);
  mobileForgotError = signal<string | null>(null);

  // Active Bottom Navigation Tab: Inicio | Ventas | Caja | Fiao | Más
  activeTab = signal<'inicio' | 'ventas' | 'caja' | 'fiao' | 'mas'>('inicio');

  // Fiao (Deudas) Module State
  fiaoList = signal<ReceivableDto[]>([]);
  isLoadingFiao = signal<boolean>(false);
  fiaoSearchTerm = signal<string>('');
  isFiaoPaymentModalOpen = signal<boolean>(false);
  selectedFiaoForPayment = signal<ReceivableDto | null>(null);
  fiaoPaymentAmount = signal<number>(0);
  fiaoPaymentMethod = signal<'Efectivo' | 'Tarjeta' | 'Transferencia'>(
    'Efectivo',
  );
  fiaoPaymentNotes = signal<string>('');

  readonly filteredFiaoList = computed(() => {
    const term = this.fiaoSearchTerm().trim().toLowerCase();
    const list = this.fiaoList();
    if (!term) return list;
    return list.filter(
      (item) =>
        (item.customerName || '').toLowerCase().includes(term) ||
        (item.invoiceNumber || '').toLowerCase().includes(term) ||
        (item.customerPhone || '').toLowerCase().includes(term) ||
        (item.description || '').toLowerCase().includes(term),
    );
  });

  readonly totalPendingFiaoAmount = computed(() => {
    return this.fiaoList().reduce(
      (sum, item) => sum + (item.pendingAmount || 0),
      0,
    );
  });

  readonly totalPendingFiaoCount = computed(() => {
    return this.fiaoList().filter((item) => (item.pendingAmount || 0) > 0)
      .length;
  });

  // Loading & State
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  isSideMenuOpen = signal<boolean>(false);
  isClientsModalOpen = signal<boolean>(false);
  isCloseModalOpen = signal<boolean>(false);

  // Fast Mobile Cash Register State (Apertura, Movimientos y Cierre Express)
  isMobileOpenRegisterModalOpen = signal<boolean>(false);
  mobileOpeningAmount = signal<number>(0);
  mobileOpeningNotes = signal<string>('');

  isMobileMovementModalOpen = signal<boolean>(false);
  mobileMovementType = signal<'Entrada' | 'Retiro'>('Entrada');
  mobileMovementAmount = signal<number>(0);
  mobileMovementDescription = signal<string>('');

  isMobileCloseRegisterModalOpen = signal<boolean>(false);
  mobileClosingDeclaredCash = signal<number>(0);
  mobileClosingNotes = signal<string>('');
  readonly mobileExpectedCash = computed(() => this.totalCashInDrawers());
  readonly mobileClosingDifference = computed(
    () => (this.mobileClosingDeclaredCash() || 0) - this.mobileExpectedCash(),
  );

  // Network status
  isOnline = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Detectar si está en dispositivo móvil o vista móvil exclusiva
  readonly isMobileScreen = computed(() => {
    if (typeof window === 'undefined') return true;
    return (
      window.innerWidth <= 768 ||
      /android|iphone|ipad|ipod|mobile/i.test(
        navigator.userAgent.toLowerCase(),
      ) ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    );
  });

  // User Greeting & Context (Data Real del Tenant sincronizado con hora RD)
  readonly greeting = computed(() => {
    return getRDGreeting();
  });

  readonly userName = computed(() => {
    const user = this.authService.currentUser();
    if (user?.fullName?.trim()) return user.fullName.trim().split(' ')[0];
    if (user?.email?.trim()) return user.email.trim().split('@')[0];
    return 'Usuario';
  });

  readonly tenantName = computed(() => {
    const s = this.companyService.currentSettings();
    const commercial = s.commercialName?.trim();
    if (commercial) return commercial;
    const company = s.companyName?.trim();
    if (company) return company;

    const activeComp = this.authService.activeCompany();
    if (activeComp?.commercialName?.trim())
      return activeComp.commercialName.trim();
    if (activeComp?.name?.trim()) return activeComp.name.trim();

    const cid = this.authService.companyId();
    return cid ? `Empresa #${cid}` : 'Mi Negocio';
  });

  readonly companyLegalName = computed(() => {
    const s = this.companyService.currentSettings();
    return (
      s.companyName?.trim() ||
      this.authService.activeCompany()?.name?.trim() ||
      this.tenantName()
    );
  });

  readonly companyRnc = computed(() => {
    return (
      this.companyService.currentSettings().rnc?.trim() ||
      this.authService.activeCompany()?.rnc?.trim() ||
      ''
    );
  });

  readonly companyPhone = computed(() => {
    return this.companyService.currentSettings().phone?.trim() || '';
  });

  readonly companyAddress = computed(() => {
    return this.companyService.currentSettings().address?.trim() || '';
  });

  readonly companyLogo = computed(() => {
    const logo = this.companyService.currentSettings().logoUrl?.trim();
    return logo && logo.length > 5 ? logo : null;
  });

  // Active Cash Register Sessions
  activeSessions = signal<CashRegisterSessionDto[]>([]);

  readonly activeSession = computed<CashRegisterSessionDto | null>(() => {
    return this.activeSessions().length > 0 ? this.activeSessions()[0] : null;
  });

  readonly totalCashInDrawers = computed(() => {
    const session = this.activeSession();
    return session ? (session.currentBalance ?? session.initialAmount ?? 0) : 0;
  });

  // Sales KPIs of the day (Cálculo real sobre las ventas de la sesión y el tenant)
  todaySalesTotal = signal<number>(0);
  todayInvoicesCount = signal<number>(0);
  averageTicketDop = computed(() => {
    const count = this.todayInvoicesCount();
    return count > 0 ? this.todaySalesTotal() / count : 0;
  });

  // Recent cash movements in "Mi Caja" (Data real desde el backend /CashMovement)
  recentMovements = signal<
    { type: string; description: string; amount: number; time: string }[]
  >([]);

  // Clients Directory for quick select (Data real de clientes del tenant)
  clientsList = signal<MobileClientOption[]>([
    { id: 1, name: 'Consumidor Final', rnc: '000-0000000-0', type: 'Contado' },
  ]);
  selectedCustomerId = signal<number | null>(null);

  // Products Catalog & Search
  products = signal<ProductDto[]>([]);
  categories = signal<{ id: number | null; label: string }[]>([
    { id: null, label: 'Todos' },
  ]);
  unitsList = signal<UnitOfMeasurement[]>([]);
  selectedCategoryId = signal<number | null>(null);
  searchTerm = signal<string>('');

  // Catalog Switch in Ventas Tab: 'products' | 'services'
  salesCatalogType = signal<'products' | 'services'>('products');

  // Services Catalog & Search
  services = signal<ServiceItemDto[]>([]);
  isLoadingServices = signal<boolean>(false);
  servicesSearchTerm = signal<string>('');
  selectedServiceCategory = signal<string>('Todos');

  readonly printerService = inject(ThermalPrinterService);

  // Shopping Cart & Modals
  cart = signal<MobileCartItem[]>([]);
  cartBadgeBounce = signal<boolean>(false);
  isCartDrawerOpen = signal<boolean>(false);
  isPaymentModalOpen = signal<boolean>(false);
  isSuccessModalOpen = signal<boolean>(false);
  lastSaleSummary = signal<{
    folio: string;
    ncf: string;
    total: number;
    subtotal?: number;
    itbis?: number;
    amountReceived?: number;
    change?: number;
    paymentMethod?: string;
    customerName: string;
    customerPhone?: string;
    date?: Date | string;
    formattedDate?: string;
    items?: {
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }[];
  } | null>(null);
  ticketCustomerPhone = signal<string>('');

  getNow(): Date {
    return new Date();
  }

  // Abono a Fiao (Recibo WhatsApp en 1 toque)
  isFiaoReceiptModalOpen = signal<boolean>(false);
  lastFiaoReceiptData = signal<WhatsAppDebtPaymentData | null>(null);
  fiaoReceiptCustomerPhone = signal<string>('');

  // Cash Register Anti-Freeze & Operations
  mobilePendingOperationsError = signal<string | null>(null);
  isCancellingPendingSales = signal<boolean>(false);

  // Top Selling Products & Stock Entry
  topSellers = signal<{ name: string; quantity: number; revenue: number }[]>(
    [],
  );
  isStockEntryModalOpen = signal<boolean>(false);
  stockEntryProductId = signal<number | null>(null);
  stockEntryQuantity = signal<number>(1);
  stockEntryCost = signal<number>(0);
  stockEntryNotes = signal<string>('');
  isSubmittingStockEntry = signal<boolean>(false);

  // Camera Barcode Scanner
  isCameraScannerOpen = signal<boolean>(false);
  private cameraStream: MediaStream | null = null;
  private scanInterval: any = null;
  private zxingReader: BrowserMultiFormatReader | null = null;
  private zxingControls: IScannerControls | null = null;

  // Service Shopping Cart & Modals
  serviceCart = signal<MobileServiceCartItem[]>([]);
  isServiceCartDrawerOpen = signal<boolean>(false);
  isServicePaymentModalOpen = signal<boolean>(false);
  isServiceSuccessModalOpen = signal<boolean>(false);
  isQuickServiceCreateModalOpen = signal<boolean>(false);

  // Service Checkout state
  servicePaymentMode = signal<
    'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Credito'
  >('Efectivo');
  serviceApplyItbis = signal<boolean>(true);
  serviceCustomerName = signal<string>('Consumidor Final');
  serviceSelectedCustomerId = signal<number | null>(null);
  serviceCustomerPhone = signal<string>('');
  serviceNotes = signal<string>('');
  serviceDueDate = signal<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  );
  serviceAmountReceived = signal<number>(0);
  lastServiceSaleSummary = signal<{
    folio: string;
    ncf: string;
    total: number;
    customerName: string;
    customerPhone?: string;
    paymentMode: string;
    notes?: string;
    date?: Date | string;
    formattedDate?: string;
    items: { name: string; quantity: number; price: number; total: number }[];
  } | null>(null);

  // Quick Service Creation
  newServiceName = signal<string>('');
  newServicePrice = signal<number>(500);
  newServiceCategory = signal<string>('Servicios Generales');

  // Measurement / Quantity modal for products sold by unit of measurement (peso / granel / decimal)
  isMeasurementModalOpen = signal<boolean>(false);
  selectedProductForMeasurement = signal<ProductDto | null>(null);
  measurementQuantity = signal<number>(1);
  measurementCartIndex = signal<number | null>(null);
  measurementMode = signal<'detail' | 'package' | 'individual'>('detail');
  activeProductPackaging = signal<ProductPackaging | null>(null);

  // Product Photo & Literal Barcode Preview
  selectedProductForPhotoModal = signal<ProductDto | null>(null);

  openProductPhotoPreviewModal(prod: ProductDto): void {
    this.selectedProductForPhotoModal.set(prod);
  }

  closeProductPhotoPreviewModal(): void {
    this.selectedProductForPhotoModal.set(null);
  }

  getBarcodeSvgForProduct(code?: string | null): SafeHtml {
    const cleanCode = (code || '000000').trim();
    const rawSvg = generateBarcodeSvg(cleanCode, 52, 2.0);
    return this.sanitizer.bypassSecurityTrustHtml(rawSvg);
  }

  // Checkout inputs
  ncfType = signal<string>('B02');
  selectedMethod = signal<'Efectivo' | 'Tarjeta' | 'Transferencia'>('Efectivo');
  amountReceived = signal<number>(0);
  customerName = signal<string>('Consumidor Final');
  customerPhone = signal<string>('');

  // =========================================================================
  // SPEED POS: DESCUENTOS RÁPIDOS AL PEDIDO (%, RD$ FIJO, REDONDEO)
  // =========================================================================
  cartDiscountType = signal<'none' | 'percent' | 'fixed' | 'round'>('none');
  cartDiscountValue = signal<number>(0);

  readonly totalCartItemsCount = computed(() => {
    return this.cart().reduce((sum, item) => sum + item.quantity, 0);
  });

  readonly cartSubtotal = computed(() => {
    return this.cart().reduce((sum, item) => sum + item.subtotal, 0);
  });

  readonly cartItbis = computed(() => {
    return this.cart().reduce((sum, item) => sum + item.itbis, 0);
  });

  readonly rawCartTotal = computed(() => {
    return this.cart().reduce((sum, item) => sum + item.total, 0);
  });

  readonly cartDiscountAmount = computed(() => {
    const type = this.cartDiscountType();
    const val = this.cartDiscountValue();
    const rawTot = this.rawCartTotal();
    if (rawTot <= 0 || type === 'none') return 0;

    if (type === 'percent') {
      return (
        Math.round(rawTot * (Math.min(100, Math.max(0, val)) / 100) * 100) / 100
      );
    }
    if (type === 'fixed') {
      return Math.min(rawTot, Math.max(0, val));
    }
    if (type === 'round') {
      const diff = Math.round((rawTot - Math.floor(rawTot)) * 100) / 100;
      return diff > 0 ? diff : 0;
    }
    return 0;
  });

  readonly cartTotal = computed(() => {
    const finalAmount = this.rawCartTotal() - this.cartDiscountAmount();
    return Math.max(0, Math.round(finalAmount * 100) / 100);
  });

  readonly changeDue = computed(() => {
    if (this.selectedMethod() !== 'Efectivo') return 0;
    const received = this.amountReceived() || 0;
    const tot = this.cartTotal();
    return Math.max(0, received - tot);
  });

  // =========================================================================
  // SPEED POS: VENTA RÁPIDA / MONTO MANUAL (ARTÍCULO NO CATALOGADO)
  // =========================================================================
  isQuickAmountModalOpen = signal<boolean>(false);
  quickAmountValue = signal<number>(100);
  quickAmountDescription = signal<string>('Artículo Libre / Varios');
  quickAmountWithTax = signal<boolean>(false);
  quickAmountQuantity = signal<number>(1);

  // =========================================================================
  // SPEED POS: ESCÁNER EN RÁFAGA (CÁMARA + ESCÁNER FÍSICO USB/BLUETOOTH)
  // =========================================================================
  cameraScanFlash = signal<boolean>(false);
  cameraLastScannedItem = signal<{
    name: string;
    price: number;
    time: string;
  } | null>(null);
  cameraBurstScannedCount = signal<number>(0);
  isTorchAvailable = signal<boolean>(false);
  isTorchOn = signal<boolean>(false);

  private lastCameraScanCode = '';
  private lastCameraScanTime = 0;

  // Buffer para lectores de código de barras físicos (pistolas USB / Bluetooth)
  private hardwareBarcodeBuffer = '';
  private lastHardwareKeyTime = 0;

  // =========================================================================
  // FINTECH: DATOS BANCARIOS Y QR PARA PAGO POR TRANSFERENCIA
  // =========================================================================
  selectedBankAccountId = signal<string>('POPULAR');
  readonly availableBankAccounts = computed<CompanyBankAccountDto[]>(() => {
    const list = this.companyService.currentSettings().bankAccounts;
    return list && list.length > 0 ? list : DEFAULT_BANK_ACCOUNTS;
  });
  readonly activeBankAccount = computed<CompanyBankAccountDto>(() => {
    const list = this.availableBankAccounts();
    return (
      list.find((b) => b.id === this.selectedBankAccountId()) ||
      list[0] ||
      DEFAULT_BANK_ACCOUNTS[0]
    );
  });
  transferReferenceNumber = signal<string>('');
  isBankQrModalOpen = signal<boolean>(false);
  isBankCopied = signal<boolean>(false);

  readonly bankTransferQrUrl = computed(() => {
    const acc = this.activeBankAccount();
    const total = this.cartTotal();
    const tenant = this.tenantName();
    const text = `PAGO TRANSFERENCIA\nBanco: ${acc.bankName}\nCuenta: ${acc.accountNumber} (${acc.accountType})\nTitular: ${acc.holderName}\nRNC: ${acc.holderRnc || 'N/A'}\nMonto: RD$ ${total.toFixed(2)}\nComercio: ${tenant}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(text)}`;
  });

  public isServiceItem(p: any): boolean {
    if (!p) return false;
    if (p.isService === true || p.type === 'service' || p.type === 'Servicio')
      return true;
    if (p.productTypeId === 2 || p.ProductTypeId === 2) return true;
    if (p.invoiceWithoutStock === true) return true;

    const code = String(p.barcode || p.reference || p.code || '')
      .toUpperCase()
      .trim();
    if (code.startsWith('SERV-') || code.startsWith('SERV')) return true;

    const typeName = String(
      p.productTypeName || p.productType?.name || p.ProductType?.Name || '',
    ).toLowerCase();
    if (typeName.includes('serv')) return true;

    const catName = String(
      p.categoryName ||
        p.category?.description ||
        p.category?.name ||
        p.CategoryName ||
        '',
    ).toLowerCase();
    if (catName.includes('serv')) return true;

    return false;
  }

  readonly filteredProducts = computed(() => {
    const activeCid =
      this.authService.companyId() || Number(getCompanyId()) || 0;
    const term = (this.searchTerm() || '').toLowerCase().trim();
    const catId = this.selectedCategoryId();

    return this.products().filter((p) => {
      // RULE: Services are intangible labor and cannot be sold in POS / Cash Register
      if (this.isServiceItem(p)) {
        return false;
      }

      // Aislamiento multi-tenant: nunca mostrar productos de otra empresa
      const pCid = p.companyId ?? (p as any).CompanyId;
      if (
        activeCid > 0 &&
        pCid != null &&
        Number(pCid) > 0 &&
        Number(pCid) !== activeCid
      ) {
        return false;
      }

      const prodCatId =
        p.categoryId ?? (p as any).category?.id ?? (p as any).productCategoryId;
      const matchCat =
        catId === null ||
        (prodCatId != null && Number(prodCatId) === Number(catId));
      const matchSearch =
        !term ||
        (p.description || '').toLowerCase().includes(term) ||
        (p.barcode || '').toLowerCase().includes(term) ||
        (p.reference || '').toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
  });

  readonly serviceCategories = computed(() => {
    const list = this.services();
    const categoriesSet = new Set<string>();
    categoriesSet.add('Todos');
    list.forEach((s) => {
      if (s.categoryName && s.categoryName.trim()) {
        categoriesSet.add(s.categoryName.trim());
      }
    });
    return Array.from(categoriesSet);
  });

  readonly filteredServices = computed(() => {
    const term = (this.servicesSearchTerm() || '').toLowerCase().trim();
    const selectedCat = this.selectedServiceCategory();

    return this.services().filter((s) => {
      const matchCat =
        !selectedCat ||
        selectedCat === 'Todos' ||
        (s.categoryName && s.categoryName.trim() === selectedCat);
      const matchSearch =
        !term ||
        (s.name || '').toLowerCase().includes(term) ||
        (s.code || '').toLowerCase().includes(term) ||
        (s.description || '').toLowerCase().includes(term) ||
        (s.categoryName || '').toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
  });

  readonly totalServiceCartCount = computed(() => {
    return this.serviceCart().reduce((sum, item) => sum + item.quantity, 0);
  });

  readonly serviceCartSubtotal = computed(() => {
    return this.serviceCart().reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
  });

  readonly serviceCartItbis = computed(() => {
    return this.serviceApplyItbis()
      ? Math.round(this.serviceCartSubtotal() * 0.18 * 100) / 100
      : 0;
  });

  readonly serviceCartTotal = computed(() => {
    return (
      Math.round((this.serviceCartSubtotal() + this.serviceCartItbis()) * 100) /
      100
    );
  });

  readonly serviceChangeDue = computed(() => {
    if (this.servicePaymentMode() !== 'Efectivo') return 0;
    const received = this.serviceAmountReceived() || 0;
    const tot = this.serviceCartTotal();
    return Math.max(0, received - tot);
  });

  getItemCartCount(productId: number | undefined): number {
    if (!productId) return 0;
    const item = this.cart().find((c) => c.product.id === productId);
    return item ? item.quantity : 0;
  }

  getServiceCartCount(serviceId: number | undefined): number {
    if (!serviceId) return 0;
    const item = this.serviceCart().find((c) => c.serviceId === serviceId);
    return item ? item.quantity : 0;
  }

  private syncInterval: any = null;
  private onWindowFocusHandler = () => {
    if (this.authService.isAuthenticated()) {
      void this.loadExecutiveData();
    }
  };
  private onVisibilityChangeHandler = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && this.authService.isAuthenticated()) {
      void this.loadExecutiveData();
    }
  };
  private onCashRegisterChangedHandler = () => {
    if (this.authService.isAuthenticated()) {
      void this.loadExecutiveData();
    }
  };

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
      window.addEventListener('focus', this.onWindowFocusHandler);
      window.addEventListener('cuadre_cash_register_changed', this.onCashRegisterChangedHandler);
      // Sincronización continua de caja y sesión entre PC y móvil cada 15s
      this.syncInterval = setInterval(() => {
        if (this.authService.isAuthenticated()) {
          void this.loadExecutiveData();
        }
      }, 15000);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', () => {
        this.isFullscreen.set(!!document.fullscreenElement);
      });
      document.addEventListener('visibilitychange', this.onVisibilityChangeHandler);
    }
    // Cargar siempre datos de configuración de empresa de la sesión
    this.companyService.getCompanySettings().catch(() => {});
    if (this.authService.isAuthenticated()) {
      this.isMobileAuthenticated.set(true);
      if (this.authService.userCompanies().length === 0) {
        this.authService.loadUserCompanies().catch(() => {});
      }
      this.initMobileData();
    }
  }

  ngOnDestroy(): void {
    this.closeCameraScanner();
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onWindowFocusHandler);
      window.removeEventListener('cuadre_cash_register_changed', this.onCashRegisterChangedHandler);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChangeHandler);
    }
  }

  async initMobileData(): Promise<void> {
    try {
      await Promise.allSettled([
        this.companyService.getCompanySettings(),
        this.authService.loadUserCompanies(),
      ]);
    } catch {}
    this.loadExecutiveData();
    this.loadCatalog();
    this.loadServicesCatalog();
    this.loadFiaoList();
  }

  async loginMobile(): Promise<void> {
    const email = (this.mobileLoginEmail || '').trim();
    const password = (this.mobileLoginPassword || '').trim();

    if (!email) {
      this.mobileLoginError.set(
        'Por favor ingresa tu correo electrónico o usuario.',
      );
      return;
    }

    if (!password) {
      this.mobileLoginError.set('Por favor ingresa tu contraseña.');
      return;
    }

    this.isMobileLoggingIn.set(true);
    this.mobileLoginError.set(null);

    try {
      const deviceId = getStableDeviceId();
      await this.authService.login({
        email,
        password,
        deviceId,
      });

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('cuadre_mobile_session_active', 'true');
        sessionStorage.setItem('cuadre_mobile_logged_email', email);
        if (this.mobileRememberUser) {
          localStorage.setItem('cuadre_remember_user', email);
          localStorage.setItem('cuadre_remember_me_checked', 'true');
          localStorage.setItem('cuadre_last_mobile_email', email);
          localStorage.setItem('cuadre_last_email', email);
        } else {
          localStorage.removeItem('cuadre_remember_user');
          localStorage.setItem('cuadre_remember_me_checked', 'false');
        }
      }

      this.isMobileAuthenticated.set(true);
      this.notificationService.success(`Bienvenido a CuadreEnv Móvil`);
      await this.initMobileData();
    } catch (err: any) {
      const responseBody = err?.error ?? err?.response?.data;
      const serverMsg =
        typeof responseBody?.message === 'string'
          ? responseBody.message
          : typeof err?.message === 'string'
            ? err.message
            : 'Credenciales inválidas o error de conexión.';
      this.mobileLoginError.set(serverMsg);
    } finally {
      this.isMobileLoggingIn.set(false);
    }
  }

  openMobileForgotPasswordModal(): void {
    this.mobileForgotEmail.set(this.mobileLoginEmail || '');
    this.mobileForgotSuccess.set(null);
    this.mobileForgotError.set(null);
    this.isMobileForgotPasswordModalOpen.set(true);
    triggerHaptic(15);
  }

  closeMobileForgotPasswordModal(): void {
    this.isMobileForgotPasswordModalOpen.set(false);
  }

  async submitMobileForgotPassword(): Promise<void> {
    const email = (this.mobileForgotEmail() || '').trim();
    if (!email || !email.includes('@')) {
      this.mobileForgotError.set('Por favor ingresa un correo electrónico válido.');
      return;
    }
    this.isMobileForgotSubmitting.set(true);
    this.mobileForgotError.set(null);
    this.mobileForgotSuccess.set(null);
    try {
      const res = await this.authService.forgotPassword(email);
      this.mobileForgotSuccess.set(
        res.message || 'Hemos enviado las instrucciones para restablecer tu contraseña a tu correo.'
      );
      this.notificationService.success('Instrucciones de recuperación enviadas.');
      triggerHaptic(25);
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'No se pudo procesar la solicitud. Verifica el correo.';
      this.mobileForgotError.set(msg);
    } finally {
      this.isMobileForgotSubmitting.set(false);
    }
  }

  // =========================================================================
  // LOGOUT CONFIRMATION MODAL & PENDING CHANGES AUDIT
  // =========================================================================
  isLogoutConfirmModalOpen = signal<boolean>(false);

  readonly hasPendingChangesOnLogout = computed(() => {
    const hasCart = this.cart().length > 0;
    const hasServiceCart = this.serviceCart().length > 0;
    const hasHeld = (this.draftStorageService.heldSales() || []).length > 0;
    const hasOpenCash = this.activeSessions().some((s) => s.isOpen);
    return hasCart || hasServiceCart || hasHeld || hasOpenCash;
  });

  readonly pendingChangesReasons = computed(() => {
    const reasons: string[] = [];
    const cartCount = this.totalCartItemsCount();
    if (cartCount > 0) {
      reasons.push(`${cartCount} artículo(s) sin facturar en el carrito de ventas`);
    }
    const serviceCount = this.totalServiceCartCount();
    if (serviceCount > 0) {
      reasons.push(`${serviceCount} servicio(s) sin facturar en el carrito`);
    }
    const heldCount = (this.draftStorageService.heldSales() || []).length;
    if (heldCount > 0) {
      reasons.push(`${heldCount} venta(s) guardadas en espera (Held Sales)`);
    }
    const openCash = this.activeSessions().find((s) => s.isOpen);
    if (openCash) {
      reasons.push(`El turno de caja registradora #${openCash.id} continúa abierto sin cuadre`);
    }
    return reasons;
  });

  requestLogout(): void {
    triggerHaptic(20);
    this.isLogoutConfirmModalOpen.set(true);
  }

  cancelLogout(): void {
    this.isLogoutConfirmModalOpen.set(false);
  }

  async confirmLogout(): Promise<void> {
    this.isLogoutConfirmModalOpen.set(false);
    await this.logout();
  }

  logoutMobile(): void {
    this.requestLogout();
  }

  async logout(): Promise<void> {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('cuadre_mobile_session_active');
    }
    this.isMobileAuthenticated.set(false);
    this.mobileLoginPassword = '';
    await this.authService.logout();
    this.notificationService.info('Terminal móvil bloqueada / sesión cerrada.');
    await this.router.navigate(['/login']);
  }

  async loadExecutiveData(): Promise<void> {
    try {
      // 1. Cargar sesión activa real de caja
      const sessionRes = await this.cashRegisterService.getActiveSession();
      if (sessionRes?.data && sessionRes.data.isOpen) {
        this.activeSessions.set([sessionRes.data]);
      } else {
        this.activeSessions.set([]);
      }

      // 2. Cargar movimientos reales de caja desde la API
      try {
        const movRes = await this.cashRegisterService.getMovements();
        if (
          movRes?.data &&
          Array.isArray(movRes.data) &&
          movRes.data.length > 0
        ) {
          const mapped = movRes.data
            .slice(-10)
            .reverse()
            .map((m) => ({
              type:
                m.type === 'Entrada'
                  ? 'VENTA'
                  : m.category === 'Retiro'
                    ? 'RETIRO'
                    : 'SALIDA',
              description: m.description,
              amount:
                m.type === 'Entrada' ? m.inAmount || 0 : -(m.outAmount || 0),
              time: m.date || 'Hoy',
            }));
          this.recentMovements.set(mapped);
        } else {
          this.recentMovements.set([]);
        }
      } catch {
        this.recentMovements.set([]);
      }

      // 3. Cargar ventas reales para calcular KPIs del día de la empresa / tenant
      try {
        const salesRes = await this.saleService.getSales({ pageSize: 100 });
        const allSales = salesRes.data || [];
        const todayRD = formatDateInRD();
        const todaySales = allSales.filter((s) => {
          return formatDateInRD(s.creationDate) === todayRD;
        });

        const totalSales = todaySales.reduce(
          (acc, s) => acc + Number(s.total || 0),
          0,
        );
        this.todaySalesTotal.set(totalSales);
        this.todayInvoicesCount.set(todaySales.length);

        // Calcular Top 5 productos más vendidos del día
        const productStats = new Map<
          string,
          { name: string; quantity: number; revenue: number }
        >();
        for (const sale of todaySales) {
          if (
            sale.details &&
            Array.isArray(sale.details) &&
            sale.details.length > 0
          ) {
            for (const d of sale.details) {
              const pName =
                (d as any).productName ||
                (d as any).product?.description ||
                `Producto #${d.productId}`;
              const qty = d.quantity || 1;
              const rev = (d as any).total || (d.unitPrice || 0) * qty;
              const prev = productStats.get(pName) || {
                name: pName,
                quantity: 0,
                revenue: 0,
              };
              prev.quantity += qty;
              prev.revenue += rev;
              productStats.set(pName, prev);
            }
          }
        }

        const sorted = Array.from(productStats.values())
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        if (sorted.length > 0) {
          this.topSellers.set(sorted);
        } else if (this.products().length > 0 && todaySales.length > 0) {
          const sample = this.products()
            .slice(0, 3)
            .map((p, idx) => ({
              name: p.description || 'Producto',
              quantity: Math.max(1, 4 - idx),
              revenue: (p.price || 150) * Math.max(1, 4 - idx),
            }));
          this.topSellers.set(sample);
        } else {
          this.topSellers.set([]);
        }
      } catch {
        this.todaySalesTotal.set(0);
        this.todayInvoicesCount.set(0);
        this.topSellers.set([]);
      }

      // 4. Cargar clientes reales del tenant
      try {
        const custRes = await this.customerService.getCustomers({
          pageSize: 50,
        });
        const realCustomers = custRes.data || [];
        const formattedClients: MobileClientOption[] = [
          {
            id: 1,
            name: 'Consumidor Final',
            rnc: '000-0000000-0',
            type: 'Contado',
          },
          ...realCustomers
            .filter(
              (c) =>
                c.name && c.name.toLowerCase().trim() !== 'consumidor final',
            )
            .map((c) => ({
              id: c.id || 1,
              name: c.name,
              rnc: c.identification || '000-0000000-0',
              type: 'Contado',
            })),
        ];
        this.clientsList.set(formattedClients);
      } catch {
        this.clientsList.set([
          {
            id: 1,
            name: 'Consumidor Final',
            rnc: '000-0000000-0',
            type: 'Contado',
          },
        ]);
      }
    } catch (err) {
      console.warn('[Mobile POS] Error al cargar datos ejecutivos:', err);
    }
  }

  openMobileOpenRegisterModal(): void {
    this.mobileOpeningAmount.set(0);
    this.mobileOpeningNotes.set('');
    this.isMobileOpenRegisterModalOpen.set(true);
  }

  closeMobileOpenRegisterModal(): void {
    this.isMobileOpenRegisterModalOpen.set(false);
  }

  setQuickOpeningAmount(amount: number): void {
    this.mobileOpeningAmount.set(amount);
  }

  async confirmMobileOpenRegister(): Promise<void> {
    this.isSubmitting.set(true);
    try {
      const cashierName =
        this.authService.currentUser()?.fullName || this.userName();
      const res = await this.cashRegisterService.openSession({
        name: 'Caja Principal POS',
        initialAmount: this.mobileOpeningAmount() || 0,
        cashierName,
        notes:
          this.mobileOpeningNotes().trim() || 'Apertura rápida desde POS Móvil',
      });

      if (res.success && res.data) {
        this.activeSessions.set([res.data]);
        this.isMobileOpenRegisterModalOpen.set(false);
        this.notificationService.success(
          `¡Caja aperturada exitosamente con RD$ ${(this.mobileOpeningAmount() || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}!`,
        );
        await this.loadExecutiveData();
      } else {
        this.notificationService.error(
          res.message || 'No se pudo abrir la caja.',
        );
      }
    } catch (err: any) {
      this.notificationService.showApiError(err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async openQuickMobileSession(initialAmount: number = 0): Promise<void> {
    this.openMobileOpenRegisterModal();
  }

  async loadCatalog(): Promise<void> {
    this.isLoading.set(true);
    try {
      const activeCid =
        this.authService.companyId() || Number(getCompanyId()) || 0;
      const res = await this.productService.getPagedProducts(1, 100);
      let items: ProductDto[] =
        res?.data?.items || (Array.isArray(res?.data) ? (res.data as any) : []);
      if (!items || items.length === 0) {
        const searchRes = await this.productService.searchProducts('');
        if (searchRes.success && searchRes.data && searchRes.data.length > 0) {
          items = searchRes.data;
        }
      }

      if (activeCid > 0 && items && items.length > 0) {
        items = items.filter((p: any) => {
          const pCid = p.companyId ?? p.CompanyId;
          return (
            pCid == null || Number(pCid) === 0 || Number(pCid) === activeCid
          );
        });
      }

      this.products.set(items || []);

      const catMap = new Map<string, { id: number | null; label: string }>();
      try {
        const catsRes = await this.categoryService.getCategories();
        if (catsRes?.success && Array.isArray(catsRes.data)) {
          catsRes.data.forEach((c: any) => {
            const label = c.name || c.description || `Cat ${c.id}`;
            if (label.toLowerCase().includes('serv')) return;
            if (c.id != null) {
              catMap.set(String(c.id), {
                id: Number(c.id),
                label,
              });
            }
          });
        }
      } catch {
        // ignore
      }

      // Also harvest categories from products
      (this.products() || []).forEach((p: any) => {
        if (this.isServiceItem(p)) return;
        const catId = p.categoryId ?? p.category?.id ?? p.productCategoryId;
        const catName =
          p.categoryName ?? p.category?.name ?? p.category?.description;
        if (catName && catName.toLowerCase().includes('serv')) return;
        if (catId != null && !catMap.has(String(catId))) {
          catMap.set(String(catId), {
            id: Number(catId),
            label: catName || `Cat ${catId}`,
          });
        }
      });

      // Load units of measurement
      try {
        const unitsRes = await this.unitService.getUnitsOfMeasurement();
        if (unitsRes?.success && Array.isArray(unitsRes.data)) {
          this.unitsList.set(unitsRes.data);
        }
      } catch {
        // ignore
      }

      this.categories.set([
        { id: null, label: 'Todos' },
        ...Array.from(catMap.values()),
      ]);
    } catch {
      this.products.set([]);
      this.categories.set([{ id: null, label: 'Todos' }]);
    } finally {
      this.isLoading.set(false);
    }
  }

  getUnitForProduct(product: ProductDto): UnitOfMeasurement | undefined {
    const uid = product.unitOfMeasurementId;
    if (uid) {
      const match = this.unitsList().find((u) => u.id === uid);
      if (match) return match;
    }
    const desc =
      `${product.description || ''} ${product.shortDescription || ''}`.toLowerCase();
    for (const u of this.unitsList()) {
      if (u.symbol && desc.includes(u.symbol.toLowerCase())) return u;
      if (u.name && desc.includes(u.name.toLowerCase())) return u;
    }
    return (
      this.unitsList().find((u) => u.id === 1) || {
        id: 1,
        name: 'Unidad',
        symbol: 'und',
        allowsDecimals: false,
      }
    );
  }

  getProductUnitSymbol(product: ProductDto): string {
    const unit = this.getUnitForProduct(product);
    return unit?.symbol || 'und';
  }

  isProductMeasurable(product: ProductDto): boolean {
    const unit = this.getUnitForProduct(product);
    if (unit?.allowsDecimals) return true;
    const desc = (product.description || '').toLowerCase();
    return ['lb', 'libra', 'kg', 'kilo', 'gramo', 'litro', 'metro'].some(
      (term) => desc.includes(term),
    );
  }

  onProductClick(product: ProductDto): void {
    if (this.isServiceItem(product)) {
      this.notificationService.warning(
        'Los servicios son mano de obra y no pueden cobrarse a través de la caja rápida. Utilice el módulo de Facturación o Servicios.',
      );
      return;
    }

    const pkg = product.id
      ? this.packagingService.getPackaging(product.id)
      : undefined;
    if (this.isProductMeasurable(product) || (pkg && pkg.hasPackaging)) {
      this.openQuantityModal(product);
    } else {
      this.addToCart(product);
    }
  }

  openQuantityModal(product: ProductDto, cartIndex?: number): void {
    this.selectedProductForMeasurement.set(product);
    this.measurementCartIndex.set(cartIndex !== undefined ? cartIndex : null);

    const pkg = product.id
      ? this.packagingService.getPackaging(product.id)
      : undefined;
    this.activeProductPackaging.set(pkg && pkg.hasPackaging ? pkg : null);

    if (cartIndex !== undefined && this.cart()[cartIndex]) {
      const item = this.cart()[cartIndex];
      this.measurementQuantity.set(item.quantity);
      this.measurementMode.set(item.saleMode || 'detail');
    } else {
      this.measurementMode.set('detail');
      const isMeasurable = this.isProductMeasurable(product);
      this.measurementQuantity.set(isMeasurable ? 1.0 : 1);
    }
    this.isMeasurementModalOpen.set(true);
  }

  closeQuantityModal(): void {
    this.isMeasurementModalOpen.set(false);
    this.selectedProductForMeasurement.set(null);
    this.measurementCartIndex.set(null);
    this.activeProductPackaging.set(null);
  }

  setMeasurementMode(mode: 'detail' | 'package' | 'individual'): void {
    this.measurementMode.set(mode);
    if (mode === 'detail') {
      const prod = this.selectedProductForMeasurement();
      this.measurementQuantity.set(
        prod && this.isProductMeasurable(prod) ? 1.0 : 1,
      );
    } else {
      this.measurementQuantity.set(1);
    }
  }

  getEffectiveUnitPrice(): number {
    const prod = this.selectedProductForMeasurement();
    if (!prod) return 0;
    const pkg = this.activeProductPackaging();
    const mode = this.measurementMode();

    if (pkg && mode === 'package') {
      return (
        pkg.packagePrice ||
        (prod.price || (prod.cost ? prod.cost * 1.3 : 100)) *
          (pkg.packageUnitsCount || 1)
      );
    }
    if (pkg && mode === 'individual') {
      return pkg.individualUnitPrice || 15;
    }
    return prod.price || (prod.cost ? prod.cost * 1.3 : 100);
  }

  getEffectiveUnitLabel(): string {
    const prod = this.selectedProductForMeasurement();
    if (!prod) return '';
    const pkg = this.activeProductPackaging();
    const mode = this.measurementMode();

    if (pkg && mode === 'package') {
      return `${pkg.packageUnitName || 'Empaque'} (${pkg.packageUnitsCount} ${this.getProductUnitSymbol(prod)})`;
    }
    if (pkg && mode === 'individual') {
      return pkg.individualUnitName || 'Pieza individual';
    }
    return this.getProductUnitSymbol(prod);
  }

  getInventoryDeduction(): number {
    const qty = Number(this.measurementQuantity()) || 0;
    const pkg = this.activeProductPackaging();
    const mode = this.measurementMode();

    if (pkg && mode === 'package') {
      return Math.round(qty * (pkg.packageUnitsCount || 1) * 100) / 100;
    }
    if (pkg && mode === 'individual') {
      return Math.round(qty * (pkg.individualUnitWeight || 1) * 100) / 100;
    }
    return qty;
  }

  setPresetQuantity(qty: number): void {
    this.measurementQuantity.set(qty);
  }

  confirmQuantityModal(): void {
    const prod = this.selectedProductForMeasurement();
    if (!prod) return;

    const qty = Number(this.measurementQuantity()) || 0;
    if (qty <= 0) {
      this.notificationService.warning(
        'Por favor ingresa una cantidad válida mayor a 0.',
      );
      return;
    }

    const availableStock = prod.stock ?? 0;
    const deduction = this.getInventoryDeduction();
    const baseSymbol = this.getProductUnitSymbol(prod);

    if (availableStock <= 0) {
      this.notificationService.error(
        `Producto agotado: "${prod.description}" no tiene disponibilidad en inventario.`,
      );
      return;
    }
    if (deduction > availableStock) {
      this.notificationService.warning(
        `Stock límite: Esta cantidad requiere ${deduction} ${baseSymbol}, pero solo hay ${availableStock} ${baseSymbol} disponibles de "${prod.description}".`,
      );
      return;
    }

    const unitPrice = this.getEffectiveUnitPrice();
    const itbisRate = prod.taxRate ?? 0.18;
    const subtotal = Math.round(qty * unitPrice * 100) / 100;
    const itbis = Math.round(subtotal * itbisRate * 100) / 100;
    const total = Math.round((subtotal + itbis) * 100) / 100;

    const mode = this.measurementMode();
    const modeLabel = this.getEffectiveUnitLabel();
    const pkg = this.activeProductPackaging();
    const conversionFactor =
      mode === 'package' && pkg
        ? pkg.packageUnitsCount || 1
        : mode === 'individual' && pkg
          ? pkg.individualUnitWeight || 1
          : 1;

    const current = [...this.cart()];
    const cartIdx = this.measurementCartIndex();

    const newItem: MobileCartItem = {
      product: prod,
      quantity: qty,
      unitPrice,
      subtotal,
      itbis,
      total,
      unitSymbol: baseSymbol,
      allowsDecimals: mode === 'detail' && this.isProductMeasurable(prod),
      saleMode: mode,
      modeLabel,
      conversionFactor,
      deductionQuantity: deduction,
    };

    if (cartIdx !== null && cartIdx >= 0 && current[cartIdx]) {
      current[cartIdx] = newItem;
      this.cart.set(current);
      this.notificationService.info(
        `Cantidad actualizada: ${qty} ${modeLabel}`,
      );
    } else {
      const existingIndex = current.findIndex(
        (i) => i.product.id === prod.id && i.saleMode === mode,
      );
      if (existingIndex > -1) {
        current[existingIndex] = newItem;
        this.cart.set(current);
        this.notificationService.info(
          `Cantidad actualizada: ${qty} ${modeLabel}`,
        );
      } else {
        this.cart.update((prev) => [...prev, newItem]);
        this.notificationService.info(
          `+${qty} ${modeLabel} de "${prod.description}"`,
        );
      }
    }

    soundEffects.playScannerBeep();
    triggerHaptic(15);
    this.cartBadgeBounce.set(true);
    setTimeout(() => this.cartBadgeBounce.set(false), 200);

    this.closeQuantityModal();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  setTab(tab: 'inicio' | 'ventas' | 'caja' | 'fiao' | 'mas'): void {
    this.activeTab.set(tab);
    if (tab === 'ventas') {
      if (
        this.salesCatalogType() === 'products' &&
        this.products().length === 0
      ) {
        this.loadCatalog();
      } else if (
        this.salesCatalogType() === 'services' &&
        this.services().length === 0
      ) {
        this.loadServicesCatalog();
      }
    }
    if (tab === 'caja' || tab === 'inicio') {
      this.loadExecutiveData();
    }
    if (tab === 'fiao') {
      this.loadFiaoList();
    }
  }

  async loadFiaoList(): Promise<void> {
    this.isLoadingFiao.set(true);
    try {
      const res = await this.receivableService.getReceivables();
      if (res?.data && Array.isArray(res.data)) {
        this.fiaoList.set(res.data);
      } else {
        this.fiaoList.set([]);
      }
    } catch (err) {
      console.warn('[Fiao] Error al cargar deudas:', err);
      this.fiaoList.set([]);
    } finally {
      this.isLoadingFiao.set(false);
    }
  }

  openFiaoPayment(debt: ReceivableDto): void {
    this.selectedFiaoForPayment.set(debt);
    this.fiaoPaymentAmount.set(debt.pendingAmount || 0);
    this.fiaoPaymentMethod.set('Efectivo');
    this.fiaoPaymentNotes.set('');
    this.isFiaoPaymentModalOpen.set(true);
  }

  closeFiaoPaymentModal(): void {
    this.isFiaoPaymentModalOpen.set(false);
    this.selectedFiaoForPayment.set(null);
  }

  async confirmFiaoPayment(): Promise<void> {
    const debt = this.selectedFiaoForPayment();
    const amount = Number(this.fiaoPaymentAmount());
    if (!debt || amount <= 0) return;

    this.isSubmitting.set(true);
    try {
      await this.receivableService.addPayment(debt.id, {
        amount,
        method: this.fiaoPaymentMethod(),
        notes: this.fiaoPaymentNotes() || 'Abono rápido desde PWA móvil',
        date: new Date().toISOString(),
        registerInCash: this.fiaoPaymentMethod() === 'Efectivo',
      });

      const prevPending = Number(debt.pendingAmount || 0);
      const remaining = Math.max(0, prevPending - amount);
      const receiptData: WhatsAppDebtPaymentData = {
        companyName: this.tenantName(),
        companyRnc: this.companyService.currentSettings()?.rnc || undefined,
        customerName: debt.customerName || 'Cliente',
        customerPhone: debt.customerPhone || '',
        documentNumber: String(debt.id || ''),
        ncf: debt.invoiceNumber || (debt as any).ncf || undefined,
        amountPaid: amount,
        previousBalance: prevPending,
        pendingBalance: remaining,
        paymentMethod: this.fiaoPaymentMethod(),
        date: formatInvoiceDateTime(new Date()),
        notes: this.fiaoPaymentNotes() || undefined,
        senderName: this.userName(),
      };

      this.lastFiaoReceiptData.set(receiptData);
      this.fiaoReceiptCustomerPhone.set(debt.customerPhone || '');
      this.closeFiaoPaymentModal();
      this.isFiaoReceiptModalOpen.set(true);
      triggerHapticSuccess();
      soundEffects.playKaChing();
      this.notificationService.success(
        `¡Abono de RD$ ${amount.toFixed(2)} registrado! Comprobante listo para enviar.`,
      );
      await this.loadFiaoList();
      await this.loadExecutiveData();
    } catch (err: any) {
      this.notificationService.error(
        err?.message || 'Error al registrar abono',
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  sendFiaoReceiptViaWhatsApp(): void {
    const data = this.lastFiaoReceiptData();
    if (!data) return;
    triggerHaptic(20);
    const phone =
      this.fiaoReceiptCustomerPhone().trim() || data.customerPhone || '';
    data.customerPhone = phone;
    this.whatsAppShareService.sendDebtPaymentViaWhatsApp(data);
  }

  closeFiaoReceiptModal(): void {
    this.isFiaoReceiptModalOpen.set(false);
    this.lastFiaoReceiptData.set(null);
  }

  sendFiaoWhatsAppReminder(debt: ReceivableDto): void {
    const phone = (debt.customerPhone || '').replace(/[^0-9]/g, '');
    const amount = (debt.pendingAmount || 0).toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const customer = debt.customerName || 'Cliente';
    const text = encodeURIComponent(
      `Hola ${customer}, le recordamos cordialmente de CuadreEnv su saldo pendiente de RD$ ${amount} por concepto de "${debt.description || 'consumo en tienda'}". ¡Gracias por su preferencia!`,
    );
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    } else {
      this.notificationService.info(
        'Este cliente no tiene teléfono registrado para WhatsApp',
      );
    }
  }

  setSalesCatalogType(type: 'products' | 'services'): void {
    this.salesCatalogType.set(type);
    if (type === 'services' && this.services().length === 0) {
      this.loadServicesCatalog();
    } else if (type === 'products' && this.products().length === 0) {
      this.loadCatalog();
    }
  }

  openServiceBilling(): void {
    this.setSalesCatalogType('services');
    this.setTab('ventas');
  }

  async loadServicesCatalog(): Promise<void> {
    this.isLoadingServices.set(true);
    try {
      const items = await this.serviceService.getServices({ activeOnly: true });
      this.services.set(items || []);
    } catch (err) {
      console.warn('[Mobile POS] Error al cargar servicios:', err);
    } finally {
      this.isLoadingServices.set(false);
    }
  }

  // Cart operations
  addToCart(product: ProductDto): void {
    const isGeneric = product.id === 0 || product.barcode === 'VAR-LIBRE';
    const availableStock = isGeneric ? 99999 : (product.stock ?? 0);
    if (!isGeneric && availableStock <= 0) {
      this.notificationService.error(
        `Producto agotado: "${product.description}" no tiene disponibilidad en inventario.`,
      );
      soundEffects.playErrorBeep();
      return;
    }

    const current = this.cart();
    const existingIndex = current.findIndex(
      (i) =>
        i.product.id === product.id &&
        (isGeneric ? i.product.description === product.description : true),
    );
    const price = product.price || (product.cost ? product.cost * 1.3 : 100);
    const itbisRate = product.taxRate ?? 0.18;
    const unitSymbol = this.getProductUnitSymbol(product);
    const allowsDecimals = this.isProductMeasurable(product);

    if (existingIndex > -1) {
      const item = current[existingIndex];
      if (!isGeneric && item.quantity >= availableStock) {
        this.notificationService.warning(
          `Stock límite: Solo hay ${availableStock} ${unitSymbol} disponibles de "${product.description}".`,
        );
        return;
      }

      const newQty = item.quantity + 1;
      const subtotal = Math.round(newQty * item.unitPrice * 100) / 100;
      const itbis = Math.round(subtotal * itbisRate * 100) / 100;
      const total = Math.round((subtotal + itbis) * 100) / 100;

      const updated = [...current];
      updated[existingIndex] = {
        ...item,
        quantity: newQty,
        subtotal,
        itbis,
        total,
        unitSymbol,
        allowsDecimals,
      };
      this.cart.set(updated);
    } else {
      const subtotal = price;
      const itbis = Math.round(subtotal * itbisRate * 100) / 100;
      const total = Math.round((subtotal + itbis) * 100) / 100;

      this.cart.update((prev) => [
        ...prev,
        {
          product,
          quantity: 1,
          unitPrice: price,
          subtotal,
          itbis,
          total,
          unitSymbol,
          allowsDecimals,
        },
      ]);
    }

    soundEffects.playScannerBeep();
    triggerHaptic(15);
    this.cartBadgeBounce.set(true);
    setTimeout(() => this.cartBadgeBounce.set(false), 200);

    this.notificationService.info(`+1 ${unitSymbol} ${product.description}`);
  }

  updateItemQuantity(index: number, delta: number): void {
    const current = [...this.cart()];
    const item = current[index];
    if (!item) return;

    const availableStock = item.product.stock ?? 0;
    const newQty = item.quantity + delta;

    if (delta > 0 && newQty > availableStock) {
      this.notificationService.warning(
        `Stock máximo disponible alcanzado (${availableStock} uds) para "${item.product.description}".`,
      );
      return;
    }

    if (newQty <= 0) {
      current.splice(index, 1);
    } else {
      const itbisRate = item.product.taxRate ?? 0.18;
      const subtotal = newQty * item.unitPrice;
      const itbis = subtotal * itbisRate;
      const total = subtotal + itbis;
      current[index] = { ...item, quantity: newQty, subtotal, itbis, total };
    }
    this.cart.set(current);
  }

  decrementProductFromList(prod: ProductDto): void {
    const idx = this.cart().findIndex((c) => c.product.id === prod.id);
    if (idx !== -1) {
      this.updateItemQuantity(idx, -1);
    }
  }

  decrementServiceFromList(service: any): void {
    const idx = this.serviceCart().findIndex((c) => c.serviceId === service.id);
    if (idx !== -1) {
      this.updateServiceCartQuantity(idx, -1);
    }
  }

  clearCart(): void {
    this.cart.set([]);
    this.cartDiscountType.set('none');
    this.cartDiscountValue.set(0);
    this.isCartDrawerOpen.set(false);
  }

  holdCurrentMobileSale(): void {
    if (this.cart().length === 0) {
      this.notificationService.warning(
        'El carrito está vacío. Agrega productos antes de poner la venta en espera.',
      );
      return;
    }

    const draftItems: PosDraftItem[] = this.cart().map((it) => ({
      productId: it.product.id || 0,
      productCode:
        it.product.barcode || it.product.reference || `PROD-${it.product.id}`,
      productName: it.product.description || 'Producto',
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      total: it.total,
    }));

    const custName = this.customerName() || 'Consumidor Final';
    const held = this.draftStorageService.holdSale(
      {
        customerId: this.selectedCustomerId(),
        customerName: custName,
        items: draftItems,
        discountType: 'fixed',
        discountValue: 0,
        selectedMethod: this.selectedMethod(),
        amountReceived: 0,
        timestamp: new Date().toISOString(),
      },
      `${custName} (${this.cart().length} arts. - RD$ ${this.cartTotal().toFixed(2)})`,
    );

    this.notificationService.success(`Venta puesta en espera (${held.label}).`);
    this.clearCart();
    this.isCartDrawerOpen.set(false);
  }

  openMobileHeldSalesModal(): void {
    this.draftStorageService.reloadHeldSales();
    this.isHeldSalesModalOpen.set(true);
  }

  closeMobileHeldSalesModal(): void {
    this.isHeldSalesModalOpen.set(false);
  }

  resumeHeldMobileSale(held: PosHeldSale): void {
    if (this.cart().length > 0) {
      this.holdCurrentMobileSale();
    }

    const newCart: MobileCartItem[] = (held.items || []).map((it) => {
      const existingProduct = this.products().find(
        (p) => p.id === it.productId,
      );
      const prod: ProductDto = existingProduct || {
        id: it.productId,
        description: it.productName,
        barcode: it.productCode,
        cost: it.unitPrice,
        price: it.unitPrice,
        stock: 999,
      };

      const unitPrice = it.unitPrice || 0;
      const quantity = it.quantity || 1;
      const subtotal = Math.round(unitPrice * quantity * 100) / 100;
      const itbis = Math.round(subtotal * 0.18 * 100) / 100;
      const total = it.total || Math.round((subtotal + itbis) * 100) / 100;

      return {
        product: prod,
        quantity,
        unitPrice,
        subtotal,
        itbis,
        total,
      };
    });

    this.cart.set(newCart);
    if (held.customerName) {
      this.customerName.set(held.customerName);
    }
    if (held.customerId) {
      this.selectedCustomerId.set(held.customerId);
    }

    this.draftStorageService.resumeHeldSale(held.id);
    this.isHeldSalesModalOpen.set(false);
    this.isCartDrawerOpen.set(true);
    this.notificationService.info(`Venta recuperada: ${held.label}`);
  }

  dismissHeldMobileSale(id: string): void {
    this.draftStorageService.removeHeldSale(id);
    this.notificationService.info('Venta en espera descartada.');
  }

  openCheckout(): void {
    if (this.cart().length === 0) return;
    this.amountReceived.set(this.cartTotal());
    this.isCartDrawerOpen.set(false);
    this.isPaymentModalOpen.set(true);
  }

  applyCashQuick(amount: number): void {
    triggerHaptic(15);
    this.amountReceived.set(amount);
  }

  applyExactCash(): void {
    triggerHaptic(15);
    this.amountReceived.set(this.cartTotal());
  }

  selectCustomer(client: MobileClientOption): void {
    this.selectedCustomerId.set(client.id);
    this.customerName.set(client.name);
    this.isClientsModalOpen.set(false);
    this.notificationService.info(`Cliente seleccionado: ${client.name}`);
  }

  // Fast Mobile Cash Movement (Entrada / Retiro)
  openMobileMovementModal(type: 'Entrada' | 'Retiro'): void {
    this.mobileMovementType.set(type);
    this.mobileMovementAmount.set(0);
    this.mobileMovementDescription.set('');
    this.isMobileMovementModalOpen.set(true);
  }

  closeMobileMovementModal(): void {
    this.isMobileMovementModalOpen.set(false);
  }

  setQuickMovementAmount(amt: number): void {
    this.mobileMovementAmount.set(amt);
  }

  async confirmMobileMovement(): Promise<void> {
    const amt = Number(this.mobileMovementAmount()) || 0;
    if (amt <= 0) {
      this.notificationService.warning('Ingresa un monto válido mayor a 0.');
      return;
    }
    const type = this.mobileMovementType();
    const movementType: 'Entrada' | 'Salida' =
      type === 'Entrada' ? 'Entrada' : 'Salida';
    this.isSubmitting.set(true);
    try {
      const res = await this.cashRegisterService.addMovement({
        type: movementType,
        category: type === 'Entrada' ? 'Ingresos' : 'Retiro',
        description:
          this.mobileMovementDescription().trim() ||
          (type === 'Entrada'
            ? 'Entrada rápida de efectivo'
            : 'Retiro rápido de efectivo'),
        amount: amt,
        paymentMethod: 'Efectivo',
      });
      if (res.success) {
        this.isMobileMovementModalOpen.set(false);
        this.notificationService.success(
          `${type === 'Entrada' ? 'Entrada' : 'Retiro'} de RD$ ${amt.toLocaleString('es-DO', { minimumFractionDigits: 2 })} registrado.`,
        );
        await this.loadExecutiveData();
      } else {
        this.notificationService.error(
          res.message || 'No se pudo registrar el movimiento.',
        );
      }
    } catch (err: any) {
      this.notificationService.showApiError(err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // Fast Mobile Cash Closing (Arqueo Express)
  openMobileCloseRegisterModal(): void {
    const session = this.activeSession();
    if (!session) {
      this.notificationService.info(
        'No hay una sesión activa de caja para cerrar.',
      );
      return;
    }
    this.mobileClosingDeclaredCash.set(this.totalCashInDrawers());
    this.mobileClosingNotes.set('');
    this.isMobileCloseRegisterModalOpen.set(true);
  }

  closeMobileCloseRegisterModal(): void {
    this.isMobileCloseRegisterModalOpen.set(false);
  }

  setExactCashClose(): void {
    this.mobileClosingDeclaredCash.set(this.mobileExpectedCash());
  }

  async confirmMobileCloseRegister(): Promise<void> {
    const session = this.activeSession();
    const declared = Number(this.mobileClosingDeclaredCash()) || 0;
    this.isSubmitting.set(true);
    this.mobilePendingOperationsError.set(null);

    try {
      const res = await this.cashRegisterService.closeSession({
        session: session || undefined,
        cashRegisterId: session?.cashRegisterId || session?.id || 1,
        sessionId: session?.sessionId || session?.id || 1,
        closingAmount: declared,
        declaredCards: 0,
        declaredTransfers: 0,
        retainedFloat: 0,
        cashToDeposit: declared,
        notes:
          this.mobileClosingNotes().trim() || 'Cierre rápido desde POS Móvil',
        timeoutMs: 8000,
      });

      if (res.success) {
        this.activeSessions.set([]);
        this.isMobileCloseRegisterModalOpen.set(false);
        this.mobilePendingOperationsError.set(null);
        this.draftStorageService.clearAll();
        triggerHapticSuccess();
        this.notificationService.success(
          '¡Caja cerrada y arqueo completado exitosamente!',
        );
        await this.loadExecutiveData();
      } else {
        const isPending =
          (res as any).code === 'OPEN_CASH_OPERATIONS' ||
          res.message?.includes('OPEN_CASH_OPERATIONS') ||
          (res.message &&
            res.message.toLowerCase().includes('venta') &&
            (res.message.toLowerCase().includes('espera') ||
              res.message.toLowerCase().includes('pendiente')));

        if (isPending) {
          const userMsg =
            res.message ||
            'Existen ventas pendientes o en espera en el POS que deben completarse o anularse antes de realizar el cierre de caja.';
          this.mobilePendingOperationsError.set(userMsg);
          this.notificationService.warning(userMsg);
        } else {
          this.notificationService.error(
            res.message || 'No se pudo cerrar la caja en el servidor.',
          );
        }
      }
    } catch (err: any) {
      this.notificationService.showApiError(err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async cancelPendingSalesAndRetryMobileClose(): Promise<void> {
    this.isCancellingPendingSales.set(true);
    try {
      this.draftStorageService.clearAll();

      try {
        const salesRes = await this.saleService.getSales();
        const list = Array.isArray(salesRes?.data)
          ? salesRes.data
          : Array.isArray(salesRes)
            ? salesRes
            : [];
        const session = this.activeSession();
        const pendingSales = list.filter(
          (s: any) =>
            (s.status === 0 ||
              s.status === 'PENDING' ||
              s.status === 'PARTIAL' ||
              s.status === 1) &&
            (!session?.id ||
              s.cashSessionId === session.sessionId ||
              s.cashRegisterId === session.id ||
              s.cashRegisterId === session.cashRegisterId),
        );

        for (const sale of pendingSales) {
          try {
            await (this.saleService as any).api?.post(
              `/Sale/${sale.id}/cancel`,
              { reason: 'Anulación automática por cierre de turno de caja' },
            );
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }

      this.mobilePendingOperationsError.set(null);
      this.notificationService.info(
        'Ventas pendientes anuladas. Reintentando cierre de caja...',
      );
      await this.confirmMobileCloseRegister();
    } catch {
      this.notificationService.error(
        'Ocurrió un error al intentar anular las ventas pendientes.',
      );
    } finally {
      this.isCancellingPendingSales.set(false);
    }
  }

  forceCloseRegisterEmergency(): void {
    const session = this.activeSession();
    this.cashRegisterService.forceCloseSessionLocal(
      session?.cashRegisterId || session?.id || 1,
    );
    this.draftStorageService.clearAll();
    this.activeSessions.set([]);
    this.isMobileCloseRegisterModalOpen.set(false);
    this.mobilePendingOperationsError.set(null);
    triggerHaptic(30);
    this.notificationService.success(
      'Cierre de emergencia completado. Gaveta y sesión desbloqueadas localmente.',
    );
    this.loadExecutiveData();
  }

  openCloseRegisterModal(): void {
    this.openMobileCloseRegisterModal();
  }

  onRegisterClosed(): void {
    this.loadExecutiveData();
    this.notificationService.success('Turno de caja cerrado formalmente.');
  }

  /**
   * Procesa la venta de forma transparente vinculada a la sesión de caja activa.
   * La venta es inmediatamente visible en la PC en la tabla de Ventas y en los movimientos de Caja.
   */
  async processMobileSale(): Promise<void> {
    if (this.cart().length === 0) return;

    // 0. Validar disponibilidad de stock estricta (no permitir ventas con stock <= 0)
    for (const item of this.cart()) {
      const available = item.product.stock ?? 0;
      const deduction = item.deductionQuantity ?? item.quantity;
      if (available <= 0) {
        this.notificationService.error(
          `No se puede completar la venta: "${item.product.description}" está agotado en inventario (Stock: 0).`,
        );
        return;
      }
      if (deduction > available) {
        this.notificationService.error(
          `No se puede completar la venta: Cantidad de "${item.product.description}" (${deduction} ${item.unitSymbol || 'unidades'}) supera el stock (${available}).`,
        );
        return;
      }
    }

    // 1. Validar que exista una sesión de caja activa
    let session = this.activeSession();
    if (!session) {
      this.notificationService.warning(
        'Para registrar ventas debes tener un turno de caja abierto.',
      );
      this.isPaymentModalOpen.set(false);
      this.openMobileOpenRegisterModal();
      return;
    }

    this.isSubmitting.set(true);
    const companyId = this.authService.companyId() || 1;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    const total = this.cartTotal();
    const subtotal = this.cartSubtotal();
    const itbis = this.cartItbis();
    const customer = this.customerName().trim() || 'Consumidor Final';
    const customerId = this.selectedCustomerId();
    const phone = this.customerPhone().trim();
    const method = this.selectedMethod();
    const amountRec = this.amountReceived() || total;
    const change = this.changeDue();
    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });

    // A) MODO OFFLINE: Resguardo en IndexedDB Outbox vinculando el cashRegisterId
    if (!isOnline) {
      this.offlineSyncService.queueOfflineSale({
        customerId: customerId || 1,
        customerName: customer,
        items: this.cart().map((c) => {
          const deductQty = c.deductionQuantity ?? c.quantity;
          const equivUnitPrice =
            deductQty > 0
              ? Math.round((c.subtotal / deductQty) * 10000) / 10000
              : c.unitPrice;
          const label =
            c.saleMode === 'package' || c.saleMode === 'individual'
              ? ` (${c.modeLabel})`
              : '';
          return {
            productId: c.product.id || 0,
            productCode:
              c.product.reference ||
              c.product.barcode ||
              `PROD-${c.product.id}`,
            productName: `${c.product.description || 'Producto'}${label}`,
            unitPrice: equivUnitPrice,
            quantity: deductQty,
            total: c.total,
          };
        }),
        subtotal,
        discount: 0,
        itbis,
        total,
        paymentMethod: method,
        amountReceived: amountRec,
        change,
        companyId,
        cashRegisterId: session.cashRegisterId || session.id,
        cashRegisterSessionId: session.sessionId || session.id,
      } as any);

      const folio = `FAC-M-${Date.now().toString().slice(-4)}`;
      const ncf = `${this.ncfType()}000000${Date.now().toString().slice(-2)}`;

      const itemsList = this.cart().map((c) => ({
        description: `${c.product.description || 'Producto'}${c.saleMode === 'package' || c.saleMode === 'individual' ? ` (${c.modeLabel})` : ''}`,
        quantity: c.deductionQuantity ?? c.quantity,
        unitPrice: c.unitPrice,
        total: c.total,
      }));

      const now = new Date();
      const formattedDate = formatInvoiceDateTime(now);

      this.lastSaleSummary.set({
        folio,
        ncf,
        total,
        subtotal,
        itbis,
        amountReceived: amountRec,
        change,
        paymentMethod: method,
        customerName: customer,
        customerPhone: phone,
        date: now,
        formattedDate,
        items: itemsList,
      });
      triggerHapticSuccess();

      // Guardar también en el caché local de ventas para que la PC lo vea de inmediato
      this.saleService.saveLocalSale({
        id: Date.now(),
        customerId: customerId || 1,
        total,
        paidAmount: amountRec,
        cashRegisterId: session.cashRegisterId || session.id,
        isCancelled: false,
        creationDate: new Date().toISOString(),
        details: this.cart().map((c) => {
          const deductQty = c.deductionQuantity ?? c.quantity;
          const equivUnitPrice =
            deductQty > 0
              ? Math.round((c.subtotal / deductQty) * 10000) / 10000
              : c.unitPrice;
          return {
            productId: c.product.id || 0,
            quantity: deductQty,
            unitPrice: equivUnitPrice,
          };
        }),
      });

      this.isSubmitting.set(false);
      this.isPaymentModalOpen.set(false);
      this.isSuccessModalOpen.set(true);
      triggerHapticSuccess();
      soundEffects.playKaChing();
      this.clearCart();
      await this.loadExecutiveData();
      this.notificationService.success(
        '¡Venta guardada localmente! Se sincronizará al recuperar la conexión.',
      );
      return;
    }

    // B) MODO ONLINE: Registrar venta mediante CashRegisterService
    try {
      // 1. Registrar venta rápida asociada a la sesión de caja activa
      const finalPaymentMethod =
        method === 'Transferencia' && this.transferReferenceNumber().trim()
          ? `Transferencia (Ref: ${this.transferReferenceNumber().trim()})`
          : method;

      const quickSaleRes = await this.cashRegisterService.registerQuickSale({
        customerId: customerId || null,
        customerName: customer,
        items: this.cart().map((c) => {
          const deductQty = c.deductionQuantity ?? c.quantity;
          const equivUnitPrice =
            deductQty > 0
              ? Math.round((c.subtotal / deductQty) * 10000) / 10000
              : c.unitPrice;
          const label =
            c.saleMode === 'package' || c.saleMode === 'individual'
              ? ` (${c.modeLabel})`
              : '';
          return {
            productId: c.product.id || 0,
            productName: `${c.product.description || 'Producto'}${label}`,
            unitPrice: equivUnitPrice,
            quantity: deductQty,
            total: c.total,
          };
        }),
        subtotal,
        discount: this.cartDiscountAmount(),
        itbis,
        total,
        paymentMethod: finalPaymentMethod,
        amountReceived: amountRec,
        change,
        idempotencyKey,
      });

      const assignedId = quickSaleRes?.data?.id || Date.now();
      const folio =
        quickSaleRes?.data?.invoiceNumber ||
        `FAC-M-${String(assignedId).padStart(4, '0')}`;

      // 2. Registro fiscal opcional con DGII / NCF si se seleccionó comprobante formal
      let ncfGenerated = `${this.ncfType()}000000${Date.now().toString().slice(-2)}`;
      try {
        const header: HeaderDto = {
          clientId: customerId || 1,
          clientName: customer,
          billingTypeId: 1,
          voucherTypeId: this.ncfType() === 'B01' ? 1 : 2,
          warehouseId: 1,
          rncOrCedula: '',
        };
        const items: ProductDetails[] = this.cart().map((item) => {
          const deductQty = item.deductionQuantity ?? item.quantity;
          const equivUnitPrice =
            deductQty > 0
              ? Math.round((item.subtotal / deductQty) * 10000) / 10000
              : item.unitPrice;
          const label =
            item.saleMode === 'package' || item.saleMode === 'individual'
              ? ` (${item.modeLabel})`
              : '';
          return {
            productId: item.product.id || 0,
            productName: `${item.product.description || 'Producto'}${label}`,
            price: equivUnitPrice,
            quantity: deductQty,
            discountPercentage:
              this.cartDiscountType() === 'percent'
                ? this.cartDiscountValue()
                : 0,
            discountAmount: this.cartDiscountAmount(),
            itbisPercentage: (item.product.taxRate ?? 0.18) * 100,
            itbisAmount: item.itbis,
            subTotal: item.subtotal,
            totalAmount: item.total,
          };
        });
        const billingRes = await this.billingService.createBilling(
          header,
          items,
        );
        if (billingRes?.data?.ncf) {
          ncfGenerated = billingRes.data.ncf;
        }
      } catch {
        // La venta ya quedó registrada en caja de forma segura
      }

      // 3. Guardar en el caché local de ventas para que SalesComponent (PC) lo vea al instante
      this.saleService.saveLocalSale({
        id: assignedId,
        customerId: customerId || 1,
        total,
        paidAmount: amountRec,
        cashRegisterId: session.id,
        isCancelled: false,
        creationDate: new Date().toISOString(),
        details: this.cart().map((c) => ({
          productId: c.product.id || 0,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        })),
      });

      const onlineItemsList = this.cart().map((c) => ({
        description: `${c.product.description || 'Producto'}${c.saleMode === 'package' || c.saleMode === 'individual' ? ` (${c.modeLabel})` : ''}`,
        quantity: c.deductionQuantity ?? c.quantity,
        unitPrice: c.unitPrice,
        total: c.total,
      }));

      const now = new Date();
      const formattedDate = formatInvoiceDateTime(now);

      this.lastSaleSummary.set({
        folio,
        ncf: ncfGenerated,
        total,
        subtotal,
        itbis,
        amountReceived: amountRec,
        change,
        paymentMethod: finalPaymentMethod,
        customerName: customer,
        customerPhone: phone,
        date: now,
        formattedDate,
        items: onlineItemsList,
      });
      triggerHapticSuccess();
      soundEffects.playKaChing();

      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(
            new CustomEvent('cuadre:sale-completed', {
              detail: {
                id: assignedId,
                total,
                customerName: customer,
                paymentMethod: method,
              },
            }),
          );
          if ('BroadcastChannel' in window) {
            const bc = new BroadcastChannel('cuadreenv_live_bus');
            bc.postMessage({
              type: 'SALE_COMPLETED',
              data: {
                id: assignedId,
                total,
                customerName: customer,
                paymentMethod: method,
              },
            });
            bc.close();
          }
        } catch {}
      }

      this.isPaymentModalOpen.set(false);
      this.isSuccessModalOpen.set(true);
      this.clearCart();
      await this.loadExecutiveData();
      this.notificationService.success(
        `¡Venta cobrada con éxito! Vinculada a ${session.name}.`,
      );
    } catch (err: any) {
      const errMsg = String(
        err?.message || err?.error || err?.response?.data?.message || err || '',
      );
      if (
        errMsg.toLowerCase().includes('cash register must be open') ||
        (errMsg.toLowerCase().includes('caja') &&
          (errMsg.toLowerCase().includes('cerrada') ||
            errMsg.toLowerCase().includes('abierta')))
      ) {
        this.activeSessions.set([]);
        this.isSubmitting.set(false);
        this.isPaymentModalOpen.set(false);
        this.openMobileOpenRegisterModal();
        this.notificationService.warning(
          'La caja en el servidor está cerrada. Por favor realiza una apertura rápida para completar la venta.',
        );
        return;
      }

      // Fallback a IndexedDB si hubo fallo de red repentino
      const fallbackItemsList = this.cart().map((c) => ({
        description: `${c.product.description || 'Producto'}${c.saleMode === 'package' || c.saleMode === 'individual' ? ` (${c.modeLabel})` : ''}`,
        quantity: c.deductionQuantity ?? c.quantity,
        unitPrice: c.unitPrice,
        total: c.total,
      }));

      this.offlineSyncService.queueOfflineSale({
        customerId: customerId || 1,
        customerName: customer,
        items: this.cart().map((c) => ({
          productId: c.product.id || 0,
          productCode:
            c.product.reference || c.product.barcode || `PROD-${c.product.id}`,
          productName: c.product.description || 'Producto',
          unitPrice: c.unitPrice,
          quantity: c.quantity,
          total: c.total,
        })),
        subtotal,
        discount: 0,
        itbis,
        total,
        paymentMethod: method,
        amountReceived: amountRec,
        change,
        companyId,
        cashRegisterId: session.cashRegisterId || session.id,
        cashRegisterSessionId: session.sessionId || session.id,
      } as any);

      const now = new Date();
      const formattedDate = formatInvoiceDateTime(now);
      const folio = `FAC-M-${Date.now().toString().slice(-4)}`;
      this.lastSaleSummary.set({
        folio,
        ncf: `${this.ncfType()}000000${Date.now().toString().slice(-2)}`,
        total,
        subtotal,
        itbis,
        amountReceived: amountRec,
        change,
        paymentMethod: method,
        customerName: customer,
        customerPhone: phone,
        date: now,
        formattedDate,
        items: fallbackItemsList,
      });
      triggerHapticSuccess();

      this.isPaymentModalOpen.set(false);
      this.isSuccessModalOpen.set(true);
      this.clearCart();
      await this.loadExecutiveData();
      this.notificationService.info(
        'Venta resguardada en cola fuera de línea.',
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  sendTicketViaWhatsApp(): void {
    const sale = this.lastSaleSummary();
    if (!sale) return;
    triggerHaptic(20);

    const phone = (
      this.ticketCustomerPhone().trim() ||
      sale.customerPhone ||
      ''
    ).trim();
    const data: WhatsAppInvoiceData = {
      companyName: this.tenantName(),
      invoiceNumber: `#${sale.folio}`,
      ncf: sale.ncf,
      date: formatInvoiceDateTime(sale.date || new Date()),
      customerName: sale.customerName || 'Consumidor Final',
      items: (sale.items || []).map((it) => ({
        productName: it.description,
        quantity: it.quantity,
        total: it.total,
      })),
      subtotal: sale.subtotal ?? sale.total - (sale.itbis || 0),
      itbis: sale.itbis || 0,
      total: sale.total,
      paymentMethod: sale.paymentMethod || 'Efectivo',
      amountReceived: sale.amountReceived,
      change: sale.change,
      destinationPhone: phone,
      senderName: this.userName(),
    };

    this.whatsAppShareService.sendInvoiceViaWhatsApp(data);
  }

  sendDailySummaryToOwnerWhatsApp(): void {
    const totalCobrado = this.todaySalesTotal().toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const tickets = this.todayInvoicesCount();
    const efectivoGavetas = this.totalCashInDrawers().toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const flagsCount = this.fraudService.activeFlags().length;

    const msg = `🔔 *REPORTE EJECUTIVO MÓVIL - ${this.tenantName().toUpperCase()}*
📅 *Fecha:* ${new Date().toLocaleDateString('es-DO', { dateStyle: 'full' })}
💵 *Ventas Totales Hoy:* RD$ ${totalCobrado} (${tickets} tickets)
🏦 *Efectivo en Gavetas Ahora:* RD$ ${efectivoGavetas}
🎯 *Auditoría Forense:* ${flagsCount === 0 ? 'Cajas Cuadradas Exactas ✅' : `⚠️ ${flagsCount} banderas de riesgo detectadas`}

📲 _Generado automáticamente desde la Vista Móvil CuadreEnv._`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  }

  toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          this.isFullscreen.set(true);
        })
        .catch((err) => {
          console.warn('Fullscreen request failed:', err);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => {
          this.isFullscreen.set(false);
        })
        .catch(() => {});
    }
  }

  // =========================================================================
  // MÓDULO DE SERVICIOS PWA (CARRITO, ACCIONES, CREACIÓN RÁPIDA Y FACTURACIÓN)
  // =========================================================================

  addServiceToCart(service: ServiceItemDto): void {
    const sId = service.id || Date.now();
    const current = [...this.serviceCart()];
    const idx = current.findIndex((c) => c.serviceId === sId);
    const price = Number(service.price) || 0;
    const itbisRate = this.serviceApplyItbis() ? 0.18 : 0;

    if (idx > -1) {
      const item = current[idx];
      const newQty = item.quantity + 1;
      const sub = Math.round(newQty * item.unitPrice * 100) / 100;
      const itbis = Math.round(sub * itbisRate * 100) / 100;
      current[idx] = {
        ...item,
        quantity: newQty,
        subtotal: sub,
        itbis,
        total: Math.round((sub + itbis) * 100) / 100,
      };
      this.serviceCart.set(current);
    } else {
      const sub = price;
      const itbis = Math.round(sub * itbisRate * 100) / 100;
      this.serviceCart.update((prev) => [
        ...prev,
        {
          serviceId: sId,
          serviceCode: service.code || `SERV-${sId}`,
          serviceName: service.name || 'Servicio Profesional',
          categoryName: service.categoryName,
          unitPrice: price,
          quantity: 1,
          subtotal: sub,
          itbis,
          total: Math.round((sub + itbis) * 100) / 100,
        },
      ]);
    }
    this.notificationService.info(`+1 "${service.name}" agregado`);
  }

  updateServiceCartQuantity(index: number, delta: number): void {
    const current = [...this.serviceCart()];
    const item = current[index];
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      current.splice(index, 1);
    } else {
      const itbisRate = this.serviceApplyItbis() ? 0.18 : 0;
      const sub = Math.round(newQty * item.unitPrice * 100) / 100;
      const itbis = Math.round(sub * itbisRate * 100) / 100;
      current[index] = {
        ...item,
        quantity: newQty,
        subtotal: sub,
        itbis,
        total: Math.round((sub + itbis) * 100) / 100,
      };
    }
    this.serviceCart.set(current);
  }

  updateServiceCartPrice(index: number, newPrice: number): void {
    const current = [...this.serviceCart()];
    const item = current[index];
    if (!item) return;

    const price = Math.max(0, Number(newPrice) || 0);
    const itbisRate = this.serviceApplyItbis() ? 0.18 : 0;
    const sub = Math.round(item.quantity * price * 100) / 100;
    const itbis = Math.round(sub * itbisRate * 100) / 100;

    current[index] = {
      ...item,
      unitPrice: price,
      subtotal: sub,
      itbis,
      total: Math.round((sub + itbis) * 100) / 100,
    };
    this.serviceCart.set(current);
  }

  removeServiceCartItem(index: number): void {
    const current = [...this.serviceCart()];
    current.splice(index, 1);
    this.serviceCart.set(current);
  }

  clearServiceCart(): void {
    this.serviceCart.set([]);
    this.isServiceCartDrawerOpen.set(false);
  }

  toggleServiceItbis(): void {
    this.serviceApplyItbis.update((v) => !v);
    const itbisRate = this.serviceApplyItbis() ? 0.18 : 0;
    const current = this.serviceCart().map((item) => {
      const sub = Math.round(item.quantity * item.unitPrice * 100) / 100;
      const itbis = Math.round(sub * itbisRate * 100) / 100;
      return {
        ...item,
        subtotal: sub,
        itbis,
        total: Math.round((sub + itbis) * 100) / 100,
      };
    });
    this.serviceCart.set(current);
  }

  openServiceCheckout(): void {
    if (this.serviceCart().length === 0) return;
    this.serviceAmountReceived.set(this.serviceCartTotal());
    this.isServiceCartDrawerOpen.set(false);
    this.isServicePaymentModalOpen.set(true);
  }

  selectServiceCustomer(client: MobileClientOption): void {
    this.serviceSelectedCustomerId.set(client.id);
    this.serviceCustomerName.set(client.name);
    this.isClientsModalOpen.set(false);
    this.notificationService.info(`Cliente seleccionado: ${client.name}`);
  }

  applyExactServiceCash(): void {
    this.serviceAmountReceived.set(this.serviceCartTotal());
  }

  applyQuickServiceCash(amt: number): void {
    this.serviceAmountReceived.set(amt);
  }

  openQuickServiceCreateModal(): void {
    this.newServiceName.set('');
    this.newServicePrice.set(500);
    this.newServiceCategory.set('Servicios Generales');
    this.isQuickServiceCreateModalOpen.set(true);
  }

  closeQuickServiceCreateModal(): void {
    this.isQuickServiceCreateModalOpen.set(false);
  }

  async confirmQuickServiceCreate(): Promise<void> {
    const name = this.newServiceName().trim();
    if (!name) {
      this.notificationService.warning(
        'Por favor ingresa el nombre del servicio.',
      );
      return;
    }
    const price = Number(this.newServicePrice()) || 0;
    if (price <= 0) {
      this.notificationService.warning(
        'Ingresa un precio o costo de mano de obra válido.',
      );
      return;
    }

    this.isSubmitting.set(true);
    try {
      const created = await this.serviceService.createService({
        name,
        price,
        categoryName: this.newServiceCategory().trim() || 'Servicios Generales',
        isActive: true,
      });

      this.services.update((prev) => [created, ...prev]);
      this.addServiceToCart(created);
      this.isQuickServiceCreateModalOpen.set(false);
      this.notificationService.success(
        `¡Servicio "${name}" creado y agregado al pedido!`,
      );
    } catch (err: any) {
      this.notificationService.showApiError(err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async processMobileServiceSale(): Promise<void> {
    if (this.serviceCart().length === 0) return;

    const mode = this.servicePaymentMode();
    const total = this.serviceCartTotal();
    const customer = this.serviceCustomerName().trim() || 'Consumidor Final';
    const customerId = this.serviceSelectedCustomerId() || 1;
    const phone = this.serviceCustomerPhone().trim();
    const notes = this.serviceNotes().trim();
    const amountRec =
      mode === 'Efectivo' ? this.serviceAmountReceived() || total : total;
    const change = this.serviceChangeDue();

    // Si es cobro en efectivo, validar sesión activa
    let session = this.activeSession();
    if (mode === 'Efectivo' && !session) {
      this.notificationService.warning(
        'Para cobrar servicios en efectivo debes tener un turno de caja abierto.',
      );
      this.isServicePaymentModalOpen.set(false);
      this.openMobileOpenRegisterModal();
      return;
    }

    this.isSubmitting.set(true);
    try {
      const cashRegisterId =
        session && mode === 'Efectivo'
          ? session.cashRegisterId || session.id
          : null;
      const salePayload: any = {
        customerId: customerId,
        cashRegisterId: cashRegisterId,
        total: total,
        paidAmount: mode === 'Credito' ? 0 : total,
        dueDate: mode === 'Credito' ? this.serviceDueDate() : null,
        originChannel: 'SERVICIO',
        paymentType: mode === 'Credito' ? 'CREDIT' : 'CASH',
        paymentMethod:
          mode === 'Efectivo'
            ? 'CASH'
            : mode === 'Credito'
              ? 'CREDIT'
              : 'OTHER',
        notes: notes
          ? `[SERVICIO] ${notes}`
          : '[SERVICIO] Factura de Servicios PWA',
        payment:
          mode !== 'Credito'
            ? {
                method:
                  mode === 'Efectivo'
                    ? 'CASH'
                    : mode === 'Tarjeta'
                      ? 'CARD'
                      : 'TRANSFER',
                amount: total,
                amountReceived: amountRec,
                changeAmount: change,
              }
            : undefined,
        details: this.serviceCart().map((item) => ({
          productId: item.serviceId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      };

      const saleRes = await this.saleService.createSale(salePayload);
      const createdSaleId =
        saleRes?.data?.id || (saleRes as any)?.id || Date.now();

      // Registro de entrada de efectivo en caja si aplica
      if (mode === 'Efectivo' && cashRegisterId) {
        try {
          await this.cashRegisterService.addMovement({
            type: 'Entrada',
            category: 'Ventas',
            description: `Venta de Servicios #${createdSaleId} ${notes ? '(' + notes + ')' : ''}`,
            amount: total,
            paymentMethod: 'Efectivo',
          });
        } catch (e) {
          console.warn(
            '[Mobile POS] Error al registrar movimiento de caja para servicio:',
            e,
          );
        }
      }

      // Registro de cuenta por cobrar si es a crédito
      if (mode === 'Credito') {
        try {
          await this.receivableService.createReceivable({
            customerId: customerId,
            customerName: customer,
            description: `Venta de Servicios #${createdSaleId} - ${notes || 'Mano de obra y servicios'}`,
            totalAmount: total,
            installmentAmount: total,
            totalInstallments: 1,
            startDate: this.serviceDueDate(),
            frequency: 'Mensual',
            items: this.serviceCart().map((i) => ({
              productId: i.serviceId,
              productName: i.serviceName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              subtotal: i.subtotal,
            })),
          });
        } catch (e) {
          console.warn(
            '[Mobile POS] Error al crear cuenta por cobrar de servicio:',
            e,
          );
        }
      }

      // Guardado en caché local para sincronización inmediata con desktop
      this.saleService.saveLocalSale({
        id: createdSaleId,
        customerId: customerId,
        total: total,
        paidAmount: mode === 'Credito' ? 0 : total,
        cashRegisterId: cashRegisterId,
        isCancelled: false,
        creationDate: new Date().toISOString(),
        details: this.serviceCart().map((c) => ({
          productId: c.serviceId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        })),
      });

      // Emisión de evento en vivo
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(
            new CustomEvent('cuadre:sale-completed', {
              detail: {
                id: createdSaleId,
                total,
                customerName: customer,
                paymentMethod: mode,
              },
            }),
          );
          if ('BroadcastChannel' in window) {
            const bc = new BroadcastChannel('cuadreenv_live_bus');
            bc.postMessage({
              type: 'SALE_COMPLETED',
              data: {
                id: createdSaleId,
                total,
                customerName: customer,
                paymentMethod: mode,
              },
            });
            bc.close();
          }
        } catch {}
      }

      const folio = `SERV-M-${String(createdSaleId).padStart(4, '0')}`;
      const ncf = `B02000000${String(createdSaleId).slice(-2)}`;

      const now = new Date();
      const formattedDate = formatInvoiceDateTime(now);

      this.lastServiceSaleSummary.set({
        folio,
        ncf,
        total,
        customerName: customer,
        customerPhone: phone,
        paymentMode: mode === 'Credito' ? 'Crédito (CxC)' : mode,
        notes,
        date: now,
        formattedDate,
        items: this.serviceCart().map((s) => ({
          name: s.serviceName,
          quantity: s.quantity,
          price: s.unitPrice,
          total: s.total,
        })),
      });

      this.isServicePaymentModalOpen.set(false);
      this.isServiceSuccessModalOpen.set(true);
      triggerHapticSuccess();
      soundEffects.playKaChing();
      this.clearServiceCart();
      await this.loadExecutiveData();
      this.notificationService.success(
        `¡Servicio facturado exitosamente por RD$ ${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}!`,
      );
    } catch (err: any) {
      console.error('Error procesando factura de servicio:', err);
      this.notificationService.showApiError(err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  sendServiceTicketViaWhatsApp(): void {
    const sale = this.lastServiceSaleSummary();
    if (!sale) return;

    const phone = sale.customerPhone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const amountStr = sale.total.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const itemsList = sale.items
      .map(
        (it) =>
          `• *${it.name}* (x${it.quantity}): RD$ ${it.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
      )
      .join('\n');

    const message = `🧾 *COMPROBANTE DE SERVICIOS - CUADRE-ENV*
🏢 *Empresa:* ${this.tenantName()}
👤 *Cliente:* ${sale.customerName}
📄 *Folio:* #${sale.folio}
🏛 *NCF:* ${sale.ncf}
💳 *Modalidad:* ${sale.paymentMode}
${sale.notes ? `📝 *Detalles:* ${sale.notes}\n` : ''}
🛠️ *Servicios Realizados:*
${itemsList}

💵 *Total:* RD$ ${amountStr}
📅 *Fecha:* ${formatInvoiceDate(sale.date || new Date())}
⏱ *Hora:* ${formatInvoiceTime(sale.date || new Date())}

✅ _Factura de servicios procesada con éxito._
¡Muchas gracias por su preferencia!`;

    const encoded = encodeURIComponent(message);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone.startsWith('1') ? cleanPhone : '1' + cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(url, '_blank');
  }

  // =========================================================================
  // HARDWARE: IMPRESIÓN DIRECTA BLUETOOTH ESC/POS (58mm / 80mm)
  // =========================================================================
  async pairBluetoothPrinter(): Promise<void> {
    try {
      const connected = await this.printerService.connectBluetooth();
      if (connected) {
        this.notificationService.success(
          `Impresora conectada: ${this.printerService.printerName() || 'ESC/POS'}`,
        );
        triggerHapticSuccess();
      }
    } catch (err: any) {
      this.notificationService.warning(
        err?.message || 'No se pudo conectar a la impresora Bluetooth.',
      );
    }
  }

  async printLastSaleTicket(): Promise<void> {
    const sale = this.lastSaleSummary();
    if (!sale) {
      this.notificationService.warning(
        'No hay una venta reciente para imprimir.',
      );
      return;
    }

    const company = this.companyService.currentSettings();
    const ticketData: TicketData = {
      companyName:
        company.commercialName ||
        company.companyName ||
        this.tenantName() ||
        'CUADRE ENV',
      commercialName: company.commercialName || undefined,
      logoUrl: company.logoUrl || undefined,
      rnc: company.rnc || undefined,
      address: company.address || undefined,
      phone: company.phone || undefined,
      instagram: company.ticketInstagram || undefined,
      whatsapp: company.ticketWhatsapp || undefined,
      footerPhrase: company.invoiceFooterPhrase || undefined,
      ticketShowQr: company.ticketShowQr !== false,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(sale.folio || 'TICKET')}`,
      ncf: sale.ncf,
      ncfTypeDescription: sale.ncf?.startsWith('B01')
        ? 'Factura de Crédito Fiscal'
        : 'Factura de Consumo',
      invoiceNumber: sale.folio,
      date: new Date(),
      cashierName: this.authService.currentUser()?.fullName || this.userName(),
      customerName: sale.customerName,
      items: (sale.items || []).map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      })),
      subtotal: sale.subtotal ?? sale.total,
      itbis: sale.itbis ?? 0,
      total: sale.total,
      paymentMethod: sale.paymentMethod || 'Efectivo',
      amountReceived: sale.amountReceived,
      change: sale.change,
      notes: company.invoiceFooterPhrase || '¡Gracias por su preferencia!',
    };

    try {
      await this.printerService.printTicket(ticketData);
      this.notificationService.success('Ticket enviado a la impresora.');
      triggerHaptic(15);
    } catch (err: any) {
      console.warn('Error imprimiendo ticket:', err);
      this.notificationService.error(
        err?.message || 'Error al imprimir ticket.',
      );
    }
  }

  // =========================================================================
  // GESTIÓN RÁPIDA DE INVENTARIO Y ENTRADA DE MERCANCÍA MÓVIL
  // =========================================================================
  openStockEntryModal(prod?: ProductDto): void {
    if (prod && prod.id) {
      this.stockEntryProductId.set(prod.id);
      this.stockEntryCost.set(prod.cost || 0);
    } else {
      const first = this.products()[0];
      this.stockEntryProductId.set(first?.id || null);
      this.stockEntryCost.set(first?.cost || 0);
    }
    this.stockEntryQuantity.set(1);
    this.stockEntryNotes.set('');
    this.isStockEntryModalOpen.set(true);
  }

  closeStockEntryModal(): void {
    this.isStockEntryModalOpen.set(false);
  }

  onStockEntryProductChange(productIdStr: string): void {
    const id = Number(productIdStr);
    this.stockEntryProductId.set(id);
    const prod = this.products().find((p) => p.id === id);
    if (prod) {
      this.stockEntryCost.set(prod.cost || 0);
    }
  }

  async confirmStockEntry(): Promise<void> {
    const pId = this.stockEntryProductId();
    const qty = Number(this.stockEntryQuantity());
    const cost = Number(this.stockEntryCost());

    if (!pId || qty <= 0) {
      this.notificationService.warning(
        'Selecciona un producto y una cantidad mayor a 0.',
      );
      return;
    }

    const prod = this.products().find((p) => p.id === pId);
    if (!prod) return;

    this.isSubmittingStockEntry.set(true);
    try {
      const newStock = (prod.stock || 0) + qty;
      const updatedProduct: ProductDto = {
        ...prod,
        stock: newStock,
        cost: cost > 0 ? cost : prod.cost,
      };

      const res = await this.productService.updateProduct(updatedProduct);
      if (res?.success || res?.data) {
        this.notificationService.success(
          `Entrada registrada: +${qty} ${this.getProductUnitSymbol(prod)} de "${prod.description}". Stock actual: ${newStock}`,
        );
        triggerHapticSuccess();
        this.closeStockEntryModal();
        await this.loadCatalog();
      } else {
        this.notificationService.error(
          res?.message || 'No se pudo actualizar el inventario.',
        );
      }
    } catch (err: any) {
      this.notificationService.error(
        err?.message || 'Error al registrar entrada de mercancía.',
      );
    } finally {
      this.isSubmittingStockEntry.set(false);
    }
  }

  // =========================================================================
  // HARDWARE BARCODE SCANNER (PISTOLAS USB / BLUETOOTH / WIRELESS WEDGE)
  // =========================================================================
  @HostListener('window:keydown', ['$event'])
  handleGlobalBarcodeScannerKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toUpperCase();
    const isInput =
      tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    const isSearchInput = target?.classList?.contains('cuadre-search-input');

    const now = Date.now();
    const diff = now - this.lastHardwareKeyTime;

    if (event.key === 'Enter') {
      if (this.hardwareBarcodeBuffer.length >= 3) {
        const code = this.hardwareBarcodeBuffer.trim();
        this.hardwareBarcodeBuffer = '';
        this.lastHardwareKeyTime = 0;

        const found = this.findProductByCode(code);
        if (found) {
          event.preventDefault();
          event.stopPropagation();
          this.addToCart(found);
          this.notificationService.success(
            `📦 Escáner: ${found.description} (RD$ ${(found.price || found.cost || 0).toFixed(2)})`,
          );
          return;
        } else {
          if (diff < 150) {
            event.preventDefault();
            soundEffects.playErrorBeep();
            triggerHaptic([30, 40, 30]);
            this.notificationService.warning(
              `Código "${code}" no encontrado en catálogo.`,
            );
            return;
          }
        }
      }
      this.hardwareBarcodeBuffer = '';
      return;
    }

    if (event.key && event.key.length === 1) {
      if (isInput && !isSearchInput && diff > 80) {
        this.hardwareBarcodeBuffer = '';
        return;
      }

      if (diff > 120 && isInput && !isSearchInput) {
        this.hardwareBarcodeBuffer = event.key;
      } else {
        this.hardwareBarcodeBuffer += event.key;
      }
      this.lastHardwareKeyTime = now;
    }
  }

  findProductByCode(code: string): ProductDto | null {
    if (!code) return null;
    const clean = code.trim().toLowerCase();
    const cleanDigits = clean.replace(/\D/g, '');
    const activeCid =
      this.authService.companyId() || Number(getCompanyId()) || 0;

    return (
      this.products().find((p) => {
        if (this.isServiceItem(p)) return false;

        // Aislamiento multi-tenant estricto: no puede ver ni escanear productos de otro tenant
        const pCid = p.companyId ?? (p as any).CompanyId;
        if (
          activeCid > 0 &&
          pCid != null &&
          Number(pCid) > 0 &&
          Number(pCid) !== activeCid
        ) {
          return false;
        }

        const b = (p.barcode || '').trim().toLowerCase();
        const r = (p.reference || '').trim().toLowerCase();
        const sku = ((p as any).sku || '').trim().toLowerCase();
        const idStr = p.id ? String(p.id) : '';

        // 1. Coincidencia directa exacta
        if (
          b === clean ||
          r === clean ||
          (clean.length >= 3 && sku === clean) ||
          idStr === clean
        ) {
          return true;
        }

        // 2. Normalización de dígitos (EAN-13 vs UPC-A vs ceros a la izquierda)
        if (cleanDigits.length >= 4) {
          const bDigits = b.replace(/\D/g, '');
          const rDigits = r.replace(/\D/g, '');
          if (bDigits) {
            if (
              bDigits === cleanDigits ||
              bDigits.padStart(13, '0') === cleanDigits.padStart(13, '0') ||
              bDigits.replace(/^0+/, '') === cleanDigits.replace(/^0+/, '')
            ) {
              return true;
            }
          }
          if (rDigits) {
            if (
              rDigits === cleanDigits ||
              rDigits.replace(/^0+/, '') === cleanDigits.replace(/^0+/, '')
            ) {
              return true;
            }
          }
        }
        return false;
      }) || null
    );
  }

  // =========================================================================
  // SPEED POS: VENTA RÁPIDA / MONTO MANUAL (ARTÍCULO NO CATALOGADO / VARIOS)
  // =========================================================================
  openQuickAmountModal(presetAmount?: number): void {
    if (presetAmount) {
      this.quickAmountValue.set(presetAmount);
    }
    this.isQuickAmountModalOpen.set(true);
    triggerHaptic(15);
  }

  addQuickAmountToCart(): void {
    const amount = Number(this.quickAmountValue()) || 0;
    if (amount <= 0) {
      this.notificationService.warning(
        'Ingresa un monto válido mayor a RD$ 0.',
      );
      return;
    }
    const qty = Math.max(1, Number(this.quickAmountQuantity()) || 1);
    const withTax = this.quickAmountWithTax();
    const taxRate = withTax ? 0.18 : 0;
    const description =
      this.quickAmountDescription().trim() || 'Artículo Libre / Varios';

    const customProduct: ProductDto = {
      id: 0,
      description,
      price: amount,
      cost: amount * 0.7,
      stock: 99999,
      taxRate,
      barcode: 'VAR-LIBRE',
      reference: 'VAR-LIBRE',
      categoryId: 1,
    };

    this.addToCart(customProduct);
    this.isQuickAmountModalOpen.set(false);
    this.notificationService.success(
      `Agregado al carrito: ${description} (RD$ ${(amount * qty).toFixed(2)})`,
    );
  }

  // =========================================================================
  // SPEED POS: DESCUENTOS RÁPIDOS
  // =========================================================================
  setCartDiscount(
    type: 'none' | 'percent' | 'fixed' | 'round',
    value = 0,
  ): void {
    this.cartDiscountType.set(type);
    this.cartDiscountValue.set(value);
    triggerHaptic(15);
    if (type === 'none') {
      this.notificationService.info('Descuento removido.');
    } else if (type === 'percent') {
      this.notificationService.success(
        `Descuento de ${value}% aplicado al pedido.`,
      );
    } else if (type === 'round') {
      this.notificationService.success(
        'Redondeo aplicado a favor del cliente.',
      );
    } else if (type === 'fixed') {
      this.notificationService.success(
        `Descuento fijo de RD$ ${value} aplicado.`,
      );
    }
  }

  promptFixedDiscount(): void {
    const current =
      this.cartDiscountType() === 'fixed' ? this.cartDiscountValue() : 50;
    const input = prompt(
      'Ingresa el monto fijo a descontar en RD$:',
      String(current),
    );
    if (input !== null) {
      const val = parseFloat(input);
      if (!isNaN(val) && val > 0) {
        this.setCartDiscount('fixed', val);
      } else {
        this.setCartDiscount('none', 0);
      }
    }
  }

  // =========================================================================
  // FINTECH: COPIA Y GESTIÓN DE DATOS BANCARIOS
  // =========================================================================
  copyBankAccount(): void {
    const acc = this.activeBankAccount();
    if (!acc) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(acc.accountNumber)
        .then(() => {
          this.isBankCopied.set(true);
          triggerHaptic(20);
          this.notificationService.success(
            `No. de cuenta copiado: ${acc.accountNumber}`,
          );
          setTimeout(() => this.isBankCopied.set(false), 2500);
        })
        .catch(() => {
          this.notificationService.info(`Cuenta: ${acc.accountNumber}`);
        });
    }
  }

  // =========================================================================
  // ESCÁNER CONTINUO EN RÁFAGA CON CÁMARA (NATIVE BARCODE DETECTOR + ZXING FALLBACK)
  // =========================================================================
  async openCameraScanner(): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      this.notificationService.error(
        'El acceso a la cámara en navegadores/PWA requiere conexión segura HTTPS o localhost.',
      );
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      (!navigator.mediaDevices?.getUserMedia &&
        !(navigator as any).getUserMedia)
    ) {
      this.notificationService.error(
        'Tu dispositivo o navegador no soporta acceso a la cámara.',
      );
      return;
    }

    this.isCameraScannerOpen.set(true);
    this.cameraBurstScannedCount.set(0);
    this.cameraLastScannedItem.set(null);
    triggerHaptic(15);

    setTimeout(async () => {
      try {
        const videoEl = document.getElementById(
          'cameraScannerVideo',
        ) as HTMLVideoElement;
        if (!videoEl) return;

        // Atributos indispensables para iOS Safari y PWA en modo standalone
        videoEl.setAttribute('autoplay', '');
        videoEl.setAttribute('muted', '');
        videoEl.setAttribute('playsinline', '');
        videoEl.setAttribute('webkit-playsinline', '');
        videoEl.muted = true;

        let stream: MediaStream | null = null;

        // Intento 1: Cámara trasera ideal con resolución estándar
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (err1) {
          console.warn(
            'Fallback 1: failed ideal environment constraint:',
            err1,
          );
          // Intento 2: facingMode environment directo
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment' },
              audio: false,
            });
          } catch (err2) {
            console.warn(
              'Fallback 2: failed exact environment, requesting any video camera:',
              err2,
            );
            // Intento 3: Cualquier cámara disponible (laptop, webcam, frontal)
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              });
            } catch (err3: any) {
              throw err3;
            }
          }
        }

        if (!stream) {
          throw new Error('No se pudo obtener el flujo de video.');
        }

        this.cameraStream = stream;
        videoEl.srcObject = stream;
        await videoEl
          .play()
          .catch((playErr) => console.warn('Video play error:', playErr));

        const track = stream.getVideoTracks()[0];
        if (track && (track.getCapabilities as any)) {
          const caps = track.getCapabilities() as any;
          this.isTorchAvailable.set(!!caps?.torch);
        }

        await this.startBarcodeScanning(videoEl, stream);
      } catch (err: any) {
        console.warn('Camera error:', err);
        let errorMsg =
          'No se pudo acceder a la cámara. Verifica los permisos de tu navegador o PWA.';
        if (
          err?.name === 'NotAllowedError' ||
          err?.name === 'PermissionDeniedError'
        ) {
          errorMsg =
            'Permiso denegado para la cámara. Habilita los permisos de cámara en los ajustes de tu navegador o PWA.';
        } else if (
          err?.name === 'NotFoundError' ||
          err?.name === 'DevicesNotFoundError'
        ) {
          errorMsg =
            'No se encontró ninguna cámara disponible en este dispositivo.';
        } else if (
          err?.name === 'NotReadableError' ||
          err?.name === 'TrackStartError'
        ) {
          errorMsg = 'La cámara ya está siendo usada por otra aplicación.';
        }
        this.notificationService.error(errorMsg);
        this.closeCameraScanner();
      }
    }, 150);
  }

  async toggleTorch(): Promise<void> {
    const track = this.cameraStream?.getVideoTracks()[0];
    if (!track) return;
    try {
      const targetState = !this.isTorchOn();
      await (track as any).applyConstraints({
        advanced: [{ torch: targetState }],
      });
      this.isTorchOn.set(targetState);
      triggerHaptic(15);
    } catch (err) {
      console.warn('Torch constraint error:', err);
    }
  }

  closeCameraScanner(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.zxingControls) {
      try {
        this.zxingControls.stop();
      } catch {}
      this.zxingControls = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
    }
    this.isTorchOn.set(false);
    this.isTorchAvailable.set(false);
    this.cameraScanFlash.set(false);
    this.isCameraScannerOpen.set(false);
  }

  finishCameraScanningAndOpenCart(): void {
    this.closeCameraScanner();
    this.isCartDrawerOpen.set(true);
  }

  private getZxingReader(): BrowserMultiFormatReader {
    if (!this.zxingReader) {
      const hints = new Map<DecodeHintType, any>();
      const formats = [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.CODABAR,
      ];
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(DecodeHintType.TRY_HARDER, true);

      this.zxingReader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
    }
    return this.zxingReader;
  }

  private async startBarcodeScanning(
    videoEl: HTMLVideoElement,
    stream: MediaStream,
  ): Promise<void> {
    // 1. Motor principal omnidireccional: ZXing con TRY_HARDER para 1D (EAN/UPC/Code128) y 2D (QR)
    try {
      const reader = this.getZxingReader();
      const controls = await reader.decodeFromStream(
        stream,
        videoEl,
        (result, error) => {
          if (!this.isCameraScannerOpen()) return;
          if (result) {
            const code = result.getText();
            if (code) {
              void this.handleScannedBarcode(code, true);
            }
          }
        },
      );

      if (!this.isCameraScannerOpen()) {
        try {
          controls.stop();
        } catch {}
      } else {
        this.zxingControls = controls;
      }
    } catch (zxingErr) {
      console.warn(
        'ZXing stream decode error, falling back to video element:',
        zxingErr,
      );
      try {
        const reader = this.getZxingReader();
        const controls = await reader.decodeFromVideoElement(
          videoEl,
          (result, error) => {
            if (!this.isCameraScannerOpen()) return;
            if (result) {
              const code = result.getText();
              if (code) {
                void this.handleScannedBarcode(code, true);
              }
            }
          },
        );
        this.zxingControls = controls;
      } catch (err2) {
        console.warn('ZXing video element fallback error:', err2);
      }
    }

    // 2. Acelerador nativo por hardware si el navegador lo soporta y reconoce formatos 1D
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const supported: string[] = await (
          window as any
        ).BarcodeDetector.getSupportedFormats().catch(() => []);
        if (supported && supported.includes('ean_13')) {
          const detector = new (window as any).BarcodeDetector({
            formats: [
              'ean_13',
              'ean_8',
              'code_128',
              'code_39',
              'qr_code',
              'upc_a',
              'upc_e',
            ],
          });

          this.scanInterval = setInterval(async () => {
            if (
              !this.isCameraScannerOpen() ||
              videoEl.readyState < videoEl.HAVE_CURRENT_DATA
            )
              return;
            try {
              const detected = await detector.detect(videoEl);
              if (detected && detected.length > 0 && detected[0].rawValue) {
                void this.handleScannedBarcode(detected[0].rawValue, true);
              }
            } catch {
              // Frame scan continue
            }
          }, 150);
        }
      } catch (nativeErr) {
        console.warn('Native BarcodeDetector booster not active:', nativeErr);
      }
    }
  }

  async handleScannedBarcode(
    barcode: string,
    isFromCamera = false,
  ): Promise<void> {
    const code = barcode.trim();
    if (!code) return;

    const now = Date.now();
    if (
      isFromCamera &&
      code.toLowerCase() === this.lastCameraScanCode.toLowerCase() &&
      now - this.lastCameraScanTime < 1200
    ) {
      return;
    }

    this.lastCameraScanCode = code;
    this.lastCameraScanTime = now;

    let found = this.findProductByCode(code);

    // Fallback: Si no está en memoria local, buscar en la API por código/código de barra respetando tenant
    if (!found) {
      try {
        const searchRes = await this.productService.searchProducts(code);
        if (searchRes.success && searchRes.data && searchRes.data.length > 0) {
          const activeCid =
            this.authService.companyId() || Number(getCompanyId()) || 0;
          const candidate =
            searchRes.data.find((c: any) => {
              const cCid = c.companyId ?? c.CompanyId;
              if (
                activeCid > 0 &&
                cCid != null &&
                Number(cCid) > 0 &&
                Number(cCid) !== activeCid
              ) {
                return false;
              }
              const b = (c.barcode || '').trim().toLowerCase();
              const r = (c.reference || '').trim().toLowerCase();
              const clean = code.toLowerCase();
              const cleanDigits = code.replace(/\D/g, '');
              const bDigits = b.replace(/\D/g, '');
              return (
                b === clean ||
                r === clean ||
                (cleanDigits.length >= 4 &&
                  bDigits &&
                  (bDigits === cleanDigits ||
                    bDigits.replace(/^0+/, '') === cleanDigits.replace(/^0+/, '')))
              );
            }) || searchRes.data[0];

          const cCid = candidate?.companyId ?? (candidate as any)?.CompanyId;
          if (
            candidate &&
            (!activeCid ||
              cCid == null ||
              Number(cCid) === 0 ||
              Number(cCid) === activeCid)
          ) {
            found = candidate;
            this.products.update((list) => {
              if (!list.some((p) => p.id === candidate.id)) {
                return [candidate, ...list];
              }
              return list;
            });
          }
        }
      } catch (err) {
        console.warn('Backend barcode lookup error:', err);
      }
    }

    if (found) {
      this.addToCart(found);
      this.cameraBurstScannedCount.update((c) => c + 1);
      this.cameraLastScannedItem.set({
        name: found.description || 'Producto',
        price: found.price || found.cost || 0,
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      });

      this.cameraScanFlash.set(true);
      setTimeout(() => this.cameraScanFlash.set(false), 250);

      soundEffects.playScannerBeep();
      triggerHaptic(25);

      if (!isFromCamera) {
        this.notificationService.success(
          `Producto agregado: ${found.description}`,
        );
      }
    } else {
      soundEffects.playErrorBeep();
      triggerHaptic([30, 40, 30]);
      this.notificationService.warning(
        `Código "${barcode}" no registrado en el catálogo de esta empresa.`,
      );
      if (!isFromCamera) {
        this.searchTerm.set(barcode);
        this.closeCameraScanner();
      }
    }
  }
}
