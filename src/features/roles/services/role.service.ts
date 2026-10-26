import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import { PermissionService } from './permission.service';
import type {
  RoleDto,
  CreateRoleRequest,
  UpdateRoleRequest,
  PermissionDto,
} from '../../cuadreEnv/types/api';

const ROLES_STORAGE_KEY = 'cuadreenv_roles_db';

@Injectable({
  providedIn: 'root',
})
export class RoleService {
  private api = inject(ApiClientService);
  private auth = inject(AuthService);
  private permissionService = inject(PermissionService);

  readonly roles = signal<RoleDto[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    void this.loadRoles();
  }

  private getTenantStorageKey(): string {
    const compId = this.auth.companyId() || 'global';
    return `${ROLES_STORAGE_KEY}_${compId}`;
  }

  private getDefaultRoles(): RoleDto[] {
    const catalog = this.permissionService.generateDefaultCatalog();
    const allIds = catalog.map((p) => p.id);

    // Filter subsets for defaults
    const salesCashierIds = catalog
      .filter((p) => ['Sales', 'Billing', 'CashRegister'].includes(p.module))
      .map((p) => p.id);

    const sellerIds = catalog
      .filter((p) => ['Sales', 'Customers'].includes(p.module) || (p.module === 'Inventory' && p.action === 'View'))
      .map((p) => p.id);

    const auditIds = catalog
      .filter((p) => ['Audit', 'Reports'].includes(p.module) || p.action === 'View' || p.action === 'Edit')
      .map((p) => p.id);

    return [
      {
        id: 1,
        name: 'Administrador',
        description: 'Acceso total y configuración de la empresa',
        isSystem: true,
        userCount: 1,
        permissionIds: allIds,
        permissions: catalog,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 2,
        name: 'Cajero',
        description: 'Gestión de cobros, apertura y arqueo de caja registradora',
        isSystem: false,
        userCount: 2,
        permissionIds: salesCashierIds,
        permissions: catalog.filter((p) => salesCashierIds.includes(p.id)),
        createdAt: '2026-01-02T00:00:00Z',
      },
      {
        id: 3,
        name: 'Vendedor',
        description: 'Emisión de cotizaciones, pedidos y atención a clientes',
        isSystem: false,
        userCount: 3,
        permissionIds: sellerIds,
        permissions: catalog.filter((p) => sellerIds.includes(p.id)),
        createdAt: '2026-01-03T00:00:00Z',
      },
      {
        id: 4,
        name: 'Auditor',
        description: 'Revisión contable, fiscal y trazabilidad de operaciones',
        isSystem: false,
        userCount: 1,
        permissionIds: auditIds,
        permissions: catalog.filter((p) => auditIds.includes(p.id)),
        createdAt: '2026-01-04T00:00:00Z',
      },
    ];
  }

