import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SaleService } from '../../services/sale.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { ProductService } from '../../../products/services/product.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import type { SaleResponseDto, CustomerDto } from '../../../cuadreEnv/types/api';
import { IconDirective } from '@coreui/icons-angular';
import { CreateSaleModalComponent } from './create-sale-modal.component';
import { SaleDetailModalComponent } from './sale-detail-modal.component';
import { NewSaleChoiceModalComponent } from './new-sale-choice-modal.component';
import { QuickSaleModalComponent } from '../../../cash-register/components/cash-register/quick-sale-modal.component';
import { CreateReceivableModalComponent } from '../receivables/create-receivable-modal.component';
import { CreateServiceSaleModalComponent } from './create-service-sale-modal.component';
import {
  SaleCompletedModalComponent,
  type CompletedSaleDto,
} from './sale-completed-modal.component';
import { CreditNoteFormComponent } from '../credit-notes/credit-note-form.component';
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
  selector: 'app-sales',
  templateUrl: './sales.component.html',
  standalone: true,
  imports: [
    CommonModule,
    AlertComponent,
    SpinnerComponent,
    CreateSaleModalComponent,
    SaleDetailModalComponent,
    NewSaleChoiceModalComponent,
    QuickSaleModalComponent,
    CreateReceivableModalComponent,
    CreateServiceSaleModalComponent,
    SaleCompletedModalComponent,
    CreditNoteFormComponent,
    FilterPanelComponent,
    KtPaginatorComponent,
  ],
})
export class SalesComponent implements OnInit {
  @ViewChild('newSaleChoiceModal') newSaleChoiceModal!: NewSaleChoiceModalComponent;
  @ViewChild('quickSaleModal') quickSaleModal!: QuickSaleModalComponent;
  @ViewChild('createReceivableModal') createReceivableModal!: CreateReceivableModalComponent;
  @ViewChild('createServiceSaleModal') createServiceSaleModal!: CreateServiceSaleModalComponent;
  @ViewChild('createSaleModal') createSaleModal!: CreateSaleModalComponent;
  @ViewChild('saleCompletedModal') saleCompletedModal!: SaleCompletedModalComponent;
  @ViewChild('creditNoteFormModal') creditNoteFormModal!: CreditNoteFormComponent;

  readonly translationService = inject(TranslationService);

  sales = signal<SaleResponseDto[]>([]);
  customers = signal<CustomerDto[]>([]);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  filters = signal<FilterValues>({});
  currentPage = signal<number>(1);
  pageSize = 10;
  totalItems = signal<number>(0);
  expandedSaleId = signal<number | null>(null);

  readonly filterConfig = computed<FilterConfig[]>(() => [
    {
      key: 'search',
      label: this.translationService.t('sales.filterSearch'),
      type: 'text',
      placeholder: this.translationService.t('sales.filterSearch'),
    },
    {
      key: 'status',
      label: this.translationService.t('sales.filterStatus'),
      type: 'select',
      options: [
        { label: this.translationService.t('sales.filterAll'), value: '' },
        {
          label: this.translationService.t('sales.filterProcessed'),
          value: 'processed',
        },
        {
          label: this.translationService.t('sales.filterCancelled'),
          value: 'cancelled',
        },
      ],
    },
    {
      key: 'channel',
      label: 'Canal / Origen',
      type: 'select',
      options: [
        { label: 'Todos los canales', value: '' },
        { label: 'Ventas en Caja (POS)', value: 'caja' },
        { label: 'Ventas Directas', value: 'direct' },
        { label: '🛠️ Ventas de Servicios', value: 'servicio' },
      ],
    },
    {
      key: 'amount',
      label: this.translationService.t('sales.filterAmount'),
      type: 'numberRange',
      placeholder: this.translationService.t('filterPanel.from'),
    },
  ]);

  isChoiceModalOpen = false;
  isQuickSaleModalOpen = false;
  isCreateReceivableModalOpen = false;
  isCreateServiceModalOpen = false;
  isCreateModalOpen = false;
  isDetailModalOpen = false;
  isSaleCompletedModalOpen = false;
  lastCompletedSale: CompletedSaleDto | null = null;
  selectedSale: SaleResponseDto | null = null;
  private productsMap = new Map<number, any>();

