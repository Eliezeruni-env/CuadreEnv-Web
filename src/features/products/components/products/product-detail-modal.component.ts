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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type { ProductDto } from '../../../cuadreEnv/types/api';
import { ProductService } from '../../services/product.service';
import { generateBarcodeSvg } from '../../../cuadreEnv/utils/barcode.util';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { CompanyService } from '../../../companies/services/company.service';

@Component({
  selector: 'app-product-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-detail-modal.component.html',
  styleUrls: ['./product-detail-modal.component.scss'],
})
export class ProductDetailModalComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly productService = inject(ProductService);
  private readonly notificationService = inject(NotificationService);
  private readonly companyService = inject(CompanyService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() editRequested = new EventEmitter<ProductDto>();

  readonly currentProduct = signal<ProductDto | null>(null);

  @Input()
  set product(val: ProductDto | null) {
    if (val) {
      // Si el producto no tiene imageUrl en memoria pero tiene una guardada localmente, enlazarla
      const photo = val.imageUrl || (val.id ? this.productService.getProductPhoto(val.id) : null) || (val.barcode ? this.productService.getProductPhoto(val.barcode) : null);
      this.currentProduct.set({
        ...val,
        imageUrl: photo || null,
      });
    } else {
      this.currentProduct.set(null);
    }
  }

  get product(): ProductDto | null {
    return this.currentProduct();
  }

  // Código de barras generado literalmente en SVG
  readonly barcodeSvg = computed<SafeHtml>(() => {
    const p = this.currentProduct();
    if (!p) return '';
    const code = (p.barcode || p.reference || `PRD-${p.id || '001'}`).trim();
    const rawSvg = generateBarcodeSvg(code, 52, 2.0);
    return this.sanitizer.bypassSecurityTrustHtml(rawSvg);
  });

  // Margen de ganancia
  readonly financialAnalysis = computed(() => {
    const p = this.currentProduct();
    if (!p) return { cost: 0, price: 0, profit: 0, marginPct: 0 };
    const cost = Number(p.cost) || 0;
    const price = Number(p.price || p.priceList || cost * 1.3);
    const profit = Math.max(0, price - cost);
    const marginPct = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
    return { cost, price, profit, marginPct };
  });

  // Estado del stock
  readonly stockHealth = computed(() => {
    const p = this.currentProduct();
    if (!p) return { status: 'none', label: 'Desconocido', colorClass: 'badge-secondary' };
    const stock = Number(p.stock) || 0;
    const min = Number(p.minimumQuantity) || 0;
    if (stock <= 0) {
      return { status: 'critical', label: 'Agotado (0 uds)', colorClass: 'badge-danger' };
    }
    if (min > 0 && stock <= min) {
      return { status: 'low', label: `Stock Bajo (${stock} uds - mín: ${min})`, colorClass: 'badge-warning' };
    }
    return { status: 'healthy', label: `En Stock (${stock} uds)`, colorClass: 'badge-success' };
  });

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  onEditClick(): void {
    const p = this.currentProduct();
    if (p) {
      this.close();
      this.editRequested.emit(p);
    }
  }

  printBarcodeLabel(): void {
    const p = this.currentProduct();
    if (!p) return;
    const comp = this.companyService.currentSettings();
    const compName = comp?.companyName || comp?.commercialName || 'CuadreEnv';
    const code = (p.barcode || p.reference || `PRD-${p.id || '001'}`).trim();
    const priceStr = `RD$ ${this.financialAnalysis().price.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const svgContent = generateBarcodeSvg(code, 48, 1.8);

    const printWin = window.open('', '_blank', 'width=450,height=380');
    if (!printWin) {
      this.notificationService.warning('Habilita los popups en el navegador para imprimir la etiqueta.');
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiqueta - ${p.description}</title>
        <style>
          @page { size: 58mm 40mm; margin: 2mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; margin: 0; padding: 4px; }
          .comp { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 2px; }
          .title { font-size: 12px; font-weight: 800; color: #0f172a; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .price { font-size: 14px; font-weight: 900; color: #2563eb; margin-bottom: 4px; }
          .barcode-box { display: flex; justify-content: center; margin-bottom: 2px; }
          .code-text { font-family: monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: #1e293b; }
        </style>
      </head>
      <body>
        <div class="comp">${compName}</div>
        <div class="title">${p.description}</div>
        <div class="price">${priceStr}</div>
        <div class="barcode-box">${svgContent}</div>
        <div class="code-text">${code}</div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  downloadBarcodeSvg(): void {
    const p = this.currentProduct();
    if (!p) return;
    const code = (p.barcode || p.reference || `PRD-${p.id || '001'}`).trim();
    const svgData = generateBarcodeSvg(code, 60, 2.2);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codigo-barra-${code}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.notificationService.success(`Código de barras SVG descargado: ${code}`);
  }
}
