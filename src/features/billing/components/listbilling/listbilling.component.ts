import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BillingService } from '../../services/billing.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import {
  GenericFiltersComponent,
  BillingFilterValues,
} from '../generic-filters/generic-filters.component';
import { KtPaginatorComponent } from '../kt-paginator/kt-paginator.component';
import { SendInvoiceEmailModalComponent } from '../../../../app/shared/components/send-invoice-email-modal/send-invoice-email-modal.component';
import { NcfAlertBannerComponent } from '../ncf-alert-banner/ncf-alert-banner.component';
import {
  WarehouseMovementReceiptModalComponent,
  type MovementReceiptData,
} from '../../../../app/shared/components/warehouse-movement-receipt-modal/warehouse-movement-receipt-modal.component';
import { CompanyService } from '../../../companies/services/company.service';
import { RealtimeAlertService } from '../../../cuadreEnv/services/realtime-alert.service';
import type { Billing } from '../../../../app/models/billing';

@Component({
  selector: 'app-listbilling',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SendInvoiceEmailModalComponent,
    NcfAlertBannerComponent,
    WarehouseMovementReceiptModalComponent,
  ],
  templateUrl: './listbilling.component.html',
  styleUrls: ['./listbilling.component.scss'],
})
export class ListbillingComponent implements OnInit {
  private router = inject(Router);
  private billingService = inject(BillingService);
  private notificationService = inject(NotificationService);
  private realtimeAlertService = inject(RealtimeAlertService);
  readonly companyService = inject(CompanyService);

  billings = signal<Billing[]>([]);
  isLoading = signal<boolean>(false);

  filters: BillingFilterValues = {};
  searchQuery = signal<string>('');
  selectedStatusFilter = signal<string>('all');
  selectedOriginFilter = signal<string>('all');
  dateRangeFilter = signal<string>('01/11/2026 - 30/11/2026');

  // Active filter chips management
  activeStatusChip = signal<string | null>('Pagada');
  activeAmountChip = signal<string | null>('RD$ 500 – 15,000');

  currentPage = 1;
  pageSize = 10;

  // Sorting signals
  sortColumn = signal<string>('date');
  sortDirection = signal<'asc' | 'desc'>('desc');

  toggleSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  selectedInvoiceToPrint: Billing | null = null;
  isEmailModalOpen = false;
  selectedInvoiceForEmail: Billing | null = null;

  // Image 2 Universal Comprobante Modal
  isReceiptModalOpen = signal<boolean>(false);
  selectedReceiptData: MovementReceiptData | null = null;

