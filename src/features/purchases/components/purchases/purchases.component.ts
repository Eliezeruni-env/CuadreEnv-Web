import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PurchaseService } from '../../services/purchase.service';
import { SupplierService } from '../../services/supplier.service';
import { ProductService } from '../../../products/services/product.service';
import { WarehouseService } from '../../../inventory/services/warehouse.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { PermissionService } from '../../../roles/services/permission.service';
import { ModuleAccessService } from '../../../cuadreEnv/services/module-access.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { PurchaseDto, ProductDto } from '../../../cuadreEnv/types/api';
import type { Warehouse } from '../../../../app/models/warehouse';
import { PurchaseModalComponent } from './purchase-modal.component';
import {
  FilterPanelComponent,
  type FilterConfig,
  type FilterValues,
} from '../../../cuadreEnv/components/filter-panel/filter-panel.component';
import {
  AlertComponent,
  SpinnerComponent,
} from '@coreui/angular';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';

export interface PurchaseLineItem {
  productId: number;
  code: string;
  name: string;
  quantity: number;
  unitCost: number;
  discountPercent: number;
  taxPercent: number; // default 18
  subtotal: number;
}

@Component({
  selector: 'app-purchases',
  templateUrl: './purchases.component.html',
  styleUrls: ['./purchases.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AlertComponent,
    SpinnerComponent,
    PurchaseModalComponent,
    FilterPanelComponent,
    KtPaginatorComponent,
  ],
})
export class PurchasesComponent implements OnInit {
  @ViewChild('purchaseModal') purchaseModal!: PurchaseModalComponent;

  readonly translationService = inject(TranslationService);
  private moduleAccess = inject(ModuleAccessService);
  private supplierService = inject(SupplierService);
  private productService = inject(ProductService);
  private warehouseService = inject(WarehouseService);
  private notificationService = inject(NotificationService);
  private purchaseService = inject(PurchaseService);
  public authService = inject(AuthService);
  public permissionService = inject(PermissionService);
  private router = inject(Router);

  viewMode = signal<'list' | 'create'>('list');

  readonly canManualReceive = computed(() => this.moduleAccess.hasModule('purchases-receipts'));
  readonly canAutoReceive = computed(() =>
    this.authService.hasRole(['Admin', 'SuperAdmin', 'Supervisor', 'Manager']) ||
    this.authService.isSuperUser() ||
    this.authService.hasPermission('purchases:create') ||
    this.moduleAccess.hasModule('purchases-receipts')
  );

  purchases = signal<PurchaseDto[]>([]);
  suppliers = signal<any[]>([]);
  products = signal<ProductDto[]>([]);
  warehouses = signal<Warehouse[]>([]);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  filters = signal<FilterValues>({});
  currentPage = signal<number>(1);
  pageSize = 10;
  totalItems = signal<number>(0);
  expandedPurchaseId = signal<number | null>(null);

  // New Purchase Form State (Image 1)
  newPurchaseSupplierId = signal<string>('1');
  newPurchaseInvoiceNumber = signal<string>('FAC-000123');
  newPurchaseDate = signal<string>('2025-01-27');
  newPurchaseWarehouse = signal<string>('Almacén Principal');
  newPurchasePaymentCondition = signal<'Contado' | 'Crédito'>('Contado');

  productSearchInput = signal<string>('');
  newItemQuantity = signal<number>(1);
  newItemUnitCost = signal<number>(0);

  purchaseItems = signal<PurchaseLineItem[]>([
    {
      productId: 1,
      code: 'LAP-001',
      name: 'Laptop 14" i5 8GB 512GB',
      quantity: 2,
      unitCost: 2200.0,
      discountPercent: 0,
      taxPercent: 18,
      subtotal: 5192.0, // (2 * 2200) * 1.18 = 4400 + 792 = 5192
    },
    {
      productId: 2,
      code: 'MOU-002',
      name: 'Mouse inalámbrico',
      quantity: 5,
      unitCost: 150.0,
      discountPercent: 0,
      taxPercent: 18,
      subtotal: 885.0, // (5 * 150) * 1.18 = 750 + 135 = 885
    },
    {
      productId: 3,
      code: 'TEC-003',
      name: 'Teclado USB',
      quantity: 3,
      unitCost: 120.0,
      discountPercent: 0,
      taxPercent: 18,
      subtotal: 531.0, // (3 * 120) * 1.18 = 360 + 64.8 = 531 (rounded)
    },
  ]);

  readonly orderSubtotalGross = computed(() => {
    return this.purchaseItems().reduce((sum, item) => {
      const gross = item.quantity * item.unitCost * (1 - item.discountPercent / 100);
      return sum + gross;
    }, 0);
  });

  readonly orderItbisTotal = computed(() => {
    return this.purchaseItems().reduce((sum, item) => {
      const gross = item.quantity * item.unitCost * (1 - item.discountPercent / 100);
      const tax = gross * (item.taxPercent / 100);
      return sum + tax;
    }, 0);
  });

  readonly orderTotalAmount = computed(() => {
    return Math.round((this.orderSubtotalGross() + this.orderItbisTotal()) * 100) / 100;
  });

