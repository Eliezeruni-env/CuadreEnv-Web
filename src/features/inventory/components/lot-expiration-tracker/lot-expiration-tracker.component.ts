import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LotExpirationService,
  LotBatchRecord,
  LotStatus,
} from '../../services/lot-expiration.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ProductService } from '../../../products/services/product.service';
import type { ProductDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-lot-expiration-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lot-expiration-tracker.component.html',
  styleUrls: ['./lot-expiration-tracker.component.scss'],
})
export class LotExpirationTrackerComponent implements OnInit {
  readonly Math = Math;
  private readonly lotService = inject(LotExpirationService);
  private readonly notificationService = inject(NotificationService);
  private readonly productService = inject(ProductService);

  lots = signal<LotBatchRecord[]>([]);
  isLoading = signal<boolean>(false);

  // Filtros
  searchTerm = signal<string>('');
  statusFilter = signal<string>('ALL');

  // Modal para registrar nuevo lote
  isCreateModalOpen = signal<boolean>(false);
  productsList = signal<ProductDto[]>([]);
  selectedProductId = signal<number | ''>('');
  newLotNumber = signal<string>('');
  newExpirationDate = signal<string>('');
  newQuantity = signal<number>(10);
  newCost = signal<number>(0);

  // KPIs
  readonly expiredCount = computed(() => {
    return this.lots().filter((l) => l.status === 'EXPIRED').length;
  });

  readonly criticalCount = computed(() => {
    return this.lots().filter((l) => l.status === 'CRITICAL').length;
  });

  readonly warningCount = computed(() => {
    return this.lots().filter((l) => l.status === 'WARNING').length;
  });

  readonly healthyCount = computed(() => {
    return this.lots().filter((l) => l.status === 'HEALTHY').length;
  });

  readonly totalCostAtRisk = computed(() => {
    return this.lots()
      .filter((l) => l.status === 'EXPIRED' || l.status === 'CRITICAL')
      .reduce((acc, l) => acc + l.totalCost, 0);
  });

  readonly filteredLots = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const st = this.statusFilter();

    return this.lots().filter((l) => {
      if (st !== 'ALL' && l.status !== st) return false;
      if (!q) return true;
      return (
        l.productName.toLowerCase().includes(q) ||
        l.lotNumber.toLowerCase().includes(q) ||
        (l.barcode && l.barcode.includes(q))
      );
    });
  });

  ngOnInit(): void {
    void this.loadLots();
    void this.loadProducts();
  }

  async loadLots(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.lotService.getLotBatches();
      this.lots.set(data);
    } catch (e) {
      console.warn('Error loading lots:', e);
      this.notificationService.error('Error cargando el control de lotes y vencimientos.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadProducts(): Promise<void> {
    try {
      const res = await this.productService.getPagedProducts(1, 100, undefined, undefined, undefined, true);
      this.productsList.set((res.data?.items as ProductDto[]) || []);
    } catch {
      // ignore
    }
  }

  openCreateModal(): void {
    this.selectedProductId.set('');
    this.newLotNumber.set(`LOT-${Date.now().toString().slice(-5)}`);
    this.newExpirationDate.set(new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    this.newQuantity.set(20);
    this.newCost.set(0);
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  onProductSelected(): void {
    const pId = Number(this.selectedProductId());
    const prod = this.productsList().find((p) => p.id === pId);
    if (prod) {
      this.newCost.set(Number(prod.cost || 0));
    }
  }

  saveNewLot(): void {
    const pId = Number(this.selectedProductId());
    const prod = this.productsList().find((p) => p.id === pId);

    if (!prod) {
      this.notificationService.warning('Selecciona un producto.');
      return;
    }

    if (!this.newLotNumber().trim()) {
      this.notificationService.warning('Ingresa el número de lote.');
      return;
    }

    if (!this.newExpirationDate()) {
      this.notificationService.warning('Ingresa la fecha de vencimiento.');
      return;
    }

    const created = this.lotService.saveLotBatch({
      productId: Number(prod.id) || 1,
      productName: prod.description || `Producto #${prod.id}`,
      barcode: prod.barcode || undefined,
      lotNumber: this.newLotNumber().trim(),
      expirationDate: this.newExpirationDate(),
      quantity: Number(this.newQuantity()) || 1,
      unitCost: Number(this.newCost()) || Number(prod.cost || 0),
    });

    this.lots.update((list) => [created, ...list]);
    this.notificationService.success(`Lote ${created.lotNumber} registrado correctamente.`);
    this.closeCreateModal();
  }

  deleteLot(id: string): void {
    this.lotService.deleteLotBatch(id);
    this.lots.update((list) => list.filter((l) => l.id !== id));
    this.notificationService.info('Registro de lote eliminado.');
  }
}
