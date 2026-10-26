import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ModuleAccessService } from './module-access.service';
import {
  ApiClientService,
  setAccessToken,
  getAccessToken,
  setRefreshToken,
  getCompanyId,
  setCompanyId,
} from './apiClient';
import {
  formatAuditDate,
  getAuditStatus,
  resolveFormOperationMode,
  stripAuditFields,
} from '../utils/audit.util';
import { AuditableEntity } from '../types/api';

describe('CuadreEnv SaaS - Sesión, Permisos Granulares, Tenant y Auditoría', () => {
  let authService: AuthService;
  let moduleAccessService: ModuleAccessService;
  let mockRouter: any;
  let mockApiClient: any;

  function createFakeJwt(payload: Record<string, any>): string {
    const defaultPayload = {
      sub: '100',
      email: 'tester@cuadre.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    };
    const base64 = btoa(JSON.stringify(defaultPayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `header.${base64}.sig`;
  }

  beforeEach(() => {
    if (typeof window !== 'undefined') {
      if (window.sessionStorage) window.sessionStorage.clear();
      if (window.localStorage) window.localStorage.clear();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
    }
    setAccessToken(null);
    setRefreshToken(null);
    setCompanyId(null);

    mockRouter = {
      navigate: vi.fn(),
    };
    mockApiClient = {
      post: vi.fn(),
      postWithoutInterceptors: vi.fn(),
      get: vi.fn().mockResolvedValue({ assignedModules: [], licensedModules: ['*'] }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        ModuleAccessService,
        { provide: Router, useValue: mockRouter },
        { provide: ApiClientService, useValue: mockApiClient },
      ],
    });

    authService = TestBed.inject(AuthService);
    moduleAccessService = TestBed.inject(ModuleAccessService);
  });

  // 1. Preservación literal de módulos granulares
  it('1. Preserva literalmente los módulos granulares recibidos en los claims sin sustituirlos por aliases', () => {
    const granularList = [
      'inventory-entries',
      'inventory-stock',
      'inventory-outlets',
      'inventory-transfers',
      'purchases-receipts',
      'purchases-orders',
      'purchases-suppliers',
      'payments',
    ];

    const token = createFakeJwt({
      companyId: 55,
      allowedModules: granularList,
    });

    authService.applyTokenResponse({ accessToken: token });

    expect(authService.allowedModules()).toEqual(granularList);
    expect(authService.currentUser()?.allowedModules).toEqual(granularList);
    // Verificar que cada uno está accesible literalmente
    for (const mod of granularList) {
      expect(authService.hasModule(mod)).toBe(true);
      expect(moduleAccessService.hasModuleAccess(mod)).toBe(true);
    }
  });

  it('1b. Extrae módulos granulares desde los diferentes claims soportados (allowed_modules, modules, module)', () => {
    const tokenUnderscore = createFakeJwt({
      companyId: 20,
      allowed_modules: ['inventory-entries', 'payments'],
    });
    authService.applyTokenResponse({ accessToken: tokenUnderscore });
    expect(authService.allowedModules()).toEqual(['inventory-entries', 'payments']);

    const tokenModules = createFakeJwt({
      companyId: 20,
      modules: ['purchases-receipts', 'purchases-orders'],
    });
    authService.applyTokenResponse({ accessToken: tokenModules });
    expect(authService.allowedModules()).toEqual(['purchases-receipts', 'purchases-orders']);

    const tokenSingle = createFakeJwt({
      companyId: 20,
      module: ['inventory-stock'],
    });
    authService.applyTokenResponse({ accessToken: tokenSingle });
    expect(authService.allowedModules()).toEqual(['inventory-stock']);
  });

  // 2. Renovación de tokens sin perder CompanyId
  it('2. Renueva el token actualizando tokens y manteniendo CompanyId y módulos intactos', async () => {
    const initialToken = createFakeJwt({
      companyId: 77,
      allowedModules: ['inventory-entries', 'purchases-receipts'],
    });
    authService.applyTokenResponse({ accessToken: initialToken });
    setRefreshToken('refresh-token-valid');

    expect(authService.companyId()).toBe(77);
    expect(getCompanyId()).toBe('77');

    // Token renovado que no trae claim de companyId en su payload
    const renewedTokenNoComp = createFakeJwt({
      sub: '100',
      email: 'tester@cuadre.com',
    });

    mockApiClient.postWithoutInterceptors.mockResolvedValue({
      accessToken: renewedTokenNoComp,
      refreshToken: 'new-refresh-token',
    });
    mockApiClient.get.mockResolvedValue({
      allowedModules: ['inventory-entries', 'purchases-receipts'],
      licensedModules: ['*'],
    });

    await authService.refreshSession();

    expect(authService.companyId()).toBe(77);
    expect(getAccessToken()).toBe(renewedTokenNoComp);
    expect(authService.allowedModules()).toEqual(['inventory-entries', 'purchases-receipts']);
  });

  // 3. Ocultamiento de entradas de almacén sin inventory-entries
  it('3. Oculta y niega acceso a entradas de almacén si falta inventory-entries (tener inventory no lo habilita)', () => {
    const tokenWithoutEntries = createFakeJwt({
      companyId: 10,
      allowedModules: ['inventory', 'inventory-stock'], // Tiene inventory general, pero NO inventory-entries
    });
    authService.applyTokenResponse({ accessToken: tokenWithoutEntries });

    expect(authService.hasModule('inventory-entries')).toBe(false);
    expect(moduleAccessService.hasModuleAccess('inventory-entries')).toBe(false);
    // Pero sí tiene acceso a stock
    expect(authService.hasModule('inventory-stock')).toBe(true);
    expect(moduleAccessService.hasModuleAccess('inventory-stock')).toBe(true);
  });

  // 4. Ocultamiento de recepciones sin purchases-receipts
  it('4. Oculta y niega acceso a recepciones de compra si falta purchases-receipts (tener purchases no lo habilita)', () => {
    const tokenWithoutReceipts = createFakeJwt({
      companyId: 10,
      allowedModules: ['purchases', 'purchases-orders'], // Tiene purchases general, pero NO purchases-receipts
    });
    authService.applyTokenResponse({ accessToken: tokenWithoutReceipts });

    expect(authService.hasModule('purchases-receipts')).toBe(false);
    expect(moduleAccessService.hasModuleAccess('purchases-receipts')).toBe(false);
    // Pero sí tiene acceso a órdenes de compra
    expect(authService.hasModule('purchases-orders')).toBe(true);
    expect(moduleAccessService.hasModuleAccess('purchases-orders')).toBe(true);
  });

  // 5. Acceso con wildcard
  it('5. Concede acceso a todos los módulos cuando el usuario tiene comodín * o es SuperAdmin', () => {
    const superAdminToken = createFakeJwt({
      companyId: 1,
      isSuperUser: true,
      role: 'SuperAdmin',
      allowedModules: ['*'],
    });
    authService.applyTokenResponse({ accessToken: superAdminToken });

    expect(authService.hasModule('inventory-entries')).toBe(true);
    expect(authService.hasModule('purchases-receipts')).toBe(true);
    expect(authService.hasModule('custom-future-module')).toBe(true);
    expect(moduleAccessService.hasModuleAccess('inventory-entries')).toBe(true);
    expect(moduleAccessService.hasModuleAccess('purchases-receipts')).toBe(true);
  });

  // 6. Cierre del sidebar cuando falla la licencia
  it('6. Cierra el acceso de módulos y sidebar cuando falla la carga de licencias de empresa', async () => {
    const token = createFakeJwt({
      companyId: 88,
      allowedModules: ['sales', 'inventory-entries', 'purchases-receipts'],
    });
    authService.applyTokenResponse({ accessToken: token });

    expect(authService.hasModule('inventory-entries')).toBe(true);

    // Simular error al verificar licencias con la API
    mockApiClient.get.mockRejectedValue(new Error('500 License Service Unavailable'));

    const success = await authService.refreshModuleEntitlements(true);
    expect(success).toBe(false);

    // Las listas deben cerrarse completamente
    expect(authService.licensedModules()).toEqual([]);
    expect(authService.allowedModules()).toEqual([]);
    expect(moduleAccessService.allowedModulesSignal()).toEqual([]);
    expect(authService.hasModule('inventory-entries')).toBe(false);
    expect(authService.hasModule('purchases-receipts')).toBe(false);
    expect(authService.hasModule('sales')).toBe(false);
  });

  // 7. Visualización y comportamiento correcto de campos de auditoría
  it('7. Formatea fechas de auditoría en local, distingue estados (isDeleted, active) y modos de formulario', () => {
    const auditEntity: AuditableEntity = {
      creationDate: '2026-10-12T14:30:00.000Z',
      modificationDate: '2026-10-12T18:45:00.000Z',
      createBy: 'admin@cuadre.com',
      modifiedBy: 'supervisor@cuadre.com',
      active: true,
      isDeleted: false,
    };

    // Formato de fecha local
    const formattedCreation = formatAuditDate(auditEntity.creationDate);
    expect(formattedCreation).not.toBe('—');
    expect(formattedCreation.length).toBeGreaterThan(5);

    // Estado activo
    const activeStatus = getAuditStatus(auditEntity);
    expect(activeStatus.active).toBe(true);
    expect(activeStatus.isDeleted).toBe(false);
    expect(activeStatus.label).toContain('Habilitado');

    // Estado eliminado lógicamente
    const deletedEntity: AuditableEntity = { ...auditEntity, isDeleted: true };
    const deletedStatus = getAuditStatus(deletedEntity);
    expect(deletedStatus.isDeleted).toBe(true);
    expect(deletedStatus.label).toBe('Eliminado lógicamente');

    // Estado deshabilitado
    const disabledEntity: AuditableEntity = { ...auditEntity, active: false };
    const disabledStatus = getAuditStatus(disabledEntity);
    expect(disabledStatus.active).toBe(false);
    expect(disabledStatus.label).toBe('Deshabilitado');

    // Modos de formulario
    expect(resolveFormOperationMode(null, true)).toBe('creation');
    expect(resolveFormOperationMode(auditEntity, false)).toBe('edition');
    expect(resolveFormOperationMode(auditEntity, false, 'delete')).toBe('logical_deletion');
    expect(resolveFormOperationMode(deletedEntity, false, 'reactivate')).toBe('reactivation');

    // Strip de campos de auditoría de los formularios para que no se envíen como mutables
    const formPayload = {
      name: 'Almacén Secundario',
      code: 'ALM-02',
      creationDate: '2026-10-12T14:30:00.000Z',
      createBy: 'someone',
      modifiedBy: 'someone',
      isDeleted: false,
      active: true,
    };
    const cleanPayload = stripAuditFields(formPayload);
    expect(cleanPayload).toEqual({ name: 'Almacén Secundario', code: 'ALM-02' });
    expect((cleanPayload as any).creationDate).toBeUndefined();
    expect((cleanPayload as any).createBy).toBeUndefined();
  });

  // 8. Cambio de usuario sin fuga de CompanyId, módulos o permisos
  it('8. Aísla completamente el cambio de usuario sin fuga de CompanyId, módulos o permisos', () => {
    // Usuario A (Empresa 101)
    const userAToken = createFakeJwt({
      sub: '1',
      email: 'userA@empresa1.com',
      companyId: 101,
      allowedModules: ['inventory-entries', 'inventory-stock'],
      permissions: ['can_add_stock'],
    });
    authService.applyTokenResponse({ accessToken: userAToken });

    expect(authService.companyId()).toBe(101);
    expect(authService.allowedModules()).toContain('inventory-entries');
    expect(authService.hasPermission('can_add_stock')).toBe(true);

    // Logout
    authService.logout();

    expect(authService.currentUser()).toBeNull();
    expect(authService.companyId()).toBeNull();
    expect(getCompanyId()).toBeNull();
    expect(authService.allowedModules()).toEqual([]);
    expect(authService.userPermissions()).toEqual([]);
    expect(moduleAccessService.allowedModulesSignal()).toEqual([]);

    // Usuario B (Empresa 202)
    const userBToken = createFakeJwt({
      sub: '2',
      email: 'userB@empresa2.com',
      companyId: 202,
      allowedModules: ['purchases-receipts'],
      permissions: ['can_receive_po'],
    });
    authService.applyTokenResponse({ accessToken: userBToken });

    // Verificar que Usuario B NO hereda absolutamente nada de Usuario A
    expect(authService.companyId()).toBe(202);
    expect(getCompanyId()).toBe('202');
    expect(authService.allowedModules()).toEqual(['purchases-receipts']);
    expect(authService.hasModule('inventory-entries')).toBe(false);
    expect(authService.hasPermission('can_add_stock')).toBe(false);
    expect(authService.hasPermission('can_receive_po')).toBe(true);
  });

  // 9. No agregar módulos por defecto para usuarios normales
  it('9. No asigna módulos por defecto a usuarios normales si el JWT no trae módulos', () => {
    const tokenEmpty = createFakeJwt({
      companyId: 50,
      allowedModules: [],
    });
    authService.applyTokenResponse({ accessToken: tokenEmpty });

    expect(authService.allowedModules()).toEqual([]);
    expect(authService.hasModule('inventory-entries')).toBe(false);
    expect(authService.hasModule('purchases-receipts')).toBe(false);
    expect(authService.hasModule('sales')).toBe(false);
  });
});
