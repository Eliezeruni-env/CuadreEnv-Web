import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WarehouseTransferService } from '../../services/warehouse-transfer.service';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import type { WarehouseTransfer } from '../../../../app/models/movement';

@Component({
  selector: 'app-listwarehouse-transfer',
  standalone: true,
  imports: [CommonModule, FormsModule, KtPaginatorComponent],
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
    this.selectedTransfer = transfer;
  }

  printVoucher() {
    setTimeout(() => {
      window.print();
    }, 150);
  }
}
