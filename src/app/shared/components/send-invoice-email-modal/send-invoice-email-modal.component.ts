import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { NotificationService } from '../../../../features/cuadreEnv/services/notification.service';
import { SaleService } from '../../../../features/sales/services/sale.service';
import { SpinnerComponent } from '@coreui/angular';
import type { SendInvoiceEmailRequest } from '../../../../features/cuadreEnv/types/api';

export interface InvoiceEmailItem {
  productName: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceEmailData {
  saleId?: number | string;
  invoiceNumber: string;
  customerName?: string;
  customerEmail?: string;
  customerRnc?: string;
  cashierName?: string;
  cashRegisterName?: string;
  paymentMethod?: string;
  totalAmount?: number;
  subtotal?: number;
  discount?: number;
  itbis?: number;
  notes?: string;
  date?: string;
  ncf?: string;
  pdfUrl?: string;
  items?: InvoiceEmailItem[];
  companyName?: string;
  commercialName?: string;
  companyRnc?: string;
  companyAddress?: string;
  companyPhone?: string;
  logoUrl?: string;
  invoiceFooterPhrase?: string;
}

@Component({
  selector: 'app-send-invoice-email-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SpinnerComponent,
  ],
  templateUrl: './send-invoice-email-modal.component.html',
  styleUrls: ['./send-invoice-email-modal.component.scss'],
})
export class SendInvoiceEmailModalComponent {
  private readonly fb: FormBuilder;
  private readonly notificationService: NotificationService;
  private readonly saleService: SaleService;

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() emailSent = new EventEmitter<{ email: string; invoiceNumber: string }>();

  private _invoiceData = signal<InvoiceEmailData | null>(null);

  @Input() set invoiceData(data: InvoiceEmailData | null) {
    if (data) {
      this._invoiceData.set(data);
      this.populateForm(data);
    } else {
      this._invoiceData.set(null);
    }
  }

  get invoiceData(): InvoiceEmailData | null {
    return this._invoiceData();
  }

  isSending = signal<boolean>(false);

  emailForm: FormGroup;

