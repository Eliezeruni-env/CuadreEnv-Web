import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { QuotationService } from '../../../services/quotation.service';
import { NotificationService } from '../../../../cuadreEnv/services/notification.service';
import type { QuotationDto, QuotationStatus } from '../../../types/quotation.types';

@Component({
  selector: 'app-quotation-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './quotation-list.component.html',
  styleUrls: ['./quotation-list.component.scss'],
})
export class QuotationListComponent implements OnInit {
  private quotationService = inject(QuotationService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  quotations = signal<QuotationDto[]>([]);
  isLoading = signal<boolean>(false);

  // Active filter tab: 'ALL' | 'DRAFT' | 'SENT' | 'APPROVED' | 'CONVERTED' | 'EXPIRED'
  selectedTab = signal<string>('ALL');

  // Search & Filter
  searchQuery = signal<string>('');
  selectedStatusFilter = signal<string>('ALL');
  dateRangeFilter = signal<string>('ALL');

  readonly hasActiveFilters = computed(() => {
    return (
      this.searchQuery().trim() !== '' ||
      this.selectedStatusFilter() !== 'ALL' ||
      this.dateRangeFilter() !== 'ALL'
    );
  });

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedStatusFilter.set('ALL');
    this.dateRangeFilter.set('ALL');
  }

