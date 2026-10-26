import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cash-reconciliation-receipt',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cash-reconciliation-receipt.component.html',
  styleUrls: ['./cash-reconciliation-receipt.component.scss'],
})
export class CashReconciliationReceiptComponent {
  @Input() companyName = 'Mi Empresa SRL';
  @Input() companyRnc = '1-30-12345-6';
  @Input() date: Date | string = new Date();
  @Input() openedAt: Date | string | null = null;
  @Input() closedAt: Date | string | null = null;
  @Input() cashierName = 'Administrador';
  @Input() registerId = 1;

  @Input() initialAmount = 0;
  @Input() cashSales = 0;
  @Input() cardSales = 0;
  @Input() transferSales = 0;
  @Input() chequeSales = 0;
  @Input() cashInTotal = 0;
  @Input() cashOutTotal = 0;

  @Input() expectedAmount = 0;
  @Input() actualAmount = 0;
  @Input() difference = 0;

  printReceipt() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }
}
