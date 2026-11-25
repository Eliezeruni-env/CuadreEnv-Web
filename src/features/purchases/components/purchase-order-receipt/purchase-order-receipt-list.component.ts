import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PurchaseOrderReceiptService } from '../../services/purchase-order-receipt.service';
import { CompanyService } from '../../../companies/services/company.service';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import type { PurchaseOrderReceipt } from '../../../../app/models/purchase-order';

@Component({
  selector: 'app-purchase-order-receipt-list',
  standalone: true,
  imports: [CommonModule, FormsModule, KtPaginatorComponent],
  templateUrl: './purchase-order-receipt-list.component.html',
  styleUrls: ['./purchase-order-receipt-list.component.scss'],
})
export class PurchaseOrderReceiptListComponent implements OnInit {
  private receiptService = inject(PurchaseOrderReceiptService);
  private companyService = inject(CompanyService);
  private router = inject(Router);

  receipts = signal<PurchaseOrderReceipt[]>([]);
  isLoading = signal<boolean>(false);
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  expandedReceiptId = signal<number | null>(null);

  selectedReceipt: PurchaseOrderReceipt | null = null;

  // Dynamic Column Sorting
  sortColumn = signal<string>('receiptDate');
  sortDirection = signal<'asc' | 'desc'>('desc');

