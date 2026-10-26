import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { CompanyService } from '../../../companies/services/company.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import type { UserDto } from '../../../cuadreEnv/types/api';
import { IconDirective } from '@coreui/icons-angular';
import { InviteModalComponent } from './invite-modal.component';
import { EmployeeModalComponent } from './employee-modal.component';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import {
  FilterPanelComponent,
  type FilterConfig,
  type FilterValues,
} from '../../../cuadreEnv/components/filter-panel/filter-panel.component';
import {
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  ContainerComponent,
  AlertComponent,
  SpinnerComponent,
  FormSelectDirective,
} from '@coreui/angular';
import { ListPaginationComponent } from '../../../cuadreEnv/components/list-pagination/list-pagination.component';
import { TableComponent } from '../../../cuadreEnv/components/table/table.component';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  standalone: true,
  imports: [
    CommonModule,
    AlertComponent,
    SpinnerComponent,
    InviteModalComponent,
    EmployeeModalComponent,
    FilterPanelComponent,
    KtPaginatorComponent,
  ],
})
export class UsersComponent implements OnInit {
  @ViewChild('inviteModal') inviteModal!: InviteModalComponent;
  @ViewChild('employeeModal') employeeModal!: EmployeeModalComponent;

  readonly translationService = inject(TranslationService);
  private confirmService = inject(ConfirmDialogService);
  private companyService = inject(CompanyService);

  readonly activeCompanyName = computed(() => this.companyService.currentSettings().companyName || 'Mi Empresa');