  constructor(
    fb?: FormBuilder,
    notificationService?: NotificationService,
    saleService?: SaleService,
  ) {
    this.fb = fb ?? inject(FormBuilder, { optional: true }) ?? new FormBuilder();
    this.notificationService =
      notificationService ?? inject(NotificationService, { optional: true })!;
    this.saleService =
      saleService ?? inject(SaleService, { optional: true })!;

    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      subject: ['', [Validators.required, Validators.maxLength(150)]],
      message: [''],
      attachPdf: [true],
    });
  }

  private populateForm(data: InvoiceEmailData) {
    this.emailForm.reset({
      email: data.customerEmail || '',
      subject: `Factura ${data.invoiceNumber} - CuadreEnv`,
      message: `Estimado/a ${data.customerName || 'Cliente'},\n\nAdjuntamos su factura ${data.invoiceNumber}${data.ncf ? ' (NCF: ' + data.ncf + ')' : ''} por un monto de RD$ ${(data.totalAmount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}.\n\nGracias por su preferencia.`,
      attachPdf: true,
    });
  }

  buildInvoiceHtml(data: InvoiceEmailData | null): string {
    if (!data) return '';
    const companyName = data.companyName || 'CuadreEnv, SRL';
    const commercialName = data.commercialName || 'Soluciones de Facturación & Control';
    const companyRnc = data.companyRnc || '1-01-00000-0';
    const companyAddress = data.companyAddress || 'Santo Domingo, República Dominicana';
    const companyPhone = data.companyPhone || '(809) 555-0199';
    const invNumber = data.invoiceNumber || 'VTA-000001';
    const dateStr = data.date || new Date().toLocaleString('es-DO');
    const cashRegister = data.cashRegisterName || 'Caja Principal';
    const cashier = data.cashierName || 'Admin';
    const customerName = data.customerName || 'Consumidor final';
    const customerRnc = data.customerRnc || '000-0000000-0';
    const subtotal = data.subtotal !== undefined ? data.subtotal : (data.totalAmount || 0);
    const discount = data.discount || 0;
    const itbis = data.itbis !== undefined ? data.itbis : ((data.totalAmount || 0) * 0.18);
    const total = data.totalAmount || 0;
    const paymentMethod = data.paymentMethod || 'Efectivo';
    const notes = data.notes || '';
    const footerPhrase = data.invoiceFooterPhrase || '¡Gracias por su preferencia!';

    const items = data.items && data.items.length > 0 ? data.items : [
      {
        productName: 'Venta / Factura general',
        productCode: 'GEN-01',
        quantity: 1,
        unitPrice: total,
        total: total,
      },
    ];

    const rowsHtml = items.map((item, idx) => {
      const itemItbis = (item.total * 0.18).toFixed(2);
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
          <td style="padding: 10px 8px; color: #64748b; font-family: monospace;">${idx + 1}</td>
          <td style="padding: 10px 8px; font-weight: 600; color: #1e293b;">${item.productName}</td>
          <td style="padding: 10px 8px; color: #64748b; font-family: monospace; font-size: 12px;">${item.productCode || ('PROD-' + (idx + 1))}</td>
          <td style="padding: 10px 8px; text-align: right; font-family: monospace;">RD$ ${Number(item.unitPrice).toFixed(2)}</td>
          <td style="padding: 10px 8px; text-align: center; font-family: monospace;">${item.quantity}</td>
          <td style="padding: 10px 8px; text-align: right; color: #64748b; font-family: monospace;">RD$ ${itemItbis}</td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 700; color: #1e293b; font-family: monospace;">RD$ ${Number(item.total).toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
<div style="max-width: 650px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
  <div style="background-color: #ffffff; padding: 24px 28px; border-bottom: 2px solid #2563eb;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="vertical-align: middle;">
          <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">${companyName}</h2>
          <div style="color: #64748b; font-size: 13px; margin-top: 4px;">${commercialName}</div>
        </td>
        <td style="text-align: right; vertical-align: middle;">
          <div style="font-size: 12px; font-weight: 700; color: #64748b; letter-spacing: 1px;">FACTURA</div>
          <div style="font-size: 20px; font-weight: 800; color: #2563eb; font-family: monospace; margin-top: 2px;">No. ${invNumber}</div>
        </td>
      </tr>
    </table>
  </div>

  <div style="padding: 18px 28px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #475569;">
      <tr>
        <td style="width: 55%; vertical-align: top; line-height: 1.6;">
          <strong style="color: #1e293b;">${companyName}</strong><br/>
          RNC: ${companyRnc}<br/>
          ${companyAddress}<br/>
          Tel: ${companyPhone}
        </td>
        <td style="width: 45%; vertical-align: top; text-align: right; line-height: 1.6;">
          <span style="color: #1e293b; font-weight: 600;">Fecha:</span> ${dateStr}<br/>
          <span style="color: #1e293b; font-weight: 600;">Caja:</span> ${cashRegister}<br/>
          <span style="color: #1e293b; font-weight: 600;">Cajero:</span> ${cashier}
        </td>
      </tr>
    </table>
  </div>

  <div style="padding: 16px 28px 8px 28px;">
    <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Cliente</div>
      <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px;">${customerName}</div>
      <div style="font-size: 12px; color: #475569; font-family: monospace; margin-top: 2px;">RNC / Cédula: ${customerRnc}</div>
    </div>
  </div>

  <div style="padding: 16px 28px;">
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; font-size: 12px; color: #475569; text-transform: uppercase;">
          <th style="padding: 8px; text-align: left; width: 25px;">#</th>
          <th style="padding: 8px; text-align: left;">Producto</th>
          <th style="padding: 8px; text-align: left;">Código</th>
          <th style="padding: 8px; text-align: right;">Precio</th>
          <th style="padding: 8px; text-align: center;">Cant.</th>
          <th style="padding: 8px; text-align: right;">ITBIS (18%)</th>
          <th style="padding: 8px; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>

  <div style="padding: 0 28px 24px 28px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="vertical-align: top; width: 50%; padding-right: 14px;">
          ${notes ? `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; font-size: 12px;">
            <strong style="color: #475569; display: block; margin-bottom: 4px;">Observaciones:</strong>
            <span style="color: #64748b;">${notes}</span>
          </div>` : ''}
          <div style="margin-top: 12px; font-size: 13px; color: #475569;">
            <strong>Método de pago:</strong> <span style="background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${paymentMethod}</span>
          </div>
        </td>
        <td style="vertical-align: top; width: 50%; padding-left: 14px;">
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px;">
            <table style="width: 100%; font-size: 13px; color: #475569;">
              <tr>
                <td style="padding-bottom: 6px;">Subtotal</td>
                <td style="text-align: right; font-family: monospace; font-weight: 600;">RD$ ${Number(subtotal).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding-bottom: 6px;">Descuento</td>
                <td style="text-align: right; font-family: monospace; color: #64748b;">RD$ ${Number(discount).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding-bottom: 8px;">ITBIS (18%)</td>
                <td style="text-align: right; font-family: monospace; color: #64748b;">RD$ ${Number(itbis).toFixed(2)}</td>
              </tr>
              <tr style="border-top: 2px solid #e2e8f0; font-size: 16px; font-weight: 800; color: #0f172a;">
                <td style="padding-top: 8px;">Total</td>
                <td style="text-align: right; font-family: monospace; color: #2563eb; padding-top: 8px;">RD$ ${Number(total).toFixed(2)}</td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 28px; text-align: center; font-size: 12px; color: #64748b;">
    <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">"${footerPhrase}"</div>
    <div style="font-size: 11px; color: #94a3b8;">Este documento es un comprobante de venta válido emitido electrónicamente.</div>
  </div>
</div>
    `.trim();
  }

  open(data: InvoiceEmailData) {
    this.invoiceData = data;
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async sendEmail() {
    if (this.emailForm.invalid || this.isSending()) {
      this.emailForm.markAllAsTouched();
      return;
    }

    const { email, subject, message, attachPdf } = this.emailForm.value;
    const inv = this._invoiceData();
    const invNumber = inv?.invoiceNumber || 'Documento';

    // Determine saleId: from inv.saleId or numeric portion of invoiceNumber
    let saleId: number | string | undefined = inv?.saleId;
    if (!saleId && inv?.invoiceNumber) {
      const match = inv.invoiceNumber.match(/\d+/);
      if (match) {
        saleId = parseInt(match[0], 10);
      }
    }
    if (!saleId) {
      saleId = 1;
    }

    const payload: SendInvoiceEmailRequest = {
      email: String(email).trim(),
      subject: subject ? String(subject).trim() : `Factura #${invNumber} - CuadreEnv`,
      message: message ? String(message).trim() : null,
      attachPdf: attachPdf !== false,
      invoiceHtml: this.buildInvoiceHtml(inv),
      invoiceNumber: inv?.invoiceNumber,
      customerName: inv?.customerName,
      customerRnc: inv?.customerRnc,
      cashierName: inv?.cashierName,
      cashRegisterName: inv?.cashRegisterName,
      paymentMethod: inv?.paymentMethod,
      items: inv?.items || null,
      subtotal: inv?.subtotal,
      discount: inv?.discount,
      itbis: inv?.itbis,
      total: inv?.totalAmount,
      notes: inv?.notes,
    };

    this.isSending.set(true);
    try {
      await this.saleService.sendInvoiceEmail(saleId, payload);

      this.notificationService.success(
        `Factura ${invNumber} enviada exitosamente a ${email}.`,
      );
      this.emailSent.emit({ email, invoiceNumber: invNumber });
      this.close();
    } catch (err: any) {
      let errorMsg = 'Error al enviar el correo. Por favor intente nuevamente.';
      if (err?.error?.message) {
        errorMsg = err.error.message;
      } else if (err?.error?.title) {
        errorMsg = err.error.title;
      } else if (err?.message) {
        errorMsg = err.message;
      }
      this.notificationService.error(errorMsg);
    } finally {
      this.isSending.set(false);
    }
  }
}
