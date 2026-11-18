import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  InventoryIntelligenceService,
  ReorderSuggestion,
  DeadStockItem,
  GrossProfitMetric,
} from '../../services/inventory-intelligence.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-inventory-intelligence',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory-intelligence.component.html',
  styleUrls: ['./inventory-intelligence.component.scss'],
})
export class InventoryIntelligenceComponent implements OnInit {
  private readonly intelligenceService = inject(InventoryIntelligenceService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  isLoading = signal<boolean>(false);
  selectedTab = signal<'REORDER' | 'DEAD_STOCK' | 'PROFIT'>('REORDER');
  analysisDays = signal<number>(30);

  reorderSuggestions = signal<ReorderSuggestion[]>([]);
  deadStockItems = signal<DeadStockItem[]>([]);
  profitMetrics = signal<GrossProfitMetric>({
    totalSalesNet: 0,
    totalCogs: 0,
    grossProfit: 0,
    grossMarginPercent: 0,
  });

  // Filtros
  searchTerm = signal<string>('');
  urgencyFilter = signal<string>('ALL');

  // KPIs Calculados
  readonly totalPurchaseInvestment = computed(() => {
    return this.reorderSuggestions().reduce((acc, r) => acc + r.estimatedInvestment, 0);
  });

  readonly criticalProductsCount = computed(() => {
    return this.reorderSuggestions().filter((r) => r.urgency === 'CRITICAL').length;
  });

  readonly totalImmobilizedCapital = computed(() => {
    return this.deadStockItems().reduce((acc, d) => acc + d.immobilizedCapital, 0);
  });

  readonly filteredReorderSuggestions = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const urg = this.urgencyFilter();

    return this.reorderSuggestions().filter((r) => {
      if (urg !== 'ALL' && r.urgency !== urg) return false;
      if (!q) return true;
      return (
        r.productName.toLowerCase().includes(q) ||
        (r.barcode && r.barcode.toLowerCase().includes(q)) ||
        (r.supplierName && r.supplierName.toLowerCase().includes(q))
      );
    });
  });

  readonly filteredDeadStock = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return this.deadStockItems();
    return this.deadStockItems().filter(
      (d) =>
        d.productName.toLowerCase().includes(q) ||
        (d.barcode && d.barcode.toLowerCase().includes(q)),
    );
  });

  ngOnInit(): void {
    void this.runAnalysis();
  }

  async runAnalysis(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await this.intelligenceService.analyzeInventory(this.analysisDays());
      this.reorderSuggestions.set(res.reorderSuggestions);
      this.deadStockItems.set(res.deadStockItems);
      this.profitMetrics.set(res.profitMetrics);
    } catch (e) {
      console.error('Error calculando inteligencia de inventario:', e);
      this.notificationService.error('No se pudo completar el análisis de reposición.');
    } finally {
      this.isLoading.set(false);
    }
  }

  onPeriodChange(days: number): void {
    this.analysisDays.set(days);
    void this.runAnalysis();
  }

  copyPurchaseOrderList(): void {
    const items = this.filteredReorderSuggestions().filter((r) => r.suggestedPurchaseQty > 0);
    if (items.length === 0) {
      this.notificationService.info('No hay pedidos sugeridos para copiar.');
      return;
    }

    let text = `📦 *SUGERENCIA DE ORDEN DE COMPRA*\nFecha: ${new Date().toLocaleDateString('es-DO')}\n\n`;
    items.forEach((it, idx) => {
      text += `${idx + 1}. ${it.productName} -> Pedir: ${it.suggestedPurchaseQty} un. (Stock actual: ${it.currentStock})\n`;
    });
    text += `\n*Inversión Total Estimada:* RD$ ${this.totalPurchaseInvestment().toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      this.notificationService.success('Lista de compras copiada al portapapeles.');
    }
  }

  goToCreatePurchaseReceipt(): void {
    void this.router.navigate(['/purchases/receipts/create']);
  }
}
