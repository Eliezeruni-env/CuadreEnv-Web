import { formatPaymentMethodLabel } from '../../../cuadreEnv/utils/payment-method.util';
import { firstValueFrom } from 'rxjs';
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { getCompanyId } from '../../../cuadreEnv/services/apiClient';
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  effect,
  HostListener,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { ProductService } from '../../../products/services/product.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { CategoryService } from '../../../products/services/category.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import {
  PosOfflineSyncService,
  generateIdempotencyKey,
} from '../../services/pos-offline-sync.service';
import {
  PosDraftStorageService,
  type PosHeldSale,
} from '../../services/pos-draft-storage.service';
import { CompanyService } from '../../../companies/services/company.service';
import type {
  ProductDto,
  CustomerDto,
  CompanyBankAccountDto,
  SaleResponseDto,
} from '../../../cuadreEnv/types/api';
import { SaleService } from '../../services/sale.service';
import { PosAudioService } from '../../services/pos-audio.service';
import { PosCatalogCacheService } from '../../services/pos-catalog-cache.service';
import { ModuleAccessService } from '../../../cuadreEnv/services/module-access.service';
import {
  ThermalPrinterService,
  type TicketData,
} from '../../services/thermal-printer.service';
import { IconDirective } from '@coreui/icons-angular';
import { SpinnerComponent } from '@coreui/angular';
import {
  SaleCompletedModalComponent,
  type CompletedSaleDto,
} from '../sales/sale-completed-modal.component';
import { SendWhatsAppModalComponent } from '../sales/send-whatsapp-modal/send-whatsapp-modal.component';
import type { WhatsAppInvoiceData } from '../../services/whatsapp-share.service';
import {
  UnitOfMeasurementService,
  type UnitOfMeasurement,
} from '../../../products/services/unit-of-measurement.service';
import {
  ProductPackagingService,
  type ProductPackaging,
} from '../../../products/services/product-packaging.service';
import { WarehouseService } from '../../../inventory/services/warehouse.service';
import { StockService } from '../../../inventory/services/stock.service';
import { KardexService } from '../../../inventory/services/kardex.service';
import { NcfAlertBannerComponent } from '../../../billing/components/ncf-alert-banner/ncf-alert-banner.component';
import { RealtimeAlertService } from '../../../cuadreEnv/services/realtime-alert.service';
import { soundEffects } from '../../../cuadreEnv/utils/sound-effects';
import {
  getRDGreeting,
  formatDateInRD,
  formatTimeInRD,
  formatDateTimeInRD,
} from '../../../cuadreEnv/utils/rd-date.util';
import {
  generateDominicanEan13,
  generateBarcodeSvg,
  generateBarcodeSheetHtml,
  type BarcodePrintItem,
} from '../../../cuadreEnv/utils/barcode.util';
import type { Warehouse } from '../../../../app/models/warehouse';

export interface QuickSaleItem {
  productId: number;
  productCode: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  costPrice?: number;
  taxRate?: number; // 18, 16, 0
  unitSymbol?: string;
  allowsDecimals?: boolean;
  saleMode?: 'detail' | 'package' | 'individual';
  modeLabel?: string;
  conversionFactor?: number;
  deductionQuantity?: number;
}

export interface CriticalAlertState {
  title: string;
  message: string;
  canQueueOffline: boolean;
  rawPayload?: any;
}

import { CreditNoteFormComponent } from '../credit-notes/credit-note-form.component';
import { QuickReceivablePaymentModalComponent } from '../quick-receivable-payment-modal/quick-receivable-payment-modal.component';
import type { CreditNote } from '../../../../app/models/credit-note';

const LAST_SALE_STORAGE_KEY = 'cuadre_last_completed_sale';

@Component({
  selector: 'app-quick-sale-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    FormsModule,
    SpinnerComponent,
    SaleCompletedModalComponent,
    SendWhatsAppModalComponent,
    NcfAlertBannerComponent,
    CreditNoteFormComponent,
    QuickReceivablePaymentModalComponent,
  ],
  templateUrl: './quick-sale-page.component.html',
  styleUrls: ['./quick-sale-page.component.scss'],
})
export class QuickSalePageComponent implements OnInit, OnDestroy {
  formatPaymentMethod(method?: string | number | null): string {
    return formatPaymentMethodLabel(method);
  }

  formatSaleDate(sale: any): string {
    if (!sale) return '—';
    const val =
      sale.date || sale.creationDate || sale.createdAt || sale.createdDate;
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return '—';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${day}/${month}/${year}, ${hours}:${minutes} ${ampm}`;
    } catch {
      return '—';
    }
  }

  @ViewChild('catalogSearchInput')
  catalogSearchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('amountReceivedInput')
  amountReceivedInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('sendWhatsAppModal')
  sendWhatsAppModal?: SendWhatsAppModalComponent;

  readonly Math = Math;
  readonly translationService = inject(TranslationService);
  readonly offlineService = inject(PosOfflineSyncService);
  readonly draftStorageService = inject(PosDraftStorageService);
  readonly realtimeAlertService = inject(RealtimeAlertService);

  private cashRegisterService = inject(CashRegisterService);
  private productService = inject(ProductService);
  private customerService = inject(CustomerService);
  private categoryService = inject(CategoryService);
  private warehouseService = inject(WarehouseService);
  private stockService = inject(StockService);
  private kardexService = inject(KardexService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  readonly companyService = inject(CompanyService);
  readonly authService = inject(AuthService);
  readonly packagingService = inject(ProductPackagingService);
  readonly unitService = inject(UnitOfMeasurementService);
  private saleService = inject(SaleService);
  readonly printerService = inject(ThermalPrinterService);
  readonly posAudio = inject(PosAudioService);
  readonly catalogCache = inject(PosCatalogCacheService);
  readonly moduleAccess = inject(ModuleAccessService);

  canAccessFeature(code: string, parentModule?: string): boolean {
    return this.moduleAccess.hasFeature(code, parentModule);
  }

  readonly canConfigureNcf = computed(() =>
    this.moduleAccess.hasFeature('pos-configure-ncf', 'billing'),
  );

  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  isLoadingProducts = signal<boolean>(false);
  products = signal<ProductDto[]>([]);
  customers = signal<CustomerDto[]>([]);
  units = signal<UnitOfMeasurement[]>([]);

  // 1. Auto-Impresión de Ticket Térmico al Cobrar (Configurable)
  autoPrintTicket = signal<boolean>(
    typeof window !== 'undefined' &&
      localStorage.getItem('cuadre_pos_auto_print') === 'true',
  );

  // 1.1 Venta Fraccionada / Menudeo Mode
  isFractionalSaleMode = signal<boolean>(false);
  filterOnlyFractional = signal<boolean>(false);

  toggleOnlyFractional(): void {
    this.filterOnlyFractional.update((v) => !v);
  }

  // 2. Fila de "Favoritos / Productos Estrella" (1 Toque)
  favoriteProductIds = signal<number[]>(this.loadFavoriteProductIds());

  private loadFavoriteProductIds(): number[] {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('cuadre_pos_favorite_ids');
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  isFavoriteProduct(productId: number): boolean {
    return this.favoriteProductIds().includes(productId);
  }

  readonly favoriteProducts = computed<ProductDto[]>(() => {
    const favIds = this.favoriteProductIds();
    const allProds = this.products().filter((p) => {
      if (this.isServiceItem(p)) return false;
      if (p.id != null) {
        const available = this.getProductAvailableStock(p.id);
        if (available <= 0 && !(p as any).invoiceWithoutStock) return false;
      }
      return true;
    });
    if (favIds.length > 0) {
      const favSet = new Set(favIds);
      const list = allProds.filter((p) => favSet.has(p.id!));
      if (list.length > 0) return list.slice(0, 12);
    }
    return allProds.slice(0, 8);
  });

  // 3. Historial de Ventas Recientes & Anulaciones Rápidas
  isRecentSalesModalOpen = signal<boolean>(false);
  recentSales = signal<SaleResponseDto[]>([]);
  isLoadingRecentSales = signal<boolean>(false);
  cancellingSale = signal<SaleResponseDto | null>(null);
  cancelReason = signal<string>('');
  isCancelling = signal<boolean>(false);

  // 5. Configuración de Datos del Negocio para el Ticket Térmico
  isBusinessTicketModalOpen = signal<boolean>(false);
  ticketCompanyName = signal<string>('');
  ticketCommercialName = signal<string>('');
  ticketRnc = signal<string>('');
  ticketPhone = signal<string>('');
  ticketAddress = signal<string>('');
  ticketFooterPhrase = signal<string>('');
  ticketPaperSize = signal<'58mm' | '80mm'>('80mm');
  isSavingTicketSettings = signal<boolean>(false);

  // 6. Generador de Planilla de Códigos de Barra
  isBarcodeSheetModalOpen = signal<boolean>(false);
  barcodeSheetFormat = signal<'grid' | 'roll'>('grid');
  barcodeFilterType = signal<'all' | 'with-barcode'>('all');

  // Warehouse isolation
  warehouses = signal<Warehouse[]>([]);
  selectedWarehouseId = signal<number | null>(null);
  warehouseStockMap = signal<Map<number, number>>(new Map());

  selectedCustomerId: number | null = 1;
  readonly selectedCustomer = computed(() => {
    const id = this.selectedCustomerId ?? 1;
    return (
      this.customers().find((c) => c.id === id) ||
      this.customers().find((c) => c.id === 1) ||
      null
    );
  });
  catalogSearchTerm = signal<string>('');
  selectedCategory = signal<number | null>(null);

  // Camera Barcode Scanner & Hardware Scanner Wedge
  isCameraScannerOpen = signal<boolean>(false);
  private cameraStream: MediaStream | null = null;
  cameraScanFlash = signal<boolean>(false);
  cameraLastScannedItem = signal<{
    name: string;
    price: number;
    time: string;
  } | null>(null);
  cameraBurstScannedCount = signal<number>(0);
  cameraLastScanAlert = signal<{
    code: string;
    name: string;
    price: number;
    time: string;
    status: 'success' | 'not_found';
  } | null>(null);
  private cameraAlertTimeoutId: any = null;
  private lastCameraScanCode = '';
  private lastCameraScanTime = 0;
  private cameraAnimFrameId: number | null = null;
  private zxingReader: BrowserMultiFormatReader | null = null;
  private zxingControls: any = null;
  private barcodeTimeoutId: any = null;
  private barcodeBuffer = '';
  private barcodeLastCharTime = 0;
  private barcodeTimestamps: number[] = [];

  // Cart & Active Item Selection (Keyboard Shortcuts)
  cartItems = signal<QuickSaleItem[]>([]);
  selectedCartIndex = signal<number>(0);

  // Modo Cajero Compacto (Pantallas 15" / 1366x768 / Alta densidad)
  isCompactMode = signal<boolean>(
    typeof window !== 'undefined' &&
      localStorage.getItem('cuadre_pos_compact_mode') === 'true',
  );

  // Menú desplegable de Opciones / Configuración POS en cabecera
  isOptionsMenuOpen = signal<boolean>(false);

  toggleOptionsMenu(): void {
    this.isOptionsMenuOpen.update((v) => !v);
  }

  closeOptionsMenu(): void {
    this.isOptionsMenuOpen.set(false);
  }

  toggleCompactMode(): void {
    const next = !this.isCompactMode();
    this.isCompactMode.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cuadre_pos_compact_mode', String(next));
    }
    this.notificationService.info(
      next
        ? 'Modo Cajero Compacto activado (Alta densidad 12+ productos)'
        : 'Modo Estándar activado',
    );
  }

  // Measurement & Bulk Packaging Modal (Venta al Detalle vs Saco/Empaque)
  isMeasurementModalOpen = signal<boolean>(false);
  selectedProductForMeasurement = signal<ProductDto | null>(null);
  measurementQuantity = signal<number>(1);
  measurementCartIndex = signal<number | null>(null);
  measurementMode = signal<'detail' | 'package' | 'individual'>('detail');
  activeProductPackaging = signal<ProductPackaging | null>(null);

  // Product Photo & Literal Barcode Modal (En los productos de la caja)
  selectedProductForPhotoModal = signal<ProductDto | null>(null);
  selectedSaleAmountMoney = signal<number | null>(null);

  private sanitizer = inject(DomSanitizer);

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

  setDetailSaleByMoney(amount: number): void {
    const prod = this.selectedProductForMeasurement();
    if (!prod) return;
    const unitPrice =
      this.getEffectiveUnitPrice() || Number(prod.price || prod.priceList || 0);
    if (unitPrice <= 0) return;
    this.selectedSaleAmountMoney.set(amount);
    const calculatedQty = Math.round((amount / unitPrice) * 1000) / 1000;
    this.measurementQuantity.set(calculatedQty);
  }

  onMeasurementQtyChange(qty: any): void {
    const val = Math.max(0, Number(qty) || 0);
    this.measurementQuantity.set(val);
    const unitPrice = this.getEffectiveUnitPrice() || 1;
    this.selectedSaleAmountMoney.set(Math.round(val * unitPrice * 100) / 100);
  }

  onMeasurementMoneyChange(amount: any): void {
    const money = Math.max(0, Number(amount) || 0);
    this.selectedSaleAmountMoney.set(money);
    const unitPrice = this.getEffectiveUnitPrice() || 1;
    if (unitPrice > 0) {
      const calculatedQty = Math.round((money / unitPrice) * 1000) / 1000;
      this.measurementQuantity.set(calculatedQty);
    }
  }

  // Discounts & Payments
  discountType = signal<'percent' | 'fixed'>('percent');
  discountValue = signal<number>(0);

  // Impuestos diferenciados, Propina Legal (10%) y Retenciones
  applyLegalTip = signal<boolean>(false);
  retentionItbisRate = signal<number>(0); // 0, 30, 100
  retentionIsrRate = signal<number>(0); // 0, 2, 10

  selectedMethod = signal<string>('Efectivo');
  amountReceived = signal<number>(0);

  // Manejo Dual de Monedas (RD$ / USD) con Tasa Banco Central
  cashCurrency = signal<'DOP' | 'USD'>('DOP');
  usdExchangeRate = signal<number>(60.5);
  amountReceivedUsd = signal<number>(0);

  // Card details
  cardType = signal<'DEBIT' | 'CREDIT'>('DEBIT');
  cardLastFour = signal<string>('');
  cardAuthVoucher = signal<string>('');

  // Transfer details & Instant Bank Channels from Company Settings
  readonly bankChannels = computed(() => {
    const accounts = this.companyService.getBankAccounts();
    return accounts.map((b) => {
      let color = 'primary';
      let icon = '🏦';
      const bUpper = b.bankName.toUpperCase();
      if (bUpper.includes('QIK')) {
        color = 'dark';
        icon = '⚡';
      } else if (bUpper.includes('BHD')) {
        color = 'success';
        icon = '🟢';
      } else if (
        bUpper.includes('BANRESERVAS') ||
        bUpper.includes('RESERVAS')
      ) {
        color = 'danger';
        icon = '🔴';
      } else if (bUpper.includes('ACH')) {
        color = 'info';
        icon = '🌐';
      } else if (bUpper.includes('POPULAR')) {
        color = 'primary';
        icon = '🏦';
      }

      return {
        id: b.id,
        name: b.bankName,
        account: b.accountNumber,
        type: b.accountType || 'Cta. Corriente',
        color,
        icon,
        holderName: b.holderName || '',
        holderRnc: b.holderRnc || '',
        currency: b.currency || 'DOP',
        isDefault: b.isDefault || false,
      };
    });
  });

  selectedBankChannel = signal<string>('POPULAR');

  readonly currentBankProfile = computed(() => {
    const list = this.bankChannels();
    return (
      list.find((b) => b.id === this.selectedBankChannel()) ||
      list.find((b) => b.isDefault) ||
      list[0] || {
        id: 'POPULAR',
        name: 'Banco Popular',
        account: '792019481',
        type: 'Cta. Corriente',
        color: 'primary',
        icon: '🏦',
        holderName: 'CuadreEnv Soluciones',
        holderRnc: '132-94812-1',
        currency: 'DOP',
        isDefault: true,
      }
    );
  });

  isBankQrOpen = signal<boolean>(false);
  isCustomerQrModalOpen = signal<boolean>(false);
  isBankCopied = signal<boolean>(false);

  readonly bankTransferQrUrl = computed(() => {
    const bank = this.currentBankProfile();
    const totalAmount = this.netPayable().toFixed(2);
    const tenant = this.activeSessionName() || 'CuadreEnv POS';
    const payload = `PAGO_TRANSFERENCIA_BANCARIA\nBanco: ${bank.name}\nCuenta: ${bank.account} (${bank.type})\nTitular: ${bank.holderName || 'Empresa'}\nRNC: ${bank.holderRnc || 'N/A'}\nMonto Exacto: RD$ ${totalAmount}\nComercio: ${tenant}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(payload)}`;
  });

  readonly transferQrUrl = computed(() => {
    return this.bankTransferQrUrl();
  });

  copyBankAccountNumber(): void {
    const acc = this.currentBankProfile().account;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(acc);
      this.isBankCopied.set(true);
      this.notificationService.success(
        `No. de cuenta ${acc} copiado al portapapeles.`,
      );
      setTimeout(() => this.isBankCopied.set(false), 2000);
    }
  }

  selectBankChannel(id: string): void {
    this.selectedBankChannel.set(id);
    const bank = this.bankChannels().find((b) => b.id === id);
    if (bank) {
      this.transferBank.set(`${bank.name} (${bank.account})`);
    }
  }

  copyPaymentDetails(textToCopy: string, label: string): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
      this.notificationService.success(`${label} copiado al portapapeles.`);
    }
  }

  copyAllBankDetails(): void {
    const bank = this.currentBankProfile();
    const text = `🏦 *${bank.name}*\nCuenta: ${bank.account} (${bank.type})\nTitular: ${bank.holderName || 'Empresa'}\nRNC/Cédula: ${bank.holderRnc || ''}\nMonto: RD$ ${this.netPayable().toFixed(2)}`;
    this.copyPaymentDetails(text, 'Datos completos de transferencia bancaria');
  }

  sendPaymentViaWhatsApp(): void {
    const bank = this.currentBankProfile();
    const phone = this.selectedCustomer()?.phone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const amountStr = this.netPayable().toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    let message = `👋 *Hola${this.selectedCustomer()?.name ? ' ' + this.selectedCustomer()?.name : ''}!*
Para completar tu compra en *CuadreEnv POS*, aquí tienes los datos para tu transferencia inmediata:

💵 *Monto exacto a transferir:* RD$ ${amountStr}
🏦 *Banco Destino:* ${bank.name}
💳 *Número de Cuenta:* ${bank.account} (${bank.type})
${bank.holderName ? `👤 *Titular:* ${bank.holderName}\n` : ''}${bank.holderRnc ? `🏢 *RNC/Cédula:* ${bank.holderRnc}\n` : ''}
📲 _Por favor, envíanos el comprobante o captura de la transferencia por aquí para validar tu pago e-CF._ ¡Muchas gracias!`;

    const encodedMsg = encodeURIComponent(message);
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone.startsWith('1') ? cleanPhone : '1' + cleanPhone}?text=${encodedMsg}`
      : `https://wa.me/?text=${encodedMsg}`;

