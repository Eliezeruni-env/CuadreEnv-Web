import { Component, OnInit, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SpinnerComponent } from '@coreui/angular';
import { SaleService } from '../../../sales/services/sale.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { AccountReceivableService } from '../../../payments/services/account-receivable.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { ReportsService } from '../../services/reports.service';

export interface FinancialSaleRow {
  id: number | string;
  invoiceNumber: string;
  ncf?: string;
  date: string;
  customerName: string;
  customerRnc?: string;
  channel: string;
  paymentMethod: string;
  isCredit: boolean;
  subtotal: number;
  itbis: number;
  total: number;
  isCancelled: boolean;
}

export interface CashSessionReportRow {
  id: number;
  cashRegisterName: string;
  openedAt: string;
  closedAt?: string;
  initialAmount: number;
  finalAmount: number;
  totalSales: number;
  difference: number;
  status: string;
}

@Component({
  selector: 'app-financial-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SpinnerComponent],
  templateUrl: './financial-reports.component.html',
  styleUrls: ['./financial-reports.component.scss'],
})
export class FinancialReportsComponent implements OnInit {
  private readonly saleService = inject(SaleService);
  private readonly cashService = inject(CashRegisterService);
  private readonly receivableService = inject(AccountReceivableService);
  private readonly customerService = inject(CustomerService);
  private readonly reportsService = inject(ReportsService);
  public readonly authService = inject(AuthService);

  isLoading = signal<boolean>(true);
  activeTab = signal<'sales' | 'receivables' | 'cash' | 'dgii'>('sales');

  // Filter signals
  selectedPeriod = signal<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  customFromDate = signal<string>('');
  customToDate = signal<string>('');
  searchTerm = signal<string>('');
  selectedChannelFilter = signal<string>('ALL');

  // Data signals
  rawSales = signal<any[]>([]);
  rawCashSessions = signal<any[]>([]);
  rawReceivables = signal<any[]>([]);

  // Active company information
  companyName = computed(() => {
    return this.authService.activeCompany()?.name || 'Mi Empresa';
  });

  companyRnc = computed(() => {
    return this.authService.activeCompany()?.rnc || 'Sin RNC';
  });

