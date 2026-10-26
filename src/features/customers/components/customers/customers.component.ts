import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CustomerService } from '../../services/customer.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import type { CustomerDto } from '../../../cuadreEnv/types/api';
import { IconDirective } from '@coreui/icons-angular';
import { CustomerModalComponent } from './customer-modal.component';
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
  selector: 'app-customers',
  templateUrl: './customers.component.html',
  standalone: true,
  imports: [
    CommonModule,
    AlertComponent,
    SpinnerComponent,
    CustomerModalComponent,
    FilterPanelComponent,
    KtPaginatorComponent,
  ],
})
export class CustomersComponent implements OnInit {
  @ViewChild('customerModal') customerModal!: CustomerModalComponent;

  readonly translationService = inject(TranslationService);
  private confirmService = inject(ConfirmDialogService);

  customers = signal<CustomerDto[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  filters = signal<FilterValues>({});
  currentPage = signal<number>(1);
  pageSize = 10;
  totalItems = signal<number>(0);

  readonly filterConfig = computed<FilterConfig[]>(() => [
    {
      key: 'search',
      label: this.translationService.t('customers.filterSearch'),
      type: 'text',
      placeholder: this.translationService.t('customers.filterSearch'),
    },
    {
      key: 'status',
      label: this.translationService.t('customers.filterStatus'),
      type: 'select',
      options: [
        {
          label: this.translationService.t('customers.filterAll'),
          value: '',
        },
        {
          label: this.translationService.t('customers.filterActive'),
          value: 'active',
        },
        {
          label: this.translationService.t('customers.filterInactive'),
          value: 'inactive',
        },
      ],
    },
  ]);

  get columns() {
    return [
      {
        field: 'id',
        label: 'ID',
      },
      {
        field: 'name',
        label: this.translationService.t('customers.table.name') + ' / Identificación',
      },
      {
        field: 'email',
        label: this.translationService.t('customers.table.email') + ' / Teléfono',
      },
      {
        field: 'status',
        label: 'Estado',
        align: 'center',
      },
      {
        field: 'actions',
        label: this.translationService.t('common.actions'),
        align: 'center',
      },
    ];
  }

  isModalOpen = false;

  constructor(
    private customerService: CustomerService,
    public authService: AuthService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit() {
    this.loadCustomers();
  }

  loadData() {
    this.loadCustomers();
  }

  async loadCustomers() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const res = await this.customerService.getCustomers({
        pageNumber: 1,
        pageSize: 100,
      });
      if (res.success && res.data) {
        this.customers.set(res.data);
        this.totalItems.set(this.getFilteredCustomersCount());
      } else {
        this.errorMessage.set(res.message || 'Failed to load customers.');
      }
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      this.errorMessage.set(mapped.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  onFiltersChange(values: FilterValues) {
    this.filters.set(values);
    this.currentPage.set(1);
    this.totalItems.set(this.getFilteredCustomersCount());
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  readonly filteredCustomersBase = computed(() => {
    const activeFilters = this.filters();
    const search = String((activeFilters['search'] as string | undefined) || '')
      .trim()
      .toLowerCase();
    const status = String(
      (activeFilters['status'] as string | undefined) || '',
    ).trim();

    return this.customers().filter((customer) => {
      const haystack = [
        customer.name,
        customer.identification,
        customer.email,
        customer.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const isActive = customer.active !== false;
      const matchesStatus =
        !status ||
        (status === 'active' && isActive) ||
        (status === 'inactive' && !isActive);

      return matchesSearch && matchesStatus;
    });
  });

  readonly filteredCustomersCount = computed(() => this.filteredCustomersBase().length);

  readonly pagedCustomers = computed(() => {
    return this.filteredCustomersBase().slice(
      (this.currentPage() - 1) * this.pageSize,
      this.currentPage() * this.pageSize,
    );
  });

  getFilteredCustomersCount(): number {
    return this.filteredCustomersCount();
  }

  getFilteredCustomers(): CustomerDto[] {
    return this.pagedCustomers();
  }

  openCreateModal() {
    this.isModalOpen = true;
    setTimeout(() => {
      if (this.customerModal) this.customerModal.openCreate();
    });
  }

  openEditModal(customer: CustomerDto) {
    this.isModalOpen = true;
    setTimeout(() => {
      if (this.customerModal) this.customerModal.openEdit(customer);
    });
  }

  async deleteCustomer(id: number) {
    const customer = this.customers().find((c) => c.id === id);
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar cliente?',
      message: '¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.',
      itemName: customer?.name || `Cliente #${id}`,
      itemType: 'Cliente',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      await this.customerService.deleteCustomer(id);
      this.notificationService.success('Cliente eliminado exitosamente.');
      this.loadCustomers();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleCustomerStatus(customer: CustomerDto) {
    if (!customer.id) return;
    const newStatus = customer.active === false;
    const actionLabel = newStatus ? 'activar' : 'desactivar';

    const confirmed = await this.confirmService.confirm({
      title: `¿${newStatus ? 'Activar' : 'Desactivar'} cliente?`,
      message: `¿Estás seguro de que deseas ${actionLabel} al cliente "${customer.name}"?`,
      itemName: customer.name,
      itemType: 'Cliente',
      confirmText: newStatus ? 'Activar' : 'Desactivar',
      variant: newStatus ? 'primary' : 'warning',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      await this.customerService.updateCustomer({
        ...customer,
        active: newStatus
      });
      this.notificationService.success(`Cliente "${customer.name}" ${newStatus ? 'activado' : 'desactivado'} exitosamente.`);
      await this.loadCustomers();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}

