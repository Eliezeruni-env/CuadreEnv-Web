import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BillingService } from '../../services/billing.service';
import type { ProductDetails, TotalModels } from '../../../../app/models/billing';

@Component({
  selector: 'app-product-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-table.component.html',
  styleUrls: ['./product-table.component.scss'],
})
export class ProductTableComponent {
  private billingService = inject(BillingService);

  @Input() details: ProductDetails[] = [];

  @Output() editIndex = new EventEmitter<number>();
  @Output() deleteIndex = new EventEmitter<number>();
  @Output() totalsChange = new EventEmitter<TotalModels>();
  @Output() clearRequested = new EventEmitter<void>();

  get totals(): TotalModels {
    return this.billingService.calculateTotals(this.details);
  }

  onEdit(index: number) {
    this.editIndex.emit(index);
  }

  onDelete(index: number) {
    this.deleteIndex.emit(index);
  }

  clearAll() {
    this.clearRequested.emit();
  }
}
