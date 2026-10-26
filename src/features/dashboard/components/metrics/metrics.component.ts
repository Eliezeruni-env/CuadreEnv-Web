import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartjsComponent } from '@coreui/angular-chartjs';
import {
  SpinnerComponent,
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SaleService } from '../../../sales/services/sale.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { AccountReceivableService } from '../../../payments/services/account-receivable.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';

export interface TopProductItem {
  name: string;
  units: number;
  revenue: number;
  percentage: number;
  icon: string;
}

export interface PaymentBreakdown {
  cashAmount: number;
  cashPct: number;
  cardAmount: number;
  cardPct: number;
  transferAmount: number;
  transferPct: number;
  creditAmount: number;
  creditPct: number;
  total: number;
}

export interface ExecutiveKpiRow {
  category: string;
  name: string;
  code: string;
  value: string;
  formula: string;
  status: 'EXCELLENT' | 'STABLE' | 'ATTENTION' | 'INFO';
  statusLabel: string;
  statusClass: string;
  badgeColor: string;
  impact: string;
}

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ChartjsComponent,
    SpinnerComponent,
    IconDirective,
  ],
  templateUrl: './metrics.component.html',
  styleUrls: ['./metrics.component.scss'],
})
export class MetricsComponent implements OnInit {
  private saleService = inject(SaleService);
  private cashService = inject(CashRegisterService);
  private receivableService = inject(AccountReceivableService);
  private customerService = inject(CustomerService);
  public authService = inject(AuthService);
  public translationService = inject(TranslationService);

  isLoading = signal<boolean>(true);

  // Filters
  selectedDateRange = signal<string>('month');
  selectedPeriod = signal<'7D' | '30D' | '90D' | '1A'>('30D');

  // Key KPI signals
  totalRevenue = signal<number>(0);
  totalSalesCount = signal<number>(0);
  averageTicket = signal<number>(0);
  netMarginAmount = signal<number>(0);
  netMarginPercent = signal<number>(0);
  totalItbis = signal<number>(0);
  totalCashIn = signal<number>(0);
  totalCashOut = signal<number>(0);
  totalCustomersCount = signal<number>(0);
  totalUnitsSold = signal<number>(0);
  overdueDebtAmount = signal<number>(0);
  overdueDebtCount = signal<number>(0);

  // Extended Advanced KPIs
  maxSaleAmount = signal<number>(0);
  dailyAvgRevenue = signal<number>(0);
  dailyAvgTransactions = signal<number>(0);
  unitsPerTicket = signal<number>(0);
  totalDiscounts = signal<number>(0);
  netCashFlow = signal<number>(0);

  // KPI Performance Matrix Table
  kpiTableRows = signal<ExecutiveKpiRow[]>([]);
  selectedTableCategory = signal<string>('ALL');

  filteredKpiTableRows = computed(() => {
    const cat = this.selectedTableCategory();
    const rows = this.kpiTableRows();
    if (cat === 'ALL') return rows;
    return rows.filter((r) => r.category === cat);
  });

  tableCategories = computed(() => {
    const categories = new Set(this.kpiTableRows().map((r) => r.category));
    return ['ALL', ...Array.from(categories)];
  });

  setTableCategory(cat: string) {
    this.selectedTableCategory.set(cat);
  }

  // Top Products list
  topProducts = signal<TopProductItem[]>([]);

  // Payment Breakdown
  paymentBreakdown = signal<PaymentBreakdown>({
    cashAmount: 0,
    cashPct: 0,
    cardAmount: 0,
    cardPct: 0,
    transferAmount: 0,
    transferPct: 0,
    creditAmount: 0,
    creditPct: 0,
    total: 0,
  });

  // Charts
  chartSalesOverTime: ChartData = { labels: [], datasets: [] };
  chartPaymentMethods: ChartData = { labels: [], datasets: [] };
  chartCashFlow: ChartData = { labels: [], datasets: [] };

