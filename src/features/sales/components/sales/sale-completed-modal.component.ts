import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { IconDirective } from '@coreui/icons-angular';
import { SendInvoiceEmailModalComponent } from '../../../../app/shared/components/send-invoice-email-modal/send-invoice-email-modal.component';
import { SendWhatsAppModalComponent } from './send-whatsapp-modal/send-whatsapp-modal.component';
import type { WhatsAppInvoiceData } from '../../services/whatsapp-share.service';

import { CompanyService } from '../../../companies/services/company.service';
import { formatInvoiceDateTime, formatInvoiceDate, formatInvoiceTime } from '../../../cuadreEnv/utils/rd-date.util';

export interface CompletedSaleItem {
  productId?: number;
  productCode?: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface CompletedSaleDto {
  id?: number;
  invoiceNumber?: string;
  date?: string;
  customerName?: string;
  customerRnc?: string;
  cashRegisterName?: string;
  cashierName?: string;
  paymentMethod?: string;
  subtotal: number;
  discount?: number;
  itbis?: number;
  total: number;
  amountReceived?: number;
  change?: number;
  notes?: string;
  items: CompletedSaleItem[];
}

@Component({
  selector: 'app-sale-completed-modal',
  standalone: true,
  imports: [CommonModule, IconDirective, SendInvoiceEmailModalComponent, SendWhatsAppModalComponent],
  templateUrl: './sale-completed-modal.component.html',
  styleUrls: ['./sale-completed-modal.component.scss'],
})
export class SaleCompletedModalComponent {
  @ViewChild('sendEmailModal') sendEmailModal!: SendInvoiceEmailModalComponent;
  @ViewChild('sendWhatsAppModal') sendWhatsAppModal!: SendWhatsAppModalComponent;

  readonly translationService = inject(TranslationService);
  private notificationService = inject(NotificationService);
  readonly companyService = inject(CompanyService);

  @Input() visible = false;
  @Input() saleData: CompletedSaleDto | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() newSaleRequested = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  isEmailModalOpen = false;
  isTicketMode = signal<boolean>(false);

  get formattedDate(): string {
    return formatInvoiceDateTime(this.saleData?.date || new Date());
  }

  get formattedDateOnly(): string {
    return formatInvoiceDate(this.saleData?.date || new Date());
  }

  get formattedTime(): string {
    return formatInvoiceTime(this.saleData?.date || new Date());
  }

  get changeAmount(): number {
    if (!this.saleData) return 0;
    if (this.saleData.change !== undefined && this.saleData.change >= 0) {
      return this.saleData.change;
    }
    const received = this.saleData.amountReceived ?? this.saleData.total ?? 0;
    return Math.max(0, received - (this.saleData.total ?? 0));
  }

  // =========================================================================
  // Facturación Electrónica DGII (e-CF - Ley 32-23) - Pausado a futuro
  // =========================================================================
  readonly isDgiiActive = false;

  get isB2B(): boolean {
    const rnc = (this.saleData?.customerRnc || '').replace(/[^0-9]/g, '');
    return rnc.length >= 9 && rnc !== '000000000';
  }

  get eCfType(): string {
    return this.isB2B ? 'E31' : 'E32';
  }

  get eCfName(): string {
    return this.isB2B
      ? 'Factura de Crédito Fiscal Electrónica (e-CF)'
      : 'Factura de Consumo Electrónica (e-CF)';
  }

  get eNcfNumber(): string {
    const raw = this.saleData?.invoiceNumber || '';
    if (raw.startsWith('E')) return raw;
    const numPart = raw.replace(/[^0-9]/g, '').slice(-10).padStart(10, '0') || '0000000101';
    return `${this.eCfType}${numPart}`;
  }

  get securityCode(): string {
    const id = this.saleData?.id || 101;
    const tot = Math.round(this.saleData?.total || 100);
    const hex = Math.abs((id * 9301 + tot * 49297) % 0xffffff).toString(16).toUpperCase();
    return hex.padStart(6, '0');
  }

