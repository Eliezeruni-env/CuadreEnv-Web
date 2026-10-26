import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WarehouseEntryService } from '../../services/warehouse-entry.service';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import type { WarehouseEntry } from '../../../../app/models/movement';

@Component({
  selector: 'app-listwarehouse-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, KtPaginatorComponent],
  templateUrl: './listwarehouse-entry.component.html',
  styleUrls: ['./listwarehouse-entry.component.scss'],
})
export class ListwarehouseEntryComponent implements OnInit {
  private entryService = inject(WarehouseEntryService);
  private router = inject(Router);

  entries = signal<WarehouseEntry[]>([]);
  isLoading = signal<boolean>(false);
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  expandedEntryId = signal<number | null>(null);

  selectedEntry: WarehouseEntry | null = null;

  readonly filteredEntries = computed(() => {
    const q = this.searchTerm.toLowerCase().trim();
    if (!q) return this.entries();
    return this.entries().filter(
      (e) =>
        (e.movementNumber || '').toLowerCase().includes(q) ||
        (e.warehouseName || '').toLowerCase().includes(q) ||
        (e.conceptName || '').toLowerCase().includes(q) ||
        (e.commentary || '').toLowerCase().includes(q),
    );
  });

  readonly pagedEntries = computed(() => {
    const list = this.filteredEntries();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  ngOnInit() {
    this.loadEntries();
  }

  async loadEntries() {
    this.isLoading.set(true);
    try {
      const res = await this.entryService.getEntries();
      if (res?.success && res.data) {
        const safeData = (res.data || []).map((e: any) => ({
          ...e,
          productDetails: e.productDetails || e.details || e.items || [],
        }));
        this.entries.set(safeData);
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

  async toggleDetail(entry: WarehouseEntry) {
    if (entry.id != null) {
      if (this.expandedEntryId() === entry.id) {
        this.expandedEntryId.set(null);
      } else {
        this.expandedEntryId.set(entry.id);
        if (!entry.productDetails || entry.productDetails.length === 0) {
          try {
            const res = await this.entryService.getEntry(entry.id);
            if (res.success && res.data) {
              const current = this.entries();
              const idx = current.findIndex((item) => item.id === entry.id);
              if (idx !== -1) {
                current[idx] = res.data;
                this.entries.set([...current]);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }

  isEntryExpanded(entryId?: number): boolean {
    return entryId != null && this.expandedEntryId() === entryId;
  }

  goToCreate() {
    this.router.navigate(['/inventory/entries/create']);
  }

  viewDetail(entry: WarehouseEntry) {
    this.selectedEntry = entry;
  }

  printVoucher() {
    setTimeout(() => {
      window.print();
    }, 150);
  }
}
