import {
  Component,
  Input,
  Output,
  EventEmitter,
  TemplateRef,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProductMovementDetail } from '../../../models/movement';

export interface TableColumn {
  field: string;
  label: string;
  align?: 'start' | 'center' | 'end';
  width?: string;
  sortable?: boolean;
}

@Component({
  selector: 'app-product-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-product-table.component.html',
  styleUrls: ['./app-product-table.component.scss'],
})
export class AppProductTableComponent implements OnChanges {
  @Input() columns: TableColumn[] = [];
  @Input() rows: any[] = [];
  @Input() items: ProductMovementDetail[] = [];
  @Input() mode: 'entry' | 'outlet' | 'transfer' = 'entry';
  @Input() loading = false;
  @Input() emptyMessage = 'No se han agregado productos al movimiento.';
  @Input() rowTemplate?: TemplateRef<any>;

  @Output() editIndex = new EventEmitter<number>();
  @Output() deleteIndex = new EventEmitter<number>();
  @Output() totalsChange = new EventEmitter<{ totalQuantity: number; totalCost: number }>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['items'] && this.items) {
      this.emitTotals();
    }
  }

  get totalQuantity(): number {
    return (this.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
  }

  get totalCost(): number {
    return (this.items || []).reduce(
      (acc, it) => acc + (it.quantity || 0) * (it.cost || it.price || 0),
      0,
    );
  }

  emitTotals() {
    this.totalsChange.emit({
      totalQuantity: this.totalQuantity,
      totalCost: this.totalCost,
    });
  }

  onEdit(idx: number) {
    this.editIndex.emit(idx);
  }

  onDelete(idx: number) {
    this.deleteIndex.emit(idx);
  }
}
