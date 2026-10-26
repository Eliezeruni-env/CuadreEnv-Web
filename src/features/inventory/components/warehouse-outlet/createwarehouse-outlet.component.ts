import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { InventoryGeneralDataComponent } from '../../../../app/shared/components/inventory-general-data/inventory-general-data.component';
import { ProductSearchComponent } from '../../../../app/shared/components/product-search/product-search.component';
import { AppProductTableComponent } from '../../../../app/shared/components/app-product-table/app-product-table.component';
import { WarehouseOutletService } from '../../services/warehouse-outlet.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { ProductMovementDetail, WarehouseMovementHeader } from '../../../../app/models/movement';

@Component({
  selector: 'app-createwarehouse-outlet',
  standalone: true,
  imports: [
    CommonModule,
    InventoryGeneralDataComponent,
    ProductSearchComponent,
    AppProductTableComponent,
  ],
  templateUrl: './createwarehouse-outlet.component.html',
  styleUrls: ['./createwarehouse-outlet.component.scss'],
})
export class CreatewarehouseOutletComponent {
  private outletService = inject(WarehouseOutletService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  header: Partial<WarehouseMovementHeader> = {
    warehouseId: 1,
    conceptId: 4, // Consumo Interno
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

  async saveOutlet() {
    if (this.productDetails.length === 0) {
      this.notificationService.warning('Debe agregar al menos un producto a la salida.');
      return;
    }

    this.isSaving.set(true);
    try {
      const payload: WarehouseMovementHeader = {
        warehouseId: this.header.warehouseId || 1,
        conceptId: this.header.conceptId || 4,
        commentary: this.header.commentary || '',
        statusId: 1,
        productDetails: this.productDetails,
      };

      const res = await this.outletService.createOutlet(payload);
      if (res?.success) {
        this.notificationService.success(res.message || 'Salida procesada exitosamente.');
        this.router.navigate(['/inventory/outlets']);
      } else {
        this.notificationService.error(res?.message || 'Error al procesar la salida.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/inventory/outlets']);
  }
}