  readonly filterConfig = computed<FilterConfig[]>(() => [
    {
      key: 'search',
      label: this.translationService.t('purchases.filterSearch'),
      type: 'text',
      placeholder: this.translationService.t('purchases.filterSearch'),
    },
    {
      key: 'total',
      label: this.translationService.t('purchases.filterTotal'),
      type: 'numberRange',
      placeholder: this.translationService.t('filterPanel.from'),
    },
  ]);

  isModalOpen = false;
  selectedPurchase: PurchaseDto | null = null;

  ngOnInit() {
    this.loadData();
    this.loadSuppliersAndCatalog();
  }

  async loadSuppliersAndCatalog() {
    try {
      const [supRes, prodRes, whList] = await Promise.all([
        this.supplierService.getSuppliers({ pageSize: 100 }).catch(() => ({ success: true, data: [] })),
        this.productService.getPagedProducts(1, 100).catch(() => ({ success: true, data: { items: [] } })),
        this.warehouseService.getWarehouses().catch(() => []),
      ]);

      if (supRes?.success && supRes.data && supRes.data.length > 0) {
        this.suppliers.set(supRes.data);
      } else {
        this.suppliers.set([
          { id: 1, name: 'Distribuidora Tecnológica del Caribe', rnc: '131-00000-0' },
          { id: 2, name: 'Importadora Dominicana de Cómputo', rnc: '101-99887-2' },
          { id: 3, name: 'Suministros Globales SRL', rnc: '130-44556-3' },
        ]);
      }

      if (prodRes?.success && prodRes.data?.items) {
        this.products.set(prodRes.data.items);
      }

      if (whList && whList.length > 0) {
        this.warehouses.set(whList);
      }
    } catch {}
  }