  private loadFromStorage(): RoleDto[] {
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

  private saveToStorage(roles: RoleDto[]): void {
    try {
      localStorage.setItem(this.getTenantStorageKey(), JSON.stringify(roles));
    } catch {
      // ignore
    }
  }

  async loadRoles(): Promise<RoleDto[]> {
    this.isLoading.set(true);
    try {
      const res = await this.api.get<any, any>('/roles');
      const items: RoleDto[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.items)
            ? res.items
            : [];

      if (items.length > 0) {
        this.roles.set(items);
        this.saveToStorage(items);
        this.permissionService.refreshUserPermissions(items);
        return items;
      }
      const stored = this.loadFromStorage();
      if (stored.length > 0) {
        this.roles.set(stored);
        this.permissionService.refreshUserPermissions(stored);
        return stored;
      }
      const defaults = this.getDefaultRoles();
      this.roles.set(defaults);
      this.saveToStorage(defaults);
      this.permissionService.refreshUserPermissions(defaults);
      return defaults;
    } catch {
      const stored = this.loadFromStorage();
      if (stored.length > 0) {
        this.roles.set(stored);
        this.permissionService.refreshUserPermissions(stored);
        return stored;
      }
      const defaults = this.getDefaultRoles();
      this.roles.set(defaults);
      this.saveToStorage(defaults);
      this.permissionService.refreshUserPermissions(defaults);
      return defaults;
    } finally {
      this.isLoading.set(false);
    }
  }

  async getRoleById(id: number): Promise<RoleDto | undefined> {
    const list = this.roles();
    const existing = list.find((r) => r.id === id);
    if (existing) return existing;

    const roles = await this.loadRoles();
    return roles.find((role) => role.id === id);
  }

  async createRole(req: CreateRoleRequest): Promise<RoleDto> {
    try {
      const res = await this.api.post<any, any>('/roles', req);
      const created: RoleDto = res?.data || res;
      if (created && created.id) {
        await this.loadRoles();
        return created;
      }
    } catch {
      // Fallback local create
    }

    const catalog = this.permissionService.permissionsCatalog();
    const current = this.loadFromStorage();
    const newId = current.length > 0 ? Math.max(...current.map((r) => r.id)) + 1 : 1;
    const permissions = catalog.filter((p) => req.permissionIds?.includes(p.id));

    const newRole: RoleDto = {
      id: newId,
      name: req.name.trim(),
      description: req.description?.trim(),
      isSystem: false,
      userCount: 0,
      permissionIds: req.permissionIds || [],
      permissions,
      createdAt: new Date().toISOString(),
    };

    current.push(newRole);
    this.saveToStorage(current);
    this.roles.set([...current]);
    this.permissionService.refreshUserPermissions(current);
    return newRole;
  }

  async updateRole(id: number, req: UpdateRoleRequest): Promise<RoleDto> {
    try {
      const res = await this.api.put<any, any>(`/roles/${id}`, req);
      const updated: RoleDto = res?.data || res;
      if (updated) {
        await this.loadRoles();
        return updated;
      }
    } catch {
      // Fallback local update
    }

    const catalog = this.permissionService.permissionsCatalog();
    const current = this.loadFromStorage();
    const idx = current.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Rol con ID ${id} no encontrado`);

    const existing = current[idx];
    const newPermIds = req.permissionIds ?? existing.permissionIds ?? [];
    const permissions = catalog.filter((p) => newPermIds.includes(p.id));

    const updatedRole: RoleDto = {
      ...existing,
      name: req.name?.trim() || existing.name,
      description: req.description !== undefined ? req.description?.trim() : existing.description,
      permissionIds: newPermIds,
      permissions,
    };

    current[idx] = updatedRole;
    this.saveToStorage(current);
    this.roles.set([...current]);
    this.permissionService.refreshUserPermissions(current);
    return updatedRole;
  }

  async deleteRole(id: number): Promise<boolean> {
    const role = this.roles().find((r) => r.id === id);
    if (role?.isSystem) {
      throw new Error('No es posible eliminar un rol predeterminado del sistema');
    }

    try {
      await this.api.delete(`/roles/${id}`);
      await this.loadRoles();
      return true;
    } catch {
      // Fallback local delete
    }

    const current = this.loadFromStorage().filter((r) => r.id !== id);
    this.saveToStorage(current);
    this.roles.set([...current]);
    this.permissionService.refreshUserPermissions(current);
    return true;
  }

  async updateRolePermissions(roleId: number, permissionIds: number[], allowedModules?: string[]): Promise<boolean> {
    try {
      const role = await this.getRoleById(roleId);
      if (!role) throw new Error(`Rol con ID ${roleId} no encontrado`);
      await this.api.put(`/roles/${roleId}`, {
        name: role.name,
        description: role.description,
        permissionIds,
        allowedModules: allowedModules ?? role.allowedModules,
      });
      await this.loadRoles();
      return true;
    } catch {
      // Fallback local update
    }

    await this.updateRole(roleId, { permissionIds, allowedModules } as any);
    return true;
  }
}
