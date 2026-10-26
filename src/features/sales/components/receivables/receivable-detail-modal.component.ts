import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  ReceivableService,
  type ReceivableDto,
  type ReceivableItemDto,
  type PaymentRecordDto,
  type PaymentVoucherAttachment,
} from '../../services/receivable.service';
import { SaleService } from '../../services/sale.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { WhatsAppShareService, type WhatsAppDebtPaymentData } from '../../services/whatsapp-share.service';
import { CompanyService } from '../../../companies/services/company.service';
import {
  ButtonDirective,
  FormControlDirective,
  FormDirective,
  FormSelectDirective,
  SpinnerComponent,
} from '@coreui/angular';

interface InstallmentItem {
  number: number;
  expectedAmount: number;
  paidAmount: number;
  pendingAmount: number;
  dueDate: string;
  status: 'Pagada' | 'Parcial' | 'Pendiente' | 'Vencida';
  progressPct: number;
}

interface TimelineItem {
  id: string;
  type: 'sale' | 'payment' | 'next_due' | 'final_due';
  title: string;
  subtitle?: string;
  highlightText?: string;
  date: string;
  iconType: 'doc' | 'cash' | 'calendar' | 'clock';
  colorClass: 'icon-purple' | 'icon-green' | 'icon-amber' | 'icon-red';
}

@Component({
  selector: 'app-receivable-detail-modal',
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
  templateUrl: './receivable-detail-modal.component.html',
  styleUrls: ['./receivable-detail-modal.component.scss'],
})
export class ReceivableDetailModalComponent {
  readonly translationService = inject(TranslationService);
  private readonly receivableService = inject(ReceivableService);
  private readonly saleService = inject(SaleService);
  private readonly customerService = inject(CustomerService);
  private readonly notificationService = inject(NotificationService);
  private readonly confirmService = inject(ConfirmDialogService);
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly whatsappShareService = inject(WhatsAppShareService);
  private readonly companyService = inject(CompanyService);

  @Input() visible = false;

  // Reactive signal backing the receivable
  readonly currentReceivable = signal<ReceivableDto | null>(null);

  @Input()
  set receivable(val: ReceivableDto | null) {
    this.currentReceivable.set(val);
  }
  get receivable(): ReceivableDto | null {
    return this.currentReceivable();
  }

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() updated = new EventEmitter<void>();

  activeTab = signal<'payment' | 'cuotas' | 'timeline' | 'sale' | 'client'>('payment');
  editingPayment = signal<PaymentRecordDto | null>(null);
  isLoading = signal<boolean>(false);

  // Voucher attachment and analysis state
  uploadedVoucher = signal<PaymentVoucherAttachment | null>(null);
  isAnalyzingVoucher = signal<boolean>(false);
  voucherDetectionMessage = signal<string | null>(null);
  previewModalOpen = signal<boolean>(false);
  previewVoucherData = signal<PaymentVoucherAttachment | null>(null);

  paymentForm: FormGroup;
  clientForm: FormGroup;
  saleEditForm: FormGroup;

  readonly paymentProgress = computed(() => {
    const r = this.currentReceivable();
    if (!r || r.totalAmount <= 0) return 0;
    const actualPaid = (r.payments && r.payments.length > 0)
      ? r.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
      : (Number(r.paidAmount) || 0);
    const pct = Math.round((actualPaid / r.totalAmount) * 100);
    return Math.min(100, Math.max(0, pct));
  });

  readonly financialStatus = computed(() => {
    const r = this.currentReceivable();
    if (!r) return { type: 'pendiente', label: 'Pendiente', daysOverdue: 0 };
    const actualPaid = (r.payments && r.payments.length > 0)
      ? r.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
      : (Number(r.paidAmount) || 0);

    if (r.pendingAmount === 0 || actualPaid >= r.totalAmount || r.status === 'Pagado') {
      return { type: 'pagada', label: 'Pagada', daysOverdue: 0 };
    }

    if (r.dueDate) {
      const due = new Date(r.dueDate);
      const now = new Date();
      if (due < now && r.pendingAmount > 0) {
        const diffDays = Math.ceil((now.getTime() - due.getTime()) / (1000 * 3600 * 24));
        return { type: 'vencida', label: 'Vencida', daysOverdue: diffDays };
      }
    }

    if (actualPaid > 0) {
      return { type: 'parcial', label: 'Parcial', daysOverdue: 0 };
    }

    return { type: 'pendiente', label: 'Pendiente', daysOverdue: 0 };
  });

