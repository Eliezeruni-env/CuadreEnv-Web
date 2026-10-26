import { Component, Input, Output, EventEmitter, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { applyFieldErrorsToForm } from '../../../cuadreEnv/utils/api-error-mapper';
import type { CustomerDto } from '../../../cuadreEnv/types/api';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import {
  ButtonDirective,
  FormControlDirective,
  FormDirective,
  RowComponent,
  ColComponent,
  SpinnerComponent
} from '@coreui/angular';

@Component({
  selector: 'app-customer-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonDirective,
    FormControlDirective,
    FormDirective,
    RowComponent,
    ColComponent,
    SpinnerComponent
  ],
  templateUrl: './customer-modal.component.html',
})
export class CustomerModalComponent {
  readonly translationService = inject(TranslationService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  isEditMode = false;
  selectedCustomerId: number | null = null;
  isLoading = signal<boolean>(false);

  customerForm: FormGroup;

  constructor(
    private customerService: CustomerService,
    private notificationService: NotificationService,
    private fb: FormBuilder
  ) {
    this.customerForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(150)]],
      email: ['', [Validators.email]],
      phone: [''],
      identification: [''],
      active: [true]
    });
  }

  openCreate() {
    this.isEditMode = false;
    this.selectedCustomerId = null;
    this.customerForm.reset({
      name: '',
      email: '',
      phone: '',
      identification: '',
      active: true
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  openEdit(customer: CustomerDto) {
    this.isEditMode = true;
    this.selectedCustomerId = customer.id || null;
    this.customerForm.patchValue({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      identification: customer.identification || '',
      active: customer.active !== false
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async saveCustomer() {
    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formVal = this.customerForm.value;
    const payload: CustomerDto = { ...formVal };

    try {
      if (this.isEditMode) {
        payload.id = this.selectedCustomerId!;
        await this.customerService.updateCustomer(payload);
        this.notificationService.success('Perfil de cliente actualizado exitosamente.');
      } else {
        await this.customerService.createCustomer(payload);
        this.notificationService.success('Cliente registrado exitosamente.');
      }
      this.saved.emit();
      this.close();
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      if (mapped.fieldErrors) {
        applyFieldErrorsToForm(this.customerForm, mapped.fieldErrors);
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
