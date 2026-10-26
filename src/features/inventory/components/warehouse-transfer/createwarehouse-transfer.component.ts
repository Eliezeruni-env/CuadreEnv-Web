import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { InventoryGeneralDataComponent } from '../../../../app/shared/components/inventory-general-data/inventory-general-data.component';
import { ProductSearchComponent } from '../../../../app/shared/components/product-search/product-search.component';
import { AppProductTableComponent } from '../../../../app/shared/components/app-product-table/app-product-table.component';
import { WarehouseTransferService } from '../../services/warehouse-transfer.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { ProductMovementDetail, WarehouseMovementHeader } from '../../../../app/models/movement';

@Component({
  selector: 'app-createwarehouse-transfer',
  standalone: true,
  imports: [
    CommonModule,
    InventoryGeneralDataComponent,
    ProductSearchComponent,
    AppProductTableComponent,
  ],
  templateUrl: './createwarehouse-transfer.component.html',
  styleUrls: ['./createwarehouse-transfer.component.scss'],
})
export class CreatewarehouseTransferComponent {
  private transferService = inject(WarehouseTransferService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  header: Partial<WarehouseMovementHeader> = {
    warehouseOfOriginId: 1,
    destinationWarehouseId: 2,
    conceptId: 8, // Transferencia Inter-Sucursales
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
    const existingIdx = this.productDetails.findIndex((d) => d.productId === item.productId);
    if (existingIdx !== -1) {
      this.productDetails[existingIdx].quantity += item.quantity;
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

  async saveTransfer() {
    if (this.productDetails.length === 0) {
      this.notificationService.warning('Debe agregar al menos un producto a la transferencia.');
      return;
    }

    if (this.header.warehouseOfOriginId === this.header.destinationWarehouseId) {
      this.notificationService.error('El almacén de origen y destino no pueden ser iguales.');
      return;
    }

    this.isSaving.set(true);
    try {
      const payload: WarehouseMovementHeader = {
        warehouseOfOriginId: this.header.warehouseOfOriginId || 1,
        destinationWarehouseId: this.header.destinationWarehouseId || 2,
        conceptId: this.header.conceptId || 8,
        commentary: this.header.commentary || '',
        statusId: 1,
        productDetails: this.productDetails,
      };

      const res = await this.transferService.createTransfer(payload);
      if (res?.success) {
        this.notificationService.success(res.message || 'Transferencia completada exitosamente.');
        this.router.navigate(['/inventory/transfers']);
      } else {
        this.notificationService.error(res?.message || 'Error al procesar la transferencia.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/inventory/transfers']);
  }
}
