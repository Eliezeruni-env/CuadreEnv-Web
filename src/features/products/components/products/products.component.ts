import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../services/product.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { ProductModalComponent } from './product-modal.component';
import { ProductImportModalComponent } from './product-import-modal.component';
import { ProductDetailModalComponent } from './product-detail-modal.component';
import {
  FilterPanelComponent,
  type FilterConfig,
  type FilterValues,
} from '../../../cuadreEnv/components/filter-panel/filter-panel.component';
import { AlertComponent, SpinnerComponent } from '@coreui/angular';

import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';

import { RouterLink } from '@angular/router';
import { ProductDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    AlertComponent,
    SpinnerComponent,
    ProductModalComponent,
    ProductImportModalComponent,
    ProductDetailModalComponent,
    FilterPanelComponent,
    KtPaginatorComponent,
  ],
})
export class ProductsComponent implements OnInit {
  @ViewChild('productModal') productModal!: ProductModalComponent;
  @ViewChild('importModal') importModal!: ProductImportModalComponent;
  @ViewChild('detailModal') detailModal!: ProductDetailModalComponent;

  selectedProductForDetail = signal<ProductDto | null>(null);
  isDetailModalOpen = signal<boolean>(false);

  readonly translationService = inject(TranslationService);
  readonly authService = inject(AuthService);
  private confirmService = inject(ConfirmDialogService);
  private notificationService = inject(NotificationService);

  openImportModal(): void {
    this.importModal?.open();
  }

  products = signal<ProductDto[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  expiringProducts = signal<{ product: ProductDto; daysRemaining: number }[]>(
    [],
  );
  showExpirationModal = signal<boolean>(false);

  lowStockCount = computed(
    () =>
      this.products().filter((p) => !this.isServiceItem(p) && this.getStockState(p) !== 'healthy').length,
  );
  totalInventoryValue = computed(() =>
    this.products().reduce((sum, p) => this.isServiceItem(p) ? sum : sum + (p.cost || 0) * (p.stock || 0), 0),
  );

  // Pagination & Stale Request Tracking
  currentPage = signal<number>(1);
  pageSize = 10;
  totalItems = signal<number>(0);
  pageCount = signal<number>(1);
  private latestRequestId = 0;

  filters = signal<FilterValues>({});
  readonly filterConfig = computed<FilterConfig[]>(() => [
    {
      key: 'search',
      label: this.translationService.t('products.filterSearch'),
      type: 'text',
      placeholder: this.translationService.t('products.filterSearch'),
    },
    {
      key: 'stock',
      label: this.translationService.t('products.filterStock'),
      type: 'numberRange',
      placeholder: this.translationService.t('filterPanel.from'),
    },
    {
      key: 'status',
      label: this.translationService.t('products.filterStatus'),
      type: 'select',
      options: [
        { label: this.translationService.t('products.filterAll'), value: '' },
        {
          label: this.translationService.t('products.filterInStock'),
          value: 'in-stock',
        },
        {
          label: this.translationService.t('products.filterLowStock'),
          value: 'low-stock',
        },
      ],
    },
  ]);

  isModalOpen = false;

  get columns() {
    return [
      {
        field: 'product',
        label: this.translationService.t('products.table.product'),
      },
      {
        field: 'reference',
        label: this.translationService.t('products.table.reference'),
      },
      {
        field: 'barcode',
        label: this.translationService.t('products.table.barcode'),
      },
      {
        field: 'cost',
        label: this.translationService.t('products.table.cost'),
        align: 'end',
      },
      {
        field: 'stock',
        label: this.translationService.t('products.table.stock'),
        align: 'end',
      },
      {
        field: 'actions',
        label: this.translationService.t('common.actions'),
        align: 'center',
      },
    ];
  }

  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.loadProducts();
  }

