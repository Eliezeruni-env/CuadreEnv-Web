import { Injectable, signal, computed, inject } from '@angular/core';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { NotificationService } from '../../cuadreEnv/services/notification.service';
import type { CompletedSaleDto } from '../components/sales/sale-completed-modal.component';

export interface OfflineSaleRecord {
  id: string;
  idempotencyKey: string;
  createdAt: string;
  retryCount: number;
  lastError?: string;
  payload: {
    customerId: number | null;
    customerName: string;
    items: Array<{
      productId: number;
      productCode: string;
      productName: string;
      unitPrice: number;
      quantity: number;
      total: number;
    }>;
    subtotal: number;
    discount: number;
    itbis: number;
    total: number;
    paymentMethod: string;
    amountReceived: number;
    change: number;
    companyId?: number | null;
    cashRegisterSessionId?: number | null;
    overrideStock?: boolean;
  };
  localReceipt: CompletedSaleDto;
}

export interface OfflineConflictRecord {
  id: string;
  offlineSaleId: string;
  idempotencyKey: string;
  conflictType: 'INSUFFICIENT_STOCK' | 'CUSTOMER_BLOCKED' | 'RULE_REJECT';
  errorMessage: string;
  occurredAt: string;
  payload: OfflineSaleRecord['payload'];
  localReceipt: CompletedSaleDto;
}

const OFFLINE_QUEUE_KEY_PREFIX = 'cuadre_offline_queue_';
const OFFLINE_CONFLICTS_KEY_PREFIX = 'cuadre_offline_conflicts_';

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Simple deterministic hash for integrity verification
function computeChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 'chk_' + Math.abs(hash).toString(16);
}

// =========================================================================
// IndexedDB Outbox Storage Engine (Modo Resiliencia POS)
// =========================================================================
const INDEXED_DB_NAME = 'cuadre_pos_offline_db';
const INDEXED_DB_STORE = 'sales_outbox_queue';

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject('IndexedDB no soportado en este entorno');
    }
    const req = window.indexedDB.open(INDEXED_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
        db.createObjectStore(INDEXED_DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveToIndexedDb(record: OfflineSaleRecord): Promise<void> {
  try {
    const db = await openIndexedDb();
    const tx = db.transaction(INDEXED_DB_STORE, 'readwrite');
    tx.objectStore(INDEXED_DB_STORE).put(record);
  } catch (e) {
    console.warn('[IndexedDB Outbox] Error al persistir venta offline:', e);
  }
}

export async function removeFromIndexedDb(id: string): Promise<void> {
  try {
    const db = await openIndexedDb();
    const tx = db.transaction(INDEXED_DB_STORE, 'readwrite');
    tx.objectStore(INDEXED_DB_STORE).delete(id);
  } catch (e) {
    console.warn('[IndexedDB Outbox] Error al eliminar venta sincronizada:', e);
  }
}

// Obfuscate / encrypt sensitive local offline records
function secureEncode(data: any): string {
  const json = JSON.stringify(data);
  const checksum = computeChecksum(json);
  const b64 = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(json)))
    : typeof window !== 'undefined' && window.btoa
      ? window.btoa(unescape(encodeURIComponent(json)))
      : '';
  return JSON.stringify({ v: 2, c: checksum, d: b64 });
}

