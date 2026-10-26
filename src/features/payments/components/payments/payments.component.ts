import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PaymentService } from '../../services/payment.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import type { PaymentDto, PurchaseDto } from '../../../cuadreEnv/types/api';
import { IconDirective } from '@coreui/icons-angular';
import { PaymentModalComponent } from './payment-modal.component';
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

import { PurchaseService } from '../../../purchases/services/purchase.service';
import { SupplierService } from '../../../purchases/services/supplier.service';

@Component({
  selector: 'app-payments',
  templateUrl: './payments.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ContainerComponent,
    CardComponent,
    CardBodyComponent,
    TableComponent,
    ButtonDirective,
    IconDirective,
    AlertComponent,
    SpinnerComponent,
    PaymentModalComponent,
    FilterPanelComponent,
    ListPaginationComponent,
  ],
})
export class PaymentsComponent implements OnInit {
  @ViewChild('paymentModal') paymentModal!: PaymentModalComponent;

  readonly translationService = inject(TranslationService);
  private confirmService = inject(ConfirmDialogService);
  private purchaseService = inject(PurchaseService);
  private supplierService = inject(SupplierService);

  activeTab = signal<'payments' | 'pending'>('payments');

  payments = signal<PaymentDto[]>([]);
  purchases = signal<PurchaseDto[]>([]);
  suppliers = signal<any[]>([]);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  filters = signal<FilterValues>({});
  currentPage = signal<number>(1);
  pageSize = 10;
  totalItems = signal<number>(0);

  // Computeds for KPI Cards
  readonly supplierPayments = computed(() => {
    return this.payments().filter((p) => p.purchaseId || (!p.saleId && !p.purchaseId));
  });

  readonly totalPaidToSuppliers = computed(() => {
    return this.supplierPayments().reduce((acc, p) => acc + (p.amount || 0), 0);
  });

  readonly pendingPurchasesList = computed(() => {
    const pays = this.payments();
    return this.purchases().map((pur) => {
      const purPayments = pays.filter((p) => p.purchaseId === pur.id);
      const paid = purPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const balance = Math.max(0, (pur.total || 0) - paid);
      return {
        ...pur,
        paidAmount: paid,
        balance,
        isFullyPaid: balance <= 0.01,
      };
    });
  });

  readonly totalPendingAmount = computed(() => {
    return this.pendingPurchasesList().reduce((acc, p) => acc + (p.balance || 0), 0);
  });

  readonly countPendingPurchases = computed(() => {
    return this.pendingPurchasesList().filter((p) => !p.isFullyPaid).length;
  });

  readonly filterConfig = computed<FilterConfig[]>(() => [
    {
      key: 'search',
      label: this.translationService.t('payments.filterSearch'),
      type: 'text',
      placeholder: 'Buscar por referencia, ID...',
    },
    {
      key: 'method',
      label: 'Método de Pago',
      type: 'select',
      options: [
        { label: 'Todos los métodos', value: '' },
        { label: 'Transferencia', value: 'Transferencia' },
        { label: 'Tarjeta', value: 'Tarjeta' },
        { label: 'Cheque', value: 'Cheque' },
        { label: 'Efectivo', value: 'Efectivo' },
      ],
    },
  ]);

  isModalOpen = false;

  columns = [
    { field: 'id', label: '#' },
    { field: 'creationDate', label: 'Fecha' },
    { field: 'target', label: 'Destino / Proveedor' },
    { field: 'method', label: 'Método' },
    { field: 'reference', label: 'Referencia / Detalle' },
    { field: 'amount', label: 'Monto' },
    { field: 'actions', label: 'Acciones' },
  ];

  pendingColumns = [
    { field: 'id', label: 'No. Factura' },
    { field: 'date', label: 'Fecha' },
    { field: 'supplier', label: 'Proveedor' },
    { field: 'total', label: 'Total Factura' },
    { field: 'paid', label: 'Abonado' },
    { field: 'balance', label: 'Balance Pendiente' },
    { field: 'status', label: 'Estado' },
    { field: 'actions', label: 'Acción' },
  ];

  constructor(
    private paymentService: PaymentService,
    public authService: AuthService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const [payRes, purRes, supRes] = await Promise.all([
        this.paymentService.getPayments(),
        this.purchaseService.getPurchases(),
        this.supplierService.getSuppliers(),
      ]);

      if (payRes?.success && payRes.data) {
        this.payments.set(payRes.data);
      }
      if (purRes?.success && purRes.data) {
        this.purchases.set(purRes.data);
      }
      if (supRes?.success && supRes.data) {
        this.suppliers.set(supRes.data);
      }
      this.totalItems.set(this.getFilteredPaymentsCount());
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      this.errorMessage.set(mapped.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  getSupplierName(supplierId?: number | null): string {
    if (!supplierId) return 'Proveedor General';
    const s = this.suppliers().find((sup) => sup.id === supplierId);
    return s ? s.name : `Proveedor #${supplierId}`;
  }

  getPurchaseSupplier(purchaseId?: number | null): string {
    if (!purchaseId) return '-';
    const p = this.purchases().find((pur) => pur.id === purchaseId);
    return p ? this.getSupplierName(p.supplierId) : `Orden #${purchaseId}`;
  }

  paySpecificPurchase(purchaseId: number) {
    this.isModalOpen = true;
    setTimeout(() => {
      if (this.paymentModal) {
        this.paymentModal.openCreate(purchaseId);
      }
    });
  }

  onFiltersChange(values: FilterValues) {
    this.filters.set(values);
    this.currentPage.set(1);
    this.totalItems.set(this.getFilteredPaymentsCount());
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  readonly filteredPaymentsBase = computed(() => {
    const activeFilters = this.filters();
    const search = String((activeFilters['search'] as string | undefined) || '')
      .trim()
      .toLowerCase();
    const type = String(
      (activeFilters['type'] as string | undefined) || '',
    ).trim();

    return this.payments().filter((payment) => {
      const haystack = [
        payment.id?.toString() || '',
        payment.saleId ? `sale #${payment.saleId}` : '',
        payment.purchaseId ? `purchase #${payment.purchaseId}` : '',
        payment.reference || '',
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesType =
        !type ||
        (type === 'sale' && Boolean(payment.saleId)) ||
        (type === 'purchase' && Boolean(payment.purchaseId));

      return matchesSearch && matchesType;
    });
  });

  readonly filteredPaymentsCount = computed(() => this.filteredPaymentsBase().length);

  readonly pagedPayments = computed(() => {
    return this.filteredPaymentsBase().slice(
      (this.currentPage() - 1) * this.pageSize,
      this.currentPage() * this.pageSize,
    );
  });

  getFilteredPaymentsCount(): number {
    return this.filteredPaymentsCount();
  }

  getFilteredPayments(): PaymentDto[] {
    return this.pagedPayments();
  }

  openCreateModal() {
    this.isModalOpen = true;
    setTimeout(() => {
      if (this.paymentModal) this.paymentModal.openCreate();
    });
  }

  async deletePayment(id: number) {
    const payment = this.payments().find((p) => p.id === id);
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar registro de pago?',
      message: '¿Estás seguro de que deseas eliminar esta transacción de pago? Los balances relacionados se recalcularán.',
      itemName: payment?.reference ? `Pago #${id} (Ref: ${payment.reference})` : `Pago #${id} - \$${payment?.amount || 0}`,
      itemType: 'Transacción de Pago',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      await this.paymentService.deletePayment(id);
      this.notificationService.success('Transacción de pago eliminada exitosamente.');
      this.loadData();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}