  async loadProducts() {
    const requestId = ++this.latestRequestId;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const activeFilters = this.filters();
    const search = String(
      (activeFilters['search'] as string | undefined) || '',
    ).trim();
    const validPage = Math.max(1, this.currentPage());
    const validSize = Math.min(100, Math.max(1, this.pageSize));

    try {
      const res = await this.productService.getPagedProducts(
        validPage,
        validSize,
        search || undefined,
      );

      // Cancelar o ignorar respuestas antiguas al escribir filtros rápidamente
      if (requestId !== this.latestRequestId) {
        return;
      }

      if (res.success && res.data) {
        let items = res.data.items || [];

        // Filtros adicionales por stock y estado
        const stockObj = activeFilters['stock'] as
          | { from?: any; to?: any }
          | undefined;
        const stockMin =
          activeFilters['stock_min'] !== undefined &&
          activeFilters['stock_min'] !== ''
            ? Number(activeFilters['stock_min'])
            : stockObj?.from !== undefined &&
                stockObj?.from !== null &&
                stockObj?.from !== ''
              ? Number(stockObj.from)
              : null;

        const stockMax =
          activeFilters['stock_max'] !== undefined &&
          activeFilters['stock_max'] !== ''
            ? Number(activeFilters['stock_max'])
            : stockObj?.to !== undefined &&
                stockObj?.to !== null &&
                stockObj?.to !== ''
              ? Number(stockObj.to)
              : null;

        const status = String(
          (activeFilters['status'] as string | undefined) || '',
        ).trim();

        if (stockMin !== null && !isNaN(stockMin)) {
          items = items.filter((p) => (p.stock || 0) >= stockMin);
        }
        if (stockMax !== null && !isNaN(stockMax)) {
          items = items.filter((p) => (p.stock || 0) <= stockMax);
        }

        if (status === 'in-stock') {
          items = items.filter(
            (p) => (p.stock || 0) > (p.minimumQuantity || 0),
          );
        } else if (status === 'low-stock') {
          items = items.filter(
            (p) => (p.stock || 0) <= (p.minimumQuantity || 0),
          );
        }

        this.products.set(items);
        this.totalItems.set(
          items.length < (res.data.items || []).length
            ? items.length
            : (res.data.totalItemCount ?? res.data.total ?? items.length),
        );
        this.pageCount.set(res.data.pageCount || 1);
        this.checkExpiringProducts();
      } else {
        // No tratar un listado vacío como error
        this.products.set([]);
        this.totalItems.set(0);
        this.pageCount.set(1);
      }
    } catch (e: any) {
      if (requestId === this.latestRequestId) {
        this.products.set([]);
        this.totalItems.set(0);
        this.pageCount.set(1);
        const mapped = this.notificationService.showApiError(e);
        this.errorMessage.set(mapped.message);
      }
    } finally {
      if (requestId === this.latestRequestId) {
        this.isLoading.set(false);
      }
    }
  }

  checkExpiringProducts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiring: { product: ProductDto; daysRemaining: number }[] = [];

