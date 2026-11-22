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
  movementCode: string; // e.g. ENT-19, #88, FAC-0012
  movementType: 'entry' | 'outlet' | 'transfer' | 'sale' | 'purchase';
  statusLabel: string; // e.g. 'Aplicado', 'Pagada'
  title?: string; // custom title if provided
  firstColumnHeader?: string; // e.g. 'COMPROBANTE' or 'NO. FACTURA'
  warehouseName: string; // e.g. 'Almacén Principal' or 'Consumidor Final'
  secondColumnHeader?: string; // e.g. 'ALMACÉN DESTINO' or 'CLIENTE'
  warehouseLocation?: string; // e.g. 'Bodega Central' or 'ID Cliente: 1'
  conceptName: string; // e.g. 'Entrada de almacén' or 'Efectivo'
  thirdColumnHeader?: string; // e.g. 'CONCEPTO' or 'MÉTODO DE PAGO'
  conceptDescription?: string; // e.g. 'Recepción de stock' or 'POS - Caja 54'
  fourthColumnHeader?: string; // e.g. 'FECHA Y HORA'
  date: string; // e.g. '22/11/2026'
  time: string; // e.g. '05:56 a. m.'
  itemsSectionTitle?: string; // e.g. 'Productos ingresados' or 'Artículos vendidos'
  items: MovementReceiptItem[];
  totalUnits: number;
  totalCost: number;
  footerNote?: string;
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
