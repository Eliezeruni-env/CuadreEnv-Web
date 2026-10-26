import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';
import { NotificationService } from '../../../../cuadreEnv/services/notification.service';
import { WhatsAppShareService, type WhatsAppInvoiceData } from '../../../services/whatsapp-share.service';

@Component({
  selector: 'app-send-whatsapp-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IconDirective],
  templateUrl: './send-whatsapp-modal.component.html',
  styleUrls: ['./send-whatsapp-modal.component.scss'],
})
export class SendWhatsAppModalComponent {
  private readonly notificationService: NotificationService = inject(NotificationService);
  private readonly whatsAppService: WhatsAppShareService = inject(WhatsAppShareService);

  @Input() visible = false;
  @Input() set invoiceData(data: WhatsAppInvoiceData | null) {
    this._invoiceData = data;
    if (data) {
      if (data.destinationPhone) {
        this.destinationPhone = data.destinationPhone;
      }
      this.senderPhone = this.whatsAppService.getUserPhone();
      this.updatePreview();
    }
  }
  get invoiceData(): WhatsAppInvoiceData | null {
    return this._invoiceData;
  }
  private _invoiceData: WhatsAppInvoiceData | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() sent = new EventEmitter<{ destination: string; sender: string }>();

  destinationPhone = '';
  senderPhone = '';
  messagePreview = signal<string>('');

  open(data: WhatsAppInvoiceData): void {
    this.invoiceData = data;
    this.destinationPhone = data.destinationPhone || '';
    this.senderPhone = this.whatsAppService.getUserPhone();
    this.updatePreview();
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  updatePreview(): void {
    if (!this._invoiceData) return;
    const preview = this.whatsAppService.formatInvoiceMessage({
      ...this._invoiceData,
      senderPhone: this.senderPhone,
    });
    this.messagePreview.set(preview);
  }

  onSenderPhoneChange(val: string): void {
    this.senderPhone = val;
    this.whatsAppService.setUserPhone(val);
    this.updatePreview();
  }

  send(): void {
    const cleanDest = this.destinationPhone.replace(/[^0-9]/g, '');
    if (!cleanDest || cleanDest.length < 7) {
      this.notificationService.warning('Ingresa un número de WhatsApp válido para el destinatario.');
      return;
    }

    if (this.senderPhone) {
      this.whatsAppService.setUserPhone(this.senderPhone);
    }

    if (!this._invoiceData) return;

    const message = this.whatsAppService.formatInvoiceMessage({
      ...this._invoiceData,
      senderPhone: this.senderPhone,
    });

    const success = this.whatsAppService.openWhatsApp(this.destinationPhone, message);
    if (success) {
      this.notificationService.success('Abriendo WhatsApp para enviar el documento.');
      this.sent.emit({ destination: this.destinationPhone, sender: this.senderPhone });
      this.close();
    }
  }
}
