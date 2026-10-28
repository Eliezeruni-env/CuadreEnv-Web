import { Injectable, inject, Optional, Inject } from '@angular/core';
import { ApiClientService, extractArray, getCompanyId } from '../../cuadreEnv/services/apiClient';
import {
  CashRegisterDto,
  CashMovementDto,
  ApiResponse,
  SaleOriginChannel,
} from '../../cuadreEnv/types/api';
import { logger } from '../../cuadreEnv/services/logger.service';
import { RealtimeAlertService } from '../../cuadreEnv/services/realtime-alert.service';
import { formatDateTimeInRD, formatTimeInRD } from '../../cuadreEnv/utils/rd-date.util';

export interface CashRegisterSessionDto {
  id: number;
  cashRegisterId?: number;
  sessionId?: number;
  name: string;
  cashierName: string;
  cashierId?: number | null;
  openedAt: string;
  initialAmount: number;
  currentBalance: number;
  totalIn: number;
  totalOut: number;
  isOpen: boolean;
  status: 'OPEN' | 'PAUSED' | 'CLOSED';
  pauseReason?: string | null;
  pauseNotes?: string | null;
  pausedAt?: string | null;
  closedAt?: string | null;
  closingAmount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  closingNotes?: string | null;
}

export interface CashRegisterMovementItem {
  id: number;
  date: string;
  rawDate: string;
  type: 'Saldo inicial' | 'Entrada' | 'Salida';
  category: 'Apertura' | 'Ventas' | 'Cobros' | 'Ingresos' | 'Compras' | 'Gastos' | 'Retiro' | 'Ajuste';
  description: string;
  inAmount: number | null;
  outAmount: number | null;
  balance: number;
  paymentMethod?: string;
  reference?: string | null;
  saleId?: number | null;
}

const ACTIVE_SESSION_STORAGE_KEY = 'app_active_cash_register_session';
const CLOSED_REGISTERS_STORAGE_KEY = 'cuadreenv_closed_cash_registers';

function getClosedRegisterIds(): number[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CLOSED_REGISTERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markRegisterAsClosed(id: number) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const closed = getClosedRegisterIds();
    if (!closed.includes(id)) {
      closed.push(id);
      window.localStorage.setItem(CLOSED_REGISTERS_STORAGE_KEY, JSON.stringify(closed));
    }
  } catch {
    // ignore
  }
}

function unmarkRegisterAsClosed(id: number) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const closed = getClosedRegisterIds().filter((cId) => cId !== id);
    window.localStorage.setItem(CLOSED_REGISTERS_STORAGE_KEY, JSON.stringify(closed));
  } catch {
    // ignore
  }
}

@Injectable({
  providedIn: 'root',
})
export class CashRegisterService {
  private api: ApiClientService;
  private realtimeAlertService?: RealtimeAlertService;

  constructor(
    @Optional() @Inject(ApiClientService) api?: ApiClientService,
    @Optional() @Inject(RealtimeAlertService) realtimeAlertService?: RealtimeAlertService
  ) {
    if (api) {
      this.api = api;
    } else {
      try {
        this.api = inject(ApiClientService);
      } catch {
        this.api = null as any;
      }
    }

    if (realtimeAlertService !== undefined) {
      this.realtimeAlertService = realtimeAlertService;
    } else {
      try {
        this.realtimeAlertService = inject(RealtimeAlertService, { optional: true }) ?? undefined;
      } catch {
        this.realtimeAlertService = undefined;
      }
    }
  }

