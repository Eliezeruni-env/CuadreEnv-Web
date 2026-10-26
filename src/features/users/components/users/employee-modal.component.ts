import { Component, Input, Output, EventEmitter, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { CompanyService } from '../../../companies/services/company.service';
import { PermissionService, SYSTEM_MODULES } from '../../../roles/services/permission.service';
import { RoleService } from '../../../roles/services/role.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { PhoneMaskDirective, CedulaMaskDirective } from '../../../../app/shared/directives';
import type { UserDto, RoleDto } from '../../../cuadreEnv/types/api';
import { parseUserModules, MENU_TO_CANONICAL } from '../../utils/module-parser.util';

@Component({
  selector: 'app-employee-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PhoneMaskDirective, CedulaMaskDirective],
  templateUrl: './employee-modal.component.html',
  styleUrls: ['./employee-modal.component.scss'],
})
export class EmployeeModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private permissionService = inject(PermissionService);
  private companyService = inject(CompanyService);
  private roleService = inject(RoleService);
  private notificationService = inject(NotificationService);
  readonly translationService = inject(TranslationService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  isLoading = signal<boolean>(false);
  editingUserId = signal<number | null>(null);
  readonly activeCompanyName = computed(() => this.companyService.currentSettings().companyName || 'Mi Empresa');

  // Available roles dynamically loaded from the active company
  readonly companyRoles = computed(() => {
    const list = this.roleService.roles();
    // Exclude SuperAdmin/SuperUser
    return list.filter((r) => !['superadmin', 'superuser'].includes(r.name.toLowerCase()));
  });

  selectedRoles = signal<string[]>(['Cajero']);
  readonly availableModules = SYSTEM_MODULES.map((module) => ({
    code: String(module.key).toLowerCase(),
    label: module.label,
    description: module.description,
  }));
  selectedModules = signal<string[]>([]);

  cvFileName = signal<string | null>(null);
  cvBase64 = signal<string | null>(null);
  idDocFileName = signal<string | null>(null);
  idDocBase64 = signal<string | null>(null);

  form: FormGroup = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    identification: ['', [Validators.required, Validators.minLength(11)]],
    phoneNumber: ['', [Validators.required, Validators.minLength(10)]],
    emergencyContact: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    void this.roleService.loadRoles();
  }

  toggleRole(roleName: string): void {
    const current = [...this.selectedRoles()];
    const idx = current.indexOf(roleName);
    if (idx >= 0) {
      if (current.length === 1) {
        this.notificationService.warning('El empleado debe tener al menos un rol asignado.');
        return;
      }
      current.splice(idx, 1);
    } else {
      current.push(roleName);
    }
    this.selectedRoles.set(current);
  }

  isRoleSelected(roleName: string): boolean {
    return this.selectedRoles().includes(roleName);
  }

  private readonly GRANULAR_STOCK_MODULES = ['purchases-receipts', 'inventory-entries'];

  toggleModule(moduleCode: string): void {
    const code = moduleCode.toLowerCase();
    const current = this.selectedModules();
    const isWildcard = current.includes('*') || current.includes('ALL') || current.includes('all');
    let updated: string[];

    if (this.GRANULAR_STOCK_MODULES.includes(code)) {
      const isAlreadySelected = current.some(m => m.toLowerCase() === code);
      if (isAlreadySelected) {
        updated = current.filter(m => m.toLowerCase() !== code && m !== '*' && m !== 'ALL' && m !== 'all');
      } else {
        updated = [...current.filter(m => m.toLowerCase() !== code), code];
      }
      this.selectedModules.set(updated);
      return;
    }

    if (isWildcard) {
      const allCodes = this.availableModules.map(m => m.code);
      updated = allCodes.filter(c => c !== code && c !== moduleCode);
    } else {
      const canonicalCode = MENU_TO_CANONICAL[code] || code;
      const isCurrentlySelected = current.includes(moduleCode) || current.includes(code) || current.includes(canonicalCode);
      if (isCurrentlySelected) {
        updated = current.filter(m => m !== moduleCode && m !== code && m !== canonicalCode);
      } else {
        updated = [...current, code];
      }
    }
    this.selectedModules.set(updated);
  }

  isModuleSelected(moduleCode: string): boolean {
    const selected = this.selectedModules();
    const code = moduleCode.toLowerCase();

    if (this.GRANULAR_STOCK_MODULES.includes(code)) {
      return selected.some(m => m.toLowerCase() === code || m === '*' || m.toUpperCase() === 'ALL');
    }

    if (selected.includes('*') || selected.includes('ALL') || selected.includes('all')) {
      return true;
    }
    const canonicalCode = MENU_TO_CANONICAL[code] || code;
    return selected.includes(moduleCode) || selected.includes(code) || selected.includes(canonicalCode);
  }

  open(user?: UserDto) {
    if (user && user.id) {
      this.editingUserId.set(user.id);
      this.form.reset({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        identification: user.identification || '',
        phoneNumber: user.phoneNumber || '',
        emergencyContact: user.emergencyContact || '',
        email: user.email || '',
        password: '',
      });
      if (user.roles && user.roles.length > 0) {
        this.selectedRoles.set([...user.roles]);
      } else if (user.role) {
        this.selectedRoles.set([user.role]);
      } else {
        this.selectedRoles.set(['Cajero']);
      }
      const parsedModules = parseUserModules(user);
      this.selectedModules.set(parsedModules);
      this.form.get('password')?.clearValidators();
      this.form.get('password')?.updateValueAndValidity();
    } else {
      this.editingUserId.set(null);
      this.form.reset({
        firstName: '',
        lastName: '',
        identification: '',
        phoneNumber: '',
        emergencyContact: '',
        email: '',
        password: '',
      });
      this.selectedRoles.set(['Cajero']);
      this.selectedModules.set([]);
      this.form.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
      this.form.get('password')?.updateValueAndValidity();
    }
    this.cvFileName.set(null);
    this.cvBase64.set(null);
    this.idDocFileName.set(null);
    this.idDocBase64.set(null);
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  onCvSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        this.notificationService.error('El archivo de CV no debe exceder 5 MB.');
        return;
      }
      this.cvFileName.set(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        this.cvBase64.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  onIdDocSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        this.notificationService.error('El archivo del documento de cédula no debe exceder 5 MB.');
        return;
      }
      this.idDocFileName.set(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        this.idDocBase64.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notificationService.error('Por favor complete todos los campos obligatorios del formulario.');
      return;
    }

    if (this.selectedRoles().length === 0) {
      this.notificationService.error('Debe seleccionar al menos un rol para el colaborador.');
      return;
    }

    this.isLoading.set(true);
    try {
      const rawPhone = (this.form.value.phoneNumber || '').trim();
      const rawCedula = (this.form.value.identification || '').trim();
      const email = (this.form.value.email || '').trim().toLowerCase();
      const primaryRole = this.selectedRoles()[0] || 'Cajero';
      const allRoles = this.selectedRoles();

      const editId = this.editingUserId();
      if (editId) {
        await this.userService.updateUser(editId, {
          email,
          firstName: (this.form.value.firstName || '').trim(),
          lastName: (this.form.value.lastName || '').trim(),
          userName: email,
          role: primaryRole,
          roles: allRoles,
          allowedModules: this.selectedModules(),
        } as any);

        if (await this.authService.refreshPermissionsForUser(editId)) {
          if (!this.authService.isAuthenticated()) {
            this.notificationService.error(
              'Los cambios se guardaron, pero no se pudieron actualizar los permisos de la sesión. Inicia sesión nuevamente.',
            );
            this.saved.emit();
            this.close();
            await this.router.navigate(['/login']);
            return;
          }

          if (!this.permissionService.hasModuleAccess(this.router.url)) {
            const defaultRoute = this.permissionService.getDefaultModuleRoute();
            await this.router.navigate([defaultRoute ?? '/forbidden']);
          }
        }
        this.notificationService.success('Empleado actualizado correctamente.');
      } else {
        const userPayload: UserDto = {
          firstName: (this.form.value.firstName || '').trim(),
          lastName: (this.form.value.lastName || '').trim(),
          userName: email,
          email: email,
          identification: rawCedula,
          phoneNumber: rawPhone,
          gender: 'M',
          role: primaryRole,
          roles: allRoles,
          allowedModules: this.selectedModules(),
          active: true,
          password: this.form.value.password,
          emergencyContact: (this.form.value.emergencyContact || '').trim() || undefined,
        };

        await this.userService.createUser(userPayload);
        this.notificationService.success(`Empleado registrado e incorporado a ${this.activeCompanyName()} correctamente.`);
      }
      this.saved.emit();
      this.close();
    } catch (e: any) {
      let msg = 'Error al registrar el usuario.';
      if (e?.error?.errors && typeof e.error.errors === 'object') {
        const entries = Object.values(e.error.errors).flat();
        if (entries.length > 0) {
          msg = entries.join(' · ');
        }
      } else if (e?.error?.message) {
        msg = e.error.message;
      } else if (e?.error?.title) {
        msg = e.error.title;
      } else if (e?.message) {
        msg = e.message;
      }
      this.notificationService.error(msg);
    } finally {
      this.isLoading.set(false);
    }
  }
}
