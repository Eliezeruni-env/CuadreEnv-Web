import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-pos-payments',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './payments.component.html',
  styleUrls: ['./payments.component.scss'],
})
export class PosPaymentsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  totalToPay = 0;
  selectedMethod: 'CASH' | 'CARD' | 'TRANSFER' = 'CASH';
  receivedCash = 0;

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.totalToPay = parseFloat(params['total'] || '0');
      this.receivedCash = this.totalToPay;
    });
  }

  onCashInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.receivedCash = parseFloat(input.value || '0');
  }

  finalizePayment() {
    alert('¡Venta completada exitosamente!');
    this.router.navigate(['/pos']);
  }
}