    this.products().forEach((p) => {
      if (!p.expirationDate) return;
      const expDate = new Date(p.expirationDate);
      expDate.setHours(0, 0, 0, 0);
      if (isNaN(expDate.getTime())) return;

      const diffMs = expDate.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 3) {
        expiring.push({ product: p, daysRemaining: diffDays });
      }
    });

    this.expiringProducts.set(expiring);
    if (
      expiring.length > 0 &&
      !sessionStorage.getItem('cuadreenv_dismissed_expiration_alert')
    ) {
      this.showExpirationModal.set(true);
    }
  }

  dismissExpirationModal() {
    this.showExpirationModal.set(false);
    sessionStorage.setItem('cuadreenv_dismissed_expiration_alert', 'true');
  }

  openExpirationModalManually() {
    this.showExpirationModal.set(true);
  }

  onPageChange(page: number) {
    // No solicitar páginas menores que 1 ni mayores que pageCount
    if (page < 1 || page === this.currentPage()) return;
    const maxPage = Math.max(1, this.pageCount());
    if (page > maxPage) return;
    this.currentPage.set(page);
    this.loadProducts();
  }

  onFiltersChange(values: FilterValues) {
    this.filters.set(values);
    // Reiniciar pageNumber a 1 cuando cambie un filtro
    this.currentPage.set(1);
    this.loadProducts();
  }

  public isServiceItem(p: any): boolean {
    if (!p) return false;
    if (p.isService === true || p.type === 'service' || p.type === 'Servicio') return true;
    if (p.productTypeId === 2 || p.ProductTypeId === 2) return true;
    if (p.invoiceWithoutStock === true) return true;
    const code = String(p.barcode || p.reference || '').toUpperCase().trim();
    if (code.startsWith('SERV-') || code.startsWith('SERV')) return true;
    const typeName = String(p.productTypeName || p.productType?.name || '').toLowerCase();
    if (typeName.includes('serv')) return true;
    const catName = String(p.categoryName || p.category?.name || '').toLowerCase();
    if (catName.includes('serv')) return true;
    return false;
  }

  getStockState(product: ProductDto): 'healthy' | 'low' | 'critical' | 'service' {
    if (this.isServiceItem(product)) return 'service';
    const stock = product.stock || 0;
    const minimum = product.minimumQuantity || 0;
    if (stock <= 0) return 'critical';
    if (stock <= minimum) return 'low';
    return 'healthy';
  }

  getExpirationInfo(product: ProductDto): {
    status: 'expired' | 'today' | 'warning' | 'ok' | 'none';
    label: string;
    badgeClass: string;
  } {
    if (!product.expirationDate) {
      return { status: 'none', label: '', badgeClass: '' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expDate = new Date(product.expirationDate);
    expDate.setHours(0, 0, 0, 0);

    if (isNaN(expDate.getTime())) {
      return { status: 'none', label: '', badgeClass: '' };
    }

    const diffMs = expDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const daysAgo = Math.abs(diffDays);
      return {
        status: 'expired',
        label: `Vencido hace ${daysAgo} d`,
        badgeClass: 'bg-danger text-white',
      };
    } else if (diffDays === 0) {
      return {
        status: 'today',
        label: 'Vence hoy',
        badgeClass: 'bg-danger-subtle text-danger border border-danger',
      };
    } else if (diffDays <= 7) {
      return {
        status: 'warning',
        label: `Por vencer (${diffDays} d)`,
        badgeClass:
          'bg-warning-subtle text-warning-emphasis border border-warning',
      };
    }

    return {
      status: 'ok',
      label: `Vence: ${product.expirationDate.split('T')[0]}`,
      badgeClass: 'bg-light text-secondary border',
    };
  }

  readonly filteredProducts = computed(() => {
    const activeFilters = this.filters();
    const search = String((activeFilters['search'] as string | undefined) || '')
      .trim()
      .toLowerCase();
    const stockFrom = Number(
      (activeFilters['stock'] as { from?: number | string | null } | undefined)
        ?.from ?? NaN,
    );
    const stockTo = Number(
      (activeFilters['stock'] as { to?: number | string | null } | undefined)
        ?.to ?? NaN,
    );
    const status = String(
      (activeFilters['status'] as string | undefined) || '',
    ).trim();

    return this.products().filter((product) => {
      const matchesSearch =
        !search ||
        [
          product.description,
          product.reference,
          product.barcode,
          product.shortDescription,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search);

      const matchesStockFrom =
        Number.isNaN(stockFrom) || (product.stock || 0) >= stockFrom;
      const matchesStockTo =
        Number.isNaN(stockTo) || (product.stock || 0) <= stockTo;

      const state = this.getStockState(product);
      const matchesStatus =
        !status ||
        (status === 'in-stock' && state === 'healthy') ||
        (status === 'low-stock' && state !== 'healthy');

      return (
        matchesSearch && matchesStockFrom && matchesStockTo && matchesStatus
      );
    });
  });

  readonly filteredProductsCount = computed(
    () => this.filteredProducts().length,
  );

  readonly pagedProducts = computed(() => {
    // If backend pagination is already active, return the filtered products
    return this.filteredProducts();
  });

  getFilteredProducts(): ProductDto[] {
    return this.filteredProducts();
  }

  openDetailModal(product: ProductDto): void {
    this.selectedProductForDetail.set(product);
    this.isDetailModalOpen.set(true);
  }

  openCreateModal() {
    this.isModalOpen = true;
    setTimeout(() => {
      if (this.productModal) this.productModal.openCreate();
    });
  }

  async openEditModal(product: ProductDto) {
    this.isModalOpen = true;
    try {
      const res = await this.productService.getProduct(product.id!);
      if (res.success && res.data) {
        this.productModal.openEdit(res.data);
      } else {
        this.productModal.openEdit(product);
      }
    } catch {
      this.productModal.openEdit(product);
    }
  }

  async deleteProduct(product: ProductDto) {
    if (!product.id) return;
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar producto?',
      message:
        '¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.',
      itemName: product.description || `Producto #${product.id}`,
      itemType: 'Producto',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      const res = await this.productService.deleteProduct(product.id);
      if (res.success) {
        this.notificationService.success('Producto eliminado exitosamente.');
        this.loadProducts();
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}
