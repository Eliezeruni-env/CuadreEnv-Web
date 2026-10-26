import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ManageRequestService } from '../../services/manage-request.service';
import { ProductService } from '../../../products/services/product.service';
import { StockService } from '../../services/stock.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ListPaginationComponent } from '../../../cuadreEnv/components/list-pagination/list-pagination.component';
import type { ManageRequest } from '../../../../app/models/manage-request';

@Component({
  selector: 'app-manage-request-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ListPaginationComponent],
  templateUrl: './manage-request-list.component.html',
  styleUrls: ['./manage-request-list.component.scss'],
})
export class ManageRequestListComponent implements OnInit {
  private requestService = inject(ManageRequestService);
  private productService = inject(ProductService);
  private stockService = inject(StockService);
  private notificationService = inject(NotificationService);

  requests = signal<ManageRequest[]>([]);
  isLoading = signal<boolean>(false);
  statusFilter = 0; // 0: Todos, 1: Pendiente, 2: Aprobado, 3: Rechazado
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  selectedRequest: ManageRequest | null = null;
  rejectionReason = '';
  approvalComment = '';
  isProcessing = false;

  // Product Timeline & Lifecycle Viewer
  isProductTimelineOpen = signal<boolean>(false);
  productsList = signal<any[]>([]);
  selectedTimelineProduct = signal<any | null>(null);
  productTimelineEvents = signal<any[]>([]);
  productWarehouseStocks = signal<any[]>([]);

  readonly filteredRequests = computed(() => {
    let list = this.requests();
    const q = this.searchTerm.toLowerCase().trim();

    if (this.statusFilter !== 0) {
      list = list.filter((r) => r.statusId === this.statusFilter);
    }

    if (q) {
      list = list.filter(
        (r) =>
          r.requestNumber.toLowerCase().includes(q) ||
          r.typeName.toLowerCase().includes(q) ||
          r.creatorName.toLowerCase().includes(q) ||
          r.comment.toLowerCase().includes(q),
      );
    }

    return list;
  });

  readonly pagedRequests = computed(() => {
    const list = this.filteredRequests();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  ngOnInit() {
    this.loadRequests();
  }

  async loadRequests() {
    this.isLoading.set(true);
    try {
      const res = await this.requestService.getRequests();
      if (res?.success && res.data) {
        this.requests.set(res.data);
      }
    } catch {
      // ignore
    } finally {
      this.isLoading.set(false);
    }
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  viewRequest(req: ManageRequest) {
    let parsed = null;
    try {
      parsed = JSON.parse(req.payloadJson || '{}');
    } catch {
      parsed = {};
    }
    this.selectedRequest = { ...req, payloadParsed: parsed };
    this.rejectionReason = '';
    this.approvalComment = '';
  }

  async approveSelected() {
    if (!this.selectedRequest) return;
    this.isProcessing = true;
    try {
      const res = await this.requestService.approveRequest(
        this.selectedRequest.id,
        this.approvalComment || 'Autorizado por el supervisor.',
      );
      if (res?.success) {
        this.notificationService.success(res.message || 'Solicitud aprobada y aplicada.');
        this.selectedRequest = null;
        this.loadRequests();
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isProcessing = false;
    }
  }

  async rejectSelected() {
    if (!this.selectedRequest) return;
    if (!this.rejectionReason.trim()) {
      this.notificationService.warning('Debe ingresar el motivo de rechazo.');
      return;
    }

    this.isProcessing = true;
    try {
      const res = await this.requestService.rejectRequest(
        this.selectedRequest.id,
        this.rejectionReason,
      );
      if (res?.success) {
        this.notificationService.info(res.message || 'Solicitud rechazada.');
        this.selectedRequest = null;
        this.loadRequests();
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isProcessing = false;
    }
  }

  // =========================================================================
  // Product Lifecycle & Timeline Methods
  // =========================================================================
  async openProductTimeline(productId?: number) {
    this.isProductTimelineOpen.set(true);
    if (this.productsList().length === 0) {
      try {
        const prodRes = await this.productService.getPagedProducts(1, 200);
        if (prodRes?.success && prodRes.data?.items) {
          this.productsList.set(prodRes.data.items);
        }
      } catch {
        // ignore
      }
    }

    const targetId = productId || (this.productsList().length > 0 ? this.productsList()[0].id : null);
    if (targetId) {
      await this.selectProductForTimeline(targetId);
    }
  }

  async selectProductForTimeline(productId: number) {
    const prod = this.productsList().find((p) => p.id === productId);
    this.selectedTimelineProduct.set(prod || null);

    const events: any[] = [];

    if (prod) {
      events.push({
        timestamp: prod.createdDate || prod.creationDate || new Date().toISOString(),
        action: '📦 Producto Creado en Catálogo',
        badge: 'bg-primary text-white',
        user: 'Sistema / Administrador',
        detail: `Registrado con Costo: RD$ ${(prod.cost || 0).toFixed(2)}, Código: ${prod.barcode || prod.reference || 'N/A'}${prod.expirationDate ? ', Vencimiento: ' + prod.expirationDate.split('T')[0] : ''}.`,
      });
    }

    // Scan all requests for this product
    const allRequests = this.requests();
    allRequests.forEach((req) => {
      let payload: any = {};
      try {
        payload = JSON.parse(req.payloadJson || '{}');
      } catch {
        payload = {};
      }

      const matchingItem = (payload.items || []).find((it: any) => it.productId === productId);
      if (matchingItem) {
        const qty = matchingItem.quantityReceived ?? matchingItem.quantity ?? 0;
        let badge = 'bg-warning text-dark';
        if (req.statusId === 2) badge = 'bg-success text-white';
        if (req.statusId === 3) badge = 'bg-danger text-white';

        events.push({
          timestamp: req.createdAt,
          action: `${req.typeName} (${req.requestNumber})`,
          badge,
          user: req.creatorName,
          detail: `Operación de ${qty} unidades. Motivo: "${req.comment}". Decisión: ${req.statusName}${req.reviewerName ? ' por ' + req.reviewerName : ''}.`,
        });
      }
    });

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    this.productTimelineEvents.set(events);

    try {
      const stockRes = await this.stockService.getStock({ productId });
      this.productWarehouseStocks.set(stockRes.data || []);
    } catch {
      this.productWarehouseStocks.set([]);
    }
  }

  closeProductTimeline() {
    this.isProductTimelineOpen.set(false);
  }
}
