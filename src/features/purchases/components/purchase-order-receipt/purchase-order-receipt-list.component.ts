import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PurchaseOrderReceiptService } from '../../services/purchase-order-receipt.service';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import type { PurchaseOrderReceipt } from '../../../../app/models/purchase-order';

@Component({
  selector: 'app-purchase-order-receipt-list',
  standalone: true,
  imports: [CommonModule, FormsModule, KtPaginatorComponent],
  templateUrl: './purchase-order-receipt-list.component.html',
  styleUrls: ['./purchase-order-receipt-list.component.scss'],
})
export class PurchaseOrderReceiptListComponent implements OnInit {
  private receiptService = inject(PurchaseOrderReceiptService);
  private router = inject(Router);

  receipts = signal<PurchaseOrderReceipt[]>([]);
  isLoading = signal<boolean>(false);
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  expandedReceiptId = signal<number | null>(null);

  selectedReceipt: PurchaseOrderReceipt | null = null;

  // Dynamic Column Sorting
  sortColumn = signal<string>('receiptDate');
  sortDirection = signal<'asc' | 'desc'>('desc');

  toggleSort(column: string): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  readonly filteredReceipts = computed(() => {
    const q = this.searchTerm.toLowerCase().trim();
    let list = this.receipts();
    if (q) {
      list = list.filter(
        (r) =>
          r.receiptNumber.toLowerCase().includes(q) ||
          (r.purchaseOrderNumber && r.purchaseOrderNumber.toLowerCase().includes(q)) ||
          r.supplierName.toLowerCase().includes(q) ||
          (r.warehouseName && r.warehouseName.toLowerCase().includes(q)),
      );
    }

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      switch (col) {
        case 'receiptNumber':
          valA = (a.receiptNumber || '').toLowerCase();
          valB = (b.receiptNumber || '').toLowerCase();
          break;
        case 'orderNumber':
          valA = (a.purchaseOrderNumber || '').toLowerCase();
          valB = (b.purchaseOrderNumber || '').toLowerCase();
          break;
        case 'supplier':
          valA = (a.supplierName || '').toLowerCase();
          valB = (b.supplierName || '').toLowerCase();
          break;
        case 'warehouse':
          valA = (a.warehouseName || '').toLowerCase();
          valB = (b.warehouseName || '').toLowerCase();
          break;
        case 'receiptDate':
          valA = new Date(a.receiptDate || 0).getTime();
          valB = new Date(b.receiptDate || 0).getTime();
          break;
        case 'status':
          valA = (a.statusName || '').toLowerCase();
          valB = (b.statusName || '').toLowerCase();
          break;
        default:
          valA = new Date(a.receiptDate || 0).getTime();
          valB = new Date(b.receiptDate || 0).getTime();
      }
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  readonly pagedReceipts = computed(() => {
    const list = this.filteredReceipts();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  ngOnInit() {
    this.loadReceipts();
  }

  async loadReceipts() {
    this.isLoading.set(true);
    try {
      const res = await this.receiptService.getReceipts();
      if (res?.success && res.data) {
        this.receipts.set(res.data);
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

  toggleDetail(receipt: PurchaseOrderReceipt) {
    if (this.expandedReceiptId() === receipt.id) {
      this.expandedReceiptId.set(null);
    } else {
      this.expandedReceiptId.set(receipt.id);
    }
  }

  isReceiptExpanded(receiptId: number): boolean {
    return this.expandedReceiptId() === receiptId;
  }

  goToNewReceipt() {
    this.router.navigate(['/purchases/receipts/create']);
  }

  viewReceipt(receipt: PurchaseOrderReceipt) {
    this.selectedReceipt = receipt;
  }

  printReceipt() {
    setTimeout(() => {
      window.print();
    }, 150);
  }

  printVoucher() {
    this.printReceipt();
  }
}