  // Sales trend line chart options
  salesChartOptions: ChartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    layout: {
      padding: {
        top: 8,
        bottom: 8,
        left: 4,
        right: 8,
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => ` Venta: RD$ ${(context.parsed.y || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 11 },
          color: '#64748b',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 7,
          padding: 4,
        },
      },
      y: {
        beginAtZero: true,
        suggestedMin: 0,
        suggestedMax: 100,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: {
          precision: 0,
          font: { size: 11 },
          color: '#64748b',
          callback: (value) => `RD$ ${Number(value).toLocaleString('es-DO')}`,
          padding: 4,
        },
      },
    },
  };

  // Donut chart options
  donutChartOptions: any = {
    maintainAspectRatio: false,
    responsive: true,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => ` ${context.label}: RD$ ${(Number(context.raw) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
        },
      },
    },
  };

  // Cash flow bar chart options
  cashFlowOptions: ChartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    layout: {
      padding: {
        top: 8,
        bottom: 8,
        left: 4,
        right: 8,
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'circle' },
      },
      tooltip: {
        callbacks: {
          label: (context) => ` ${context.dataset.label}: RD$ ${(context.parsed.y || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 11 },
          color: '#64748b',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 7,
          padding: 4,
        },
      },
      y: {
        beginAtZero: true,
        suggestedMin: 0,
        suggestedMax: 100,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: {
          precision: 0,
          font: { size: 11 },
          color: '#64748b',
          callback: (value) => `RD$ ${Number(value).toLocaleString('es-DO')}`,
          padding: 4,
        },
      },
    },
  };

  readonly isAuthorized = computed(() => {
    return (
      this.authService.isSuperUser() ||
      this.authService.hasRole(['Admin', 'SuperUser', 'Auditor', 'Audit'])
    );
  });

  ngOnInit() {
    if (this.isAuthorized()) {
      this.loadMetricsData();
    } else {
      this.isLoading.set(false);
    }
  }

  private cachedSales: any[] = [];
  private cachedCashRegisters: any[] = [];

  setPeriod(period: '7D' | '30D' | '90D' | '1A') {
    this.selectedPeriod.set(period);
    this.calculatePeriodMetrics();
  }

  async loadMetricsData() {
    this.isLoading.set(true);

    try {
      const [salesRes, cashRes, custRes, overdueRes] = await Promise.all([
        this.saleService.getSales().catch(() => ({ success: false, data: [] })),
        this.cashService.getCashRegisters().catch(() => ({ success: false, data: [] })),
        this.customerService.getCustomers({ pageNumber: 1, pageSize: 200 } as any).catch(() => ({ success: false, data: [] })),
        this.receivableService.getOverdue().catch(() => ({ success: false, data: [] })),
      ]);

      const sales = (salesRes?.success && salesRes.data)
        ? salesRes.data.filter((s: any) => !s.isCancelled)
        : [];
      this.cachedSales = sales;

      this.cachedCashRegisters = (cashRes?.success && cashRes.data) ? cashRes.data : [];
      const customers = (custRes?.success && custRes.data) ? custRes.data : [];
      this.totalCustomersCount.set(customers.length);

      // Overdue receivables
      const overdue = (overdueRes?.success && overdueRes.data) ? overdueRes.data : [];
      this.overdueDebtCount.set(overdue.length);
      const totalOverdue = overdue.reduce((sum: number, item: any) => {
        const amt = item.pendingAmount !== undefined ? item.pendingAmount : (item.totalAmount - (item.paidAmount || 0));
        return sum + (Number(amt) || 0);
      }, 0);
      this.overdueDebtAmount.set(totalOverdue);

      this.calculatePeriodMetrics();
    } catch {
      // ignore
    } finally {
      this.isLoading.set(false);
    }
  }

  private calculatePeriodMetrics() {
    const days = this.selectedPeriod() === '7D' ? 7 : this.selectedPeriod() === '30D' ? 30 : this.selectedPeriod() === '90D' ? 90 : 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);

    const periodSales = this.cachedSales.filter((s: any) => {
      const dateStr = s.createdAt || s.creationDate || s.date;
      if (!dateStr) return true;
      const sDate = new Date(dateStr);
      return isNaN(sDate.getTime()) ? true : sDate >= cutoff;
    });

    // 1. Revenue & Ticket KPIs
    const revenue = periodSales.reduce((sum: number, s: any) => sum + (s.totalAmount || s.total || 0), 0);
    this.totalRevenue.set(revenue);
    this.totalSalesCount.set(periodSales.length);
    this.averageTicket.set(periodSales.length > 0 ? revenue / periodSales.length : 0);

    // 2. Fiscal ITBIS & Real Net Profit Margins
    let periodItbis = 0;
    let periodCogs = 0;

    periodSales.forEach((s: any) => {
      const tot = Number(s.totalAmount || s.total || 0);
      const tax = Number(s.taxAmount || s.itbis || (tot > 0 ? (tot * 0.18) / 1.18 : 0));
      periodItbis += tax;

      const details = s.details || s.items || s.saleDetails || [];
      if (Array.isArray(details) && details.length > 0) {
        details.forEach((it: any) => {
          const qty = Number(it.quantity) || 1;
          const cost = Number(it.costPrice || it.unitCost || (it.unitPrice ? it.unitPrice * 0.65 : 0));
          periodCogs += cost * qty;
        });
      } else {
        periodCogs += (tot - tax) * 0.65;
      }
    });

    this.totalItbis.set(periodItbis);
    const netMargin = Math.max(0, revenue - periodItbis - periodCogs);
    const marginPct = revenue > 0 ? Math.round((netMargin / revenue) * 1000) / 10 : 0;
    this.netMarginAmount.set(netMargin);
    this.netMarginPercent.set(marginPct);

    // 3. Payment Methods Breakdown
    let cashTotal = 0;
    let cardTotal = 0;
    let transferTotal = 0;
    let creditTotal = 0;

    periodSales.forEach((s: any) => {
      const amt = Number(s.totalAmount || s.total || 0);
      const m = (s.paymentMethod || s.method || 'Efectivo').toLowerCase();
      if (m.includes('tarjeta') || m.includes('card')) {
        cardTotal += amt;
      } else if (m.includes('transf') || m.includes('banc')) {
        transferTotal += amt;
      } else if (m.includes('cred') || m.includes('créd')) {
        creditTotal += amt;
      } else {
        cashTotal += amt;
      }
    });

    const methodsSum = cashTotal + cardTotal + transferTotal + creditTotal || revenue || 0;
    const divisor = methodsSum > 0 ? methodsSum : 1;
    this.paymentBreakdown.set({
      cashAmount: cashTotal,
      cashPct: methodsSum > 0 ? Math.round((cashTotal / divisor) * 1000) / 10 : 0,
      cardAmount: cardTotal,
      cardPct: methodsSum > 0 ? Math.round((cardTotal / divisor) * 1000) / 10 : 0,
      transferAmount: transferTotal,
      transferPct: methodsSum > 0 ? Math.round((transferTotal / divisor) * 1000) / 10 : 0,
      creditAmount: creditTotal,
      creditPct: methodsSum > 0 ? Math.round((creditTotal / divisor) * 1000) / 10 : 0,
      total: methodsSum,
    });

    const isZeroPayments = cashTotal === 0 && cardTotal === 0 && transferTotal === 0 && creditTotal === 0;
    this.chartPaymentMethods = {
      labels: isZeroPayments ? ['Sin operaciones registradas'] : ['Efectivo', 'Tarjeta', 'Transferencia', 'Crédito'],
      datasets: [
        {
          backgroundColor: isZeroPayments
            ? ['#e2e8f0']
            : ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'],
          borderWidth: isZeroPayments ? 0 : 2,
          borderColor: '#ffffff',
          hoverOffset: isZeroPayments ? 0 : 4,
          data: isZeroPayments ? [1] : [cashTotal, cardTotal, transferTotal, creditTotal],
        },
      ],
    };

    // 4. Cash Flow: Entradas vs Salidas
    let totalIn = 0;
    let totalOut = 0;
    this.cachedCashRegisters.forEach((cr: any) => {
      totalIn += Number(cr.totalIn || cr.inAmount || 0);
      totalOut += Number(cr.totalOut || cr.outAmount || 0);
    });
    this.totalCashIn.set(totalIn);
    this.totalCashOut.set(totalOut);

    const flowDays: string[] = [];
    const inData: number[] = [];
    const outData: number[] = [];

    const numPoints = days > 30 ? 6 : Math.min(days, 7);
    const step = Math.max(1, Math.floor(days / numPoints));

    for (let i = numPoints - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * step);
      const label = d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
      flowDays.push(label);
      inData.push(i === 0 ? (totalIn || revenue) : 0);
      outData.push(i === 0 ? totalOut : 0);
    }

    this.chartCashFlow = {
      labels: flowDays,
      datasets: [
        {
          label: 'Entradas de Caja',
          backgroundColor: '#0d9488',
          borderRadius: 4,
          data: inData,
        },
        {
          label: 'Salidas de Caja',
          backgroundColor: '#f43f5e',
          borderRadius: 4,
          data: outData,
        },
      ],
    };

    // 5. Pareto (80/20) Top Products Sold & Units
    const productStats: Record<string, { units: number; revenue: number }> = {};
    let totalUnits = 0;

    periodSales.forEach((s: any) => {
      const items = s.items || s.saleDetails || s.details || [];
      items.forEach((it: any) => {
        const name = it.productName || it.description || `Producto #${it.productId || 1}`;
        const qty = Number(it.quantity) || 1;
        const lineRev = (Number(it.unitPrice) || 0) * qty;
        if (!productStats[name]) {
          productStats[name] = { units: 0, revenue: 0 };
        }
        productStats[name].units += qty;
        productStats[name].revenue += lineRev;
        totalUnits += qty;
      });
    });

    this.totalUnitsSold.set(totalUnits);

    const icons = ['📦', '🧴', '👕', '👟', '💼'];
    const sortedNames = Object.keys(productStats)
      .sort((a, b) => productStats[b].revenue - productStats[a].revenue)
      .slice(0, 5);

    const maxRevenue = sortedNames.length > 0 ? productStats[sortedNames[0]].revenue : 1;

    if (sortedNames.length > 0) {
      this.topProducts.set(
        sortedNames.map((name, index) => ({
          name,
          units: productStats[name].units,
          revenue: productStats[name].revenue,
          percentage: Math.round((productStats[name].revenue / (maxRevenue || 1)) * 100),
          icon: icons[index % icons.length],
        }))
      );
    } else {
      this.topProducts.set([
        { name: 'Sin productos en el período', units: 0, revenue: 0, percentage: 0, icon: '📦' },
      ]);
    }

    // 6. Extended KPIs & Metrics Table Calculation
    const dailyAvg = days > 0 ? revenue / days : 0;
    this.dailyAvgRevenue.set(dailyAvg);

    const dailyTransactions = days > 0 ? Math.round((periodSales.length / days) * 10) / 10 : 0;
    this.dailyAvgTransactions.set(dailyTransactions);

    let maxSale = 0;
    let periodDiscounts = 0;
    periodSales.forEach((s: any) => {
      const amt = Number(s.totalAmount || s.total || 0);
      if (amt > maxSale) maxSale = amt;
      const disc = Number(s.discountAmount || s.discount || 0);
      periodDiscounts += disc;
    });
    this.maxSaleAmount.set(maxSale);
    this.totalDiscounts.set(periodDiscounts);

    const uPerTicket = periodSales.length > 0 ? Math.round((totalUnits / periodSales.length) * 10) / 10 : 0;
    this.unitsPerTicket.set(uPerTicket);

    const netCash = totalIn - totalOut;
    this.netCashFlow.set(netCash);

    const customersCount = this.totalCustomersCount();

    const tableRows: ExecutiveKpiRow[] = [
      {
        category: 'Ventas & Ritmo Comercial',
        name: 'Facturación Promedio por Día',
        code: 'REV-DAY',
        value: `RD$ ${dailyAvg.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        formula: `Facturación Total (RD$ ${revenue.toLocaleString('es-DO', { minimumFractionDigits: 2 })}) / ${days} días`,
        status: revenue > 0 ? 'EXCELLENT' : 'STABLE',
        statusLabel: revenue > 0 ? 'Activo' : 'Sin Ventas',
        statusClass: revenue > 0 ? 'badge bg-success-subtle text-success' : 'badge bg-light text-secondary',
        badgeColor: '#10b981',
        impact: 'Indica la velocidad promedio de ingresos generados por jornada en el período analizado.',
      },
      {
        category: 'Ventas & Ritmo Comercial',
        name: 'Ticket Promedio por Operación',
        code: 'AOV',
        value: `RD$ ${(periodSales.length > 0 ? revenue / periodSales.length : 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        formula: 'Facturación Total / Cantidad de Transacciones',
        status: 'EXCELLENT',
        statusLabel: 'Consistente',
        statusClass: 'badge bg-primary-subtle text-primary',
        badgeColor: '#3b82f6',
        impact: 'Capacidad de compra promedio por cliente en cada transacción concretada.',
      },
      {
        category: 'Ventas & Ritmo Comercial',
        name: 'Venta Récord (Ticket Máximo)',
        code: 'MAX-SALE',
        value: `RD$ ${maxSale.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        formula: 'Mayor monto de venta individual en una factura',
        status: maxSale > 0 ? 'EXCELLENT' : 'STABLE',
        statusLabel: maxSale > 0 ? 'Récord' : 'N/A',
        statusClass: maxSale > 0 ? 'badge bg-info-subtle text-info' : 'badge bg-light text-secondary',
        badgeColor: '#0ea5e9',
        impact: 'Pico comercial más alto alcanzado en una sola factura durante el intervalo.',
      },
      {
        category: 'Rentabilidad & Márgenes',
        name: 'Margen Neto de Ganancia Estimado',
        code: 'NET-MRG',
        value: `${marginPct}% (RD$ ${netMargin.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
        formula: '(Facturación - Costo de Mercancía) / Facturación',
        status: marginPct >= 30 ? 'EXCELLENT' : marginPct >= 15 ? 'STABLE' : 'ATTENTION',
        statusLabel: marginPct >= 30 ? 'Alto Rendimiento' : marginPct >= 15 ? 'Rentable' : 'Margen Bajo',
        statusClass: marginPct >= 30 ? 'badge bg-success-subtle text-success' : marginPct >= 15 ? 'badge bg-primary-subtle text-primary' : 'badge bg-warning-subtle text-warning',
        badgeColor: '#10b981',
        impact: 'Proporción de cada peso facturado que se convierte en ganancia neta para la empresa.',
      },
      {
        category: 'Inventario & Rotación',
        name: 'Artículos por Factura (Profundidad de Cesta)',
        code: 'UPT',
        value: `${uPerTicket} artículos/ticket`,
        formula: `Unidades Despachadas (${totalUnits}) / Facturas Emitidas (${periodSales.length})`,
        status: 'STABLE',
        statusLabel: 'Estable',
        statusClass: 'badge bg-secondary-subtle text-secondary',
        badgeColor: '#64748b',
        impact: 'Mide cuántos productos adquiere un comprador por visita; clave para venta cruzada.',
      },
      {
        category: 'Inventario & Rotación',
        name: 'Velocidad de Despacho de Mercancía',
        code: 'UNIT-DAY',
        value: `${days > 0 ? (totalUnits / days).toFixed(1) : 0} unds/día`,
        formula: `Unidades Totales Vendidas / ${days} días`,
        status: 'INFO',
        statusLabel: 'Rotación',
        statusClass: 'badge bg-info-subtle text-info',
        badgeColor: '#0284c7',
        impact: 'Frecuencia de salida de inventario para planificar reposiciones con proveedores.',
      },
      {
        category: 'Caja & Tesorería',
        name: 'Flujo Neto Operativo de Gaveta',
        code: 'NET-CASH',
        value: `RD$ ${netCash.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        formula: `Entradas de Caja (RD$ ${totalIn.toLocaleString('es-DO')}) - Salidas (RD$ ${totalOut.toLocaleString('es-DO')})`,
        status: netCash >= 0 ? 'EXCELLENT' : 'ATTENTION',
        statusLabel: netCash >= 0 ? 'Superávit' : 'Déficit',
        statusClass: netCash >= 0 ? 'badge bg-success-subtle text-success' : 'badge bg-danger-subtle text-danger',
        badgeColor: '#059669',
        impact: 'Saldo neto de efectivo disponible en las gavetas de cobro tras pagar gastos menores.',
      },
      {
        category: 'Caja & Tesorería',
        name: 'Cobros Inmediatos en Efectivo',
        code: 'CASH-SHARE',
        value: `${this.paymentBreakdown().cashPct}% (RD$ ${this.paymentBreakdown().cashAmount.toLocaleString('es-DO')})`,
        formula: 'Efectivo Recaudado / Facturación Total',
        status: 'STABLE',
        statusLabel: 'Inmediato',
        statusClass: 'badge bg-success-subtle text-success',
        badgeColor: '#10b981',
        impact: 'Liquidez instantánea sin comisiones financieras ni demoras bancarias.',
      },
      {
        category: 'Caja & Tesorería',
        name: 'Cobros por Medios Digitales (Tarjeta & Banco)',
        code: 'DIG-SHARE',
        value: `${(this.paymentBreakdown().cardPct + this.paymentBreakdown().transferPct).toFixed(1)}%`,
        formula: '(Tarjeta + Transferencia) / Facturación Total',
        status: 'INFO',
        statusLabel: 'Bancarizado',
        statusClass: 'badge bg-primary-subtle text-primary',
        badgeColor: '#3b82f6',
        impact: 'Porcentaje de ventas liquidadas electrónicamente a través de tarjeta o transferencia.',
      },
      {
        category: 'Crédito & Cartera',
        name: 'Cartera Vencida (Cuentas por Cobrar Morosas)',
        code: 'OVERDUE-CXC',
        value: `RD$ ${this.overdueDebtAmount().toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        formula: `${this.overdueDebtCount()} facturas a crédito con fecha de vencimiento superada`,
        status: this.overdueDebtCount() === 0 ? 'EXCELLENT' : 'ATTENTION',
        statusLabel: this.overdueDebtCount() === 0 ? 'Al Día' : 'Atención',
        statusClass: this.overdueDebtCount() === 0 ? 'badge bg-success-subtle text-success' : 'badge bg-danger-subtle text-danger',
        badgeColor: '#ef4444',
        impact: 'Dinero pendiente de cobro en la calle que requiere llamadas o gestión de cobranza.',
      },
      {
        category: 'Estrategia Comercial',
        name: 'Descuentos & Promociones Otorgadas',
        code: 'DISCOUNTS',
        value: `RD$ ${periodDiscounts.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        formula: 'Suma de rebajas comerciales aplicadas en las ventas',
        status: 'INFO',
        statusLabel: 'Promocional',
        statusClass: 'badge bg-warning-subtle text-warning',
        badgeColor: '#f59e0b',
        impact: 'Inversión en descuentos concedidos a los clientes para dinamizar ventas.',
      },
      {
        category: 'Clientes & Cartera',
        name: 'Gasto Promedio por Cliente en Base de Datos',
        code: 'CUST-AVG',
        value: `RD$ ${(customersCount > 0 ? revenue / customersCount : 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        formula: `Facturación Período / ${customersCount} Clientes Registrados`,
        status: 'STABLE',
        statusLabel: 'Fidelidad',
        statusClass: 'badge bg-info-subtle text-info',
        badgeColor: '#0ea5e9',
        impact: 'Ingreso promedio generado por cada cliente registrado en el catálogo del sistema.',
      },
    ];

    this.kpiTableRows.set(tableRows);

    // 7. Update Sales Trend Chart
    this.updateSalesTrendChart();
  }

  updateSalesTrendChart() {
    const daysCount = this.selectedPeriod() === '7D' ? 7 : this.selectedPeriod() === '30D' ? 30 : this.selectedPeriod() === '90D' ? 90 : 365;

    const salesByDate: Record<string, number> = {};
    this.cachedSales.forEach((s: any) => {
      const dateKey = (s.createdAt || s.date || '').split('T')[0];
      if (dateKey) {
        salesByDate[dateKey] = (salesByDate[dateKey] || 0) + (s.totalAmount || s.total || 0);
      }
    });

    const labels: string[] = [];
    const dataPoints: number[] = [];

    const step = daysCount > 90 ? 30 : daysCount > 30 ? 7 : 1;
    const numPoints = Math.min(Math.ceil(daysCount / step), 12);

    for (let i = numPoints - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * step);
      const iso = d.toISOString().split('T')[0];
      const displayLabel = d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
      labels.push(displayLabel);
      dataPoints.push(salesByDate[iso] || 0);
    }

    // If all zero and we have revenue, place revenue on last point for clean display
    const salesSeries: number[] = [...dataPoints];
    const hasNoSales = !salesSeries.some((val) => val > 0);
    if (hasNoSales && this.totalRevenue() > 0 && salesSeries.length > 0) {
      salesSeries[salesSeries.length - 1] = this.totalRevenue();
    }

    this.chartSalesOverTime = {
      labels,
      datasets: [
        {
          label: 'Ventas (RD$)',
          backgroundColor: 'rgba(79, 70, 229, 0.08)',
          borderColor: '#4f46e5',
          borderWidth: 2.5,
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.4,
          data: salesSeries,
        },
      ],
    };
  }
}