  users = signal<UserDto[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  filters = signal<FilterValues>({});
  currentPage = signal<number>(1);
  pageSize = 10;
  totalItems = signal<number>(0);
  isEmployeeModalOpen = false;

  readonly filterConfig = computed<FilterConfig[]>(() => [
    {
      key: 'search',
      label: this.translationService.t('users.filterSearch'),
      type: 'text',
      placeholder: this.translationService.t('users.filterSearch'),
    },
    {
      key: 'role',
      label: this.translationService.t('users.filterRole'),
      type: 'select',
      options: [
        { label: this.translationService.t('users.filterAll'), value: '' },
        { label: 'Admin', value: 'Admin' },
        { label: 'Manager', value: 'Manager' },
        { label: 'Supervisor', value: 'Supervisor' },
        { label: 'Vendedor', value: 'Vendedor' },
        { label: 'Cajero', value: 'Cajero' },
        { label: 'Employee', value: 'Employee' },
      ],
    },
    {
      key: 'status',
      label: this.translationService.t('users.filterStatus'),
      type: 'select',
      options: [
        { label: this.translationService.t('users.filterAll'), value: '' },
        {
          label: this.translationService.t('customers.filterActive'),
          value: 'active',
        },
        {
          label: this.translationService.t('customers.filterInactive'),
          value: 'inactive',
        },
      ],
    },
  ]);

  isModalOpen = false;

  get columns() {
    return [
      { field: 'id', label: this.translationService.t('users.table.userId') },
      { field: 'name', label: this.translationService.t('users.table.name') },
      { field: 'email', label: this.translationService.t('users.table.email') },
      { field: 'role', label: this.translationService.t('users.table.role') },
      {
        field: 'status',
        label: this.translationService.t('users.table.status'),
      },
      { field: 'actions', label: this.translationService.t('common.actions') },
    ];
  }

  constructor(
    private userService: UserService,
    public authService: AuthService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit() {
    this.loadUsers();
  }

  async loadUsers() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const activeFilters = this.filters();
      const q = String(activeFilters['search'] || '').trim();
      const role = String(activeFilters['role'] || '').trim();
      const status = String(activeFilters['status'] || '').trim();
      const active =
        status === 'active' ? true : status === 'inactive' ? false : undefined;

      const res = await this.userService.getUsers({
        page: this.currentPage(),
        pageSize: this.pageSize,
        q: q || undefined,
        role: role || undefined,
        active: active,
      });

      this.users.set(res.items || []);
      this.totalItems.set(res.total || 0);
    } catch (e: any) {
      if (e?.status === 404 || e?.statusCode === 404 || e?.message?.includes?.('404')) {
        this.users.set([]);
        this.totalItems.set(0);
      } else {
        const mapped = this.notificationService.showApiError(e);
        this.errorMessage.set(mapped.message);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  onFiltersChange(values: FilterValues) {
    this.filters.set(values);
    this.currentPage.set(1);
    this.loadUsers();
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
    this.loadUsers();
  }

  readonly pagedUsers = computed(() => {
    return this.users();
  });

  getFilteredUsersCount(): number {
    return this.totalItems();
  }

  getFilteredUsers(): UserDto[] {
    return this.users();
  }

  openInviteModal() {
    this.isModalOpen = true;
    setTimeout(() => {
      if (this.inviteModal) this.inviteModal.open();
    });
  }

  openEmployeeModal() {
    this.isEmployeeModalOpen = true;
    setTimeout(() => {
      if (this.employeeModal) this.employeeModal.open();
    });
  }

  editUser(user: UserDto) {
    this.isEmployeeModalOpen = true;
    setTimeout(() => {
      if (this.employeeModal) this.employeeModal.open(user);
    });
  }

  async resetUserPassword(user: UserDto) {
    if (!user.id) return;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    const confirmed = await this.confirmService.confirm({
      title: '¿Restablecer contraseña?',
      message: `Se generará una contraseña temporal para ${userName}.`,
      itemName: userName,
      itemType: 'Usuario',
      confirmText: 'Restablecer',
      variant: 'warning',
      icon: 'cilWarning',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      const res = await this.userService.resetPassword(user.id, { sendByEmail: true });
      const tempPass = res?.result || res?.data?.result;
      if (tempPass && tempPass !== 'sent') {
        this.notificationService.success(`Contraseña restablecida exitosamente. Clave temporal: ${tempPass}`);
      } else {
        this.notificationService.success('Contraseña restablecida y enviada por correo exitosamente.');
      }
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      this.errorMessage.set(mapped.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteUser(user: UserDto) {
    if (!user.id) return;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar usuario permanentemente?',
      message: 'Esta acción no se puede deshacer y el usuario perderá acceso definitivo al sistema.',
      itemName: userName,
      itemType: 'Usuario',
      confirmText: 'Eliminar definitivamente',
      variant: 'danger',
      icon: 'cilTrash',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      await this.userService.deleteUser(user.id);
      this.notificationService.success('Usuario eliminado exitosamente.');
      this.loadUsers();
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      this.errorMessage.set(mapped.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleDeactivation(user: UserDto) {
    if (!user.id) return;
    const isDeactivating = user.active !== false;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || `Usuario #${user.id}`;

    const confirmed = await this.confirmService.confirm({
      title: isDeactivating ? '¿Desactivar usuario?' : '¿Reactivar usuario?',
      message: isDeactivating
        ? 'El usuario no podrá iniciar sesión en la plataforma hasta que su cuenta sea reactivada.'
        : 'El usuario recuperará el acceso a la plataforma con su rol asignado.',
      itemName: userName,
      itemType: 'Usuario',
      confirmText: isDeactivating ? 'Desactivar' : 'Reactivar',
      variant: isDeactivating ? 'danger' : 'warning',
      icon: isDeactivating ? 'cilTrash' : 'cilWarning',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      if (isDeactivating) {
        await this.userService.deactivateUser(user.id);
        this.notificationService.success('Usuario desactivado exitosamente.');
      } else {
        await this.userService.reactivateUser(user.id);
        this.notificationService.success('Usuario reactivado exitosamente.');
      }
      this.loadUsers();
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      this.errorMessage.set(mapped.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async changeUserRole(user: UserDto, event: any) {
    if (!user.id) return;
    const newRole = event.target.value;

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      await this.userService.changeRole(user.id, newRole);
      this.notificationService.success('Rol de usuario actualizado exitosamente.');
      this.loadUsers();
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      this.errorMessage.set(mapped.message);
    } finally {
      this.isLoading.set(false);
    }
  }
}

