import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WarehouseOutletService } from '../../services/warehouse-outlet.service';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import {
  WarehouseMovementReceiptModalComponent,
  type MovementReceiptData,
} from '../../../../app/shared/components/warehouse-movement-receipt-modal/warehouse-movement-receipt-modal.component';
import type { WarehouseOutlet } from '../../../../app/models/movement';

@Component({
  selector: 'app-listwarehouse-outlet',
  standalone: true,
  imports: [CommonModule, FormsModule, KtPaginatorComponent, WarehouseMovementReceiptModalComponent],
  templateUrl: './listwarehouse-outlet.component.html',
  styleUrls: ['./listwarehouse-outlet.component.scss'],
})
export class ListwarehouseOutletComponent implements OnInit {
  private outletService = inject(WarehouseOutletService);
  private router = inject(Router);

  outlets = signal<WarehouseOutlet[]>([]);
  isLoading = signal<boolean>(false);
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  expandedOutletId = signal<number | null>(null);

  // Receipt Modal State (Matching Image 2)
  isReceiptModalOpen = signal<boolean>(false);
  selectedReceiptData: MovementReceiptData | null = null;
  selectedOutlet: WarehouseOutlet | null = null;

  readonly filteredOutlets = computed(() => {
    const q = this.searchTerm.toLowerCase().trim();
    if (!q) return this.outlets();
    return this.outlets().filter(
      (o) =>
        (o.movementNumber || '').toLowerCase().includes(q) ||
        (o.warehouseName || '').toLowerCase().includes(q) ||
        (o.conceptName || '').toLowerCase().includes(q) ||
        (o.commentary || '').toLowerCase().includes(q),
    );
  });

  readonly pagedOutlets = computed(() => {
    const list = this.filteredOutlets();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  ngOnInit() {
    this.loadOutlets();
  }

  async loadOutlets() {
    this.isLoading.set(true);
    try {
      const res = await this.outletService.getOutlets();
      if (res?.success && res.data) {
        const safeData = (res.data || []).map((o: any) => ({
          ...o,
          productDetails: o.productDetails || o.details || o.items || [],
        }));
        this.outlets.set(safeData);
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

  async toggleDetail(outlet: WarehouseOutlet) {
    if (outlet.id != null) {
      if (this.expandedOutletId() === outlet.id) {
        this.expandedOutletId.set(null);
      } else {
        this.expandedOutletId.set(outlet.id);
        if (!outlet.productDetails || outlet.productDetails.length === 0) {
          try {
            const res = await this.outletService.getOutlet(outlet.id);
            if (res.success && res.data) {
              const current = this.outlets();
              const idx = current.findIndex((item) => item.id === outlet.id);
              if (idx !== -1) {
                current[idx] = res.data;
                this.outlets.set([...current]);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }

  isOutletExpanded(outletId?: number): boolean {
    return outletId != null && this.expandedOutletId() === outletId;
  }

  goToNewOutlet() {
    this.router.navigate(['/inventory/outlets/create']);
  }

  goToCreate() {
    this.goToNewOutlet();
  }

  viewOutlet(outlet: WarehouseOutlet) {
    this.openReceiptModal(outlet);
  }

  viewDetail(outlet: WarehouseOutlet) {
    this.openReceiptModal(outlet);
  }

  openReceiptModal(outlet: WarehouseOutlet): void {
    const code = outlet.movementNumber || `SAL-${outlet.id}`;
    const rawItems = outlet.productDetails || [];
    this.selectedReceiptData = {
      movementCode: code,
      movementType: 'outlet',
      statusLabel: outlet.statusName || 'Aplicado',
      title: 'Comprobante de salida de almacén',
      firstColumnHeader: 'COMPROBANTE',
      warehouseName: outlet.warehouseName || 'Almacén Principal',
      secondColumnHeader: 'ALMACÉN ORIGEN',
      warehouseLocation: (outlet as any).warehouseLocation || 'Bodega Emisora',
      conceptName: outlet.conceptName || 'Salida de almacén',
      thirdColumnHeader: 'CONCEPTO',
      conceptDescription: outlet.commentary || 'Despacho de stock',
      fourthColumnHeader: 'FECHA Y HORA',
      date: new Date(outlet.createDate || (outlet as any).createdAt || Date.now()).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: new Date(outlet.createDate || (outlet as any).createdAt || Date.now()).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }),
      itemsSectionTitle: 'Productos descargados',
      items: rawItems.map((p: any) => ({
        code: p.productCode || p.barcode || p.barCode || (p.productId ? `PROD-${p.productId}` : 'N/A'),
        name: p.productName || p.description || 'Producto',
        description: p.description || '',
        quantity: Number(p.quantity) || 1,
        unitCost: Number(p.cost || p.price) || 0,
        totalCost: (Number(p.cost || p.price) || 0) * (Number(p.quantity) || 1),
      })),
      totalUnits: Number(outlet.totalQuantity) || rawItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0) || 1,
      totalCost: Number(outlet.totalCost) || 0,
      footerNote: 'Movimiento aplicado al inventario',
    };
    this.isReceiptModalOpen.set(true);
  }

  printVoucher(outlet?: WarehouseOutlet) {
    if (outlet) {
      this.openReceiptModal(outlet);
    } else {
      setTimeout(() => {
        window.print();
      }, 150);
    }
  }
}