  exportQuotesCsv(): void {
    const list = this.filteredQuotations();
    if (list.length === 0) {
      this.notificationService.warning('No hay cotizaciones para exportar.');
      return;
    }
    const headers = ['Cotizacion', 'Cliente', 'Fecha Emision', 'Fecha Vencimiento', 'Subtotal', 'ITBIS', 'Total', 'Estado'];
    const rows = list.map((q) => [
      q.quotationNumber,
      `"${q.customerName.replace(/"/g, '""')}"`,
      q.issueDate,
      q.expirationDate,
      (q.subtotal || 0).toFixed(2),
      (q.itbisAmount || 0).toFixed(2),
      (q.total || 0).toFixed(2),
      this.getStatusLabel(q.status),
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cotizaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.notificationService.success('Cotizaciones exportadas exitosamente.');
  }

  // Master-Detail expansion
  expandedQuotationId = signal<number | null>(null);

  // Pagination
  currentPage = signal<number>(1);
  pageSize = signal<number>(5);
  totalItems = signal<number>(0);

  // Counts / KPIs
  readonly totalCount = computed(() => this.quotations().length);
  readonly pendingCount = computed(() =>
    this.quotations().filter((q) => q.status === 'SENT' || q.status === 'DRAFT').length
  );
  readonly approvedCount = computed(() =>
    this.quotations().filter((q) => q.status === 'APPROVED').length
  );
  readonly convertedCount = computed(() =>
    this.quotations().filter((q) => q.status === 'CONVERTED').length
  );
  readonly draftCount = computed(() =>
    this.quotations().filter((q) => q.status === 'DRAFT').length
  );
  readonly sentCount = computed(() =>
    this.quotations().filter((q) => q.status === 'SENT').length
  );
  readonly expiredCount = computed(() =>
    this.quotations().filter((q) => q.status === 'EXPIRED').length
  );

  sortColumn = signal<string>('date');
  sortDirection = signal<'asc' | 'desc'>('desc');

  toggleSort(col: string): void {
    if (this.sortColumn() === col) {
      this.sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(col);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
  }

  // Filtered List
  readonly filteredQuotations = computed(() => {
    let list = this.quotations();
    const tab = this.selectedTab();
    if (tab !== 'ALL') {
      list = list.filter((q) => q.status === tab);
    }

    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.quotationNumber.toLowerCase().includes(q) ||
          item.customerName.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
      );
    }

    if (this.selectedStatusFilter() !== 'ALL') {
      list = list.filter((item) => item.status === this.selectedStatusFilter());
    }

    const col = this.sortColumn();
    const dir = this.sortDirection();

    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (col) {
        case 'code':
          valA = a.quotationNumber.toLowerCase();
          valB = b.quotationNumber.toLowerCase();
          break;
        case 'customer':
          valA = (a.customerName || '').toLowerCase();
          valB = (b.customerName || '').toLowerCase();
          break;
        case 'date':
          valA = new Date(a.issueDate || 0).getTime();
          valB = new Date(b.issueDate || 0).getTime();
          break;
        case 'expiration':
          valA = new Date(a.expirationDate || 0).getTime();
          valB = new Date(b.expirationDate || 0).getTime();
          break;
        case 'total':
          valA = Number(a.total) || 0;
          valB = Number(b.total) || 0;
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        default:
          valA = a.id;
          valB = b.id;
      }

      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  // Paged List
  readonly pagedQuotations = computed(() => {
    const list = this.filteredQuotations();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  readonly totalPages = computed(() => {
    return Math.ceil(this.filteredQuotations().length / this.pageSize()) || 1;
  });

  ngOnInit(): void {
    this.loadQuotations();
  }

  async loadQuotations(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await this.quotationService.getQuotations({
        page: 1,
        pageSize: 100,
      });
      this.quotations.set(res.items || []);
      this.totalItems.set(res.totalItems || res.items.length);

      // Auto-expand the first approved quotation if available for immediate visualization
      const approved = res.items.find((q) => q.status === 'APPROVED');
      if (approved && !this.expandedQuotationId()) {
        this.expandedQuotationId.set(approved.id);
      }
    } catch (e: any) {
      this.notificationService.error('Error al cargar cotizaciones');
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(tab: string): void {
    this.selectedTab.set(tab);
    this.currentPage.set(1);
  }

  toggleExpand(id: number): void {
    if (this.expandedQuotationId() === id) {
      this.expandedQuotationId.set(null);
    } else {
      this.expandedQuotationId.set(id);
    }
  }

  isExpanded(id: number): boolean {
    return this.expandedQuotationId() === id;
  }

  goToNew(): void {
    this.router.navigate(['/sales/quotations/create']);
  }

  viewQuotation(item: QuotationDto): void {
    this.toggleExpand(item.id);
  }

  printQuotation(item: QuotationDto, event?: Event): void {
    if (event) event.stopPropagation();
    const printWindow = window.open('', '_blank', 'width=880,height=960');
    if (!printWindow) {
      this.notificationService.warning(
        'El navegador bloqueó la ventana emergente. Por favor permite popups para imprimir.',
      );
      return;
    }
    const itemsHtml = (item.details || [])
      .map(
        (d, i) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${i + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${d.productName || 'Producto'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${d.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">RD$ ${(d.unitPrice || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">RD$ ${(d.subtotal || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
      </tr>
    `,
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cotización ${item.quotationNumber}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; color: #1e293b; }
          .code { font-size: 16px; color: #2563eb; font-weight: 600; margin-top: 4px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 14px; }
          th { background: #f8fafc; padding: 10px 8px; text-align: left; border-bottom: 2px solid #cbd5e1; font-weight: 600; }
          .totals { margin-left: auto; width: 280px; font-size: 14px; }
          .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .totals-total { border-top: 2px solid #1e293b; font-weight: bold; font-size: 16px; margin-top: 4px; padding-top: 8px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">COTIZACIÓN</div>
            <div class="code">${item.quotationNumber}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 600;">Estado: ${this.getStatusLabel(item.status)}</div>
            <div style="font-size: 13px; color: #64748b;">Emisión: ${new Date(item.issueDate).toLocaleDateString('es-DO')}</div>
            <div style="font-size: 13px; color: #64748b;">Válida hasta: ${new Date(item.expirationDate).toLocaleDateString('es-DO')}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div>
            <strong style="color: #64748b; font-size: 12px; text-transform: uppercase;">Cliente</strong>
            <div style="font-size: 16px; font-weight: 600; margin-top: 2px;">${item.customerName}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>Descripción</th>
              <th style="width: 80px; text-align: center;">Cantidad</th>
              <th style="width: 120px; text-align: right;">Precio Unit.</th>
              <th style="width: 120px; text-align: right;">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-row">
            <span>Subtotal:</span>
            <span>RD$ ${(item.subtotal || item.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row">
            <span>ITBIS (18%):</span>
            <span>RD$ ${(item.itbisAmount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row totals-total">
            <span>TOTAL:</span>
            <span>RD$ ${(item.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  editQuotation(item: QuotationDto, event?: Event): void {
    if (event) event.stopPropagation();
    this.router.navigate(['/sales/quotations/create'], { queryParams: { id: item.id } });
  }

  async deleteQuotation(item: QuotationDto, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    if (!confirm(`¿Estás seguro de que deseas eliminar la cotización "${item.quotationNumber}"?`)) {
      return;
    }
    try {
      const res = await this.quotationService.deleteQuotation(item.id);
      if (res.success) {
        this.notificationService.success(`Cotización ${item.quotationNumber} eliminada.`);
        await this.loadQuotations();
      } else {
        this.notificationService.error(res.message || 'No se pudo eliminar la cotización.');
      }
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al eliminar cotización.');
    }
  }

  async convertToSale(item: QuotationDto, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    try {
      this.notificationService.info(`Convirtiendo cotización ${item.quotationNumber} en venta...`);
      const res = await this.quotationService.convertToSale(item.id);
      if (res.success) {
        this.notificationService.success(`¡Venta generada con éxito! Factura/Orden: ${res.saleCode || 'VTA-0091'}`);
        await this.loadQuotations();
      } else {
        this.notificationService.error(res.message || 'No se pudo convertir en venta.');
      }
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al convertir en venta.');
    }
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  onPageSizeChange(event: Event): void {
    const val = Number((event.target as HTMLSelectElement).value);
    this.pageSize.set(val);
    this.currentPage.set(1);
  }

  getStatusBadgeClass(status: QuotationStatus): string {
    switch (status) {
      case 'DRAFT':
        return 'badge-draft';
      case 'SENT':
        return 'badge-sent';
      case 'APPROVED':
        return 'badge-approved';
      case 'CONVERTED':
        return 'badge-converted';
      case 'EXPIRED':
        return 'badge-expired';
      default:
        return 'badge-draft';
    }
  }

  getStatusLabel(status: QuotationStatus | string): string {
    switch (status) {
      case 'DRAFT':
        return 'Borrador';
      case 'SENT':
        return 'Enviada';
      case 'APPROVED':
        return 'Aprobada';
      case 'CONVERTED':
        return 'Convertida';
      case 'EXPIRED':
        return 'Vencida';
      default:
        return status;
    }
  }

  getDaysRemaining(expirationDate: string): number {
    try {
      const exp = new Date(expirationDate).getTime();
      const now = new Date().getTime();
      const diff = Math.ceil((exp - now) / (1000 * 3600 * 24));
      return Math.max(0, diff);
    } catch {
      return 7;
    }
  }
}
