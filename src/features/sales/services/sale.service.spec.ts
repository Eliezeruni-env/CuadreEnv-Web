import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SaleService } from './sale.service';
import type { SendInvoiceEmailRequest } from '../../cuadreEnv/types/api';

describe('SaleService & Send Invoice Email', () => {
  let service: SaleService;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    service = new SaleService(mockApiClient);
  });

  it('should call POST /Sale/{id}/send-email with the provided payload', async () => {
    mockApiClient.post.mockResolvedValue({ success: true, message: 'Correo enviado con éxito' });

    const request: SendInvoiceEmailRequest = {
      email: 'cliente@example.com',
      subject: 'Factura #100 - CuadreEnv',
      message: 'Adjuntamos su factura',
      attachPdf: true,
    };

    const response = await service.sendInvoiceEmail(100, request);

    expect(mockApiClient.post).toHaveBeenCalledWith('/Sale/100/send-email', request);
    expect(response.success).toBe(true);
  });
});
