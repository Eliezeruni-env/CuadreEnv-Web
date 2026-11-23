import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import { RealtimeAlertService, type SecurityAlertEvent } from '../../cuadreEnv/services/realtime-alert.service';
import { CashRegisterService } from './cash-register.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'CRITICAL';

export interface FraudFlag {
  id: string;
  type: 'EXCESSIVE_CANCELLATIONS' | 'DRAWER_KICK_NO_SALE' | 'SUSPICIOUS_CONSECUTIVE_DISCOUNTS' | 'EXCESSIVE_CASH_DISCREPANCY';
  cashierName: string;
  cashierId?: number;
  cashRegisterName: string;
  timestamp: string;
  severity: RiskSeverity;
  title: string;
  description: string;
  metricValue: string;
  thresholdLimit: string;
  status: 'ACTIVE' | 'RESOLVED' | 'DISMISSED';
  supervisorNotes?: string;
}

export interface CashierIntegrityScore {
  cashierId: number;
  cashierName: string;
  totalSalesCount: number;
  cancelledSalesCount: number;
  cancellationRate: number; // Percentage
  noSaleDrawerKicksCount: number;
  consecutiveDiscountsCount: number;
  accumulatedDiscrepancyDop: number;
  riskStatus: 'TRUSTED' | 'MONITORED' | 'HIGH_RISK';
}

@Injectable({
  providedIn: 'root'
})
export class FraudGuardianService {
  private readonly api = inject(ApiClientService);
  private readonly realtimeAlerts = inject(RealtimeAlertService);
  private readonly cashRegisterService = inject(CashRegisterService);

  readonly flags = signal<FraudFlag[]>([]);
  readonly cashierScores = signal<CashierIntegrityScore[]>([]);
  readonly isLoading = signal<boolean>(false);

  // Umbrales de auditoría configurables
  readonly cancellationRateThreshold = 5.0; // % Máximo tolerable antes de bandera roja
  readonly maxDrawerKicksPerShift = 3; // Máximo de aperturas manuales permitidas sin venta
  readonly maxConsecutiveDiscounts = 2; // Máximo de descuentos seguidos aplicados sin supervisión
  readonly maxToleranceDiscrepancyDop = 150.0; // Descuadre acumulado de caja

  readonly activeFlags = computed(() => {
    return this.flags().filter(f => f.status === 'ACTIVE');
  });

  readonly criticalFlagsCount = computed(() => {
    return this.flags().filter(f => f.status === 'ACTIVE' && f.severity === 'CRITICAL').length;
  });

  readonly branchRiskScore = computed(() => {
    const active = this.activeFlags();
    if (active.length === 0) return 8; // Score muy seguro (bajo riesgo)
    let score = 15;
    for (const flag of active) {
      if (flag.severity === 'CRITICAL') score += 28;
      else if (flag.severity === 'MEDIUM') score += 14;
      else score += 5;
    }
    return Math.min(100, score);
  });

  readonly branchRiskLevel = computed<'BAJO' | 'MODERADO' | 'CRÍTICO'>(() => {
    const s = this.branchRiskScore();
    if (s >= 65) return 'CRÍTICO';
    if (s >= 35) return 'MODERADO';
    return 'BAJO';
  });

  constructor() {
    this.loadInitialForensicData();
    this.listenToRealtimeSecurityEvents();
  }

