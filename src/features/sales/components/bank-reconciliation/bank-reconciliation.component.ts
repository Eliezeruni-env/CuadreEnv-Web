import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BankReconciliationService,
  BankTransferRecord,
  BankReconciliationStatus,
} from '../../services/bank-reconciliation.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';

export interface BankReconciliationItem {
  id: string;
  date: string;
  bankReference: string;
  invoiceNumber: string;
  customerName: string;
  destinationBank: string;
  registeredAmount: number;
  statementAmount: number | null;
  difference: number | null;
  status: 'Conciliada' | 'Pendiente' | 'Discrepancia';
  notes?: string;
}

const STORAGE_BANK_RECONCILIATION = 'cuadreenv_bank_reconciliation_v2';

@Component({
  selector: 'app-bank-reconciliation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bank-reconciliation.component.html',
  styleUrls: ['./bank-reconciliation.component.scss'],
})
export class BankReconciliationComponent implements OnInit {
  private readonly reconciliationService = inject(BankReconciliationService);
  private readonly notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);

  records = signal<BankReconciliationItem[]>(this.loadInitialRecords());
  isLoading = signal<boolean>(false);

  // Filtros
  searchTerm = signal<string>('');
  selectedBank = signal<string>('ALL');
  selectedStatus = signal<string>('ALL');
  selectedPeriod = signal<string>('ALL');
  activeTab = signal<'TODAS' | 'PENDIENTES' | 'CONCILIADAS' | 'DISCREPANCIAS'>(
    'TODAS',
  );

  // Sorting
  sortColumn = signal<string>('date');
  sortDirection = signal<'asc' | 'desc'>('desc');

  toggleSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  // Modales
  isReconcileModalOpen = signal<boolean>(false);
  activeItemForReconciliation = signal<BankReconciliationItem | null>(null);
  manualReferenceInput = signal<string>('');
  manualAmountInput = signal<number>(0);

  isImportModalOpen = signal<boolean>(false);
  selectedBankForImport = signal<string>('Banco Popular');

  isDetailModalOpen = signal<boolean>(false);
  activeItemForDetail = signal<BankReconciliationItem | null>(null);

  // Métricas KPI
  readonly totalTransferredAmount = computed(() => {
    return this.records().reduce((acc, r) => acc + r.registeredAmount, 0);
  });

  readonly totalTransfersCount = computed(() => this.records().length);

  readonly reconciledAmount = computed(() => {
    return this.records()
      .filter((r) => r.status === 'Conciliada')
      .reduce((acc, r) => acc + (r.statementAmount ?? r.registeredAmount), 0);
  });

  readonly reconciledCount = computed(() => {
    return this.records().filter((r) => r.status === 'Conciliada').length;
  });

  readonly pendingAmount = computed(() => {
    return this.records()
      .filter((r) => r.status === 'Pendiente')
      .reduce((acc, r) => acc + r.registeredAmount, 0);
  });

  readonly pendingCount = computed(() => {
    return this.records().filter((r) => r.status === 'Pendiente').length;
  });

  readonly discrepancyAmount = computed(() => {
    return this.records()
      .filter((r) => r.status === 'Discrepancia')
      .reduce((acc, r) => acc + r.registeredAmount, 0);
  });

  readonly discrepancyCount = computed(() => {
    return this.records().filter((r) => r.status === 'Discrepancia').length;
  });

  readonly availableBanks = computed(() => {
    const set = new Set<string>();
    this.records().forEach((r) => {
      if (r.destinationBank) set.add(r.destinationBank);
    });
    return Array.from(set).sort();
  });

  readonly filteredRecords = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const bank = this.selectedBank();
    const status = this.selectedStatus();
    const tab = this.activeTab();

    const list = this.records().filter((r) => {
      // Tab filter
      if (tab === 'PENDIENTES' && r.status !== 'Pendiente') return false;
      if (tab === 'CONCILIADAS' && r.status !== 'Conciliada') return false;
      if (tab === 'DISCREPANCIAS' && r.status !== 'Discrepancia') return false;

      // Select filters
      if (bank !== 'ALL' && r.destinationBank !== bank) return false;
      if (status !== 'ALL' && r.status !== status) return false;

      // Search term
      if (!q) return true;
      return (
        r.bankReference.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.destinationBank.toLowerCase().includes(q)
      );
    });

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      switch (col) {
        case 'date':
          valA = a.date || '';
          valB = b.date || '';
          break;
        case 'reference':
          valA = (a.bankReference || '').toLowerCase();
          valB = (b.bankReference || '').toLowerCase();
          break;
        case 'invoice':
          valA = (a.invoiceNumber || '').toLowerCase();
          valB = (b.invoiceNumber || '').toLowerCase();
          break;
        case 'bank':
          valA = (a.destinationBank || '').toLowerCase();
          valB = (b.destinationBank || '').toLowerCase();
          break;
        case 'registered':
          valA = a.registeredAmount || 0;
          valB = b.registeredAmount || 0;
          break;
        case 'statement':
          valA = a.statementAmount ?? 0;
          valB = b.statementAmount ?? 0;
          break;
        case 'difference':
          valA = a.difference ?? 0;
          valB = b.difference ?? 0;
          break;
        case 'status':
          valA = (a.status || '').toLowerCase();
          valB = (b.status || '').toLowerCase();
          break;
        default:
          valA = a.date || '';
          valB = b.date || '';
      }
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  ngOnInit(): void {
    this.refreshRecords();
  }

  loadInitialRecords(): BankReconciliationItem[] {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_BANK_RECONCILIATION);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  readonly hasActiveFilters = computed(() => {
    return (
      this.searchTerm().trim() !== '' ||
      this.selectedBank() !== 'ALL' ||
      this.selectedStatus() !== 'ALL' ||
      this.selectedPeriod() !== 'ALL' ||
      this.activeTab() !== 'TODAS'
    );
  });

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedBank.set('ALL');
    this.selectedStatus.set('ALL');
    this.selectedPeriod.set('ALL');
    this.activeTab.set('TODAS');
  }

  saveRecords(items: BankReconciliationItem[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_BANK_RECONCILIATION, JSON.stringify(items));
    }
    this.records.set(items);
  }

  async refreshRecords(): Promise<void> {
    this.isLoading.set(true);
    try {
      // Mantener los registros persistidos o recargar
      const current = this.loadInitialRecords();
      this.records.set(current);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Conciliar Modal Action
  openConciliarModal(item: BankReconciliationItem): void {
    this.activeItemForReconciliation.set(item);
    this.manualReferenceInput.set(
      item.bankReference === '—'
        ? `TRF-000834${Math.floor(20 + Math.random() * 80)}`
        : item.bankReference,
    );
    this.manualAmountInput.set(item.statementAmount ?? item.registeredAmount);
    this.isReconcileModalOpen.set(true);
  }

  confirmReconciliation(): void {
    const item = this.activeItemForReconciliation();
    if (!item) return;

    const ref = this.manualReferenceInput().trim();
    const amount = Number(this.manualAmountInput()) || 0;
    const diff = Math.abs(item.registeredAmount - amount);

    const updated = this.records().map((r) => {
      if (r.id === item.id) {
        return {
          ...r,
          bankReference: ref,
          statementAmount: amount,
          difference: diff,
          status:
            diff === 0 ? ('Conciliada' as const) : ('Discrepancia' as const),
        };
      }
      return r;
    });

    this.saveRecords(updated);
    this.notificationService.success(
      `¡Movimiento ${item.invoiceNumber} conciliado con éxito contra el extracto!`,
    );
    this.isReconcileModalOpen.set(false);
  }

  openReviewDetail(item: BankReconciliationItem): void {
    this.activeItemForDetail.set(item);
    this.isDetailModalOpen.set(true);
  }

  // Importar Extracto Bancario
  openImportModal(): void {
    this.isImportModalOpen.set(true);
  }

  simulateImportExtract(): void {
    this.notificationService.success(
      `¡Extracto de ${this.selectedBankForImport()} procesado! 1 transferencia identificada y conciliada automáticamente.`,
    );
    this.isImportModalOpen.set(false);
  }

  exportToCsv(): void {
    const rows = this.filteredRecords().map((r) => ({
      Fecha: r.date,
      Referencia: r.bankReference,
      Factura: r.invoiceNumber,
      Cliente: r.customerName,
      Banco: r.destinationBank,
      MontoRegistrado: r.registeredAmount,
      MontoExtracto: r.statementAmount ?? '',
      Diferencia: r.difference ?? '',
      Estado: r.status,
    }));

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        'Fecha,Referencia,Factura,Cliente,Banco,Monto Registrado,Monto Extracto,Diferencia,Estado',
      ]
        .concat(
          rows.map(
            (r) =>
              `"${r.Fecha}","${r.Referencia}","${r.Factura}","${r.Cliente}","${r.Banco}",${r.MontoRegistrado},${r.MontoExtracto},${r.Diferencia},"${r.Estado}"`,
          ),
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `conciliacion_bancaria_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