  // Helper to read stored session
  private getStoredSession(): CashRegisterSessionDto | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw =
          window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) ||
          window.localStorage.getItem('cuadreenv_active_cash_register_session') ||
          window.localStorage.getItem('cuadre_active_cash_register_session');
        if (raw) return JSON.parse(raw);
      } catch {
        // ignore JSON parse error
      }
    }
    return null;
  }

  // Active Session & Lifecycle directly against DB
  async getActiveSession(): Promise<ApiResponse<CashRegisterSessionDto | null>> {
    const stored = this.getStoredSession();
    const closedIds = getClosedRegisterIds();

    // 1. Probar ruta canónica GET /v1/cash-sessions/active-session
    try {
      const canonicalRes = await this.api.get<any, any>('/cash-sessions/active-session');
      const data = canonicalRes?.data || canonicalRes;
      
      const isExplicitlyClosed = data && (
        data.isClosed === true ||
        data.status === 'Closed' ||
        data.status === 'CLOSED' ||
        data.status === 2 ||
        (data.closedAt && !data.isOpen)
      );

      const isOpen = data && !isExplicitlyClosed && (
        data.isClosed === false ||
        data.isOpen === true ||
        data.status === 1 ||
        data.status === 0 ||
        data.status === 'Open' ||
        data.status === 'OPEN' ||
        data.status === 'Active' ||
        data.status === 'ACTIVE' ||
        (!data.closedAt && data.closingAmount == null && data.id)
      );

      if (data && (data.id || data.cashRegisterId) && isOpen) {
        const regId = Number(data.cashRegisterId || data.id || 1);
        const sessId = Number(data.sessionId || data.id || regId);
        unmarkRegisterAsClosed(regId);
        const session: CashRegisterSessionDto = {
          id: regId,
          cashRegisterId: regId,
          sessionId: sessId,
          name: data.name || stored?.name || 'Caja Principal',
          cashierName: data.cashierName || stored?.cashierName || 'Cajero',
          cashierId: data.cashierUserId || data.cashierId || stored?.cashierId || null,
          openedAt: data.openedAt || data.creationDate || stored?.openedAt || formatDateTimeInRD(),
          initialAmount: data.openingAmount ?? data.initialAmount ?? (stored?.initialAmount || 0),
          currentBalance: data.currentBalance ?? data.declaredCash ?? (data.openingAmount || data.initialAmount || 0),
          totalIn: data.totalIn || 0,
          totalOut: data.totalOut || 0,
          isOpen: true,
          status: 'OPEN',
          pauseReason: data.pauseReason || null,
          pauseNotes: data.pauseNotes || null,
          pausedAt: data.pausedAt || null,
        };

        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
        }

        return { success: true, data: session };
      }
    } catch {
      // Continuar con fallback /CashRegister
    }

    // 2. Fallback a GET /CashRegister para detectar caja abierta en base de datos
    try {
      const regRes = await this.api.get<any, any>('/CashRegister');
      const list = extractArray<any>(regRes);
      const openReg = list.find((r) => 
        (r.isOpen === true || r.status === 0 || r.status === 'OPEN') &&
        r.status !== 2 &&
        r.status !== 'CLOSED' &&
        r.status !== 'Closed' &&
        !r.closedAt &&
        r.isClosed !== true &&
        !closedIds.includes(r.id)
      );

      if (openReg && openReg.id) {
        unmarkRegisterAsClosed(openReg.id);
        const regId = Number(openReg.id);
        const sessId = Number(openReg.activeSessionId || openReg.sessionId || openReg.id);
        const session: CashRegisterSessionDto = {
          id: regId,
          cashRegisterId: regId,
          sessionId: sessId,
          name: openReg.name || stored?.name || `Caja #${openReg.id}`,
          cashierName: openReg.cashierName || stored?.cashierName || 'Cajero',
          cashierId: openReg.cashierUserId || openReg.cashierId || stored?.cashierId || null,
          openedAt: openReg.openedAt || openReg.createdDate || stored?.openedAt || formatDateTimeInRD(),
          initialAmount: openReg.openingAmount ?? openReg.initialAmount ?? stored?.initialAmount ?? openReg.balance ?? 0,
          currentBalance: openReg.currentBalance ?? stored?.currentBalance ?? openReg.balance ?? (stored?.initialAmount || 0),
          totalIn: openReg.totalIn ?? stored?.totalIn ?? 0,
          totalOut: openReg.totalOut ?? stored?.totalOut ?? 0,
          isOpen: true,
          status: 'OPEN',
        };

        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
        }

        return { success: true, data: session };
      }
    } catch {
      // ignore
    }

    // Si hay una sesión activa guardada localmente y no ha sido cerrada explícitamente:
    if (stored && stored.isOpen && !closedIds.includes(stored.id)) {
      return { success: true, data: stored };
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      window.localStorage.removeItem('cuadreenv_active_cash_register_session');
      window.localStorage.removeItem('cuadre_active_cash_register_session');
    }
    return { success: true, data: null };
  }

  async openSession(params: {
    name?: string;
    initialAmount: number;
    cashierName?: string;
    cashierId?: number | null;
    notes?: string;
    cashRegisterId?: number;
  }): Promise<ApiResponse<CashRegisterSessionDto>> {
    const regName = params.name?.trim() || 'Caja Principal';
    const initialAmt = Number(params.initialAmount) || 0;

    let backendId = 1;
    // Resolve valid user ID
    let currentUserId = params.cashierId ?? null;
    if (!currentUserId && typeof window !== 'undefined') {
      try {
        const u = JSON.parse(localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || '{}');
        if (u?.id) currentUserId = Number(u.id);
      } catch {}
    }
    const resolvedUserId = currentUserId && currentUserId > 0 ? currentUserId : 1;
    const activeCompanyId = Number(getCompanyId()) || 0;

    try {
      const canonicalOpen = await this.api.post<any, any>(
        '/cash-sessions/open',
        {
          cashierUserId: resolvedUserId,
          openingAmount: initialAmt,
          initialAmount: initialAmt,
          balance: initialAmt,
          name: regName,
          openingDenominations: null,
          cashRegisterId: params.cashRegisterId || 10,
          ...(activeCompanyId > 0 ? { companyId: activeCompanyId } : {}),
        },
        { headers: { 'X-Silent-Error': 'true', 'X-Silent-500': 'true' } }
      );
      backendId = canonicalOpen?.data?.id || canonicalOpen?.id || 1;
    } catch (err: any) {
      const errMsg = String(err?.message || err?.error || err?.response?.data?.message || err || '');
      
      // Si el backend avisa que el cajero ya tiene una sesión abierta: recuperar sesión inmediatamente
      if (
        errMsg.toLowerCase().includes('already has an open session') ||
        errMsg.toLowerCase().includes('sesion abierta') ||
        errMsg.toLowerCase().includes('sesión abierta')
      ) {
        unmarkRegisterAsClosed(1);
        const existingActive = await this.getActiveSession();
        if (existingActive.success && existingActive.data) {
          return { success: true, data: existingActive.data };
        }

        // Construir sesión abierta recuperada
        const recoveredSession: CashRegisterSessionDto = {
          id: 1,
          name: regName,
          cashierName: params.cashierName || 'Cajero',
          cashierId: resolvedUserId,
          openedAt: formatDateTimeInRD(),
          initialAmount: initialAmt,
          currentBalance: initialAmt,
          totalIn: 0,
          totalOut: 0,
          isOpen: true,
          status: 'OPEN',
        };
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(recoveredSession));
        }
        return { success: true, data: recoveredSession };
      }

      try {
        const res = await this.api.post<any, any>(
          '/CashRegister/open',
          {
            name: regName,
            balance: initialAmt,
            openingAmount: initialAmt,
            initialAmount: initialAmt,
            cashierId: resolvedUserId,
            openedByUserId: resolvedUserId,
            cashierUserId: resolvedUserId,
            isOpen: true,
            status: 'OPEN',
            notes: params.notes || '',
            ...(activeCompanyId > 0 ? { companyId: activeCompanyId } : {}),
          },
          { headers: { 'X-Silent-Error': 'true', 'X-Silent-500': 'true' } }
        );
        backendId = res?.id || res?.data?.id || 1;
      } catch (secondErr: any) {
        const secErrMsg = String(secondErr?.message || secondErr?.error || secondErr?.response?.data?.message || secondErr || '');
        if (
          secErrMsg.toLowerCase().includes('already has an open session') ||
          secErrMsg.toLowerCase().includes('sesion abierta') ||
          secErrMsg.toLowerCase().includes('sesión abierta')
        ) {
          unmarkRegisterAsClosed(1);
          const existingActive = await this.getActiveSession();
          if (existingActive.success && existingActive.data) {
            return { success: true, data: existingActive.data };
          }
          backendId = 1;
        } else {
          // Si el servidor en Heroku devuelve 500/400 (ej. avería temporal de base de datos o endpoint no disponible),
          // aperturar la sesión en modo local/resiliente para que el POS y la caja no queden bloqueados.
          console.warn('[Caja Registradora] Falló endpoint remoto de apertura, operando en modo de caja local resiliente:', secErrMsg || errMsg);
          backendId = Date.now();
        }
      }
    }

    unmarkRegisterAsClosed(backendId);
    const now = new Date();
    const formattedDate = now.toLocaleString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const session: CashRegisterSessionDto = {
      id: backendId,
      name: regName,
      cashierName: params.cashierName || 'Cajero',
      cashierId: params.cashierId || null,
      openedAt: formattedDate,
      initialAmount: initialAmt,
      currentBalance: initialAmt,
      totalIn: 0,
      totalOut: 0,
      isOpen: true,
      status: 'OPEN',
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
    }

    logger.info(`Caja "${regName}" aperturada por ${params.cashierName || 'Cajero'}. Fondo Inicial: RD$ ${initialAmt}`, 'Caja Registradora', { cashierId: params.cashierId });

    return { success: true, data: session };
  }

  async pauseSession(reason: string, notes?: string): Promise<ApiResponse<CashRegisterSessionDto>> {
    const sessionRes = await this.getActiveSession();
    const session = sessionRes?.data;
    if (!session) {
      return { success: false, message: 'No hay una sesión de caja activa para pausar.' };
    }

    const now = formatTimeInRD();
    const updatedSession: CashRegisterSessionDto = {
      ...session,
      status: 'PAUSED',
      pauseReason: reason,
      pauseNotes: notes || null,
      pausedAt: now,
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
    }

    logger.info(`Caja "${session.name}" pausada. Motivo: ${reason}`, 'Caja Registradora', { notes });

    return { success: true, data: updatedSession };
  }

  async resumeSession(): Promise<ApiResponse<CashRegisterSessionDto>> {
    const sessionRes = await this.getActiveSession();
    const session = sessionRes?.data;
    if (!session) {
      return { success: false, message: 'No hay una sesión de caja para reanudar.' };
    }

    const updatedSession: CashRegisterSessionDto = {
      ...session,
      status: 'OPEN',
      pauseReason: null,
      pauseNotes: null,
      pausedAt: null,
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
    }

    logger.info(`Caja "${session.name}" reanudada tras pausa.`, 'Caja Registradora');

    return { success: true, data: updatedSession };
  }

  async closeSession(params: {
    closingAmount: number;
    declaredCards?: number;
    cardBatchNumber?: string;
    declaredTransfers?: number;
    transferVoucherCount?: number;
    retainedFloat?: number;
    cashToDeposit?: number;
    depositDestination?: string;
    notes?: string;
    denominations?: any;
    supervisorUserId?: number;
    supervisorPin?: string;
    cashRegisterId?: number;
    sessionId?: number;
    session?: CashRegisterSessionDto;
    force?: boolean;
    timeoutMs?: number;
  }): Promise<ApiResponse<{ expected: number; actual: number; diff: number; status: 'EXACT' | 'SHORTAGE' | 'SURPLUS'; isBalanced?: boolean; isOutOfTolerance?: boolean; requiresSupervisorAuth?: boolean }>> {
    const actual = Number(params.closingAmount) || 0;

    // Si se solicita forzar cierre de emergencia inmediato sin esperar red
    if (params.force) {
      const regId = params.cashRegisterId || params.session?.id || 1;
      this.forceCloseSessionLocal(regId);
      return {
        success: true,
        message: 'Cierre de emergencia completado localmente.',
        data: {
          expected: actual,
          actual,
          diff: 0,
          status: 'EXACT',
          isBalanced: true,
        },
      };
    }

    // 1. Obtener la sesión activa: usar params si ya viene en memoria para evitar latencia
    let session = params.session;
    if (!session) {
      session = this.getStoredSession() || undefined;
    }
    if (!session) {
      try {
        const sessionPromise = this.getActiveSession();
        const timeoutPromise = new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 3500)
        );
        const sessionRes = await Promise.race([sessionPromise, timeoutPromise]);
        session = sessionRes?.data || undefined;
      } catch {
        session = this.getStoredSession() || undefined;
      }
    }

    // Si aún no hay sesión pero tenemos cashRegisterId explícito, sintetizamos el contexto mínimo
    if (!session && (params.cashRegisterId || params.sessionId)) {
      const fallbackId = Number(params.cashRegisterId || params.sessionId);
      session = {
        id: fallbackId,
        cashRegisterId: fallbackId,
        sessionId: fallbackId,
        name: 'Caja Principal',
        cashierName: 'Cajero',
        currentBalance: actual,
        initialAmount: 0,
        isOpen: true,
        status: 'OPEN',
        openedAt: formatDateTimeInRD(),
        totalIn: 0,
        totalOut: 0,
      };
    }

    if (!session) {
      return { success: false, message: 'No hay una sesión de caja abierta actualmente.' };
    }

    const registerId = params.cashRegisterId || session.cashRegisterId || session.id;

    const breakdownStr = params.denominations
      ? (typeof params.denominations === 'string' ? params.denominations : JSON.stringify(params.denominations))
      : null;

    // Payload esperado por el backend .NET CashRegisterController: CloseCashRegisterRequest
    const backendClosePayload = {
      actualAmount: actual,
      closingAmount: actual,
      breakdownJson: breakdownStr,
      notes: params.notes || '',
      closingComment: params.notes || '',
      declaredCards: params.declaredCards || 0,
      cardBatchNumber: params.cardBatchNumber || '',
      declaredTransfers: params.declaredTransfers || 0,
      transferVoucherCount: params.transferVoucherCount || 0,
      retainedFloat: params.retainedFloat || 0,
      cashToDeposit: params.cashToDeposit || 0,
      depositDestination: params.depositDestination || '',
      supervisorPin: params.supervisorPin,
    };

    let apiRes: any = null;
    const timeoutMs = params.timeoutMs || 8000;

    // Solicitud POST /v1/CashRegister/{cashRegisterId}/close?closingAmount=...
    // Protegida con Promise.race para evitar que la interfaz se quede frisada ante cuelgues del backend
    try {
      const endpoint = `/CashRegister/${registerId}/close?closingAmount=${actual}`;
      const postPromise = this.api.post<any, any>(endpoint, backendClosePayload);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), timeoutMs)
      );
      apiRes = await Promise.race([postPromise, timeoutPromise]);
    } catch (err: any) {
      if (err?.message === 'TIMEOUT_EXCEEDED') {
        logger.warn(`El servidor tardó más de ${timeoutMs}ms en responder al cierre. Sincronizando estado local a cerrado para evitar bloqueo.`, 'Caja Registradora');
        this.forceCloseSessionLocal(registerId);
        return {
          success: true,
          message: 'Cierre registrado localmente (el servidor demoró en responder).',
          data: {
            expected: session.currentBalance ?? actual,
            actual,
            diff: 0,
            status: 'EXACT',
            isBalanced: true,
          },
        };
      }

      const statusCode = Number(err?.status || err?.response?.status || err?.statusCode || 0);
      const payload = err?.error || err?.response?.data || {};
      const errorCode = String(payload?.errorCode || payload?.code || err?.errorCode || '').trim().toUpperCase();
      const rawMsg = String(payload?.message || payload?.error || err?.message || '');

      const isPendingOperations =
        errorCode === 'OPEN_CASH_OPERATIONS' ||
        rawMsg.includes('OPEN_CASH_OPERATIONS') ||
        (rawMsg.toLowerCase().includes('venta') && (rawMsg.toLowerCase().includes('espera') || rawMsg.toLowerCase().includes('pendiente')));

      if (statusCode === 400 && isPendingOperations) {
        const userMsg = rawMsg || 'Existen ventas pendientes o en espera en el POS que deben completarse o anularse antes de realizar el cierre de caja.';
        return {
          success: false,
          code: 'OPEN_CASH_OPERATIONS',
          message: userMsg,
        } as any;
      }

      const isAlreadyClosed =
        errorCode === 'ALREADY_CLOSED' ||
        errorCode === 'CASH_REGISTER_ALREADY_CLOSED' ||
        rawMsg.toLowerCase().includes('already closed') ||
        rawMsg.toLowerCase().includes('ya se encuentra cerrada') ||
        rawMsg.toLowerCase().includes('ya está cerrada');

      if (isAlreadyClosed) {
        this.forceCloseSessionLocal(registerId);
        if (session.id && session.id !== registerId) {
          this.forceCloseSessionLocal(session.id);
        }
        logger.info(`Caja "${session.name}" ya se encontraba cerrada en el servidor. Estado local sincronizado a cerrada.`, 'Caja Registradora');
        return {
          success: true,
          message: 'La caja ya se encontraba cerrada.',
          data: {
            expected: session.currentBalance,
            actual,
            diff: 0,
            status: 'EXACT',
            isBalanced: true,
          },
        };
      }

      const errMsg = rawMsg || err?.mappedError?.message || 'Error al procesar el cierre de caja en el servidor.';
      logger.error(`Error al cerrar caja: ${errMsg}`, 'Caja Registradora', { error: err });
      return {
        success: false,
        code: errorCode || 'CLOSE_ERROR',
        message: errMsg,
      } as any;
    }

    const data = apiRes?.data || apiRes || {};
    const expected = data.expectedAmount ?? data.expected ?? session.currentBalance;
    const diff = data.difference ?? data.diff ?? (Math.round((actual - expected) * 100) / 100);
    const isBalanced = Math.abs(diff) < 0.01;
    const isOutOfTolerance = Math.abs(diff) > 50; // Umbral de tolerancia de caja RD$ 50

    let status: 'EXACT' | 'SHORTAGE' | 'SURPLUS' = data.status || 'EXACT';
    if (!data.status) {
      if (diff < -0.01) status = 'SHORTAGE';
      else if (diff > 0.01) status = 'SURPLUS';
      else status = 'EXACT';
    }

    markRegisterAsClosed(registerId);
    if (session.id && session.id !== registerId) {
      markRegisterAsClosed(session.id);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      window.localStorage.removeItem('cuadreenv_active_cash_register_session');
      window.localStorage.removeItem('cuadre_active_cash_register_session');

      try {
        const closedEntry = {
          id: registerId,
          name: session.name,
          cashierName: session.cashierName || 'Cajero',
          openedAt: session.openedAt,
          closedAt: formatDateTimeInRD(),
          initialAmount: session.initialAmount,
          expectedAmount: expected,
          closingAmount: actual,
          difference: diff,
          status,
          notes: params.notes,
          totalIn: session.totalIn || 0,
          totalOut: session.totalOut || 0,
        };
        const raw = window.localStorage.getItem('cuadreenv_closed_sessions_cache');
        const list = raw ? JSON.parse(raw) : [];
        const updated = [closedEntry, ...list.filter((x: any) => x.id !== session.id)].slice(0, 50);
        window.localStorage.setItem('cuadreenv_closed_sessions_cache', JSON.stringify(updated));
      } catch (cacheErr) {
        console.warn('Could not cache closed session:', cacheErr);
      }
    }

    logger.info(`Caja "${session.name}" cerrada exitosamente. Esperado: RD$ ${expected}, Físico: RD$ ${actual}, Diferencia: RD$ ${diff}`, 'Caja Registradora', { notes: params.notes });

    return {
      success: true,
      data: {
        expected,
        actual,
        diff,
        status,
        isBalanced,
        isOutOfTolerance,
        requiresSupervisorAuth: data.requiresSupervisorAuth || false,
      },
      message: 'Arqueo de caja procesado y sesión cerrada exitosamente.',
    };
  }

  /**
   * Cierra forzosamente la sesión a nivel local y limpia todas las llaves de almacenamiento.
   * Evita que la interfaz de usuario se quede congelada o bloqueada por sesiones corruptas o caídas de red.
   */
  forceCloseSessionLocal(registerId?: number): void {
    const id = registerId || 1;
    markRegisterAsClosed(id);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      window.localStorage.removeItem('cuadreenv_active_cash_register_session');
      window.localStorage.removeItem('cuadre_active_cash_register_session');
    }
  }

  async getMovements(): Promise<ApiResponse<CashRegisterMovementItem[]>> {
    const sessionRes = await this.getActiveSession();
    const session = sessionRes?.data;
    if (!session) {
      return { success: true, data: [] };
    }

    try {
      // Si la sesión fue abierta con un ID generado localmente (timestamp > 10,000,000,000) o no es una clave foránea en backend,
      // evitamos pasar cashRegisterId inválido al backend remoto para evitar errores 400 (Bad Request).
      const isLocalTimestampId = typeof session.id === 'number' && session.id > 10000000000;
      let list: any[] = [];

      if (!isLocalTimestampId) {
        try {
          const res = await this.api.get<any, any>('/CashMovement', {
            params: { cashRegisterId: session.id },
            headers: { 'X-Silent-Error': 'true', 'X-Silent-500': 'true' },
          });
          list = extractArray<any>(res);
        } catch {
          list = [];
        }
      }

      let runningBalance = session.initialAmount;
      const items: CashRegisterMovementItem[] = [];

      // Initial opening movement
      items.push({
        id: 0,
        date: session.openedAt,
        rawDate: new Date().toISOString(),
        type: 'Saldo inicial',
        category: 'Apertura',
        description: 'Apertura de caja - Fondo Inicial',
        inAmount: session.initialAmount,
        outAmount: null,
        balance: session.initialAmount,
        paymentMethod: 'Efectivo',
      });

      for (const m of list) {
        const amt = Number(m.amount) || 0;
        const typeUpper = (m.type != null ? String(m.type) : '').toUpperCase();
        const isIn =
          typeUpper === 'IN' ||
          typeUpper === 'ENTRADA' ||
          typeUpper === 'CASHIN' ||
          typeUpper === 'SALE' ||
          typeUpper === 'RECEIVABLEPAYMENT' ||
          typeUpper === '1' ||
          typeUpper === '3' ||
          typeUpper === '4';
        const desc = m.description || '';

        let category: CashRegisterMovementItem['category'] = 'Ingresos';
        if (typeUpper === 'SALE' || typeUpper === '3' || desc.toLowerCase().includes('venta')) category = 'Ventas';
        else if (typeUpper === 'RECEIVABLEPAYMENT' || typeUpper === '4' || desc.toLowerCase().includes('cobro')) category = 'Cobros';
        else if (desc.toLowerCase().includes('compra')) category = 'Compras';
        else if (desc.toLowerCase().includes('gasto')) category = 'Gastos';
        else if (desc.toLowerCase().includes('retiro') || typeUpper === 'CASHOUT' || typeUpper === '2') category = 'Retiro';
        else if (desc.toLowerCase().includes('ajuste')) category = 'Ajuste';
        else if (!isIn) category = 'Retiro';

        if (isIn) {
          runningBalance += amt;
        } else {
          runningBalance = Math.max(0, runningBalance - amt);
        }

        const dateStr = m.createdDate
          ? formatDateTimeInRD(m.createdDate)
          : formatDateTimeInRD();

        items.push({
          id: m.id,
          date: dateStr,
          rawDate: m.createdDate || new Date().toISOString(),
          type: isIn ? 'Entrada' : 'Salida',
          category,
          description: desc || (isIn ? 'Entrada de efectivo' : 'Salida de efectivo'),
          inAmount: isIn ? amt : null,
          outAmount: isIn ? null : amt,
          balance: runningBalance,
          paymentMethod: m.paymentMethod || 'Efectivo',
          reference: m.reference || null,
          saleId: m.saleId || null,
        });
      }

      return { success: true, data: items };
    } catch {
      return { success: true, data: [] };
    }
  }

  async addMovement(item: {
    type: 'Entrada' | 'Salida';
    category: 'Ventas' | 'Cobros' | 'Ingresos' | 'Compras' | 'Gastos' | 'Retiro' | 'Ajuste';
    description: string;
    amount: number;
    paymentMethod?: string;
    reference?: string | null;
  }): Promise<ApiResponse<CashRegisterMovementItem>> {
    const sessionRes = await this.getActiveSession();
    const session = sessionRes?.data;
    if (!session) {
      return { success: false, message: 'No hay una caja abierta para registrar movimientos.' };
    }

    const amt = Number(item.amount);
    if (amt <= 0) {
      return { success: false, message: 'El monto debe ser mayor a cero.' };
    }

    const typeEnum = item.type === 'Entrada' ? 1 : 2;
    let res: any = null;
    const isLocalTimestampId = typeof session.id === 'number' && session.id > 10000000000;
    try {
      res = await this.api.post<any, any>(
        '/CashMovement',
        {
          cashRegisterId: isLocalTimestampId ? 1 : session.id,
          cashSessionId: isLocalTimestampId ? 1 : session.id,
          amount: amt,
          type: typeEnum,
          reason: item.description || item.category,
          description: `${item.category}: ${item.description}`,
        },
        { headers: { 'X-Silent-Error': 'true', 'X-Silent-500': 'true' } }
      );
    } catch (postErr) {
      console.warn('[Caja] No se pudo persistir movimiento en backend remoto, operando localmente:', postErr);
    }

    // Auditoría de Seguridad en Tiempo Real (SignalR / BroadcastHub)
    if (item.type === 'Salida' && amt >= 5000) {
      this.realtimeAlertService?.triggerHighCashDrop(amt, session.name, item.description);
    } else if ((item.category as string) === 'Apertura' || (item.description || '').toLowerCase().includes('sin venta') || (item.description || '').toLowerCase().includes('gaveta')) {
      this.realtimeAlertService?.triggerDrawerOpenedNoSale(session.name, session.cashierName);
    }

    const movListRes = await this.getMovements();
    const lastItem = movListRes.data?.[movListRes.data.length - 1];

    return {
      success: true,
      data: lastItem || {
        id: res?.id || Date.now(),
        date: formatDateTimeInRD(),
        rawDate: new Date().toISOString(),
        type: item.type,
        category: item.category,
        description: item.description,
        inAmount: item.type === 'Entrada' ? amt : null,
        outAmount: item.type === 'Salida' ? amt : null,
        balance: session.currentBalance + (item.type === 'Entrada' ? amt : -amt),
        paymentMethod: item.paymentMethod || 'Efectivo',
      },
    };
  }

  async registerQuickSale(saleData: {
    customerId?: number | null;
    customerName?: string;
    items: {
      productId: number;
      productName: string;
      unitPrice: number;
      quantity: number;
      total: number;
    }[];
    subtotal: number;
    discount: number;
    itbis: number;
    total: number;
    paymentMethod: string;
    paymentReference?: string;
    amountReceived: number;
    change: number;
    idempotencyKey?: string;
    originChannel?: SaleOriginChannel;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    const sessionRes = await this.getActiveSession();
    const session = sessionRes?.data;
    if (!session) {
      return { success: false, message: 'Debes tener una caja abierta para registrar ventas.' };
    }

    const idempotencyKey =
      saleData.idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          }));

    let saleRes: any = null;
    try {
      // 1. Prioritize /caja/sales idempotent endpoint with X-Idempotency-Key header
      saleRes = await this.api.post<any, any>(
        '/caja/sales',
        {
          idempotencyKey,
          customerId: saleData.customerId || null,
          cashRegisterId: session.cashRegisterId || session.id,
          cashSessionId: session.sessionId || session.id,
          date: new Date().toISOString(),
          notes: saleData.notes || `Venta rápida POS - ${saleData.paymentMethod}`,
          originChannel: saleData.originChannel || 'POS_PRESENCIAL',
          paymentMethod: saleData.paymentMethod,
          paymentReference: saleData.paymentReference || saleData.paymentMethod,
          createBy: 'system',
          items: saleData.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
        },
        {
          headers: { 'X-Idempotency-Key': idempotencyKey },
        },
      );
    } catch (cajaErr: any) {
      try {
        // 2. Fallback to /Sale
        const pmUpper = (saleData.paymentMethod || '').toUpperCase();
        const methodEnum = pmUpper.includes('TRANSFER') ? 1 : (pmUpper.includes('TARJ') || pmUpper.includes('CARD') ? 2 : 0);

        saleRes = await this.api.post<any, any>(
          '/Sale',
          {
            customerId: saleData.customerId || null,
            total: saleData.total,
            paidAmount: saleData.total,
            cashRegisterId: session.cashRegisterId || session.id,
            cashSessionId: session.sessionId || session.id,
            originChannel: saleData.originChannel || 'POS_PRESENCIAL',
            notes: saleData.notes || `Venta rápida POS - ${saleData.paymentMethod}`,
            payment: {
              method: methodEnum,
              amountReceived: saleData.amountReceived,
              changeAmount: saleData.change,
              reference: saleData.paymentReference || saleData.paymentMethod
            },
            details: saleData.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
            })),
          },
          {
            headers: { 'X-Idempotency-Key': idempotencyKey },
          },
        );
      } catch (saleErr: any) {
        const errorMsg =
          saleErr?.response?.data?.message ||
          saleErr?.response?.data?.error ||
          cajaErr?.response?.data?.message ||
          saleErr?.message ||
          'Error del servidor al registrar la venta. La transacción ha sido cancelada.';
        if (
          errorMsg.toLowerCase().includes('must be open') ||
          errorMsg.toLowerCase().includes('caja cerrada') ||
          errorMsg.toLowerCase().includes('cash_register_not_open')
        ) {
          markRegisterAsClosed(session.cashRegisterId || session.id);
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
            window.localStorage.removeItem('cuadreenv_active_cash_register_session');
          }
        }
        logger.error(`Fallo al registrar venta en el backend: ${errorMsg}`, 'Venta POS', { saleErr, cajaErr });
        return {
          success: false,
          message: errorMsg,
        };
      }
    }

    // Note: The backend SaleService automatically creates the CashMovement record
    // transactionally when processing /Sale or /caja/sales. No secondary client-side call needed.

    const assignedId = saleRes?.id || saleRes?.data?.id || 0;

    // Save to local sales cache so SalesComponent (PC) also sees it immediately
    try {
      const localSale: any = {
        id: assignedId,
        customerId: saleData.customerId || null,
        total: saleData.total,
        paidAmount: saleData.amountReceived || saleData.total,
        cashRegisterId: session.id,
        originChannel: saleData.originChannel || 'POS_PRESENCIAL',
        isCancelled: false,
        creationDate: new Date().toISOString(),
        customerName: saleData.customerName || (saleData.customerId ? 'Cliente Registrado' : 'Consumidor Final'),
        paymentMethod: saleData.paymentMethod || 'Efectivo',
        details: saleData.items.map((it: any) => ({
          productId: it.productId,
          productName: it.productName || it.description || `Producto #${it.productId}`,
          productCode: it.productCode || it.barcode || `PROD-${it.productId}`,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total || (it.quantity * it.unitPrice),
        })),
      };
      const raw = localStorage.getItem('cuadreenv_local_sales_cache');
      const list = raw ? JSON.parse(raw) : [];
      if (!list.some((s: any) => s.id === localSale.id)) {
        list.unshift(localSale);
        localStorage.setItem('cuadreenv_local_sales_cache', JSON.stringify(list));
      }
      // Update session current balance in cache if cash sale
      if (
        saleData.paymentMethod.toUpperCase() === 'EFECTIVO' ||
        saleData.paymentMethod.toUpperCase() === 'CASH'
      ) {
        const storedSess = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        if (storedSess) {
          const sessObj = JSON.parse(storedSess);
          sessObj.currentBalance = (sessObj.currentBalance || sessObj.initialAmount || 0) + saleData.total;
          sessObj.totalIn = (sessObj.totalIn || 0) + saleData.total;
          localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(sessObj));
        }
      }
    } catch (_) {}

    return {
      success: true,
      data: {
        id: assignedId,
        invoiceNumber: `VTA-${String(assignedId).padStart(6, '0')}`,
        sale: saleRes,
      },
    };
  }

  async getSessionHistory(): Promise<ApiResponse<CashRegisterSessionDto[]>> {
    try {
      const res = await this.api.get<any, any>('/CashRegister');
      const list = extractArray<any>(res);
      const closedList = list.filter((r) => !r.isOpen && r.status !== 'OPEN');

      // Also read local cached closed sessions
      let localClosed: any[] = [];
      try {
        const stored = localStorage.getItem('cuadreenv_closed_sessions_cache');
        if (stored) localClosed = JSON.parse(stored);
      } catch {}

      const history: CashRegisterSessionDto[] = closedList.map((r: any) => {
        const localMatch = localClosed.find((lc) => lc.id === r.id);
        const opened = r.openedAt || r.creationDate || r.createdDate || localMatch?.openedAt;
        const closed = r.closedAt || r.modificationDate || r.updatedDate || localMatch?.closedAt;
        const initial = Number(r.initialAmount ?? r.openingAmount ?? localMatch?.initialAmount ?? 0);
        const closing = Number(r.closingAmount ?? r.physicalCountAmount ?? localMatch?.closingAmount ?? 0);
        const expected = Number(r.expectedAmount ?? localMatch?.expectedAmount ?? initial);
        const diff = Number(r.differenceAmount ?? localMatch?.difference ?? (closing - expected));

        return {
          id: r.id || 0,
          name: r.name || `Caja #${r.id || 0}`,
          cashierName: r.cashierName || localMatch?.cashierName || 'Administrador',
          cashierId: r.openedByUserId || null,
          openedAt: opened ? formatDateTimeInRD(opened) : (localMatch?.openedAt || 'N/A'),
          closedAt: closed ? formatDateTimeInRD(closed) : (localMatch?.closedAt || '-'),
          initialAmount: initial,
          currentBalance: closing,
          closingAmount: closing,
          expectedAmount: expected,
          difference: diff,
          totalIn: localMatch?.totalIn || 0,
          totalOut: localMatch?.totalOut || 0,
          isOpen: false,
          status: 'CLOSED',
          closingNotes: r.pauseReason || localMatch?.notes,
        };
      });

      // Sort descending by id so newest closed turnos appear first
      history.sort((a, b) => b.id - a.id);

      return { success: true, data: history };
    } catch {
      return { success: true, data: [] };
    }
  }

  async getSessionDetail(sessionId: number, basicSession?: CashRegisterSessionDto): Promise<any> {
    // 1. Fetch movements for this register
    let movements: any[] = [];
    const isLocalTimestampId = typeof sessionId === 'number' && sessionId > 10000000000;
    if (!isLocalTimestampId) {
      try {
        const movRes = await this.api.get<any, any>('/CashMovement', {
          params: { cashRegisterId: sessionId },
          headers: { 'X-Silent-Error': 'true', 'X-Silent-500': 'true' },
        });
        movements = extractArray<any>(movRes);
      } catch (e) {
        console.warn('Error fetching movements for session:', e);
      }
    }

    // 2. Fetch sales for this register
    let sales: any[] = [];
    try {
      const saleRes = await this.api.get<any, any>('/Sale');
      const allSales = extractArray<any>(saleRes);
      sales = allSales.filter((s: any) =>
        s.cashRegisterId === sessionId ||
        s.cashSessionId === sessionId
      );
    } catch (e) {
      console.warn('Error fetching sales for session:', e);
    }

    // Fallback: check local sales cache if backend filter returns 0
    if (sales.length === 0) {
      try {
        const local = localStorage.getItem('cuadreenv_local_sales');
        if (local) {
          const parsed = JSON.parse(local);
          sales = parsed.filter((s: any) => s.cashRegisterId === sessionId || s.cashSessionId === sessionId);
        }
      } catch {}
    }

    // Calculate totals
    let cashSales = 0;
    let cardSales = 0;
    let transferSales = 0;
    let totalSales = 0;

    sales.forEach((s) => {
      const amt = Number(s.total || s.paidAmount || 0);
      totalSales += amt;
      const pm = (s.paymentMethod || '').toUpperCase();
      if (pm.includes('EFECT') || pm.includes('CASH')) cashSales += amt;
      else if (pm.includes('TARJ') || pm.includes('CARD')) cardSales += amt;
      else if (pm.includes('TRANSF')) transferSales += amt;
      else cashSales += amt;
    });

    let cashIn = 0;
    let cashOut = 0;
    movements.forEach((m) => {
      const amt = Math.abs(Number(m.amount || 0));
      if (m.type === 1 || m.type === 'CashIn' || m.type === 4) cashIn += amt;
      else if (m.type === 2 || m.type === 'CashOut') cashOut += amt;
    });

    // Product breakdown
    const prodMap = new Map<string, { name: string; code: string; quantity: number; total: number }>();
    sales.forEach((s) => {
      const details = s.details || s.items || [];
      details.forEach((d: any) => {
        const name = d.productName || d.product?.name || `Producto #${d.productId}`;
        const code = d.productCode || d.product?.code || `#${d.productId}`;
        const qty = Number(d.quantity || 1);
        const tot = Number(d.total || (d.unitPrice * qty) || 0);

        if (prodMap.has(name)) {
          const cur = prodMap.get(name)!;
          cur.quantity += qty;
          cur.total += tot;
        } else {
          prodMap.set(name, { name, code, quantity: qty, total: tot });
        }
      });
    });

    const productSummary = Array.from(prodMap.values()).sort((a, b) => b.total - a.total);

    return {
      session: basicSession || {
        id: sessionId,
        name: `Caja #${sessionId}`,
        cashierName: 'Administrador',
        openedAt: 'N/A',
        closedAt: '-',
        initialAmount: 0,
        closingAmount: 0,
        difference: 0,
      },
      sales,
      movements,
      productSummary,
      totals: {
        cashSales,
        cardSales,
        transferSales,
        totalSales,
        cashIn,
        cashOut,
      },
    };
  }

  async getCashRegisters(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<CashRegisterDto[]>> {
    const validParams = {
      ...params,
      pageSize: params?.pageSize ? Math.min(100, Math.max(1, params.pageSize)) : 100,
    };
    try {
      const res = await this.api.get<any, any>('/CashRegister', { params: validParams });
      const list = extractArray<CashRegisterDto>(res);
      if (list.length > 0) return { success: true, data: list };
    } catch {
      // Fallback
    }
    try {
      const res2 = await this.api.get<any, any>('/cash-register', { params: validParams });
      return { success: true, data: extractArray<CashRegisterDto>(res2) };
    } catch {
      return { success: true, data: [] };
    }
  }

  async getCashRegister(id: number): Promise<ApiResponse<CashRegisterDto>> {
    const res = await this.api.get<any, any>(`/CashRegister/${id}`);
    return { success: true, data: res as CashRegisterDto };
  }

  async openCashRegister(name: string): Promise<ApiResponse<CashRegisterDto>> {
    const res = await this.api.post<any, any>('/CashRegister/open', { name });
    return { success: true, data: res as CashRegisterDto };
  }

  async closeCashRegister(id: number, closingAmount: number, notes?: string): Promise<void> {
    await this.closeSession({ closingAmount, notes });
  }

  async getCashMovements(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<CashMovementDto[]>> {
    const res = await this.api.get<any, any>('/CashMovement', { params });
    return { success: true, data: extractArray<CashMovementDto>(res) };
  }

  async createCashMovement(movement: CashMovementDto): Promise<void> {
    await this.api.post('/CashMovement', movement);
  }
}
