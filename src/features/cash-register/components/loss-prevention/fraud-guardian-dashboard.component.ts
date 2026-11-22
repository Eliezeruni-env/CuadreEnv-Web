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

  // Initial table data matching Image 2
  alerts = signal<AuditAlertItem[]>([
    {
      id: 'ALT-101',
      title: 'Tasa de anulación excesiva',
      description: 'Tasa de anulaciones por encima del límite definido.',
      operator: 'Cajero #104',
      registerTime: 'Caja 02\n08:16',
      observedMetric: '8.4%',
      thresholdLimit: '≤ 5.0%',
      severity: 'Crítica',
      severityCode: 'critical',
      observationRatio: '4 de 48 (8.3%) · Umbral: 5%'
    },
    {
      id: 'ALT-102',
      title: 'Aperturas de gaveta sin venta',
      description: 'Registro de aperturas de gaveta sin transacciones asociadas.',
      operator: 'Cajero #108',
      registerTime: 'Caja 01\n07:23',
      observedMetric: '4 aperturas',
      thresholdLimit: '≤ 3 por turno',
      severity: 'Moderada',
      severityCode: 'moderate',
      observationRatio: '4 aperturas en 30 min · Umbral: 3 por turno'
    },
    {
      id: 'ALT-103',
      title: 'Descuentos manuales sucesivos',
      description: 'Descuentos manuales por encima del porcentaje permitido.',
      operator: 'Cajero #102',
      registerTime: 'Caja 01\n05:58',
      observedMetric: '3 ventas con -15%',
      thresholdLimit: '≤ 2 consecutivas',
      severity: 'Moderada',
      severityCode: 'moderate',
      observationRatio: '3 ventas consecutivas · Umbral: ≤ 2'
    }
  ]);

  cashiersActivity = signal<CashierAuditItem[]>([
    { cashierName: 'Cajero #102', totalSales: 142, cancellationRate: 1.4, noSaleDrawers: 1, status: 'Por revisar' },
    { cashierName: 'Cajero #104', totalSales: 48, cancellationRate: 8.3, noSaleDrawers: 2, status: 'Por revisar' },
    { cashierName: 'Cajero #108', totalSales: 96, cancellationRate: 1.0, noSaleDrawers: 4, status: 'Por revisar' },
    { cashierName: 'Cajero #112', totalSales: 110, cancellationRate: 0.0, noSaleDrawers: 0, status: 'Sin alerta' }
  ]);

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

    this.alerts.update(list => list.filter(a => a.id !== alert.id));
    this.notificationService.success(`Incidencia "${alert.title}" resuelta con resultado: ${this.reviewResult()}.`);
    this.closeReviewModal();
  }

  exportForensicReport(): void {
    const dateStr = formatDateInRD(new Date(), { dateStyle: 'full' });
    let report = `========================================================================\r\n`;
    report += `CUADRE-ENV POS - GUARDIÁN ANTIRROBO (AUDITORÍA FORENSE)\r\n`;
    report += `Fecha de Emisión: ${dateStr}\r\n`;
    report += `Nivel de Riesgo Global: Riesgo crítico · 71/100\r\n`;
    report += `Alertas activas: ${this.alerts().length} | Aperturas sin venta: 7 eventos | Diferencia: RD$ -190.00\r\n`;
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
