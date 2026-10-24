import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  signal,
  computed,
  inject,
  HostListener,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { CashRegisterService } from '../../services/cash-register.service';
import { ProductService } from '../../../products/services/product.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { CategoryService } from '../../../products/services/category.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { ProductPackagingService, type ProductPackaging } from '../../../products/services/product-packaging.service';
import { UnitOfMeasurementService, type UnitOfMeasurement } from '../../../products/services/unit-of-measurement.service';
import type { ProductDto, CustomerDto } from '../../../cuadreEnv/types/api';
import { IconDirective } from '@coreui/icons-angular';
import {
  ButtonDirective,
  SpinnerComponent,
} from '@coreui/angular';

import { type CompletedSaleDto } from '../../../sales/components/sales/sale-completed-modal.component';

export interface QuickSaleItem {
  productId: number;
  productCode: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  unitSymbol?: string;
  allowsDecimals?: boolean;
  saleMode?: 'detail' | 'package' | 'individual';
  modeLabel?: string;
  conversionFactor?: number;
  deductionQuantity?: number;
}

@Component({
  selector: 'app-quick-sale-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonDirective,
    SpinnerComponent,
    IconDirective,
  ],
  templateUrl: './quick-sale-modal.component.html',
  styleUrls: ['./quick-sale-modal.component.scss'],
})
export class QuickSaleModalComponent implements OnInit {
  readonly Math = Math;
  readonly translationService = inject(TranslationService);
  readonly packagingService = inject(ProductPackagingService);
  readonly unitService = inject(UnitOfMeasurementService);
  private cashRegisterService = inject(CashRegisterService);
  private productService = inject(ProductService);
  private customerService = inject(CustomerService);
  private categoryService = inject(CategoryService);
  private notificationService = inject(NotificationService);

  @ViewChild('productSearchInput') productSearchInputRef?: ElementRef<HTMLInputElement>;

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() completed = new EventEmitter<void>();
  @Output() saleCompleted = new EventEmitter<CompletedSaleDto>();

  isLoading = signal<boolean>(false);
  isLoadingProducts = signal<boolean>(false);
  products = signal<ProductDto[]>([]);
  customers = signal<CustomerDto[]>([]);

