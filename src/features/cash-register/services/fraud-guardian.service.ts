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
      // Datos forenses iniciales simulados con base en historial de caja para alertar de inmediato
      const initialFlags: FraudFlag[] = [
        {
          id: 'FLAG-001',
          type: 'EXCESSIVE_CANCELLATIONS',
          cashierName: 'Pedro Ramírez',
          cashierId: 104,
          cashRegisterName: 'Caja 02 - Pasillo Central',
          timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
          severity: 'CRITICAL',
          title: 'Tasa de Anulación Excesiva (8.4%)',
          description: 'El cajero ha anulado 4 comprobantes fiscales de 48 facturados en el turno actual, superando el límite del 5%.',
          metricValue: '8.4%',
          thresholdLimit: '5.0%',
          status: 'ACTIVE'
        },
        {
          id: 'FLAG-002',
          type: 'DRAWER_KICK_NO_SALE',
          cashierName: 'María Santos',
          cashierId: 108,
          cashRegisterName: 'Caja 01 - Rápida',
          timestamp: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
          severity: 'MEDIUM',
          title: 'Aperturas de Gaveta Sin Venta (4 eventos)',
          description: 'Se registraron 4 comandos de apertura de gaveta (Drawer Kick) en un lapso de 30 minutos sin transacciones registradas.',
          metricValue: '4 aperturas',
          thresholdLimit: 'Máx 3 por turno',
          status: 'ACTIVE'
        },
        {
          id: 'FLAG-003',
          type: 'SUSPICIOUS_CONSECUTIVE_DISCOUNTS',
          cashierName: 'Carlos Santana',
          cashierId: 102,
          cashRegisterName: 'Caja 01 - Rápida',
          timestamp: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
          severity: 'MEDIUM',
          title: 'Descuentos Manuales Sucesivos (15%)',
          description: 'Se aplicaron 3 descuentos manuales consecutivos del 15% al mismo cliente sin código de autorización de supervisor.',
          metricValue: '3 ventas con -15%',
          thresholdLimit: 'Máx 2 consecutivas',
          status: 'ACTIVE'
        }
      ];

      const initialScores: CashierIntegrityScore[] = [
        {
          cashierId: 102,
          cashierName: 'Carlos Santana',
          totalSalesCount: 142,
          cancelledSalesCount: 2,
          cancellationRate: 1.4,
          noSaleDrawerKicksCount: 1,
          consecutiveDiscountsCount: 3,
          accumulatedDiscrepancyDop: -15.00,
          riskStatus: 'MONITORED'
        },
        {
          cashierId: 104,
          cashierName: 'Pedro Ramírez',
          totalSalesCount: 48,
          cancelledSalesCount: 4,
          cancellationRate: 8.33,
          noSaleDrawerKicksCount: 2,
          consecutiveDiscountsCount: 0,
          accumulatedDiscrepancyDop: -180.00,
          riskStatus: 'HIGH_RISK'
        },
        {
          cashierId: 108,
          cashierName: 'María Santos',
          totalSalesCount: 96,
          cancelledSalesCount: 1,
          cancellationRate: 1.04,
          noSaleDrawerKicksCount: 4,
          consecutiveDiscountsCount: 1,
          accumulatedDiscrepancyDop: 0.00,
          riskStatus: 'MONITORED'
        },
        {
          cashierId: 112,
          cashierName: 'Ana Gómez',
          totalSalesCount: 110,
          cancelledSalesCount: 0,
          cancellationRate: 0.0,
          noSaleDrawerKicksCount: 0,
          consecutiveDiscountsCount: 0,
          accumulatedDiscrepancyDop: +5.00,
          riskStatus: 'TRUSTED'
        }
      ];

      this.flags.set(initialFlags);
      this.cashierScores.set(initialScores);
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
  }

  /**
   * Descarta una bandera como falso positivo justificado.
   */
  dismissFlag(flagId: string, reason: string): void {
    this.flags.update(prev =>
      prev.map(f => f.id === flagId ? { ...f, status: 'DISMISSED', supervisorNotes: reason } : f)
    );
  }
}
