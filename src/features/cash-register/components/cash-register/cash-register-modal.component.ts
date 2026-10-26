import { Component, Input, Output, EventEmitter, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CashRegisterService } from '../../services/cash-register.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { CashRegisterDto } from '../../../cuadreEnv/types/api';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import {
  ButtonDirective,
  ColComponent,
  FormControlDirective,
  FormDirective,
  RowComponent,
  SpinnerComponent,
  FormSelectDirective
} from '@coreui/angular';

@Component({
  selector: 'app-cash-register-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonDirective,
    FormControlDirective,
    FormDirective,
    RowComponent,
    ColComponent,
    SpinnerComponent,
    FormSelectDirective
  ],
  templateUrl: './cash-register-modal.component.html',
})
export class CashRegisterModalComponent implements OnInit {
  readonly translationService = inject(TranslationService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  mode: 'open' | 'close' | 'movement' | null = null;
  selectedRegister: CashRegisterDto | null = null;
  registers = signal<CashRegisterDto[]>([]);
  isLoading = signal<boolean>(false);

  registerForm: FormGroup;
  closeForm: FormGroup;
  movementForm: FormGroup;

  constructor(
    private cashRegisterService: CashRegisterService,
    private notificationService: NotificationService,
    private fb: FormBuilder
  ) {
    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]]
    });

    this.closeForm = this.fb.group({
      finalBalance: [0, [Validators.required, Validators.min(0)]]
    });

    this.movementForm = this.fb.group({
      cashRegisterId: ['', [Validators.required]],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      type: ['In', [Validators.required]],
      description: ['', [Validators.maxLength(250)]]
    });
  }

  ngOnInit() {
    this.loadRegistersList();
  }

  async loadRegistersList() {
    try {
      const res = await this.cashRegisterService.getCashRegisters();
      if (res.success && res.data) {
        this.registers.set(res.data);
      }
    } catch (e: any) {
      console.error('Failed to load cash registers:', e?.message || e);
    }
  }

  openRegisterForm() {
    this.mode = 'open';
    this.registerForm.reset({ name: '' });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  openCloseForm(register: CashRegisterDto) {
    this.mode = 'close';
    this.selectedRegister = register;
    this.closeForm.reset({ finalBalance: register.balance });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  openMovementForm() {
    this.mode = 'movement';
    this.loadRegistersList();
    this.movementForm.reset({
      cashRegisterId: '',
      amount: 0,
      type: 'In',
      description: ''
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.mode = null;
    this.selectedRegister = null;
  }

  async openRegister() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const name = this.registerForm.value.name;

    try {
      const res = await this.cashRegisterService.openCashRegister(name);
      if (res.success) {
        this.notificationService.success(`Caja registradora "${name}" abierta exitosamente.`);
        this.saved.emit();
        this.close();
      } else {
        this.notificationService.error(res.message || 'Error al abrir caja.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async closeRegister() {
    if (this.closeForm.invalid || !this.selectedRegister) {
      this.closeForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const balance = this.closeForm.value.finalBalance;

    try {
      await this.cashRegisterService.closeCashRegister(this.selectedRegister.id!, balance);
      this.notificationService.success('Caja registradora cerrada exitosamente.');
      this.saved.emit();
      this.close();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveMovement() {
    if (this.movementForm.invalid) {
      this.movementForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const val = this.movementForm.value;

    try {
      await this.cashRegisterService.createCashMovement({
        cashRegisterId: parseInt(val.cashRegisterId, 10),
        amount: val.amount,
        type: val.type,
        description: val.description || null
      });
      this.notificationService.success('Movimiento de caja registrado exitosamente.');
      this.saved.emit();
      this.close();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}
