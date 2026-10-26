import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SendInvoiceEmailModalComponent } from './send-invoice-email-modal.component';
import { FormBuilder } from '@angular/forms';

describe('SendInvoiceEmailModalComponent', () => {
  let component: SendInvoiceEmailModalComponent;
  let mockNotificationService: any;
  let mockSaleService: any;

  beforeEach(() => {
    mockNotificationService = {
      success: vi.fn(),
      error: vi.fn(),
    };
    mockSaleService = {
      sendInvoiceEmail: vi.fn(),
    };

    component = new SendInvoiceEmailModalComponent(
      new FormBuilder(),
      mockNotificationService,
      mockSaleService,
    );
  });

  it('should initialize with attachPdf as true', () => {
    component.open({
      saleId: 15,
      invoiceNumber: 'FAC-00015',
      customerEmail: 'test@cliente.com',
    });

    expect(component.emailForm.get('attachPdf')?.value).toBe(true);
    expect(component.emailForm.get('email')?.value).toBe('test@cliente.com');
  });

  it('should send email via saleService and close on success', async () => {
    mockSaleService.sendInvoiceEmail.mockResolvedValue({ success: true });

    component.open({
      saleId: 42,
      invoiceNumber: 'FAC-00042',
      customerEmail: 'cliente@correo.com',
    });

    component.emailForm.patchValue({
      email: 'cliente@correo.com',
      subject: 'Factura #42',
      message: 'Gracias por su compra',
      attachPdf: true,
    });

    await component.sendEmail();

    expect(mockSaleService.sendInvoiceEmail).toHaveBeenCalledWith(42, expect.objectContaining({
      email: 'cliente@correo.com',
      subject: 'Factura #42',
      message: 'Gracias por su compra',
      attachPdf: true,
    }));
    expect(mockNotificationService.success).toHaveBeenCalled();
    expect(component.visible).toBe(false);
  });

  it('should keep modal open and display error notification if saleService fails', async () => {
    mockSaleService.sendInvoiceEmail.mockRejectedValue({ error: { message: 'SMTP error' } });

    component.open({
      saleId: 42,
      invoiceNumber: 'FAC-00042',
      customerEmail: 'cliente@correo.com',
    });

    component.emailForm.patchValue({
      email: 'cliente@correo.com',
      subject: 'Factura #42',
      attachPdf: true,
    });

    await component.sendEmail();

    expect(mockNotificationService.error).toHaveBeenCalledWith('SMTP error');
    expect(component.visible).toBe(true);
    expect(component.isSending()).toBe(false);
  });
});