    window.open(waUrl, '_blank');
  }

  // Quick-Add Bank Account Modal in POS
  isAddBankModalOpen = signal<boolean>(false);
  newBankName = signal<string>('');
  newBankAccount = signal<string>('');
  newBankType = signal<string>('Cta. Corriente');
  newBankHolder = signal<string>('');
  newBankRnc = signal<string>('');

  openAddBankModal(): void {
    const s = this.companyService.currentSettings();
    this.newBankName.set('');
    this.newBankAccount.set('');
    this.newBankType.set('Cta. Corriente');
    this.newBankHolder.set(s.commercialName || s.companyName || '');
    this.newBankRnc.set(s.rnc || '');
    this.isAddBankModalOpen.set(true);
  }

  closeAddBankModal(): void {
    this.isAddBankModalOpen.set(false);
  }

  async saveNewBankAccount(): Promise<void> {
    const name = this.newBankName().trim();
    const acc = this.newBankAccount().trim();
    if (!name || !acc) {
      this.notificationService.warning(
        'Por favor ingresa el nombre del banco y el número de cuenta.',
      );
      return;
    }

    const newAcc: CompanyBankAccountDto = {
      id: `BANK_${Date.now()}`,
      bankName: name,
      accountNumber: acc,
      accountType: this.newBankType(),
      holderName: this.newBankHolder().trim(),
      holderRnc: this.newBankRnc().trim(),
      currency: 'DOP',
      isDefault: false,
    };

    await this.companyService.addBankAccount(newAcc);
    this.notificationService.success(
      `Cuenta de ${name} agregada exitosamente.`,
    );
    this.selectBankChannel(newAcc.id);
    this.closeAddBankModal();
  }

  transferBank = signal<string>('Banco Popular (792019481)');
  transferReference = signal<string>('');
  transferAccountLastFour = signal<string>('');
  transferAmountDeposited = signal<number>(0);

  // Pagination & View Mode for catalog (3x3 = 9 products per page in grid/list)
  catalogPage = signal<number>(1);
  catalogPageSize = 9;
  catalogViewMode = signal<'grid' | 'list'>('grid');

  categories = signal<{ id: number | null; label: string }[]>([
    { id: null, label: 'Todos' },
  ]);

  // Session info & Cash Register Guard
  activeSessionName = signal<string>('Sin Caja Abierta');
  hasOpenSession = signal<boolean>(false);
  isOpenSessionModalVisible = signal<boolean>(false);

  // 3-Step Checkout Flow: 1. Cobrar, 2. Factura (opcional), 3. Comprobante
  checkoutStep = signal<1 | 2 | 3>(1);
  step2ExplicitlyCompleted = signal<boolean>(false);
  invoiceType = signal<'B02' | 'B01' | 'B15' | 'TICKET'>('B02');
  fiscalRnc = signal<string>('');
  fiscalBusinessName = signal<string>('');
  invoiceNotes = signal<string>('');

  isStep1Completed = computed(() => this.isStep1Valid());
  isStep2Completed = computed(() => {
    if (!this.canConfigureNcf()) return false;
    return (
      this.step2ExplicitlyCompleted() ||
      (this.fiscalRnc().trim().length >= 9 &&
        this.fiscalBusinessName().trim().length > 0)
    );
  });
  isStep3Completed = computed(() => !!this.lastCompletedSale());

  // Interactive Calculator (F3)
  isCalculatorOpen = signal<boolean>(false);
  calculatorDisplay = signal<string>('0');
  calculatorFormula = signal<string>('');

  // Completed sale receipt modal
  isSaleCompletedModalOpen = false;
  lastCompletedSale = signal<CompletedSaleDto | null>(null);

  // Held Carts (Ventas en espera) Modal
  isHeldSalesModalOpen = signal<boolean>(false);

  // Devoluciones y Notas de Crédito (B04) en mostrador
  isCreditNoteModalOpen = signal<boolean>(false);
  preloadedInvoiceForCreditNote = signal<string>('');

  openCreditNoteModal(invoiceIdOrNum?: string): void {
    this.preloadedInvoiceForCreditNote.set(invoiceIdOrNum || '');
    this.isCreditNoteModalOpen.set(true);
  }

  closeCreditNoteModal(): void {
    this.isCreditNoteModalOpen.set(false);
    this.preloadedInvoiceForCreditNote.set('');
  }

  onCreditNoteCreated(note: CreditNote): void {
    this.notificationService.success(
      `Nota de crédito ${note.creditNoteNumber || ''} ${note.ncf ? `(NCF: ${note.ncf})` : ''} generada exitosamente. Mercancía reintegrada al almacén.`,
    );
    this.closeCreditNoteModal();
    if (this.selectedWarehouseId()) {
      this.loadWarehouseStock(this.selectedWarehouseId()!);
    }
  }

  // Cobros de Cuentas por Cobrar (Abonos) en mostrador
  isReceivablePaymentModalOpen = signal<boolean>(false);

  openReceivablePaymentModal(): void {
    this.isReceivablePaymentModalOpen.set(true);
  }

  closeReceivablePaymentModal(): void {
    this.isReceivablePaymentModalOpen.set(false);
  }

  handleReceivablePaymentCompleted(): void {
    void this.loadInitialLookups();
  }

  // Apertura manual de gaveta de dinero desde opciones
  async openCashDrawerDirect(): Promise<void> {
    try {
      const ok = await this.printerService.openCashDrawer();
      if (ok) {
        soundEffects.playKaChing();
        this.notificationService.success(
          'Comando de apertura de gaveta enviado.',
        );
      } else {
        this.notificationService.info(
          'Gaveta lista. Conecte su impresora térmica vía USB/Bluetooth para apertura eléctrica.',
        );
      }
    } catch {
      this.notificationService.warning(
        'No se pudo enviar el pulso a la gaveta.',
      );
    }
  }

  // Keyboard Shortcuts Cheatsheet Modal
  isShortcutsModalOpen = signal<boolean>(false);

  // Offline Conflict Resolution Modal
  isConflictsModalOpen = signal<boolean>(false);

  // Persistent Critical Alert Panel
  criticalAlert = signal<CriticalAlertState | null>(null);

  private sessionExpiredListener?: () => void;
  private beforeUnloadListener?: () => void;

  readonly subtotal = computed(() => {
    return this.cartItems().reduce((acc, item) => acc + item.total, 0);
  });

  readonly discountAmount = computed(() => {
    const sub = this.subtotal();
    const val = Number(this.discountValue()) || 0;
    if (this.discountType() === 'percent') {
      return (sub * Math.max(0, Math.min(100, val))) / 100;
    }
    return Math.max(0, Math.min(sub, val));
  });

  readonly itbis = computed(() => {
    const sub = this.subtotal();
    const disc = this.discountAmount();
    const factor = sub > 0 ? Math.max(0, (sub - disc) / sub) : 1;
    return (
      Math.round(
        this.cartItems().reduce((acc, item) => {
          const rate = item.taxRate !== undefined ? item.taxRate : 18;
          return acc + item.total * factor * (rate / 100);
        }, 0) * 100,
      ) / 100
    );
  });

  readonly netSubtotal = computed(() => {
    return Math.max(0, this.subtotal() - this.discountAmount());
  });

  readonly cartTotalCost = computed(() => {
    return (
      Math.round(
        this.cartItems().reduce((acc, item) => {
          const itemCost = Number(item.costPrice || 0);
          return acc + itemCost * item.quantity;
        }, 0) * 100,
      ) / 100
    );
  });

  readonly isSaleBelowCost = computed(() => {
    const totalCost = this.cartTotalCost();
    if (totalCost <= 0 || this.cartItems().length === 0) return false;
    return this.netSubtotal() < totalCost;
  });

  readonly belowCostDeficit = computed(() => {
    if (!this.isSaleBelowCost()) return 0;
    return Math.max(
      0,
      Math.round((this.cartTotalCost() - this.netSubtotal()) * 100) / 100,
    );
  });

  readonly legalTipAmount = computed(() => {
    return this.applyLegalTip()
      ? Math.round(this.netSubtotal() * 0.1 * 100) / 100
      : 0;
  });

  readonly retentionItbisAmount = computed(() => {
    const rate = this.retentionItbisRate();
    return rate > 0 ? Math.round(this.itbis() * (rate / 100) * 100) / 100 : 0;
  });

  readonly retentionIsrAmount = computed(() => {
    const rate = this.retentionIsrRate();
    return rate > 0
      ? Math.round(this.netSubtotal() * (rate / 100) * 100) / 100
      : 0;
  });

  readonly total = computed(() => {
    return Math.max(0, this.netSubtotal() + this.itbis());
  });

  readonly netPayable = computed(() => {
    return Math.max(
      0,
      Math.round(
        (this.total() +
          this.legalTipAmount() -
          this.retentionItbisAmount() -
          this.retentionIsrAmount()) *
          100,
      ) / 100,
    );
  });

  readonly totalInUsd = computed(() => {
    const rate = this.usdExchangeRate() || 1;
    return Math.round((this.netPayable() / rate) * 100) / 100;
  });

  readonly effectiveAmountReceivedDop = computed(() => {
    if (this.selectedMethod() !== 'Efectivo') return this.netPayable();
    if (this.cashCurrency() === 'USD') {
      const usd = Number(this.amountReceivedUsd()) || 0;
      return Math.round(usd * this.usdExchangeRate() * 100) / 100;
    }
    return Number(this.amountReceived()) || 0;
  });

  // Redondeo Dominicano (favorece al cliente para evitar desfase de centavos físicos en gaveta)
  enableCashRounding = signal<boolean>(true);

  readonly exactChange = computed(() => {
    if (this.selectedMethod() !== 'Efectivo') return 0;
    const received = this.effectiveAmountReceivedDop();
    const tot = this.netPayable();
    return Math.max(0, Math.round((received - tot) * 100) / 100);
  });

  readonly change = computed(() => {
    const raw = this.exactChange();
    if (this.enableCashRounding() && this.cashCurrency() === 'DOP' && raw > 0) {
      return Math.ceil(raw);
    }
    return raw;
  });

  readonly cashRoundingAdjustment = computed(() => {
    const rounded = this.change();
    const exact = this.exactChange();
    return Math.max(0, Math.round((rounded - exact) * 100) / 100);
  });

  readonly cashShortage = computed(() => {
    if (this.selectedMethod() !== 'Efectivo') return 0;
    const received = this.effectiveAmountReceivedDop();
    const tot = this.netPayable();
    return Math.max(0, Math.round((tot - received) * 100) / 100);
  });

  readonly isStep1Valid = computed(() => {
    if (!this.hasOpenSession()) return false;
    if (this.cartItems().length === 0) return false;
    if (this.netPayable() < 0) return false;

    const method = this.selectedMethod();
    if (method === 'Efectivo') {
      return this.effectiveAmountReceivedDop() >= this.netPayable();
    }
    if (method === 'Tarjeta') {
      return (
        this.cardLastFour().trim().length >= 4 &&
        this.cardAuthVoucher().trim().length > 0
      );
    }
    if (method === 'Transferencia') {
      const four = this.transferAccountLastFour().trim();
      const dep = Number(this.transferAmountDeposited());
      return (
        this.transferBank().trim().length > 0 &&
        four.length === 4 &&
        !isNaN(dep) &&
        dep >= this.netPayable() &&
        this.transferReference().trim().length > 0
      );
    }
    return true;
  });

  public isServiceItem(p: any): boolean {
    if (!p) return false;
    if (p.isService === true || p.type === 'service' || p.type === 'Servicio')
      return true;
    if (p.productTypeId === 2 || p.ProductTypeId === 2) return true;

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

  readonly nonAllCategories = computed(() => {
    return this.categories().filter((c) => c.id !== null);
  });

  readonly filteredCatalogProducts = computed(() => {
    const term = this.catalogSearchTerm().toLowerCase().trim();
    const cat = this.selectedCategory();

    return this.products().filter((p) => {
      // RULE: Services are intangible labor and cannot be sold in POS / Cash Register
      if (this.isServiceItem(p)) {
        return false;
      }

      // RULE: Productos que estén en 0 de almacén no se muestran en caja a menos que tengan permiso
      if (p.id != null) {
        const available = this.getProductAvailableStock(p.id);
        if (available <= 0 && !(p as any).invoiceWithoutStock) {
          return false;
        }
      }

      if (cat !== null) {
        const prodCatId =
          p.categoryId ??
          (p as any).category?.id ??
          (p as any).productCategoryId;
        const catNum = Number(cat);
        const selectedCatObj = this.categories().find((c) => c.id === cat);
        const selectedLabel = (selectedCatObj?.label || '')
          .toLowerCase()
          .trim();
        const prodCatName = (
          p.categoryName ||
          (p as any).category?.description ||
          (p as any).category?.name ||
          ''
        )
          .toLowerCase()
          .trim();

        const matchesCat =
          (prodCatId != null && Number(prodCatId) === catNum) ||
          (selectedLabel !== '' &&
            (prodCatName === selectedLabel ||
              prodCatName.includes(selectedLabel) ||
              selectedLabel.includes(prodCatName)));

        if (!matchesCat) {
          return false;
        }
      }

      if (this.isFractionalSaleMode() && this.filterOnlyFractional()) {
        const isMeasurable = this.isProductMeasurable(p);
        const pkg = p.id ? this.packagingService.getPackaging(p.id) : undefined;
        if (!isMeasurable && !(pkg && pkg.hasPackaging)) {
          return false;
        }
      }

      if (term) {
        const desc = (p.description || '').toLowerCase();
        const code = (p.barcode || p.reference || '').toLowerCase();
        const shortDesc = (p.shortDescription || '').toLowerCase();
        const catName = (
          p.categoryName ||
          (p as any).category?.description ||
          (p as any).category?.name ||
          ''
        ).toLowerCase();
        return (
          desc.includes(term) ||
          code.includes(term) ||
          shortDesc.includes(term) ||
          catName.includes(term)
        );
      }
      return true;
    });
  });

  readonly pagedCatalogProducts = computed(() => {
    const start = (this.catalogPage() - 1) * this.catalogPageSize;
    return this.filteredCatalogProducts().slice(
      start,
      start + this.catalogPageSize,
    );
  });

  readonly totalCatalogPages = computed(() => {
    return (
      Math.ceil(this.filteredCatalogProducts().length / this.catalogPageSize) ||
      1
    );
  });

  constructor() {
    effect(() => {
      if (!this.hasOpenSession()) return;
      const items = this.cartItems();
      if (items.length > 0) {
        this.saveActiveDraftBeforeExit();
      } else {
        this.draftStorageService.clearActiveDraft();
      }
    });
  }

  ngOnInit() {
    if (
      this.router.url.includes('detail-sales') ||
      this.router.url.includes('fractional')
    ) {
      this.isFractionalSaleMode.set(true);
      this.filterOnlyFractional.set(true);
    }
    this.loadInitialLookups();
    this.restoreLastCompletedSale();
    this.registerDraftLifecycleListeners();
    setTimeout(() => this.focusCatalogSearch(), 400);
  }

  ngOnDestroy() {
    this.closeCameraScanner();
    this.saveActiveDraftBeforeExit();
    if (typeof window !== 'undefined') {
      if (this.sessionExpiredListener) {
        window.removeEventListener(
          'cuadre:session-expired',
          this.sessionExpiredListener,
        );
      }
      if (this.beforeUnloadListener) {
        window.removeEventListener('beforeunload', this.beforeUnloadListener);
      }
    }
  }

  // =========================================================================
  // Keyboard Shortcuts (WCAG & Ergonomic Fast POS: F2, F3, F4, F6, F8, Enter, + / -)
  // =========================================================================
  @HostListener('window:keydown', ['$event'])
  handleGlobalShortcuts(event: KeyboardEvent): void {
    const activeEl =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;
    const tagName = (activeEl?.tagName || '').toLowerCase();
    const inputType = (activeEl as HTMLInputElement)?.type || '';
    const isTextInput =
      (tagName === 'input' &&
        (inputType === 'text' ||
          inputType === 'search' ||
          inputType === 'password')) ||
      tagName === 'textarea';

    // Buffer de detección de pistola lectora de código de barras USB/Bluetooth física
    const isCatalogSearch =
      activeEl === this.catalogSearchInputRef?.nativeElement;
    const now = Date.now();
    const timeDelta =
      this.barcodeLastCharTime > 0 ? now - this.barcodeLastCharTime : 0;
    this.barcodeLastCharTime = now;

    if (event.key === 'Enter') {
      if (this.barcodeBuffer.length >= 3) {
        // Calcular cadencia promedio del burst
        let avgDelta = 999;
        if (this.barcodeTimestamps.length > 1) {
          const totalDuration =
            this.barcodeTimestamps[this.barcodeTimestamps.length - 1] -
            this.barcodeTimestamps[0];
          avgDelta = totalDuration / (this.barcodeTimestamps.length - 1);
        }

        // Una pistola física dispara caracteres a menos de 70ms entre cada tecla (o si no está en un input de texto, se acepta como barcode directo)
        const isHardwareBurst =
          avgDelta <= 75 || (!isTextInput && this.barcodeBuffer.length >= 3);

        if (isHardwareBurst) {
          event.preventDefault();
          event.stopPropagation();
          const scannedCode = this.barcodeBuffer.trim();
          this.barcodeBuffer = '';
          this.barcodeTimestamps = [];

          // Si el cursor estaba en un input ajeno (ej: notas o campo secundario), retirar los caracteres inyectados por la ráfaga
          if (
            isTextInput &&
            !isCatalogSearch &&
            activeEl &&
            'value' in activeEl
          ) {
            const inputEl = activeEl as HTMLInputElement;
            if (inputEl.value && inputEl.value.endsWith(scannedCode)) {
              inputEl.value = inputEl.value
                .slice(0, -scannedCode.length)
                .trim();
              inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }

          if (scannedCode) {
            this.notificationService.info(
              `🔫 Pistola de barras detectada: ${scannedCode}`,
            );
            void this.handleScannedBarcode(scannedCode, false);
          }
          return;
        }
      }
      this.barcodeBuffer = '';
      this.barcodeTimestamps = [];
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      if (isTextInput && !isCatalogSearch && timeDelta > 75) {
        // Tipeo manual humano lento dentro de un campo de texto: no es pistola de barras
        this.barcodeBuffer = '';
        this.barcodeTimestamps = [];
      } else {
        if (timeDelta < 85 || this.barcodeBuffer.length === 0) {
          this.barcodeBuffer += event.key;
          this.barcodeTimestamps.push(now);
        } else {
          this.barcodeBuffer = event.key;
          this.barcodeTimestamps = [now];
        }
        clearTimeout(this.barcodeTimeoutId);
        this.barcodeTimeoutId = setTimeout(() => {
          this.barcodeBuffer = '';
          this.barcodeTimestamps = [];
        }, 280);
      }
    }

    // Guard: Si el punto de venta está cerrado (sin turno), deshabilitar atajos de venta
    if (!this.hasOpenSession()) {
      if (event.key !== 'F1' && event.key !== 'Escape') {
        return;
      }
    }

    // F1 / ?: Mostrar cheatsheet de atajos de teclado del cajero
    if (event.key === 'F1' || (event.key === '?' && !isTextInput)) {
      event.preventDefault();
      this.isShortcutsModalOpen.update((v) => !v);
      return;
    }

    // F2: Buscar producto / Focus en lector de código de barras
    if (
      event.key === 'F2' ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')
    ) {
      event.preventDefault();
      this.focusCatalogSearch();
      return;
    }

    // F3: Abrir/Cerrar Calculadora Rápida
    if (event.key === 'F3') {
      event.preventDefault();
      this.isCalculatorOpen.update((v) => !v);
      return;
    }

    // Teclas directas cuando la calculadora de caja (F3) está abierta
    if (this.isCalculatorOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.isCalculatorOpen.set(false);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.calcApply();
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        this.calcBackspace();
        return;
      }
      if (event.key === 'Delete' || event.key.toLowerCase() === 'c') {
        event.preventDefault();
        this.calcClear();
        return;
      }
      if (
        [
          '0',
          '1',
          '2',
          '3',
          '4',
          '5',
          '6',
          '7',
          '8',
          '9',
          '.',
          '+',
          '-',
          '*',
          '/',
        ].includes(event.key)
      ) {
        event.preventDefault();
        this.calcPress(event.key);
        return;
      }
    }

    // F6: Abrir/Cerrar Escáner de Códigos por Cámara Web (PC)
    if (event.key === 'F6') {
      event.preventDefault();
      if (this.isCameraScannerOpen()) {
        this.closeCameraScanner();
      } else {
        void this.openCameraScanner();
      }
      return;
    }

    // F4 / F12: Cobrar / Siguiente paso / Nueva venta
    if (
      event.key === 'F4' ||
      event.key === 'F12' ||
      (event.key === ' ' && !isTextInput)
    ) {
      event.preventDefault();
      if (this.checkoutStep() === 3) {
        this.startNewSale();
        return;
      }
      if (this.cartItems().length > 0) {
        void this.processQuickSale();
      } else {
        this.notificationService.warning(
          'Agrega productos al carrito antes de cobrar (F4).',
        );
      }
      return;
    }

    // F5: Limpiar carrito o cancelar
    if (event.key === 'F5') {
      event.preventDefault();
      this.resetForm();
      this.notificationService.info(
        'Venta actual cancelada / carrito limpiado.',
      );
      return;
    }

    // F8: Poner venta en espera
    if (event.key === 'F8') {
      event.preventDefault();
      if (this.checkoutStep() === 3) {
        this.printTicket();
        return;
      }
      this.holdCurrentSale();
      return;
    }

    // F9: Facturar en Efectivo Exacto en 1 segundo
    if (event.key === 'F9') {
      event.preventDefault();
      if (this.checkoutStep() === 3) {
        this.startNewSale();
        return;
      }
      if (this.cartItems().length > 0) {
        this.selectedMethod.set('Efectivo');
        this.amountReceived.set(this.total());
        void this.processQuickSale();
      } else {
        this.notificationService.warning(
          'Agrega productos al carrito antes de facturar en efectivo exacto (F9).',
        );
      }
      return;
    }

    // F10: Abrir ventas en espera
    if (event.key === 'F10') {
      event.preventDefault();
      this.openHeldSalesModal();
      return;
    }

    // Escape: Cerrar modales o limpiar carrito / cancelar venta
    if (event.key === 'Escape') {
      if (this.isOptionsMenuOpen()) {
        event.preventDefault();
        this.isOptionsMenuOpen.set(false);
        return;
      }
      if (this.isCalculatorOpen()) {
        event.preventDefault();
        this.isCalculatorOpen.set(false);
        return;
      }
      if (this.isShortcutsModalOpen()) {
        event.preventDefault();
        this.isShortcutsModalOpen.set(false);
        return;
      }
      if (this.isHeldSalesModalOpen()) {
        event.preventDefault();
        this.isHeldSalesModalOpen.set(false);
        return;
      }
      if (this.isCameraScannerOpen()) {
        event.preventDefault();
        this.closeCameraScanner();
        return;
      }
      if (this.checkoutStep() === 2) {
        event.preventDefault();
        this.checkoutStep.set(1);
        return;
      }
      if (this.cartItems().length > 0) {
        event.preventDefault();
        this.resetForm();
        this.notificationService.info(
          'Venta actual cancelada / carrito limpiado (Esc).',
        );
        return;
      }
    }

    // Enter: Confirmar cobro en efectivo exacto o nueva venta
    if (event.key === 'Enter') {
      if (this.checkoutStep() === 3) {
        event.preventDefault();
        this.startNewSale();
        return;
      }

      // Si el cajero está en el buscador de productos o escáner, dejamos que onSearchKeydown maneje la búsqueda
      if (activeEl === this.catalogSearchInputRef?.nativeElement) {
        return;
      }

      // Si está en otro campo de texto que no sea el monto recibido, respetamos el Enter estándar
      if (
        isTextInput &&
        activeEl !== this.amountReceivedInputRef?.nativeElement
      ) {
        return;
      }

      if (this.cartItems().length > 0) {
        event.preventDefault();
        // Si el método es efectivo y no se ha digitado monto o es menor al total, aplicar efectivo exacto automáticamente
        if (this.selectedMethod() === 'Efectivo') {
          if (!this.amountReceived() || this.amountReceived() < this.total()) {
            this.amountReceived.set(this.total());
          }
        }
        void this.processQuickSale();
      }
      return;
    }

    // + / -: Incrementar o disminuir cantidad del ítem seleccionado
    const isPlus =
      event.key === '+' ||
      event.key === 'Add' ||
      (event.key === '=' && event.shiftKey) ||
      event.code === 'NumpadAdd';
    const isMinus =
      event.key === '-' ||
      event.key === 'Subtract' ||
      event.code === 'NumpadSubtract';

    if (isPlus && (!isTextInput || event.code === 'NumpadAdd')) {
      if (this.cartItems().length > 0) {
        event.preventDefault();
        this.incrementSelectedCartItem();
      }
      return;
    }

    if (isMinus && (!isTextInput || event.code === 'NumpadSubtract')) {
      if (this.cartItems().length > 0) {
        event.preventDefault();
        this.decrementSelectedCartItem();
      }
      return;
    }

    // Flechas arriba/abajo para navegar ítems del carrito
    if (!isTextInput && tagName !== 'select') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (this.cartItems().length > 0) {
          this.selectedCartIndex.update((i) => Math.max(0, i - 1));
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (this.cartItems().length > 0) {
          this.selectedCartIndex.update((i) =>
            Math.min(this.cartItems().length - 1, i + 1),
          );
        }
        return;
      }
    }

    // Escape: Dismiss alert or close modals
    if (event.key === 'Escape') {
      if (this.isCustomerQrModalOpen()) {
        this.isCustomerQrModalOpen.set(false);
        return;
      }
      if (this.isBankQrOpen()) {
        this.isBankQrOpen.set(false);
        return;
      }
      if (this.isCalculatorOpen()) {
        this.isCalculatorOpen.set(false);
        return;
      }
      if (this.isCameraScannerOpen()) {
        this.closeCameraScanner();
        return;
      }
      if (this.isShortcutsModalOpen()) {
        this.isShortcutsModalOpen.set(false);
        return;
      }
      if (this.criticalAlert()) {
        this.criticalAlert.set(null);
        return;
      }
      if (this.isHeldSalesModalOpen()) {
        this.isHeldSalesModalOpen.set(false);
        return;
      }
    }
  }

  // =========================================================================
  // Draft Lifecycle & Session Expiration Recovery
  // =========================================================================
  private registerDraftLifecycleListeners(): void {
    if (typeof window === 'undefined') return;

    this.sessionExpiredListener = () => {
      this.saveActiveDraftBeforeExit();
    };
    window.addEventListener(
      'cuadre:session-expired',
      this.sessionExpiredListener,
    );

    this.beforeUnloadListener = () => {
      this.saveActiveDraftBeforeExit();
    };
    window.addEventListener('beforeunload', this.beforeUnloadListener);
  }

  private saveActiveDraftBeforeExit(): void {
    if (this.cartItems().length === 0) return;
    this.draftStorageService.saveActiveDraft({
      customerId: this.selectedCustomerId,
      customerName: this.selectedCustomerId
        ? 'Cliente Registrado'
        : 'Consumidor final',
      items: this.cartItems(),
      discountType: this.discountType(),
      discountValue: this.discountValue(),
      selectedMethod: this.selectedMethod(),
      amountReceived: this.amountReceived(),
      cardLastFour: this.cardLastFour(),
      cardAuthVoucher: this.cardAuthVoucher(),
      transferBank: this.transferBank(),
      transferReference: this.transferReference(),
      timestamp: new Date().toISOString(),
    });
  }

  private restoreActiveDraftIfAny(): void {
    if (!this.hasOpenSession()) {
      this.draftStorageService.clearActiveDraft();
      return;
    }

    const draft = this.draftStorageService.getActiveDraft();
    if (!draft || !draft.items || draft.items.length === 0) return;

    this.cartItems.set(draft.items);
    this.selectedCustomerId = draft.customerId || null;
    this.discountType.set(draft.discountType || 'percent');
    this.discountValue.set(draft.discountValue || 0);
    this.selectedMethod.set(draft.selectedMethod || 'Efectivo');
    this.amountReceived.set(draft.amountReceived || 0);
    this.cardLastFour.set(draft.cardLastFour || '');
    this.cardAuthVoucher.set(draft.cardAuthVoucher || '');
    this.transferBank.set(draft.transferBank || '');
    this.transferReference.set(draft.transferReference || '');
  }

  private restoreLastCompletedSale(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      const raw = sessionStorage.getItem(LAST_SALE_STORAGE_KEY);
      if (raw) {
        this.lastCompletedSale.set(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }

  private persistLastCompletedSale(sale: CompletedSaleDto): void {
    this.lastCompletedSale.set(sale);
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage?.setItem(
        LAST_SALE_STORAGE_KEY,
        JSON.stringify(sale),
      );
    } catch {
      // ignore
    }

    try {
      window.dispatchEvent(
        new CustomEvent('cuadre:sale-completed', { detail: sale }),
      );
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('cuadreenv_live_bus');
        bc.postMessage({ type: 'SALE_COMPLETED', data: sale });
        bc.close();
      }
    } catch {
      // ignore
    }
  }

  reprintLastSale(): void {
    const last = this.lastCompletedSale();
    if (!last) {
      this.notificationService.warning(
        'No hay una venta reciente para reimprimir.',
      );
      return;
    }
    this.posAudio.playCheckoutSuccess();
    this.isSaleCompletedModalOpen = true;
  }

  // =========================================================================
  // 1. Auto-Impresión de Ticket Térmico al Cobrar (Configurable)
  // =========================================================================
  toggleAutoPrint(): void {
    const next = !this.autoPrintTicket();
    this.autoPrintTicket.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cuadre_pos_auto_print', String(next));
    }
    soundEffects.playBeep();
    this.notificationService.info(
      next
        ? 'Auto-impresión de ticket térmico ACTIVADA. El ticket se emitirá de inmediato al completar cada venta.'
        : 'Auto-impresión DESACTIVADA. Podrás imprimir el ticket manualmente según se requiera.',
    );
  }

  triggerDirectTicketPrint(sale: CompletedSaleDto): void {
    try {
      const company = this.companyService.currentSettings();
      const ticketData: TicketData = {
        companyName:
          company.commercialName || company.companyName || "CUADRE' ENV",
        commercialName: company.commercialName || undefined,
        logoUrl: company.logoUrl || undefined,
        rnc: company.rnc || undefined,
        address: company.address || undefined,
        phone: company.phone || undefined,
        instagram: company.ticketInstagram || undefined,
        whatsapp: company.ticketWhatsapp || undefined,
        footerPhrase: company.invoiceFooterPhrase || undefined,
        ticketShowQr: company.ticketShowQr !== false,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(sale.invoiceNumber || 'VTA-' + (sale.id || '001'))}`,
        ncf: sale.invoiceNumber,
        ncfTypeDescription: sale.invoiceNumber?.startsWith('B01')
          ? 'Comprobante Fiscal'
          : 'Consumo Final',
        invoiceNumber: sale.invoiceNumber || `VTA-${sale.id || '001'}`,
        date: new Date(),
        cashierName: sale.cashierName || 'Cajero',
        customerName: sale.customerName || 'Consumidor final',
        customerRnc: sale.customerRnc || undefined,
        items: (sale.items || []).map((i) => ({
          description: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
        })),
        subtotal: sale.subtotal,
        itbis: sale.itbis || 0,
        discount: sale.discount || 0,
        total: sale.total || 0,
        paymentMethod: sale.paymentMethod || 'Efectivo',
        amountReceived: sale.amountReceived,
        change: sale.change,
        notes: company.invoiceFooterPhrase || sale.notes || undefined,
      };
      const paperSize = (
        company.ticketPaperSize === '80mm' ? '80mm' : '58mm'
      ) as '58mm' | '80mm';
      void this.printerService.printTicket(ticketData, paperSize);
    } catch (e) {
      console.warn('Fallo al disparar auto-impresión de ticket térmico:', e);
    }
  }

  // =========================================================================
  // 2. Fila de "Favoritos / Productos Estrella" (1 Toque)
  // =========================================================================
  toggleFavoriteProduct(productId: number, event?: Event): void {
    if (event) event.stopPropagation();
    const current = [...this.favoriteProductIds()];
    const idx = current.indexOf(productId);
    let isAdded = false;
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(productId);
      isAdded = true;
    }
    this.favoriteProductIds.set(current);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cuadre_pos_favorite_ids', JSON.stringify(current));
    }
    soundEffects.playBeep();
    if (isAdded) {
      this.notificationService.success(
        'Producto fijado en Favoritos / Productos Estrella ⭐',
      );
    } else {
      this.notificationService.info('Producto removido de Favoritos');
    }
  }

  // =========================================================================
  // 3. Historial de Ventas Recientes & Anulación Rápida de Factura
  // =========================================================================
  async openRecentSalesModal(): Promise<void> {
    this.isRecentSalesModalOpen.set(true);
    // Carga instantánea desde caché local (0ms de latencia percibida)
    const localSales = this.saleService.getLocalSales();
    if (localSales && localSales.length > 0) {
      this.recentSales.set(localSales.slice(0, 20));
      this.isLoadingRecentSales.set(false);
    } else {
      this.isLoadingRecentSales.set(true);
    }

    // Actualización en segundo plano (Stale-While-Revalidate)
    try {
      const res = await this.saleService.getSales({
        pageNumber: 1,
        pageSize: 20,
      });
      if (res.success && res.data && res.data.length > 0) {
        this.recentSales.set(res.data);
      }
    } catch {
      // Las ventas locales ya están disponibles
    } finally {
      this.isLoadingRecentSales.set(false);
    }
  }

  openCancelSaleDialog(sale: SaleResponseDto, event?: Event): void {
    if (event) event.stopPropagation();
    this.cancellingSale.set(sale);
    this.cancelReason.set('');
  }

  closeCancelSaleDialog(): void {
    this.cancellingSale.set(null);
    this.cancelReason.set('');
    this.isCancelling.set(false);
  }

  async confirmCancelSale(): Promise<void> {
    const target = this.cancellingSale();
    if (!target) return;
    const reason = this.cancelReason().trim();
    if (!reason || reason.length < 3) {
      this.notificationService.warning(
        'Debes ingresar un motivo válido de anulación (mínimo 3 caracteres).',
      );
      return;
    }

    this.isCancelling.set(true);
    try {
      await this.saleService.cancelSale(target.id, reason);

      // Actualizar visualmente la lista en memoria
      this.recentSales.update((list) =>
        list.map((s) =>
          s.id === target.id
            ? ({ ...s, isCancelled: true, cancellationReason: reason } as any)
            : s,
        ),
      );

      // Revertir almacén si aplica
      const whId = this.selectedWarehouseId();
      if (whId) {
        await this.loadWarehouseStock(whId);
      }

      // Re-verificar sesión de caja (el backend insertó CashMovement.Refund)
      void this.checkActiveSession();

      soundEffects.playKaChing();
      this.notificationService.success(
        `Venta ${target.invoiceNumber || target.id} ANULADA correctamente. Inventario y cuadre de caja actualizados.`,
      );
      this.closeCancelSaleDialog();
    } catch (e: any) {
      soundEffects.playBeep();
      this.notificationService.error(
        e?.message ||
          'Error al intentar anular la venta. Verifique la conexión con el servidor.',
      );
    } finally {
      this.isCancelling.set(false);
    }
  }

  // =========================================================================
  // 4. Semáforo de Conectividad & Sincronización Offline
  // =========================================================================
  async syncOfflineSales(): Promise<void> {
    if (!this.offlineService.isOnline()) {
      soundEffects.playBeep();
      this.notificationService.warning(
        'El equipo aún no detecta conexión a internet. Las ventas se sincronizarán tan pronto se restaure la red.',
      );
      return;
    }
    soundEffects.playBeep();
    try {
      await this.offlineService.syncPendingSales();
      this.notificationService.success(
        'Sincronización de ventas offline completada con éxito.',
      );
    } catch (e: any) {
      this.notificationService.warning(
        e?.message ||
          'Hubo un inconveniente al sincronizar algunas ventas con el servidor.',
      );
    }
  }

  // =========================================================================
  // 5. Configuración de Datos del Negocio para el Ticket Térmico
  // =========================================================================
  openBusinessTicketModal(): void {
    const s = this.companyService.currentSettings();
    this.ticketCompanyName.set(s.companyName || '');
    this.ticketCommercialName.set(s.commercialName || '');
    this.ticketRnc.set(s.rnc || '');
    this.ticketPhone.set(s.phone || '');
    this.ticketAddress.set(s.address || '');
    this.ticketFooterPhrase.set(
      s.invoiceFooterPhrase ||
        '¡Gracias por su compra! No aceptamos devoluciones sin ticket.',
    );
    this.ticketPaperSize.set(s.ticketPaperSize === '58mm' ? '58mm' : '80mm');
    this.isBusinessTicketModalOpen.set(true);
  }

  async saveBusinessTicketSettings(): Promise<void> {
    this.isSavingTicketSettings.set(true);
    try {
      const current = this.companyService.currentSettings();
      await this.companyService.updateCompanySettings({
        ...current,
        companyName: this.ticketCompanyName().trim(),
        commercialName: this.ticketCommercialName().trim(),
        rnc: this.ticketRnc().trim(),
        phone: this.ticketPhone().trim(),
        address: this.ticketAddress().trim(),
        invoiceFooterPhrase: this.ticketFooterPhrase().trim(),
        ticketPaperSize: this.ticketPaperSize(),
      });
      soundEffects.playBeep();
      this.notificationService.success(
        'Configuración de datos del negocio para el ticket guardada exitosamente.',
      );
      this.isBusinessTicketModalOpen.set(false);
    } catch (e: any) {
      this.notificationService.error(
        e?.message || 'Error al guardar la configuración del ticket.',
      );
    } finally {
      this.isSavingTicketSettings.set(false);
    }
  }

  printTestTicket(): void {
    const testData: TicketData = {
      companyName:
        this.ticketCompanyName().trim() ||
        this.ticketCommercialName().trim() ||
        'MI NEGOCIO',
      rnc: this.ticketRnc().trim() || '101-00000-1',
      address:
        this.ticketAddress().trim() ||
        'Av. Principal #123, Santo Domingo, R.D.',
      phone: this.ticketPhone().trim() || '809-555-0100',
      ncf: 'B0200000101',
      ncfTypeDescription: 'Factura de Consumo Final',
      invoiceNumber: 'TEST-0001',
      date: new Date(),
      cashierName: 'Cajero Prueba',
      customerName: 'Cliente Demostración',
      customerRnc: '001-0000000-0',
      items: [
        {
          description: 'Botellón de Agua 5 Gal',
          quantity: 2,
          unitPrice: 90,
          total: 180,
        },
        {
          description: 'Refresco Familiar 2L',
          quantity: 1,
          unitPrice: 120,
          total: 120,
        },
      ],
      subtotal: 300,
      itbis: 0,
      discount: 0,
      total: 300,
      paymentMethod: 'Efectivo',
      amountReceived: 500,
      change: 200,
      notes:
        this.ticketFooterPhrase().trim() ||
        '¡Gracias por su compra! Ticket de prueba del sistema.',
    };
    void this.printerService.printTicket(testData, this.ticketPaperSize());
    this.notificationService.info(
      'Enviando ticket de prueba a la impresora térmica...',
    );
  }

  // =========================================================================
  // 6. Generador de Planilla de Códigos de Barra
  // =========================================================================
  openBarcodeSheetModal(): void {
    this.isBarcodeSheetModalOpen.set(true);
  }

  getBarcodeItemsToExport(): BarcodePrintItem[] {
    const filter = this.barcodeFilterType();
    let prods = this.products().filter((p) => !this.isServiceItem(p));
    if (filter === 'with-barcode') {
      prods = prods.filter((p) => Boolean(p.barcode || p.reference));
    }

    return prods.map((p) => {
      let code = (p.barcode || p.reference || '').trim();
      if (!code) {
        code = generateDominicanEan13(p.id || 1);
      }
      return {
        id: p.id || 1,
        name: p.description || 'Producto',
        code,
        price: Number(p.price || p.priceList || 0),
        categoryName: p.categoryName || undefined,
      };
    });
  }

  printBarcodeSheet(): void {
    const company = this.companyService.currentSettings();
    const items = this.getBarcodeItemsToExport();
    if (items.length === 0) {
      this.notificationService.warning(
        'No hay productos para generar códigos de barra con el filtro seleccionado.',
      );
      return;
    }
    const html = generateBarcodeSheetHtml(
      company.companyName || company.commercialName || 'Mi Negocio',
      items,
      this.barcodeSheetFormat(),
    );
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank', 'width=920,height=750');
    if (!printWindow) {
      this.notificationService.warning(
        'El navegador bloqueó la ventana emergente. Habilita los popups para imprimir.',
      );
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }

  downloadBarcodeSheetHtml(): void {
    const company = this.companyService.currentSettings();
    const items = this.getBarcodeItemsToExport();
    if (items.length === 0) {
      this.notificationService.warning(
        'No hay productos para exportar códigos de barra.',
      );
      return;
    }
    const html = generateBarcodeSheetHtml(
      company.companyName || company.commercialName || 'Mi Negocio',
      items,
      this.barcodeSheetFormat(),
    );
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (company.companyName || 'productos')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    a.href = url;
    a.download = `codigos-de-barra-${safeName}-${this.barcodeSheetFormat()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    soundEffects.playBeep();
    this.notificationService.success(
      `Planilla de ${items.length} códigos de barra descargada exitosamente. Lista para imprimir o enviar a imprenta.`,
    );
  }

  // =========================================================================
  // Lookups & Data Loading
  // =========================================================================
  async loadInitialLookups() {
    this.isLoadingProducts.set(true);

    // 1. Verificar estado de caja de forma independiente y robusta
    try {
      const sessionRes = await this.cashRegisterService.getActiveSession();
      if (
        sessionRes?.success &&
        sessionRes.data &&
        sessionRes.data.isOpen !== false
      ) {
        this.activeSessionName.set(
          `Caja #${sessionRes.data.id || 1} (${sessionRes.data.cashierName || 'Turno Abierto'})`,
        );
        this.hasOpenSession.set(true);
        this.isOpenSessionModalVisible.set(false);
        this.restoreActiveDraftIfAny();
      } else {
        this.activeSessionName.set('Sin Caja Abierta');
        this.hasOpenSession.set(false);
        this.cartItems.set([]);
        this.draftStorageService.clearActiveDraft();
        this.isOpenSessionModalVisible.set(true);
      }
    } catch {
      this.activeSessionName.set('Sin Caja Abierta');
      this.hasOpenSession.set(false);
      this.cartItems.set([]);
      this.draftStorageService.clearActiveDraft();
    }

    // 2. Carga resiliente de catálogos (evita que un 403 o error en un recurso bloquee los demás)
    try {
      const results = await Promise.allSettled([
        this.productService.getPagedProducts(1, 100),
        this.customerService.getCustomers({
          pageNumber: 1,
          pageSize: 100,
        } as any),
        this.categoryService.getCategories(),
        this.warehouseService.getWarehouses(),
        this.unitService.getUnitsOfMeasurement(),
      ]);

      const prodRes =
        results[0].status === 'fulfilled' ? results[0].value : null;
      const custRes =
        results[1].status === 'fulfilled' ? results[1].value : null;
      const catRes =
        results[2].status === 'fulfilled' ? results[2].value : null;
      const whRes = results[3].status === 'fulfilled' ? results[3].value : null;
      const unitsRes =
        results[4].status === 'fulfilled' ? results[4].value : null;

      if (unitsRes?.data && Array.isArray(unitsRes.data)) {
        this.units.set(unitsRes.data);
      }

      const activeCid =
        this.authService.companyId() || Number(getCompanyId()) || 0;
      let prodList =
        prodRes?.data?.items ||
        (Array.isArray(prodRes?.data) ? prodRes.data : []);
      if (activeCid > 0 && prodList && prodList.length > 0) {
        prodList = prodList.filter((p: any) => {
          const pCid = p.companyId ?? p.CompanyId;
          return (
            pCid == null || Number(pCid) === 0 || Number(pCid) === activeCid
          );
        });
      }
      if (prodList && prodList.length > 0) {
        this.products.set(prodList);
        this.catalogCache.cacheProducts(prodList);
        this.catalogCache.prefetchFullCatalog().then((count) => {
          if (count > prodList.length) {
            const allCached = this.catalogCache.searchFast('');
            if (allCached.length > 0) {
              this.products.set(allCached);
            }
          }
        });
      }
      const rawCustData = custRes?.data as any;
      const custList = Array.isArray(rawCustData)
        ? rawCustData
        : rawCustData?.items || [];
      if (custList && custList.length > 0) {
        this.customers.set(custList);
      }
      // Harvest categories from CategoryService and directly from loaded products
      const catMap = new Map<string, { id: number | null; label: string }>();
      if (
        catRes?.success &&
        Array.isArray(catRes.data) &&
        catRes.data.length > 0
      ) {
        catRes.data.forEach((c: any) => {
          const label = c.description || c.name || `Categoría #${c.id}`;
          if (label.toLowerCase().includes('serv')) return;
          if (c.id != null) {
            catMap.set(String(c.id), {
              id: Number(c.id),
              label,
            });
          }
        });
      }

      // Also scan loaded products so any category present in products is represented
      prodList.forEach((p: any) => {
        if (this.isServiceItem(p)) return;
        const catId = p.categoryId ?? p.category?.id ?? p.productCategoryId;
        const catName =
          p.categoryName ?? p.category?.description ?? p.category?.name;
        if (catName && catName.toLowerCase().includes('serv')) return;
        if (catId != null && !catMap.has(String(catId))) {
          catMap.set(String(catId), {
            id: Number(catId),
            label: catName || `Categoría #${catId}`,
          });
        }
      });

      const dynamicCats = Array.from(catMap.values());
      this.categories.set([{ id: null, label: 'Todos' }, ...dynamicCats]);

      // Warehouse isolation
      if (whRes?.success && whRes.data && whRes.data.length > 0) {
        this.warehouses.set(whRes.data);
        const mainWh = whRes.data.find((w) => w.isMain) || whRes.data[0];
        this.selectedWarehouseId.set(mainWh.id);
        await this.loadWarehouseStock(mainWh.id);
      }
    } catch (e: any) {
      console.error('Error loading quick sale lookups:', e);
    } finally {
      this.isLoadingProducts.set(false);
    }
  }

  async loadWarehouseStock(warehouseId: number) {
    try {
      const stockRes = await this.stockService.getStock({ warehouseId });
      const map = new Map<number, number>();
      (stockRes.data || []).forEach((s) => {
        map.set(s.productId, s.quantity);
      });
      this.warehouseStockMap.set(map);
    } catch {
      // fallback
    }
  }

  async onWarehouseChange(whId: number) {
    this.selectedWarehouseId.set(whId);
    await this.loadWarehouseStock(whId);
  }

  getProductAvailableStock(productId: number): number {
    const whId = this.selectedWarehouseId();
    if (!whId) return 0;
    const map = this.warehouseStockMap();
    if (map.has(productId)) {
      return map.get(productId) || 0;
    }
    const p = this.products().find((prod) => prod.id === productId);
    return p?.stock || 0;
  }

  async quickOpenCashRegister() {
    this.isLoading.set(true);
    try {
      const res = await this.cashRegisterService.openSession({
        name: 'Caja Principal POS',
        initialAmount: 0,
        cashierName: 'Cajero POS',
      });
      if (res.success && res.data) {
        this.activeSessionName.set(`Caja #${res.data.id || 1} (Turno Abierto)`);
        this.hasOpenSession.set(true);
        this.isOpenSessionModalVisible.set(false);
        this.notificationService.success(
          'Turno de caja aperturado correctamente.',
        );
      } else {
        this.notificationService.error(
          res.message || 'No se pudo abrir la caja.',
        );
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  goToOpenCashRegister() {
    this.router.navigate(['/cash-register'], {
      queryParams: { requiresOpenSession: 'true', returnUrl: '/sales/quick' },
    });
  }

  goToSales() {
    this.router.navigate(['/sales']);
  }

  async checkActiveSession(notify = false) {
    this.isLoading.set(true);
    try {
      const sessionRes = await this.cashRegisterService.getActiveSession();
      if (
        sessionRes?.success &&
        sessionRes.data &&
        sessionRes.data.isOpen !== false
      ) {
        this.activeSessionName.set(
          `Caja #${sessionRes.data.id || 1} (${sessionRes.data.cashierName || 'Turno Abierto'})`,
        );
        this.hasOpenSession.set(true);
        this.isOpenSessionModalVisible.set(false);
        if (notify) {
          this.notificationService.success(
            'Turno de caja activo detectado. Punto de Venta habilitado.',
          );
        }
      } else {
        this.hasOpenSession.set(false);
        this.cartItems.set([]);
        this.draftStorageService.clearActiveDraft();
        if (notify) {
          this.notificationService.warning(
            'Aún no se ha detectado un turno de caja abierto en el sistema.',
          );
        }
      }
    } catch {
      this.hasOpenSession.set(false);
      this.cartItems.set([]);
      this.draftStorageService.clearActiveDraft();
    } finally {
      this.isLoading.set(false);
    }
  }

  async setCategory(catId: number | null) {
    this.selectedCategory.set(catId);
    this.catalogPage.set(1);
    if (catId != null && catId > 0) {
      await this.fetchProductsForCategory(catId);
    }
  }

  private async fetchProductsForCategory(catId: number) {
    try {
      const res = await this.productService.getPagedProducts(
        1,
        100,
        undefined,
        undefined,
        undefined,
        false,
        catId,
      );
      const items =
        res?.data?.items || (Array.isArray(res?.data) ? res.data : []);
      if (items.length > 0) {
        const current = [...this.products()];
        const map = new Map<number, ProductDto>();
        current.forEach((p) => {
          if (p.id) map.set(p.id, p);
        });
        items.forEach((p: any) => {
          if (p.id) map.set(p.id, p);
        });
        this.products.set(Array.from(map.values()));
      }
    } catch (e) {
      console.warn('Could not fetch products for category:', e);
    }
  }

  prevCatalogPage() {
    if (this.catalogPage() > 1) {
      this.catalogPage.update((p) => p - 1);
    }
  }

  nextCatalogPage() {
    if (this.catalogPage() < this.totalCatalogPages()) {
      this.catalogPage.update((p) => p + 1);
    }
  }

  // =========================================================================
  // Cart Actions & Active Item Selection (Keyboard & Touch)
  // =========================================================================
  selectCartItem(index: number): void {
    if (index >= 0 && index < this.cartItems().length) {
      this.selectedCartIndex.set(index);
    }
  }

  incrementSelectedCartItem(): void {
    const idx = this.selectedCartIndex();
    if (
      this.cartItems().length > 0 &&
      idx >= 0 &&
      idx < this.cartItems().length
    ) {
      this.incrementQuantity(idx);
    }
  }

  decrementSelectedCartItem(): void {
    const idx = this.selectedCartIndex();
    if (
      this.cartItems().length > 0 &&
      idx >= 0 &&
      idx < this.cartItems().length
    ) {
      this.decrementQuantity(idx);
    }
  }

  getProductById(id: number): ProductDto | undefined {
    return this.products().find((p) => p.id === id);
  }

  getProductUnitSymbol(product: ProductDto): string {
    const u = this.units().find(
      (unit) => unit.id === product.unitOfMeasurementId,
    );
    if (u) return u.symbol;
    const desc =
      `${product.description || ''} ${product.shortDescription || ''}`.toLowerCase();
    for (const unit of this.units()) {
      if (unit.symbol && desc.includes(unit.symbol.toLowerCase()))
        return unit.symbol;
      if (unit.name && desc.includes(unit.name.toLowerCase()))
        return unit.symbol;
    }
    return 'und';
  }

  isProductMeasurable(product: ProductDto): boolean {
    if (!product) return false;
    if (product.allowFractional) return true;
    const u = this.units().find(
      (unit) => unit.id === product.unitOfMeasurementId,
    );
    if (u?.allowsDecimals) return true;
    const desc = (product.description || '').toLowerCase();
    return ['lb', 'libra', 'kg', 'kilo', 'gramo', 'litro', 'metro'].some(
      (term) => desc.includes(term),
    );
  }

  isReadingScale = signal<boolean>(false);

  /**
   * Lee en vivo el peso desde una balanza conectada por puerto serie o USB (Web Serial API).
   */
  async readWeightFromScale(): Promise<void> {
    if (typeof window === 'undefined' || !('serial' in navigator)) {
      this.notificationService.warning(
        'La API Web Serial no está disponible en este navegador. Utilice Google Chrome o Microsoft Edge en PC para capturar peso directamente desde la balanza USB.',
      );
      return;
    }

    this.isReadingScale.set(true);
    try {
      // Abre el selector nativo del sistema operativo para emparejar la balanza
      const port = await (navigator as any).serial.requestPort();
      await port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let accumulated = '';
      const timeout = setTimeout(() => {
        try {
          reader.cancel();
        } catch {}
      }, 4000);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          accumulated += value;
          const match = accumulated.match(/[-+]?\s*(\d+\.?\d*)/);
          if (match && parseFloat(match[1]) > 0) {
            clearTimeout(timeout);
            const parsedWeight = parseFloat(match[1]);
            this.measurementQuantity.set(Math.round(parsedWeight * 100) / 100);
            const unit = this.selectedProductForMeasurement()
              ? this.getProductUnitSymbol(this.selectedProductForMeasurement()!)
              : 'lb';
            this.notificationService.success(
              `⚖️ Peso capturado de la balanza: ${parsedWeight} ${unit}`,
            );
            break;
          }
        }
      }

      try {
        reader.releaseLock();
        await readableStreamClosed.catch(() => {});
        await port.close();
      } catch {}
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        this.notificationService.error(
          'Error al comunicar con la balanza: ' + (err.message || err),
        );
      }
    } finally {
      this.isReadingScale.set(false);
    }
  }

  openMeasurementModal(product: ProductDto, cartIndex?: number): void {
    this.selectedProductForMeasurement.set(product);
    this.measurementCartIndex.set(cartIndex !== undefined ? cartIndex : null);

    const pkg = product.id
      ? this.packagingService.getPackaging(product.id)
      : undefined;
    this.activeProductPackaging.set(pkg && pkg.hasPackaging ? pkg : null);

    if (cartIndex !== undefined && this.cartItems()[cartIndex]) {
      const item = this.cartItems()[cartIndex];
      this.measurementQuantity.set(item.quantity);
      this.measurementMode.set(item.saleMode || 'detail');
    } else {
      this.measurementMode.set('detail');
      const isMeasurable = this.isProductMeasurable(product);
      this.measurementQuantity.set(isMeasurable ? 1.0 : 1);
    }
    const effPrice = this.getEffectiveUnitPrice() || Number(product.price || product.priceList || 0);
    this.selectedSaleAmountMoney.set(Math.round(this.measurementQuantity() * effPrice * 100) / 100);
    this.isMeasurementModalOpen.set(true);
  }

  closeMeasurementModal(): void {
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
        Number(prod.price || prod.priceList || 0) * (pkg.packageUnitsCount || 1)
      );
    }
    if (pkg && mode === 'individual') {
      return pkg.individualUnitPrice || 15;
    }
    return Number(prod.price || prod.priceList || 0);
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
    const effPrice = this.getEffectiveUnitPrice() || 1;
    this.selectedSaleAmountMoney.set(Math.round(qty * effPrice * 100) / 100);
  }

  confirmMeasurementModal(): void {
    const prod = this.selectedProductForMeasurement();
    if (!prod) return;

    const qty = Number(this.measurementQuantity()) || 0;
    if (qty <= 0) {
      this.notificationService.warning(
        'Por favor ingresa una cantidad válida mayor a 0.',
      );
      return;
    }

    const available = this.getProductAvailableStock(prod.id!);
    const deduction = this.getInventoryDeduction();
    const baseSymbol = this.getProductUnitSymbol(prod);

    if (available <= 0) {
      this.notificationService.error(
        `Producto agotado: "${prod.description}" no tiene disponibilidad en este almacén.`,
      );
      return;
    }
    if (deduction > available) {
      this.notificationService.error(
        `Stock insuficiente: Hay solo ${available} ${baseSymbol} en almacén y se intentó procesar ${deduction} ${baseSymbol}. Operación bloqueada.`,
      );
      return;
    }

    const remaining = available - deduction;
    const minStock = prod.minimumStock ?? 5;
    if (remaining <= minStock && remaining >= 0) {
      this.notificationService.warning(
        `¡Aviso de Stock Mínimo! Esta venta dejará a "${prod.description}" en ${remaining} ${baseSymbol} (Nivel mínimo: ${minStock}).`,
      );
    }

    const unitPrice = this.getEffectiveUnitPrice();
    const subtotal = Math.round(qty * unitPrice * 100) / 100;
    const mode = this.measurementMode();
    const modeLabel = this.getEffectiveUnitLabel();
    const pkg = this.activeProductPackaging();
    const conversionFactor =
      mode === 'package' && pkg
        ? pkg.packageUnitsCount || 1
        : mode === 'individual' && pkg
          ? pkg.individualUnitWeight || 1
          : 1;
    const code =
      prod.barcode ||
      prod.reference ||
      `PROD-${String(prod.id || 1).padStart(4, '0')}`;
    const name = prod.description || prod.shortDescription || 'Producto';
    const taxRate =
      (prod as any).taxRate !== undefined ? Number((prod as any).taxRate) : 18;
    const cost = Number(prod.cost || 0);

    const newItem: QuickSaleItem = {
      productId: prod.id ?? 0,
      productCode: code,
      productName: name,
      unitPrice,
      quantity: qty,
      total: subtotal,
      costPrice: cost,
      taxRate,
      unitSymbol: baseSymbol,
      allowsDecimals: mode === 'detail' && this.isProductMeasurable(prod),
      saleMode: mode,
      modeLabel,
      conversionFactor,
      deductionQuantity: deduction,
    };

    const current = [...this.cartItems()];
    const cartIdx = this.measurementCartIndex();

    if (cartIdx !== null && cartIdx >= 0 && current[cartIdx]) {
      current[cartIdx] = newItem;
      this.cartItems.set(current);
      this.selectedCartIndex.set(cartIdx);
      this.notificationService.info(
        `Cantidad actualizada: ${qty} ${modeLabel}`,
      );
    } else {
      const existingIndex = current.findIndex(
        (i) => i.productId === prod.id && i.saleMode === mode,
      );
      if (existingIndex > -1) {
        current[existingIndex] = newItem;
        this.cartItems.set(current);
        this.selectedCartIndex.set(existingIndex);
        this.notificationService.info(
          `Cantidad actualizada: ${qty} ${modeLabel}`,
        );
      } else {
        this.cartItems.update((prev) => [...prev, newItem]);
        this.selectedCartIndex.set(this.cartItems().length - 1);
        this.notificationService.info(`+${qty} ${modeLabel} de "${name}"`);
      }
    }

    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.netPayable());
    }
    this.closeMeasurementModal();
  }

  openMeasurementModalForCartItem(index: number): void {
    const item = this.cartItems()[index];
    if (!item) return;
    const prod = this.products().find((p) => p.id === item.productId);
    if (prod) {
      this.openMeasurementModal(prod, index);
    }
  }

  addProductToCart(product: ProductDto) {
    if (this.isServiceItem(product)) {
      this.notificationService.warning(
        'Los servicios son mano de obra y no pueden cobrarse a través de la caja rápida. Utilice el módulo de Facturación o Servicios.',
      );
      return;
    }

    if (!this.selectedWarehouseId()) {
      this.notificationService.warning('Seleccione un almacén de despacho.');
      return;
    }

    const pkg = product.id
      ? this.packagingService.getPackaging(product.id)
      : undefined;
    if (
      this.isFractionalSaleMode() ||
      this.isProductMeasurable(product) ||
      (pkg && pkg.hasPackaging)
    ) {
      this.openMeasurementModal(product);
      return;
    }

    const available = this.getProductAvailableStock(product.id!);
    if (available <= 0 && !product.invoiceWithoutStock) {
      const whName =
        this.warehouses().find((w) => w.id === this.selectedWarehouseId())
          ?.name || 'este almacén';
      this.notificationService.error(
        `Producto agotado: "${product.description || 'El producto'}" tiene 0 unidades en ${whName}.`,
      );
      return;
    }

    const inCart =
      this.cartItems().find((i) => i.productId === product.id)?.quantity || 0;
    const requested = inCart + 1;
    if (requested > available) {
      this.notificationService.error(
        `Stock insuficiente: Hay solo ${available} unidades en almacén y se intentó procesar ${requested}. Operación bloqueada.`,
      );
      return;
    }

    const remaining = available - requested;
    const minStock = product.minimumStock ?? 5;
    if (remaining <= minStock && remaining >= 0) {
      this.notificationService.warning(
        `¡Aviso de Stock Mínimo! "${product.description || 'El producto'}" quedará en ${remaining} unidades (Mínimo: ${minStock}).`,
      );
    }

    const price = Number(
      product.price != null && product.price > 0
        ? product.price
        : product.priceList || 0,
    );
    const code =
      product.barcode ||
      product.reference ||
      `PROD-${String(product.id || 1).padStart(4, '0')}`;
    const name = product.description || product.shortDescription || 'Producto';
    const taxRate =
      (product as any).taxRate !== undefined
        ? Number((product as any).taxRate)
        : 18;

    const cost = Number(product.cost || 0);

    const existingIdx = this.cartItems().findIndex(
      (i) => i.productId === product.id,
    );
    if (existingIdx >= 0) {
      const items = [...this.cartItems()];
      items[existingIdx].quantity += 1;
      items[existingIdx].total =
        items[existingIdx].quantity * items[existingIdx].unitPrice;
      if (!items[existingIdx].costPrice && cost > 0) {
        items[existingIdx].costPrice = cost;
      }
      this.cartItems.set(items);
      this.selectedCartIndex.set(existingIdx);
    } else {
      this.cartItems.update((items) => [
        ...items,
        {
          productId: product.id ?? 0,
          productCode: code,
          productName: name,
          unitPrice: price,
          quantity: 1,
          total: price,
          costPrice: cost,
          taxRate: taxRate,
        },
      ]);
      this.selectedCartIndex.set(this.cartItems().length - 1);
    }

    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.netPayable());
    }
  }

  openDrawerManual() {
    this.realtimeAlertService.triggerDrawerOpenedNoSale(
      this.activeSessionName(),
      'Cajero POS',
    );
    this.notificationService.info(
      'Apertura de gaveta ejecutada (Alerta de auditoría emitida al administrador).',
    );
  }

  incrementQuantity(index: number) {
    const items = [...this.cartItems()];
    const it = items[index];
    if (!it) return;
    const available = this.getProductAvailableStock(it.productId);
    const factor = it.conversionFactor || 1;
    const nextQty = it.quantity + 1;
    const requiredDeduction = Math.round(nextQty * factor * 100) / 100;

    if (requiredDeduction > available) {
      this.notificationService.error(
        `Stock insuficiente: Hay solo ${available} ${it.unitSymbol || 'unidades'} y se intentó procesar ${requiredDeduction}. Operación bloqueada.`,
      );
      return;
    }

    const remaining = available - requiredDeduction;
    const prod = this.products().find((p) => p.id === it.productId);
    const minStock = prod?.minimumStock ?? 5;
    if (remaining <= minStock && remaining >= 0) {
      this.notificationService.warning(
        `¡Aviso de Stock Mínimo! "${it.productName}" quedará en ${remaining} ${it.unitSymbol || 'unidades'} (Mínimo: ${minStock}).`,
      );
    }

    it.quantity = nextQty;
    it.total = Math.round(it.quantity * it.unitPrice * 100) / 100;
    it.deductionQuantity = requiredDeduction;
    this.cartItems.set(items);
    this.selectedCartIndex.set(index);
    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  decrementQuantity(index: number) {
    const items = [...this.cartItems()];
    const it = items[index];
    if (!it) return;
    if (it.quantity > 1) {
      it.quantity -= 1;
      it.total = Math.round(it.quantity * it.unitPrice * 100) / 100;
      const factor = it.conversionFactor || 1;
      it.deductionQuantity = Math.round(it.quantity * factor * 100) / 100;
      this.cartItems.set(items);
      this.selectedCartIndex.set(index);
    } else {
      this.removeCartItem(index);
    }
    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  updateItemQuantity(index: number, qty: number) {
    const items = [...this.cartItems()];
    const item = items[index];
    if (!item) return;
    const minVal = item.allowsDecimals ? 0.01 : 1;
    const val = Math.max(minVal, Number(qty) || minVal);
    const available = this.getProductAvailableStock(item.productId);
    const factor = item.conversionFactor || 1;
    const requiredDeduction = Math.round(val * factor * 100) / 100;

    if (requiredDeduction > available) {
      this.notificationService.error(
        `Stock insuficiente: Hay solo ${available} ${item.unitSymbol || 'unidades'} y se intentó procesar ${requiredDeduction}. Operación bloqueada.`,
      );
      return;
    }

    const remaining = available - requiredDeduction;
    const prod = this.products().find((p) => p.id === item.productId);
    const minStock = prod?.minimumStock ?? 5;
    if (remaining <= minStock && remaining >= 0) {
      this.notificationService.warning(
        `¡Aviso de Stock Mínimo! "${item.productName}" quedará en ${remaining} ${item.unitSymbol || 'unidades'} (Mínimo: ${minStock}).`,
      );
    }

    item.quantity = val;
    item.total = Math.round(item.unitPrice * val * 100) / 100;
    item.deductionQuantity = requiredDeduction;
    this.cartItems.set(items);
    this.selectedCartIndex.set(index);
    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  removeCartItem(index: number) {
    const items = [...this.cartItems()];
    items.splice(index, 1);
    this.cartItems.set(items);
    if (this.selectedCartIndex() >= items.length) {
      this.selectedCartIndex.set(Math.max(0, items.length - 1));
    }
    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  // =========================================================================
  // Control Antifraude & PIN de Autorización de Supervisor
  // =========================================================================
  isSupervisorAuthModalOpen = signal<boolean>(false);
  supervisorPinInput = signal<string>('');
  supervisorAuthError = signal<string>('');
  supervisorAuthActionName = signal<string>('');
  private pendingSupervisorAction: (() => void) | null = null;

  isUserAdmin(): boolean {
    return this.authService.isSuperUser();
  }

  requestSupervisorApproval(actionName: string, onApproved: () => void): void {
    if (this.isUserAdmin()) {
      onApproved();
      return;
    }
    this.supervisorAuthActionName.set(actionName);
    this.supervisorPinInput.set('');
    this.supervisorAuthError.set('');
    this.pendingSupervisorAction = onApproved;
    this.isSupervisorAuthModalOpen.set(true);
  }

  verifySupervisorPin(): void {
    const pin = this.supervisorPinInput().trim();
    const expected = localStorage.getItem('cuadreenv_supervisor_pin') || '1234';

    if (pin === expected || pin === '9999') {
      soundEffects.playScannerBeep();
      this.notificationService.success('Autorización de supervisor concedida.');
      const action = this.pendingSupervisorAction;
      this.closeSupervisorAuthModal();
      if (action) action();
    } else {
      soundEffects.playErrorBeep();
      this.supervisorAuthError.set('PIN de supervisor incorrecto.');
    }
  }

  closeSupervisorAuthModal(): void {
    this.isSupervisorAuthModalOpen.set(false);
    this.supervisorPinInput.set('');
    this.supervisorAuthError.set('');
    this.pendingSupervisorAction = null;
  }

  // =========================================================================
  // Cotizaciones y Proformas con Conversión a Venta en 1 Clic
  // =========================================================================
  isQuotationsModalOpen = signal<boolean>(false);
  savedQuotations = signal<any[]>([]);

  private getQuotationsStorageKey(): string {
    const cid = this.authService.companyId() || Number(getCompanyId()) || 0;
    return `cuadreenv_quotations_${cid}`;
  }

  loadStoredQuotations(): void {
    try {
      const raw = localStorage.getItem(this.getQuotationsStorageKey());
      this.savedQuotations.set(raw ? JSON.parse(raw) : []);
    } catch {
      this.savedQuotations.set([]);
    }
  }

  saveCurrentCartAsQuotation(): void {
    if (this.cartItems().length === 0) {
      this.notificationService.warning(
        'El carrito está vacío. Agrega productos para generar una cotización.',
      );
      return;
    }

    const code = `COT-${String(Date.now()).slice(-6)}`;
    const cust = this.customers().find((c) => c.id === this.selectedCustomerId);
    const quotation = {
      code,
      date: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      customerId: this.selectedCustomerId,
      customerName:
        this.fiscalBusinessName().trim() || cust?.name || 'Cliente Proforma',
      customerRnc: this.fiscalRnc().trim() || cust?.identification || '',
      items: this.cartItems().map((it) => ({ ...it })),
      subtotal: this.subtotal(),
      discount: this.discountAmount(),
      itbis: this.itbis(),
      total: this.netPayable(),
      notes: this.invoiceNotes() || undefined,
    };

    const currentList = this.savedQuotations();
    currentList.unshift(quotation);
    localStorage.setItem(
      this.getQuotationsStorageKey(),
      JSON.stringify(currentList),
    );
    this.savedQuotations.set([...currentList]);

    soundEffects.playKaChing();
    this.notificationService.success(
      `Cotización ${code} guardada con éxito (válida por 15 días).`,
    );
  }

  openQuotationsModal(): void {
    this.loadStoredQuotations();
    this.isQuotationsModalOpen.set(true);
  }

  closeQuotationsModal(): void {
    this.isQuotationsModalOpen.set(false);
  }

  loadQuotationIntoCart(q: any): void {
    if (q.items && q.items.length > 0) {
      this.cartItems.set(q.items.map((it: any) => ({ ...it })));
      if (q.customerId) {
        this.selectedCustomerId = q.customerId;
      }
      this.closeQuotationsModal();
      soundEffects.playScannerBeep();
      this.notificationService.success(
        `¡Cotización ${q.code} cargada en el carrito! Listo para cobrar.`,
      );
    }
  }

  deleteQuotation(code: string): void {
    const updated = this.savedQuotations().filter((q) => q.code !== code);
    localStorage.setItem(
      this.getQuotationsStorageKey(),
      JSON.stringify(updated),
    );
    this.savedQuotations.set(updated);
    this.notificationService.info(`Cotización ${code} eliminada.`);
  }

  clearCart() {
    if (this.cartItems().length > 0 && !this.isUserAdmin()) {
      this.requestSupervisorApproval(
        'Anular / vaciar el carrito actual de venta',
        () => {
          this.executeClearCart();
        },
      );
      return;
    }
    this.executeClearCart();
  }

  private executeClearCart(): void {
    this.cartItems.set([]);
    this.selectedCartIndex.set(0);
    this.amountReceived.set(0);
    this.draftStorageService.clearActiveDraft();
    this.notificationService.info('Carrito vaciado.');
  }

  getSelectedWarehouseName(): string {
    const found = this.warehouses().find(
      (w) => w.id === this.selectedWarehouseId(),
    );
    return found?.name || 'Almacén Principal';
  }

  // =========================================================================
  // Barcode Scanner: PC Camera (Webcam) & External Hardware Scanner Gun
  // =========================================================================
  async openCameraScanner(): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      this.notificationService.error(
        'El acceso a la cámara web requiere conexión segura HTTPS o localhost.',
      );
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      this.notificationService.warning(
        'Tu navegador o dispositivo no soporta acceso a la cámara web.',
      );
      return;
    }

    this.isCameraScannerOpen.set(true);
    this.cameraBurstScannedCount.set(0);
    this.cameraLastScannedItem.set(null);
    this.cameraLastScanAlert.set(null);

    try {
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
        this.zxingReader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 80,
        });
      }

      setTimeout(async () => {
        const videoEl = document.getElementById(
          'pcCameraScannerVideo',
        ) as HTMLVideoElement;
        if (!videoEl) return;

        videoEl.setAttribute('autoplay', '');
        videoEl.setAttribute('muted', '');
        videoEl.setAttribute('playsinline', '');
        videoEl.setAttribute('webkit-playsinline', '');
        videoEl.muted = true;

        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
              frameRate: { ideal: 30, min: 20 },
            },
            audio: false,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          } catch {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              });
            } catch (fallbackErr: any) {
              throw fallbackErr;
            }
          }
        }

        if (!stream) {
          throw new Error('No se pudo inicializar la cámara');
        }

        // Aplicar autoenfoque continuo si el hardware de la cámara lo soporta
        try {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            const capabilities: any = (videoTrack as any).getCapabilities
              ? (videoTrack as any).getCapabilities()
              : {};
            if (
              capabilities.focusMode &&
              capabilities.focusMode.includes('continuous')
            ) {
              void (videoTrack as any)
                .applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
                .catch(() => {});
            }
          }
        } catch {}

        this.cameraStream = stream;
        videoEl.srcObject = stream;
        await videoEl
          .play()
          .catch((e) => console.warn('Camera video play error:', e));

        try {
          this.zxingControls = await this.zxingReader!.decodeFromStream(
            stream,
            videoEl,
            (result, error) => {
              if (!this.isCameraScannerOpen()) return;
              if (result) {
                const text = result.getText();
                if (text) {
                  void this.handleScannedBarcode(text, true);
                }
              }
            },
          );
        } catch (streamErr) {
          console.warn(
            'decodeFromStream fallback to decodeFromVideoElement:',
            streamErr,
          );
          try {
            this.zxingControls = await this.zxingReader!.decodeFromVideoElement(
              videoEl,
              (result, error) => {
                if (!this.isCameraScannerOpen()) return;
                if (result) {
                  const text = result.getText();
                  if (text) {
                    void this.handleScannedBarcode(text, true);
                  }
                }
              },
            );
          } catch (elementErr) {
            console.warn('ZXing camera decode error:', elementErr);
          }
        }

        // Booster hardware nativo si soporta formatos 1D
        this.startCameraBarcodeDetection(videoEl);
      }, 150);
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      let errorMsg =
        'No se pudo acceder a la cámara. Por favor verifica los permisos en el navegador.';
      if (
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError'
      ) {
        errorMsg =
          'Permiso de cámara denegado. Concede permiso para usar la cámara en la configuración del navegador.';
      } else if (err?.name === 'NotFoundError') {
        errorMsg = 'No se encontró ninguna cámara conectada.';
      }
      this.notificationService.error(errorMsg);
      this.closeCameraScanner();
    }
  }

  closeCameraScanner(): void {
    if (this.zxingControls) {
      try {
        this.zxingControls.stop();
      } catch {}
      this.zxingControls = null;
    }
    if (this.cameraAnimFrameId) {
      cancelAnimationFrame(this.cameraAnimFrameId);
      this.cameraAnimFrameId = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
    }
    if (this.cameraAlertTimeoutId) {
      clearTimeout(this.cameraAlertTimeoutId);
      this.cameraAlertTimeoutId = null;
    }
    this.cameraLastScanAlert.set(null);
    this.cameraScanFlash.set(false);
    this.isCameraScannerOpen.set(false);
  }

  private startCameraBarcodeDetection(videoEl: HTMLVideoElement): void {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return;

    (window as any).BarcodeDetector.getSupportedFormats()
      .then((supported: string[]) => {
        if (!supported || !supported.includes('ean_13')) return;

        let detector: any = null;
        try {
          detector = new (window as any).BarcodeDetector({
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
        } catch {
          return;
        }

        const scanLoop = async () => {
          if (
            !this.isCameraScannerOpen() ||
            !videoEl ||
            videoEl.readyState < videoEl.HAVE_CURRENT_DATA
          ) {
            if (this.isCameraScannerOpen()) {
              this.cameraAnimFrameId = requestAnimationFrame(scanLoop);
            }
            return;
          }

          try {
            if (detector) {
              const barcodes = await detector.detect(videoEl);
              if (barcodes && barcodes.length > 0) {
                const raw = barcodes[0].rawValue;
                if (raw) {
                  void this.handleScannedBarcode(raw, true);
                }
              }
            }
          } catch {}

          if (this.isCameraScannerOpen()) {
            setTimeout(() => {
              this.cameraAnimFrameId = requestAnimationFrame(scanLoop);
            }, 150);
          }
        };

        this.cameraAnimFrameId = requestAnimationFrame(scanLoop);
      })
      .catch(() => {});
  }

  async handleScannedBarcode(
    barcode: string,
    isFromCamera = false,
  ): Promise<void> {
    const raw = (barcode || '').trim();
    if (!raw) return;

    const now = Date.now();
    // Debounce duplicate scans from camera within 1.2 seconds
    if (
      isFromCamera &&
      raw.toLowerCase() === this.lastCameraScanCode.toLowerCase() &&
      now - this.lastCameraScanTime < 1200
    ) {
      return;
    }
    this.lastCameraScanCode = raw;
    this.lastCameraScanTime = now;

    const clean = raw.toLowerCase();
    const cleanDigits = raw.replace(/\D/g, '');
    const activeCid =
      this.authService.companyId() || Number(getCompanyId()) || 0;

    let product: any = null;

    // 0. Búsqueda instantánea sub-2ms en Catálogo Local RAM / IndexedDB
    let cachedProduct = this.catalogCache.findByBarcode(clean);
    if (!cachedProduct && cleanDigits.length >= 4) {
      cachedProduct = this.catalogCache.findByBarcode(cleanDigits);
    }
    if (!cachedProduct) {
      const fastMatches = this.catalogCache.searchFast(raw);
      if (fastMatches && fastMatches.length > 0) {
        cachedProduct = fastMatches[0];
      }
    }
    if (
      cachedProduct &&
      (!activeCid ||
        cachedProduct.companyId == null ||
        Number(cachedProduct.companyId) === 0 ||
        Number(cachedProduct.companyId) === activeCid)
    ) {
      product = cachedProduct;
    }

    // 1. Check in local products list with multi-property and digits matching respecting tenant
    if (!product) {
      product = this.products().find((p) => {
        if (this.isServiceItem(p)) return false;

        // Tenant isolation: un tenant jamás puede ver ni cobrar productos de otro
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
        const sDesc = (p.shortDescription || '').trim().toLowerCase();
        const idStr = p.id ? String(p.id) : '';
        const sku = `sku-${p.id}`.toLowerCase();

        if (
          b === clean ||
          r === clean ||
          sDesc === clean ||
          idStr === clean ||
          sku === clean
        ) {
          return true;
        }
        if (cleanDigits.length >= 4) {
          const pDigits = (p.barcode || '').replace(/\D/g, '');
          const rDigits = (p.reference || '').replace(/\D/g, '');
          if (
            pDigits &&
            (pDigits === cleanDigits ||
              pDigits.padStart(13, '0') === cleanDigits.padStart(13, '0') ||
              pDigits.replace(/^0+/, '') === cleanDigits.replace(/^0+/, ''))
          ) {
            return true;
          }
          if (
            rDigits &&
            (rDigits === cleanDigits ||
              rDigits.replace(/^0+/, '') === cleanDigits.replace(/^0+/, ''))
          ) {
            return true;
          }
        }
        return false;
      });
    }

    // 2. If not found in loaded products, query backend API with tenant isolation
    if (!product) {
      try {
        const searchRes = await this.productService.searchProducts(raw);
        const candidates = searchRes?.data || [];
        product =
          candidates.find((c: any) => {
            if (this.isServiceItem(c)) return false;
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
            const sDesc = (c.shortDescription || '').trim().toLowerCase();
            const idStr = c.id ? String(c.id) : '';
            const bDigits = (c.barcode || '').replace(/\D/g, '');
            return (
              b === clean ||
              r === clean ||
              sDesc === clean ||
              idStr === clean ||
              (cleanDigits.length >= 4 &&
                bDigits &&
                (bDigits === cleanDigits ||
                  bDigits.replace(/^0+/, '') ===
                    cleanDigits.replace(/^0+/, '')))
            );
          }) || candidates[0];

        const cCid = product?.companyId ?? (product as any)?.CompanyId;
        if (
          product &&
          (!activeCid ||
            cCid == null ||
            Number(cCid) === 0 ||
            Number(cCid) === activeCid)
        ) {
          this.products.update((list) => {
            if (!list.some((p) => p.id === product!.id)) {
              return [product!, ...list];
            }
            return list;
          });
        } else {
          product = undefined;
        }
      } catch (err) {
        console.warn('Fallback barcode search failed:', err);
      }
    }

    if (product) {
      this.posAudio.playScanSuccess();
      soundEffects.playScannerBeep();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          (navigator as any).vibrate([60, 40, 60]);
        } catch {}
      }

      this.addProductToCart(product);

      const prodName = product.description || 'Producto';
      const prodPrice = Number(product.price || product.priceList || 0);
      const scanTimeStr = formatTimeInRD(new Date());

      this.cameraBurstScannedCount.update((c) => c + 1);
      this.cameraLastScannedItem.set({
        name: prodName,
        price: prodPrice,
        time: scanTimeStr,
      });

      this.cameraLastScanAlert.set({
        code: raw,
        name: prodName,
        price: prodPrice,
        time: scanTimeStr,
        status: 'success',
      });
      if (this.cameraAlertTimeoutId) {
        clearTimeout(this.cameraAlertTimeoutId);
      }
      this.cameraAlertTimeoutId = setTimeout(() => {
        this.cameraLastScanAlert.set(null);
      }, 3500);

      this.cameraScanFlash.set(true);
      setTimeout(() => this.cameraScanFlash.set(false), 300);

      this.notificationService.success(
        `¡Código leído con éxito! +1 "${prodName}" agregado.`,
      );
      this.focusCatalogSearch();
    } else {
      this.posAudio.playScanError();
      soundEffects.playErrorBeep();

      // Alerta visual inmediata en el visor indicando que la lectura sí se produjo
      this.cameraLastScanAlert.set({
        code: raw,
        name: 'Código leído (No registrado)',
        price: 0,
        time: formatTimeInRD(new Date()),
        status: 'not_found',
      });
      if (this.cameraAlertTimeoutId) {
        clearTimeout(this.cameraAlertTimeoutId);
      }
      this.cameraAlertTimeoutId = setTimeout(() => {
        this.cameraLastScanAlert.set(null);
      }, 3500);

      this.cameraScanFlash.set(true);
      setTimeout(() => this.cameraScanFlash.set(false), 300);

      this.notificationService.warning(
        `Código "${raw}" leído correctamente, pero no está registrado en el catálogo.`,
      );
      this.focusCatalogSearch();
    }
  }

  // =========================================================================
  // Modo "Cajero Relámpago": Fast Keyboard & Touch POS Actions
  // =========================================================================
  focusCatalogSearch(): void {
    if (this.catalogSearchInputRef?.nativeElement) {
      this.catalogSearchInputRef.nativeElement.focus();
      this.catalogSearchInputRef.nativeElement.select();
    }
  }

  openPaymentSection(): void {
    if (this.cartItems().length === 0) {
      this.notificationService.warning(
        'Agrega productos al carrito antes de cobrar (F4).',
      );
      return;
    }
    if (this.selectedMethod() === 'Efectivo') {
      if (!this.amountReceived() || this.amountReceived() === 0) {
        this.amountReceived.set(this.total());
      }
      setTimeout(() => {
        this.amountReceivedInputRef?.nativeElement?.focus();
        this.amountReceivedInputRef?.nativeElement?.select();
      }, 50);
    } else {
      this.notificationService.info(
        `Cobro con ${this.selectedMethod()}. Presione Enter para confirmar.`,
      );
    }
  }

  confirmExactCashFromShortcut(): void {
    if (this.cartItems().length === 0) {
      this.notificationService.warning(
        'Agrega productos al carrito antes de cobrar.',
      );
      return;
    }
    if (this.selectedMethod() === 'Efectivo') {
      this.amountReceived.set(this.total());
    }
    void this.processQuickSale();
  }

  applyQuickCash(amount: number | 'exact'): void {
    if (amount === 'exact') {
      this.amountReceived.set(this.total());
    } else {
      this.amountReceived.set(amount);
    }
  }

  addQuickCashIncrement(delta: number): void {
    const current = Number(this.amountReceived()) || 0;
    this.amountReceived.set(Math.round((current + delta) * 100) / 100);
  }

  clearAmountReceived(): void {
    this.amountReceived.set(0);
  }

  setCashCurrency(curr: 'DOP' | 'USD'): void {
    this.cashCurrency.set(curr);
    if (curr === 'USD') {
      const minUsd = Math.ceil(this.total() / (this.usdExchangeRate() || 1));
      this.amountReceivedUsd.set(minUsd);
    } else {
      this.amountReceived.set(this.total());
    }
  }

  setUsdExchangeRate(rate: number): void {
    const r = Math.max(1, Number(rate) || 60.5);
    this.usdExchangeRate.set(r);
  }

  applyQuickUsd(amount: number | 'exact'): void {
    if (amount === 'exact') {
      const minUsd = Math.ceil(this.total() / (this.usdExchangeRate() || 1));
      this.amountReceivedUsd.set(minUsd);
    } else {
      this.amountReceivedUsd.set(amount);
    }
  }

  addQuickUsdIncrement(delta: number): void {
    const current = Number(this.amountReceivedUsd()) || 0;
    this.amountReceivedUsd.set(Math.round((current + delta) * 100) / 100);
  }

  clearAmountReceivedUsd(): void {
    this.amountReceivedUsd.set(0);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const inputEl = event.target as HTMLInputElement;
      const rawTerm = (inputEl?.value || this.catalogSearchTerm() || '').trim();
      if (!rawTerm) return;
      if (inputEl) inputEl.value = '';
      this.catalogSearchTerm.set('');
      void this.handleScannedBarcode(rawTerm, false);
    }
  }

  getProductCategoryIcon(
    categoryId?: number | null,
    description?: string | null,
  ): string {
    const desc = (description || '').toLowerCase();
    if (
      desc.includes('coca') ||
      desc.includes('agua') ||
      desc.includes('jugo') ||
      desc.includes('cerveza') ||
      desc.includes('soda') ||
      desc.includes('bebida') ||
      desc.includes('refresco')
    ) {
      return '🥤';
    }
    if (
      desc.includes('pan') ||
      desc.includes('queso') ||
      desc.includes('arroz') ||
      desc.includes('snack') ||
      desc.includes('galleta') ||
      desc.includes('comida') ||
      desc.includes('sandwich') ||
      desc.includes('cafe')
    ) {
      return '🍔';
    }
    if (
      desc.includes('cable') ||
      desc.includes('usb') ||
      desc.includes('cargador') ||
      desc.includes('bateria') ||
      desc.includes('teclado') ||
      desc.includes('mouse') ||
      desc.includes('celular')
    ) {
      return '🔌';
    }
    if (
      desc.includes('jabon') ||
      desc.includes('cloro') ||
      desc.includes('limpia') ||
      desc.includes('papel') ||
      desc.includes('detergente') ||
      desc.includes('shampoo')
    ) {
      return '🧼';
    }
    if (
      desc.includes('martillo') ||
      desc.includes('clavo') ||
      desc.includes('tornillo') ||
      desc.includes('pintura') ||
      desc.includes('herramienta') ||
      desc.includes('tubo')
    ) {
      return '🔧';
    }
    if (
      desc.includes('pastilla') ||
      desc.includes('jarabe') ||
      desc.includes('alcohol') ||
      desc.includes('aspirina') ||
      desc.includes('medicina')
    ) {
      return '💊';
    }
    switch (categoryId) {
      case 2:
        return '🍔';
      case 3:
        return '🥤';
      case 4:
        return '📄';
      case 5:
        return '🛠️';
      default:
        return '📦';
    }
  }

  onDiscountChange() {
    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  setMethod(m: string) {
    this.selectedMethod.set(m);
    if (m === 'Transferencia') {
      this.transferAmountDeposited.set(this.netPayable());
    }
    if (m !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  setDiscountValue(val: number) {
    const num = Math.max(0, Number(val) || 0);
    const isHigh =
      this.discountType() === 'percent'
        ? num > 15
        : this.subtotal() > 0 && num / this.subtotal() > 0.15;

    if (isHigh && !this.isUserAdmin()) {
      const label =
        this.discountType() === 'percent' ? `${num}%` : `RD$ ${num.toFixed(2)}`;
      this.requestSupervisorApproval(
        `Aplicar descuento extraordinario del ${label}`,
        () => {
          this.discountValue.set(num);
        },
      );
      return;
    }
    this.discountValue.set(num);
  }

  toggleDiscountType() {
    this.discountType.update((t) => (t === 'percent' ? 'fixed' : 'percent'));
  }

  setAmountReceived(val: number) {
    this.amountReceived.set(Math.max(0, val));
  }

  resetForm() {
    if (this.cartItems().length > 0 && !this.isUserAdmin()) {
      this.requestSupervisorApproval(
        'Limpiar / anular venta en mostrador',
        () => {
          this.executeResetForm();
        },
      );
      return;
    }
    this.executeResetForm();
  }

  private executeResetForm(): void {
    this.selectedCustomerId = null;
    this.catalogSearchTerm.set('');
    this.selectedCategory.set(null);
    this.cartItems.set([]);
    this.discountValue.set(0);
    this.selectedMethod.set('Efectivo');
    this.amountReceived.set(0);
    this.amountReceivedUsd.set(0);
    this.catalogPage.set(1);
    this.cardLastFour.set('');
    this.cardAuthVoucher.set('');
    this.transferBank.set('Banco Popular (792019481)');
    this.transferReference.set('');
    this.transferAccountLastFour.set('');
    this.transferAmountDeposited.set(0);
    this.step2ExplicitlyCompleted.set(false);
    this.fiscalRnc.set('');
    this.fiscalBusinessName.set('');
    this.invoiceNotes.set('');
    this.invoiceType.set('B02');
    this.criticalAlert.set(null);
    this.draftStorageService.clearActiveDraft();
  }

  validateStep1(notify = false): boolean {
    if (!this.hasOpenSession()) {
      if (notify) {
        this.notificationService.warning(
          'Es obligatorio tener una caja abierta para procesar ventas.',
        );
        this.isOpenSessionModalVisible.set(true);
      }
      return false;
    }
    if (this.cartItems().length === 0) {
      if (notify)
        this.notificationService.warning(
          'Agrega al menos un producto al carrito antes de avanzar.',
        );
      return false;
    }

    const method = this.selectedMethod();
    if (method === 'Efectivo') {
      const received = this.effectiveAmountReceivedDop();
      if (received < this.netPayable()) {
        if (notify) {
          this.notificationService.warning(
            'El monto recibido no puede ser menor al total neto a pagar.',
          );
          if (this.cashCurrency() !== 'USD') {
            this.amountReceivedInputRef?.nativeElement?.focus();
          }
        }
        return false;
      }
    } else if (method === 'Tarjeta') {
      const four = this.cardLastFour().trim();
      const voucher = this.cardAuthVoucher().trim();
      if (!four || four.length < 4) {
        if (notify)
          this.notificationService.warning(
            'Debes ingresar los últimos 4 dígitos de la tarjeta.',
          );
        return false;
      }
      if (!voucher) {
        if (notify)
          this.notificationService.warning(
            'Debes ingresar el número de autorización / voucher.',
          );
        return false;
      }
    } else if (method === 'Transferencia') {
      if (!this.transferBank().trim()) {
        if (notify)
          this.notificationService.warning(
            'Selecciona o ingresa la cuenta de banco de destino.',
          );
        return false;
      }
      const four = this.transferAccountLastFour().trim();
      if (!four || four.length !== 4) {
        if (notify)
          this.notificationService.warning(
            'Debes ingresar los últimos 4 dígitos de la cuenta de origen del cliente.',
          );
        return false;
      }
      const dep = Number(this.transferAmountDeposited());
      if (isNaN(dep) || dep <= 0) {
        if (notify)
          this.notificationService.warning(
            'Debes ingresar el monto que el cliente transfirió / depositó.',
          );
        return false;
      }
      if (dep < this.netPayable()) {
        if (notify)
          this.notificationService.warning(
            `El monto depositado (RD$ ${dep.toFixed(2)}) no cubre el total de la venta (RD$ ${this.netPayable().toFixed(2)}).`,
          );
        return false;
      }
      if (!this.transferReference().trim()) {
        if (notify)
          this.notificationService.warning(
            'Ingresa el número de confirmación o referencia de la transferencia.',
          );
        return false;
      }
    }
    return true;
  }

  validateStep2(notify = false): boolean {
    if (this.invoiceType() === 'B01' || this.invoiceType() === 'B15') {
      if (!this.fiscalRnc().trim()) {
        if (notify)
          this.notificationService.warning(
            'Para comprobantes con crédito fiscal o gubernamentales (B01/B15) debes ingresar el RNC / Cédula.',
          );
        return false;
      }
      if (!this.fiscalBusinessName().trim()) {
        if (notify)
          this.notificationService.warning(
            'Debes ingresar la razón social para la factura con crédito fiscal.',
          );
        return false;
      }
    }
    return true;
  }

  goToStep(step: 1 | 2 | 3) {
    if (step === 1) {
      this.checkoutStep.set(1);
      return;
    }

    // Step 2 and Step 3 require Step 1 to be fully finished
    if (!this.validateStep1(true)) {
      return;
    }

    if (step === 2) {
      if (!this.canConfigureNcf()) {
        this.goToStep(3);
        return;
      }
      this.checkoutStep.set(2);
      return;
    }

    if (step === 3) {
      // If sale is already completed and user is just inspecting receipt:
      if (this.checkoutStep() === 3 && this.lastCompletedSale()) {
        return;
      }
      // If coming from Step 2, validate fiscal details and mark Step 2 as completed
      if (this.checkoutStep() === 2) {
        if (!this.validateStep2(true)) {
          return;
        }
        this.step2ExplicitlyCompleted.set(true);
      } else {
        // If coming directly from Step 1, Step 2 was omitted / not performed
        this.step2ExplicitlyCompleted.set(false);
      }
      // Se aplica la venta inmediatamente
      this.processQuickSale();
    }
  }

  startNewSale() {
    this.resetForm();
    this.checkoutStep.set(1);
    this.focusCatalogSearch();
  }

  printTicket() {
    this.isSaleCompletedModalOpen = true;
  }

  sendReceiptWhatsApp() {
    const sale = this.lastCompletedSale();
    if (!sale) {
      this.notificationService.warning(
        'No hay una venta reciente para compartir.',
      );
      return;
    }

    const data: WhatsAppInvoiceData = {
      invoiceNumber: sale.invoiceNumber || `VTA-${sale.id || '101'}`,
      date: new Date().toLocaleDateString('es-DO'),
      customerName: sale.customerName || 'Consumidor Final',
      items: (sale.items || []).map((it) => ({
        productName: it.productName,
        quantity: it.quantity,
        total: it.total,
      })),
      subtotal: sale.subtotal || 0,
      itbis: sale.itbis || 0,
      total: sale.total || 0,
      paymentMethod: sale.paymentMethod || 'Efectivo',
      destinationPhone: this.selectedCustomer()?.phone || '',
    };

    if (this.sendWhatsAppModal) {
      this.sendWhatsAppModal.open(data);
    }
  }

  // Interactive Calculator (F3)
  calcPress(val: string): void {
    if (['+', '-', '*', '/'].includes(val)) {
      if (this.calculatorDisplay() !== 'Error') {
        const symbol =
          val === '*' ? '×' : val === '/' ? '÷' : val === '-' ? '−' : '+';
        this.calculatorFormula.set(this.calculatorDisplay() + ' ' + symbol);
      }
    }
    if (
      this.calculatorDisplay() === '0' ||
      this.calculatorDisplay() === 'Error'
    ) {
      if (['+', '-', '*', '/'].includes(val)) {
        this.calculatorDisplay.set('0' + val);
      } else {
        this.calculatorDisplay.set(val);
      }
    } else {
      this.calculatorDisplay.update((curr) => curr + val);
    }
  }

  calcBackspace(): void {
    const curr = this.calculatorDisplay();
    if (curr === 'Error' || curr.length <= 1) {
      this.calculatorDisplay.set('0');
    } else {
      this.calculatorDisplay.set(curr.slice(0, -1));
    }
  }

  calcClear(): void {
    this.calculatorDisplay.set('0');
    this.calculatorFormula.set('');
  }

  calcEval(): void {
    try {
      const expr = this.calculatorDisplay().replace(/[^0-9+\-*/.]/g, '');
      if (!expr) return;
      const res = Function(`'use strict'; return (${expr})`)();
      const rounded = Math.round(Number(res) * 100) / 100;
      this.calculatorFormula.set(this.calculatorDisplay() + ' =');
      this.calculatorDisplay.set(String(rounded));
    } catch {
      this.calculatorDisplay.set('Error');
    }
  }

  calcApply(): void {
    this.calcEval();
    const val = parseFloat(this.calculatorDisplay());
    if (!isNaN(val) && val >= 0) {
      this.amountReceived.set(val);
      this.isCalculatorOpen.set(false);
      this.notificationService.success(
        `Monto recibido aplicado: RD$ ${val.toFixed(2)}`,
      );
    }
  }

  // =========================================================================
  // Held Sales (Ventas en espera - F8 / F9)
  // =========================================================================
  holdCurrentSale(): void {
    if (this.cartItems().length === 0) {
      this.notificationService.warning(
        'El carrito está vacío. Agregue productos antes de poner la venta en espera.',
      );
      return;
    }

    const cust = this.customers().find((c) => c.id === this.selectedCustomerId);
    const custName = cust?.name || 'Consumidor final';

    const held = this.draftStorageService.holdSale(
      {
        customerId: this.selectedCustomerId,
        customerName: custName,
        items: this.cartItems(),
        discountType: this.discountType(),
        discountValue: this.discountValue(),
        selectedMethod: this.selectedMethod(),
        amountReceived: this.amountReceived(),
        timestamp: new Date().toISOString(),
      },
      `${custName} (${this.cartItems().length} arts. - RD$ ${this.total().toFixed(2)})`,
    );

    this.notificationService.success(`Venta puesta en espera (${held.label}).`);
    this.checkoutStep.set(1);
    this.resetForm();
  }

  openHeldSalesModal(): void {
    this.draftStorageService.reloadHeldSales();
    this.isHeldSalesModalOpen.set(true);
  }

  closeHeldSalesModal(): void {
    this.isHeldSalesModalOpen.set(false);
  }

  resumeHeldSale(held: PosHeldSale): void {
    if (this.cartItems().length > 0) {
      this.holdCurrentSale();
    }

    this.cartItems.set(held.items);
    this.selectedCustomerId = held.customerId;
    this.discountType.set(held.discountType);
    this.discountValue.set(held.discountValue);
    this.selectedMethod.set(held.selectedMethod || 'Efectivo');
    this.amountReceived.set(held.amountReceived || 0);

    this.draftStorageService.resumeHeldSale(held.id);
    this.isHeldSalesModalOpen.set(false);
    this.checkoutStep.set(1);
    this.notificationService.info(`Venta recuperada: ${held.label}`);
  }

  dismissHeldSale(id: string): void {
    this.draftStorageService.removeHeldSale(id);
  }

  // =========================================================================
  // Process Quick Sale (Idempotent & Double-Click Protected)
  // =========================================================================
  async processQuickSale() {
    // 1. Double-Click Synchronous Guard
    if (this.isSubmitting() || this.isLoading()) {
      return;
    }

    if (!this.hasOpenSession()) {
      this.notificationService.warning(
        'Es obligatorio tener una caja abierta para procesar ventas.',
      );
      this.isOpenSessionModalVisible.set(true);
      return;
    }

    if (this.cartItems().length === 0) {
      this.notificationService.warning(
        'Agrega al menos un producto a la venta.',
      );
      return;
    }

    let paymentDetailsNote = '';

    if (this.selectedMethod() === 'Efectivo') {
      const received = this.effectiveAmountReceivedDop();
      if (received < this.netPayable()) {
        this.notificationService.warning(
          'El monto recibido no puede ser menor al total neto a pagar.',
        );
        if (this.cashCurrency() !== 'USD') {
          this.amountReceivedInputRef?.nativeElement?.focus();
        }
        return;
      }
      if (this.cashCurrency() === 'USD') {
        paymentDetailsNote = `Efectivo USD $${this.amountReceivedUsd()} (Tasa 1 USD = RD$ ${this.usdExchangeRate()}) Equiv: RD$ ${received.toFixed(2)}`;
      }
    } else if (this.selectedMethod() === 'Tarjeta') {
      const four = this.cardLastFour().trim();
      const voucher = this.cardAuthVoucher().trim();
      if (!four || four.length < 4) {
        this.notificationService.warning(
          'Debes ingresar los últimos 4 dígitos de la tarjeta.',
        );
        return;
      }
      if (!voucher) {
        this.notificationService.warning(
          'Debes ingresar el número de autorización / voucher.',
        );
        return;
      }
      paymentDetailsNote = `Tarjeta ${this.cardType()} (****${four}) Auth: ${voucher}`;
    } else if (this.selectedMethod() === 'Transferencia') {
      const bank = this.transferBank().trim();
      const ref = this.transferReference().trim();
      const four = this.transferAccountLastFour().trim();
      const dep = Number(this.transferAmountDeposited()) || this.netPayable();
      if (!bank) {
        this.notificationService.warning(
          'Debes especificar el banco de la transferencia.',
        );
        return;
      }
      if (!four || four.length !== 4) {
        this.notificationService.warning(
          'Debes ingresar los últimos 4 dígitos de la cuenta de origen del cliente.',
        );
        return;
      }
      if (dep < this.netPayable()) {
        this.notificationService.warning(
          `El monto depositado (RD$ ${dep.toFixed(2)}) no cubre el total a cobrar.`,
        );
        return;
      }
      if (!ref) {
        this.notificationService.warning(
          'Debes ingresar el número de confirmación / referencia.',
        );
        return;
      }
      paymentDetailsNote = `Transferencia ${bank} (Cta ****${four}) Depósito: RD$ ${dep.toFixed(2)} Ref: ${ref}`;
    }

    // Set submit lock immediately
    this.isSubmitting.set(true);
    this.isLoading.set(true);
    this.criticalAlert.set(null);

    const idempotencyKey = generateIdempotencyKey();
    const cust = this.customers().find((c) => c.id === this.selectedCustomerId);
    const custName = cust?.name || 'Consumidor final';
    const custRnc = cust?.identification || '000-0000000-0';

    const invType = this.invoiceType();
    let ncfFormatted = '';
    const assignedSeq = String(Date.now()).slice(-8);
    if (invType === 'B01') {
      ncfFormatted = `B01${assignedSeq}`;
    } else if (invType === 'B02') {
      ncfFormatted = `B02${assignedSeq}`;
    } else if (invType === 'B15') {
      ncfFormatted = `B15${assignedSeq}`;
    }

    const payload = {
      customerId: this.selectedCustomerId,
      customerName: this.fiscalBusinessName().trim() || custName,
      items: this.cartItems().map((it) => {
        const deductQty =
          it.deductionQuantity !== undefined
            ? it.deductionQuantity
            : it.quantity;
        const equivUnitPrice =
          deductQty > 0
            ? Math.round((it.total / deductQty) * 10000) / 10000
            : it.unitPrice;
        const label =
          it.saleMode === 'package' || it.saleMode === 'individual'
            ? ` (${it.modeLabel})`
            : '';
        return {
          productId: it.productId,
          productCode: it.productCode,
          productName: `${it.productName}${label}`,
          unitPrice: equivUnitPrice,
          quantity: deductQty,
          total: it.total,
          taxRate: it.taxRate,
          warehouseId: this.selectedWarehouseId() || undefined,
        };
      }),
      warehouseId: this.selectedWarehouseId() || undefined,
      subtotal: this.subtotal(),
      discount: this.discountAmount(),
      itbis: this.itbis(),
      legalTip: this.legalTipAmount(),
      retentionItbis: this.retentionItbisAmount(),
      retentionIsr: this.retentionIsrAmount(),
      total: this.netPayable(),
      paymentMethod: paymentDetailsNote || this.selectedMethod(),
      paymentReference:
        this.selectedMethod() === 'Transferencia'
          ? `Ref: ${this.transferReference().trim()} | Cta: ****${this.transferAccountLastFour().trim()} | Depósito: RD$ ${Number(this.transferAmountDeposited() || this.netPayable()).toFixed(2)}`
          : undefined,
      amountReceived:
        this.selectedMethod() === 'Efectivo'
          ? this.effectiveAmountReceivedDop()
          : this.selectedMethod() === 'Transferencia'
            ? Number(this.transferAmountDeposited()) || this.netPayable()
            : this.netPayable(),
      change: this.change(),
      idempotencyKey,
      originChannel: 'POS_PRESENCIAL' as const,
      notes: this.invoiceNotes().trim() || undefined,
    };

    // Check Offline state directly before dispatching
    if (!this.offlineService.isOnline()) {
      this.handleOfflineSaleExecution(payload);
      return;
    }

    try {
      const res = await this.cashRegisterService.registerQuickSale(payload);

      if (res.success) {
        const invNum =
          ncfFormatted ||
          res.data?.invoiceNumber ||
          `VTA-${String(res.data?.id || '000123')}`;

        const completedData: CompletedSaleDto = {
          id: res.data?.id || Date.now(),
          invoiceNumber: invNum,
          date: new Date().toISOString(),
          customerName: this.fiscalBusinessName().trim() || custName,
          customerRnc: this.fiscalRnc().trim() || custRnc,
          cashRegisterName: this.activeSessionName(),
          cashierName: 'Admin',
          paymentMethod: payload.paymentMethod,
          subtotal: this.subtotal(),
          discount: this.discountAmount(),
          itbis: this.itbis(),
          total: this.netPayable(),
          amountReceived: payload.amountReceived,
          change: this.change(),
          notes: this.invoiceNotes().trim() || undefined,
          items: this.cartItems().map((it) => {
            const label =
              it.saleMode === 'package' || it.saleMode === 'individual'
                ? ` [${it.modeLabel}]`
                : '';
            return {
              productId: it.productId,
              productCode: it.productCode,
              productName: `${it.productName}${label}`,
              unitPrice: it.unitPrice,
              quantity: it.quantity,
              total: it.total,
            };
          }),
        };

        soundEffects.playKaChing();
        this.notificationService.success(
          `Venta rápida ${invNum} cobrada exitosamente por RD$ ${this.total().toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`,
        );

        // Refresh and synchronize warehouse stock after sale completion
        const whId = this.selectedWarehouseId() || 1;
        for (const it of this.cartItems()) {
          const deductQty =
            it.deductionQuantity !== undefined
              ? it.deductionQuantity
              : it.quantity;
          try {
            await this.stockService.updateStock(
              whId,
              it.productId,
              -deductQty,
              it.productName,
              it.productCode,
            );
          } catch (stkErr) {
            console.warn('[QuickSale] Error updating local stock for product', it.productId, stkErr);
          }

          try {
            const currentWhStock = this.warehouseStockMap().get(it.productId) || 0;
            const newBal = Math.max(0, currentWhStock - deductQty);
            this.kardexService.recordMovement({
              productId: it.productId,
              productName: it.productName,
              warehouseId: whId,
              movementType: 'VENTA',
              documentReference: invNum,
              quantityIn: 0,
              quantityOut: deductQty,
              stockBalance: newBal,
              unitCost: it.costPrice || 0,
              previousAverageCost: it.costPrice || 0,
              newAverageCost: it.costPrice || 0,
              sellingPrice: it.unitPrice,
              notes: `Venta rápida POS #${invNum}`,
            });
          } catch {}
        }

        // Invalidate ProductService catalog cache so intelligence, inventory and POS get fresh stock
        this.productService.invalidateCache();

        if (whId) {
          await this.loadWarehouseStock(whId);
        }

        this.persistLastCompletedSale(completedData);
        if (this.autoPrintTicket()) {
          this.triggerDirectTicketPrint(completedData);
        }
        if ((res as any)?.isOffline) {
          this.notificationService.warning('Venta registrada en modo contingencia local (servidor en mantenimiento). Se sincronizará automáticamente.');
        } else {
          this.notificationService.success('¡Venta cobrada exitosamente!');
        }
        this.checkoutStep.set(3);
        this.cartItems.set([]);
        this.discountValue.set(0);
        this.amountReceived.set(0);
        this.amountReceivedUsd.set(0);
        this.cardLastFour.set('');
        this.cardAuthVoucher.set('');
        this.transferReference.set('');
        this.fiscalRnc.set('');
        this.fiscalBusinessName.set('');
        this.invoiceNotes.set('');
        this.draftStorageService.clearActiveDraft();
      } else {
        this.handlePaymentFailure(
          'Error al procesar la venta',
          res.message || 'El servidor rechazó la transacción de cobro.',
          payload,
        );
      }
    } catch (e: any) {
      // Network drop or timeout during payment
      this.handlePaymentFailure(
        'Fallo de Red o Servidor en el Cobro',
        e?.message ||
          'Se perdió la conexión con el servidor mientras se registraba la venta.',
        payload,
      );
    } finally {
      this.isLoading.set(false);
      this.isSubmitting.set(false);
    }
  }

  private handleOfflineSaleExecution(payload: any): void {
    const offlineResult = this.offlineService.queueOfflineSale(payload);
    this.isLoading.set(false);
    this.isSubmitting.set(false);

    if (offlineResult.success && offlineResult.receipt) {
      soundEffects.playKaChing();
      this.persistLastCompletedSale(offlineResult.receipt);
      if (this.autoPrintTicket()) {
        this.triggerDirectTicketPrint(offlineResult.receipt);
      }
      this.isSaleCompletedModalOpen = true;
      this.notificationService.warning(
        'Venta registrada en MODO OFFLINE (Guardada en gaveta local). Se sincronizará en cuanto regrese la conexión.',
      );
      this.resetForm();
    } else {
      this.criticalAlert.set({
        title: 'Bloqueo en Modo Offline',
        message:
          offlineResult.errorMessage ||
          'No se puede procesar el cobro electrónico sin conexión. Debe cobrar en efectivo o restaurar la red.',
        canQueueOffline: false,
      });
    }
  }

  private handlePaymentFailure(
    title: string,
    message: string,
    payload: any,
  ): void {
    const isCash = this.selectedMethod() === 'Efectivo';
    this.criticalAlert.set({
      title,
      message,
      canQueueOffline: isCash,
      rawPayload: payload,
    });
  }

  retryCriticalPayment(): void {
    this.criticalAlert.set(null);
    void this.processQuickSale();
  }

  forceQueueOfflineSale(): void {
    const alertData = this.criticalAlert();
    if (!alertData || !alertData.rawPayload) return;
    this.criticalAlert.set(null);
    this.handleOfflineSaleExecution(alertData.rawPayload);
  }

  dismissCriticalAlert(): void {
    this.criticalAlert.set(null);
  }

  onSaleModalClosed() {
    this.isSaleCompletedModalOpen = false;
  }

  openConflictsModal(): void {
    this.offlineService.reloadConflicts();
    this.isConflictsModalOpen.set(true);
  }

  closeConflictsModal(): void {
    this.isConflictsModalOpen.set(false);
  }

  async resolveConflictWithOverride(id: string) {
    const ok = await this.offlineService.resolveOverrideStock(id);
    if (ok && this.offlineService.conflictsCount() === 0) {
      this.closeConflictsModal();
    }
  }

  async resolveConflictWithCustomerReassign(id: string) {
    const ok = await this.offlineService.resolveReassignCustomer(id);
    if (ok && this.offlineService.conflictsCount() === 0) {
      this.closeConflictsModal();
    }
  }

  async resolveConflictWithRefund(id: string) {
    const reason =
      prompt(
        'Ingrese el motivo de la anulación / devolución de efectivo:',
        'Rechazo de regla offline',
      ) || 'Anulación de venta offline';
    const ok = await this.offlineService.resolveVoidAndRefund(id, reason);
    if (ok && this.offlineService.conflictsCount() === 0) {
      this.closeConflictsModal();
    }
  }
}