  get digitalStampQrUrl(): string {
    const emisorRnc = this.companyService.currentSettings().rnc || '101000000';
    const compRnc = this.saleData?.customerRnc || '00000000000';
    const total = (this.saleData?.total || 0).toFixed(2);
    const url = `https://ecf.dgii.gov.do/fe/consultatimbredigital?RncEmisor=${emisorRnc}&RncComprador=${compRnc}&eNCF=${this.eNcfNumber}&MontoTotal=${total}&CodigoSeguridad=${this.securityCode}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`;
  }

  open(data: CompletedSaleDto) {
    this.saleData = data;
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.closed.emit();
  }

  printInvoice() {
    try {
      this.isTicketMode.set(false);
      setTimeout(() => {
        try {
          window.print();
        } catch {
          this.notificationService.warning(
            'No se pudo abrir la impresión de factura. La venta ya fue guardada en el sistema.',
          );
        }
      }, 150);
    } catch {
      this.notificationService.warning('Error al procesar la factura para imprimir.');
    }
  }

  printTicket() {
    try {
      this.isTicketMode.set(true);
      setTimeout(() => {
        try {
          window.print();
        } catch {
          this.notificationService.warning(
            'No se pudo emitir el ticket físico (verifique impresora/papel). La venta quedó guardada exitosamente.',
          );
        } finally {
          setTimeout(() => {
            this.isTicketMode.set(false);
          }, 500);
        }
      }, 150);
    } catch {
      this.notificationService.warning('Error al preparar el ticket de impresión.');
    }
  }

  sendEmail() {
    if (!this.saleData) return;
    const invNumber = this.saleData.invoiceNumber || ('VTA-' + (this.saleData.id || '000123'));
    const company = this.companyService.currentSettings();
    const emailData = {
      saleId: this.saleData.id,
      invoiceNumber: invNumber,
      customerName: this.saleData.customerName || 'Consumidor final',
      customerRnc: this.saleData.customerRnc || '000-0000000-0',
      cashRegisterName: this.saleData.cashRegisterName || 'Caja Principal',
      cashierName: this.saleData.cashierName || 'Admin',
      paymentMethod: this.saleData.paymentMethod || 'Efectivo',
      totalAmount: this.saleData.total || 0,
      subtotal: this.saleData.subtotal || 0,
      discount: this.saleData.discount || 0,
      itbis: this.saleData.itbis || 0,
      notes: this.saleData.notes || '',
      date: this.formattedDate,
      items: (this.saleData.items || []).map((i) => ({
        productName: i.productName,
        productCode: i.productCode,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
      })),
      companyName: company?.companyName || 'CuadreEnv, SRL',
      commercialName: company?.commercialName || 'Soluciones de Facturación & Control',
      companyRnc: company?.rnc || '1-01-00000-0',
      companyAddress: company?.address || 'Santo Domingo, República Dominicana',
      companyPhone: company?.phone || '(809) 555-0199',
      logoUrl: company?.logoUrl || '',
      invoiceFooterPhrase: company?.invoiceFooterPhrase || '¡Gracias por su preferencia!',
    };

    if (this.sendEmailModal) {
      this.sendEmailModal.open(emailData);
    } else {
      this.isEmailModalOpen = true;
    }
  }

  sendWhatsAppInvoice(): void {
    if (!this.saleData) return;
    const invNo = this.saleData.invoiceNumber || `VTA-${this.saleData.id || '101'}`;
    const dateStr = this.formattedDate;

    const data: WhatsAppInvoiceData = {
      invoiceNumber: invNo,
      ncf: this.eNcfNumber || (this.saleData as any).ncf || undefined,
      date: dateStr,
      customerName: this.saleData.customerName || 'Consumidor Final',
      items: (this.saleData.items || []).map((it) => ({
        productName: it.productName,
        quantity: it.quantity,
        total: it.total,
      })),
      subtotal: this.saleData.subtotal || 0,
      itbis: this.saleData.itbis || 0,
      total: this.saleData.total || 0,
      paymentMethod: this.saleData.paymentMethod || 'Efectivo',
      amountReceived: this.saleData.amountReceived || undefined,
      change: this.changeAmount || undefined,
      destinationPhone: '',
    };

    if (this.sendWhatsAppModal) {
      this.sendWhatsAppModal.open(data);
    }
  }

  downloadPdf() {
    setTimeout(() => {
      window.print();
    }, 150);
  }

  startNewSale() {
    this.close();
    this.newSaleRequested.emit();
  }
}