  // Filtered sales according to active company and period
  filteredSales = computed<FinancialSaleRow[]>(() => {
    const list = this.rawSales();
    const period = this.selectedPeriod();
    const search = this.searchTerm().toLowerCase().trim();
    const channel = this.selectedChannelFilter();

    let cutoffStart: Date | null = null;
    let cutoffEnd: Date | null = null;
    const now = new Date();

    if (period === 'today') {
      cutoffStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      cutoffEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (period === 'week') {
      cutoffStart = new Date(now);
      cutoffStart.setDate(cutoffStart.getDate() - 7);
      cutoffStart.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      cutoffStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    } else if (period === 'year') {
      cutoffStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    } else if (period === 'custom') {
      if (this.customFromDate()) {
        cutoffStart = new Date(this.customFromDate() + 'T00:00:00');
      }
      if (this.customToDate()) {
        cutoffEnd = new Date(this.customToDate() + 'T23:59:59');
      }
    }

    return list
      .map((s) => {
        const dStr = s.createdAt || s.creationDate || s.date || '';
        const d = dStr ? new Date(dStr) : null;
        const tot = Number(s.totalAmount || s.total || 0);
        const itbis = Number(s.taxAmount || s.itbis || (tot > 0 ? (tot * 0.18) / 1.18 : 0));
        const sub = Math.max(0, tot - itbis);
        const invNo = s.invoiceNumber || s.invoiceNo || `FAC-${String(s.id).padStart(6, '0')}`;
        const ncf = s.ncf || s.ncfSequence || '-';
        const cName = s.customerName || s.clientName || 'Cliente de Contado';
        const cRnc = s.customerRnc || s.clientRnc || '';
        const ch = (s.originChannel || s.channel || 'POS').toUpperCase();
        const pMethod = s.paymentMethod || (s.isCredit ? 'Crédito' : 'Efectivo');

        return {
          id: s.id,
          invoiceNumber: invNo,
          ncf,
          date: d ? d.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A',
          rawDate: d,
          customerName: cName,
          customerRnc: cRnc,
          channel: ch,
          paymentMethod: pMethod,
          isCredit: !!s.isCredit,
          subtotal: sub,
          itbis: itbis,
          total: tot,
          isCancelled: !!s.isCancelled,
        };
      })
      .filter((row) => {
        if (row.isCancelled) return false;
        if (cutoffStart && row.rawDate && row.rawDate < cutoffStart) return false;
        if (cutoffEnd && row.rawDate && row.rawDate > cutoffEnd) return false;
        if (channel !== 'ALL' && !row.channel.includes(channel)) return false;
        if (search) {
          const matchInv = row.invoiceNumber.toLowerCase().includes(search);
          const matchNcf = row.ncf.toLowerCase().includes(search);
          const matchCust = row.customerName.toLowerCase().includes(search);
          const matchRnc = (row.customerRnc || '').toLowerCase().includes(search);
          if (!matchInv && !matchNcf && !matchCust && !matchRnc) return false;
        }
        return true;
      });
  });

  // Financial Totals
  totalGrossRevenue = computed(() => {
    return this.filteredSales().reduce((sum, r) => sum + r.total, 0);
  });

  totalItbisFiscal = computed(() => {
    return this.filteredSales().reduce((sum, r) => sum + r.itbis, 0);
  });

  totalNetTaxable = computed(() => {
    return this.filteredSales().reduce((sum, r) => sum + r.subtotal, 0);
  });

  totalCashSales = computed(() => {
    return this.filteredSales()
      .filter((r) => !r.isCredit && (r.paymentMethod.toLowerCase().includes('efect') || r.paymentMethod.toLowerCase().includes('cash')))
      .reduce((sum, r) => sum + r.total, 0);
  });

  totalDigitalSales = computed(() => {
    return this.filteredSales()
      .filter((r) => !r.isCredit && (r.paymentMethod.toLowerCase().includes('tarj') || r.paymentMethod.toLowerCase().includes('transf')))
      .reduce((sum, r) => sum + r.total, 0);
  });

  totalCreditSales = computed(() => {
    return this.filteredSales()
      .filter((r) => r.isCredit)
      .reduce((sum, r) => sum + r.total, 0);
  });

  totalInvoicesCount = computed(() => {
    return this.filteredSales().length;
  });

  // Receivables summary
  totalPendingReceivables = computed(() => {
    return this.rawReceivables().reduce((sum, item) => {
      const amt = item.pendingAmount !== undefined ? item.pendingAmount : (item.totalAmount - (item.paidAmount || 0));
      return sum + (Number(amt) || 0);
    }, 0);
  });

  constructor() {
    // React automatically when the user changes active company
    effect(() => {
      const cid = this.authService.companyId();
      if (cid) {
        this.loadFinancialData();
      }
    });
  }

  ngOnInit() {
    this.loadFinancialData();
  }

  setPeriod(period: 'today' | 'week' | 'month' | 'year' | 'custom') {
    this.selectedPeriod.set(period);
  }

  setTab(tab: 'sales' | 'receivables' | 'cash' | 'dgii') {
    this.activeTab.set(tab);
  }

  async loadFinancialData() {
    this.isLoading.set(true);
    const activeCid = this.authService.companyId();

    try {
      const [salesRes, cashRes, receivablesRes] = await Promise.all([
        this.saleService.getSales({ pageNumber: 1, pageSize: 200 }).catch(() => ({ success: false, data: [] })),
        this.cashService.getCashRegisters().catch(() => ({ success: false, data: [] })),
        this.receivableService.getOverdue().catch(() => ({ success: false, data: [] })),
      ]);

      let sales = (salesRes?.success && salesRes.data) ? salesRes.data : [];
      if (activeCid) {
        sales = sales.filter((s: any) => !s.companyId || s.companyId === activeCid);
      }
      this.rawSales.set(sales);

      let cashSessions = (cashRes?.success && cashRes.data) ? cashRes.data : [];
      if (activeCid) {
        cashSessions = cashSessions.filter((c: any) => !c.companyId || c.companyId === activeCid);
      }
      this.rawCashSessions.set(cashSessions);

      let receivables = (receivablesRes?.success && receivablesRes.data) ? receivablesRes.data : [];
      if (activeCid) {
        receivables = receivables.filter((r: any) => !r.companyId || r.companyId === activeCid);
      }
      this.rawReceivables.set(receivables);
    } catch (e) {
      console.error('Error loading financial reports:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  exportToCsv() {
    const rows = this.filteredSales();
    if (!rows.length) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'No Factura,NCF,Fecha,Cliente,RNC Cliente,Canal,Metodo Pago,Subtotal,ITBIS 18%,Total\n';

    rows.forEach((r) => {
      const line = [
        `"${r.invoiceNumber}"`,
        `"${r.ncf}"`,
        `"${r.date}"`,
        `"${r.customerName}"`,
        `"${r.customerRnc || ''}"`,
        `"${r.channel}"`,
        `"${r.paymentMethod}"`,
        r.subtotal.toFixed(2),
        r.itbis.toFixed(2),
        r.total.toFixed(2),
      ].join(',');
      csvContent += line + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Reporte_Financiero_${this.companyName()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  printReport() {
    window.print();
  }
}

