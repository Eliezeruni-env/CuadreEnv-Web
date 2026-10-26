import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StockService } from '../../services/stock.service';
import { WarehouseService } from '../../services/warehouse.service';
import { ListPaginationComponent } from '../../../cuadreEnv/components/list-pagination/list-pagination.component';
import type { Stock } from '../../../../app/models/product';
import type { Warehouse } from '../../../../app/models/warehouse';

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, ListPaginationComponent],
  templateUrl: './stock.component.html',
  styleUrls: ['./stock.component.scss'],
})
export class StockComponent implements OnInit {
  public stockService = inject(StockService);
  private warehouseService = inject(WarehouseService);

  stockList = signal<Stock[]>([]);
  warehouses = signal<Warehouse[]>([]);
  isLoading = signal<boolean>(false);

  selectedWarehouseId: number | '' = '';
  statusFilter: 'ALL' | 'CRITICAL' | 'LOW' | 'NORMAL' | 'OVERSTOCK' = 'ALL';
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  readonly filteredStock = computed(() => {
    let list = this.stockList();
    const q = this.searchTerm.toLowerCase().trim();

    if (this.selectedWarehouseId) {
      list = list.filter((s) => s.warehouseId === Number(this.selectedWarehouseId));
    }

    if (q) {
      list = list.filter(
        (s) =>
          s.productName.toLowerCase().includes(q) ||
          (s.barcode && s.barcode.toLowerCase().includes(q)) ||
          s.warehouseName.toLowerCase().includes(q),
      );
    }

    if (this.statusFilter !== 'ALL') {
      list = list.filter((s) => {
        const st = this.stockService.getStockStatus(s.quantity, s.minimumQuantity || 5, s.maximumQuantity || 100);
        return st.type === this.statusFilter;
      });
    }

    return list;
  });

  readonly pagedStock = computed(() => {
    const list = this.filteredStock();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  readonly totalUnits = computed(() => {
    return this.filteredStock().reduce((acc, s) => acc + (s.quantity || 0), 0);
  });

  readonly totalValuation = computed(() => {
    return this.filteredStock().reduce(
      (acc, s) => acc + (s.quantity || 0) * (s.cost || s.price || 0),
      0,
    );
  });

  readonly criticalCount = computed(() => {
    return this.stockList().filter((s) => s.quantity <= 0).length;
  });

  readonly lowCount = computed(() => {
    return this.stockList().filter((s) => s.quantity > 0 && s.quantity <= (s.minimumQuantity || 5)).length;
  });

  readonly normalCount = computed(() => {
    return this.stockList().filter((s) => s.quantity > (s.minimumQuantity || 5) && s.quantity < (s.maximumQuantity || 100)).length;
  });

  readonly overstockCount = computed(() => {
    return this.stockList().filter((s) => s.quantity >= (s.maximumQuantity || 100)).length;
  });

  readonly allCount = computed(() => {
    return this.stockList().length;
  });

  setStatusFilter(status: 'ALL' | 'CRITICAL' | 'LOW' | 'NORMAL' | 'OVERSTOCK'): void {
    this.statusFilter = status;
    this.onFilterChange();
  }

  setWarehouseFilter(whId: number | ''): void {
    this.selectedWarehouseId = whId;
    this.onFilterChange();
  }

  getStockPercentage(s: Stock): number {
    const max = s.maximumQuantity || 100;
    if (max <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round(((s.quantity || 0) / max) * 100)));
  }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [whRes, stockRes] = await Promise.all([
        this.warehouseService.getWarehouses(),
        this.stockService.getStock(),
      ]);

      if (whRes?.success && whRes.data) {
        this.warehouses.set(whRes.data.filter((w) => w.isActive !== false));
      }
      if (stockRes?.success && stockRes.data) {
        this.stockList.set(stockRes.data);
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

  onFilterChange() {
    this.currentPage.set(1);
  }
}
