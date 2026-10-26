import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';
import { CashierService } from '../../../services/cashier.service';
import { CashierStateService } from '../../../services/cashierStateService.service';
import { CashMovementDto } from '../../../models/cashier';

@Component({
  selector: 'app-cash-movement-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconDirective],
  templateUrl: './cash-movement-dialog.component.html',
  styleUrls: ['./cash-movement-dialog.component.scss'],
})
export class CashMovementDialogComponent implements OnInit {
  @Input() visible = false;
  @Input() isLoading = false;
  @Output() movementRecorded = new EventEmitter<CashMovementDto>();
  @Output() cancel = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private cashierService = inject(CashierService);
  private cashierStateService = inject(CashierStateService);

  form!: FormGroup;

  ngOnInit() {
    this.form = this.fb.group({
      type: ['ENTRY', [Validators.required]],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      concept: ['', [Validators.required]],
      observations: [''],
    });
  }

  setType(type: 'ENTRY' | 'WITHDRAWAL') {
    this.form.patchValue({ type });
  }

  confirmMovement() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const state = this.cashierStateService.getState();
    const sessionId = state.session?.id || 1;

    const dto: CashMovementDto = {
      cashSessionId: sessionId,
      type: this.form.value.type,
      amount: Number(this.form.value.amount),
      concept: this.form.value.concept,
      observations: this.form.value.observations || '',
    };

    this.isLoading = true;
    this.cashierService.recordMovement(dto).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.movementRecorded.emit(res);
        this.cancel.emit();
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }
}
