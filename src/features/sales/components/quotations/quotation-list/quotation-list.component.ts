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

  getStatusLabel(status: QuotationStatus): string {
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
