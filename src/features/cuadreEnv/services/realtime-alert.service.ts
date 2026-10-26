import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';
import { getAccessToken } from './apiClient';
import { environment } from '../../../environments/environment';

export interface SecurityAlertEvent {
  id: string;
  type: 'DRAWER_OPENED_NO_SALE' | 'INVOICE_CANCEL_ATTEMPT' | 'HIGH_CASH_DROP' | 'OUT_OF_TOLERANCE_CLOSE' | string;
  title: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  timestamp: string;
  cashRegisterName?: string;
  cashierName?: string;
  amount?: number;
  ncf?: string;
  isAcknowledged: boolean;
  data?: any;
}

export interface SignalRSecurityAlertPayload {
  eventCode: 'HIGH_CASH_DROP' | 'OUT_OF_TOLERANCE_CLOSE' | string;
  data: any;
  occurredAtUtc: string;
  companyId?: number;
}

const SECURITY_ALERTS_STORAGE_KEY = 'cuadreenv_security_alerts_log';
const DEFAULT_HIGH_CASH_THRESHOLD = 5000;

@Injectable({
  providedIn: 'root',
})
export class RealtimeAlertService {
  private readonly notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);

  readonly alerts$ = new Subject<SecurityAlertEvent>();
  private alertsSignal = signal<SecurityAlertEvent[]>(this.loadStoredAlerts());
  private channel: BroadcastChannel | null = null;
  private hubConnection: HubConnection | null = null;
  private isConnecting = false;

  readonly alerts = computed(() => this.alertsSignal());
  readonly unacknowledgedAlerts = computed(() =>
    this.alertsSignal().filter((a) => !a.isAcknowledged),
  );
  readonly unacknowledgedCount = computed(() => this.unacknowledgedAlerts().length);

  constructor() {
    this.initRealtimeBroadcast();
    effect(() => {
      const isAuth = this.authService.isAuthenticated();
      if (isAuth) {
        this.initSignalRConnection();
      } else {
        void this.disconnectSignalR();
      }
    });
  }

  /**
   * Conecta al hub /hubs/security-alerts si el usuario está autenticado con JWT válido.
   * No bloquea la conexión desde el frontend por una lista local de roles.
   */
  initSignalRConnection(): void {
    if (typeof window === 'undefined') return;

    const isAuth = this.authService.isAuthenticated();
    const token = getAccessToken();

    if (!isAuth || !token) {
      void this.disconnectSignalR();
      return;
    }

    if (
      this.isConnecting ||
      (this.hubConnection &&
        (this.hubConnection.state === HubConnectionState.Connected ||
          this.hubConnection.state === HubConnectionState.Connecting ||
          this.hubConnection.state === HubConnectionState.Reconnecting))
    ) {
      return;
    }

    void this.startSignalRConnection();
  }

  // Alias de compatibilidad
  initSignalRIfAuthorized(): void {
    this.initSignalRConnection();
  }

  private async startSignalRConnection(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (this.isConnecting) return;

    // Evitar crear múltiples conexiones si ya existe una activa o en progreso
    if (
      this.hubConnection &&
      (this.hubConnection.state === HubConnectionState.Connected ||
        this.hubConnection.state === HubConnectionState.Connecting ||
        this.hubConnection.state === HubConnectionState.Reconnecting)
    ) {
      return;
    }

    this.isConnecting = true;

    // Detener la conexión anterior antes de crear una nueva
    if (this.hubConnection) {
      const oldConn = this.hubConnection;
      this.hubConnection = null;
      try {
        await oldConn.stop();
      } catch {
        // ignore stop error
      }
    }

    const hubUrl = `${environment.API_BASE_URL.replace(/\/$/, '')}/hubs/security-alerts`;

    try {
      const connection = new HubConnectionBuilder()
        .withUrl(hubUrl, {
          accessTokenFactory: () => getAccessToken() || '',
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(LogLevel.Warning)
        .build();

      // Escuchar el evento de seguridad oficial
      connection.on('securityAlert', (payload: SignalRSecurityAlertPayload) => {
        this.handleSignalRAlert(payload);
      });

      connection.onreconnecting(() => {
        console.warn('[SignalR SecurityAlerts] Reconectando al hub...');
      });

      connection.onreconnected(() => {
        console.info('[SignalR SecurityAlerts] Conexión restablecida.');
      });

      connection.onclose(() => {
        if (this.hubConnection === connection) {
          this.hubConnection = null;
        }
      });

      await connection.start();
      this.hubConnection = connection;
      console.info('[SignalR SecurityAlerts] Conectado exitosamente al hub de seguridad.');
    } catch (err) {
      console.warn('[SignalR SecurityAlerts] No se pudo conectar al hub (continuando en modo resiliencia local):', err);
      this.hubConnection = null;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnectSignalR(): Promise<void> {
    if (this.hubConnection) {
      const conn = this.hubConnection;
      this.hubConnection = null;
      try {
        await conn.stop();
      } catch {
        // ignore stop error
      }
    }
    this.isConnecting = false;
  }

  private handleSignalRAlert(payload: SignalRSecurityAlertPayload): void {
    // Filtrar por compañía: ignorar alertas de otros tenants
    const userCompanyId = this.authService.companyId();
    if (payload.companyId && userCompanyId && payload.companyId !== userCompanyId) {
      return;
    }

    const eventCode = payload.eventCode;
    let title = '🚨 Alerta de Seguridad';
    let message = 'Se detectó un evento de seguridad en la estación de caja.';
    let severity: SecurityAlertEvent['severity'] = 'WARNING';

    if (eventCode === 'HIGH_CASH_DROP') {
      title = '💸 Retiro de Efectivo Significativo (High Drop)';
      message = `Salida de efectivo registrada: RD$ ${Number(payload.data?.amount || 0).toFixed(2)}. Supera el límite preventivo.`;
      severity = 'CRITICAL';
    } else if (eventCode === 'OUT_OF_TOLERANCE_CLOSE') {
      title = '⚠️ Cierre de Caja Fuera de Tolerancia';
      message = `Arqueo con discrepancia significativa: Esperado RD$ ${Number(payload.data?.expected || 0).toFixed(2)}, Contado RD$ ${Number(payload.data?.actual || 0).toFixed(2)}, Diferencia RD$ ${Number(payload.data?.diff || 0).toFixed(2)}.`;
      severity = 'CRITICAL';
    } else if (eventCode === 'DRAWER_OPENED_NO_SALE') {
      title = '🚨 Apertura de Gaveta Sin Venta';
      message = `Apertura manual no autorizada detectada en caja ${payload.data?.cashRegisterName || ''}.`;
      severity = 'CRITICAL';
    } else if (eventCode === 'INVOICE_CANCEL_ATTEMPT') {
      title = '⚠️ Intento de Anulación de Factura Fiscal';
      message = `Intento de anulación para factura ${payload.data?.invoiceNumber || ''} (NCF: ${payload.data?.ncf || ''}).`;
      severity = 'CRITICAL';
    }

    const alertEvent: SecurityAlertEvent = {
      id: `SIG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: eventCode,
      title,
      message,
      severity,
      timestamp: payload.occurredAtUtc || new Date().toISOString(),
      amount: payload.data?.amount,
      data: payload.data,
      isAcknowledged: false,
    };

    this.handleIncomingAlert(alertEvent);
  }

  private initRealtimeBroadcast(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('cuadreenv_security_realtime_hub');
        this.channel.onmessage = (event) => {
          if (event.data && event.data.type === 'SECURITY_ALERT') {
            this.handleIncomingAlert(event.data.payload, false);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not initialized:', e);
      }
    }
  }

  private loadStoredAlerts(): SecurityAlertEvent[] {
    try {
      const raw = localStorage.getItem(SECURITY_ALERTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveStoredAlerts(list: SecurityAlertEvent[]) {
    try {
      localStorage.setItem(SECURITY_ALERTS_STORAGE_KEY, JSON.stringify(list));
      this.alertsSignal.set(list);
    } catch {
      // ignore
    }
  }

  private handleIncomingAlert(alert: SecurityAlertEvent, broadcast = true) {
    const list = [alert, ...this.alertsSignal().slice(0, 49)];
    this.saveStoredAlerts(list);
    this.alerts$.next(alert);

    this.notificationService.show(
      alert.title,
      alert.message,
      alert.severity === 'CRITICAL' ? 'danger' : 'warning',
      12000,
      { isCritical: true },
    );

    if (broadcast && this.channel) {
      this.channel.postMessage({
        type: 'SECURITY_ALERT',
        payload: alert,
      });
    }
  }

  /**
   * 1. Apertura de gaveta sin venta asociada ("No Sale / Apertura Manual")
   */
  triggerDrawerOpenedNoSale(cashRegisterName = 'Caja Principal', cashierName = 'Cajero Turno') {
    const alert: SecurityAlertEvent = {
      id: `SEC-${Date.now()}-DRW`,
      type: 'DRAWER_OPENED_NO_SALE',
      title: '🚨 Apertura de Gaveta Sin Venta',
      message: `Se detectó una apertura manual de gaveta sin transacción asociada en "${cashRegisterName}" (Operador: ${cashierName}).`,
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      cashRegisterName,
      cashierName,
      isAcknowledged: false,
    };
    this.handleIncomingAlert(alert);
  }

  /**
   * 2. Intento o solicitud de anulación de factura con NCF
   */
  triggerInvoiceCancelAttempt(invoiceNumber: string, ncf: string, amount: number, cashierName = 'Cajero') {
    const alert: SecurityAlertEvent = {
      id: `SEC-${Date.now()}-CNL`,
      type: 'INVOICE_CANCEL_ATTEMPT',
      title: '⚠️ Intento de Anulación de Factura',
      message: `Intento de anulación para factura ${invoiceNumber} ${ncf ? `(NCF: ${ncf})` : ''} por valor de RD$ ${amount.toFixed(2)} (Solicitado por: ${cashierName}). Requiere aprobación de supervisor.`,
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      cashierName,
      ncf,
      amount,
      isAcknowledged: false,
    };
    this.handleIncomingAlert(alert);
  }

  /**
   * 3. Retiro manual de efectivo (Drop / Payout) mayor al umbral establecido
   */
  triggerHighCashDrop(amount: number, cashRegisterName = 'Caja Principal', reason = 'Retiro a Caja Fuerte', threshold = DEFAULT_HIGH_CASH_THRESHOLD) {
    if (amount < threshold) return;

    const alert: SecurityAlertEvent = {
      id: `SEC-${Date.now()}-DRP`,
      type: 'HIGH_CASH_DROP',
      title: '💸 Retiro de Efectivo Significativo (Drop)',
      message: `Se ha registrado una salida de efectivo de RD$ ${amount.toFixed(2)} en "${cashRegisterName}" (Motivo: "${reason}"). Supera el umbral de seguridad de RD$ ${threshold.toFixed(2)}.`,
      severity: 'WARNING',
      timestamp: new Date().toISOString(),
      cashRegisterName,
      amount,
      isAcknowledged: false,
    };
    this.handleIncomingAlert(alert);
  }

  /**
   * 4. Cierre fuera de tolerancia
   */
  triggerOutOfToleranceClose(expected: number, actual: number, diff: number, cashRegisterName = 'Caja Principal') {
    const alert: SecurityAlertEvent = {
      id: `SEC-${Date.now()}-OOT`,
      type: 'OUT_OF_TOLERANCE_CLOSE',
      title: '⚠️ Cierre de Caja Fuera de Tolerancia',
      message: `Arqueo en "${cashRegisterName}" con diferencia de RD$ ${diff.toFixed(2)} (Esperado: RD$ ${expected.toFixed(2)}, Físico: RD$ ${actual.toFixed(2)}).`,
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      cashRegisterName,
      amount: diff,
      isAcknowledged: false,
    };
    this.handleIncomingAlert(alert);
  }

  acknowledgeAlert(id: string) {
    const list = this.alertsSignal().map((a) =>
      a.id === id ? { ...a, isAcknowledged: true } : a,
    );
    this.saveStoredAlerts(list);
  }

  acknowledgeAll() {
    const list = this.alertsSignal().map((a) => ({ ...a, isAcknowledged: true }));
    this.saveStoredAlerts(list);
  }
}
