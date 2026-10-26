import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WarehouseService } from '../../../../features/inventory/services/warehouse.service';
import type { Warehouse, WarehouseConcept } from '../../../models/warehouse';
import type { WarehouseMovementHeader } from '../../../models/movement';

@Component({
  selector: 'app-inventory-general-data',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory-general-data.component.html',
  styleUrls: ['./inventory-general-data.component.scss'],
})
export class InventoryGeneralDataComponent implements OnInit, OnChanges {
  private warehouseService = inject(WarehouseService);

  @Input() mode: 'entry' | 'outlet' | 'transfer' = 'entry';
  @Input() header: Partial<WarehouseMovementHeader> = {};
  @Output() headerChange = new EventEmitter<Partial<WarehouseMovementHeader>>();

  warehouses: Warehouse[] = [];
  concepts: WarehouseConcept[] = [];

  warehouseId = 1;
  warehouseOfOriginId = 1;
  destinationWarehouseId = 2;
  conceptId = 1;
  commentary = '';

  async ngOnInit() {
    await this.loadCatalogs();
    this.syncFromInput();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['header'] || changes['mode']) {
      this.syncFromInput();
      this.loadConcepts();
    }
  }

  async loadCatalogs() {
    const res = await this.warehouseService.getWarehouses();
    if (res?.success && res.data) {
      this.warehouses = res.data.filter((w) => w.isActive !== false);

      if (this.warehouses.length > 0) {
        if (!this.warehouses.some((w) => w.id === this.warehouseId)) {
          this.warehouseId = this.warehouses[0].id;
        }
        if (!this.warehouses.some((w) => w.id === this.warehouseOfOriginId)) {
          this.warehouseOfOriginId = this.warehouses[0].id;
        }
        if (!this.warehouses.some((w) => w.id === this.destinationWarehouseId)) {
          this.destinationWarehouseId = this.warehouses.length > 1 ? this.warehouses[1].id : this.warehouses[0].id;
        }
      }
    }
    this.loadConcepts();
    this.emitChange();
  }

  loadConcepts() {
    const type = this.mode === 'entry' ? 'ENTRY' : this.mode === 'outlet' ? 'OUTLET' : 'TRANSFER';
    this.concepts = this.warehouseService.getConcepts(type);
    if (this.concepts.length > 0 && !this.concepts.some((c) => c.id === this.conceptId)) {
      this.conceptId = this.concepts[0].id;
    }
  }

  syncFromInput() {
    if (this.header) {
      if (this.header.warehouseId) this.warehouseId = this.header.warehouseId;
      if (this.header.warehouseOfOriginId) this.warehouseOfOriginId = this.header.warehouseOfOriginId;
      if (this.header.destinationWarehouseId) this.destinationWarehouseId = this.header.destinationWarehouseId;
      if (this.header.conceptId) this.conceptId = this.header.conceptId;
      if (this.header.commentary !== undefined) this.commentary = this.header.commentary;
    }
  }

  emitChange() {
    const currentWh = this.warehouses.find((w) => w.id === this.warehouseId);
    const originWh = this.warehouses.find((w) => w.id === this.warehouseOfOriginId);
    const destWh = this.warehouses.find((w) => w.id === this.destinationWarehouseId);
    const concept = this.concepts.find((c) => c.id === this.conceptId);

    const updated: Partial<WarehouseMovementHeader> = {
      warehouseId: this.mode === 'transfer' ? this.warehouseOfOriginId : this.warehouseId,
      warehouseName: currentWh?.name,
      warehouseOfOriginId: this.warehouseOfOriginId,
      warehouseOfOriginName: originWh?.name,
      destinationWarehouseId: this.destinationWarehouseId,
      destinationWarehouseName: destWh?.name,
      conceptId: this.conceptId,
      conceptName: concept?.name,
      commentary: this.commentary,
    };

    this.headerChange.emit(updated);
  }
}
