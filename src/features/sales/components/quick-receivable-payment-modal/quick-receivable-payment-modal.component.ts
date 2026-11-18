import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  inject,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReceivableService, ReceivableDto } from '../../services/receivable.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ThermalPrinterService, TicketData } from '../../services/thermal-printer.service';
import { CompanyService } from '../../../companies/services/company.service';
import { soundEffects } from '../../../cuadreEnv/utils/sound-effects';

@Component({
  selector: 'app-quick-receivable-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quick-receivable-payment-modal.component.html',
  styleUrls: ['./quick-receivable-payment-modal.component.scss'],
})
export class QuickReceivablePaymentModalComponent implements OnChanges {
  private readonly receivableService = inject(ReceivableService);
  private readonly notificationService = inject(NotificationService);
  private readonly thermalPrinterService = inject(ThermalPrinterService);
  private readonly companyService = inject(CompanyService);

  @Input() visible = false;
  @Input() initialCustomerId?: number | null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() paymentCompleted = new EventEmitter<void>();

  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  receivables = signal<ReceivableDto[]>([]);
  searchTerm = signal<string>('');

  selectedReceivable = signal<ReceivableDto | null>(null);
  paymentAmount = signal<number>(0);
  paymentMethod = signal<string>('Efectivo');
  paymentReference = signal<string>('');
  paymentNotes = signal<string>('');

  // Clientes con cuentas pendientes
  readonly pendingReceivables = computed(() => {
    return this.receivables().filter((r) => r.status !== 'Pagado' && r.pendingAmount > 0);
  });

  readonly filteredReceivables = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const list = this.pendingReceivables();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        (r.customerIdentification && r.customerIdentification.includes(q)) ||
        (r.customerPhone && r.customerPhone.includes(q)),
    );
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      void this.loadReceivables();
    }
  }

  async loadReceivables(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await this.receivableService.getReceivables();
      if (res.success && res.data) {
        this.receivables.set(res.data);
        if (this.initialCustomerId) {
          const match = res.data.find(
            (r) => r.customerId === this.initialCustomerId && r.pendingAmount > 0,
          );
          if (match) {
            this.selectReceivable(match);
          }
        }
      }
    } catch (e) {
      console.warn('Error loading receivables:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectReceivable(r: ReceivableDto): void {
    this.selectedReceivable.set(r);
    // Sugerir monto de cuota o saldo total
    const suggested = r.paymentPlan?.installmentAmount || r.pendingAmount;
    this.paymentAmount.set(Math.min(suggested, r.pendingAmount));
    this.paymentReference.set('');
    this.paymentNotes.set(`Abono a cuenta ${r.invoiceNumber}`);
  }

  setFullBalance(): void {
    const r = this.selectedReceivable();
    if (r) {
      this.paymentAmount.set(r.pendingAmount);
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.selectedReceivable.set(null);
  }

  async submitPayment(): Promise<void> {
    const r = this.selectedReceivable();
    const amount = Number(this.paymentAmount());

    if (!r) {
      this.notificationService.warning('Selecciona una cuenta por cobrar.');
      return;
    }

    if (amount <= 0) {
      this.notificationService.warning('Ingresa un monto de abono mayor a 0.');
      return;
    }

    if (amount > r.pendingAmount) {
      this.notificationService.warning(
        `El monto (RD$ ${amount.toFixed(2)}) supera el saldo pendiente (RD$ ${r.pendingAmount.toFixed(2)}).`,
      );
      return;
    }

    this.isSubmitting.set(true);
    try {
      const res = await this.receivableService.addPayment(r.id, {
        amount,
        method: this.paymentMethod(),
        reference: this.paymentReference().trim() || undefined,
        notes: this.paymentNotes().trim() || undefined,
        registerInCash: this.paymentMethod() === 'Efectivo',
      });

      if (res.success) {
        soundEffects.playKaChing();
        this.notificationService.success(
          `¡Abono registrado! RD$ ${amount.toFixed(2)} aplicados a ${r.customerName}.`,
        );

        // Si pagó en efectivo, disparar solenoide de la gaveta física
        if (this.paymentMethod() === 'Efectivo') {
          void this.thermalPrinterService.openCashDrawer();
        }

        // Imprimir recibo de ingreso térmico
        await this.printPaymentReceipt(r, amount);

        this.paymentCompleted.emit();
        this.close();
      } else {
        this.notificationService.error(res.message || 'Error registrando el abono.');
      }
    } catch (e: any) {
      this.notificationService.error(e?.message || 'Error inesperado al registrar el abono.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private async printPaymentReceipt(r: ReceivableDto, paidAmount: number): Promise<void> {
    const comp = this.companyService.currentSettings();
    const remaining = Math.max(0, r.pendingAmount - paidAmount);

    const ticketData: TicketData = {
      companyName: comp?.companyName || 'CUADRE ENV',
      commercialName: comp?.commercialName || comp?.companyName || 'CUADRE ENV',
      rnc: comp?.rnc || undefined,
      address: comp?.address || undefined,
      phone: comp?.phone || undefined,
      invoiceNumber: `REC-${Date.now().toString().slice(-6)}`,
      date: new Date(),
      customerName: r.customerName,
      customerRnc: r.customerIdentification || undefined,
      items: [
        {
          description: `Abono a Cuenta #${r.invoiceNumber}`,
          quantity: 1,
          unitPrice: paidAmount,
          total: paidAmount,
        },
      ],
      subtotal: paidAmount,
      itbis: 0,
      total: paidAmount,
      paymentMethod: this.paymentMethod(),
      notes: `Saldo anterior: RD$ ${r.pendingAmount.toFixed(2)} | Nuevo saldo: RD$ ${remaining.toFixed(2)}`,
    };

    try {
      await this.thermalPrinterService.printTicket(ticketData, '80mm', this.paymentMethod() === 'Efectivo');
    } catch (err) {
      console.warn('Error imprimiendo recibo de abono:', err);
    }
  }
}
