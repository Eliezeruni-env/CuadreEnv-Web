import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BillingService } from '../../services/billing.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { GenericFiltersComponent, BillingFilterValues } from '../generic-filters/generic-filters.component';
import { KtPaginatorComponent } from '../kt-paginator/kt-paginator.component';
import { SendInvoiceEmailModalComponent } from '../../../../app/shared/components/send-invoice-email-modal/send-invoice-email-modal.component';
import { NcfAlertBannerComponent } from '../ncf-alert-banner/ncf-alert-banner.component';
import { CompanyService } from '../../../companies/services/company.service';
import { RealtimeAlertService } from '../../../cuadreEnv/services/realtime-alert.service';
import type { Billing } from '../../../../app/models/billing';

@Component({
  selector: 'app-listbilling',
  standalone: true,
  imports: [
    CommonModule,
    GenericFiltersComponent,
    KtPaginatorComponent,
    SendInvoiceEmailModalComponent,
    NcfAlertBannerComponent,
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
  currentPage = 1;
  pageSize = 10;

  selectedInvoiceToPrint: Billing | null = null;
  isEmailModalOpen = false;
  selectedInvoiceForEmail: Billing | null = null;

  readonly filteredBillings = computed(() => {
    let list = this.billings();

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

    return list;
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
      if (res?.success && res.data) {
        this.billings.set(res.data);
      }
    } catch (e) {
      console.error('Error loading billings:', e);
    } finally {
      this.isLoading.set(false);
    }
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
    if (billing.showDetail && (!billing.productDetails || billing.productDetails.length === 0) && (!billing.details || billing.details.length === 0) && billing.id) {
      try {
        const res = await this.billingService.getBillingById(billing.id);
        if (res?.success && res.data) {
          const items = res.data.productDetails || res.data.details || [];
          billing.productDetails = items;
          billing.details = items;
          if (res.data.amountSubTotal) billing.amountSubTotal = res.data.amountSubTotal;
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
    if (billing.hasAFullCreditNote) {
      this.notificationService.warning('Esta factura ya tiene una nota de crédito total aplicada.');
      return;
    }
    this.router.navigate(['/credit-notes'], {
      queryParams: { billingId: billing.id, billingNumber: billing.billingNumber },
    });
  }

  async printInvoice(billing: Billing) {
    if ((!billing.productDetails || billing.productDetails.length === 0) && (!billing.details || billing.details.length === 0) && billing.id) {
      const res = await this.billingService.getBillingById(billing.id);
      if (res?.success && res.data) {
        billing.productDetails = res.data.productDetails || res.data.details || [];
        billing.details = billing.productDetails;
      }
    }
    this.selectedInvoiceToPrint = billing;
  }

  async viewInvoice(billing: Billing) {
    if ((!billing.productDetails || billing.productDetails.length === 0) && (!billing.details || billing.details.length === 0) && billing.id) {
      const res = await this.billingService.getBillingById(billing.id);
      if (res?.success && res.data) {
        billing.productDetails = res.data.productDetails || res.data.details || [];
        billing.details = billing.productDetails;
      }
    }
    this.selectedInvoiceToPrint = billing;
  }

  copyNcf(ncf?: string) {
    if (!ncf) {
      this.notificationService.warning('Esta factura no tiene un NCF asignado.');
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
