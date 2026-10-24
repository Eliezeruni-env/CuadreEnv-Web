import { Injectable, signal } from '@angular/core';
import { formatInvoiceDateTime } from '../../cuadreEnv/utils/rd-date.util';

export interface TicketData {
  companyName: string;
  commercialName?: string;
  rnc?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  instagram?: string;
  whatsapp?: string;
  footerPhrase?: string;
  ticketShowQr?: boolean;
  qrUrl?: string;
  ncf?: string;
  ncfTypeDescription?: string;
  invoiceNumber: string;
  date: Date;
  cashierName?: string;
  customerName?: string;
  customerRnc?: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  itbis: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  amountReceived?: number;
  change?: number;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ThermalPrinterService {
  isConnected = signal<boolean>(false);
  printerName = signal<string | null>(localStorage.getItem('cuadre_bt_printer_name') || null);
  isPrinting = signal<boolean>(false);

  private bluetoothDevice: any = null;
  private characteristic: any = null;

  /**
   * Emparejar con impresora Bluetooth (ESC/POS 58mm/80mm)
   */
  async connectBluetooth(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
      throw new Error('Web Bluetooth no está soportado en este navegador. Usa Chrome en Android o PC.');
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Printer Service
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000ff00-0000-1000-8000-00805f9b34fb'
        ]
      });

      this.bluetoothDevice = device;
      this.printerName.set(device.name || 'Impresora Bluetooth');
      if (typeof window !== 'undefined') {
        localStorage.setItem('cuadre_bt_printer_name', device.name || 'Impresora Bluetooth');
      }

      const server = await device.gatt.connect();
      // Buscar servicio de impresión
      const services = await server.getPrimaryServices();
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            this.isConnected.set(true);
            return true;
          }
        }
      }
      this.isConnected.set(true);
      return true;
    } catch (err: any) {
      console.warn('[ThermalPrinter] Bluetooth connection error:', err);
      this.isConnected.set(false);
      throw err;
    }
  }

  /**
   * Generar texto plano formateado para recibo (58mm / 32 columnas)
   */
  generatePlainTextTicket(data: TicketData, width = 32): string {
    const pad = (str: string, len: number, right = false) => {
      const s = String(str || '');
      if (s.length >= len) return s.substring(0, len);
      const spaces = ' '.repeat(len - s.length);
      return right ? spaces + s : s + spaces;
    };

    const separator = '='.repeat(width);
    const lineSep = '-'.repeat(width);

    const displayName = (data.commercialName || data.companyName || 'CUADRE ENV').toUpperCase();
    let text = '';
    text += pad(displayName, width).trim().padStart(Math.floor((width + displayName.length) / 2)) + '\n';
    if (data.commercialName && data.companyName && data.commercialName.toUpperCase() !== data.companyName.toUpperCase()) {
      text += pad(data.companyName, width).trim().padStart(Math.floor((width + data.companyName.length) / 2)) + '\n';
    }
    if (data.rnc) text += `RNC: ${data.rnc}\n`;
    if (data.address) text += `${data.address}\n`;
    if (data.phone) text += `Tel: ${data.phone}\n`;
    text += `${separator}\n`;
    if (data.ncf) {
      text += `NCF: ${data.ncf}\n`;
      if (data.ncfTypeDescription) text += `${data.ncfTypeDescription}\n`;
    }
    text += `Factura: ${data.invoiceNumber}\n`;
    text += `Fecha: ${formatInvoiceDateTime(data.date)}\n`;
    if (data.cashierName) text += `Cajero: ${data.cashierName}\n`;
    if (data.customerName) text += `Cliente: ${data.customerName}\n`;
    if (data.customerRnc) text += `RNC/Céd: ${data.customerRnc}\n`;
    text += `${lineSep}\n`;

    // Encabezado de items (Cant  Desc          Total)
    text += `${pad('CANT', 5)} ${pad('DESC', width - 16)} ${pad('TOTAL', 9, true)}\n`;
    text += `${lineSep}\n`;

    for (const item of data.items) {
      const qtyStr = pad(String(item.quantity), 5);
      const totalStr = pad(item.total.toFixed(2), 9, true);
      const descWidth = width - 16;
      let descStr = item.description;
      if (descStr.length > descWidth) {
        text += `${qtyStr} ${pad(descStr.substring(0, descWidth), descWidth)} ${totalStr}\n`;
        text += `      ${descStr.substring(descWidth, descWidth * 2)}\n`;
      } else {
        text += `${qtyStr} ${pad(descStr, descWidth)} ${totalStr}\n`;
      }
    }

    text += `${lineSep}\n`;
    text += `${pad('Subtotal:', width - 12)} ${pad(data.subtotal.toFixed(2), 11, true)}\n`;
    if (data.itbis > 0) {
      text += `${pad('ITBIS (18%):', width - 12)} ${pad(data.itbis.toFixed(2), 11, true)}\n`;
    }
    if (data.discount && data.discount > 0) {
      text += `${pad('Descuento:', width - 12)} -${pad(data.discount.toFixed(2), 10, true)}\n`;
    }
    text += `${separator}\n`;
    text += `${pad('TOTAL RD$:', width - 13)} ${pad(data.total.toFixed(2), 12, true)}\n`;
    text += `${separator}\n`;

    text += `Pago: ${data.paymentMethod}\n`;
    if (data.amountReceived && data.amountReceived > 0) {
      text += `${pad('Efectivo Recibido:', width - 12)} ${pad(data.amountReceived.toFixed(2), 11, true)}\n`;
      text += `${pad('CAMBIO:', width - 12)} ${pad((data.change || 0).toFixed(2), 11, true)}\n`;
    }

    if (data.instagram || data.whatsapp) {
      let social = '';
      if (data.instagram) social += `IG: ${data.instagram} `;
      if (data.whatsapp) social += `WS: ${data.whatsapp}`;
      text += `\n${social.trim()}\n`;
    }

    if (data.footerPhrase) {
      text += `\n"${data.footerPhrase}"\n`;
    } else if (data.notes && data.notes.trim()) {
      text += `\n${separator}\n${data.notes.trim()}\n`;
    }

    text += `\n${pad('¡GRACIAS POR SU COMPRA!', width).trim().padStart(Math.floor((width + 23) / 2))}\n`;
    text += `${pad('CuadreEnv SaaS POS', width).trim().padStart(Math.floor((width + 18) / 2))}\n\n\n`;

    return text;
  }

  /**
   * Imprimir ticket a través de Bluetooth o diálogo de impresión térmica
   */
  async printTicket(data: TicketData, paperSize: '58mm' | '80mm' = '58mm'): Promise<boolean> {
    const width = paperSize === '80mm' ? 42 : 32;
    const rawText = this.generatePlainTextTicket(data, width);

    // 1. Intentar impresión Bluetooth directa si está conectado
    if (this.characteristic) {
      try {
        this.isPrinting.set(true);
        const encoder = new TextEncoder();
        const escInit = new Uint8Array([0x1B, 0x40]); // ESC @ (Reset)
        const cutPaper = new Uint8Array([0x1D, 0x56, 0x41, 0x10]); // Cut paper
        
        await this.characteristic.writeValue(escInit);
        
        // Enviar en bloques de 100 bytes para evitar buffer overflow en Bluetooth
        const bytes = encoder.encode(rawText);
        const chunkSize = 100;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          await this.characteristic.writeValue(chunk);
        }
        await this.characteristic.writeValue(cutPaper);
        this.isPrinting.set(false);
        return true;
      } catch (e) {
        console.warn('[ThermalPrinter] Bluetooth write failed, falling back to window.print:', e);
        this.isPrinting.set(false);
      }
    }

    // 2. Fallback: Ventana de impresión limpia con logo
    this.printViaBrowser(data, rawText, paperSize);
    return true;
  }

  private printViaBrowser(data: TicketData, content: string, paperSize: '58mm' | '80mm' = '58mm'): void {
    if (typeof window === 'undefined') return;
    const windowWidth = paperSize === '80mm' ? 420 : 350;
    const title = data.commercialName || data.companyName || 'Ticket';
    const printWindow = window.open('', '_blank', `width=${windowWidth},height=640`);
    if (!printWindow) return;

    const logoHtml = data.logoUrl
      ? `<div style="text-align: center; margin-bottom: 8px;">
           <img src="${data.logoUrl}" alt="Logo" style="max-height: 48px; max-width: 140px; object-fit: contain; display: block; margin: 0 auto;" />
         </div>`
      : '';

    const qrHtml = (data.ticketShowQr !== false && data.qrUrl)
      ? `<div style="text-align: center; margin-top: 10px;">
           <img src="${data.qrUrl}" alt="QR" style="width: 70px; height: 70px; display: block; margin: 0 auto;" />
           <div style="font-size: 10px; color: #555; margin-top: 3px;">Comprobante Digital</div>
         </div>`
      : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - Ticket</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              line-height: 1.25;
              margin: 0;
              padding: 10px;
              color: #000;
              background: #fff;
            }
            img {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            pre {
              font-family: inherit;
              font-size: inherit;
              margin: 0;
              white-space: pre-wrap;
              word-break: break-word;
            }
            @media print {
              body { padding: 0; }
              @page { margin: 0; size: ${paperSize} auto; }
            }
          </style>
        </head>
        <body>
          ${logoHtml}
          <pre>${content}</pre>
          ${qrHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }
}
