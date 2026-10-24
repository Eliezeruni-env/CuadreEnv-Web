import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FraudGuardianService, type FraudFlag, type CashierIntegrityScore } from '../../services/fraud-guardian.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { formatDateInRD, formatTimeInRD } from '../../../cuadreEnv/utils/rd-date.util';

@Component({
  selector: 'app-fraud-guardian-dashboard',
  templateUrl: './fraud-guardian-dashboard.component.html',
  styleUrls: ['./fraud-guardian-dashboard.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class FraudGuardianDashboardComponent {
  readonly fraudService = inject(FraudGuardianService);
  private readonly notificationService = inject(NotificationService);

  selectedFlag = signal<FraudFlag | null>(null);
  isJustifyModalOpen = signal<boolean>(false);
  supervisorNoteInput = signal<string>('');

  openJustifyModal(flag: FraudFlag): void {
    this.selectedFlag.set(flag);
    this.supervisorNoteInput.set('');
    this.isJustifyModalOpen.set(true);
  }

  closeJustifyModal(): void {
    this.isJustifyModalOpen.set(false);
    this.selectedFlag.set(null);
  }

  confirmResolve(action: 'RESOLVE' | 'DISMISS'): void {
    const flag = this.selectedFlag();
    const note = this.supervisorNoteInput().trim();
    if (!flag) return;

    if (!note) {
      this.notificationService.warning('Por favor ingrese la justificación o nota del supervisor.');
      return;
    }

    if (action === 'RESOLVE') {
      this.fraudService.resolveFlag(flag.id, note);
      this.notificationService.success(`Bandera ${flag.id} resuelta con nota de auditoría.`);
    } else {
      this.fraudService.dismissFlag(flag.id, note);
      this.notificationService.info(`Bandera ${flag.id} descartada.`);
    }

    this.closeJustifyModal();
  }

  exportForensicReport(): void {
    const flags = this.fraudService.flags();
    const scores = this.fraudService.cashierScores();
    const dateStr = formatDateInRD(new Date(), { dateStyle: 'full' });

    let report = `========================================================================\r\n`;
    report += `CUADRE-ENV POS - INFORME FORENSE & PREVENCIÓN DE PÉRDIDAS (EL GUARDIÁN)\r\n`;
    report += `Fecha de Emisión: ${dateStr}\r\n`;
    report += `Nivel de Riesgo Global de Sucursal: ${this.fraudService.branchRiskLevel()} (${this.fraudService.branchRiskScore()}/100)\r\n`;
    report += `========================================================================\r\n\r\n`;

    report += `1. BANDERAS DE RIESGO FORENSE ACTIVAS (${this.fraudService.activeFlags().length}):\r\n`;
    for (const f of this.fraudService.activeFlags()) {
      report += ` - [${f.severity}] ${f.title}\r\n`;
      report += `   Cajero: ${f.cashierName} | Caja: ${f.cashRegisterName}\r\n`;
      report += `   Hora: ${formatTimeInRD(f.timestamp)} | Métrica: ${f.metricValue} (Límite: ${f.thresholdLimit})\r\n`;
      report += `   Detalle: ${f.description}\r\n\r\n`;
    }

    report += `2. EVALUACIÓN DE INTEGRIDAD POR CAJERO:\r\n`;
    for (const c of scores) {
      report += ` • ${c.cashierName} (ID: ${c.cashierId}) -> Estado: [${c.riskStatus}]\r\n`;
      report += `   Ventas: ${c.totalSalesCount} | Anulaciones: ${c.cancelledSalesCount} (${c.cancellationRate}%)\r\n`;
      report += `   Gavetas sin Venta: ${c.noSaleDrawerKicksCount} | Descuadre Acumulado: RD$ ${c.accumulatedDiscrepancyDop.toFixed(2)}\r\n\r\n`;
    }

    report += `========================================================================\r\n`;
    report += `Fin de Informe Forense. Generado automáticamente por CuadreEnv Guardián.\r\n`;

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Forense_Guardian_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    this.notificationService.success('Informe forense exportado correctamente.');
  }
}
