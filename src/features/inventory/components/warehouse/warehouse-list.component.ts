import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WarehouseService } from '../../services/warehouse.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import type { Warehouse } from '../../../../app/models/warehouse';

@Component({
  selector: 'app-warehouse-list',
  standalone: true,
  imports: [CommonModule, FormsModule, KtPaginatorComponent],
  templateUrl: './warehouse-list.component.html',
  styleUrls: ['./warehouse-list.component.scss'],
})
export class WarehouseListComponent implements OnInit {
  private warehouseService = inject(WarehouseService);
  private notificationService = inject(NotificationService);

  warehouses = signal<Warehouse[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  isModalOpen = false;
  editingWarehouse: Warehouse | null = null;
  formModel: Partial<Warehouse> = {
    name: '',
    code: '',
    address: '',
    phone: '',
    managerName: '',
    isMain: false,
    isActive: true,
  };

  readonly filteredWarehouses = computed(() => {
    const q = this.searchTerm.toLowerCase().trim();
    if (!q) return this.warehouses();
    return this.warehouses().filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.code && w.code.toLowerCase().includes(q)) ||
        (w.managerName && w.managerName.toLowerCase().includes(q)),
    );
  });

  readonly pagedWarehouses = computed(() => {
    const list = this.filteredWarehouses();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  ngOnInit() {
    this.loadWarehouses();
  }

  async loadWarehouses() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const res = await this.warehouseService.getWarehouses();
      if (res?.data && res.data.length > 0) {
        this.warehouses.set(res.data);
      } else {
        const local = this.warehouseService.getLocalWarehouses();
        this.warehouses.set(local);
      }
    } catch {
      const local = this.warehouseService.getLocalWarehouses();
      this.warehouses.set(local);
    } finally {
      this.isLoading.set(false);
    }
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  openCreateModal() {
    this.editingWarehouse = null;
    this.formModel = {
      name: '',
      code: `ALM-${String(this.warehouses().length + 1).padStart(2, '0')}`,
      address: '',
      phone: '',
      managerName: '',
      isMain: false,
      isActive: true,
    };
    this.isModalOpen = true;
  }

  openEditModal(wh: Warehouse) {
    this.editingWarehouse = wh;
    this.formModel = { ...wh };
    this.isModalOpen = true;
  }

  async saveWarehouse() {
    if (!this.formModel.name?.trim()) {
      this.notificationService.warning('El nombre del almacén es obligatorio.');
      return;
    }

    if (this.editingWarehouse) {
      const res = await this.warehouseService.updateWarehouse({
        ...this.editingWarehouse,
        ...this.formModel,
      } as Warehouse);
      if (res?.success) {
        this.notificationService.success(res.message || 'Almacén actualizado.');
        this.isModalOpen = false;
        await this.loadWarehouses();
      }
    } else {
      const res = await this.warehouseService.createWarehouse(this.formModel);
      if (res?.success) {
        this.notificationService.success(res.message || 'Almacén creado exitosamente.');
        this.isModalOpen = false;
        await this.loadWarehouses();
      }
    }
  }

  async toggleActive(wh: Warehouse) {
    const updated = { ...wh, isActive: !wh.isActive };
    await this.warehouseService.updateWarehouse(updated);
    await this.loadWarehouses();
    this.notificationService.info(`Almacén "${wh.name}" ${updated.isActive ? 'activado' : 'desactivado'}.`);
  }

  async deleteWarehouse(wh: Warehouse) {
    if (wh.isMain) {
      this.notificationService.warning('No se puede eliminar el almacén principal.');
      return;
    }
    if (confirm(`¿Estás seguro de que deseas eliminar el almacén "${wh.name}"?`)) {
      await this.warehouseService.deleteWarehouse(wh.id);
      this.notificationService.success(`Almacén "${wh.name}" eliminado.`);
      await this.loadWarehouses();
    }
  }
}
