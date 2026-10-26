import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';
import { CashierService } from '../../../services/cashier.service';
import { CashierStateService } from '../../../services/cashierStateService.service';
import { CashSessionSummaryDto } from '../../../models/cashier';

@Component({
  selector: 'app-cash-reconciliation-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconDirective],
  templateUrl: './cash-reconciliation-dialog.component.html',
  styleUrls: ['./cash-reconciliation-dialog.component.scss'],
})
export class CashReconciliationDialogComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() isLoading = false;
  @Output() closeCompleted = new EventEmitter<{
    actualAmount: number;
    expectedAmount: number;
    difference: number;
    observations: string;
    summary: CashSessionSummaryDto | null;
  }>();
  @Output() cancel = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private cashierService = inject(CashierService);
  private cashierStateService = inject(CashierStateService);

  form!: FormGroup;
  summary: CashSessionSummaryDto | null = null;
  activeSessionId = 1;

  ngOnInit() {
    this.form = this.fb.group({
      actualAmount: [0, [Validators.required, Validators.min(0)]],
      observations: [''],
    });

    if (this.visible) {
      this.loadSummary();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']?.currentValue) {
      this.loadSummary();
    }
  }

  loadSummary() {
    const state = this.cashierStateService.getState();
    this.activeSessionId = state.session?.id || 1;

    this.cashierService.getSessionSummary(this.activeSessionId).subscribe({
      next: (summary) => {
        this.summary = summary;
        // Default physical count to expected
        if (this.form) {
          this.form.patchValue({ actualAmount: this.expectedAmount });
        }
      },
      error: () => {
        // Handled in service fallback
      },
    });
  }

  get expectedAmount(): number {
    if (!this.summary) return 0;
    return (
      (this.summary.openingAmount || 0) +
      (this.summary.totalCashSales || 0) +
      (this.summary.totalEntries || 0) -
      (this.summary.totalWithdrawals || 0)
    );
  }

  get actualAmount(): number {
    return Number(this.form?.get('actualAmount')?.value || 0);
  }

  get difference(): number {
    return this.actualAmount - this.expectedAmount;
  }

  get statusLabel(): string {
    if (this.difference === 0) return 'Cuadre exacto';
    return this.difference > 0 ? 'Sobrante' : 'Faltante';
  }

  get statusBadgeClass(): string {
    if (this.difference === 0) return 'bg-primary text-white';
    return this.difference > 0 ? 'bg-success text-white' : 'bg-danger text-white';
  }

  get statusTextClass(): string {
    if (this.difference === 0) return 'text-primary';
    return this.difference > 0 ? 'text-success' : 'text-danger';
  }

  get statusBoxClass(): string {
    if (this.difference === 0) return 'bg-primary-subtle border-primary-subtle';
    return this.difference > 0 ? 'bg-success-subtle border-success-subtle' : 'bg-danger-subtle border-danger-subtle';
  }

  get isConfirmDisabled(): boolean {
    if (!this.form || this.form.invalid || this.isLoading) return true;
    // Obligatory observation when difference exists
    if (this.difference !== 0 && !this.form.value.observations?.trim()) {
      return true;
    }
    return false;
  }

  confirmClose() {
    if (this.isConfirmDisabled) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    const { actualAmount, observations } = this.form.value;

    this.cashierService
      .closeSession(this.activeSessionId, {
        closingAmount: actualAmount,
        observations,
      })
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.cashierStateService.closeSession(actualAmount);
          this.closeCompleted.emit({
            actualAmount,
            expectedAmount: this.expectedAmount,
            difference: this.difference,
            observations,
            summary: this.summary,
          });
          this.cancel.emit();
        },
        error: () => {
          this.isLoading = false;
        },
      });
  }
}
