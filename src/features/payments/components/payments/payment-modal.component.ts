import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { PaymentService } from '../../services/payment.service';
import { SaleService } from '../../../sales/services/sale.service';
import { PurchaseService } from '../../../purchases/services/purchase.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { applyFieldErrorsToForm } from '../../../cuadreEnv/utils/api-error-mapper';
import type {
  PaymentDto,
  SaleResponseDto,
  PurchaseDto,
} from '../../../cuadreEnv/types/api';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import {
  SpinnerComponent,
} from '@coreui/angular';

@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SpinnerComponent,
  ],
  templateUrl: './payment-modal.component.html',
  styleUrls: ['./payment-modal.component.scss'],
})
export class PaymentModalComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  private paymentService = inject(PaymentService);
  private saleService = inject(SaleService);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  paymentType = signal<'purchase' | 'sale'>('purchase');
  sales = signal<SaleResponseDto[]>([]);
  purchases = signal<PurchaseDto[]>([]);
  isLoading = signal<boolean>(false);

  // Form Fields for specific methods
  selectedMethod = signal<string>('Transferencia bancaria');
  paymentDate = signal<string>(new Date().toISOString().split('T')[0]);
  selectedSupplierName = signal<string>('Distribuidora del Caribe');
  selectedPurchaseOrderCode = signal<string>('OC-00045');
  selectedPurchaseTotal = signal<number>(15000);
  selectedPurchasePaid = signal<number>(5000);

  // Card fields
  cardType = signal<string>('Visa');
  cardLastFour = signal<string>('');
  cardAuthVoucher = signal<string>('');

  // Transfer fields
  transferSenderBank = signal<string>('Banco Popular');
  transferReceiverBank = signal<string>('Banco BHD');
  transferReference = signal<string>('REF-884129');

  // Check fields
  checkBank = signal<string>('Banco de Reservas');
  checkNumber = signal<string>('');
  checkDate = signal<string>(new Date().toISOString().split('T')[0]);

  paymentForm: FormGroup;

  get currentPendingBalance(): number {
    return Math.max(
      0,
      this.selectedPurchaseTotal() - this.selectedPurchasePaid(),
    );
  }

  get balanceAfterPayment(): number {
    const amount = Number(this.paymentForm.get('amount')?.value) || 0;
    return Math.max(0, this.currentPendingBalance - amount);
  }

  constructor() {
    this.paymentForm = this.fb.group({
      saleId: [''],
      purchaseId: [''],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      method: ['Transferencia Bancaria', [Validators.required]],
      reference: [''],
      notes: [''],
    });

    // Autofill amount when saleId changes
    this.paymentForm.get('saleId')?.valueChanges.subscribe((id) => {
      if (id) {
        const found = this.sales().find((s) => s.id === Number(id));
        if (found) {
          this.paymentForm.patchValue(
            { amount: found.total },
            { emitEvent: false },
          );
        }
      }
    });

    // Autofill amount when purchaseId changes
    this.paymentForm.get('purchaseId')?.valueChanges.subscribe((id) => {
      if (id) {
        const found = this.purchases().find((p) => p.id === Number(id));
        if (found) {
          this.paymentForm.patchValue(
            { amount: found.total },
            { emitEvent: false },
          );
        }
      }
    });

    this.paymentForm.get('method')?.valueChanges.subscribe((m) => {
      if (m) this.selectedMethod.set(m);
    });
  }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    try {
      const [saleRes, purchaseRes] = await Promise.all([
        this.saleService.getSales(),
        this.purchaseService.getPurchases(),
      ]);

      if (saleRes?.success && saleRes.data) {
        this.sales.set(saleRes.data);
      }
      if (purchaseRes?.success && purchaseRes.data) {
        this.purchases.set(purchaseRes.data);
      }
    } catch (e: any) {
      console.error('Failed to load pending sales/purchases:', e?.message || e);
    }
  }

  setPaymentType(type: 'sale' | 'purchase') {
    this.paymentType.set(type);
    if (type === 'sale') {
      this.paymentForm.patchValue({ purchaseId: '', amount: 0 });
    } else {
      this.paymentForm.patchValue({ saleId: '', amount: 0 });
    }
  }

  openCreate(defaultPurchaseId?: number) {
    this.paymentType.set('purchase');
    this.selectedMethod.set('Transferencia bancaria');
    this.cardLastFour.set('');
    this.cardAuthVoucher.set('');
    this.transferReference.set('REF-884129');
    this.transferSenderBank.set('Banco Popular');
    this.transferReceiverBank.set('Banco BHD');
    this.selectedPurchaseTotal.set(15000);
    this.selectedPurchasePaid.set(5000);
    this.selectedSupplierName.set('Distribuidora del Caribe');
    this.selectedPurchaseOrderCode.set('OC-00045');

    this.paymentForm.reset({
      saleId: '',
      purchaseId: defaultPurchaseId ? String(defaultPurchaseId) : '45',
      amount: 4000,
      method: 'Transferencia bancaria',
      reference: 'REF-884129',
      notes: '',
    });

    this.loadData();
    if (defaultPurchaseId) {
      setTimeout(() => {
        const found = this.purchases().find(
          (p) => p.id === Number(defaultPurchaseId),
        );
        if (found) {
          this.paymentForm.patchValue({ amount: found.total });
        }
      }, 150);
    }

    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  buildPaymentReference(): {
    methodFormatted: string;
    referenceFormatted: string;
  } {
    const m = this.selectedMethod();

    if (m === 'Tarjeta de Crédito / Débito' || m === 'Tarjeta') {
      const four = this.cardLastFour().trim();
      const auth = this.cardAuthVoucher().trim();
      const ref =
        `Tarjeta ${this.cardType()} ${four ? '(****' + four + ')' : ''} ${auth ? 'Auth: ' + auth : ''}`.trim();
      return { methodFormatted: 'Tarjeta', referenceFormatted: ref };
    }

    if (m === 'Transferencia Bancaria' || m === 'Transferencia') {
      const orig = this.transferSenderBank().trim();
      const dest = this.transferReceiverBank().trim();
      const refNum = this.transferReference().trim();
      const ref =
        `Transf. ${orig} -> ${dest} ${refNum ? 'Ref: ' + refNum : ''}`.trim();
      return { methodFormatted: 'Transferencia', referenceFormatted: ref };
    }

    if (m === 'Cheque') {
      const bank = this.checkBank().trim();
      const num = this.checkNumber().trim();
      const date = this.checkDate();
      const ref = `Cheque ${bank} #${num} (${date})`.trim();
      return { methodFormatted: 'Cheque', referenceFormatted: ref };
    }

    const customRef =
      this.paymentForm.get('reference')?.value?.trim() || 'Pago en Efectivo';
    return { methodFormatted: 'Efectivo', referenceFormatted: customRef };
  }

  async savePayment() {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formVal = this.paymentForm.value;
    const { methodFormatted, referenceFormatted } =
      this.buildPaymentReference();

    const payload: PaymentDto = {
      saleId:
        this.paymentType() === 'sale' && formVal.saleId
          ? parseInt(formVal.saleId, 10)
          : null,
      purchaseId:
        this.paymentType() === 'purchase' && formVal.purchaseId
          ? parseInt(formVal.purchaseId, 10)
          : null,
      amount: Number(formVal.amount),
      method: methodFormatted,
      reference: referenceFormatted,
    };

    try {
      const res = await this.paymentService.createPayment(payload);
      if (res.success) {
        this.notificationService.success(
          'Pago a proveedor registrado y comprobante emitido exitosamente.',
        );
        this.saved.emit();
        this.close();
      } else {
        this.notificationService.error(
          res.message || 'Error al registrar el pago.',
        );
      }
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      if (mapped.fieldErrors) {
        applyFieldErrorsToForm(this.paymentForm, mapped.fieldErrors);
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
