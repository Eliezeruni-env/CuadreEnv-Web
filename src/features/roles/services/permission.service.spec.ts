import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { PermissionService } from './permission.service';

describe('PermissionService module access', () => {
  let service: PermissionService;
  let allowedModules: string[];
  let licensedModules: string[] | null;
  let hasExplicitModuleClaims: boolean;
  let currentRole: string;

  beforeEach(() => {
    allowedModules = ['ventas', 'inventario', 'caja'];
    licensedModules = ['*'];
    hasExplicitModuleClaims = true;
    currentRole = 'Admin';

    TestBed.configureTestingModule({
      providers: [
        PermissionService,
        { provide: ApiClientService, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            isPlatformSuperUser: () => false,
            isSuperUser: () => currentRole === 'Admin',
            hasExplicitModuleClaims: () => hasExplicitModuleClaims,
            allowedModules: () => allowedModules,
            hasLicensedModule: (module: string) =>
              licensedModules !== null &&
              (licensedModules.includes('*') || licensedModules.includes(module)),
            hasAnyModuleAccess: () => {
              const currentLicenses = licensedModules;
              if (!currentLicenses?.length || !allowedModules.length) return false;
              if (allowedModules.includes('*') || currentLicenses.includes('*')) return true;
              return allowedModules.some((module) => currentLicenses.includes(module));
            },
            userPermissions: () => ['*'],
            currentRole: () => currentRole,
            currentRoles: () => [currentRole],
          },
        },
      ],
    });

    service = TestBed.inject(PermissionService);
  });

  it('allows only assigned modules, including Spanish module aliases', () => {
    expect(service.hasModuleAccess('/sales/quick')).toBe(true);
    expect(service.hasModuleAccess('/inventory/stock')).toBe(true);
    expect(service.hasModuleAccess('/cash-register')).toBe(true);
    expect(service.hasModuleAccess('/billing')).toBe(false);
    expect(service.hasModuleAccess('/admin/roles')).toBe(false);
  });

  it('uses an explicit moduleCode instead of inferring access from the link URL', () => {
    const items = [
      { name: 'Sales', url: '/sales', moduleCode: 'sales' },
      { name: 'Billing', url: '/sales', moduleCode: 'billing' },
    ];

    expect(service.filterNavigationItems(items).map((item) => item.name)).toEqual(['Sales']);
  });

  it('hides removed modules and denies direct navigation to their routes', () => {
    allowedModules = ['sales', 'customers'];
    const items = [
      { name: 'Sales', url: '/sales', moduleCode: 'sales' },
      { name: 'Billing', url: '/billing', moduleCode: 'billing' },
      { name: 'Customers', url: '/customers', moduleCode: 'customers' },
    ];

    expect(service.filterNavigationItems(items).map((item) => item.name)).toEqual([
      'Sales',
      'Customers',
    ]);
    expect(service.hasModuleAccess('/billing')).toBe(false);
    expect(service.hasModuleAccess('/sales')).toBe(true);
  });

  it('does not allow an Admin role to bypass an explicit module assignment', () => {
    expect(service.hasPermission('Billing', 'View')).toBe(false);
    expect(service.hasPermission('Sales', 'Delete')).toBe(true);
  });

  it('denies access when the token explicitly contains an empty module list', () => {
    allowedModules = [];

    expect(service.hasModuleAccess('/sales')).toBe(false);
    expect(service.hasPermission('Sales', 'View')).toBe(false);
    expect(service.getDefaultModuleRoute()).toBeNull();
  });

  it('treats only the explicit wildcard as global module access', () => {
    allowedModules = ['*'];

    expect(service.hasModuleAccess('/billing')).toBe(true);
    expect(service.hasModuleAccess('/admin/roles')).toBe(true);
    expect(service.getDefaultModuleRoute()).toBe('/dashboard');

    allowedModules = ['all'];
    expect(service.hasModuleAccess('/billing')).toBe(false);
  });

  it('intersects a wildcard user assignment with the company license', () => {
    allowedModules = ['*'];
    licensedModules = ['audit', 'company'];

    expect(service.hasModuleAccess('/cash-register/fraud-guardian')).toBe(true);
    expect(service.hasModuleAccess('/admin/roles')).toBe(true);
    expect(service.hasModuleAccess('/billing')).toBe(false);
    expect(service.getDefaultModuleRoute()).toBe('/dashboard');
  });

  it('hides every licensed feature when entitlement lookup returns no modules', () => {
    allowedModules = ['*'];
    licensedModules = [];

    expect(service.hasModuleAccess('/cash-register/fraud-guardian')).toBe(false);
    expect(service.hasModuleAccess('/admin/roles')).toBe(false);
    expect(service.getDefaultModuleRoute()).toBeNull();
  });

  it('uses the first assigned module as the default route', () => {
    expect(service.getDefaultModuleRoute()).toBe('/sales');
  });

  it('grants dashboard to every user with at least one assigned module', () => {
    allowedModules = ['purchases-suppliers'];

    expect(service.hasModuleAccess('/dashboard')).toBe(true);
    expect(service.hasModuleAccess('/purchases/suppliers')).toBe(true);
    expect(service.hasModuleAccess('/purchases')).toBe(false);
    expect(service.getDefaultModuleRoute()).toBe('/purchases/suppliers');
  });

  it('keeps canonical modules separate while normalizing the documented aliases', () => {
    allowedModules = ['billing-reports-dgii', 'fraud-guardian', 'mobile-pos'];

    expect(service.hasModuleAccess('/billing/reports')).toBe(true);
    expect(service.hasModuleAccess('/cash-register/fraud-guardian')).toBe(true);
    expect(service.hasModuleAccess('/mobile')).toBe(true);
    expect(service.hasModuleAccess('/billing')).toBe(false);
    expect(service.hasModuleAccess('/cash-register')).toBe(false);
    expect(service.hasModuleAccess('/sales')).toBe(true);
  });

  it('denies module access when no allowedModules list is present', () => {
    hasExplicitModuleClaims = false;
    allowedModules = [];

    expect(service.hasModuleAccess('/billing')).toBe(false);
    expect(service.hasModuleAccess('/dashboard')).toBe(false);
  });

  it('filters navigation links and removes empty section headings', () => {
    const items = [
      { title: true, name: 'Commercial' },
      { name: 'Sales', url: '/sales', moduleCode: 'sales' },
      { name: 'Billing', url: '/billing', moduleCode: 'billing' },
      { title: true, name: 'Inventory' },
      { name: 'Stock', url: '/inventory/stock', moduleCode: 'inventory' },
    ];

    expect(service.filterNavigationItems(items).map((item) => item.name)).toEqual([
      'Commercial',
      'Sales',
      'Inventory',
      'Stock',
    ]);
  });

  it('denies administrative modules to an Admin if stripped from allowedModules', () => {
    currentRole = 'Admin';
    allowedModules = ['sales', 'inventory', 'cashregister'];

    expect(service.hasModule('users')).toBe(false);
    expect(service.hasModule('admin-roles')).toBe(false);
    expect(service.hasModule('admin-roles-matrix')).toBe(false);
    expect(service.hasModule('admin-approvals')).toBe(false);
    expect(service.hasModule('company-settings')).toBe(false);
    expect(service.hasModule('profile')).toBe(false);

    expect(service.hasModuleAccess('/users')).toBe(false);
    expect(service.hasModuleAccess('/admin/roles')).toBe(false);
    expect(service.hasModuleAccess('/admin/roles/matrix')).toBe(false);
    expect(service.hasModuleAccess('/admin/approvals')).toBe(false);
    expect(service.hasModuleAccess('/company/settings')).toBe(false);
    expect(service.hasModuleAccess('/profile')).toBe(false);
  });

  it('allows administrative modules to an Admin only when explicitly included in allowedModules', () => {
    currentRole = 'Admin';
    allowedModules = ['sales', 'users', 'company-settings'];

    expect(service.hasModule('users')).toBe(true);
    expect(service.hasModule('company-settings')).toBe(true);
    expect(service.hasModule('admin-roles')).toBe(false);
    expect(service.hasModule('admin-approvals')).toBe(false);

    expect(service.hasModuleAccess('/users')).toBe(true);
    expect(service.hasModuleAccess('/company/settings')).toBe(true);
    expect(service.hasModuleAccess('/admin/roles')).toBe(false);
  });
});
