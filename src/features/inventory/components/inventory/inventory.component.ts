import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { InventoryService } from '../../services/inventory.service';
import { ProductService } from '../../../products/services/product.service';
import { UnitOfMeasurementService, type UnitOfMeasurement } from '../../../products/services/unit-of-measurement.service';
import { ProductPackagingService, type ProductPackaging } from '../../../products/services/product-packaging.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { WarehouseDto, ProductDto, MovementDto } from '../../../cuadreEnv/types/api';
import { IconDirective } from '@coreui/icons-angular';
import { TableComponent } from '../../../cuadreEnv/components/table/table.component';
import {
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  ColComponent,
  ContainerComponent,
  FormControlDirective,
  FormDirective,
  RowComponent,
  AlertComponent,
  SpinnerComponent,
  FormSelectDirective,
} from '@coreui/angular';
import {
  SectionNavComponent,
  type SectionNavItem,
} from '../../../cuadreEnv/components/section-nav/section-nav.component';

import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { ListPaginationComponent } from '../../../cuadreEnv/components/list-pagination/list-pagination.component';

@Component({
  selector: 'app-inventory',
  templateUrl: './inventory.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ContainerComponent,
    RowComponent,
    ColComponent,
    CardComponent,
    CardBodyComponent,
    ButtonDirective,
    FormControlDirective,
    FormDirective,
    IconDirective,
    AlertComponent,
    SpinnerComponent,
    FormSelectDirective,
    SectionNavComponent,
    TableComponent,
    ListPaginationComponent,
  ],
})
export class InventoryComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  private readonly notificationService = inject(NotificationService);
  readonly packagingService = inject(ProductPackagingService);
  readonly unitService = inject(UnitOfMeasurementService);

  activeTab = signal<string>('warehouses');

  warehouses = signal<WarehouseDto[]>([]);
  products = signal<ProductDto[]>([]);
  movements = signal<MovementDto[]>([]);
  lowStockItems = signal<ProductDto[]>([]);
  units = signal<UnitOfMeasurement[]>([]);

  // Movement Filters
  movementTypeFilter = signal<string>('');
  movementWarehouseFilter = signal<string>('');
  movementSearchFilter = signal<string>('');

  // Movements pagination
  movementsPage = signal<number>(1);
  movementsPageSize = 10;

  // Low stock pagination (client-side)
  lowStockPage = signal<number>(1);
  lowStockPageSize = 10;
  lowStockTotal = signal<number>(0);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  get sectionItems(): SectionNavItem[] {
    return [
      { label: this.translationService.t('inventory.title'), value: 'warehouses', icon: 'cilBuilding' },
      { label: this.translationService.t('dashboard.regStock'), value: 'operations', icon: 'cilTransfer' },
      { label: this.translationService.t('inventory.movementsTab'), value: 'movements', icon: 'cilList' },
      {
        label: this.translationService.t('dashboard.lowStockCount'),
        value: 'lowstock',
        icon: 'cilWarning',
      },
    ];
  }

  warehouseForm: FormGroup;
  inboundForm: FormGroup;
  outboundForm: FormGroup;
  transferForm: FormGroup;

  constructor(
    private inventoryService: InventoryService,
    private productService: ProductService,
    private fb: FormBuilder,
    public authService: AuthService,
  ) {
    this.warehouseForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
    });

    this.inboundForm = this.fb.group({
      productId: ['', [Validators.required]],
      warehouseId: ['', [Validators.required]],
      inboundMode: ['units'], // 'units' | 'package'
      packageQuantity: [1, [Validators.min(1)]],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
    });

    this.outboundForm = this.fb.group({
      productId: ['', [Validators.required]],
      warehouseId: ['', [Validators.required]],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
    });

    this.transferForm = this.fb.group(
      {
        productId: ['', [Validators.required]],
        fromWarehouseId: ['', [Validators.required]],
        toWarehouseId: ['', [Validators.required]],
        quantity: [1, [Validators.required, Validators.min(0.01)]],
      },
      { validators: this.differentWarehousesValidator },
    );
  }

  getProductUnitSymbol(product: ProductDto): string {
    const u = this.units().find(unit => unit.id === product.unitOfMeasurementId);
    return u?.symbol || 'und';
  }

  getProductPackaging(product: ProductDto): ProductPackaging | undefined {
    return product.id ? this.packagingService.getPackaging(product.id) : undefined;
  }

  getEquivalenceText(product: ProductDto): string | null {
    if (!product.id) return null;
    const symbol = this.getProductUnitSymbol(product);
    return this.packagingService.getEquivalenceText(product.id, product.stock || 0, symbol);
  }

  getSelectedInboundProduct(): ProductDto | undefined {
    const pId = Number(this.inboundForm.get('productId')?.value);
    return this.products().find(p => p.id === pId);
  }

  getInboundCalculatedUnits(): number {
    const formVal = this.inboundForm.value;
    const prod = this.getSelectedInboundProduct();
    if (!prod || !prod.id) return Number(formVal.quantity) || 0;
    const pkg = this.packagingService.getPackaging(prod.id);
    if (formVal.inboundMode === 'package' && pkg && pkg.hasPackaging) {
      const packs = Number(formVal.packageQuantity) || 0;
      return Math.round(packs * (pkg.packageUnitsCount || 1) * 100) / 100;
    }
    return Number(formVal.quantity) || 0;
  }

  differentWarehousesValidator(g: FormGroup) {
    const from = g.get('fromWarehouseId')?.value;
    const to = g.get('toWarehouseId')?.value;
    return from && to && from === to ? { sameWarehouse: true } : null;
  }

  ngOnInit() {
    this.loadData();
    this.unitService.getUnitsOfMeasurement().then(res => {
      if (res?.data && Array.isArray(res.data)) {
        this.units.set(res.data);
      }
    });
  }

  async loadData() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      // Load warehouses
      const whRes = await this.inventoryService.getWarehouses();
      if (whRes.success && whRes.data) {
        this.warehouses.set(whRes.data);
      }

      // Load products (tangible goods only - services have zero inventory management)
      const pRes = await this.productService.getPagedProducts(1, 100);
      if (pRes.success && pRes.data) {
        const tangibles = (pRes.data.items || []).filter(
          p => p.productTypeId !== 2 && !(p as any).isService && (p as any).productType?.name !== 'Servicio'
        );
        this.products.set(tangibles);
      }

      // Load movements logs
      await this.loadMovements();

      // Load low stock alerts (tangibles only)
      const lRes = await this.inventoryService.getLowStock();
      if (lRes.success && lRes.data) {
        const arr = (lRes.data || []).filter(
          p => p.productTypeId !== 2 && !(p as any).isService && (p as any).productType?.name !== 'Servicio'
        );
        this.lowStockItems.set(arr);
        this.lowStockTotal.set(arr.length);
      }
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      this.errorMessage.set(mapped.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(tabName: string) {
    this.activeTab.set(tabName);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  async createWarehouse() {
    if (this.warehouseForm.invalid) {
      this.warehouseForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    try {
      const name = this.warehouseForm.value.name;
      const res = await this.inventoryService.createWarehouse(name);
      if (res.success) {
        this.notificationService.success('Almacén creado exitosamente.');
        this.warehouseForm.reset();
        this.loadData();
      } else {
        this.notificationService.error(res.message || 'Error al crear almacén.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onInboundSubmit() {
    if (this.inboundForm.invalid) {
      this.inboundForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const val = this.inboundForm.value;
    const pId = parseInt(val.productId, 10);
    const wId = parseInt(val.warehouseId, 10);
    const qty = this.getInboundCalculatedUnits();

    try {
      const res = await this.inventoryService.addStock({
        productId: pId,
        warehouseId: wId,
        quantity: qty,
      });

      if (res.success) {
        this.notificationService.success('Entrada de inventario registrada exitosamente.');
        // Local movement prepend for immediate visibility
        this.movements.update((prev) => [
          {
            id: Math.max(1, ...prev.map((m) => m.id)) + 1,
            productId: pId,
            fromWarehouseId: null,
            toWarehouseId: wId,
            quantity: qty,
            type: 'Inbound',
          },
          ...prev,
        ]);

        this.inboundForm.reset({ quantity: 1, productId: '', warehouseId: '' });
        this.loadData();
      } else {
        this.notificationService.error(res.message || 'Error al registrar entrada de stock.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onOutboundSubmit() {
    if (this.outboundForm.invalid) {
      this.outboundForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const val = this.outboundForm.value;
    const pId = parseInt(val.productId, 10);
    const wId = parseInt(val.warehouseId, 10);
    const qty = parseInt(val.quantity, 10);

    try {
      const res = await this.inventoryService.removeStock({
        productId: pId,
        warehouseId: wId,
        quantity: qty,
      });

      if (res.success) {
        this.notificationService.success('Salida de inventario registrada exitosamente.');
        // Local movement prepend for immediate visibility
        this.movements.update((prev) => [
          {
            id: Math.max(1, ...prev.map((m) => m.id)) + 1,
            productId: pId,
            fromWarehouseId: wId,
            toWarehouseId: null,
            quantity: qty,
            type: 'Outbound',
          },
          ...prev,
        ]);

        this.outboundForm.reset({ quantity: 1, productId: '', warehouseId: '' });
        this.loadData();
      } else {
        this.notificationService.error(res.message || 'Error al registrar salida de stock.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onTransferSubmit() {
    if (this.transferForm.invalid) {
      this.transferForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const val = this.transferForm.value;
    const pId = parseInt(val.productId, 10);
    const fromId = parseInt(val.fromWarehouseId, 10);
    const toId = parseInt(val.toWarehouseId, 10);
    const qty = parseInt(val.quantity, 10);

    try {
      const res = await this.inventoryService.transferStock({
        productId: pId,
        fromWarehouseId: fromId,
        toWarehouseId: toId,
        quantity: qty,
      });

      if (res.success) {
        this.notificationService.success('Transferencia entre almacenes realizada exitosamente.');
        // Local movement prepend for immediate visibility
        this.movements.update((prev) => [
          {
            id: Math.max(1, ...prev.map((m) => m.id)) + 1,
            productId: pId,
            fromWarehouseId: fromId,
            toWarehouseId: toId,
            quantity: qty,
            type: 'Transfer',
          },
          ...prev,
        ]);

        this.transferForm.reset({ quantity: 1, productId: '', fromWarehouseId: '', toWarehouseId: '' });
        this.loadData();
      } else {
        this.notificationService.error(res.message || 'Error al transferir inventario.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  getProductName(productId: number): string {
    const p = this.products().find((item) => item.id === productId);
    return p ? p.description || 'Producto' : `Producto #${productId}`;
  }

  getWarehouseName(warehouseId?: number | null): string {
    if (!warehouseId) return '-';
    const w = this.warehouses().find((item) => item.id === warehouseId);
    return w ? w.name : `Almacén #${warehouseId}`;
  }

  formatMovementType(type: any): { label: string; badgeClass: string } {
    const str = String(type || '').trim().toLowerCase();
    if (str === 'inbound' || str === 'entrada' || str === 'entry' || str === '1') {
      return {
        label: 'Entrada (Inbound)',
        badgeClass: 'badge bg-success-subtle text-success border border-success',
      };
    }
    if (str === 'outbound' || str === 'salida' || str === 'exit' || str === '2') {
      return {
        label: 'Salida (Outbound)',
        badgeClass: 'badge bg-danger-subtle text-danger border border-danger',
      };
    }
    if (str === 'transfer' || str === 'transferencia' || str === '3') {
      return {
        label: 'Transferencia',
        badgeClass: 'badge bg-primary-subtle text-primary border border-primary',
      };
    }
    return {
      label: type || 'Movimiento',
      badgeClass: 'badge bg-secondary-subtle text-secondary border',
    };
  }

  async loadMovements() {
    try {
      const res = await this.inventoryService.getMovements();
      if (res.success && res.data) {
        const pagedData = res.data as any;
        if (pagedData.items) {
          this.movements.set(pagedData.items);
        } else {
          const arr = Array.isArray(res.data) ? res.data : [];
          this.movements.set(arr);
        }
      }
    } catch (e: any) {
      console.error('Error loading movements:', e);
    }
  }

  // Filtered movements
  readonly filteredMovements = computed(() => {
    let list = this.movements();
    const type = this.movementTypeFilter().toLowerCase().trim();
    const whId = parseInt(this.movementWarehouseFilter(), 10);
    const search = this.movementSearchFilter().toLowerCase().trim();

    if (type) {
      list = list.filter((m) => {
        const mType = String(m.type || '').toLowerCase();
        if (type === 'inbound') return mType === 'inbound' || mType === 'entrada' || mType === '1';
        if (type === 'outbound') return mType === 'outbound' || mType === 'salida' || mType === '2';
        if (type === 'transfer') return mType === 'transfer' || mType === 'transferencia' || mType === '3';
        return mType.includes(type);
      });
    }

    if (whId) {
      list = list.filter(
        (m) => m.fromWarehouseId === whId || m.toWarehouseId === whId,
      );
    }

    if (search) {
      list = list.filter((m) => {
        const prodName = this.getProductName(m.productId).toLowerCase();
        return (
          prodName.includes(search) ||
          String(m.id).includes(search) ||
          String(m.quantity).includes(search)
        );
      });
    }

    return list;
  });

  readonly filteredMovementsTotal = computed(() => this.filteredMovements().length);

  readonly pagedMovements = computed(() => {
    const start = (this.movementsPage() - 1) * this.movementsPageSize;
    return this.filteredMovements().slice(start, start + this.movementsPageSize);
  });

  get paginatedLowStockItems(): ProductDto[] {
    const start = (this.lowStockPage() - 1) * this.lowStockPageSize;
    return this.lowStockItems().slice(start, start + this.lowStockPageSize);
  }

  onMovementsPageChange(page: number) {
    this.movementsPage.set(page);
  }

  onLowStockPageChange(page: number) {
    this.lowStockPage.set(page);
  }
}

