import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PurchaseService } from '../../services/purchase.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { ModuleAccessService } from '../../../cuadreEnv/services/module-access.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import type { PurchaseDto } from '../../../cuadreEnv/types/api';
import { IconDirective } from '@coreui/icons-angular';
import { PurchaseModalComponent } from './purchase-modal.component';
import {
  FilterPanelComponent,
  type FilterConfig,
  type FilterValues,
} from '../../../cuadreEnv/components/filter-panel/filter-panel.component';
import {
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  ContainerComponent,
  AlertComponent,
  SpinnerComponent,
} from '@coreui/angular';
import { TableComponent } from '../../../cuadreEnv/components/table/table.component';
import { ListPaginationComponent } from '../../../cuadreEnv/components/list-pagination/list-pagination.component';

import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';

@Component({
  selector: 'app-purchases',
  templateUrl: './purchases.component.html',
  standalone: true,
  imports: [
    CommonModule,
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

  readonly canManualReceive = computed(() => this.moduleAccess.hasModule('purchases-receipts'));
  readonly canAutoReceive = computed(() =>
    this.authService.hasRole(['Admin', 'SuperAdmin', 'Supervisor', 'Manager']) ||
    this.authService.isSuperUser() ||
    this.authService.hasPermission('purchases:create') ||
    this.moduleAccess.hasModule('purchases-receipts')
  );

  purchases = signal<PurchaseDto[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  filters = signal<FilterValues>({});
  currentPage = signal<number>(1);
  pageSize = 10;
  totalItems = signal<number>(0);
  expandedPurchaseId = signal<number | null>(null);

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

  constructor(
    private purchaseService: PurchaseService,
    public authService: AuthService,
  ) {}

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const purRes = await this.purchaseService.getPurchases();
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
    this.selectedPurchase = null;
    this.isModalOpen = true;
    setTimeout(() => {
      if (this.purchaseModal) this.purchaseModal.openCreate();
    });
  }

  private router = inject(Router);

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