  selectedCustomerId: number | null = null;
  catalogSearchTerm = signal<string>('');
  selectedCategory = signal<number | null>(null);

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcuts(event: KeyboardEvent): void {
    if (!this.visible) return;

    if (event.key === 'F2') {
      event.preventDefault();
      this.focusProductSearch();
      return;
    }

    if (event.key === 'F4') {
      event.preventDefault();
      void this.processQuickSale();
      return;
    }

    if (event.key === 'F8') {
      event.preventDefault();
      this.cyclePaymentMethod();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
  }

  focusProductSearch(): void {
    setTimeout(() => {
      this.productSearchInputRef?.nativeElement.focus();
      this.productSearchInputRef?.nativeElement.select();
    }, 50);
  }

  cyclePaymentMethod(): void {
    const current = this.selectedMethod();
    if (current === 'Efectivo') {
      this.setMethod('Tarjeta');
    } else if (current === 'Tarjeta') {
      this.setMethod('Transferencia');
    } else {
      this.setMethod('Efectivo');
    }
  }

  onSearchInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const term = this.catalogSearchTerm().trim();
      if (!term) return;

      // Buscar coincidencia exacta por código de barra o referencia o primer resultado
      const exactMatch = this.products().find(
        (p) =>
          (p.barcode && p.barcode.toLowerCase() === term.toLowerCase()) ||
          (p.reference && p.reference.toLowerCase() === term.toLowerCase())
      );

      const target = exactMatch || this.filteredCatalogProducts()[0];
      if (target) {
        this.addProductToCart(target);
        this.catalogSearchTerm.set('');
      }
    }
  }

  // Cart
  cartItems = signal<QuickSaleItem[]>([]);

  // Discounts & Payments
  discountType = signal<'percent' | 'fixed'>('percent');
  discountValue = signal<number>(0);

  selectedMethod = signal<string>('Efectivo');
  amountReceived = signal<number>(0);

  // Pagination for catalog
  catalogPage = signal<number>(1);
  catalogPageSize = 6;

  categories = signal<{ id: number | null; label: string }[]>([
    { id: null, label: 'Todos' },
  ]);

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
    const taxable = Math.max(0, this.subtotal() - this.discountAmount());
    return Math.round(taxable * 0.18 * 100) / 100;
  });

  readonly total = computed(() => {
    return Math.max(0, this.subtotal() - this.discountAmount() + this.itbis());
  });

  readonly change = computed(() => {
    if (this.selectedMethod() !== 'Efectivo') return 0;
    const rec = Number(this.amountReceived()) || 0;
    return Math.max(0, Math.round((rec - this.total()) * 100) / 100);
  });

  public isServiceItem(p: any): boolean {
    if (!p) return false;
    if (p.isService === true || p.type === 'service' || p.type === 'Servicio') return true;
    if (p.productTypeId === 2 || p.ProductTypeId === 2) return true;
    if (p.invoiceWithoutStock === true) return true;

    const code = String(p.barcode || p.reference || p.code || '').toUpperCase().trim();
    if (code.startsWith('SERV-') || code.startsWith('SERV')) return true;

    const typeName = String(p.productTypeName || p.productType?.name || p.ProductType?.Name || '').toLowerCase();
    if (typeName.includes('serv')) return true;

    const catName = String(p.categoryName || p.category?.description || p.category?.name || p.CategoryName || '').toLowerCase();
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

      if (cat !== null) {
        const prodCatId = p.categoryId ?? (p as any).category?.id ?? (p as any).productCategoryId;
        const prodTypeId = p.productTypeId;
        const catNum = Number(cat);
        const selectedCatObj = this.categories().find((c) => c.id === cat);
        const selectedLabel = (selectedCatObj?.label || '').toLowerCase().trim();
        const prodCatName = (p.categoryName || (p as any).category?.description || (p as any).category?.name || '').toLowerCase().trim();

        const matchesCat =
          (prodCatId != null && Number(prodCatId) === catNum) ||
          (prodTypeId != null && Number(prodTypeId) === catNum) ||
          (selectedLabel !== '' && prodCatName === selectedLabel);

        if (!matchesCat) {
          return false;
        }
      }
      if (term) {
        const desc = (p.description || '').toLowerCase();
        const code = (p.barcode || p.reference || '').toLowerCase();
        const shortDesc = (p.shortDescription || '').toLowerCase();
        const catName = (p.categoryName || (p as any).category?.description || (p as any).category?.name || '').toLowerCase();
        return desc.includes(term) || code.includes(term) || shortDesc.includes(term) || catName.includes(term);
      }
      return true;
    });
  });

  readonly pagedCatalogProducts = computed(() => {
    const start = (this.catalogPage() - 1) * this.catalogPageSize;
    return this.filteredCatalogProducts().slice(start, start + this.catalogPageSize);
  });

  readonly totalCatalogPages = computed(() => {
    return Math.ceil(this.filteredCatalogProducts().length / this.catalogPageSize) || 1;
  });

  units = signal<UnitOfMeasurement[]>([]);
  isMeasurementModalOpen = signal<boolean>(false);
  selectedProductForMeasurement = signal<ProductDto | null>(null);
  activeProductPackaging = signal<ProductPackaging | null>(null);
  measurementMode = signal<'detail' | 'package' | 'individual'>('detail');
  measurementQuantity = signal<number>(1);
  measurementCartIndex = signal<number | null>(null);

  ngOnInit() {
    this.loadInitialLookups();
  }

  async loadInitialLookups() {
    this.isLoadingProducts.set(true);
    try {
      const [prodRes, custRes, catRes, unitsRes] = await Promise.all([
        this.productService.getPagedProducts(1, 100),
        this.customerService.getCustomers({ pageNumber: 1, pageSize: 100 } as any),
        this.categoryService.getCategories(),
        this.unitService.getUnitsOfMeasurement(),
      ]);

      if (unitsRes?.data && Array.isArray(unitsRes.data)) {
        this.units.set(unitsRes.data);
      } else {
        this.units.set(this.unitService.units());
      }

      if (prodRes?.success && prodRes.data?.items) {
        this.products.set(prodRes.data.items);
      }
      if (custRes?.success && custRes.data) {
        this.customers.set(custRes.data);
      }
      if (catRes?.success && Array.isArray(catRes.data) && catRes.data.length > 0) {
        const dynamicCats = catRes.data
          .filter((c: any) => !(c.description || c.name || '').toLowerCase().includes('serv'))
          .map((c: any) => ({
            id: c.id,
            label: c.description || c.name || `Categoría #${c.id}`,
          }));
        this.categories.set([{ id: null, label: 'Todos' }, ...dynamicCats]);
      }
    } catch (e: any) {
      console.error('Error loading quick sale lookups:', e);
    } finally {
      this.isLoadingProducts.set(false);
    }
  }

  open() {
    this.visible = true;
    this.visibleChange.emit(true);
    this.resetForm();
    this.loadInitialLookups();
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  resetForm() {
    this.selectedCustomerId = null;
    this.catalogSearchTerm.set('');
    this.selectedCategory.set(null);
    this.cartItems.set([]);
    this.discountValue.set(0);
    this.selectedMethod.set('Efectivo');
    this.amountReceived.set(0);
    this.catalogPage.set(1);
  }

  setCategory(catId: number | null) {
    this.selectedCategory.set(catId);
    this.catalogPage.set(1);
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

  getProductById(id: number): ProductDto | undefined {
    return this.products().find((p) => p.id === id);
  }

  getProductUnitSymbol(product: ProductDto): string {
    const u = this.units().find((unit) => unit.id === product.unitOfMeasurementId);
    if (u) return u.symbol;
    const desc = `${product.description || ''} ${product.shortDescription || ''}`.toLowerCase();
    for (const unit of this.units()) {
      if (unit.symbol && desc.includes(unit.symbol.toLowerCase())) return unit.symbol;
      if (unit.name && desc.includes(unit.name.toLowerCase())) return unit.symbol;
    }
    return 'und';
  }

  isProductMeasurable(product: ProductDto): boolean {
    const u = this.units().find((unit) => unit.id === product.unitOfMeasurementId);
    if (u?.allowsDecimals) return true;
    const desc = (product.description || '').toLowerCase();
    return ['lb', 'libra', 'kg', 'kilo', 'gramo', 'litro', 'metro'].some((term) => desc.includes(term));
  }

  isReadingScale = signal<boolean>(false);

  /**
   * Lee en vivo el peso desde una balanza conectada por puerto serie o USB (Web Serial API).
   */
  async readWeightFromScale(): Promise<void> {
    if (typeof window === 'undefined' || !('serial' in navigator)) {
      this.notificationService.warning(
        'La API Web Serial no está disponible en este navegador. Utilice Google Chrome o Microsoft Edge en PC para capturar peso directamente desde la balanza USB.'
      );
      return;
    }

    this.isReadingScale.set(true);
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let accumulated = '';
      const timeout = setTimeout(() => {
        try { reader.cancel(); } catch {}
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
            const unit = this.selectedProductForMeasurement() ? this.getProductUnitSymbol(this.selectedProductForMeasurement()!) : 'lb';
            this.notificationService.success(`⚖️ Peso capturado de la balanza: ${parsedWeight} ${unit}`);
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
        this.notificationService.error('Error al comunicar con la balanza: ' + (err.message || err));
      }
    } finally {
      this.isReadingScale.set(false);
    }
  }

  openMeasurementModal(product: ProductDto, cartIndex?: number): void {
    this.selectedProductForMeasurement.set(product);
    this.measurementCartIndex.set(cartIndex !== undefined ? cartIndex : null);

    const pkg = product.id ? this.packagingService.getPackaging(product.id) : undefined;
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
      this.measurementQuantity.set(prod && this.isProductMeasurable(prod) ? 1.0 : 1);
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
      return pkg.packagePrice || ((prod.cost ? Number(prod.cost) : 100) * (pkg.packageUnitsCount || 1));
    }
    if (pkg && mode === 'individual') {
      return pkg.individualUnitPrice || 15;
    }
    return prod.cost ? Number(prod.cost) : 100;
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

  confirmMeasurementModal(): void {
    const prod = this.selectedProductForMeasurement();
    if (!prod) return;

    const qty = Number(this.measurementQuantity()) || 0;
    if (qty <= 0) {
      this.notificationService.warning('Por favor ingresa una cantidad válida mayor a 0.');
      return;
    }

    const deduction = this.getInventoryDeduction();
    const baseSymbol = this.getProductUnitSymbol(prod);
    const unitPrice = this.getEffectiveUnitPrice();
    const subtotal = Math.round(qty * unitPrice * 100) / 100;
    const mode = this.measurementMode();
    const modeLabel = this.getEffectiveUnitLabel();
    const pkg = this.activeProductPackaging();
    const conversionFactor = mode === 'package' && pkg ? (pkg.packageUnitsCount || 1) : (mode === 'individual' && pkg ? (pkg.individualUnitWeight || 1) : 1);
    const code = prod.barcode || prod.reference || `PROD-${String(prod.id || 1).padStart(4, '0')}`;
    const name = prod.description || prod.shortDescription || 'Producto';

    const newItem: QuickSaleItem = {
      productId: prod.id ?? 0,
      productCode: code,
      productName: name,
      unitPrice,
      quantity: qty,
      total: subtotal,
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
      this.notificationService.info(`Cantidad actualizada: ${qty} ${modeLabel}`);
    } else {
      const existingIndex = current.findIndex((i) => i.productId === prod.id && i.saleMode === mode);
      if (existingIndex > -1) {
        current[existingIndex] = newItem;
        this.cartItems.set(current);
        this.notificationService.info(`Cantidad actualizada: ${qty} ${modeLabel}`);
      } else {
        this.cartItems.update((prev) => [...prev, newItem]);
        this.notificationService.info(`+${qty} ${modeLabel} de "${name}"`);
      }
    }

    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }

    this.closeMeasurementModal();
  }

  addProductToCart(product: ProductDto) {
    if (this.isServiceItem(product)) {
      this.notificationService.warning('Los servicios son mano de obra y no pueden cobrarse a través de la caja rápida. Utilice el módulo de Facturación o Servicios.');
      return;
    }

    const pkg = product.id ? this.packagingService.getPackaging(product.id) : undefined;
    if (this.isProductMeasurable(product) || (pkg && pkg.hasPackaging)) {
      this.openMeasurementModal(product);
      return;
    }

    const existingIdx = this.cartItems().findIndex(
      (item) => item.productId === product.id,
    );
    const price = product.cost ? Number(product.cost) : 100;
    const code = product.barcode || product.reference || `PROD-${String(product.id || 1).padStart(4, '0')}`;

    if (existingIdx > -1) {
      const items = [...this.cartItems()];
      items[existingIdx].quantity += 1;
      items[existingIdx].total = items[existingIdx].quantity * items[existingIdx].unitPrice;
      this.cartItems.set(items);
    } else {
      this.cartItems.update((prev) => [
        ...prev,
        {
          productId: product.id || Date.now(),
          productCode: code,
          productName: product.description || 'Producto',
          unitPrice: price,
          quantity: 1,
          total: price,
        },
      ]);
    }

    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  incrementQuantity(index: number) {
    const items = [...this.cartItems()];
    const it = items[index];
    if (!it) return;
    const factor = it.conversionFactor || 1;
    it.quantity += 1;
    it.total = Math.round(it.quantity * it.unitPrice * 100) / 100;
    it.deductionQuantity = Math.round(it.quantity * factor * 100) / 100;
    this.cartItems.set(items);
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
    item.quantity = val;
    item.total = Math.round(item.unitPrice * val * 100) / 100;
    const factor = item.conversionFactor || 1;
    item.deductionQuantity = Math.round(val * factor * 100) / 100;
    this.cartItems.set(items);
    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  removeCartItem(index: number) {
    const items = [...this.cartItems()];
    items.splice(index, 1);
    this.cartItems.set(items);
    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  clearCart() {
    this.cartItems.set([]);
    this.amountReceived.set(0);
  }

  onDiscountChange() {
    if (this.selectedMethod() !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  setMethod(m: string) {
    this.selectedMethod.set(m);
    if (m !== 'Efectivo') {
      this.amountReceived.set(this.total());
    }
  }

  setAmountReceived(val: number) {
    this.amountReceived.set(Math.max(0, val));
  }

  async processQuickSale() {
    if (this.cartItems().length === 0) {
      this.notificationService.warning('Agrega al menos un producto a la venta.');
      return;
    }

    if (
      this.selectedMethod() === 'Efectivo' &&
      this.amountReceived() < this.total()
    ) {
      this.notificationService.warning(
        'El monto recibido no puede ser menor al total de la venta.',
      );
      return;
    }

    this.isLoading.set(true);

    try {
      const res = await this.cashRegisterService.registerQuickSale({
        customerId: this.selectedCustomerId,
        customerName: this.selectedCustomerId ? 'Cliente Registrado' : 'Consumidor final',
        items: this.cartItems().map((it) => {
          const deductQty = it.deductionQuantity !== undefined ? it.deductionQuantity : it.quantity;
          const equivUnitPrice = deductQty > 0 ? Math.round((it.total / deductQty) * 10000) / 10000 : it.unitPrice;
          const label = it.saleMode === 'package' || it.saleMode === 'individual' ? ` (${it.modeLabel})` : '';
          return {
            productId: it.productId,
            productCode: it.productCode,
            productName: `${it.productName}${label}`,
            unitPrice: equivUnitPrice,
            quantity: deductQty,
            total: it.total,
          };
        }),
        subtotal: this.subtotal(),
        discount: this.discountAmount(),
        itbis: this.itbis(),
        total: this.total(),
        paymentMethod: this.selectedMethod(),
        amountReceived: this.selectedMethod() === 'Efectivo' ? this.amountReceived() : this.total(),
        change: this.change(),
      });

      if (res.success) {
        const invNum = res.data?.invoiceNumber || `VTA-${String(res.data?.id || '000123')}`;
        const cust = this.customers().find((c) => c.id === this.selectedCustomerId);
        const custName = cust?.name || 'Consumidor final';
        const custRnc = cust?.identification || '000-0000000-0';

        const completedData: CompletedSaleDto = {
          id: res.data?.id || 123,
          invoiceNumber: invNum,
          date: new Date().toISOString(),
          customerName: custName,
          customerRnc: custRnc,
          cashRegisterName: 'Caja Principal',
          cashierName: 'Admin',
          paymentMethod: this.selectedMethod(),
          subtotal: this.subtotal(),
          discount: this.discountAmount(),
          itbis: this.itbis(),
          total: this.total(),
          amountReceived: this.selectedMethod() === 'Efectivo' ? this.amountReceived() : this.total(),
          change: this.change(),
          items: this.cartItems().map((it) => {
            const label = it.saleMode === 'package' || it.saleMode === 'individual' ? ` [${it.modeLabel}]` : '';
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

        this.notificationService.success(
          `Venta rápida ${invNum} cobrada exitosamente por RD$ ${this.total().toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`,
        );

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cuadre:sale-completed', { detail: completedData }));
          try {
            if ('BroadcastChannel' in window) {
              const bc = new BroadcastChannel('cuadreenv_live_bus');
              bc.postMessage({ type: 'SALE_COMPLETED', data: completedData });
              bc.close();
            }
          } catch {
            // ignore
          }
        }

        this.saleCompleted.emit(completedData);
        this.completed.emit();
        this.close();
      } else {
        this.notificationService.error(res.message || 'Error al procesar la venta.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}