  toggleSort(column: string): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  readonly filteredReceipts = computed(() => {
    const q = this.searchTerm.toLowerCase().trim();
    let list = this.receipts();
    if (q) {
      list = list.filter(
        (r) =>
          r.receiptNumber.toLowerCase().includes(q) ||
          (r.purchaseOrderNumber &&
            r.purchaseOrderNumber.toLowerCase().includes(q)) ||
          r.supplierName.toLowerCase().includes(q) ||
          (r.warehouseName && r.warehouseName.toLowerCase().includes(q)),
      );
    }

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      switch (col) {
        case 'receiptNumber':
          valA = (a.receiptNumber || '').toLowerCase();
          valB = (b.receiptNumber || '').toLowerCase();
          break;
        case 'orderNumber':
          valA = (a.purchaseOrderNumber || '').toLowerCase();
          valB = (b.purchaseOrderNumber || '').toLowerCase();
          break;
        case 'supplier':
          valA = (a.supplierName || '').toLowerCase();
          valB = (b.supplierName || '').toLowerCase();
          break;
        case 'warehouse':
          valA = (a.warehouseName || '').toLowerCase();
          valB = (b.warehouseName || '').toLowerCase();
          break;
        case 'receiptDate':
          valA = new Date(a.receiptDate || 0).getTime();
          valB = new Date(b.receiptDate || 0).getTime();
          break;
        case 'status':
          valA = (a.statusName || '').toLowerCase();
          valB = (b.statusName || '').toLowerCase();
          break;
        default:
          valA = new Date(a.receiptDate || 0).getTime();
          valB = new Date(b.receiptDate || 0).getTime();
      }
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  readonly pagedReceipts = computed(() => {
    const list = this.filteredReceipts();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  ngOnInit() {
    this.loadReceipts();
  }

  async loadReceipts() {
    this.isLoading.set(true);
    try {
      const res = await this.receiptService.getReceipts();
      if (res?.success && res.data) {
        this.receipts.set(res.data);
      }
    } catch {
      // ignore
    } finally {
      this.isLoading.set(false);
    }
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  toggleDetail(receipt: PurchaseOrderReceipt) {
    if (this.expandedReceiptId() === receipt.id) {
      this.expandedReceiptId.set(null);
    } else {
      this.expandedReceiptId.set(receipt.id);
    }
  }

  isReceiptExpanded(receiptId: number): boolean {
    return this.expandedReceiptId() === receiptId;
  }

  goToNewReceipt() {
    this.router.navigate(['/purchases/receipts/create']);
  }

  viewReceipt(receipt: PurchaseOrderReceipt) {
    this.selectedReceipt = receipt;
  }

  printReceipt() {
    this.printVoucher();
  }

  printVoucher(receipt?: PurchaseOrderReceipt) {
    const r = receipt || this.selectedReceipt;
    if (!r) return;

    const company = this.companyService.currentSettings();
    const companyName =
      company.commercialName ||
      (company as any).businessName ||
      (company as any).name ||
      'CuadreEnv Negocio';
    const dateStr = new Date(r.receiptDate).toLocaleDateString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const timeStr = new Date(r.receiptDate).toLocaleTimeString('es-DO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const items = r.productDetails || [];
    const totalQty = items.reduce(
      (acc, i) => acc + (Number(i.quantityReceived) || 0),
      0,
    );
    const totalAmount = items.reduce(
      (acc, i) =>
        acc +
        (Number(i.subTotal) ||
          (Number(i.quantityReceived) || 0) * (Number(i.unitCost) || 0)),
      0,
    );

    const itemsHtml = items
      .map(
        (item) => `
      <div style="margin-bottom: 5px; font-size: 11px;">
        <div style="font-weight: bold;">${item.productName}</div>
        <div style="display: flex; justify-content: space-between; color: #333;">
          <span>${item.barCode || 'S/C'} · ${item.quantityReceived} uds @ RD$ ${Number(item.unitCost || 0).toFixed(2)}</span>
          <span style="font-weight: bold;">RD$ ${Number(item.subTotal || (item.quantityReceived || 0) * (item.unitCost || 0)).toFixed(2)}</span>
        </div>
      </div>
    `,
      )
      .join('');

    const printWin = window.open('', '_blank', 'width=420,height=680');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recepción ${r.receiptNumber}</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              line-height: 1.3;
              padding: 10px;
              color: #000;
              background: #fff;
              max-width: 80mm;
              margin: 0 auto;
            }
            .text-center { text-align: center; }
            .fw-bold { font-weight: bold; }
            .divider {
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
            .double-divider {
              border-top: 2px solid #000;
              margin: 8px 0;
            }
            .row-data {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .signatures {
              margin-top: 35px;
              display: flex;
              justify-content: space-between;
              gap: 15px;
            }
            .sign-box {
              flex: 1;
              text-align: center;
              border-top: 1px solid #000;
              padding-top: 4px;
              font-size: 10px;
            }
            @media print {
              body { padding: 0; }
              @page { margin: 0; size: 80mm auto; }
            }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="fw-bold" style="font-size: 14px;">${companyName}</div>
            ${company.rnc ? `<div>RNC: ${company.rnc}</div>` : ''}
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
            <div class="double-divider"></div>
            <div class="fw-bold" style="font-size: 13px;">COMPROBANTE DE RECEPCIÓN</div>
            <div class="fw-bold font-monospace" style="font-size: 14px;"># ${r.receiptNumber}</div>
            <div class="divider"></div>
          </div>

          <div class="row-data"><span>Orden de Compra:</span><span class="fw-bold">${r.purchaseOrderNumber || 'N/A'}</span></div>
          <div class="row-data"><span>Fecha / Hora:</span><span>${dateStr} ${timeStr}</span></div>
          <div class="row-data"><span>Proveedor:</span><span class="fw-bold">${r.supplierName || 'General'}</span></div>
          <div class="row-data"><span>Almacén Receptor:</span><span>${r.warehouseName || 'Almacén Principal'}</span></div>

          <div class="divider"></div>
          <div class="fw-bold" style="font-size: 11px; margin-bottom: 6px;">ARTÍCULOS RECIBIDOS EN ALMACÉN:</div>
          ${itemsHtml || '<div class="text-center" style="font-size: 11px; font-style: italic;">Sin artículos detallados</div>'}

          <div class="double-divider"></div>
          <div class="row-data fw-bold" style="font-size: 13px;">
            <span>Total Unidades:</span>
            <span>${totalQty} uds</span>
          </div>
          <div class="row-data fw-bold" style="font-size: 13px;">
            <span>Valor Total Recibido:</span>
            <span>RD$ ${totalAmount.toFixed(2)}</span>
          </div>

          ${
            r.comments
              ? `
            <div class="divider"></div>
            <div style="font-size: 11px;"><strong>Observaciones:</strong> ${r.comments}</div>
          `
              : ''
          }

          <div class="signatures">
            <div class="sign-box">Recibido (Almacén)</div>
            <div class="sign-box">Entregado (Transporte)</div>
          </div>

          <div class="text-center" style="margin-top: 20px; font-size: 10px;">
            <div>*** COPIA DE ALMACÉN ***</div>
            <div>CuadreEnv ERP Cloud</div>
          </div>
        </body>
      </html>
    `);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 250);
  }
}
