import { effect, Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import type { PermissionDto, RoleDto } from '../../cuadreEnv/types/api';

export interface ModuleDefinition {
  key: PermissionDto['module'];
  label: string;
  description: string;
  icon: string;
}

export const SYSTEM_MODULES: ModuleDefinition[] = [
  { key: 'Sales', label: 'Ventas & POS', description: 'Cotizaciones, órdenes de venta y comprobantes', icon: 'cil-cart' },
  { key: 'Billing', label: 'Facturación & NCF', description: 'Emisión de comprobantes fiscales y notas de crédito', icon: 'cil-notes' },
  { key: 'Inventory', label: 'Inventario & Almacenes', description: 'Control de existencias, entradas, salidas y depósitos', icon: 'cil-storage' },
  { key: 'CashRegister', label: 'Caja & Movimientos', description: 'Aperturas, arqueos, cierres y movimientos de efectivo', icon: 'cil-calculator' },
  { key: 'Receivables', label: 'Cuentas por Cobrar', description: 'Cobranzas, amortizaciones y estados de cuenta', icon: 'cil-dollar' },
  { key: 'Customers', label: 'Clientes & CRM', description: 'Directorio de clientes, límites de crédito y contactos', icon: 'cil-user' },
  { key: 'Purchases' as any, label: 'Compras & Proveedores', description: 'Órdenes de compra, recepciones y pagos a proveedores', icon: 'cil-truck' },
  { key: 'Audit', label: 'Auditoría & Trazabilidad', description: 'Bitácora de eventos, fraud guardian y aprobaciones', icon: 'cil-shield-alt' },
  { key: 'Reports', label: 'Reportes & Análisis', description: 'Métricas financieras, ventas y estadísticas operativas', icon: 'cil-chart-pie' },
  { key: 'Company', label: 'Administración de Empresa', description: 'Configuración fiscal, usuarios y roles del tenant', icon: 'cil-settings' },
];

export const ACTIONS_LIST: Array<{ key: PermissionDto['action']; label: string; badgeColor: string }> = [
  { key: 'View', label: 'Consultar (Ver)', badgeColor: 'info' },
  { key: 'Create', label: 'Crear', badgeColor: 'success' },
  { key: 'Edit', label: 'Modificar (Editar)', badgeColor: 'warning' },
  { key: 'Delete', label: 'Eliminar', badgeColor: 'danger' },
  { key: 'Approve', label: 'Aprobar', badgeColor: 'primary' },
  { key: 'Export', label: 'Exportar', badgeColor: 'secondary' },
];

@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  private api = inject(ApiClientService);
  private authService = inject(AuthService);

  private readonly _userRolesSubject = new BehaviorSubject<string[]>([]);
  readonly userRoles$: Observable<string[]> = this._userRolesSubject.asObservable();

  // Cached full catalog of system permissions
  readonly permissionsCatalog = signal<PermissionDto[]>(this.generateDefaultCatalog());

  // Active user's aggregated permission tokens: "module:action" (e.g. "sales:view", "inventory:create")
  readonly userPermissionTokens = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      this.authService.currentRole();
      this.authService.currentRoles();
      this.authService.isPlatformSuperUser();
      this.authService.hasExplicitModuleClaims();
      this.authService.allowedModules();
      this.authService.userPermissions();
      this.refreshUserPermissions();
    });
  }

  generateDefaultCatalog(): PermissionDto[] {
    let id = 1;
    const list: PermissionDto[] = [];
    for (const mod of SYSTEM_MODULES) {
      for (const act of ACTIONS_LIST) {
        list.push({
          id: id++,
          module: mod.key,
          action: act.key,
          description: `Permite ${act.label.toLowerCase()} en el módulo de ${mod.label}`,
        });
      }
    }
    return list;
  }

  async loadCatalog(): Promise<PermissionDto[]> {
    try {
      let res: any;
      try {
        res = await this.api.get<any, any>('/permissions');
      } catch {
        res = await this.api.get<any, any>('/Permission');
      }
      if (Array.isArray(res) && res.length > 0) {
        this.permissionsCatalog.set(res);
        return res;
      }
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        this.permissionsCatalog.set(res.data);
        return res.data;
      }
    } catch {
      // Graceful fallback to default full matrix
    }
    return this.permissionsCatalog();
  }

  refreshUserPermissions(customRoles?: RoleDto[]): void {
    const isSuper = this.authService.isPlatformSuperUser();
    const primaryRole = (this.authService.currentRole() || '').toLowerCase();
    const allRoles = (this.authService.currentRoles() || []).map((r) => r.toLowerCase());
    if (primaryRole && !allRoles.includes(primaryRole)) {
      allRoles.push(primaryRole);
    }

    this._userRolesSubject.next(allRoles);

    const tokens = new Set<string>();

    if (isSuper) {
      for (const mod of SYSTEM_MODULES) {
        for (const act of ACTIONS_LIST) {
          tokens.add(`${mod.key.toLowerCase()}:${act.key.toLowerCase()}`);
        }
      }
      this.userPermissionTokens.set(tokens);
      return;
    }

    // 1. Prioridad: Permisos y módulos asignados explícitamente desde USM en el JWT
    const jwtModules =
      typeof this.authService.allowedModules === 'function'
        ? this.authService.allowedModules() || []
        : [];
    const jwtPermissions =
      typeof this.authService.userPermissions === 'function'
        ? this.authService.userPermissions() || []
        : [];

    if (this.authService.hasExplicitModuleClaims()) {
      const allowedModuleCodes = new Set(jwtModules.map((module) => this.normalizeModuleCode(module)));
      const isAdmin = allRoles.some((role) =>
        ['admin', 'superuser', 'sysadmin', 'superadmin'].includes(role),
      );
      if (allowedModuleCodes.has('*')) {
        for (const mod of SYSTEM_MODULES) {
          allowedModuleCodes.add(this.normalizeModuleCode(mod.key));
          for (const action of ACTIONS_LIST) {
            tokens.add(`${this.normalizeModuleCode(mod.key)}:${action.key.toLowerCase()}`);
          }
        }
      }

      for (const mod of jwtModules) {
        const moduleCode = this.normalizeModuleCode(mod);
        const actions = isAdmin
          ? ACTIONS_LIST.map((action) => action.key.toLowerCase())
          : ['view', 'create', 'edit', 'export'];
        for (const action of actions) {
          tokens.add(`${moduleCode}:${action}`);
        }
      }

      for (const perm of jwtPermissions) {
        const p = perm.toLowerCase().trim();
        if (p.includes(':')) {
          const [module, action] = p.split(':', 2);
          const moduleCode = this.normalizeModuleCode(module);
          if (allowedModuleCodes.has(moduleCode)) {
            tokens.add(`${moduleCode}:${action}`);
          }
        } else if (allowedModuleCodes.has(this.normalizeModuleCode(p))) {
          const moduleCode = this.normalizeModuleCode(p);
          tokens.add(`${moduleCode}:view`);
          tokens.add(`${moduleCode}:create`);
        }
      }

      this.userPermissionTokens.set(tokens);
      return;
    }

    if (allRoles.some((r) => ['admin', 'superuser', 'sysadmin', 'superadmin'].includes(r))) {
      for (const mod of SYSTEM_MODULES) {
        for (const act of ACTIONS_LIST) {
          tokens.add(`${mod.key.toLowerCase()}:${act.key.toLowerCase()}`);
        }
      }
      this.userPermissionTokens.set(tokens);
      return;
    }

    if (jwtModules.length > 0 || jwtPermissions.length > 0) {
      for (const mod of jwtModules) {
        const moduleCode = this.normalizeModuleCode(mod);
        for (const action of ['view', 'create', 'edit', 'export']) {
          tokens.add(`${moduleCode}:${action}`);
        }
      }

      for (const perm of jwtPermissions) {
        const [rawModule, rawAction] = perm.toLowerCase().trim().split(':', 2);
        if (rawModule && rawAction) {
          tokens.add(`${this.normalizeModuleCode(rawModule)}:${rawAction}`);
        } else if (rawModule) {
          tokens.add(`${this.normalizeModuleCode(rawModule)}:view`);
          tokens.add(`${this.normalizeModuleCode(rawModule)}:create`);
        }
      }
      this.userPermissionTokens.set(tokens);
      return;
    }

    // 2. Roles personalizados recibidos por parámetro
    if (customRoles && customRoles.length > 0) {
      for (const r of customRoles) {
        if (allRoles.includes(r.name.toLowerCase()) && r.permissions) {
          for (const p of r.permissions) {
            tokens.add(`${p.module.toLowerCase()}:${p.action.toLowerCase()}`);
          }
        }
      }
    }

    // 3. Fallbacks para roles estándar del sistema si no provienen de USM
    for (const role of allRoles) {
      if (role === 'audit' || role === 'auditor') {
        for (const mod of SYSTEM_MODULES) {
          tokens.add(`${mod.key.toLowerCase()}:view`);
          tokens.add(`${mod.key.toLowerCase()}:edit`);
          tokens.add(`${mod.key.toLowerCase()}:export`);
        }
        tokens.add('audit:approve');
      } else if (role === 'vendedor' || role === 'seller') {
        tokens.add('sales:view');
        tokens.add('sales:create');
        tokens.add('inventory:view');
        tokens.add('customers:view');
        tokens.add('customers:create');
      } else if (role === 'cajero' || role === 'cashier') {
        tokens.add('sales:view');
        tokens.add('sales:create');
        tokens.add('cashregister:view');
        tokens.add('cashregister:create');
        tokens.add('billing:view');
        tokens.add('billing:create');
      } else if (role === 'supervisor') {
        for (const mod of ['sales', 'inventory', 'cashregister', 'customers', 'reports', 'purchases']) {
          tokens.add(`${mod}:view`);
          tokens.add(`${mod}:create`);
          tokens.add(`${mod}:edit`);
          tokens.add(`${mod}:export`);
        }
        tokens.add('cashregister:approve');
      } else {
        tokens.add('sales:view');
        tokens.add('inventory:view');
        tokens.add('customers:view');
      }
    }

    this.userPermissionTokens.set(tokens);
  }

  hasPermission(module: string, action: string): boolean {
    const isSuper = this.authService.isPlatformSuperUser();
    const primaryRole = (this.authService.currentRole() || '').toLowerCase();
    const allRoles = (this.authService.currentRoles() || []).map((r) => r.toLowerCase());

    const moduleCode = this.normalizeModuleCode(module);
    if (
      typeof this.authService.hasLicensedModule === 'function' &&
      !this.authService.hasLicensedModule(moduleCode)
    ) {
      return false;
    }
    const allowed = this.authService.allowedModules().map((item) => this.normalizeModuleCode(item));
    if (
      this.authService.hasExplicitModuleClaims() &&
      !allowed.includes('*') &&
      !allowed.includes(moduleCode)
    ) {
      return false;
    }
    if (isSuper) {
      return true;
    }

    if (
      primaryRole === 'admin' ||
      allRoles.some((r) => ['admin', 'superuser', 'sysadmin', 'superadmin'].includes(r))
    ) {
      return true;
    }

    const token = `${moduleCode}:${action.trim().toLowerCase()}`;
    return this.userPermissionTokens().has(token);
  }

  /**
   * Resuelve el módulo funcional correspondiente a una ruta de navegación.
   */
  resolveModuleFromRoute(path: string): string | null {
    const original = (path || '').trim();
    if (original && !original.startsWith('/')) {
      return this.normalizeModuleCode(original);
    }

    const p = this.cleanPath(path);
    if (!p) return null;
    if (p === '/dashboard' || p.startsWith('/dashboard/')) return 'dashboard';
    if (p.startsWith('/metrics')) return 'metrics';
    if (p.startsWith('/mobile')) return 'mobile-pos';
    if (p.startsWith('/sales')) return 'sales';
    if (p.startsWith('/services')) return 'services';
    if (p.startsWith('/billing/reports')) return 'reports';
    if (p.startsWith('/billing')) return 'billing';
    if (p.startsWith('/credit-notes')) return 'credit-notes';
    if (p.startsWith('/cash-register/fraud-guardian')) return 'audit';
    if (p.startsWith('/cash-register')) return 'cashregister';
    if (p.startsWith('/receivables')) return 'receivables';
    if (p.startsWith('/customers')) return 'customers';
    if (p.startsWith('/inventory/entries')) return 'inventory-entries';
    if (p.startsWith('/inventory/stock')) return 'inventory-stock';
    if (p.startsWith('/inventory/outlets')) return 'inventory-outlets';
    if (p.startsWith('/inventory/transfers')) return 'inventory-transfers';
    if (p.startsWith('/inventory/warehouses')) return 'inventory-warehouses';
    if (p.startsWith('/inventory/manage-requests')) return 'inventory-manage-requests';
    if (p.startsWith('/inventory')) return 'inventory';
    if (p.startsWith('/products/settings')) return 'products';
    if (p.startsWith('/products')) return 'products';
    if (p.startsWith('/purchases/suppliers') || p.startsWith('/suppliers')) return 'purchases-suppliers';
    if (p.startsWith('/purchases/receipts')) return 'purchases-receipts';
    if (p.startsWith('/purchases')) return 'purchases-orders';
    if (p.startsWith('/payments')) return 'payments';
    if (p.startsWith('/admin/approvals') || p.startsWith('/approvals')) return 'admin-approvals';
    if (p.startsWith('/admin/roles/matrix')) return 'admin-roles-matrix';
    if (p.startsWith('/admin/roles') || p.startsWith('/roles')) return 'admin-roles';
    if (p.startsWith('/company/settings') || p.startsWith('/companies/settings')) return 'company-settings';
    if (p.startsWith('/users')) return 'users';
    if (p.startsWith('/company')) return 'company';
    if (p.startsWith('/reports')) return 'reports';
    if (p.startsWith('/profile')) return 'profile';
    if (p.startsWith('/')) return null;
    return this.normalizeModuleCode(p);
  }

  filterNavigationItems<T extends {
    title?: boolean;
    url?: string | string[] | null;
    moduleCode?: string;
  }>(
    items: readonly T[],
  ): T[] {
    const visible = items.filter((item) => {
      if (item.title) return true;
      const url = Array.isArray(item.url) ? item.url.join('/') : item.url;
      const requiredModule = item.moduleCode || url;
      return !!requiredModule && this.hasModuleAccess(requiredModule);
    });

    return visible.filter((item, index) => {
      if (!item.title) return true;
      const following = visible.slice(index + 1);
      const nextTitle = following.findIndex((next) => next.title);
      return following.slice(0, nextTitle < 0 ? following.length : nextTitle).length > 0;
    });
  }

  getDefaultModuleRoute(): string | null {
    const moduleRoutes: Record<string, string> = {
      sales: '/sales',
      billing: '/billing',
      inventory: '/inventory',
      inventorystock: '/inventory/stock',
      'inventory-stock': '/inventory/stock',
      inventoryentries: '/inventory/entries',
      'inventory-entries': '/inventory/entries',
      inventorytransfers: '/inventory/transfers',
      'inventory-transfers': '/inventory/transfers',
      inventoryoutlets: '/inventory/outlets',
      'inventory-outlets': '/inventory/outlets',
      inventorywarehouses: '/inventory/warehouses',
      'inventory-warehouses': '/inventory/warehouses',
      inventorymanagerequests: '/inventory/manage-requests',
      'inventory-manage-requests': '/inventory/manage-requests',
      cashregister: '/cash-register',
      receivables: '/receivables',
      customers: '/customers',
      fraudguardian: '/cash-register/fraud-guardian',
      'fraud-guardian': '/cash-register/fraud-guardian',
      mobilepos: '/mobile',
      'mobile-pos': '/mobile',
      products: '/products',
      productssettings: '/products/settings',
      'products-settings': '/products/settings',
      metrics: '/metrics',
      purchasesorders: '/purchases',
      'purchases-orders': '/purchases',
      purchasessuppliers: '/purchases/suppliers',
      'purchases-suppliers': '/purchases/suppliers',
      purchasesreceipts: '/purchases/receipts',
      'purchases-receipts': '/purchases/receipts',
      payments: '/payments',
      creditnotes: '/credit-notes',
      'credit-notes': '/credit-notes',
      services: '/services',
      audit: '/cash-register/fraud-guardian',
      reports: '/dashboard',
      company: '/company/settings',
      'company-settings': '/company/settings',
      companysettings: '/company/settings',
      'admin-roles': '/admin/roles',
      adminroles: '/admin/roles',
      'admin-roles-matrix': '/admin/roles/matrix',
      adminrolesmatrix: '/admin/roles/matrix',
      'admin-approvals': '/admin/approvals',
      adminapprovals: '/admin/approvals',
      users: '/users',
      profile: '/profile',
      dashboard: '/dashboard',
    };
    const allowed = this.authService.allowedModules().map((module) => this.normalizeModuleCode(module));
    if (allowed.includes('*')) {
      return this.authService.hasAnyModuleAccess?.() === false ? null : '/dashboard';
    }
    return allowed
      .filter((module) =>
        typeof this.authService.hasLicensedModule !== 'function' ||
        this.authService.hasLicensedModule(module),
      )
      .map((module) => moduleRoutes[module])
      .find(Boolean) ?? null;
  }

  private cleanPath(path: string): string {
    const withoutQuery = (path || '').split(/[?#]/, 1)[0];
    const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
    return normalized.replace(/\/+$/, '').toLowerCase() || '/';
  }

  private normalizeModuleCode(value: string): string {
    const rawValue = value.trim().toLowerCase();
    if (rawValue === '*') return '*';

    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    const aliases: Record<string, string> = {
      cashregister: 'cashregister',

      // Submódulos granulares de inventario
      inventorystock: 'inventory-stock',
      stock: 'inventory-stock',
      inventoryentries: 'inventory-entries',
      entries: 'inventory-entries',
      inventoryoutlets: 'inventory-outlets',
      outlets: 'inventory-outlets',
      inventorytransfers: 'inventory-transfers',
      transfers: 'inventory-transfers',
      inventorywarehouses: 'inventory-warehouses',
      warehouses: 'inventory-warehouses',
      warehouse: 'inventory-warehouses',
      inventorymanagerequests: 'inventory-manage-requests',
      managerequests: 'inventory-manage-requests',
      inventario: 'inventory',
      inventory: 'inventory',

      // Submódulos granulares de compras
      purchasesorders: 'purchases-orders',
      orders: 'purchases-orders',
      ordenesdecompra: 'purchases-orders',
      purchasesreceipts: 'purchases-receipts',
      receipts: 'purchases-receipts',
      recepciones: 'purchases-receipts',
      purchasessuppliers: 'purchases-suppliers',
      suppliers: 'purchases-suppliers',
      proveedor: 'purchases-suppliers',
      proveedores: 'purchases-suppliers',
      purchases: 'purchases',
      compras: 'purchases',
      compra: 'purchases',

      // Otros submódulos independientes
      payments: 'payments',
      pagos: 'payments',
      services: 'services',
      servicios: 'services',
      creditnotes: 'credit-notes',
      mobilepos: 'mobile-pos',

      // Base
      billingreportsdgii: 'reports',
      fraudguardian: 'audit',
      adminroles: 'admin-roles',
      adminrolesmatrix: 'admin-roles-matrix',
      adminapprovals: 'admin-approvals',
      companysettings: 'company-settings',
      users: 'users',
      usuarios: 'users',
      roles: 'admin-roles',
      profile: 'profile',
      perfil: 'profile',
      venta: 'sales',
      ventas: 'sales',
      facturacion: 'billing',
      ncf: 'billing',
      almacen: 'inventory',
      almacenes: 'inventory',
      caja: 'cashregister',
      cash: 'cashregister',
      cobros: 'receivables',
      cuentasporcobrar: 'receivables',
      cliente: 'customers',
      clientes: 'customers',
      auditoria: 'audit',
      aprobaciones: 'audit',
      reporte: 'reports',
      reportes: 'reports',
      metricas: 'metrics',
      empresa: 'company',
      company: 'company',
      productos: 'products',
      products: 'products',
    };
    return aliases[normalized] ?? normalized;
  }

  /**
   * Valida acceso a un módulo específico por código granular.
   */
  hasModule(code: string): boolean {
    return this.hasModuleAccess(code);
  }

  /**
   * Determina si el usuario actual tiene acceso al módulo resuelto desde una ruta
   * o desde un código de módulo.
   */
  hasModuleAccess(urlOrModule: string): boolean {
    const original = (urlOrModule || '').trim();
    if (!original) return false;

    const isRoute = original.startsWith('/');
    const cleanPath = this.cleanPath(original);
    const requestedModule = isRoute ? null : this.normalizeModuleCode(original);

    if ((isRoute && cleanPath === '/dashboard') || requestedModule === 'dashboard') {
      if (typeof this.authService.hasAnyModuleAccess === 'function') {
        return this.authService.hasAnyModuleAccess();
      }
      const allowed = this.authService.allowedModules().map((module) => this.normalizeModuleCode(module));
      return allowed.includes('*') || allowed.some(Boolean);
    }

    const targetModule = isRoute ? this.resolveModuleFromRoute(cleanPath) : requestedModule;
    if (!targetModule) return false;

    const isLicensed =
      typeof this.authService.hasLicensedModule !== 'function' ||
      this.authService.hasLicensedModule(targetModule) ||
      (this.isAdminSubmodule(targetModule) && this.authService.hasLicensedModule('company'));

    if (!isLicensed) {
      return false;
    }

    if (typeof this.authService.hasModule === 'function') {
      return this.authService.hasModule(targetModule);
    }

    const isSuper = this.authService.isPlatformSuperUser();
    const allowed = this.authService.allowedModules().map((module) => this.normalizeModuleCode(module));
    if (isSuper || allowed.includes('*')) {
      return true;
    }

    const normalizedTarget = this.normalizeModuleCode(targetModule);
    if (allowed.includes(normalizedTarget)) {
      return true;
    }

    // Permitir consulta de stock si tiene el módulo padre de inventario
    if (normalizedTarget === 'inventory-stock' && allowed.some((m) => ['inventory', 'inventario'].includes(m))) {
      return true;
    }

    // Permitir mobile si tiene ventas o viceversa
    if (
      (normalizedTarget === 'mobile-pos' && allowed.some((m) => ['sales', 'ventas'].includes(m))) ||
      (normalizedTarget === 'sales' && allowed.some((m) => ['mobile-pos', 'mobile'].includes(m)))
    ) {
      return true;
    }

    return false;
  }

  private isAdminSubmodule(moduleCode: string): boolean {
    const code = this.normalizeModuleCode(moduleCode);
    return ['admin-roles', 'admin-roles-matrix', 'admin-approvals', 'company-settings', 'users', 'profile'].includes(code);
  }
}
