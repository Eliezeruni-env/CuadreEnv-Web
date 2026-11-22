import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MovementReceiptItem {
  code: string;
  name: string;
  description?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface MovementReceiptData {
  movementCode: string; // e.g. ENT-19
  movementType: 'entry' | 'outlet' | 'transfer';
  statusLabel: string; // e.g. 'Aplicado'
  warehouseName: string; // e.g. 'Almacén Principal'
  warehouseLocation?: string; // e.g. 'Bodega Central'
  conceptName: string; // e.g. 'Entrada de almacén'
  conceptDescription?: string; // e.g. 'Recepción de stock'
  date: string; // e.g. '22/11/2026'
  time: string; // e.g. '05:56 a. m.'
  items: MovementReceiptItem[];
  totalUnits: number;
  totalCost: number;
}

@Component({
  selector: 'app-warehouse-movement-receipt-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './warehouse-movement-receipt-modal.component.html',
  styleUrls: ['./warehouse-movement-receipt-modal.component.scss'],
})
export class WarehouseMovementReceiptModalComponent {
  @Input() isOpen = false;
  @Input() data: MovementReceiptData | null = null;
  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }

  printReceipt(): void {
    window.print();
  }
}
