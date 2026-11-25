import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WarehouseMovementFormComponent } from '../../../../app/shared/components/warehouse-movement-form/warehouse-movement-form.component';

@Component({
  selector: 'app-createwarehouse-outlet',
  standalone: true,
  imports: [CommonModule, WarehouseMovementFormComponent],
  templateUrl: './createwarehouse-outlet.component.html',
  styleUrls: ['./createwarehouse-outlet.component.scss'],
})
export class CreatewarehouseOutletComponent {}
