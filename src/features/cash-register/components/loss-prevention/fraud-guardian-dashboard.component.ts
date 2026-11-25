import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FraudGuardianService, type FraudFlag, type CashierIntegrityScore } from '../../services/fraud-guardian.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { formatDateInRD, formatTimeInRD } from '../../../cuadreEnv/utils/rd-date.util';

export interface AuditAlertItem {
  id: string;
  title: string;
  description: string;
  operator: string;
  registerTime: string;
  observedMetric: string;
  thresholdLimit: string;
  severity: 'Crítica' | 'Moderada' | 'Baja';
  severityCode: 'critical' | 'moderate' | 'low';
  observationRatio?: string;
}

export interface CashierAuditItem {
  cashierName: string;
  totalSales: number;
  cancellationRate: number;
  noSaleDrawers: number;
  status: 'Por revisar' | 'Sin alerta';
}

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

  activeTab = signal<'all' | 'critical' | 'moderate'>('all');
  selectedAlert = signal<AuditAlertItem | null>(null);
  isJustifyModalOpen = signal<boolean>(false);
  reviewResult = signal<string>('Justificada');
  supervisorNoteInput = signal<string>('');
  evidenceAttached = signal<boolean>(false);
  isCriteriaExpanded = signal<boolean>(false);

  // Dynamic table data connected to FraudGuardianService
  alerts = computed<AuditAlertItem[]>(() => {
    return this.fraudService.flags().filter(f => f.status === 'ACTIVE').map(f => ({
      id: f.id,
      title: f.title,
      description: f.description,
      operator: f.cashierName,
      registerTime: f.cashRegisterName,
      observedMetric: f.metricValue,
      thresholdLimit: f.thresholdLimit,
      severity: (f.severity === 'CRITICAL' ? 'Crítica' : f.severity === 'LOW' ? 'Baja' : 'Moderada') as any,
      severityCode: (f.severity === 'CRITICAL' ? 'critical' : f.severity === 'LOW' ? 'low' : 'moderate') as any,
      observationRatio: `${f.metricValue} · Umbral: ${f.thresholdLimit}`
    }));
  });

  cashiersActivity = computed<CashierAuditItem[]>(() => {
    return this.fraudService.cashierScores().map(c => ({
      cashierName: c.cashierName,
      totalSales: c.totalSalesCount,
      cancellationRate: c.cancellationRate,
      noSaleDrawers: c.noSaleDrawerKicksCount,
      status: c.riskStatus === 'MONITORED' || c.riskStatus === 'HIGH_RISK' ? 'Por revisar' : 'Sin alerta'
    }));
  });

  readonly criticalAlertsCount = computed(() => {
    return this.alerts().filter(a => a.severityCode === 'critical').length;
  });

  readonly moderateAlertsCount = computed(() => {
    return this.alerts().filter(a => a.severityCode === 'moderate').length;
  });

  readonly anulacionesCashiersCount = computed(() => {
    return this.fraudService.cashierScores().filter(c => c.cancellationRate > 5).length;
  });

  readonly totalNoSaleDrawers = computed(() => {
    return this.fraudService.cashierScores().reduce((sum, c) => sum + (c.noSaleDrawerKicksCount || 0), 0);
  });

  readonly totalDiscrepancy = computed(() => {
    return this.fraudService.cashierScores().reduce((sum, c) => sum + (c.accumulatedDiscrepancyDop || 0), 0);
  });

  readonly filteredAlerts = computed(() => {
    const tab = this.activeTab();
    if (tab === 'critical') return this.alerts().filter(a => a.severityCode === 'critical');
    if (tab === 'moderate') return this.alerts().filter(a => a.severityCode === 'moderate');
    return this.alerts();
  });

  openReviewModal(alert: AuditAlertItem): void {
    this.selectedAlert.set(alert);
    this.reviewResult.set('Justificada');
    this.supervisorNoteInput.set('');
    this.evidenceAttached.set(false);
    this.isJustifyModalOpen.set(true);
  }

  closeReviewModal(): void {
    this.isJustifyModalOpen.set(false);
    this.selectedAlert.set(null);
  }

  attachEvidence(): void {
    this.evidenceAttached.set(true);
    this.notificationService.info('Archivo de evidencia adjuntado correctamente.');
  }

  saveAndResolve(): void {
    const alert = this.selectedAlert();
    const note = this.supervisorNoteInput().trim();
    if (!alert) return;

    if (!note) {
      this.notificationService.warning('Por favor documenta la justificación del supervisor.');
      return;
    }

    this.fraudService.resolveFlag(alert.id, note);
    this.notificationService.success(`Incidencia "${alert.title}" resuelta con resultado: ${this.reviewResult()}.`);
    this.closeReviewModal();
  }

  exportForensicReport(): void {
    const dateStr = formatDateInRD(new Date(), { dateStyle: 'full' });
    let report = `========================================================================\r\n`;
    report += `CUADRE-ENV POS - GUARDIÁN ANTIRROBO (AUDITORÍA FORENSE)\r\n`;
    report += `Fecha de Emisión: ${dateStr}\r\n`;
    report += `Nivel de Riesgo Global: Riesgo ${this.fraudService.branchRiskLevel()} · ${this.fraudService.branchRiskScore()}/100\r\n`;
    report += `Alertas activas: ${this.alerts().length} | Aperturas sin venta: ${this.totalNoSaleDrawers()} eventos | Diferencia: RD$ ${this.totalDiscrepancy().toFixed(2)}\r\n`;
    report += `========================================================================\r\n\r\n`;

    report += `1. ALERTAS POR REVISAR:\r\n`;
    for (const a of this.alerts()) {
      report += ` - [${a.severity}] ${a.title}\r\n`;
      report += `   Operador: ${a.operator} | ${a.registerTime.replace('\n', ' ')}\r\n`;
      report += `   Métrica observada: ${a.observedMetric} (Límite: ${a.thresholdLimit})\r\n`;
      report += `   Detalle: ${a.description}\r\n\r\n`;
    }

    report += `2. ACTIVIDAD POR CAJERO:\r\n`;
    for (const c of this.cashiersActivity()) {
      report += ` • ${c.cashierName}: Ventas: ${c.totalSales} | Anulaciones: ${c.cancellationRate}% | Gavetas: ${c.noSaleDrawers} | Estado: [${c.status}]\r\n`;
    }

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Guardian_Antirrobo_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    this.notificationService.success('Informe exportado correctamente.');
  }
}