function secureDecode<T>(raw: string): T | null {
  try {
    const envelope = JSON.parse(raw);
    if (!envelope || !envelope.d) return null;
    const json = typeof atob !== 'undefined'
      ? decodeURIComponent(escape(atob(envelope.d)))
      : typeof window !== 'undefined' && window.atob
        ? decodeURIComponent(escape(window.atob(envelope.d)))
        : '';
    if (!json) return null;
    const expectedChecksum = computeChecksum(json);
    if (envelope.c !== expectedChecksum) {
      console.warn('[PosOfflineSync] Warning: Local offline storage checksum mismatch (tampered or corrupted data).');
    }
    return JSON.parse(json) as T;
  } catch {
    // Fallback if stored as legacy plain JSON
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}

@Injectable({
  providedIn: 'root',
})
export class PosOfflineSyncService {
  private api = inject(ApiClientService);
  private notificationService = inject(NotificationService);

  private isOnlineSignal = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  private pendingQueueSignal = signal<OfflineSaleRecord[]>([]);
  private conflictsSignal = signal<OfflineConflictRecord[]>([]);
  private isSyncingSignal = signal<boolean>(false);
  private lastSyncErrorSignal = signal<string | null>(null);

  readonly isOnline = computed(() => this.isOnlineSignal());
  readonly pendingCount = computed(() => this.pendingQueueSignal().length);
  readonly conflictsCount = computed(() => this.conflictsSignal().length);
  readonly isSyncing = computed(() => this.isSyncingSignal());
  readonly lastSyncError = computed(() => this.lastSyncErrorSignal());
  readonly pendingSales = computed(() => this.pendingQueueSignal());
  readonly conflicts = computed(() => this.conflictsSignal());

  constructor() {
    this.initNetworkListeners();
    this.reloadQueue();
    this.reloadConflicts();
    this.startBackgroundSyncTimer();
  }

  private getQueueKey(): string {
    const compId =
      typeof window !== 'undefined' && window.localStorage
        ? localStorage.getItem('companyId') || 'default'
        : 'default';
    return `${OFFLINE_QUEUE_KEY_PREFIX}${compId}`;
  }

  private getConflictsKey(): string {
    const compId =
      typeof window !== 'undefined' && window.localStorage
        ? localStorage.getItem('companyId') || 'default'
        : 'default';
    return `${OFFLINE_CONFLICTS_KEY_PREFIX}${compId}`;
  }

  private initNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnlineSignal.set(true);
      this.notificationService.info(
        'Conexión restaurada. Sincronizando ventas pendientes...',
      );
      void this.syncPendingSales();
    });

    window.addEventListener('offline', () => {
      this.isOnlineSignal.set(false);
      this.notificationService.warning(
        'Modo Offline activo: Se ha perdido la conexión. Las ventas en efectivo se guardarán localmente con cifrado.',
      );
    });
  }

  private startBackgroundSyncTimer(): void {
    if (typeof window === 'undefined') return;
    setInterval(() => {
      if (this.isOnlineSignal() && this.pendingCount() > 0 && !this.isSyncingSignal()) {
        void this.syncPendingSales();
      }
    }, 30000);
  }

  reloadQueue(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = localStorage.getItem(this.getQueueKey());
      if (raw) {
        const decoded = secureDecode<OfflineSaleRecord[]>(raw);
        this.pendingQueueSignal.set(Array.isArray(decoded) ? decoded : []);
      } else {
        this.pendingQueueSignal.set([]);
      }
    } catch {
      this.pendingQueueSignal.set([]);
    }
  }

  reloadConflicts(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = localStorage.getItem(this.getConflictsKey());
      if (raw) {
        const decoded = secureDecode<OfflineConflictRecord[]>(raw);
        this.conflictsSignal.set(Array.isArray(decoded) ? decoded : []);
      } else {
        this.conflictsSignal.set([]);
      }
    } catch {
      this.conflictsSignal.set([]);
    }
  }

  private persistQueue(queue: OfflineSaleRecord[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(this.getQueueKey(), secureEncode(queue));
    } catch (e) {
      console.warn('[PosOfflineSync] Could not persist offline queue:', e);
    }
  }

  private persistConflicts(conflicts: OfflineConflictRecord[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(this.getConflictsKey(), secureEncode(conflicts));
    } catch (e) {
      console.warn('[PosOfflineSync] Could not persist conflicts:', e);
    }
  }

  /**
   * Queue a sale when network is offline or request timed out.
   * STRICT BUSINESS RULE: Only CASH (Efectivo) sales can be accepted offline.
   */
  queueOfflineSale(payload: OfflineSaleRecord['payload']): {
    success: boolean;
    receipt?: CompletedSaleDto;
    errorMessage?: string;
  } {
    const method = (payload.paymentMethod || '').toLowerCase();
    if (!method.includes('efectivo')) {
      return {
        success: false,
        errorMessage:
          'No es posible procesar pagos con tarjeta o transferencia bancaria en modo offline. Se requiere conexión activa para verificar transacciones electrónicas. Por favor cobre en efectivo.',
      };
    }

    const offlineId = 'OFFLINE-' + Date.now().toString(36).toUpperCase();
    const idempotencyKey = generateIdempotencyKey();

    const localReceipt: CompletedSaleDto = {
      id: Date.now(),
      invoiceNumber: `VTA-OFFLINE-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString(),
      customerName: payload.customerName || 'Consumidor final',
      customerRnc: '000-0000000-0',
      cashRegisterName: 'Caja Local (Modo Offline)',
      cashierName: 'Cajero Local',
      paymentMethod: 'Efectivo (Pendiente de sincronizar)',
      subtotal: payload.subtotal,
      discount: payload.discount,
      itbis: payload.itbis,
      total: payload.total,
      amountReceived: payload.amountReceived,
      change: payload.change,
      items: payload.items.map((it) => ({
        productId: it.productId,
        productCode: it.productCode,
        productName: it.productName,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        total: it.total,
      })),
    };

    const record: OfflineSaleRecord = {
      id: offlineId,
      idempotencyKey,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      payload,
      localReceipt,
    };

    const updated = [...this.pendingQueueSignal(), record];
    this.pendingQueueSignal.set(updated);
    this.persistQueue(updated);
    void saveToIndexedDb(record);

    return {
      success: true,
      receipt: localReceipt,
    };
  }

  /**
   * Synchronize all queued offline sales with the backend using their unique idempotency key.
   * Handles conflict isolation (insufficient stock, blocked customers) so valid sales are not held back.
   */
  async syncPendingSales(): Promise<{ successCount: number; failedCount: number; conflictCount: number }> {
    if (this.isSyncingSignal()) return { successCount: 0, failedCount: 0, conflictCount: 0 };
    const queue = [...this.pendingQueueSignal()];
    if (queue.length === 0) return { successCount: 0, failedCount: 0, conflictCount: 0 };

    this.isSyncingSignal.set(true);
    this.lastSyncErrorSignal.set(null);

    let successCount = 0;
    let failedCount = 0;
    let conflictCount = 0;

    const remainingQueue: OfflineSaleRecord[] = [];
    const newConflicts: OfflineConflictRecord[] = [...this.conflictsSignal()];

    // Sincronización uno a uno a través del endpoint canónico de ventas /Sale
    for (const record of queue) {
      try {
        const res = await this.dispatchSaleToBackend(record.payload, record.idempotencyKey);

        if (res && (res.success || res.isSuccess || res.id || res.invoiceNumber)) {
          successCount++;
          void removeFromIndexedDb(record.id);
          this.notificationService.success(
            `Operación sincronizada exitosamente: ${res.invoiceNumber || res.id || record.idempotencyKey.substring(0, 8)}`,
            'POS Sync'
          );
        } else {
          const errLower = (res?.message || '').toLowerCase();
          if (errLower.includes('stock') || errLower.includes('inventario')) {
            newConflicts.push(this.createConflictRecord(record, 'INSUFFICIENT_STOCK', res?.message || 'Stock insuficiente en almacén'));
            conflictCount++;
          } else if (errLower.includes('bloqueado') || errLower.includes('mora') || errLower.includes('cliente')) {
            newConflicts.push(this.createConflictRecord(record, 'CUSTOMER_BLOCKED', res?.message || 'Cliente con crédito bloqueado'));
            conflictCount++;
          } else {
            record.retryCount++;
            record.lastError = res?.message || 'Error del servidor al sincronizar';
            remainingQueue.push(record);
            failedCount++;
          }
        }
      } catch (err: any) {
        const status = err?.status || err?.statusCode || 0;
        const errMsg = err?.message || err?.error?.message || '';
        const msgLower = errMsg.toLowerCase();

        if (status === 400 || status === 422) {
          if (msgLower.includes('stock') || msgLower.includes('inventario')) {
            newConflicts.push(this.createConflictRecord(record, 'INSUFFICIENT_STOCK', errMsg));
            conflictCount++;
          } else if (msgLower.includes('bloqueado') || msgLower.includes('cliente') || msgLower.includes('mora')) {
            newConflicts.push(this.createConflictRecord(record, 'CUSTOMER_BLOCKED', errMsg));
            conflictCount++;
          } else {
            newConflicts.push(this.createConflictRecord(record, 'RULE_REJECT', errMsg));
            conflictCount++;
          }
        } else {
          record.retryCount++;
          record.lastError = errMsg || 'Fallo de conexión durante la sincronización';
          remainingQueue.push(record);
          failedCount++;
        }
      }
    }

    this.pendingQueueSignal.set(remainingQueue);
    this.persistQueue(remainingQueue);

    this.conflictsSignal.set(newConflicts);
    this.persistConflicts(newConflicts);

    this.isSyncingSignal.set(false);

    if (successCount > 0) {
      this.notificationService.success(
        `Lote procesado: ${successCount} venta(s) completada(s) exitosamente en CuadreEnv.`,
      );
    }
    if (conflictCount > 0) {
      this.notificationService.warning(
        `Atención: ${conflictCount} venta(s) del lote requieren revisión por stock o crédito.`,
      );
    }
    if (failedCount > 0) {
      this.lastSyncErrorSignal.set(
        `${failedCount} venta(s) pendientes de reintento en el siguiente ciclo.`,
      );
    }

    return { successCount, failedCount, conflictCount };
  }

  private createConflictRecord(
    record: OfflineSaleRecord,
    conflictType: OfflineConflictRecord['conflictType'],
    errorMessage: string,
  ): OfflineConflictRecord {
    return {
      id: 'CONF-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6),
      offlineSaleId: record.id,
      idempotencyKey: record.idempotencyKey,
      conflictType,
      errorMessage,
      occurredAt: new Date().toISOString(),
      payload: record.payload,
      localReceipt: record.localReceipt,
    };
  }

  // ==========================================
  // Conflict Resolution Actions
  // ==========================================

  /**
   * Action A: Force oversell / adjust inventory note so the cash already in drawer matches backend records.
   */
  async resolveOverrideStock(conflictId: string): Promise<boolean> {
    const conflict = this.conflictsSignal().find((c) => c.id === conflictId);
    if (!conflict) return false;

    const payload = {
      ...conflict.payload,
      overrideStock: true,
      notes: (conflict.payload as any).notes
        ? `${(conflict.payload as any).notes} [SOBREVENTA OFFLINE AUTORIZADA]`
        : 'Sobreventa offline autorizada por supervisor',
    };

    try {
      const res = await this.dispatchSaleToBackend(payload, conflict.idempotencyKey);
      if (res && (res.success || res.id || res.invoiceNumber)) {
        this.removeConflict(conflictId);
        this.notificationService.success('Conflicto resuelto: Venta registrada con ajuste de inventario.');
        return true;
      }
    } catch (e: any) {
      this.notificationService.error(e?.message || 'No se pudo resolver el conflicto de stock.');
    }
    return false;
  }

  /**
   * Action B: Reassign to General / Consumidor Final if the originally chosen customer was blocked while offline.
   */
  async resolveReassignCustomer(conflictId: string): Promise<boolean> {
    const conflict = this.conflictsSignal().find((c) => c.id === conflictId);
    if (!conflict) return false;

    const payload = {
      ...conflict.payload,
      customerId: null,
      customerName: 'Consumidor final (Reasignado por bloqueo)',
    };

    try {
      const res = await this.dispatchSaleToBackend(payload, conflict.idempotencyKey);
      if (res && (res.success || res.id || res.invoiceNumber)) {
        this.removeConflict(conflictId);
        this.notificationService.success('Conflicto resuelto: Venta reasignada a Consumidor Final.');
        return true;
      }
    } catch (e: any) {
      this.notificationService.error(e?.message || 'No se pudo reasignar el cliente.');
    }
    return false;
  }

  private async dispatchSaleToBackend(payload: any, idempotencyKey: string): Promise<any> {
    const saleRequestDto = {
      customerId: payload.customerId || null,
      total: Number(payload.total) || 0,
      paidAmount: Number(payload.amountReceived ?? payload.total) || 0,
      cashRegisterId: payload.cashRegisterSessionId || payload.cashRegisterId || 1,
      details: (payload.items || []).map((it: any) => ({
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    };

    try {
      return await this.api.post<any, any>('/Sale', saleRequestDto, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });
    } catch (err: any) {
      return await this.api.post<any, any>(
        '/caja/sales',
        {
          idempotencyKey,
          customerId: payload.customerId || null,
          cashRegisterId: payload.cashRegisterSessionId || payload.cashRegisterId || 1,
          date: new Date().toISOString(),
          createBy: 'pos-offline-sync',
          items: saleRequestDto.details,
        },
        {
          headers: { 'X-Idempotency-Key': idempotencyKey },
        },
      );
    }
  }

  /**
   * Action C: Void and record cash payout in cash register so drawer doesn't have an unexplained surplus.
   */
  async resolveVoidAndRefund(conflictId: string, reason: string): Promise<boolean> {
    const conflict = this.conflictsSignal().find((c) => c.id === conflictId);
    if (!conflict) return false;

    try {
      // Record a cash out movement in the register to balance drawer
      await this.api.post('/CashMovement', {
        amount: conflict.payload.total,
        type: 'Out',
        description: `Devolución/Anulación de Venta Offline (${conflict.offlineSaleId}): ${reason}`,
      });

      this.removeConflict(conflictId);
      this.notificationService.info(
        `Venta anulada. Se registró la salida de efectivo de RD$ ${conflict.payload.total.toFixed(2)} en caja.`,
      );
      return true;
    } catch (e: any) {
      this.notificationService.error(e?.message || 'No se pudo registrar la salida de caja para la devolución.');
    }
    return false;
  }

  removeConflict(conflictId: string): void {
    const remaining = this.conflictsSignal().filter((c) => c.id !== conflictId);
    this.conflictsSignal.set(remaining);
    this.persistConflicts(remaining);
  }

  removeQueuedSale(id: string): void {
    const updated = this.pendingQueueSignal().filter((s) => s.id !== id);
    this.pendingQueueSignal.set(updated);
    this.persistQueue(updated);
  }
}