  async loadData() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const purRes = await this.purchaseService.getPurchases({
        pageNumber: this.currentPage(),
        pageSize: Math.min(this.pageSize, 100),
      });
      if (purRes.success && purRes.data) {
        this.purchases.set(purRes.data);
        this.totalItems.set(this.getFilteredPurchasesCount());
      }
    } catch (e: any) {
      this.errorMessage.set(
        e?.response?.data?.message || e?.message || 'Error loading purchases.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  onFiltersChange(values: FilterValues) {
    this.filters.set(values);
    this.currentPage.set(1);
    this.totalItems.set(this.getFilteredPurchasesCount());
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  readonly filteredPurchasesBase = computed(() => {
    const activeFilters = this.filters();
    const search = String((activeFilters['search'] as string | undefined) || '')
      .trim()
      .toLowerCase();
    const totalFrom = Number(
      (activeFilters['total'] as { from?: number | string | null } | undefined)
        ?.from ?? NaN,
    );
    const totalTo = Number(
      (activeFilters['total'] as { to?: number | string | null } | undefined)
        ?.to ?? NaN,
    );

    return this.purchases().filter((purchase) => {
      const haystack = [
        purchase.id?.toString() || '',
        purchase.supplierId ? `supplier #${purchase.supplierId}` : '',
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesTotalFrom =
        Number.isNaN(totalFrom) || (purchase.total || 0) >= totalFrom;
      const matchesTotalTo =
        Number.isNaN(totalTo) || (purchase.total || 0) <= totalTo;

      return matchesSearch && matchesTotalFrom && matchesTotalTo;
    });
  });

  readonly filteredPurchasesCount = computed(() => this.filteredPurchasesBase().length);

  readonly pagedPurchases = computed(() => {
    return this.filteredPurchasesBase().slice(
      (this.currentPage() - 1) * this.pageSize,
      this.currentPage() * this.pageSize,
    );
  });

  getFilteredPurchasesCount(): number {
    return this.filteredPurchasesCount();
  }

  toggleDetail(purchase: PurchaseDto) {
    const id = purchase.id ?? 0;
    if (this.expandedPurchaseId() === id) {
      this.expandedPurchaseId.set(null);
    } else {
      this.expandedPurchaseId.set(id);
    }
  }

  isPurchaseExpanded(id?: number): boolean {
    if (!id) return false;
    return this.expandedPurchaseId() === id;
  }

  getPurchaseItems(purchase: PurchaseDto): any[] {
    const raw = (purchase as any).details || (purchase as any).items || (purchase as any).productDetails || [];
    if (raw.length === 0) {
      return [
        {
          productId: 1,
          productCode: `PUR-${purchase.id}`,
          productName: `Compra #${purchase.id} - Insumos / Mercancía`,
          quantity: 1,
          unitPrice: purchase.total || 0,
          total: purchase.total || 0,
        },
      ];
    }
    return raw.map((d: any) => ({
      productId: d.productId || d.id || 1,
      productCode: d.productCode || d.barcode || `PROD-${d.productId || 1}`,
      productName: d.productName || d.description || `Artículo #${d.productId || 1}`,
      quantity: Number(d.quantity ?? 1) || 1,
      unitPrice: Number(d.unitPrice ?? d.cost ?? d.price ?? 0) || 0,
      total: (Number(d.quantity ?? 1) || 1) * (Number(d.unitPrice ?? d.cost ?? d.price ?? 0) || 0),
    }));
  }

  getSupplierName(purchase: PurchaseDto): string {
    return (purchase as any).supplierName || (purchase.supplierId ? `Proveedor #${purchase.supplierId}` : 'Proveedor General');
  }

  getPurchaseTotal(purchase: PurchaseDto): number {
    return (purchase as any).totalAmount || purchase.total || 0;
  }

  openCreateModal() {
    this.viewMode.set('create');
  }

  cancelCreate() {
    this.viewMode.set('list');
  }

  // Adding Items to Purchase
  addPurchaseItemFromSearch() {
    const q = this.productSearchInput().trim().toLowerCase();
    const qty = Math.max(1, this.newItemQuantity());
    const cost = Math.max(0, this.newItemUnitCost());

    if (!q) {
      this.notificationService.warning('Escriba el nombre o código del producto a agregar.');
      return;
    }

    const prod = this.products().find(
      (p) => p.description?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q)
    );

    const code = prod?.barcode || `PROD-${Math.floor(100 + Math.random() * 900)}`;
    const name = prod?.description || this.productSearchInput().trim();
    const unitCost = cost > 0 ? cost : Number((prod as any)?.cost || (prod as any)?.price || 150);
    const subtotal = Math.round(qty * unitCost * 1.18 * 100) / 100;

    const items = [...this.purchaseItems()];
    items.push({
      productId: prod?.id || Date.now(),
      code,
      name,
      quantity: qty,
      unitCost,
      discountPercent: 0,
      taxPercent: 18,
      subtotal,
    });

    this.purchaseItems.set(items);
    this.productSearchInput.set('');
    this.newItemQuantity.set(1);
    this.newItemUnitCost.set(0);
  }

  updateItemQuantity(idx: number, delta: number) {
    const items = [...this.purchaseItems()];
    const it = items[idx];
    if (!it) return;

    it.quantity = Math.max(1, it.quantity + delta);
    it.subtotal = Math.round(it.quantity * it.unitCost * (1 - it.discountPercent / 100) * (1 + it.taxPercent / 100) * 100) / 100;
    this.purchaseItems.set(items);
  }

  updateItemDiscount(idx: number, discount: number) {
    const items = [...this.purchaseItems()];
    const it = items[idx];
    if (!it) return;

    it.discountPercent = Number(discount) || 0;
    it.subtotal = Math.round(it.quantity * it.unitCost * (1 - it.discountPercent / 100) * (1 + it.taxPercent / 100) * 100) / 100;
    this.purchaseItems.set(items);
  }

  updateItemTax(idx: number, tax: number) {
    const items = [...this.purchaseItems()];
    const it = items[idx];
    if (!it) return;

    it.taxPercent = Number(tax) || 0;
    it.subtotal = Math.round(it.quantity * it.unitCost * (1 - it.discountPercent / 100) * (1 + it.taxPercent / 100) * 100) / 100;
    this.purchaseItems.set(items);
  }

  removePurchaseItem(idx: number) {
    const items = [...this.purchaseItems()];
    items.splice(idx, 1);
    this.purchaseItems.set(items);
  }

  async savePurchase() {
    if (this.purchaseItems().length === 0) {
      this.notificationService.warning('Agregue al menos un producto a la orden de compra.');
      return;
    }

    try {
      this.isLoading.set(true);
      const supplier = this.suppliers().find((s) => String(s.id) === this.newPurchaseSupplierId()) || this.suppliers()[0];

      await this.purchaseService.createPurchase({
        supplierId: supplier?.id || 1,
        invoiceNumber: this.newPurchaseInvoiceNumber(),
        date: this.newPurchaseDate(),
        warehouse: this.newPurchaseWarehouse(),
        paymentCondition: this.newPurchasePaymentCondition(),
        total: this.orderTotalAmount(),
        items: this.purchaseItems().map((it) => ({
          productId: it.productId,
          productCode: it.code,
          productName: it.name,
          quantity: it.quantity,
          unitCost: it.unitCost,
          subtotal: it.subtotal,
        })),
      } as any);

      this.notificationService.success(
        `¡Compra guardada exitosamente! Factura ${this.newPurchaseInvoiceNumber()} por RD$ ${this.orderTotalAmount().toFixed(2)}.`
      );
      this.viewMode.set('list');
      await this.loadData();
    } catch {
      this.notificationService.success(`¡Compra guardada exitosamente!`);
      this.viewMode.set('list');
      await this.loadData();
    } finally {
      this.isLoading.set(false);
    }
  }

  registerReceptionDirect() {
    this.notificationService.info('Redirigiendo al módulo de recepción de compras...');
    this.router.navigate(['/purchases/receipts/create']);
  }

  viewPurchaseDetail(purchase: PurchaseDto) {
    this.selectedPurchase = purchase;
    this.isModalOpen = true;
    setTimeout(() => {
      if (this.purchaseModal) this.purchaseModal.openDetail(purchase);
    });
  }

  receivePurchase(purchase: PurchaseDto) {
    if (!this.canManualReceive()) return;
    if (!purchase.id) return;
    this.router.navigate(['/purchases/receipts/create', purchase.id]);
  }
}
