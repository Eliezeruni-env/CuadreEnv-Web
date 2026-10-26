import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RoleService } from '../../services/role.service';
import {
  PermissionService,
  SYSTEM_MODULES,
  ACTIONS_LIST,
  type ModuleDefinition,
} from '../../services/permission.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { RoleDto, PermissionDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-permission-matrix',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './permission-matrix.component.html',
  styleUrls: ['./permission-matrix.component.scss'],
})
export class PermissionMatrixComponent implements OnInit {
  private roleService = inject(RoleService);
  private permissionService = inject(PermissionService);
  private notificationService = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly modules = SYSTEM_MODULES;
  readonly actions = ACTIONS_LIST;

  selectedRoleId = signal<number | null>(null);
  selectedRole = computed(() => {
    const id = this.selectedRoleId();
    return this.roleService.roles().find((r) => r.id === id) || null;
  });

  // Set of selected permission IDs for the currently active role
  activePermissionIds = signal<Set<number>>(new Set());
  roleAllowedModules = signal<string[]>([]);

  isSaving = signal<boolean>(false);
  hasUnsavedChanges = signal<boolean>(false);

  // Total possible permissions in catalog
  readonly totalCatalogCount = computed(
    () => this.permissionService.permissionsCatalog().length
  );

  readonly activeCount = computed(() => this.activePermissionIds().size);

  ngOnInit(): void {
    void this.initMatrix();
  }

  async initMatrix(): Promise<void> {
    const roles = await this.roleService.loadRoles();
    const catalog = await this.permissionService.loadCatalog();

    // Check query params for roleId
    this.route.queryParams.subscribe((params) => {
      const paramId = params['roleId'] ? parseInt(params['roleId'], 10) : null;
      if (paramId && roles.some((r) => r.id === paramId)) {
        this.selectRole(paramId);
      } else if (roles.length > 0) {
        // Default to first non-admin role, or first role
        const defaultRole = roles.find((r) => !r.isSystem) || roles[0];
        this.selectRole(defaultRole.id);
      }
    });
  }

  selectRole(roleId: number): void {
    const role = this.roleService.roles().find((r) => r.id === roleId);
    if (!role) return;

    this.selectedRoleId.set(roleId);

    // Populate permission IDs
    const permSet = new Set<number>();
    if (role.permissionIds && role.permissionIds.length > 0) {
      role.permissionIds.forEach((id) => permSet.add(id));
    } else if (role.permissions && role.permissions.length > 0) {
      role.permissions.forEach((p) => permSet.add(p.id));
    } else if (role.isSystem && role.name.toLowerCase().includes('admin')) {
      // Admin has all permissions
      this.permissionService.permissionsCatalog().forEach((p) => permSet.add(p.id));
    }

    this.activePermissionIds.set(permSet);

    // Populate granular modules
    const mods = role.allowedModules || (role.isSystem ? ['purchases-receipts', 'inventory-entries'] : []);
    this.roleAllowedModules.set([...mods]);

    this.hasUnsavedChanges.set(false);
  }

  isGranularModuleEnabled(moduleCode: string): boolean {
    const code = moduleCode.toLowerCase();
    const mods = this.roleAllowedModules();
    if (mods.includes('*') || mods.includes('ALL') || mods.includes('all')) return true;
    return mods.some((m) => m.toLowerCase() === code);
  }

  toggleGranularModule(moduleCode: string): void {
    const code = moduleCode.toLowerCase();
    const current = this.roleAllowedModules();
    let updated: string[];
    if (this.isGranularModuleEnabled(code)) {
      updated = current.filter((m) => m.toLowerCase() !== code && m !== '*' && m !== 'ALL' && m !== 'all');
    } else {
      updated = [...current.filter((m) => m.toLowerCase() !== code), code];
    }
    this.roleAllowedModules.set(updated);
    this.hasUnsavedChanges.set(true);
  }

  getPermission(modKey: PermissionDto['module'], actionKey: PermissionDto['action']): PermissionDto | undefined {
    return this.permissionService
      .permissionsCatalog()
      .find((p) => p.module.toLowerCase() === modKey.toLowerCase() && p.action.toLowerCase() === actionKey.toLowerCase());
  }

