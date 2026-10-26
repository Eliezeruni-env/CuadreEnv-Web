import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoleService } from './role.service';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import { PermissionService } from './permission.service';

describe('RoleService', () => {
  let service: RoleService;
  let mockApi: any;
  let mockAuth: any;

  beforeEach(() => {
    mockApi = {
      get: vi.fn().mockRejectedValue(new Error('Endpoint not found')),
      post: vi.fn().mockRejectedValue(new Error('Endpoint not found')),
      put: vi.fn().mockRejectedValue(new Error('Endpoint not found')),
      delete: vi.fn().mockRejectedValue(new Error('Endpoint not found')),
    };

    mockAuth = {
      companyId: vi.fn().mockReturnValue(99),
      isSuperUser: vi.fn().mockReturnValue(false),
      isPlatformSuperUser: vi.fn().mockReturnValue(false),
      hasExplicitModuleClaims: vi.fn().mockReturnValue(false),
      allowedModules: vi.fn().mockReturnValue([]),
      userPermissions: vi.fn().mockReturnValue([]),
      currentRole: vi.fn().mockReturnValue('Admin'),
      currentRoles: vi.fn().mockReturnValue(['Admin']),
    };

    TestBed.configureTestingModule({
      providers: [
        RoleService,
        PermissionService,
        { provide: ApiClientService, useValue: mockApi },
        { provide: AuthService, useValue: mockAuth },
      ],
    });

    localStorage.clear();
    service = TestBed.inject(RoleService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with default system and company roles', async () => {
    const roles = await service.loadRoles();
    expect(roles.length).toBeGreaterThanOrEqual(4);
    expect(roles.some((r) => r.name === 'Administrador')).toBeTruthy();
    expect(roles.some((r) => r.name === 'Cajero')).toBeTruthy();
    expect(roles.some((r) => r.name === 'Vendedor')).toBeTruthy();
    expect(roles.some((r) => r.name === 'Auditor')).toBeTruthy();
  });

  it('uses only the backend roles collection route', async () => {
    mockApi.get.mockResolvedValueOnce([
      { id: 10, name: 'Operador', permissionIds: [] },
    ]);

    await service.loadRoles();

    expect(mockApi.get).toHaveBeenCalledWith('/roles');
    expect(mockApi.get).not.toHaveBeenCalledWith('/Role');
  });

  it('should create a custom role and update signals', async () => {
    const created = await service.createRole({
      name: 'Supervisor Especial',
      description: 'Rol para supervisores de turno',
      permissionIds: [1, 2, 3],
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Supervisor Especial');
    expect(created.isSystem).toBeFalsy();

    const currentRoles = service.roles();
    expect(currentRoles.some((r) => r.name === 'Supervisor Especial')).toBeTruthy();
  });

  it('should not allow deleting a system role', async () => {
    const roles = await service.loadRoles();
    const adminRole = roles.find((r) => r.name === 'Administrador')!;

    await expect(service.deleteRole(adminRole.id)).rejects.toThrow(
      'No es posible eliminar un rol predeterminado del sistema'
    );
  });

  it('should delete a custom role successfully', async () => {
    const created = await service.createRole({
      name: 'Temporal',
      description: 'Rol para eliminar',
      permissionIds: [1],
    });

    const deleted = await service.deleteRole(created.id);
    expect(deleted).toBeTruthy();

    const currentRoles = service.roles();
    expect(currentRoles.some((r) => r.id === created.id)).toBeFalsy();
  });
});
