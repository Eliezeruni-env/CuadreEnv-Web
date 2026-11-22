import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WarehouseTransferService } from '../../services/warehouse-transfer.service';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import {
  WarehouseMovementReceiptModalComponent,
  type MovementReceiptData,
} from '../../../../app/shared/components/warehouse-movement-receipt-modal/warehouse-movement-receipt-modal.component';
import type { WarehouseTransfer } from '../../../../app/models/movement';

@Component({
  selector: 'app-listwarehouse-transfer',
  standalone: true,
  imports: [CommonModule, FormsModule, KtPaginatorComponent, WarehouseMovementReceiptModalComponent],
  templateUrl: './listwarehouse-transfer.component.html',
  styleUrls: ['./listwarehouse-transfer.component.scss'],
})
export class ListwarehouseTransferComponent implements OnInit {
  private transferService = inject(WarehouseTransferService);
  private router = inject(Router);

  transfers = signal<WarehouseTransfer[]>([]);
  isLoading = signal<boolean>(false);
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  expandedTransferId = signal<number | null>(null);

  // Receipt Modal State (Matching Image 2)
  isReceiptModalOpen = signal<boolean>(false);
  selectedReceiptData: MovementReceiptData | null = null;
  selectedTransfer: WarehouseTransfer | null = null;

  readonly filteredTransfers = computed(() => {
    const q = this.searchTerm.toLowerCase().trim();
    if (!q) return this.transfers();
    return this.transfers().filter(
      (t) =>
        (t.movementNumber || '').toLowerCase().includes(q) ||
        (t.warehouseOfOriginName || '').toLowerCase().includes(q) ||
        (t.destinationWarehouseName || '').toLowerCase().includes(q) ||
        (t.commentary || '').toLowerCase().includes(q),
    );
  });

  readonly pagedTransfers = computed(() => {
    const list = this.filteredTransfers();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  ngOnInit() {
    this.loadTransfers();
  }

  async loadTransfers() {
    this.isLoading.set(true);
    try {
      const res = await this.transferService.getTransfers();
      if (res?.success && res.data) {
        const safeData = (res.data || []).map((t: any) => ({
          ...t,
          productDetails: t.productDetails || t.details || t.items || [],
        }));
        this.transfers.set(safeData);
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

  async toggleDetail(transfer: WarehouseTransfer) {
    if (transfer.id != null) {
      if (this.expandedTransferId() === transfer.id) {
        this.expandedTransferId.set(null);
      } else {
        this.expandedTransferId.set(transfer.id);
        if (!transfer.productDetails || transfer.productDetails.length === 0) {
          try {
            const res = await this.transferService.getTransfer(transfer.id);
            if (res.success && res.data) {
              const current = this.transfers();
              const idx = current.findIndex((item) => item.id === transfer.id);
              if (idx !== -1) {
                current[idx] = res.data;
                this.transfers.set([...current]);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }

  isTransferExpanded(transferId?: number): boolean {
    return transferId != null && this.expandedTransferId() === transferId;
  }

  goToCreate() {
    this.router.navigate(['/inventory/transfers/create']);
  }

  viewDetail(transfer: WarehouseTransfer) {
    this.openReceiptModal(transfer);
  }

  openReceiptModal(transfer: WarehouseTransfer): void {
    const code = transfer.movementNumber || `TRF-${transfer.id}`;
    const rawItems = transfer.productDetails || [];
    this.selectedReceiptData = {
      movementCode: code,
      movementType: 'transfer',
      statusLabel: transfer.statusName || 'Aplicado',
      title: 'Comprobante de transferencia de almacén',
      firstColumnHeader: 'COMPROBANTE',
      warehouseName: transfer.warehouseOfOriginName || 'Almacén Origen',
      secondColumnHeader: 'ALMACÉN ORIGEN',
      warehouseLocation: 'Emisor / Salida',
      conceptName: transfer.destinationWarehouseName || 'Almacén Destino',
      thirdColumnHeader: 'ALMACÉN DESTINO',
      conceptDescription: 'Receptor / Entrada',
      fourthColumnHeader: 'FECHA Y HORA',
      date: new Date(transfer.createDate || (transfer as any).createdAt || Date.now()).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: new Date(transfer.createDate || (transfer as any).createdAt || Date.now()).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }),
      itemsSectionTitle: 'Artículos transferidos',
      items: rawItems.map((p: any) => ({
        code: p.productCode || p.barcode || p.barCode || (p.productId ? `PROD-${p.productId}` : 'N/A'),
        name: p.productName || p.description || 'Producto',
        description: p.description || '',
        quantity: Number(p.quantity) || 1,
        unitCost: Number(p.cost || p.price) || 0,
        totalCost: (Number(p.cost || p.price) || 0) * (Number(p.quantity) || 1),
      })),
      totalUnits: Number(transfer.totalQuantity) || rawItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0) || 1,
      totalCost: Number(transfer.totalCost) || 0,
      footerNote: 'Transferencia aplicada al inventario',
    };
    this.isReceiptModalOpen.set(true);
  }

  printVoucher(transfer?: WarehouseTransfer) {
    if (transfer) {
      this.openReceiptModal(transfer);
    } else {
      setTimeout(() => {
        window.print();
      }, 150);
    }
  }
}
