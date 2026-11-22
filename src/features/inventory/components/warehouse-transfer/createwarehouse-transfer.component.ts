import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WarehouseMovementFormComponent } from '../../../../app/shared/components/warehouse-movement-form/warehouse-movement-form.component';

@Component({
  selector: 'app-createwarehouse-transfer',
  standalone: true,
  imports: [CommonModule, WarehouseMovementFormComponent],
  templateUrl: './createwarehouse-transfer.component.html',
  styleUrls: ['./createwarehouse-transfer.component.scss'],
})
export class CreatewarehouseTransferComponent {}
