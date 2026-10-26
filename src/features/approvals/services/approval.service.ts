import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import type { DeletionApprovalDto } from '../../cuadreEnv/types/api';

const APPROVALS_STORAGE_KEY = 'cuadreenv_approvals_db';

@Injectable({
  providedIn: 'root',
})
export class ApprovalService {
  private api = inject(ApiClientService);
  private auth = inject(AuthService);

  readonly approvals = signal<DeletionApprovalDto[]>([]);
  readonly isLoading = signal<boolean>(false);

  readonly pendingApprovals = computed(() =>
    this.approvals().filter((a) => a.status === 'PENDING')
  );

  readonly historyApprovals = computed(() =>
    this.approvals().filter((a) => a.status !== 'PENDING')
  );

  readonly pendingCount = computed(() => this.pendingApprovals().length);

  constructor() {
    void this.loadApprovals();
  }

  private getTenantStorageKey(): string {
    const compId = this.auth.companyId() || 'global';
    return `${APPROVALS_STORAGE_KEY}_${compId}`;
  }

  private getDefaultApprovals(): DeletionApprovalDto[] {
    return [
      {
        id: 1,
        entityType: 'Venta / Factura',
        entityId: 1042,
        entityCode: 'FAC-2026-0084',
        requestedByUserId: 15,
        requestedByUserName: 'Carlos M. Auditor',
        reason: 'Factura duplicada por fallo de conectividad en terminal POS 02. No generó movimiento bancario.',
        status: 'PENDING',
        requestedAt: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
      },
      {
        id: 2,
        entityType: 'Inventario / Salida',
        entityId: 88,
        entityCode: 'OUT-2026-019',
        requestedByUserId: 15,
        requestedByUserName: 'Carlos M. Auditor',
        reason: 'Salida de almacén registrada con tipo de merma incorrecto. Se reemplazará con ajuste físico auditado.',
        status: 'PENDING',
        requestedAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
      },
      {
        id: 3,
        entityType: 'Cliente',
        entityId: 45,
        entityCode: 'CLI-0045',
        requestedByUserId: 15,
        requestedByUserName: 'Carlos M. Auditor',
        reason: 'Cliente de prueba creado durante capacitación interna. Sin balance ni movimientos fiscales.',
        status: 'APPROVED',
        requestedAt: new Date(Date.now() - 3600 * 1000 * 26).toISOString(),
        reviewedByUserId: 1,
        reviewedByUserName: 'Administrador General',
        reviewedAt: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
      },
    ];
  }

  private loadFromStorage(): DeletionApprovalDto[] {
    try {
      const raw = localStorage.getItem(this.getTenantStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  private saveToStorage(list: DeletionApprovalDto[]): void {
    try {
      localStorage.setItem(this.getTenantStorageKey(), JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  async loadApprovals(): Promise<DeletionApprovalDto[]> {
    this.isLoading.set(true);
    try {
      const res = await this.api.get<any, any>('/approvals');
      const items: DeletionApprovalDto[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.items)
            ? res.items
            : [];

      if (items.length > 0) {
        this.approvals.set(items);
        this.saveToStorage(items);
        return items;
      }
      const stored = this.loadFromStorage();
      if (stored.length > 0) {
        this.approvals.set(stored);
        return stored;
      }
      const defaults = this.getDefaultApprovals();
      this.approvals.set(defaults);
      this.saveToStorage(defaults);
      return defaults;
    } catch {
      const stored = this.loadFromStorage();
      if (stored.length > 0) {
        this.approvals.set(stored);
        return stored;
      }
      const defaults = this.getDefaultApprovals();
      this.approvals.set(defaults);
      this.saveToStorage(defaults);
      return defaults;
    } finally {
      this.isLoading.set(false);
    }
  }

  async approve(id: number): Promise<DeletionApprovalDto> {
    const user = this.auth.currentUser();
    const adminName = user?.email ? user.email.split('@')[0] : 'Administrador';

    try {
      const res = await this.api.post<any, any>(`/approvals/${id}/approve`, {});
      if (res) {
        await this.loadApprovals();
        return res?.data || res;
      }
    } catch {
      // Fallback local
    }

    const list = this.loadFromStorage();
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Solicitud #${id} no encontrada`);

    const updated: DeletionApprovalDto = {
      ...list[idx],
      status: 'APPROVED',
      reviewedByUserId: user?.id || 1,
      reviewedByUserName: adminName,
      reviewedAt: new Date().toISOString(),
    };

    list[idx] = updated;
    this.saveToStorage(list);
    this.approvals.set([...list]);
    return updated;
  }

  async reject(id: number, reason?: string): Promise<DeletionApprovalDto> {
    const user = this.auth.currentUser();
    const adminName = user?.email ? user.email.split('@')[0] : 'Administrador';

    try {
      const res = await this.api.post<any, any>(`/approvals/${id}/reject`, { reason });
      if (res) {
        await this.loadApprovals();
        return res?.data || res;
      }
    } catch {
      // Fallback local
    }

    const list = this.loadFromStorage();
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Solicitud #${id} no encontrada`);

    const updated: DeletionApprovalDto = {
      ...list[idx],
      status: 'REJECTED',
      reviewedByUserId: user?.id || 1,
      reviewedByUserName: adminName,
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason || 'Rechazado por administración sin justificación adicional.',
    };

    list[idx] = updated;
    this.saveToStorage(list);
    this.approvals.set([...list]);
    return updated;
  }

  async requestDeletion(data: {
    entityType: string;
    entityId: number;
    entityCode: string;
    reason: string;
  }): Promise<DeletionApprovalDto> {
    const user = this.auth.currentUser();
    const userName = user?.email ? user.email.split('@')[0] : 'Auditor';

    try {
      const res = await this.api.post<any, any>('/approvals/request', data);
      if (res?.data) {
        await this.loadApprovals();
        return res.data;
      }
    } catch {
      // Fallback local
    }

    const list = this.loadFromStorage();
    const newId = list.length > 0 ? Math.max(...list.map((a) => a.id)) + 1 : 1;
    const item: DeletionApprovalDto = {
      id: newId,
      entityType: data.entityType,
      entityId: data.entityId,
      entityCode: data.entityCode,
      requestedByUserId: user?.id || 2,
      requestedByUserName: userName,
      reason: data.reason,
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };

    list.unshift(item);
    this.saveToStorage(list);
    this.approvals.set([...list]);
    return item;
  }
}
