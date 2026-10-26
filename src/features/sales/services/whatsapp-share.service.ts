import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import { CompanyService } from '../../companies/services/company.service';

export interface WhatsAppInvoiceData {
  companyName?: string;
  invoiceNumber: string;
  ncf?: string;
  date: string;
  customerName?: string;
  items?: { productName: string; quantity: number; total: number }[];
  subtotal: number;
  itbis: number;
  total: number;
  paymentMethod?: string;
  amountReceived?: number;
  change?: number;
  destinationPhone?: string;
  senderPhone?: string;
  senderName?: string;
  footerPhrase?: string;
}

export interface WhatsAppDebtPaymentData {
  companyName?: string;
  companyRnc?: string;
  customerName: string;
  customerPhone?: string;
  documentNumber?: string;
  ncf?: string;
  amountPaid: number;
  previousBalance: number;
  pendingBalance: number;
  paymentMethod?: string;
  date: string;
  notes?: string;
  senderName?: string;
  senderPhone?: string;
  footerPhrase?: string;
}

@Injectable({
  providedIn: 'root',
})
export class WhatsAppShareService {
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);

  private readonly SENDER_PHONE_STORAGE_KEY = 'cuadre_user_phone';

  /**
   * Retrieves the current user's phone number.
   * Priority: Local user override -> auth user -> company support phone.
   */
  getUserPhone(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(this.SENDER_PHONE_STORAGE_KEY);
      if (stored && stored.trim()) return stored.trim();
    }

    const authUser = this.authService.currentUser();
    if (authUser && (authUser as any).phoneNumber) {
      return (authUser as any).phoneNumber;
    }

    const comp = this.companyService.currentSettings();
    return comp?.ticketWhatsapp || comp?.phone || '';
  }

  /**
   * Persists the user's phone for future shipments.
   */
  setUserPhone(phone: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (phone && phone.trim()) {
        window.localStorage.setItem(this.SENDER_PHONE_STORAGE_KEY, phone.trim());
      }
    }
  }

  /**
   * Cleans and normalizes destination phone to international format.
   * Dominican Republic / US 10-digit numbers (809, 829, 849, etc.) get prefixed with '1'.
   */
  cleanPhoneNumber(rawPhone: string): string {
    if (!rawPhone) return '';
    const digits = rawPhone.replace(/[^0-9]/g, '');
    if (digits.length === 10) {
      return '1' + digits;
    }
    return digits;
  }

  /**
   * Formats a professional invoice / ticket message including NCF and payment breakdown.
   */
  formatInvoiceMessage(data: WhatsAppInvoiceData): string {
    const comp = this.companyService.currentSettings();
    const companyName = data.companyName || comp?.commercialName || comp?.companyName || 'CuadreEnv';
    const rncLine = comp?.rnc ? `🆔 *RNC:* ${comp.rnc}\n` : '';
    const senderName = data.senderName || this.authService.currentUser()?.fullName || this.authService.currentUser()?.email?.split('@')[0] || 'Cajero';
    const senderPhone = data.senderPhone || this.getUserPhone();

    let itemsText = '';
    for (const it of data.items || []) {
      const itTot = (it.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      itemsText += `• ${it.quantity}x ${it.productName} - RD$ ${itTot}\n`;
    }

    const subtotalStr = (data.subtotal || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const itbisStr = (data.itbis || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalStr = (data.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const ncfLine = data.ncf ? `🏛 *NCF Fiscal:* ${data.ncf}\n` : '';
    const senderLine = senderPhone ? `👤 *Atendido por:* ${senderName} (Tel: ${senderPhone})` : `👤 *Atendido por:* ${senderName}`;

    let paymentDetails = `💵 *Subtotal:* RD$ ${subtotalStr}\n🧾 *ITBIS (18%):* RD$ ${itbisStr}\n💰 *TOTAL PAGADO:* *RD$ ${totalStr}*\n💳 *Método de Pago:* ${data.paymentMethod || 'Efectivo'}`;

    if (data.amountReceived && data.amountReceived > data.total) {
      const recStr = data.amountReceived.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const chgStr = (data.change ?? (data.amountReceived - data.total)).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      paymentDetails += `\n💵 *Efectivo Entregado:* RD$ ${recStr}\n🪙 *Cambio / Devuelta:* *RD$ ${chgStr}*`;
    }

    return `🧾 *COMPROBANTE FISCAL · ${companyName}*
━━━━━━━━━━━━━━━━━━━━━━━━
${rncLine}📄 *Factura:* ${data.invoiceNumber}
${ncfLine}📅 *Fecha:* ${data.date}
👤 *Cliente:* ${data.customerName || 'Consumidor Final'}
${senderLine}
━━━━━━━━━━━━━━━━━━━━━━━━
${itemsText ? `🛒 *Detalle de Productos:*\n${itemsText}━━━━━━━━━━━━━━━━━━━━━━━━\n` : ''}${paymentDetails}
━━━━━━━━━━━━━━━━━━━━━━━━
💬 _"${data.footerPhrase || comp?.invoiceFooterPhrase || '¡Gracias por su preferencia!'}"_
${comp?.ticketInstagram ? '📸 Instagram: ' + comp.ticketInstagram + '\n' : ''}¡Muchas gracias por su compra!`;
  }

  /**
   * Formats a clean, formal receipt for debt payments (abonos a fiao)
   * with customer info, NCF, amount paid, and updated remaining balance.
   */
  formatDebtPaymentMessage(data: WhatsAppDebtPaymentData): string {
    const comp = this.companyService.currentSettings();
    const companyName = data.companyName || comp?.commercialName || comp?.companyName || 'CuadreEnv';
    const rncLine = (data.companyRnc || comp?.rnc) ? `🆔 *RNC:* ${data.companyRnc || comp?.rnc}\n` : '';
    const senderName = data.senderName || this.authService.currentUser()?.fullName || this.authService.currentUser()?.email?.split('@')[0] || 'Cajero';
    const senderPhone = data.senderPhone || this.getUserPhone();

    const amountPaidStr = (data.amountPaid || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const previousBalanceStr = (data.previousBalance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pendingBalanceStr = Math.max(0, data.pendingBalance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const ncfLine = data.ncf ? `🏛 *NCF Fiscal:* ${data.ncf}\n` : '';
    const docLine = data.documentNumber ? `📄 *Comprobante / Folio:* #${data.documentNumber}\n` : '';
    const notesLine = data.notes ? `📝 *Referencia:* ${data.notes}\n` : '';
    const senderLine = senderPhone ? `👤 *Recibido por:* ${senderName} (Tel: ${senderPhone})` : `👤 *Recibido por:* ${senderName}`;

    const balanceStatus = data.pendingBalance <= 0.01
      ? `🎉 *ESTADO FINAL:* *¡CUENTA SALDADA EN SU TOTALIDAD (RD$ 0.00)!*`
      : `📉 *SALDO PENDIENTE RESTANTE:* *RD$ ${pendingBalanceStr}*`;

    return `🧾 *RECIBO FORMAL DE ABONO A CUENTA*
🏢 *${companyName}*
━━━━━━━━━━━━━━━━━━━━━━━━
${rncLine}${docLine}${ncfLine}📅 *Fecha:* ${data.date}
👤 *Cliente:* ${data.customerName || 'Cliente'}
${senderLine}
━━━━━━━━━━━━━━━━━━━━━━━━
💰 *DETALLE DEL PAGO:*
💵 *Monto Abonado Hoy:* *RD$ ${amountPaidStr}*
💳 *Forma de Pago:* ${data.paymentMethod || 'Efectivo'}
${notesLine}━━━━━━━━━━━━━━━━━━━━━━━━
📊 *ESTADO ACTUALIZADO DE LA DEUDA:*
🔹 *Saldo Anterior:* RD$ ${previousBalanceStr}
✅ *Abono Aplicado:* RD$ ${amountPaidStr}
${balanceStatus}
━━━━━━━━━━━━━━━━━━━━━━━━
💬 _"${data.footerPhrase || 'Agradecemos su puntual pago y confianza. ¡Estamos a su entera disposición!'}"_`;
  }

  /**
   * Builds the WhatsApp deep link.
   */
  buildWhatsAppUrl(destinationPhone: string, message: string): string {
    const clean = this.cleanPhoneNumber(destinationPhone);
    const encoded = encodeURIComponent(message);
    return clean ? `https://wa.me/${clean}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }

  /**
   * Opens WhatsApp with the given destination and message.
   */
  openWhatsApp(destinationPhone: string, message: string): boolean {
    const url = this.buildWhatsAppUrl(destinationPhone, message);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
      return true;
    }
    return false;
  }

  /**
   * Sends formal invoice directly via WhatsApp in 1 touch.
   */
  sendInvoiceViaWhatsApp(data: WhatsAppInvoiceData): boolean {
    const msg = this.formatInvoiceMessage(data);
    return this.openWhatsApp(data.destinationPhone || '', msg);
  }

  /**
   * Sends formal debt payment receipt directly via WhatsApp in 1 touch.
   */
  sendDebtPaymentViaWhatsApp(data: WhatsAppDebtPaymentData): boolean {
    const msg = this.formatDebtPaymentMessage(data);
    return this.openWhatsApp(data.customerPhone || '', msg);
  }
}
