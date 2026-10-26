import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RoleService } from '../../services/role.service';
import { PermissionService, SYSTEM_MODULES } from '../../services/permission.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { RoleDto, PermissionDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-role-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './role-modal.component.html',
  styleUrls: ['./role-modal.component.scss'],
})
export class RoleModalComponent {
  private fb = inject(FormBuilder);
  private roleService = inject(RoleService);
  private permissionService = inject(PermissionService);
  private notificationService = inject(NotificationService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  isLoading = signal<boolean>(false);
  editingRoleId = signal<number | null>(null);
  isSystemRole = signal<boolean>(false);

  // Quick module toggle checklist
  readonly availableModules = SYSTEM_MODULES;
  selectedModuleKeys = signal<Set<string>>(new Set(['Sales', 'Customers']));

  form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    description: ['', [Validators.maxLength(250)]],
  });

  open(role?: RoleDto) {
    if (role && role.id) {
      this.editingRoleId.set(role.id);
      this.isSystemRole.set(!!role.isSystem);
      this.form.reset({
        name: role.name,
        description: role.description || '',
      });

      // Extract existing module keys from role permissions
      const activeMods = new Set<string>();
      if (role.permissions && role.permissions.length > 0) {
        for (const p of role.permissions) {
          activeMods.add(p.module);
        }
      } else if (role.permissionIds && role.permissionIds.length > 0) {
        const catalog = this.permissionService.permissionsCatalog();
        for (const p of catalog) {
          if (role.permissionIds.includes(p.id)) {
            activeMods.add(p.module);
          }
        }
      }
      this.selectedModuleKeys.set(activeMods.size > 0 ? activeMods : new Set(['Sales']));
    } else {
      this.editingRoleId.set(null);
      this.isSystemRole.set(false);
      this.form.reset({
        name: '',
        description: '',
      });
      this.selectedModuleKeys.set(new Set(['Sales', 'Customers']));
    }

    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  toggleModule(modKey: string) {
    const current = new Set(this.selectedModuleKeys());
    if (current.has(modKey)) {
      current.delete(modKey);
    } else {
      current.add(modKey);
    }
    this.selectedModuleKeys.set(current);
  }

  isModuleSelected(modKey: string): boolean {
    return this.selectedModuleKeys().has(modKey);
  }

  async onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    try {
      const catalog = this.permissionService.permissionsCatalog();
      const activeMods = this.selectedModuleKeys();

      // Gather permission IDs for selected modules (View, Create, Edit by default for quick creation)
      const permissionIds = catalog
        .filter((p) => activeMods.has(p.module))
        .map((p) => p.id);

      const roleId = this.editingRoleId();
      if (roleId) {
        await this.roleService.updateRole(roleId, {
          name: this.form.value.name.trim(),
          description: (this.form.value.description || '').trim(),
          permissionIds,
        });
        this.notificationService.success('Rol actualizado correctamente.');
      } else {
        await this.roleService.createRole({
          name: this.form.value.name.trim(),
          description: (this.form.value.description || '').trim(),
          permissionIds,
        });
        this.notificationService.success('Nuevo rol creado correctamente.');
      }

      this.saved.emit();
      this.close();
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al guardar el rol.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
