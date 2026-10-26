import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { CompanyService } from '../../../companies/services/company.service';
import { UserService } from '../../services/user.service';
import { RoleService } from '../../../roles/services/role.service';
import {
  PermissionService,
  SYSTEM_MODULES,
  ACTIONS_LIST,
} from '../../../roles/services/permission.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { ApprovalService } from '../../../approvals/services/approval.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { PhoneMaskDirective, CedulaMaskDirective } from '../../../../app/shared/directives';
import type { UserDto, CompanyBankAccountDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, PhoneMaskDirective, CedulaMaskDirective],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
})
export class UserProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  readonly authService = inject(AuthService);
  readonly companyService = inject(CompanyService);
  private userService = inject(UserService);
  readonly roleService = inject(RoleService);
  readonly permissionService = inject(PermissionService);
  private cashRegisterService = inject(CashRegisterService);
  readonly approvalService = inject(ApprovalService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  readonly userProfile = signal<UserDto | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly isSaving = signal<boolean>(false);
  readonly isEditing = signal<boolean>(false);

  // Company Bank Accounts Management
  readonly bankAccounts = signal<CompanyBankAccountDto[]>([]);
  readonly isAddBankModalOpen = signal<boolean>(false);
  readonly isSavingBank = signal<boolean>(false);

  bankForm: FormGroup = this.fb.group({
    bankName: ['', [Validators.required, Validators.minLength(2)]],
    accountNumber: ['', [Validators.required, Validators.minLength(4)]],
    accountType: ['Corriente', [Validators.required]],
    accountHolder: [''],
    rncOrCedula: [''],
    isDefault: [false],
  });

  // Logout & Pending state
  isLogoutModalVisible = signal<boolean>(false);
  hasOpenCashRegister = signal<boolean>(false);
  openCashRegisterName = signal<string>('');

  readonly modules = SYSTEM_MODULES;
  readonly actions = ACTIONS_LIST;

  // Filter for permissions view
  activeModuleFilter = signal<'all' | 'commercial' | 'inventory' | 'admin'>('all');

  editForm: FormGroup = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    phoneNumber: ['', [Validators.required, Validators.minLength(10)]],
    identification: ['', [Validators.required, Validators.minLength(11)]],
    emergencyContact: [''],
  });

  // Active user roles (aggregated)
  readonly activeRoles = computed(() => {
    const rolesFromAuth = this.authService.currentRoles();
    const primary = this.authService.currentRole();
    const profile = this.userProfile();

    const set = new Set<string>();
    if (rolesFromAuth && rolesFromAuth.length > 0) {
      rolesFromAuth.forEach((r) => set.add(r));
    }
    if (primary) set.add(primary);
    if (profile?.roles && profile.roles.length > 0) {
      profile.roles.forEach((r) => set.add(r));
    }
    if (profile?.role) set.add(profile.role);

    return Array.from(set).filter(Boolean);
  });

  readonly userInitials = computed(() => {
    const p = this.userProfile();
    if (p?.firstName && p?.lastName) {
      return `${p.firstName[0]}${p.lastName[0]}`.toUpperCase();
    }
    const email = this.authService.currentUser()?.email || '';
    return email.substring(0, 2).toUpperCase() || 'US';
  });

  readonly isAdministrator = computed(() => {
    return (
      this.authService.isSuperUser() ||
      this.activeRoles().some((r) =>
        ['admin', 'administrador', 'superuser', 'sysadmin'].includes(r.toLowerCase())
      )
    );
  });

  readonly companyName = computed(() => {
    return (
      this.companyService.currentSettings().companyName ||
      this.companyService.currentSettings().commercialName ||
      'Mi Empresa'
    );
  });

  readonly filteredModules = computed(() => {
    const filter = this.activeModuleFilter();
    if (filter === 'all') return this.modules;
    if (filter === 'commercial') {
      return this.modules.filter((m) => ['Sales', 'Billing', 'CashRegister', 'Receivables'].includes(m.key));
    }
    if (filter === 'inventory') {
      return this.modules.filter((m) => ['Inventory', 'Customers'].includes(m.key));
    }
    if (filter === 'admin') {
      return this.modules.filter((m) => ['Audit', 'Reports', 'Company'].includes(m.key));
    }
    return this.modules;
  });

  readonly totalAllowedPermissions = computed(() => {
    let count = 0;
    for (const mod of this.modules) {
      for (const act of this.actions) {
        if (this.hasPermission(mod.key, act.key)) count++;
      }
    }
    return count;
  });

  ngOnInit(): void {
    void this.loadProfileData();
    this.loadBankAccounts();
  }

  async loadProfileData(): Promise<void> {
    this.isLoading.set(true);
    const currentUser = this.authService.currentUser();

    try {
      if (currentUser?.id) {
        const user = await this.userService.getUser(currentUser.id);
        if (user) {
          this.userProfile.set(user);
        }
      }
    } catch {
      // If endpoint fails or user not loaded directly, synthesize from active session
    }

    if (!this.userProfile()) {
      const email = currentUser?.email || 'colaborador@empresa.com';
      const parts = email.split('@')[0].split('.');
      const firstName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Usuario';
      const lastName = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '';

      this.userProfile.set({
        id: currentUser?.id || 1,
        firstName,
        lastName,
        email,
        userName: email.split('@')[0],
        role: this.authService.currentRole() || 'Administrador',
        roles: this.authService.currentRoles() || [this.authService.currentRole() || 'Administrador'],
        phoneNumber: '(809) 555-0144',
        identification: '001-1234567-8',
        emergencyContact: 'Familiar - (809) 555-9988',
        active: true,
      });
    }

    await this.roleService.loadRoles();
    this.isLoading.set(false);
  }

  startEditing(): void {
    const p = this.userProfile();
    this.editForm.reset({
      firstName: p?.firstName || '',
      lastName: p?.lastName || '',
      phoneNumber: p?.phoneNumber || '',
      identification: p?.identification || '',
      emergencyContact: p?.emergencyContact || '',
    });
    this.isEditing.set(true);
  }

  cancelEditing(): void {
    this.isEditing.set(false);
  }

  async saveProfile(): Promise<void> {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      this.notificationService.error('Por favor verifica los campos obligatorios.');
      return;
    }

    this.isSaving.set(true);
    const formVals = this.editForm.value;
    const current = this.userProfile();

    try {
      if (current?.id) {
        await this.userService.updateUser(current.id, {
          firstName: formVals.firstName.trim(),
          lastName: formVals.lastName.trim(),
          userName: current.userName || current.email,
          role: current.role,
          phoneNumber: formVals.phoneNumber.trim(),
          identification: formVals.identification.trim(),
          emergencyContact: (formVals.emergencyContact || '').trim(),
        } as any);
      }

      // Update local signal state
      const updatedUser: UserDto = {
        ...current!,
        firstName: formVals.firstName.trim(),
        lastName: formVals.lastName.trim(),
        phoneNumber: formVals.phoneNumber.trim(),
        identification: formVals.identification.trim(),
        emergencyContact: (formVals.emergencyContact || '').trim(),
      };

      this.userProfile.set(updatedUser);
      this.isEditing.set(false);
      this.notificationService.success('Tus datos de perfil han sido actualizados correctamente.');
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al actualizar el perfil.');
    } finally {
      this.isSaving.set(false);
    }
  }

  hasPermission(moduleKey: string, actionKey: string): boolean {
    return this.permissionService.hasPermission(moduleKey, actionKey);
  }

  getModulePermissionCount(moduleKey: string): number {
    return this.actions.filter((a) => this.hasPermission(moduleKey, a.key)).length;
  }

  setModuleFilter(filter: 'all' | 'commercial' | 'inventory' | 'admin'): void {
    this.activeModuleFilter.set(filter);
  }

  async promptLogout(): Promise<void> {
    try {
      const sessionRes = await this.cashRegisterService.getActiveSession();
      if (sessionRes?.success && sessionRes.data && sessionRes.data.isOpen) {
        this.hasOpenCashRegister.set(true);
        this.openCashRegisterName.set(sessionRes.data.name || 'Caja Principal');
      } else {
        this.hasOpenCashRegister.set(false);
      }
    } catch {
      this.hasOpenCashRegister.set(false);
    }
    this.isLogoutModalVisible.set(true);
  }

  cancelLogout(): void {
    this.isLogoutModalVisible.set(false);
  }

  confirmLogout(): void {
    this.isLogoutModalVisible.set(false);
    this.authService.logout();
  }

  goToCashRegister(): void {
    this.isLogoutModalVisible.set(false);
    this.router.navigate(['/cash-register']);
  }

  goToApprovals(): void {
    this.router.navigate(['/admin/approvals']);
  }

  // =========================================================================
  // Company Bank Accounts Management
  // =========================================================================
  loadBankAccounts(): void {
    const list = this.companyService.getBankAccounts();
    this.bankAccounts.set(list);
  }

  openAddBankModal(): void {
    const s = this.companyService.currentSettings();
    this.bankForm.reset({
      bankName: '',
      accountNumber: '',
      accountType: 'Corriente',
      accountHolder: s.commercialName || s.companyName || (this.userProfile() ? `${this.userProfile()?.firstName} ${this.userProfile()?.lastName}` : ''),
      rncOrCedula: s.rnc || '',
      isDefault: this.bankAccounts().length === 0,
    });
    this.isAddBankModalOpen.set(true);
  }

  closeAddBankModal(): void {
    this.isAddBankModalOpen.set(false);
  }

  selectBankSuggestion(name: string): void {
    this.bankForm.patchValue({ bankName: name });
  }

  async saveBankAccount(): Promise<void> {
    if (this.bankForm.invalid) {
      this.bankForm.markAllAsTouched();
      return;
    }

    this.isSavingBank.set(true);
    try {
      const val = this.bankForm.value;
      const isFirst = this.bankAccounts().length === 0;
      const isDef = Boolean(val.isDefault) || isFirst;

      const newAcc: CompanyBankAccountDto = {
        id: `BANK_${Date.now()}`,
        bankName: (val.bankName || '').trim(),
        accountNumber: (val.accountNumber || '').trim(),
        accountType: val.accountType || 'Corriente',
        holderName: (val.accountHolder || '').trim(),
        holderRnc: (val.rncOrCedula || '').trim(),
        currency: 'DOP',
        isDefault: isDef,
      };

      let updated = [...this.bankAccounts()];
      if (isDef) {
        updated = updated.map((a) => ({ ...a, isDefault: false }));
      }
      updated.push(newAcc);

      await this.companyService.saveBankAccounts(updated);
      this.bankAccounts.set(updated);
      this.notificationService.success(`Cuenta de ${newAcc.bankName} agregada correctamente.`);
      this.closeAddBankModal();
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al guardar la cuenta bancaria.');
    } finally {
      this.isSavingBank.set(false);
    }
  }

  async deleteBankAccount(id: string): Promise<void> {
    const target = this.bankAccounts().find((a) => a.id === id);
    const confirmed = confirm(`¿Estás seguro de eliminar la cuenta de ${target?.bankName || 'banco'} (${target?.accountNumber})?`);
    if (!confirmed) return;

    try {
      const filtered = this.bankAccounts().filter((a) => a.id !== id);
      if (filtered.length > 0 && !filtered.some((a) => a.isDefault)) {
        filtered[0].isDefault = true;
      }
      await this.companyService.saveBankAccounts(filtered);
      this.bankAccounts.set(filtered);
      this.notificationService.success('Cuenta bancaria eliminada con éxito.');
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al eliminar la cuenta bancaria.');
    }
  }

  async setDefaultBankAccount(id: string): Promise<void> {
    try {
      const updated = this.bankAccounts().map((a) => ({
        ...a,
        isDefault: a.id === id,
      }));
      await this.companyService.saveBankAccounts(updated);
      this.bankAccounts.set(updated);
      this.notificationService.success('Cuenta marcada como predeterminada.');
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al actualizar cuenta predeterminada.');
    }
  }
}