  readonly installmentsBreakdown = computed<InstallmentItem[]>(() => {
    const r = this.currentReceivable();
    if (!r) return [];
    const totalInst = r.paymentPlan?.totalInstallments || 1;
    const instAmount = r.paymentPlan?.installmentAmount || (r.totalAmount / totalInst);

    const totalPaid = (r.payments && r.payments.length > 0)
      ? r.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
      : (Number(r.paidAmount) || 0);

    let remainingPaid = totalPaid;
    const result: InstallmentItem[] = [];

    const baseDate = r.dueDate || r.creationDate || new Date().toISOString();

    for (let i = 1; i <= totalInst; i++) {
      const exp = i === totalInst
        ? Math.max(0, r.totalAmount - instAmount * (totalInst - 1))
        : instAmount;

      const allocated = Math.min(exp, Math.max(0, remainingPaid));
      remainingPaid = Math.max(0, remainingPaid - allocated);
      const pending = Math.max(0, exp - allocated);
      const progress = exp > 0 ? Math.round((allocated / exp) * 100) : 0;

      let status: 'Pagada' | 'Parcial' | 'Pendiente' | 'Vencida' = 'Pendiente';
      if (allocated >= (exp - 0.001)) {
        status = 'Pagada';
      } else if (allocated > 0) {
        status = 'Parcial';
      }

      result.push({
        number: i,
        expectedAmount: exp,
        paidAmount: allocated,
        pendingAmount: pending,
        dueDate: this.calculateInstallmentDueDate(baseDate, i, r.paymentPlan?.frequency),
        status,
        progressPct: progress,
      });
    }

    return result;
  });