  /**
   * Carga o inicializa banderas forenses basadas en las auditorías de caja y facturación.
   */
  async loadInitialForensicData(): Promise<void> {
    this.isLoading.set(true);
    try {
      try {
        const resAlerts = await this.api.get<any, any>('/FraudGuardian/alerts');
        const alertData = Array.isArray(resAlerts) ? resAlerts : resAlerts?.data;
        if (Array.isArray(alertData)) {
          this.flags.set(alertData.map((a: any) => ({
            id: a.id,
            type: a.type || 'EXCESSIVE_CANCELLATIONS',
            cashierName: a.operator || 'Cajero',
            cashierId: a.cashierId || 104,
            cashRegisterName: a.registerTime || 'Caja Activa',
            timestamp: new Date().toISOString(),
            severity: (a.severityCode === 'critical' ? 'CRITICAL' : a.severityCode === 'low' ? 'LOW' : 'MEDIUM') as RiskSeverity,
            title: a.title,
            description: a.description,
            metricValue: a.observedMetric,
            thresholdLimit: a.thresholdLimit,
            status: a.status || 'ACTIVE',
            supervisorNotes: a.supervisorNotes
          })));
        } else {
          this.flags.set([]);
        }

        const resScores = await this.api.get<any, any>('/FraudGuardian/cashier-scores');
        const scoreData = Array.isArray(resScores) ? resScores : resScores?.data;
        if (Array.isArray(scoreData)) {
          this.cashierScores.set(scoreData.map((s: any) => ({
            cashierId: s.cashierId,
            cashierName: s.cashierName,
            totalSalesCount: s.totalSales,
            cancelledSalesCount: Math.round(s.totalSales * (s.cancellationRate / 100)),
            cancellationRate: s.cancellationRate,
            noSaleDrawerKicksCount: s.noSaleDrawers,
            consecutiveDiscountsCount: 0,
            accumulatedDiscrepancyDop: s.accumulatedDiscrepancyDop || 0,
            riskStatus: (s.status === 'Por revisar' ? 'MONITORED' : 'TRUSTED') as 'TRUSTED' | 'MONITORED' | 'HIGH_RISK'
          })));
        } else {
          this.cashierScores.set([]);
        }
      } catch (err) {
        this.flags.set([]);
        this.cashierScores.set([]);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Escucha eventos de auditoría en tiempo real para generar banderas forenses al instante.
   */
  private listenToRealtimeSecurityEvents(): void {
    this.realtimeAlerts.alerts$.subscribe((event: SecurityAlertEvent) => {
      if (event.type === 'DRAWER_OPENED_NO_SALE') {
        this.registerDrawerKickAnomaly(event);
      } else if (event.type === 'INVOICE_CANCEL_ATTEMPT') {
        this.registerCancellationAnomaly(event);
      }
    });
  }

  private registerDrawerKickAnomaly(event: SecurityAlertEvent): void {
    const newFlag: FraudFlag = {
      id: `FLAG-KICK-${Date.now()}`,
      type: 'DRAWER_KICK_NO_SALE',
      cashierName: event.cashierName || 'Cajero en turno',
      cashRegisterName: event.cashRegisterName || 'Caja Activa',
      timestamp: event.timestamp,
      severity: 'MEDIUM',
      title: 'Apertura de Gaveta Sin Venta Detectada',
      description: `El cajero abrió la gaveta manualmente sin transacción comercial asociada.`,
      metricValue: '+1 Apertura',
      thresholdLimit: 'Máx 3 por turno',
      status: 'ACTIVE'
    };
    this.flags.update(prev => [newFlag, ...prev]);
  }

  private registerCancellationAnomaly(event: SecurityAlertEvent): void {
    const newFlag: FraudFlag = {
      id: `FLAG-CANCEL-${Date.now()}`,
      type: 'EXCESSIVE_CANCELLATIONS',
      cashierName: event.cashierName || 'Cajero en turno',
      cashRegisterName: event.cashRegisterName || 'Caja Activa',
      timestamp: event.timestamp,
      severity: 'CRITICAL',
      title: `Intento de Anulación de Factura ${event.ncf ? '(' + event.ncf + ')' : ''}`,
      description: `Se solicitó la anulación de comprobante fiscal por monto RD$ ${event.amount?.toFixed(2) || '0.00'}. ${event.message}`,
      metricValue: 'Anulación iniciada',
      thresholdLimit: 'Requiere clave supervisor',
      status: 'ACTIVE'
    };
    this.flags.update(prev => [newFlag, ...prev]);
  }

  /**
   * Resuelve una bandera forense con justificación del supervisor.
   */
  resolveFlag(flagId: string, notes: string): void {
    this.flags.update(prev =>
      prev.map(f => f.id === flagId ? { ...f, status: 'RESOLVED', supervisorNotes: notes } : f)
    );
    this.api.post(`/FraudGuardian/alerts/${flagId}/resolve`, {
      reviewResult: 'Justificada',
      supervisorNotes: notes,
      evidenceAttached: false
    }).catch(() => {});
  }

  /**
   * Descarta una bandera como falso positivo justificado.
   */
  dismissFlag(flagId: string, reason: string): void {
    this.flags.update(prev =>
      prev.map(f => f.id === flagId ? { ...f, status: 'DISMISSED', supervisorNotes: reason } : f)
    );
    this.api.post(`/FraudGuardian/alerts/${flagId}/dismiss`, { reason }).catch(() => {});
  }
}
