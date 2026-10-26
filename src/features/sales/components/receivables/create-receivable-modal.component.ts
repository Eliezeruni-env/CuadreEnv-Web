import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  signal,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { CustomerService } from '../../../customers/services/customer.service';
import { ReceivableService, ReceivableItemDto } from '../../services/receivable.service';
import { ProductService } from '../../../products/services/product.service';
import { WarehouseService } from '../../../inventory/services/warehouse.service';
import { StockService } from '../../../inventory/services/stock.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { ModuleAccessService } from '../../../cuadreEnv/services/module-access.service';
import type { CustomerDto, ProductDto } from '../../../cuadreEnv/types/api';
import type { Warehouse } from '../../../../app/models/warehouse';
import {
  ButtonDirective,
  FormControlDirective,
  FormDirective,
  FormSelectDirective,
  SpinnerComponent,
} from '@coreui/angular';

@Component({
  selector: 'app-create-receivable-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    FormControlDirective,
    FormDirective,
    FormSelectDirective,
    SpinnerComponent,
  ],
  templateUrl: './create-receivable-modal.component.html',
  styleUrls: ['./create-receivable-modal.component.scss'],
})
export class CreateReceivableModalComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  private readonly customerService = inject(CustomerService);
  private readonly receivableService = inject(ReceivableService);
  private readonly productService = inject(ProductService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly stockService = inject(StockService);
  private readonly notificationService = inject(NotificationService);
  private readonly moduleAccess = inject(ModuleAccessService, { optional: true });
  private readonly fb = inject(FormBuilder);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  customers = signal<CustomerDto[]>([]);
  products = signal<ProductDto[]>([]);
  warehouses = signal<Warehouse[]>([]);
  selectedWarehouseId = signal<number>(1);
  warehouseStockMap = signal<Map<number, number>>(new Map());
  selectedItems = signal<ReceivableItemDto[]>([]);
  isLoading = signal<boolean>(false);
  isSavingCustomer = signal<boolean>(false);
  isQuickCustomer = signal<boolean>(false);

  // Wizard Stepper (Step 1: Cliente & Valores, Step 2: Productos & Almacén, Step 3: Plan de Cuotas)
  currentStep = signal<1 | 2 | 3>(1);

  // Product addition mode: from inventory catalog OR custom product of any type
  productMode = signal<'catalog' | 'custom'>('catalog');
  tempProductId = signal<number | null>(null);
  tempProductName = signal<string>('');
  tempQuantity = signal<number>(1);
  tempUnitPrice = signal<number>(0);

  receivableForm: FormGroup;

  remainingBalance = computed(() => {
    const total = parseFloat(this.receivableForm?.get('totalAmount')?.value) || 0;
    const downPayment = parseFloat(this.receivableForm?.get('downPayment')?.value) || 0;
    return Math.max(0, total - downPayment);
  });

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.receivableForm = this.fb.group({
      customerId: [''],
      quickCustomerName: [''],
      quickCustomerIdentification: [''],
      quickCustomerPhone: [''],
      customerPhone: [''],
      customerEmail: [''],
      description: ['', [Validators.required]],
      totalAmount: [0, [Validators.required, Validators.min(0.01)]],
      downPayment: [0, [Validators.min(0)]],
      installmentAmount: [0, [Validators.required, Validators.min(0.01)]],
      totalInstallments: [1, [Validators.required, Validators.min(1)]],
      startDate: [today, [Validators.required]],
      frequency: ['Quincenal', [Validators.required]],
      deductStock: [true],
      warehouseId: [1, [Validators.required]],
    });
  }

  ngOnInit() {
    this.loadCustomers();
    this.loadProducts();
    this.loadWarehouses();
  }

  async loadWarehouses() {
    if (this.moduleAccess && !this.moduleAccess.hasModule('inventory')) {
      const local = this.warehouseService.getLocalWarehouses();
      const list = local.length > 0 ? local : [this.warehouseService.createDefaultMainWarehouse()];
      this.warehouses.set(list);
      const currentWhId = this.receivableForm.get('warehouseId')?.value || list[0].id;
      this.selectedWarehouseId.set(currentWhId);
      this.receivableForm.patchValue({ warehouseId: currentWhId }, { emitEvent: false });
      return;
    }

    try {
      const res = await this.warehouseService.getWarehouses();
      if (res?.success && res.data && res.data.length > 0) {
        this.warehouses.set(res.data);
        const main = res.data.find((w) => w.isMain) || res.data[0];
        const currentWhId = this.receivableForm.get('warehouseId')?.value || main.id;
        this.selectedWarehouseId.set(currentWhId);
        this.receivableForm.patchValue({ warehouseId: currentWhId }, { emitEvent: false });
        await this.loadWarehouseStock(currentWhId);
      }
    } catch {
      const local = this.warehouseService.getLocalWarehouses();
      const list = local.length > 0 ? local : [this.warehouseService.createDefaultMainWarehouse()];
      this.warehouses.set(list);
    }
  }

  async loadWarehouseStock(warehouseId: number) {
    if (this.moduleAccess && !this.moduleAccess.hasModule('inventory')) {
      return;
    }
    try {
      const stockRes = await this.stockService.getStock({ warehouseId });
      const map = new Map<number, number>();
      if (stockRes?.success && stockRes.data) {
        for (const item of stockRes.data) {
          map.set(item.productId, item.quantity);
        }
      }
      this.warehouseStockMap.set(map);
    } catch {
      // Stock not available for warehouse
    }
  }

  onWarehouseChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const whId = Number(select.value);
    if (!whId) return;
    this.selectedWarehouseId.set(whId);
    this.receivableForm.patchValue({ warehouseId: whId });
    this.loadWarehouseStock(whId);
  }

  getProductStock(productId?: number): number {
    if (productId == null) return 0;
    return this.warehouseStockMap().get(productId) ?? 0;
  }

  getSelectedWarehouseName(): string {
    const whId = Number(this.receivableForm.get('warehouseId')?.value) || this.selectedWarehouseId();
    const found = this.warehouses().find((w) => w.id === whId);
    return found?.name || (whId ? `Almacén #${whId}` : 'Sin almacén asignado');
  }

  async loadCustomers() {
    try {
      const res = await this.customerService.getCustomers({
        pageNumber: 1,
        pageSize: 100,
      });
      if (res.success && res.data) {
        this.customers.set(res.data);
      }
    } catch (e: any) {
      console.error('Error loading customers:', e);
    }
  }

  async loadProducts() {
    try {
      const res = await this.productService.getPagedProducts(1, 100);
      if (res.success && res.data) {
        const items = res.data.items || (Array.isArray(res.data) ? res.data : []);
        this.products.set(items);
      }
    } catch (e: any) {
      console.error('Error loading products:', e);
    }
  }

  open() {
    this.visible = true;
    this.visibleChange.emit(true);
    this.loadCustomers();
    this.loadProducts();
    this.loadWarehouses();
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.resetForm();
  }

  resetForm() {
    this.currentStep.set(1);
    const today = new Date().toISOString().split('T')[0];
    const mainWh = this.warehouses().find((w) => w.isMain) || this.warehouses()[0];
    const defaultWhId = mainWh ? mainWh.id : 1;
    this.selectedWarehouseId.set(defaultWhId);

    this.isQuickCustomer.set(false);
    this.productMode.set('catalog');
    this.selectedItems.set([]);
    this.tempProductId.set(null);
    this.tempProductName.set('');
    this.tempQuantity.set(1);
    this.tempUnitPrice.set(0);

    this.receivableForm.reset({
      customerId: '',
      quickCustomerName: '',
      quickCustomerIdentification: '',
      quickCustomerPhone: '',
      customerPhone: '',
      customerEmail: '',
      description: '',
      totalAmount: 0,
      downPayment: 0,
      installmentAmount: 0,
      totalInstallments: 1,
      startDate: today,
      frequency: 'Quincenal',
      deductStock: true,
      warehouseId: defaultWhId,
    });
  }

  canAdvanceFromStep1(): boolean {
    const val = this.receivableForm.value;
    const hasCustomer = this.isQuickCustomer()
      ? !!val.quickCustomerName?.trim()
      : !!val.customerId;

    if (!hasCustomer) {
      this.notificationService.warning('Selecciona o registra un cliente para continuar.');
      return false;
    }

    if (!val.description?.trim()) {
      this.receivableForm.patchValue({ description: 'Venta a crédito de mercancía' });
    }

    return true;
  }

  goToStep(targetStep: 1 | 2 | 3) {
    if (targetStep === this.currentStep()) return;

    if (targetStep > 1 && this.currentStep() === 1) {
      if (!this.canAdvanceFromStep1()) return;
    }

    if (targetStep === 3) {
      const items = this.selectedItems();
      if (items.length > 0) {
        const itemsTotal = items.reduce((acc, it) => acc + it.subtotal, 0);
        this.receivableForm.patchValue({ totalAmount: itemsTotal });
      }
      this.calculateInstallments();
    }

    this.currentStep.set(targetStep);
  }

  nextStep() {
    if (this.currentStep() === 1) {
      this.goToStep(2);
    } else if (this.currentStep() === 2) {
      this.goToStep(3);
    }
  }

  prevStep() {
    if (this.currentStep() === 3) {
      this.goToStep(2);
    } else if (this.currentStep() === 2) {
      this.goToStep(1);
    }
  }

  toggleQuickCustomer() {
    const nextState = !this.isQuickCustomer();
    this.isQuickCustomer.set(nextState);
    if (nextState) {
      this.receivableForm.patchValue({ customerId: '' });
    }
  }

  onCustomerSelect(event: Event) {
    const select = event.target as HTMLSelectElement;
    const cId = Number(select.value);
    if (!cId) return;

    const customer = this.customers().find((c) => c.id === cId);
    if (customer) {
      this.receivableForm.patchValue({
        customerPhone: customer.phone || '',
        customerEmail: customer.email || '',
      });
    }
  }

  async saveQuickCustomer() {
    const name = this.receivableForm.get('quickCustomerName')?.value?.trim();
    const identification = this.receivableForm.get('quickCustomerIdentification')?.value?.trim();
    const phone = this.receivableForm.get('quickCustomerPhone')?.value?.trim();

    if (!name) {
      this.notificationService.warning('El nombre del cliente es obligatorio.');
      return;
    }

    this.isSavingCustomer.set(true);
    try {
      const res = await this.customerService.createCustomer({
        name,
        identification: identification || null,
        phone: phone || null,
        active: true,
      });

      if (res.success && res.data) {
        const newCust = res.data;
        this.customers.update((list) => [newCust, ...list]);
        this.receivableForm.patchValue({
          customerId: newCust.id,
          customerPhone: newCust.phone || phone || '',
          quickCustomerName: '',
          quickCustomerIdentification: '',
          quickCustomerPhone: '',
        });
        this.isQuickCustomer.set(false);
        this.notificationService.success(`Cliente "${newCust.name}" registrado y seleccionado exitosamente.`);
      } else {
        // Fallback: create locally
        const mockId = Math.floor(Math.random() * 9000) + 1000;
        const fallbackCust: CustomerDto = {
          id: mockId,
          name,
          identification: identification || null,
          phone: phone || null,
          active: true,
        };
        this.customers.update((list) => [fallbackCust, ...list]);
        this.receivableForm.patchValue({
          customerId: mockId,
          customerPhone: phone || '',
        });
        this.isQuickCustomer.set(false);
        this.notificationService.success(`Cliente "${name}" registrado para esta venta.`);
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSavingCustomer.set(false);
    }
  }

  setProductMode(mode: 'catalog' | 'custom') {
    this.productMode.set(mode);
    this.tempProductId.set(null);
    this.tempProductName.set('');
    this.tempUnitPrice.set(0);
    this.tempQuantity.set(1);
  }

  onProductSelectChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const pId = Number(select.value);
    if (!pId) {
      this.tempProductId.set(null);
      this.tempUnitPrice.set(0);
      return;
    }

    this.tempProductId.set(pId);
    const prod = this.products().find((p) => p.id === pId);
    if (prod) {
      const defaultPrice = prod.cost ? Math.round(prod.cost * 1.3 * 100) / 100 : 0;
      this.tempUnitPrice.set(defaultPrice);
    }
  }

  getSelectedProduct(): ProductDto | undefined {
    const pId = this.tempProductId();
    if (!pId) return undefined;
    return this.products().find((p) => p.id === pId);
  }

  addProduct() {
    const mode = this.productMode();
    const qty = Number(this.tempQuantity()) || 0;
    const price = Number(this.tempUnitPrice()) || 0;

    if (qty <= 0) {
      this.notificationService.warning('La cantidad debe ser mayor a 0.');
      return;
    }
    if (price < 0) {
      this.notificationService.warning('El precio no puede ser negativo.');
      return;
    }

    let pId = 0;
    let pName = '';
    let pBarCode: string | undefined = undefined;
    let pCost: number | undefined = undefined;

    if (mode === 'catalog') {
      const selectedId = this.tempProductId();
      if (!selectedId) {
        this.notificationService.warning('Selecciona un producto del catálogo.');
        return;
      }
      const prod = this.products().find((p) => p.id === selectedId);
      if (!prod) return;

      pId = prod.id || selectedId;
      pName = prod.description || 'Producto sin nombre';
      pBarCode = prod.barcode || undefined;
      pCost = prod.cost;
    } else {
      // Custom product of any type
      const customName = this.tempProductName().trim();
      if (!customName) {
        this.notificationService.warning('Escribe el nombre o descripción del producto/servicio.');
        return;
      }
      pId = -(Date.now() % 100000); // Unique negative ID for custom items
      pName = customName;
      pCost = price;
    }

    const currentItems = [...this.selectedItems()];
    const existingIndex = currentItems.findIndex(
      (it) => (it.productId === pId && pId > 0) || it.productName.toLowerCase() === pName.toLowerCase()
    );

    if (existingIndex > -1) {
      currentItems[existingIndex].quantity += qty;
      currentItems[existingIndex].unitPrice = price;
      currentItems[existingIndex].subtotal = currentItems[existingIndex].quantity * price;
    } else {
      currentItems.push({
        productId: pId,
        productName: pName,
        quantity: qty,
        unitPrice: price,
        subtotal: qty * price,
        barCode: pBarCode,
        cost: pCost,
      });
    }

    this.selectedItems.set(currentItems);

    // Recalculate total amount from items
    const newTotal = currentItems.reduce((acc, it) => acc + it.subtotal, 0);
    this.receivableForm.patchValue({ totalAmount: newTotal });

    // Auto-suggest description if empty
    if (!this.receivableForm.get('description')?.value) {
      const desc = currentItems.map((it) => `${it.quantity}x ${it.productName}`).join(', ');
      this.receivableForm.patchValue({ description: desc });
    }

    // Reset temporary inputs
    this.tempProductId.set(null);
    this.tempProductName.set('');
    this.tempQuantity.set(1);
    this.tempUnitPrice.set(0);

    this.calculateInstallments();
  }

  incrementItemQty(index: number) {
    const currentItems = [...this.selectedItems()];
    if (currentItems[index]) {
      currentItems[index].quantity += 1;
      currentItems[index].subtotal = currentItems[index].quantity * currentItems[index].unitPrice;
      this.selectedItems.set(currentItems);
      const newTotal = currentItems.reduce((acc, it) => acc + it.subtotal, 0);
      this.receivableForm.patchValue({ totalAmount: newTotal });
      this.calculateInstallments();
    }
  }

  decrementItemQty(index: number) {
    const currentItems = [...this.selectedItems()];
    if (currentItems[index] && currentItems[index].quantity > 1) {
      currentItems[index].quantity -= 1;
      currentItems[index].subtotal = currentItems[index].quantity * currentItems[index].unitPrice;
      this.selectedItems.set(currentItems);
      const newTotal = currentItems.reduce((acc, it) => acc + it.subtotal, 0);
      this.receivableForm.patchValue({ totalAmount: newTotal });
      this.calculateInstallments();
    }
  }

  removeProduct(index: number) {
    const currentItems = [...this.selectedItems()];
    currentItems.splice(index, 1);
    this.selectedItems.set(currentItems);

    const newTotal = currentItems.reduce((acc, it) => acc + it.subtotal, 0);
    this.receivableForm.patchValue({ totalAmount: newTotal });
    this.calculateInstallments();
  }

  calculateInstallments() {
    const total = parseFloat(this.receivableForm.get('totalAmount')?.value) || 0;
    const downPayment = parseFloat(this.receivableForm.get('downPayment')?.value) || 0;
    const remaining = Math.max(0, total - downPayment);
    const installments =
      parseInt(this.receivableForm.get('totalInstallments')?.value, 10) || 1;

    if (installments > 0) {
      const perInstallment = (remaining / installments).toFixed(2);
      this.receivableForm.patchValue(
        { installmentAmount: parseFloat(perInstallment) },
        { emitEvent: false },
      );
    }
  }

  async saveReceivable() {
    if (this.receivableForm.invalid) {
      this.receivableForm.markAllAsTouched();
      return;
    }

    const val = this.receivableForm.value;
    let customerName = 'Cliente General';
    let customerId = val.customerId ? Number(val.customerId) : undefined;

    // If quick customer is filled and not saved yet, register them
    if (this.isQuickCustomer() && val.quickCustomerName?.trim()) {
      try {
        const createRes = await this.customerService.createCustomer({
          name: val.quickCustomerName.trim(),
          identification: val.quickCustomerIdentification?.trim() || null,
          phone: val.quickCustomerPhone?.trim() || null,
          active: true,
        });
        if (createRes.success && createRes.data) {
          customerName = createRes.data.name;
          customerId = createRes.data.id;
        } else {
          customerName = val.quickCustomerName.trim();
        }
      } catch {
        customerName = val.quickCustomerName.trim();
      }
    } else if (customerId) {
      const c = this.customers().find((item) => item.id === customerId);
      if (c) customerName = c.name;
    }

    const downPayment = parseFloat(val.downPayment) || 0;
    const total = parseFloat(val.totalAmount) || 0;

    if (downPayment > total) {
      this.notificationService.warning('El abono inicial no puede ser mayor al monto total.');
      return;
    }

    this.isLoading.set(true);

    try {
      const selectedWhId = Number(val.warehouseId) || this.selectedWarehouseId() || 1;
      const selectedWhName = this.getSelectedWarehouseName();

      const res = await this.receivableService.createReceivable({
        customerId,
        customerName,
        customerPhone: val.quickCustomerPhone || val.customerPhone || null,
        customerEmail: val.customerEmail || null,
        description: val.description,
        totalAmount: total,
        downPayment: downPayment,
        deductStock: val.deductStock !== false,
        warehouseId: selectedWhId,
        warehouseName: selectedWhName,
        totalInstallments: parseInt(val.totalInstallments, 10),
        installmentAmount: parseFloat(val.installmentAmount),
        startDate: val.startDate,
        frequency: val.frequency,
        items: this.selectedItems(),
      });

      if (res.success) {
        this.notificationService.success(
          'Venta por cobrar creada exitosamente.',
        );
        this.saved.emit();
        this.close();
      } else {
        this.notificationService.error(
          res.message || 'Error al crear la venta por cobrar.',
        );
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}