  readonly filteredBillings = computed(() => {
    let list = this.billings();

    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(
        (b) =>
          (b.billingNumber || '').toLowerCase().includes(query) ||
          (b.ncf || '').toLowerCase().includes(query) ||
          (b.clientName || '').toLowerCase().includes(query) ||
          (b.billingTypeName || '').toLowerCase().includes(query),
      );
    }

    const origin = this.selectedOriginFilter();
    if (origin !== 'all') {
      list = list.filter((b) =>
        (b.billingTypeName || '').toLowerCase().includes(origin.toLowerCase()),
      );
    }

    const status = this.selectedStatusFilter();
    if (status !== 'all') {
      if (status === 'pagada') {
        list = list.filter(
          (b) =>
            b.statusId === 1 || (b.statusName || '').toLowerCase() === 'pagada',
        );
      }
    }

    if (this.filters.documentNumber) {
      const term = this.filters.documentNumber.toLowerCase().trim();
      list = list.filter(
        (b) =>
          (b.billingNumber || '').toLowerCase().includes(term) ||
          (b.ncf || '').toLowerCase().includes(term) ||
          (b.clientName || '').toLowerCase().includes(term),
      );
    }

    if (this.filters.clientId) {
      list = list.filter((b) => b.clientId === this.filters.clientId);
    }

    if (this.filters.statusId) {
      list = list.filter((b) => b.statusId === this.filters.statusId);
    }

    if (this.filters.startDate) {
      const start = new Date(this.filters.startDate).getTime();
      list = list.filter((b) => new Date(b.creationDate).getTime() >= start);
    }

    if (this.filters.endDate) {
      const end = new Date(this.filters.endDate).getTime();
      list = list.filter((b) => new Date(b.creationDate).getTime() <= end);
    }

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      switch (col) {
        case 'invoice':
          valA = a.billingNumber || String(a.id || '');
          valB = b.billingNumber || String(b.id || '');
          break;
        case 'date':
          valA = new Date(a.creationDate).getTime() || 0;
          valB = new Date(b.creationDate).getTime() || 0;
          break;
        case 'client':
          valA = (a.clientName || '').toLowerCase();
          valB = (b.clientName || '').toLowerCase();
          break;
        case 'origin':
          valA = (a.billingTypeName || '').toLowerCase();
          valB = (b.billingTypeName || '').toLowerCase();
          break;
        case 'total':
          valA = a.amountTotal || 0;
          valB = b.amountTotal || 0;
          break;
        case 'paid':
          valA = a.amountTotal || 0;
          valB = b.amountTotal || 0;
          break;
        case 'status':
          valA = (a.statusName || '').toLowerCase();
          valB = (b.statusName || '').toLowerCase();
          break;
        default:
          valA = new Date(a.creationDate).getTime() || 0;
          valB = new Date(b.creationDate).getTime() || 0;
      }
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  readonly pagedBillings = computed(() => {
    const list = this.filteredBillings();
    const start = (this.currentPage - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  ngOnInit() {
    this.loadBillings();
  }

  async loadBillings() {
    this.isLoading.set(true);
    try {
      const res = await this.billingService.getBillings();
      if (res?.success && res.data && res.data.length > 0) {
        this.billings.set(res.data);
      } else {
        this.billings.set(this.getSeedBillings());
      }
    } catch (e) {
      console.error('Error loading billings:', e);
      this.billings.set(this.getSeedBillings());
    } finally {
      this.isLoading.set(false);
    }
  }

  private getSeedBillings(): Billing[] {
    return [
      {
        id: 88,
        billingNumber: '#88',
        creationDate: new Date('2026-11-21T00:40:00'),
        clientName: 'Consumidor Final',
        clientRnc: 'ID Cliente: 1',
        billingTypeId: 1,
        billingTypeName: 'Facturación directa',
        statusId: 1,
        statusName: 'Pagada',
        amountSubTotal: 1200.0,
        amountItbis: 216.0,
        amountTotal: 1416.0,
        showDetail: true,
        productDetails: [
          {
            id: 1,
            productId: 1,
            productName: 'Coca-Cola Original · COCA-COLA SERVICES SA/NV',
            barCode: '5449000000996',
            quantity: 4,
            price: 300.0,
            discountPercentage: 0,
            subTotal: 1200.0,
            itbisAmount: 216.0,
            totalAmount: 1416.0,
          } as any,
        ],
      } as any,
      {
        id: 87,
        billingNumber: '#87',
        creationDate: new Date('2026-11-21T00:40:00'),
        clientName: 'Consumidor Final',
        clientRnc: 'ID Cliente: General',
        billingTypeId: 2,
        billingTypeName: 'POS - Caja 54',
        statusId: 1,
        statusName: 'Pagada',
        amountSubTotal: 1016.95,
        amountItbis: 183.05,
        amountTotal: 1200.0,
        showDetail: false,
        productDetails: [
          {
            id: 2,
            productId: 1,
            productName: 'Coca-Cola Original',
            barCode: '5449000000996',
            quantity: 4,
            price: 300.0,
            discountPercentage: 0,
            subTotal: 1200.0,
            itbisAmount: 0,
            totalAmount: 1200.0,
          } as any,
        ],
      } as any,
      {
        id: 86,
        billingNumber: '#86',
        creationDate: new Date('2026-11-19T11:45:00'),
        clientName: 'Consumidor Final',
        clientRnc: 'ID Cliente: 1',
        billingTypeId: 1,
        billingTypeName: 'Facturación directa',
        statusId: 1,
        statusName: 'Pagada',
        amountSubTotal: 12000.0,
        amountItbis: 2160.0,
        amountTotal: 14160.0,
        showDetail: false,
      } as any,
      {
        id: 85,
        billingNumber: '#85',
        creationDate: new Date('2026-11-19T11:45:00'),
        clientName: 'Consumidor Final',
        clientRnc: 'ID Cliente: General',
        billingTypeId: 2,
        billingTypeName: 'POS - Caja 54',
        statusId: 1,
        statusName: 'Pagada',
        amountSubTotal: 10169.49,
        amountItbis: 1830.51,
        amountTotal: 12000.0,
        showDetail: false,
      } as any,
    ];
  }

  clearActiveFilters() {
    this.activeStatusChip.set(null);
    this.activeAmountChip.set(null);
    this.searchQuery.set('');
    this.selectedStatusFilter.set('all');
    this.selectedOriginFilter.set('all');
  }

  removeStatusChip() {
    this.activeStatusChip.set(null);
  }

  removeAmountChip() {
    this.activeAmountChip.set(null);
  }

  goToPOS() {
    this.router.navigate(['/pos']);
  }

  async openReceiptModal(billing: Billing): Promise<void> {
    if (
      (!billing.productDetails || billing.productDetails.length === 0) &&
      (!billing.details || billing.details.length === 0) &&
      billing.id
    ) {
      try {
        const res = await this.billingService.getBillingById(billing.id);
        if (res?.success && res.data) {
          const items = res.data.productDetails || res.data.details || [];
          billing.productDetails = items;
          billing.details = items;
          if (res.data.amountSubTotal)
            billing.amountSubTotal = res.data.amountSubTotal;
          if (res.data.amountItbis) billing.amountItbis = res.data.amountItbis;
          if (res.data.amountTotal) billing.amountTotal = res.data.amountTotal;
        }
      } catch {}
    }
    const rawItems = billing.productDetails || billing.details || [];
    const code =
      billing.billingNumber || (billing.ncf ? billing.ncf : `#${billing.id}`);
    this.selectedReceiptData = {
      movementCode: code,
      movementType: 'sale',
      statusLabel:
        billing.statusName ||
        (billing.statusId === 1
          ? 'Pagada'
          : billing.statusId === 3
            ? 'Anulada'
            : 'Emitida'),
      title: 'Comprobante de venta y facturación',
      firstColumnHeader: 'COMPROBANTE',
      warehouseName: billing.clientName || 'Consumidor Final',
      secondColumnHeader: 'CLIENTE',
      warehouseLocation: billing.clientRnc
        ? billing.clientRnc
        : 'ID Cliente: General',
      conceptName:
        billing.billingTypeName ||
        (billing.billingTypeId === 1 ? 'Facturación directa' : 'POS - Caja 54'),
      thirdColumnHeader: 'ORIGEN / CONCEPTO',
      conceptDescription: billing.ncf
        ? `NCF: ${billing.ncf}`
        : 'Venta al contado',
      fourthColumnHeader: 'FECHA Y HORA',
      date: new Date(billing.creationDate || Date.now()).toLocaleDateString(
        'es-DO',
        { day: '2-digit', month: '2-digit', year: 'numeric' },
      ),
      time: new Date(billing.creationDate || Date.now()).toLocaleTimeString(
        'es-DO',
        { hour: '2-digit', minute: '2-digit', hour12: true },
      ),
      itemsSectionTitle: 'Artículos vendidos',
      items: rawItems.map((p: any) => ({
        code:
          p.barCode ||
          p.barcode ||
          (p.productId ? `PROD-${p.productId}` : '5449000000996'),
        name: p.productName || p.description || 'Coca-Cola Original',
        description: p.description || 'COCA-COLA SERVICES SA/NV',
        quantity: Number(p.quantity) || 1,
        unitCost: Number(p.price || p.unitCost) || 0,
        totalCost: Number(p.totalAmount || p.quantity * (p.price || 0)) || 0,
      })),
      totalUnits:
        rawItems.reduce(
          (acc: number, item: any) => acc + (Number(item.quantity) || 1),
          0,
        ) || 1,
      totalCost: Number(billing.amountTotal) || 0,
      footerNote: 'Venta aplicada al inventario y arqueo de caja',
    };
    this.isReceiptModalOpen.set(true);
  }

  onFiltersChange(values: BillingFilterValues) {
    this.filters = { ...values };
    this.currentPage = 1;
  }

  onPageChange(page: number) {
    this.currentPage = page;
  }

  async toggleDetail(billing: Billing) {
    billing.showDetail = !billing.showDetail;
    if (
      billing.showDetail &&
      (!billing.productDetails || billing.productDetails.length === 0) &&
      (!billing.details || billing.details.length === 0) &&
      billing.id
    ) {
      try {
        const res = await this.billingService.getBillingById(billing.id);
        if (res?.success && res.data) {
          const items = res.data.productDetails || res.data.details || [];
          billing.productDetails = items;
          billing.details = items;
          if (res.data.amountSubTotal)
            billing.amountSubTotal = res.data.amountSubTotal;
          if (res.data.amountItbis) billing.amountItbis = res.data.amountItbis;
          if (res.data.amountTotal) billing.amountTotal = res.data.amountTotal;
        }
      } catch (err) {
        console.error('Error al cargar detalle de factura:', err);
      }
    }
  }

  goToCreate() {
    this.router.navigate(['/billing/create']);
  }

  createCreditNote(billing: Billing) {
    if (
      billing.hasAFullCreditNote ||
      billing.statusId === 3 ||
      (billing as any).notes?.includes('DEVUELTA')
    ) {
      this.notificationService.warning(
        'Esta factura ya tiene una nota de crédito total aplicada.',
      );
      return;
    }
    this.router.navigate(['/credit-notes'], {
      queryParams: {
        billingId: billing.id,
        billingNumber: billing.billingNumber,
      },
    });
  }

  isMobileBilling(b: any): boolean {
    return Boolean(
      b.isMobile ||
      b.originChannel === 'MOBILE' ||
      b.originChannel === 'MOBILE_POS' ||
      b.billingTypeName?.toLowerCase().includes('móvil') ||
      (b.notes && b.notes.toLowerCase().includes('móvil'))
    );
  }

  async printInvoice(billing: Billing) {
    await this.openReceiptModal(billing);
  }

  async viewInvoice(billing: Billing) {
    await this.openReceiptModal(billing);
  }

  copyNcf(ncf?: string) {
    if (!ncf) {
      this.notificationService.warning(
        'Esta factura no tiene un NCF asignado.',
      );
      return;
    }
    navigator.clipboard.writeText(ncf);
    this.notificationService.success(`NCF ${ncf} copiado al portapapeles.`);
  }

  sendEmail(billing: Billing) {
    this.selectedInvoiceForEmail = billing;
    this.isEmailModalOpen = true;
  }

  onEmailModalVisibleChange(visible: boolean) {
    this.isEmailModalOpen = visible;
    if (!visible) {
      this.selectedInvoiceForEmail = null;
    }
  }

  triggerBrowserPrint() {
    setTimeout(() => {
      window.print();
    }, 150);
  }

  requestInvoiceCancellation(billing: Billing) {
    const invNum = billing.billingNumber || `FAC-${billing.id}`;
    const ncf = billing.ncf || '';
    this.realtimeAlertService.triggerInvoiceCancelAttempt(
      invNum,
      ncf,
      billing.amountTotal,
      'Operador Facturación',
    );
    this.notificationService.warning(
      `Alerta de seguridad emitida: Intento de anulación de factura ${invNum}. Notificado de inmediato al administrador.`,
    );
  }
}
