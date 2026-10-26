import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RoleService } from '../../services/role.service';
import { PermissionService } from '../../services/permission.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { RoleModalComponent } from '../role-modal/role-modal.component';
import type { RoleDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-roles-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, RoleModalComponent],
  templateUrl: './roles-list.component.html',
  styleUrls: ['./roles-list.component.scss'],
})
export class RolesListComponent implements OnInit {
  private roleService = inject(RoleService);
  private permissionService = inject(PermissionService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  searchTerm = signal<string>('');
  selectedRoleForEdit = signal<RoleDto | null>(null);
  isModalVisible = signal<boolean>(false);

  // Deletion confirmation state
  roleToDelete = signal<RoleDto | null>(null);
  isDeleting = signal<boolean>(false);

  readonly roles = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const list = this.roleService.roles();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  });

  readonly totalCollaborators = computed(() => {
    return this.roleService.roles().reduce((acc, r) => acc + (r.userCount || 0), 0);
  });

  ngOnInit(): void {
    void this.roleService.loadRoles();
  }

  openCreateModal(): void {
    this.selectedRoleForEdit.set(null);
    this.isModalVisible.set(true);
  }

  openEditModal(role: RoleDto): void {
    this.selectedRoleForEdit.set(role);
    this.isModalVisible.set(true);
  }

  goToMatrix(role?: RoleDto): void {
    if (role?.id) {
      this.router.navigate(['/admin/roles/matrix'], { queryParams: { roleId: role.id } });
    } else {
      this.router.navigate(['/admin/roles/matrix']);
    }
  }

  promptDeleteRole(role: RoleDto): void {
    if (role.isSystem) {
      this.notificationService.warning('Los roles del sistema no pueden ser eliminados.');
      return;
    }
    this.roleToDelete.set(role);
  }

  cancelDelete(): void {
    this.roleToDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const role = this.roleToDelete();
    if (!role) return;

    this.isDeleting.set(true);
    try {
      await this.roleService.deleteRole(role.id);
      this.notificationService.success(`Rol "${role.name}" eliminado correctamente.`);
      this.roleToDelete.set(null);
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al eliminar el rol.');
    } finally {
      this.isDeleting.set(false);
    }
  }

  getPermissionCount(role: RoleDto): number {
    if (role.permissionIds) return role.permissionIds.length;
    if (role.permissions) return role.permissions.length;
    return 0;
  }
}