  constructor(
    private saleService: SaleService,
    private customerService: CustomerService,
    private productService: ProductService,
    public authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [sRes, cRes, pRes] = await Promise.all([
        this.saleService.getSales(),
        this.customerService.getCustomers({
          pageNumber: 1,
          pageSize: 100,
        }),
        this.productService.getPagedProducts(1, 100).catch(() => ({ success: false, data: null })),
      ]);

      if (sRes.success && sRes.data) {
        this.sales.set(sRes.data);
        this.totalItems.set(this.getFilteredSalesCount());
      }

      if (cRes.success && cRes.data) {
        this.customers.set(cRes.data);
      }

      if (pRes?.success && pRes.data?.items) {
        this.productsMap.clear();
        for (const prod of pRes.data.items) {
          if (prod.id) {
            this.productsMap.set(prod.id, prod);
          }
        }
      }
    } catch (e: any) {
      this.errorMessage.set(
        e?.response?.data?.message || e?.message || 'Error loading sales.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  onFiltersChange(values: FilterValues) {
    this.filters.set(values);
    this.currentPage.set(1);
    this.totalItems.set(this.getFilteredSalesCount());
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  readonly filteredSalesBase = computed(() => {
    const activeFilters = this.filters();
    const search = String((activeFilters['search'] as string | undefined) || '')
      .trim()
      .toLowerCase();
    const status = String(
      (activeFilters['status'] as string | undefined) || '',
    );
    const channel = String(
      (activeFilters['channel'] as string | undefined) || '',
    );

    const amountObj = activeFilters['amount'] as { from?: any; to?: any } | undefined;
    const amountMin =
      activeFilters['amount_min'] !== undefined && activeFilters['amount_min'] !== ''
        ? Number(activeFilters['amount_min'])
        : amountObj?.from !== undefined && amountObj?.from !== null && amountObj?.from !== ''
        ? Number(amountObj.from)
        : null;

    const amountMax =
      activeFilters['amount_max'] !== undefined && activeFilters['amount_max'] !== ''
        ? Number(activeFilters['amount_max'])
        : amountObj?.to !== undefined && amountObj?.to !== null && amountObj?.to !== ''
        ? Number(amountObj.to)
        : null;

    return this.sales().filter((sale) => {
      if (search) {
        const idMatch = String(sale.id).includes(search) || (`#${sale.id}`).includes(search);
        const invMatch = (sale.invoiceNumber || '').toLowerCase().includes(search);
        const clientNameMatch = (sale.customerName || '').toLowerCase().includes(search);
        const cust = this.customers().find((c) => c.id === sale.customerId);
        const custMatch =
          cust?.name?.toLowerCase().includes(search) ||
          (cust?.identification && cust.identification.includes(search));
        const regMatch = (sale.cashRegisterName || `caja #${sale.cashRegisterId}`).toLowerCase().includes(search);
        const methodMatch = (sale.paymentMethod || '').toLowerCase().includes(search);
        const notesMatch = ((sale as any).notes || '').toLowerCase().includes(search);

        const itemsMatch = (sale.details || (sale as any).items || []).some((d: any) => {
          const pName = (d.productName || d.description || '').toLowerCase();
          const pCode = (d.productCode || d.barcode || '').toLowerCase();
          return pName.includes(search) || pCode.includes(search) || String(d.productId).includes(search);
        });

        if (!idMatch && !invMatch && !clientNameMatch && !custMatch && !regMatch && !methodMatch && !notesMatch && !itemsMatch) {
          return false;
        }
      }

      if (status) {
        const isCancelled = (sale as any).isCancelled;
        if (status === 'cancelled' && !isCancelled) return false;
        if (status === 'processed' && isCancelled) return false;
      }

      if (channel) {
        const isServicio = this.isServicioSale(sale);
        if (channel === 'servicio' && !isServicio) return false;
        if (channel === 'caja' && (!sale.cashRegisterId || isServicio)) return false;
        if (channel === 'direct' && (sale.cashRegisterId || isServicio)) return false;
      }

      const totalVal = Number(sale.total) || 0;
      if (amountMin !== null && !isNaN(amountMin) && totalVal < amountMin) {
        return false;
      }
      if (amountMax !== null && !isNaN(amountMax) && totalVal > amountMax) {
        return false;
      }

      return true;
    });
  });

  readonly pagedSales = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredSalesBase().slice(start, start + this.pageSize);
  });

  getFilteredSalesCount(): number {
    return this.filteredSalesBase().length;
  }

