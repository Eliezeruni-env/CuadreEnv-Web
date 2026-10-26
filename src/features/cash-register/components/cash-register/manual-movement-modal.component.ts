import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { CashRegisterService } from '../../services/cash-register.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import {
  ButtonDirective,
  FormControlDirective,
  FormDirective,
  FormSelectDirective,
  SpinnerComponent,
} from '@coreui/angular';

@Component({
  selector: 'app-manual-movement-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonDirective,
    FormControlDirective,
    FormDirective,
    FormSelectDirective,
    SpinnerComponent,
  ],
  templateUrl: './manual-movement-modal.component.html',
  styleUrls: ['./manual-movement-modal.component.scss'],
})
export class ManualMovementModalComponent {
  readonly translationService = inject(TranslationService);
  private cashRegisterService = inject(CashRegisterService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  movementType = signal<'Entrada' | 'Salida'>('Entrada');
  isLoading = signal<boolean>(false);

  form: FormGroup;

  constructor() {
    this.form = this.fb.group({
      amount: [null, [Validators.required, Validators.min(0.01)]],
      category: ['Ingresos', [Validators.required]],
      description: ['', [Validators.required, Validators.maxLength(200)]],
      reference: [''],
    });
  }

  open(type: 'Entrada' | 'Salida' = 'Entrada') {
    this.movementType.set(type);
    this.form.reset({
      amount: null,
      category: type === 'Entrada' ? 'Ingresos' : 'Gastos',
      description: '',
      reference: '',
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  setMovementType(type: 'Entrada' | 'Salida') {
    this.movementType.set(type);
    this.form.patchValue({
      category: type === 'Entrada' ? 'Ingresos' : 'Gastos',
    });
  }

  async saveMovement() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const val = this.form.value;

    try {
      const res = await this.cashRegisterService.addMovement({
        type: this.movementType(),
        category: val.category,
        description: val.description,
        amount: parseFloat(val.amount),
        reference: val.reference || null,
        paymentMethod: 'Efectivo',
      });

      if (res.success) {
        this.notificationService.success(
          `${this.movementType() === 'Entrada' ? 'Ingreso' : 'Salida'} de RD$ ${parseFloat(val.amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })} registrado exitosamente.`,
        );
        this.saved.emit();
        this.close();
      } else {
        this.notificationService.error(res.message || 'Error al guardar movimiento.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}
