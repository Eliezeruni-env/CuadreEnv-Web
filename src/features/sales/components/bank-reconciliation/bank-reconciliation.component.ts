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

  records = signal<BankTransferRecord[]>([]);
  isLoading = signal<boolean>(false);

  // Filtros
  searchTerm = signal<string>('');
  selectedBank = signal<string>('ALL');
  selectedStatus = signal<string>('ALL');

  // Modal de Discrepancia
  isDiscrepancyModalOpen = signal<boolean>(false);
  activeRecordForDiscrepancy = signal<BankTransferRecord | null>(null);
  discrepancyReasonText = signal<string>('');

  // Bancos disponibles calculados dinámicamente
  readonly availableBanks = computed(() => {
    const set = new Set<string>();
    this.records().forEach((r) => {
      if (r.bankName) set.add(r.bankName);
    });
    return Array.from(set).sort();
  });

  // Métricas
  readonly totalTransferredAmount = computed(() => {
    return this.records().reduce((acc, r) => acc + r.amount, 0);
  });

  readonly verifiedAmount = computed(() => {
    return this.records()
      .filter((r) => r.status === 'VERIFIED')
      .reduce((acc, r) => acc + r.amount, 0);
  });

  readonly pendingAmount = computed(() => {
    return this.records()
      .filter((r) => r.status === 'PENDING')
      .reduce((acc, r) => acc + r.amount, 0);
  });

  readonly discrepantAmount = computed(() => {
    return this.records()
      .filter((r) => r.status === 'DISCREPANT')
      .reduce((acc, r) => acc + r.amount, 0);
  });

  readonly verifiedCount = computed(() => {
    return this.records().filter((r) => r.status === 'VERIFIED').length;
  });

  readonly pendingCount = computed(() => {
    return this.records().filter((r) => r.status === 'PENDING').length;
  });

  readonly discrepantCount = computed(() => {
    return this.records().filter((r) => r.status === 'DISCREPANT').length;
  });

  readonly filteredRecords = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const bank = this.selectedBank();
    const status = this.selectedStatus();

    return this.records().filter((r) => {
      if (bank !== 'ALL' && r.bankName !== bank) return false;
      if (status !== 'ALL' && r.status !== status) return false;

      if (!q) return true;
      return (
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.confirmationNumber.toLowerCase().includes(q) ||
        (r.accountLastFour || '').includes(q) ||
        r.bankName.toLowerCase().includes(q)
      );
    });
  });

  ngOnInit(): void {
    void this.loadRecords();
  }

  async loadRecords(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.reconciliationService.getTransferRecords();
      this.records.set(data);
    } catch (e) {
      console.error('Error cargando transferencias para conciliación:', e);
      this.notificationService.error(
        'No se pudieron cargar los registros de transferencias.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  markAsVerified(record: BankTransferRecord): void {
    const user = this.authService.currentUser() as any;
    const supervisor = user?.name || user?.fullName || 'Supervisor / Admin';
    this.reconciliationService.saveAuditState(
      record.id,
      'VERIFIED',
      supervisor,
    );

    // Actualizar localmente el registro
    this.records.update((list) =>
      list.map((r) => {
        if (r.id === record.id) {
          return {
            ...r,
            status: 'VERIFIED',
            verifiedBy: supervisor,
            verifiedAt: new Date().toISOString(),
            discrepancyReason: undefined,
          };
        }
        return r;
      }),
    );

    this.notificationService.success(
      `Transferencia ${record.confirmationNumber} verificada y conciliada.`,
    );
  }

  openDiscrepancyModal(record: BankTransferRecord): void {
    this.activeRecordForDiscrepancy.set(record);
    this.discrepancyReasonText.set(record.discrepancyReason || '');
    this.isDiscrepancyModalOpen.set(true);
  }

  closeDiscrepancyModal(): void {
    this.isDiscrepancyModalOpen.set(false);
    this.activeRecordForDiscrepancy.set(null);
    this.discrepancyReasonText.set('');
  }

  confirmDiscrepancy(): void {
    const record = this.activeRecordForDiscrepancy();
    if (!record) return;

    const reason =
      this.discrepancyReasonText().trim() || 'No figura en extracto bancario';
    const user = this.authService.currentUser() as any;
    const supervisor = user?.name || user?.fullName || 'Supervisor / Auditor';
    this.reconciliationService.saveAuditState(
      record.id,
      'DISCREPANT',
      supervisor,
      reason,
    );

    this.records.update((list) =>
      list.map((r) => {
        if (r.id === record.id) {
          return {
            ...r,
            status: 'DISCREPANT',
            verifiedBy: supervisor,
            verifiedAt: new Date().toISOString(),
            discrepancyReason: reason,
          };
        }
        return r;
      }),
    );

    this.notificationService.warning(
      `Transferencia ${record.confirmationNumber} marcada con discrepancia.`,
    );
    this.closeDiscrepancyModal();
  }

  exportToCsv(): void {
    const list = this.filteredRecords();
    if (list.length === 0) {
      this.notificationService.info(
        'No hay registros para exportar con los filtros actuales.',
      );
      return;
    }

    const headers = [
      'Factura',
      'Fecha',
      'Cliente',
      'Banco',
      'Ultimos 4 Digitos',
      'No. Confirmacion',
      'Monto (RD$)',
      'Estado',
      'Verificado Por',
      'Fecha Verificacion',
      'Motivo Discrepancia',
    ];
    const rows = list.map((r) => [
      `"${r.invoiceNumber}"`,
      `"${r.date}"`,
      `"${r.customerName.replace(/"/g, '""')}"`,
      `"${r.bankName}"`,
      `"${r.accountLastFour || ''}"`,
      `"${r.confirmationNumber}"`,
      r.amount.toFixed(2),
      `"${r.status}"`,
      `"${r.verifiedBy || ''}"`,
      `"${r.verifiedAt || ''}"`,
      `"${(r.discrepancyReason || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `conciliacion_bancaria_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.notificationService.success('Archivo CSV descargado correctamente.');
  }
}