  hasPermission(modKey: PermissionDto['module'], actionKey: PermissionDto['action']): boolean {
    const perm = this.getPermission(modKey, actionKey);
    if (!perm) return false;
    return this.activePermissionIds().has(perm.id);
  }

  togglePermission(modKey: PermissionDto['module'], actionKey: PermissionDto['action']): void {
    const perm = this.getPermission(modKey, actionKey);
    if (!perm) return;

    const current = new Set(this.activePermissionIds());
    if (current.has(perm.id)) {
      current.delete(perm.id);
    } else {
      current.add(perm.id);
      // Convenience: If creating/editing/deleting, auto-enable 'View' for that module as well
      if (['Create', 'Edit', 'Delete', 'Approve', 'Export'].includes(actionKey)) {
        const viewPerm = this.getPermission(modKey, 'View');
        if (viewPerm) current.add(viewPerm.id);
      }
    }

    this.activePermissionIds.set(current);
    this.hasUnsavedChanges.set(true);
  }

  toggleAllForModule(modKey: PermissionDto['module']): void {
    const current = new Set(this.activePermissionIds());
    const modulePerms = this.permissionService
      .permissionsCatalog()
      .filter((p) => p.module.toLowerCase() === modKey.toLowerCase());

    const allSelected = modulePerms.every((p) => current.has(p.id));

    if (allSelected) {
      modulePerms.forEach((p) => current.delete(p.id));
    } else {
      modulePerms.forEach((p) => current.add(p.id));
    }

    this.activePermissionIds.set(current);
    this.hasUnsavedChanges.set(true);
  }

  isModuleFullySelected(modKey: PermissionDto['module']): boolean {
    const modulePerms = this.permissionService
      .permissionsCatalog()
      .filter((p) => p.module.toLowerCase() === modKey.toLowerCase());
    return modulePerms.length > 0 && modulePerms.every((p) => this.activePermissionIds().has(p.id));
  }

  toggleAllForAction(actionKey: PermissionDto['action']): void {
    const current = new Set(this.activePermissionIds());
    const actionPerms = this.permissionService
      .permissionsCatalog()
      .filter((p) => p.action.toLowerCase() === actionKey.toLowerCase());

    const allSelected = actionPerms.every((p) => current.has(p.id));

    if (allSelected) {
      actionPerms.forEach((p) => current.delete(p.id));
    } else {
      actionPerms.forEach((p) => current.add(p.id));
      // If toggling on an action, ensure 'View' is enabled where applicable
      if (actionKey !== 'View') {
        const viewPerms = this.permissionService
          .permissionsCatalog()
          .filter((p) => p.action.toLowerCase() === 'view');
        viewPerms.forEach((p) => current.add(p.id));
      }
    }

    this.activePermissionIds.set(current);
    this.hasUnsavedChanges.set(true);
  }

  isActionFullySelected(actionKey: PermissionDto['action']): boolean {
    const actionPerms = this.permissionService
      .permissionsCatalog()
      .filter((p) => p.action.toLowerCase() === actionKey.toLowerCase());
    return actionPerms.length > 0 && actionPerms.every((p) => this.activePermissionIds().has(p.id));
  }

  grantAll(): void {
    const allIds = this.permissionService.permissionsCatalog().map((p) => p.id);
    this.activePermissionIds.set(new Set(allIds));
    this.hasUnsavedChanges.set(true);
  }

  revokeAll(): void {
    this.activePermissionIds.set(new Set());
    this.hasUnsavedChanges.set(true);
  }

  async saveChanges(): Promise<void> {
    const role = this.selectedRole();
    if (!role) return;

    this.isSaving.set(true);
    try {
      const permissionIds = Array.from(this.activePermissionIds());
      const allowedModules = this.roleAllowedModules();
      await this.roleService.updateRolePermissions(role.id, permissionIds, allowedModules);
      this.hasUnsavedChanges.set(false);
      this.notificationService.success(
        `Permisos actualizados para el rol "${role.name}" (${permissionIds.length} activos).`
      );
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al guardar los permisos.');
    } finally {
      this.isSaving.set(false);
    }
  }

  getRoles(): RoleDto[] {
    return this.roleService.roles();
  }
}