  readonly timelineItems = computed<TimelineItem[]>(() => {
    const r = this.currentReceivable();
    if (!r) return [];
    const items: TimelineItem[] = [];

    // 1. Venta creada
    const saleDate = r.creationDate || r.paymentPlan?.startDate;
    items.push({
      id: 'sale-created',
      type: 'sale',
      title: 'Venta creada',
      subtitle: 'Se creó la venta',
      date: saleDate ? this.formatTimelineDate(saleDate, '10:30 AM') : '27/05/2025 10:30 AM',
      iconType: 'doc',
      colorClass: 'icon-purple',
    });

    // 2. Pagos registrados
    if (r.payments && r.payments.length > 0) {
      r.payments.forEach((p: PaymentRecordDto, idx: number) => {
        const formattedAmount = 'RD$ ' + (Number(p.amount) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
        items.push({
          id: `payment-${p.id || idx}`,
          type: 'payment',
          title: 'Pago registrado',
          highlightText: formattedAmount,
          subtitle: p.bank ? `${p.method} (${p.bank})` : (p.method || 'Efectivo'),
          date: p.date || '27/05/2025',
          iconType: 'cash',
          colorClass: 'icon-green',
        });
      });
    }

    // 3. Factura saldada por completo (if fully paid)
    if (r.pendingAmount <= 0 || r.status === 'Pagado') {
      const lastPaymentDate = r.payments && r.payments.length > 0
        ? r.payments[r.payments.length - 1].date
        : this.formatTimelineDate(r.settledDate || new Date().toISOString());

      items.push({
        id: 'fully-settled',
        type: 'payment',
        title: 'Factura saldada por completo',
        subtitle: 'Saldo liquidado al 100%',
        highlightText: 'RD$ ' + r.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 }),
        date: lastPaymentDate,
        iconType: 'cash',
        colorClass: 'icon-green',
      });
    }

    // 4. Cuenta reabierta (if reopened)
    if (r.isReopened) {
      items.push({
        id: 'reopened-event',
        type: 'sale',
        title: 'Cuenta por cobrar reabierta',
        subtitle: 'Reactivada para ajustes o correcciones',
        date: this.formatTimelineDate(r.reopenedDate || new Date().toISOString()),
        iconType: 'doc',
        colorClass: 'icon-amber',
      });
    }

    // 5. Próximo vencimiento (if pending amount exists)
    if (r.pendingAmount > 0) {
      const nextDueAmount = r.paymentPlan?.installmentAmount || r.pendingAmount;
      const formattedNextDue = 'RD$ ' + nextDueAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 });
      items.push({
        id: 'next-due',
        type: 'next_due',
        title: 'Próximo vencimiento',
        subtitle: formattedNextDue,
        date: r.dueDate ? this.formatShortDate(r.dueDate) : '27/06/2025',
        iconType: 'calendar',
        colorClass: 'icon-amber',
      });
    }

    // 6. Vencimiento final (if pending amount exists)
    if (r.pendingAmount > 0) {
      if (r.paymentPlan && r.paymentPlan.totalInstallments > 1) {
        const finalAmount = r.paymentPlan.installmentAmount;
        const formattedFinal = 'RD$ ' + finalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 });
        items.push({
          id: 'final-due',
          type: 'final_due',
          title: 'Vencimiento final',
          subtitle: formattedFinal,
          date: this.calculateFinalDueDate(r.dueDate || r.creationDate, r.paymentPlan.totalInstallments),
          iconType: 'clock',
          colorClass: 'icon-red',
        });
      } else if (r.dueDate) {
        const formattedTotal = 'RD$ ' + r.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 });
        items.push({
          id: 'final-due',
          type: 'final_due',
          title: 'Vencimiento final',
          subtitle: formattedTotal,
          date: this.formatShortDate(r.dueDate),
          iconType: 'clock',
          colorClass: 'icon-red',
        });
      }
    }

    return items;
  });

  async reopenAccount() {
    const r = this.currentReceivable();
    if (!r) return;
    const confirmed = await this.confirmService.confirm({
      title: '⚠️ Aviso de Reapertura de Cuenta',
      message: `¿Desea reactivar esta cuenta por cobrar (${r.invoiceNumber})? Su estado volverá a Pendiente/Parcial, el saldo pendiente será reactivado y se computará nuevamente en los cobros pendientes.`,
      confirmText: 'Sí, reactivar cuenta',
      variant: 'warning',
    });

    if (confirmed) {
      this.isLoading.set(true);
      try {
        const res = await this.receivableService.reopenReceivable(r.id);
        if (res.success && res.data) {
          this.receivable = res.data;
          this.notificationService.success('Cuenta por cobrar reactivada exitosamente.');
          this.updated.emit();
        }
      } catch (e: any) {
        this.notificationService.showApiError(e);
      } finally {
        this.isLoading.set(false);
      }
    }
  }

  private formatTimelineDate(dateStr: string, defaultTime = ''): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const datePart = d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return defaultTime ? `${datePart} ${defaultTime}` : datePart;
    } catch {
      return dateStr;
    }
  }

  private formatShortDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  private calculateInstallmentDueDate(baseDateStr: string, instNumber: number, frequency?: string): string {
    try {
      const d = new Date(baseDateStr);
      if (isNaN(d.getTime())) return `Mes ${instNumber}`;
      if (frequency === 'Semanal') {
        d.setDate(d.getDate() + (instNumber - 1) * 7);
      } else if (frequency === 'Quincenal') {
        d.setDate(d.getDate() + (instNumber - 1) * 15);
      } else {
        d.setMonth(d.getMonth() + (instNumber - 1));
      }
      return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return `Cuota ${instNumber}`;
    }
  }

  private calculateFinalDueDate(baseDateStr: string, installments: number): string {
    try {
      const d = new Date(baseDateStr);
      if (isNaN(d.getTime())) return '27/08/2025';
      d.setMonth(d.getMonth() + Math.max(1, installments - 1));
      return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '27/08/2025';
    }
  }

  constructor() {
    const now = new Date();
    const nowIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    this.paymentForm = this.fb.group({
      amount: [0, [Validators.required, Validators.min(0.01)]],
      paymentDate: [nowIso, [Validators.required]],
      method: ['Efectivo', [Validators.required]],
      bank: [''],
      reference: [''],
      registerInCash: [true],
      notes: [''],
    });

    // Auto toggle cash register movement based on payment method
    this.paymentForm.get('method')?.valueChanges.subscribe((method) => {
      if (method === 'Efectivo') {
        this.paymentForm.patchValue({ registerInCash: true }, { emitEvent: false });
      } else {
        this.paymentForm.patchValue({ registerInCash: false }, { emitEvent: false });
      }
    });

    this.clientForm = this.fb.group({
      customerName: ['', [Validators.required]],
      customerPhone: [''],
      customerEmail: [''],
      customerIdentification: [''],
    });

    this.saleEditForm = this.fb.group({
      description: ['', [Validators.required]],
      totalAmount: [0, [Validators.required, Validators.min(0.01)]],
      dueDate: [''],
    });
  }

  open(item: ReceivableDto) {
    this.receivable = item;
    this.activeTab.set('payment');
    this.editingPayment.set(null);
    this.uploadedVoucher.set(null);
    this.voucherDetectionMessage.set(null);

    const now = new Date();
    const nowIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    const defaultAmount = item.paymentPlan?.installmentAmount || Math.min(item.pendingAmount, 5000);

    this.paymentForm.reset({
      amount: defaultAmount,
      paymentDate: nowIso,
      method: 'Efectivo',
      bank: '',
      reference: '',
      registerInCash: true,
      notes: '',
    });

    this.clientForm.reset({
      customerName: item.customerName,
      customerPhone: item.customerPhone || '',
      customerEmail: item.customerEmail || '',
      customerIdentification: item.customerIdentification || '',
    });

    this.saleEditForm.reset({
      description: item.description,
      totalAmount: item.totalAmount,
      dueDate: item.dueDate ? item.dueDate.split('T')[0] : '',
    });

    this.visible = true;
    this.visibleChange.emit(true);

    // Si los artículos no están cargados, consultar la venta original /Sale/{id}
    if ((!item.items || item.items.length === 0) && item.id) {
      this.saleService.getSale(item.id).then((res) => {
        if (res.success && res.data) {
          const rawItems = (res.data as any).details || (res.data as any).items || (res.data as any).saleDetails || [];
          if (rawItems && rawItems.length > 0) {
            const mappedItems: ReceivableItemDto[] = rawItems.map((it: any) => ({
              productId: it.productId ?? it.id ?? 0,
              productName: it.productName ?? it.name ?? it.description ?? 'Artículo',
              quantity: Number(it.quantity ?? 1),
              unitPrice: Number(it.unitPrice ?? it.price ?? 0),
              subtotal: Number(it.subtotal ?? (Number(it.quantity ?? 1) * Number(it.unitPrice ?? it.price ?? 0))),
              barCode: it.barCode ?? it.barcode ?? '',
            }));

            if (this.receivable && this.receivable.id === item.id) {
              this.receivable = {
                ...this.receivable,
                items: mappedItems,
              };
            }
          }
        }
      }).catch(() => {
        // Fallback local silencioso si la API no responde
      });
    }
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.editingPayment.set(null);
    this.uploadedVoucher.set(null);
    this.voucherDetectionMessage.set(null);
  }

  setTab(tab: 'payment' | 'cuotas' | 'timeline' | 'client' | 'sale') {
    this.activeTab.set(tab);
    if (tab !== 'payment') {
      this.editingPayment.set(null);
    }
  }

  quickPayInstallment(item: InstallmentItem) {
    const amt = item.pendingAmount > 0 ? item.pendingAmount : item.expectedAmount;
    this.paymentForm.patchValue({
      amount: amt,
      notes: `Pago de Cuota #${item.number}`,
    });
    this.setTab('payment');
  }

  setQuickAmount(amt: number) {
    this.paymentForm.patchValue({
      amount: Math.round(amt * 100) / 100,
    });
  }

  editPayment(p: PaymentRecordDto) {
    this.editingPayment.set(p);

    const now = new Date();
    const nowIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    this.paymentForm.patchValue({
      amount: p.amount,
      paymentDate: nowIso,
      method: p.method || 'Efectivo',
      bank: p.bank || '',
      reference: p.reference || '',
      registerInCash: p.registerInCash ?? (p.method === 'Efectivo'),
      notes: p.notes || '',
    });

    if (p.voucherAttachment) {
      this.uploadedVoucher.set(p.voucherAttachment);
      this.voucherDetectionMessage.set(`Comprobante adjunto: ${p.voucherAttachment.name}`);
    } else {
      this.uploadedVoucher.set(null);
      this.voucherDetectionMessage.set(null);
    }
  }

  cancelEditPayment() {
    this.editingPayment.set(null);
    this.uploadedVoucher.set(null);
    this.voucherDetectionMessage.set(null);

    const now = new Date();
    const nowIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    const r = this.currentReceivable();
    if (r) {
      this.paymentForm.reset({
        amount: r.paymentPlan?.installmentAmount || Math.min(r.pendingAmount, 5000),
        paymentDate: nowIso,
        method: 'Efectivo',
        bank: '',
        reference: '',
        registerInCash: true,
        notes: '',
      });
    }
  }

  async deletePayment(p: PaymentRecordDto) {
    const r = this.currentReceivable();
    if (!r) return;

    const formattedAmount = (Number(p.amount) || 0).toLocaleString('es-DO', {
      minimumFractionDigits: 2,
    });

    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar pago registrado?',
      message: `¿Estás seguro de que deseas eliminar el pago #${p.id} por un monto de RD$ ${formattedAmount}? El saldo pendiente se recalculará automáticamente.`,
      confirmText: 'Eliminar Pago',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.isLoading.set(true);

    try {
      const res = await this.receivableService.deletePayment(
        r.id,
        p.id,
      );

      if (res.success && res.data) {
        this.receivable = res.data;
        if (this.editingPayment()?.id === p.id) {
          this.cancelEditPayment();
        }
        this.notificationService.success('Pago eliminado exitosamente.');
        this.updated.emit();
      } else {
        this.notificationService.error(
          res.message || 'Error al eliminar el pago.',
        );
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveActiveTab() {
    if (this.activeTab() === 'payment') {
      await this.savePayment();
    } else if (this.activeTab() === 'sale') {
      await this.saveSale();
    }
  }

  async savePayment() {
    const r = this.currentReceivable();
    if (this.paymentForm.invalid || !r) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    const formVal = this.paymentForm.value;
    const amount = parseFloat(formVal.amount);

    if (amount <= 0) {
      this.notificationService.warning('El monto debe ser mayor a cero.');
      return;
    }

    const currentEditing = this.editingPayment();
    const isFinalSettlement = !currentEditing && (amount >= r.pendingAmount || (r.paidAmount + amount) >= r.totalAmount);

    if (isFinalSettlement) {
      const confirmed = await this.confirmService.confirm({
        title: '⚠️ Aviso de Último Pago / Liquidación Total',
        message: `Este pago de RD$ ${amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} liquidará por completo la cuenta por cobrar #${r.invoiceNumber}. Al completarse, se generará automáticamente la venta oficial correspondiente en el módulo de ventas y se computará en los KPIs de ventas e ingresos recuperados. ¿Deseas confirmar la transacción?`,
        confirmText: 'Sí, aplicar pago y liquidar',
        cancelText: 'Cancelar',
        variant: 'primary',
      });
      if (!confirmed) {
        return;
      }
    }

    this.isLoading.set(true);

    try {
      const formattedDate = new Date(formVal.paymentDate).toLocaleString(
        'es-DO',
        {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      );

      if (currentEditing) {
        // Update existing payment
        const res = await this.receivableService.updatePayment(
          r.id,
          currentEditing.id,
          {
            amount,
            date: formattedDate,
            method: formVal.method,
            bank: formVal.bank || null,
            reference: formVal.reference || null,
            notes: formVal.notes || null,
            registerInCash: formVal.registerInCash,
            voucherAttachment: this.uploadedVoucher(),
          },
        );

        if (res.success && res.data) {
          this.receivable = res.data;
          this.editingPayment.set(null);
          this.uploadedVoucher.set(null);
          this.voucherDetectionMessage.set(null);
          this.notificationService.success('Pago actualizado exitosamente.');
          this.updated.emit();
        } else {
          this.notificationService.error(
            res.message || 'Error al actualizar el pago.',
          );
        }
      } else {
        // Register new payment
        const res = await this.receivableService.addPayment(
          r.id,
          {
            amount,
            date: formattedDate,
            method: formVal.method,
            bank: formVal.bank || null,
            reference: formVal.reference || null,
            notes: formVal.notes || null,
            registerInCash: formVal.registerInCash,
            voucherAttachment: this.uploadedVoucher(),
          },
        );

        if (res.success && res.data) {
          const settledReceivable = res.data;
          this.receivable = settledReceivable;
          this.uploadedVoucher.set(null);
          this.voucherDetectionMessage.set(null);

          if (isFinalSettlement) {
            try {
              const salePayload: any = {
                customerId: settledReceivable.customerId || null,
                total: settledReceivable.totalAmount,
                paidAmount: settledReceivable.totalAmount,
                details: (settledReceivable.items && settledReceivable.items.length > 0)
                  ? settledReceivable.items.map((it) => ({
                      productId: it.productId || 1,
                      quantity: it.quantity || 1,
                      unitPrice: it.unitPrice || (settledReceivable.totalAmount / (it.quantity || 1)),
                    }))
                  : [
                      {
                        productId: 1,
                        quantity: 1,
                        unitPrice: settledReceivable.totalAmount,
                      },
                    ],
              };
              const saleRes = await this.saleService.createSale(salePayload);
              if (saleRes?.data) {
                this.saleService.saveLocalSale(saleRes.data);
              }
            } catch {
              // Local fallback sale record
              const fallbackSale: any = {
                id: Date.now(),
                customerId: settledReceivable.customerId || null,
                customerName: settledReceivable.customerName,
                total: settledReceivable.totalAmount,
                paidAmount: settledReceivable.totalAmount,
                creationDate: new Date().toISOString(),
                details: (settledReceivable.items || []).map((it) => ({
                  productId: it.productId,
                  productName: it.productName,
                  quantity: it.quantity,
                  unitPrice: it.unitPrice,
                  total: it.subtotal,
                })),
              };
              this.saleService.saveLocalSale(fallbackSale);
            }

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('cuadre:sale-completed', {
                detail: {
                  type: 'RECEIVABLE_SETTLED',
                  invoiceNumber: settledReceivable.invoiceNumber,
                  customerName: settledReceivable.customerName,
                  amount: settledReceivable.totalAmount,
                }
              }));
            }
          }

          this.notificationService.success(
            isFinalSettlement
              ? '¡Cuenta liquidada! Venta oficial generada y sumada a las métricas de ventas.'
              : 'Pago registrado exitosamente y amortizado en el plan de cuotas.'
          );
          this.updated.emit();
          this.close();
        } else {
          this.notificationService.error(
            res.message || 'Error al registrar el pago.',
          );
        }
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- Document OCR & Voucher Handling ---
  sendPaymentWhatsAppReceipt(payment: PaymentRecordDto): void {
    const r = this.receivable;
    if (!r) return;
    const phone = r.customerPhone || '';
    const pending = Math.max(0, r.pendingAmount || 0);
    const prev = pending + (payment.amount || 0);

    const data: WhatsAppDebtPaymentData = {
      companyName: this.companyService.currentSettings()?.commercialName || this.companyService.currentSettings()?.companyName || 'CuadreEnv',
      companyRnc: this.companyService.currentSettings()?.rnc || undefined,
      customerName: r.customerName || 'Cliente',
      customerPhone: phone,
      documentNumber: r.invoiceNumber || String(r.id),
      ncf: r.invoiceNumber || undefined,
      amountPaid: payment.amount,
      previousBalance: prev,
      pendingBalance: pending,
      paymentMethod: payment.method || 'Efectivo',
      date: new Date(payment.date || Date.now()).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }),
      notes: payment.notes || undefined,
    };

    this.whatsappShareService.sendDebtPaymentViaWhatsApp(data);
  }

  async onVoucherFileSelected(event: any) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    if (file.size > 15 * 1024 * 1024) {
      this.notificationService.warning('El comprobante excede el tamaño máximo permitido (15MB).');
      return;
    }

    this.isAnalyzingVoucher.set(true);
    this.voucherDetectionMessage.set('Analizando documento y extrayendo datos...');

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      let textContent = '';

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          textContent = await this.extractPdfText(file);
        } catch {
          textContent = '';
        }
      }

      const combinedText = `${file.name} ${textContent}`;
      const extracted = this.extractDataFromText(combinedText, this.currentReceivable());

      const attachment: PaymentVoucherAttachment = {
        name: file.name,
        type: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        dataUrl,
        size: file.size,
        extractedText: textContent.slice(0, 1000),
      };

      this.uploadedVoucher.set(attachment);

      const patches: any = {};
      const detectedBadges: string[] = [];

      if (extracted.amount && extracted.amount > 0) {
        patches.amount = extracted.amount;
        detectedBadges.push(`Monto RD$ ${extracted.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`);
      }
      if (extracted.reference) {
        patches.reference = extracted.reference;
        detectedBadges.push(`Ref: ${extracted.reference}`);
      }
      if (extracted.bank) {
        patches.bank = extracted.bank;
        detectedBadges.push(`Banco: ${extracted.bank}`);
      }
      if (extracted.method) {
        patches.method = extracted.method;
        detectedBadges.push(`Método: ${extracted.method}`);
      }
      if (extracted.date) {
        patches.paymentDate = extracted.date;
        detectedBadges.push(`Fecha`);
      }

      if (Object.keys(patches).length > 0) {
        this.paymentForm.patchValue(patches);
        this.voucherDetectionMessage.set(`✓ Datos autodetectados: ${detectedBadges.join(', ')}.`);
        this.notificationService.success('Comprobante analizado con éxito. Datos cargados.');
      } else {
        this.voucherDetectionMessage.set('✓ Comprobante adjuntado con éxito. Puedes ingresar los datos manualmente.');
      }
    } catch (err: any) {
      console.error('Error processing voucher:', err);
      this.notificationService.error('No se pudo procesar el archivo del comprobante.');
      this.voucherDetectionMessage.set(null);
    } finally {
      this.isAnalyzingVoucher.set(false);
      input.value = '';
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  private async extractPdfText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binaryStr = '';
    const maxBytes = Math.min(bytes.length, 400000);
    for (let i = 0; i < maxBytes; i++) {
      const b = bytes[i];
      if ((b >= 32 && b <= 126) || b === 10 || b === 13) {
        binaryStr += String.fromCharCode(b);
      } else {
        binaryStr += ' ';
      }
    }
    return binaryStr;
  }

  private extractDataFromText(
    text: string,
    receivable: ReceivableDto | null,
  ): {
    amount?: number;
    reference?: string;
    bank?: string;
    method?: string;
    date?: string;
  } {
    const result: {
      amount?: number;
      reference?: string;
      bank?: string;
      method?: string;
      date?: string;
    } = {};

    const lower = text.toLowerCase();

    // 1. Bank detection (Dominican Republic)
    if (lower.includes('popular') || lower.includes('bpd') || lower.includes('banco popular')) {
      result.bank = 'Banco Popular Dominicano';
      result.method = 'Transferencia';
    } else if (lower.includes('bhd') || lower.includes('bhd leon')) {
      result.bank = 'Banco BHD';
      result.method = 'Transferencia';
    } else if (lower.includes('banreservas') || lower.includes('reservas')) {
      result.bank = 'Banreservas';
      result.method = 'Transferencia';
    } else if (lower.includes('apap')) {
      result.bank = 'APAP (Asociación Popular)';
      result.method = 'Transferencia';
    } else if (lower.includes('scotiabank') || lower.includes('scotia')) {
      result.bank = 'Scotiabank';
      result.method = 'Transferencia';
    } else if (lower.includes('santa cruz') || lower.includes('santacruz')) {
      result.bank = 'Banco Santa Cruz';
      result.method = 'Transferencia';
    } else if (lower.includes('promerica')) {
      result.bank = 'Banco Promerica';
      result.method = 'Transferencia';
    } else if (lower.includes('qik')) {
      result.bank = 'Qik Banco Digital';
      result.method = 'Transferencia';
    } else if (lower.includes('asociacion cibao') || lower.includes('acap')) {
      result.bank = 'Asociación Cibao';
      result.method = 'Transferencia';
    }

    // 2. Method detection
    if (lower.includes('tarjeta') || lower.includes('visa') || lower.includes('mastercard') || lower.includes('pos')) {
      result.method = 'Tarjeta';
    } else if (lower.includes('deposito') || lower.includes('depósito')) {
      result.method = 'Depósito Bancario';
    } else if (lower.includes('cheque')) {
      result.method = 'Cheque';
    } else if (lower.includes('transferencia') || lower.includes('ach') || lower.includes('instantaneo') || lower.includes('instante')) {
      result.method = 'Transferencia';
    } else if (lower.includes('efectivo') || lower.includes('cash')) {
      result.method = 'Efectivo';
    }

    // 3. Reference number detection
    const refMatch =
      text.match(/(?:referencia|no\.?\s*(?:de\s*)?(?:transacci[oó]n|referencia|autorizaci[oó]n|comprobante|operaci[oó]n)|secuencia|ref\.?|confirmaci[oó]n|aprobaci[oó]n)\s*[:#]?\s*([A-Za-z0-9\-]{5,20})/i) ||
      text.match(/\b(TRF-[0-9]{4,10}|ACH-[0-9]{4,10}|AUT-[0-9]{4,10})\b/i);

    if (refMatch) {
      result.reference = refMatch[1].trim();
    } else {
      const digitSeq = text.match(/\b([0-9]{6,10})\b/);
      if (digitSeq) {
        result.reference = digitSeq[1];
      }
    }

    // 4. Amount detection
    const amountRegexes = [
      /(?:monto|total|importe|valor|pagado|debitado)\s*:?\s*(?:rd\$|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2})?)/i,
      /(?:rd\$|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2})?)/i,
      /\b([0-9]{1,6}\.[0-9]{2})\b/,
    ];

    for (const rx of amountRegexes) {
      const match = text.match(rx);
      if (match) {
        const cleanStr = match[1].replace(/,/g, '');
        const parsed = parseFloat(cleanStr);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 5000000) {
          result.amount = parsed;
          break;
        }
      }
    }

    // Fallback amount to installment or pending amount if not explicitly in text
    if (!result.amount && receivable) {
      if (receivable.paymentPlan?.installmentAmount) {
        result.amount = receivable.paymentPlan.installmentAmount;
      } else if (receivable.pendingAmount > 0) {
        result.amount = receivable.pendingAmount;
      }
    }

    return result;
  }

  removeUploadedVoucher() {
    this.uploadedVoucher.set(null);
    this.voucherDetectionMessage.set(null);
  }

  openVoucherPreview(voucher: PaymentVoucherAttachment) {
    this.previewVoucherData.set(voucher);
    this.previewModalOpen.set(true);
  }

  closeVoucherPreview() {
    this.previewModalOpen.set(false);
    this.previewVoucherData.set(null);
  }

  getSafeVoucherUrl(dataUrl: string | undefined): SafeResourceUrl {
    return dataUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl) : '';
  }

  async saveSale() {
    const r = this.currentReceivable();
    if (this.saleEditForm.invalid || !r) {
      this.saleEditForm.markAllAsTouched();
      return;
    }

    const val = this.saleEditForm.value;
    const newTotal = parseFloat(val.totalAmount);
    this.isLoading.set(true);

    try {
      const newPending = Math.max(0, newTotal - r.paidAmount);
      const res = await this.receivableService.updateReceivable(
        r.id,
        {
          description: val.description,
          totalAmount: newTotal,
          pendingAmount: newPending,
          dueDate: val.dueDate,
          status: newPending === 0 ? 'Pagado' : r.paidAmount > 0 ? 'Parcial' : 'Pendiente',
        },
      );

      if (res.success && res.data) {
        this.receivable = res.data;
        this.notificationService.success(
          'Detalles de la venta actualizados exitosamente.',
        );
        this.updated.emit();
        this.close();
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  printAccountStatementPdf(): void {
    const r = this.currentReceivable();
    if (!r) return;

    const settings = this.companyService.currentSettings();
    const companyName = settings?.commercialName || settings?.companyName || 'EMPRESA COMERCIAL';
    const companyRnc = settings?.rnc || 'RNC NO DISPONIBLE';
    const companyAddress = settings?.address || 'Santo Domingo, República Dominicana';
    const companyPhone = settings?.phone || '';

    const isPaidInFull = r.pendingAmount <= 0;
    const formattedDate = new Date().toLocaleString('es-DO');

    const paymentRowsHtml = (r.payments && r.payments.length > 0)
      ? r.payments
          .map(
            (p, idx) => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">#${idx + 1}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${p.date || '-'}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 600;">${p.method}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">${p.reference || p.notes || '-'}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; text-align: right; color: #059669;">RD$ ${(p.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>`,
          )
          .join('')
      : `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #94a3b8; font-style: italic;">No hay abonos registrados para esta cuenta.</td></tr>`;

    const itemsRowsHtml = (r.items && r.items.length > 0)
      ? r.items
          .map(
            (it) => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${it.productName}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: center;">${it.quantity}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right;">RD$ ${(it.unitPrice || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right; font-weight: 600;">RD$ ${(it.subtotal || it.quantity * it.unitPrice || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>`,
          )
          .join('')
      : `<tr><td colspan="4" style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">${r.description || 'Venta de mercancía'}</td></tr>`;

    const printHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Estado de Cuenta - ${r.invoiceNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
          * { box-sizing: border-box; }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
            margin: 0;
            padding: 24px;
            color: #0f172a;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          .badge {
            display: inline-block;
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .badge-paid { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
          .badge-pending { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
          .summary-card {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            background: #f8fafc;
            padding: 16px;
            margin-bottom: 24px;
          }
          .table-modern {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
          }
          .table-modern th {
            background: #f1f5f9;
            color: #475569;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 10px 12px;
            border-bottom: 1px solid #cbd5e1;
            text-align: left;
          }
          .stamp-box {
            margin-top: 24px;
            padding: 16px;
            border-radius: 10px;
            text-align: center;
            font-weight: 800;
            font-size: 15px;
          }
          .stamp-paid {
            background: #ecfdf5;
            color: #047857;
            border: 2px dashed #059669;
          }
          .stamp-debt {
            background: #fffbeb;
            color: #b45309;
            border: 2px dashed #f59e0b;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end; gap: 10px;">
          <button onclick="window.print()" style="padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">
            🖨️ Imprimir / Guardar como PDF
          </button>
          <button onclick="window.close()" style="padding: 10px 16px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            Cerrar
          </button>
        </div>

        <table class="header-table">
          <tr>
            <td style="vertical-align: top; width: 60%;">
              <h2 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 800; color: #1e293b;">${companyName}</h2>
              <div style="font-size: 12px; color: #64748b;">RNC: ${companyRnc}</div>
              <div style="font-size: 12px; color: #64748b;">${companyAddress}</div>
              ${companyPhone ? `<div style="font-size: 12px; color: #64748b;">Tel: ${companyPhone}</div>` : ''}
            </td>
            <td style="vertical-align: top; text-align: right; width: 40%;">
              <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 800; color: #2563eb;">ESTADO DE CUENTA</h3>
              <div style="font-size: 13px; font-weight: 700; color: #0f172a;">Factura #${r.invoiceNumber}</div>
              <div style="font-size: 11px; color: #64748b;">Fecha Emisión: ${r.creationDate ? new Date(r.creationDate).toLocaleDateString('es-DO') : '-'}</div>
              <div style="font-size: 11px; color: #64748b;">Vencimiento: ${r.dueDate ? new Date(r.dueDate).toLocaleDateString('es-DO') : 'N/A'}</div>
              <div style="margin-top: 8px;">
                <span class="badge ${isPaidInFull ? 'badge-paid' : 'badge-pending'}">
                  ${isPaidInFull ? '✓ TOTALMENTE SALDADA' : 'PENDIENTE DE PAGO'}
                </span>
              </div>
            </td>
          </tr>
        </table>

        <!-- Datos del Cliente -->
        <div class="summary-card">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="width: 50%; padding-bottom: 6px;">
                <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700;">Cliente / Deudor:</span><br>
                <strong style="color: #0f172a; font-size: 14px;">${r.customerName}</strong>
              </td>
              <td style="width: 50%; padding-bottom: 6px;">
                <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700;">Teléfono / Contacto:</span><br>
                <strong style="color: #0f172a;">${r.customerPhone || 'No registrado'}</strong>
              </td>
            </tr>
            <tr>
              <td style="padding-top: 6px;">
                <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700;">Correo Electrónico:</span><br>
                <strong style="color: #0f172a;">${r.customerEmail || 'No registrado'}</strong>
              </td>
              <td style="padding-top: 6px;">
                <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700;">Almacén de Despacho:</span><br>
                <strong style="color: #0f172a;">${r.warehouseName || 'Almacén Principal'}</strong>
              </td>
            </tr>
          </table>
        </div>

        <!-- Detalle de Artículos -->
        <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase;">
          1. Detalle de Artículos / Servicios Facturados
        </h4>
        <table class="table-modern">
          <thead>
            <tr>
              <th>Descripción</th>
              <th style="text-align: center;">Cant.</th>
              <th style="text-align: right;">Precio Unit.</th>
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>

        <!-- Historial de Pagos y Abonos -->
        <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase;">
          2. Historial Cronológico de Abonos & Pagos Realizados
        </h4>
        <table class="table-modern">
          <thead>
            <tr>
              <th>No.</th>
              <th>Fecha y Hora</th>
              <th>Forma de Pago</th>
              <th>Referencia / Comprobante</th>
              <th style="text-align: right;">Monto Abonado</th>
            </tr>
          </thead>
          <tbody>
            ${paymentRowsHtml}
          </tbody>
        </table>

        <!-- Resumen de Saldos -->
        <div style="margin-left: auto; width: 340px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Monto Total Facturado:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #0f172a;">RD$ ${(r.totalAmount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #059669; font-weight: 600;">(-) Total Pagado / Abonado:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #059669;">RD$ ${(r.paidAmount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            <tr style="border-top: 2px solid #0f172a;">
              <td style="padding: 8px 0; font-weight: 800; font-size: 15px;">Saldo Pendiente Actual:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 800; font-size: 16px; color: ${isPaidInFull ? '#059669' : '#dc2626'};">
                RD$ ${(r.pendingAmount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </table>
        </div>

        <!-- Sello de Estado -->
        <div class="stamp-box ${isPaidInFull ? 'stamp-paid' : 'stamp-debt'}">
          ${isPaidInFull
            ? '✓ FACTURA SALDADA EN SU TOTALIDAD — EL CLIENTE NO PRESENTA DEUDA PENDIENTE'
            : `⚠️ CUENTA CON SALDO PENDIENTE: RD$ ${(r.pendingAmount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — AGRADECEMOS REALIZAR SU PAGO`}
        </div>

        <div style="margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
          Documento generado el ${formattedDate} a través de CuadreEnv ERP • Copia fiel del registro contable de cobranzas.
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=880,height=960');
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.focus();
    } else {
      this.notificationService.warning(
        'El navegador bloqueó la ventana emergente. Por favor permite popups para imprimir.',
      );
    }
  }
}

