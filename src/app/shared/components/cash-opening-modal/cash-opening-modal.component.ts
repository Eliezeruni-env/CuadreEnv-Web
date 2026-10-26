import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';
import { CashierService } from '../../../services/cashier.service';
import { CashierStateService } from '../../../services/cashierStateService.service';
import { CashierDto, CashSessionDto } from '../../../models/cashier';

@Component({
  selector: 'app-cash-opening-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconDirective],
  templateUrl: './cash-opening-modal.component.html',
  styleUrls: ['./cash-opening-modal.component.scss'],
})
export class CashOpeningModalComponent implements OnInit {
  @Input() visible = false;
  @Input() isLoading = false;
  @Output() sessionOpened = new EventEmitter<CashSessionDto>();
  @Output() cancel = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private cashierService = inject(CashierService);
  private cashierStateService = inject(CashierStateService);

  cashiers: CashierDto[] = [];
  form!: FormGroup;

  ngOnInit() {
    this.form = this.fb.group({
      cashierId: [null, [Validators.required]],
      openingAmount: [0, [Validators.required, Validators.min(0)]],
      pin: [''],
      notes: [''],
    });

    this.cashierService.getCashiers().subscribe((list) => {
      this.cashiers = list.filter((c) => c.isActive);
      if (this.cashiers.length > 0 && !this.form.value.cashierId) {
        this.form.patchValue({ cashierId: this.cashiers[0].id });
      }
    });
  }

  confirmOpen() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    const { cashierId, openingAmount, pin } = this.form.value;
    const selectedCashier = this.cashiers.find((c) => c.id === cashierId);

    this.cashierService
      .openSession({ cashierId, openingAmount, pin })
      .subscribe({
        next: (session) => {
          this.isLoading = false;
          if (selectedCashier) {
            this.cashierStateService.setCashier(selectedCashier);
          }
          this.cashierStateService.setSession(session);
          this.sessionOpened.emit(session);
          this.cancel.emit();
        },
        error: () => {
          this.isLoading = false;
        },
      });
  }
}
