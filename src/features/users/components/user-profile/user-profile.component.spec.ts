import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserProfileComponent } from './user-profile.component';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { CompanyService } from '../../../companies/services/company.service';
import { UserService } from '../../services/user.service';
import { RoleService } from '../../../roles/services/role.service';
import { PermissionService } from '../../../roles/services/permission.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { ApprovalService } from '../../../approvals/services/approval.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';

describe('UserProfileComponent', () => {
  let fixture: ComponentFixture<UserProfileComponent>;
  let component: UserProfileComponent;
  let mockAuthService: any;
  let mockCompanyService: any;
  let mockCashRegisterService: any;

  beforeEach(async () => {
    mockAuthService = {
      currentUser: vi.fn().mockReturnValue({ id: 5, email: 'eliezersoto@empresa.com' }),
      currentRole: vi.fn().mockReturnValue('Cajero'),
      currentRoles: vi.fn().mockReturnValue(['Cajero', 'Vendedor']),
      companyId: vi.fn().mockReturnValue(42),
      isSuperUser: vi.fn().mockReturnValue(false),
      logout: vi.fn(),
    };

    mockCompanyService = {
      currentSettings: vi.fn().mockReturnValue({
        companyName: 'Farmacia & Retail CuadreEnv SRL',
        commercialName: 'Farmacia CuadreEnv',
        rnc: '1-31-99887-1',
        phone: '(809) 555-8899',
        address: 'Av. 27 de Febrero, Santo Domingo',
        currency: 'DOP',
      }),
      activeCompanyId: vi.fn().mockReturnValue(42),
    };

    mockCashRegisterService = {
      getActiveSession: vi.fn().mockResolvedValue({
        success: true,
        data: { id: 1, name: 'Caja Principal POS 01', isOpen: true },
      }),
    };

    const mockUserService = {
      getUser: vi.fn().mockResolvedValue({
        id: 5,
        firstName: 'Eliezer',
        lastName: 'Soto',
        email: 'eliezersoto@empresa.com',
        userName: 'esoto',
        role: 'Cajero',
        roles: ['Cajero', 'Vendedor'],
        phoneNumber: '(809) 555-9000',
        identification: '001-9876543-2',
        active: true,
      }),
      updateUser: vi.fn().mockResolvedValue(undefined),
    };

    const mockRoleService = {
      roles: vi.fn().mockReturnValue([
        { id: 1, name: 'Cajero', isSystem: false },
        { id: 2, name: 'Vendedor', isSystem: false },
      ]),
      loadRoles: vi.fn().mockResolvedValue([]),
    };

    const mockPermissionService = {
      hasPermission: vi.fn().mockReturnValue(true),
      permissionsCatalog: vi.fn().mockReturnValue([]),
    };

    const mockApprovalService = {
      pendingCount: vi.fn().mockReturnValue(0),
    };

    const mockNotificationService = {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [UserProfileComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: CompanyService, useValue: mockCompanyService },
        { provide: UserService, useValue: mockUserService },
        { provide: RoleService, useValue: mockRoleService },
        { provide: PermissionService, useValue: mockPermissionService },
        { provide: CashRegisterService, useValue: mockCashRegisterService },
        { provide: ApprovalService, useValue: mockApprovalService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
    await component.loadProfileData();
    fixture.detectChanges();
  });

  it('should render user profile and company info', () => {
    expect(component.companyName()).toBe('Farmacia & Retail CuadreEnv SRL');
    expect(component.userInitials()).toBe('ES');
    expect(component.activeRoles()).toContain('Cajero');
    expect(component.activeRoles()).toContain('Vendedor');
  });

  it('should detect open cash register and prompt warning modal on logout', async () => {
    await component.promptLogout();
    expect(component.isLogoutModalVisible()).toBe(true);
    expect(component.hasOpenCashRegister()).toBe(true);
    expect(component.openCashRegisterName()).toBe('Caja Principal POS 01');

    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Turno de Caja Abierto');
    expect(compiled.textContent).toContain('Ir al Cierre y Cuadre de Caja');
  });

  it('should allow editing and saving profile data', async () => {
    component.startEditing();
    expect(component.isEditing()).toBe(true);

    component.editForm.patchValue({
      firstName: 'Eliezer Actualizado',
      phoneNumber: '(809) 555-7777',
    });

    await component.saveProfile();
    expect(component.isEditing()).toBe(false);
    expect(component.userProfile()?.firstName).toBe('Eliezer Actualizado');
    expect(component.userProfile()?.phoneNumber).toBe('(809) 555-7777');
  });
});