  async toggleDetail(sale: SaleResponseDto) {
    if (this.expandedSaleId() === sale.id) {
      this.expandedSaleId.set(null);
      return;
    }
    this.expandedSaleId.set(sale.id);

    // Cargar detalles reales de la API /Sale/:id si no están precargados
    if ((!sale.details || sale.details.length === 0) && sale.id) {
      try {
        const res = await this.saleService.getSale(sale.id);
        if (res.success && res.data) {
          const fetchedDetails = res.data.details || (res.data as any).items || (res.data as any).saleDetails || [];
          if (fetchedDetails.length > 0) {
            this.sales.update((list) =>
              list.map((s) => (s.id === sale.id ? { ...s, details: fetchedDetails } : s))
            );
          }
        }
      } catch (err) {
        console.warn('Error fetching sale details for #' + sale.id, err);
      }
    }
  }

  isSaleExpanded(saleId: number): boolean {
    return this.expandedSaleId() === saleId;
  }

  isServicioSale(sale: any): boolean {
    if (!sale) return false;
    if (sale.originChannel === 'SERVICIO' || sale.originChannel === 'SERVICE' || sale.originChannel === 3) {
      return true;
    }
    if (typeof sale.notes === 'string') {
      const upperNotes = sale.notes.toUpperCase();
      if (
        upperNotes.includes('[SERVICIO]') ||
        upperNotes.includes('VENTA DE SERVICIO') ||
        upperNotes.includes('SERVICIOS #') ||
        upperNotes.includes('MANO DE OBRA')
      ) {
        return true;
      }
    }
    if (typeof sale.invoiceNumber === 'string' && sale.invoiceNumber.toUpperCase().includes('SERV')) {
      return true;
    }
    const items = this.getSaleItems(sale);
    if (items && items.length > 0) {
      const hasServiceItem = items.some((it: any) => {
        if (it.isService === true || it.productTypeId === 2) return true;
        const code = String(it.productCode || it.code || '').toUpperCase();
        if (code.startsWith('SERV') || code.startsWith('SRV')) return true;
        const name = String(it.productName || it.name || it.description || '').toLowerCase();
        return name.includes('servicio') || name.includes('mano de obra') || name.includes('mantenimiento');
      });
      if (hasServiceItem) return true;
    }
    return false;
  }

  getSaleItems(sale: SaleResponseDto): any[] {
    let rawItems =
      sale.details && sale.details.length > 0
        ? sale.details
        : (sale as any).items && (sale as any).items.length > 0
        ? (sale as any).items
        : (sale as any).saleDetails && (sale as any).saleDetails.length > 0
        ? (sale as any).saleDetails
        : (sale as any).productDetails && (sale as any).productDetails.length > 0
        ? (sale as any).productDetails
        : [];

    if (rawItems.length === 0 && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('cuadreenv_local_sales_cache');
        if (raw) {
          const list = JSON.parse(raw);
          const cached = list.find((s: any) => s.id === sale.id);
          if (cached && Array.isArray(cached.details) && cached.details.length > 0) {
            rawItems = cached.details;
            sale.details = rawItems;
          }
        }
      } catch {}
    }

    if (rawItems.length === 0) {
      const total = Number(sale.total) || 0;
      const subtotal = Math.round((total / 1.18) * 100) / 100;
      const itbis = Math.round((total - subtotal) * 100) / 100;
      const parsedQty = Number((sale as any).quantity ?? (sale as any).totalItems ?? 1) || 1;
      const unitPrice = parsedQty > 1 ? Math.round((total / parsedQty) * 100) / 100 : total;
      return [
        {
          productId: (sale as any).productId || 1,
          productName: (sale as any).notes || (sale as any).description || `Venta rápida POS - ${sale.paymentMethod || 'Efectivo'}`,
          productCode: `PROD-${sale.id}`,
          unitPrice,
          quantity: parsedQty,
          discount: 0,
          subtotal,
          itbis,
          total,
        },
      ];
    }

