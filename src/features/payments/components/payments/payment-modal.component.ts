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
import { SupplierService } from '../../../purchases/services/supplier.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
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
  private supplierService = inject(SupplierService);
  private cashRegisterService = inject(CashRegisterService, { optional: true });
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  paymentType = signal<'purchase' | 'sale'>('purchase');
  sales = signal<SaleResponseDto[]>([]);
  purchases = signal<PurchaseDto[]>([]);
  suppliers = signal<any[]>([]);
  paymentsList = signal<PaymentDto[]>([]);
  isLoading = signal<boolean>(false);

  // Form Fields for specific methods
  selectedMethod = signal<string>('Transferencia bancaria');
  paymentDate = signal<string>(new Date().toISOString().split('T')[0]);
  selectedSupplierName = signal<string>('Proveedor');
  selectedPurchaseOrderCode = signal<string>('OC-0001');
  selectedPurchaseTotal = signal<number>(0);
  selectedPurchasePaid = signal<number>(0);

  // Card fields
  cardType = signal<string>('Visa');
  cardLastFour = signal<string>('');
  cardAuthVoucher = signal<string>('');

  // Transfer fields
  transferSenderBank = signal<string>('Banco Popular');
  transferReceiverBank = signal<string>('Banco BHD');
  transferReference = signal<string>('');

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

    // Autofill amount and details when purchaseId changes
    this.paymentForm.get('purchaseId')?.valueChanges.subscribe((id) => {
      if (id) {
        this.updatePurchaseSelection(id);
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
      const isSale = this.paymentType() === 'sale';
      const [purchaseRes, supRes, payRes, saleRes] = await Promise.all([
        this.purchaseService.getPurchases(),
        this.supplierService.getSuppliers(),
        this.paymentService.getPayments(),
        isSale ? this.saleService.getSales() : Promise.resolve(null),
      ]);

      if (saleRes?.success && saleRes.data) {
        this.sales.set(saleRes.data);
      }
      let purList: PurchaseDto[] = [];
      if (purchaseRes?.success && purchaseRes.data) {
        purList = [...purchaseRes.data];
      }
      const localPurs = this.purchaseService.getLocalPurchases();
      for (const lp of localPurs) {
        if (!purList.some((p) => p.id === lp.id)) {
          purList.unshift(lp);
        }
      }
      this.purchases.set(purList);

      if (supRes?.success && supRes.data) {
        this.suppliers.set(supRes.data);
      }
      if (payRes?.success && payRes.data) {
        this.paymentsList.set(payRes.data);
      }
    } catch (e: any) {
      console.warn('Failed to load pending sales/purchases:', e?.message || e);
    }
  }

  updatePurchaseSelection(purchaseId: number | string) {
    const idNum = Number(purchaseId);
    if (!idNum) return;
    const found = this.purchases().find((p) => p.id === idNum);
    if (!found) return;

    const total = Number(found.total || 0);
    const payments = this.paymentsList().filter((p) => p.purchaseId === idNum);
    const paid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const balance = Math.max(0, total - paid);

    this.selectedPurchaseTotal.set(total);
    this.selectedPurchasePaid.set(paid);

    const sup = this.suppliers().find((s) => s.id === found.supplierId);
    const supName = sup?.name || found.supplier?.name || (found as any).supplierName || 'Proveedor';
    this.selectedSupplierName.set(supName);
    this.selectedPurchaseOrderCode.set(found.invoiceNumber || (found as any).purchaseOrderNumber || `OC-${found.id}`);

    this.paymentForm.patchValue(
      { amount: balance > 0 ? balance : total },
      { emitEvent: false },
    );
  }

  setPaymentType(type: 'sale' | 'purchase') {
    this.paymentType.set(type);
    if (type === 'sale') {
      this.paymentForm.patchValue({ purchaseId: '', amount: 0 });
      if (this.sales().length === 0) {
        this.saleService.getSales().then((res) => {
          if (res?.success && res.data) {
            this.sales.set(res.data);
          }
        }).catch(() => {});
      }
    } else {
      this.paymentForm.patchValue({ saleId: '', amount: 0 });
    }
  }

  async openCreate(defaultPurchaseId?: number) {
    this.paymentType.set('purchase');
    this.selectedMethod.set('Transferencia bancaria');
    this.cardLastFour.set('');
    this.cardAuthVoucher.set('');
    this.transferReference.set('');
    this.transferSenderBank.set('Banco Popular');
    this.transferReceiverBank.set('Banco BHD');

    await this.loadData();

    const targetId = defaultPurchaseId
      ? Number(defaultPurchaseId)
      : this.purchases()[0]?.id || 0;
    let found = this.purchases().find((p) => p.id === targetId);
    if (!found && defaultPurchaseId) {
      const localMatch = this.purchaseService
        .getLocalPurchases()
        .find((p) => p.id === Number(defaultPurchaseId));
      if (localMatch) {
        found = localMatch;
        this.purchases.update((list) => [localMatch, ...list]);
      }
    }
    if (!found && this.purchases().length > 0) {
      found = this.purchases()[0];
    }

    if (found) {
      this.paymentForm.reset({
        saleId: '',
        purchaseId: String(found.id),
        amount: 0,
        method: 'Transferencia bancaria',
        reference: '',
        notes: '',
      });
      this.updatePurchaseSelection(found.id!);
    } else {
      this.selectedPurchaseTotal.set(0);
      this.selectedPurchasePaid.set(0);
      this.selectedSupplierName.set('Proveedor');
      this.selectedPurchaseOrderCode.set('OC-0001');
      this.paymentForm.reset({
        saleId: '',
        purchaseId: '',
        amount: 0,
        method: 'Transferencia bancaria',
        reference: '',
        notes: '',
      });
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

    if (m === 'Transferencia Bancaria' || m === 'Transferencia' || m === 'Transferencia bancaria') {
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

    const purId =
      this.paymentType() === 'purchase'
        ? Number(formVal.purchaseId) || null
        : null;
    const saleId =
      this.paymentType() === 'sale' ? Number(formVal.saleId) || null : null;

    if (this.paymentType() === 'purchase' && !purId) {
      this.notificationService.warning(
        'Por favor seleccione la compra u orden de compra a la que desea aplicar el pago.',
      );
      this.isLoading.set(false);
      return;
    }

    const payload: PaymentDto = {
      saleId,
      purchaseId: purId,
      amount: Number(formVal.amount),
      method: methodFormatted,
      reference: referenceFormatted,
    };

    // Resilient integration with Cash Register if cash disbursement
    if (methodFormatted === 'Efectivo' && this.cashRegisterService) {
      try {
        const activeSess = await this.cashRegisterService.getActiveSession();
        if (activeSess?.success && activeSess.data) {
          await this.cashRegisterService.addMovement({
            type: 'Salida',
            category: 'Compras',
            description: `Pago a proveedor: ${this.selectedSupplierName()} (${this.selectedPurchaseOrderCode()})`,
            amount: payload.amount,
            paymentMethod: 'Efectivo',
            reference: payload.reference || this.selectedPurchaseOrderCode(),
          });
        }
      } catch (cashErr) {
        console.warn('Defensive fallback: cash register movement skipped:', cashErr);
      }
    }

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
