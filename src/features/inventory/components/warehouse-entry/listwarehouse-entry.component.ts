import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WarehouseEntryService } from '../../services/warehouse-entry.service';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import {
  WarehouseMovementReceiptModalComponent,
  type MovementReceiptData,
} from '../../../../app/shared/components/warehouse-movement-receipt-modal/warehouse-movement-receipt-modal.component';
import type { WarehouseEntry } from '../../../../app/models/movement';

@Component({
  selector: 'app-listwarehouse-entry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    KtPaginatorComponent,
    WarehouseMovementReceiptModalComponent,
  ],
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

  // Sorting
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

  // Receipt Modal State (Matching Image 2)
  isReceiptModalOpen = signal<boolean>(false);
  selectedReceiptData: MovementReceiptData | null = null;

  readonly filteredEntries = computed(() => {
    let list = this.entries();
    const q = this.searchTerm.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (e) =>
          (e.movementNumber || '').toLowerCase().includes(q) ||
          (e.warehouseName || '').toLowerCase().includes(q) ||
          (e.conceptName || '').toLowerCase().includes(q) ||
          (e.commentary || '').toLowerCase().includes(q),
      );
    }

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      switch (col) {
        case 'movement':
          valA = a.movementNumber || String(a.id || '');
          valB = b.movementNumber || String(b.id || '');
          break;
        case 'warehouse':
          valA = (a.warehouseName || '').toLowerCase();
          valB = (b.warehouseName || '').toLowerCase();
          break;
        case 'concept':
          valA = (a.conceptName || '').toLowerCase();
          valB = (b.conceptName || '').toLowerCase();
          break;
        case 'date':
          valA = a.createDate ? new Date(a.createDate).getTime() : 0;
          valB = b.createDate ? new Date(b.createDate).getTime() : 0;
          break;
        case 'quantity':
          valA = a.totalQuantity || 0;
          valB = b.totalQuantity || 0;
          break;
        case 'cost':
          valA = a.totalCost || 0;
          valB = b.totalCost || 0;
          break;
        case 'status':
          valA = (a.statusName || '').toLowerCase();
          valB = (b.statusName || '').toLowerCase();
          break;
        default:
          valA = a.createDate ? new Date(a.createDate).getTime() : 0;
          valB = b.createDate ? new Date(b.createDate).getTime() : 0;
      }
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
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
        const safeData = (res.data || []).map((e: any) => {
          const details = e.productDetails || e.details || e.items || [];
          let computedCost = Number(e.totalCost || e.costTotal || e.amount || 0);

          if (computedCost === 0 && details.length > 0) {
            computedCost = details.reduce((sum: number, it: any) => {
              const c = Number(it.cost || it.unitCost || it.price || 0);
              const q = Number(it.quantity || it.cant || 1);
              return sum + c * q;
            }, 0);
          }

          return {
            ...e,
            productDetails: details,
            totalCost: computedCost,
          };
        });
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
    this.openReceiptModal(entry);
  }

  openReceiptModal(entry: WarehouseEntry): void {
    const code = entry.movementNumber || `ENT-${entry.id}`;
    const rawItems = entry.productDetails || [];
    this.selectedReceiptData = {
      movementCode: code,
      movementType: 'entry',
      statusLabel: 'Aplicado',
      title: 'Comprobante de entrada de almacén',
      firstColumnHeader: 'COMPROBANTE',
      warehouseName: entry.warehouseName || 'Almacén Principal',
      secondColumnHeader: 'ALMACÉN DESTINO',
      warehouseLocation: (entry as any).warehouseLocation || 'Bodega Central',
      conceptName: entry.conceptName || 'Entrada de almacén',
      thirdColumnHeader: 'CONCEPTO',
      conceptDescription: entry.commentary || 'Recepción de stock',
      fourthColumnHeader: 'FECHA Y HORA',
      date: new Date(
        entry.createDate || (entry as any).createdAt || Date.now(),
      ).toLocaleDateString('es-DO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      time: new Date(
        entry.createDate || (entry as any).createdAt || Date.now(),
      ).toLocaleTimeString('es-DO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      itemsSectionTitle: 'Productos ingresados',
      items: rawItems.map((p: any) => ({
        code:
          p.productCode ||
          p.barcode ||
          (p.productId ? `PROD-${p.productId}` : 'N/A'),
        name: p.productName || p.description || 'Producto',
        description: p.description || '',
        quantity: Number(p.quantity) || 1,
        unitCost: Number(p.cost) || 0,
        totalCost: (Number(p.cost) || 0) * (Number(p.quantity) || 1),
      })),
      totalUnits:
        Number(entry.totalQuantity) ||
        rawItems.reduce(
          (s: number, i: any) => s + (Number(i.quantity) || 0),
          0,
        ) ||
        1,
      totalCost: Number(entry.totalCost) || 0,
      footerNote: 'Movimiento aplicado al inventario',
    };
    this.isReceiptModalOpen.set(true);
  }

  printVoucher(entry?: WarehouseEntry) {
    if (entry) {
      this.openReceiptModal(entry);
    } else {
      setTimeout(() => {
        window.print();
      }, 150);
    }
  }
}