    return rawItems.map((d: any) => {
      const pid = d.productId || d.id;
      const prodInfo = pid ? this.productsMap.get(Number(pid)) : null;

      const pName =
        d.productName ||
        prodInfo?.description ||
        d.description ||
        `Producto #${pid || 1}`;

      const pCode =
        d.productCode ||
        prodInfo?.barcode ||
        prodInfo?.reference ||
        d.barcode ||
        `PROD-${pid || 1}`;

      const qty = Number(d.quantity) || 1;
      const price = Number(d.unitPrice ?? d.price ?? (prodInfo?.price || 0)) || 0;
      const discount = Number(d.discountPercentage ?? d.discount ?? 0) || 0;

      // Desglose fiscal consistente con ITBIS 18% incluido
      const lineTotal = d.total ? Number(d.total) : Math.round((qty * price) * 100) / 100;
      const lineSubtotal = Math.round((lineTotal / 1.18) * 100) / 100;
      const lineItbis = Math.round((lineTotal - lineSubtotal) * 100) / 100;

      return {
        productId: pid || 1,
        productName: pName,
        productCode: pCode,
        quantity: qty,
        unitPrice: price,
        discount,
        subtotal: lineSubtotal,
        itbis: lineItbis,
        total: lineTotal,
      };
    });
  }

  getTotalQuantity(sale: SaleResponseDto): number {
    const items = this.getSaleItems(sale);
    return items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  }

  getCustomerName(customerId?: number | null): string {
    if (!customerId) return this.translationService.t('sales.table.unknownCustomer');
    const customer = this.customers().find((c) => c.id === customerId);
    return customer ? customer.name : this.translationService.t('sales.table.unknownCustomer');
  }

  openQuickSaleDirect() {
    this.router.navigate(['/sales/quick']);
  }

  openCreateModal() {
    if (this.newSaleChoiceModal) {
      this.newSaleChoiceModal.open();
    } else {
      this.isCreateModalOpen = true;
    }
  }

  onSaleOptionChosen(option: 'quick' | 'credit' | 'service') {
    if (option === 'quick') {
      this.router.navigate(['/sales/quick']);
    } else if (option === 'credit') {
      if (this.createReceivableModal) {
        this.createReceivableModal.open();
      }
    } else if (option === 'service') {
      this.router.navigate(['/sales/service']);
    }
  }

  openDetailModal(sale: SaleResponseDto) {
    this.selectedSale = sale;
    this.isDetailModalOpen = true;
  }

  openInvoiceForSale(sale: SaleResponseDto) {
    const cust = this.customers().find((c) => c.id === sale.customerId);
    const rawItems =
      sale.details && sale.details.length > 0
        ? sale.details
        : (sale as any).items && (sale as any).items.length > 0
        ? (sale as any).items
        : (sale as any).saleDetails && (sale as any).saleDetails.length > 0
        ? (sale as any).saleDetails
        : (sale as any).productDetails && (sale as any).productDetails.length > 0
        ? (sale as any).productDetails
        : [
            {
              productId: (sale as any).productId || 1,
              productName: (sale as any).notes || (sale as any).description || `Venta #${sale.id}`,
              productCode: `VTA-${sale.id}`,
              unitPrice: sale.total,
              quantity: 1,
              total: sale.total,
            },
          ];

    const invoiceDto: CompletedSaleDto = {
      id: sale.id,
      invoiceNumber: `VTA-${String(sale.id).padStart(6, '0')}`,
      date: sale.creationDate,
      customerName: cust?.name || 'Consumidor final',
      customerRnc: cust?.identification || '000-0000000-0',
      cashRegisterName: sale.cashRegisterId ? `Caja #${sale.cashRegisterId}` : 'Venta Directa',
      cashierName: 'Admin',
      paymentMethod: sale.paidAmount >= sale.total ? 'Efectivo / Contado' : 'Crédito',
      subtotal: Math.round((sale.total / 1.18) * 100) / 100,
      discount: 0,
      itbis: Math.round((sale.total - (sale.total / 1.18)) * 100) / 100,
      total: sale.total,
      amountReceived: sale.paidAmount,
      change: Math.max(0, sale.paidAmount - sale.total),
      items: rawItems.map((d: any) => ({
        productId: d.productId || d.id || 1,
        productName: d.productName || d.description || `Producto #${d.productId || d.id || 1}`,
        productCode: d.productCode || d.barcode || `PROD-${d.productId || d.id || 1}`,
        unitPrice: Number(d.unitPrice ?? d.price ?? 0) || 0,
        quantity: Number(d.quantity ?? 1) || 1,
        total: (Number(d.quantity ?? 1) || 1) * (Number(d.unitPrice ?? d.price ?? 0) || 0),
      })),
    };

    this.lastCompletedSale = invoiceDto;
    if (this.saleCompletedModal) {
      this.saleCompletedModal.open(invoiceDto);
    } else {
      this.isSaleCompletedModalOpen = true;
    }
  }

  onQuickSaleCompleted(data: CompletedSaleDto) {
    this.lastCompletedSale = data;
    this.loadData();
    if (this.saleCompletedModal) {
      this.saleCompletedModal.open(data);
    } else {
      this.isSaleCompletedModalOpen = true;
    }
  }

  openCreditNoteForSale(sale: SaleResponseDto) {
    const formattedId = `VTA-${String(sale.id).padStart(6, '0')}`;
    if (this.creditNoteFormModal) {
      this.creditNoteFormModal.open(formattedId);
    }
  }

  onSaleCreated() {
    this.loadData();
  }
}
