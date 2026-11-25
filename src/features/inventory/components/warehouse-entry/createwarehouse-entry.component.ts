import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WarehouseMovementFormComponent } from '../../../../app/shared/components/warehouse-movement-form/warehouse-movement-form.component';

@Component({
  selector: 'app-createwarehouse-entry',
  standalone: true,
  imports: [CommonModule, WarehouseMovementFormComponent],
  templateUrl: './createwarehouse-entry.component.html',
  styleUrls: ['./createwarehouse-entry.component.scss'],
})
export class CreatewarehouseEntryComponent {}
