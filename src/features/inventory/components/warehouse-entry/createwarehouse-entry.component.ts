import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { InventoryGeneralDataComponent } from '../../../../app/shared/components/inventory-general-data/inventory-general-data.component';
import { ProductSearchComponent } from '../../../../app/shared/components/product-search/product-search.component';
import { AppProductTableComponent } from '../../../../app/shared/components/app-product-table/app-product-table.component';
import { WarehouseEntryService } from '../../services/warehouse-entry.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { ProductMovementDetail, WarehouseMovementHeader } from '../../../../app/models/movement';

@Component({
  selector: 'app-createwarehouse-entry',
  standalone: true,
  imports: [
    CommonModule,
    InventoryGeneralDataComponent,
    ProductSearchComponent,
    AppProductTableComponent,
  ],
  templateUrl: './createwarehouse-entry.component.html',
  styleUrls: ['./createwarehouse-entry.component.scss'],
})
export class CreatewarehouseEntryComponent {
  private entryService = inject(WarehouseEntryService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  header: Partial<WarehouseMovementHeader> = {
    warehouseId: 1,
    conceptId: 1,
    commentary: '',
  };

  productDetails: ProductMovementDetail[] = [];
  detailToEdit: ProductMovementDetail | null = null;
  editingIndex: number | null = null;

  isSaving = signal<boolean>(false);

  onHeaderChange(updated: Partial<WarehouseMovementHeader>) {
    this.header = { ...this.header, ...updated };
  }

  onProductAdded(item: ProductMovementDetail) {
    // If product already in list, increase quantity
    const existingIdx = this.productDetails.findIndex((d) => d.productId === item.productId);
    if (existingIdx !== -1) {
      this.productDetails[existingIdx].quantity += item.quantity;
      if (item.cost) this.productDetails[existingIdx].cost = item.cost;
      this.productDetails = [...this.productDetails];
    } else {
      this.productDetails = [...this.productDetails, item];
    }
  }

  onProductUpdated(item: ProductMovementDetail) {
    if (this.editingIndex !== null && this.editingIndex >= 0) {
      this.productDetails[this.editingIndex] = item;
      this.productDetails = [...this.productDetails];
      this.editingIndex = null;
      this.detailToEdit = null;
    }
  }

  onEditIndex(idx: number) {
    this.editingIndex = idx;
    this.detailToEdit = { ...this.productDetails[idx] };
  }

  onDeleteIndex(idx: number) {
    this.productDetails = this.productDetails.filter((_, i) => i !== idx);
    if (this.editingIndex === idx) {
      this.editingIndex = null;
      this.detailToEdit = null;
    }
  }

  async saveEntry() {
    if (this.productDetails.length === 0) {
      this.notificationService.warning('Debe agregar al menos un producto a la entrada.');
      return;
    }

    this.isSaving.set(true);
    try {
      const payload: WarehouseMovementHeader = {
        warehouseId: this.header.warehouseId || 1,
        conceptId: this.header.conceptId || 1,
        commentary: this.header.commentary || '',
        statusId: 1,
        productDetails: this.productDetails,
      };

      const res = await this.entryService.createEntry(payload);
      if (res?.success) {
        this.notificationService.success(res.message || 'Entrada registrada exitosamente.');
        this.router.navigate(['/inventory/entries']);
      } else {
        this.notificationService.error(res?.message || 'Error al guardar la entrada.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/inventory/entries']);
  }
}
