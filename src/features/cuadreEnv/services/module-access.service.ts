import { Injectable, signal, computed } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModuleAccessService {
  private allowedModules: string[] = [];
  public allowedModulesSignal = signal<string[]>([]);
  public userRoleSignal = signal<string | null>(null);

  /**
   * Solo es acceso global total si tiene comodín '*' o 'all'.
   */
  public hasAllModulesSignal = computed(() => {
    const mods = this.allowedModulesSignal();
    return mods.includes('*') || mods.includes('all');
  });

  /**
   * Mapeo Canónico de Módulos y Submódulos según la especificación del SaaS & USM.
   */
  private readonly MODULE_MAP: Record<string, string[]> = {
    'dashboard': ['dashboard', 'inicio'],
    'sales': ['sales', 'ventas', 'quick-sale', 'pos', 'mobile-pos', 'mobilepos'],
    'sales.corporate': ['sales.corporate', 'sales-corporate', 'corporate'],
    'sales.distribution': ['sales.distribution', 'sales-distribution', 'distribution'],
    'products.detail_sales': ['products.detail_sales', 'products-detail-sales', 'detail-sales', 'detail_sales', 'ventasfraccionadas', 'menudeo'],
    'cash-register': ['cash-register', 'cashregister', 'caja'],
    'billing': ['billing', 'facturacion'],
    'credit-notes': ['credit-notes', 'creditnotes', 'notas-de-credito'],
    'receivables': ['receivables', 'cobros'],
    'customers': ['customers', 'clientes'],
    'products': ['products', 'productos', 'catalogo'],
    'products-settings': ['products-settings', 'categories', 'category', 'configuracion-productos'],
    'inventory-stock': ['inventory-stock', 'stock'],
    'inventory-entries': ['inventory-entries', 'entries'],
    'purchases': ['purchases', 'compras'],
    'purchases-orders': ['purchases-orders', 'orders'],
    'purchases-receipts': ['purchases-receipts', 'receipts'],
    'reports': ['reports', 'metricas', 'metrics', 'billing-reports-dgii'],
    'audit': ['audit', 'fraud-guardian'],
    'users': ['users', 'usuarios'],
    'admin-roles': ['admin-roles', 'roles'],
    'company-settings': ['company-settings', 'company', 'empresa']
  };

  /**
   * Módulos auxiliares granulares para operaciones específicas.
   */
  private readonly AUXILIARY_GRANULAR_MODULES: Record<string, string[]> = {
    'inventory-outlets': ['inventory-outlets', 'outlets', 'salidas'],
    'inventory-transfers': ['inventory-transfers', 'transfers', 'transferencias'],
    'inventory-warehouses': ['inventory-warehouses', 'warehouses', 'warehouse', 'almacenes'],
    'inventory-manage-requests': ['inventory-manage-requests', 'manage-requests', 'solicitudes'],
    'purchases-suppliers': ['purchases-suppliers', 'suppliers', 'proveedores'],
    'payments': ['payments', 'pagos'],
    'services': ['services', 'servicios'],
    'admin-roles-matrix': ['admin-roles-matrix', 'admin-roles', 'roles'],
    'admin-approvals': ['admin-approvals', 'aprobaciones']
  };

  constructor() {
    this.loadStoredModules();
  }

  /**
   * Normalización y lectura unificada de módulos permitidos desde objeto, token o array.
   */
  public setAllowedModules(modules: unknown, role?: string | null): void {
    let list: string[] = [];
    let detectedRole = role || null;

    if (typeof modules === 'string') {
      const trimmed = modules.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          list = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
        } catch {
          list = trimmed.includes(',') ? trimmed.split(',') : [trimmed];
        }
      }
    } else if (Array.isArray(modules)) {
      list = modules.map(String);
    } else if (modules && typeof modules === 'object') {
      const obj = modules as Record<string, unknown>;
      detectedRole = detectedRole || (obj['role'] as string) || (obj['Role'] as string) || null;
      const raw =
        obj['allowed_modules'] ??
        obj['allowedModules'] ??
        obj['AllowedModulesJson'] ??
        obj['allowedModulesJson'] ??
        obj['assignedModules'] ??
        obj['modules'] ??
        obj['Modules'] ??
        obj['module'];
      if (raw !== undefined && raw !== null) {
        return this.setAllowedModules(raw, detectedRole);
      }
    }

    if (detectedRole) {
      this.userRoleSignal.set(detectedRole.trim().toLowerCase());
    }

    this.allowedModules = list.map(m => m.trim()).filter(Boolean);
    const normalized = this.allowedModules.map(m => m.trim().toLowerCase());
    this.allowedModulesSignal.set(normalized);

    const hasAll = this.hasAllModulesSignal();

    try {
      if (typeof window !== 'undefined') {
        const jsonList = JSON.stringify(this.allowedModules);
        if (window.sessionStorage) {
          window.sessionStorage.setItem('allowedModules', jsonList);
          window.sessionStorage.setItem('hasAllModules', JSON.stringify(hasAll));
          if (detectedRole) {
            window.sessionStorage.setItem('user_role', detectedRole);
          }
        }
        if (window.localStorage) {
          window.localStorage.setItem('allowed_modules', jsonList);
          if (detectedRole) {
            window.localStorage.setItem('user_role', detectedRole);
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  public init(modules: unknown, role?: string | null): void {
    this.setAllowedModules(modules, role);
  }

  /**
   * Carga inicial desde localStorage/sessionStorage al inicializar.
   */
  public loadStoredModules(): void {
    try {
      if (typeof window !== 'undefined') {
        const storedRole = this.getStoredRole();
        if (storedRole) {
          this.userRoleSignal.set(storedRole.toLowerCase());
        }

        const stored =
          localStorage.getItem('allowed_modules') ||
          localStorage.getItem('allowedModules') ||
          sessionStorage.getItem('allowedModules');
        if (stored) {
          this.setAllowedModules(JSON.parse(stored), storedRole);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  public getStoredRole(): string {
    if (typeof window === 'undefined') return '';
    try {
      const stored = localStorage.getItem('user_role') || sessionStorage.getItem('user_role');
      if (stored) return stored.trim();

      const rawUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed?.role) return String(parsed.role).trim();
      }

      const token =
        localStorage.getItem('accessToken') ||
        sessionStorage.getItem('accessToken') ||
        localStorage.getItem('auth_token');
      if (token && token.includes('.')) {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          const role =
            payload?.role ||
            payload?.roles ||
            payload?.['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
          if (Array.isArray(role)) return (role[0] || '').trim();
          if (role) return String(role).trim();
        }
      }
    } catch {
      // Ignore
    }
    return '';
  }

  public getStoredIsSuperUser(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const rawUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed?.isSuperUser === true || parsed?.isSuperUser === 1 || String(parsed?.isSuperUser).toLowerCase() === 'true') {
          return true;
        }
      }
      const token =
        localStorage.getItem('accessToken') ||
        sessionStorage.getItem('accessToken') ||
        localStorage.getItem('auth_token');
      if (token && token.includes('.')) {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload?.isSuperUser === true || payload?.isSuperUser === 1 || String(payload?.isSuperUser).toLowerCase() === 'true' || payload?.IsSuperUser === true || payload?.IsSuperUser === 1) {
            return true;
          }
        }
      }
    } catch {
      // Ignore
    }
    return false;
  }


  /**
   * Método principal de verificación estricta de módulos.
   * Sin bypass por rol Admin: respeta taxativamente allowed_modules.
   */
  public hasModuleAccess(requiredModuleCode: string): boolean {
    if (!requiredModuleCode?.trim()) return false;
    const targetCode = requiredModuleCode.trim().toLowerCase();

    // Perfil del usuario siempre es accesible
    if (targetCode === 'profile') return true;

    const currentModules = this.allowedModulesSignal();

    // 1. Si allowed_modules está vacío ([]), ningún módulo debe verse (retornar false)
    if (!currentModules || currentModules.length === 0) {
      return false;
    }

    // Dashboard está disponible si el usuario tiene al menos un módulo asignado
    if (targetCode === 'dashboard') {
      return currentModules.length > 0;
    }

    // 2. Si tiene comodín '*' o 'all', otorga acceso completo a todos los módulos.
    // Solo si NO tiene una lista explícita de módulos (o contiene wildcard), un superadmin/superuser tiene bypass total.
    const hasWildcard = currentModules.includes('*') || currentModules.includes('all');
    if (hasWildcard) {
      return true;
    }

    // 3. Coincidencia directa exacta
    if (currentModules.includes(targetCode)) {
      return true;
    }

    // Acceso a contenedor padre de inventario o compras si tiene algún submódulo
    if (targetCode === 'inventory' || targetCode === 'inventario') {
      const inventoryCodes = ['inventory', 'inventario', 'inventory-stock', 'inventory-entries', 'inventory-outlets', 'inventory-transfers', 'inventory-warehouses', 'inventory-manage-requests', 'stock'];
      return currentModules.some(m => inventoryCodes.includes(m));
    }

    if (targetCode === 'purchases' || targetCode === 'compras') {
      const purchaseCodes = ['purchases', 'compras', 'purchases-orders', 'purchases-receipts', 'purchases-suppliers'];
      return currentModules.some(m => purchaseCodes.includes(m));
    }

    // 4. Mapeo Canónico de Módulos y Submódulos (MODULE_MAP)
    for (const [canonicalKey, aliases] of Object.entries(this.MODULE_MAP)) {
      const keyLower = canonicalKey.toLowerCase();
      const aliasesLower = aliases.map(a => a.toLowerCase());

      if (targetCode === keyLower || aliasesLower.includes(targetCode)) {
        const userHasAccess = currentModules.some(m => m === keyLower || aliasesLower.includes(m));
        if (userHasAccess) {
          return true;
        }
      }
    }

    // 5. Mapeo para submódulos auxiliares granulares
    for (const [canonicalKey, aliases] of Object.entries(this.AUXILIARY_GRANULAR_MODULES)) {
      const keyLower = canonicalKey.toLowerCase();
      const aliasesLower = aliases.map(a => a.toLowerCase());

      if (targetCode === keyLower || aliasesLower.includes(targetCode)) {
        const userHasAccess = currentModules.some(m => m === keyLower || aliasesLower.includes(m));
        if (userHasAccess) {
          return true;
        }
      }
    }

    return false;
  }

  public hasModule(moduleCode: string): boolean {
    return this.hasModuleAccess(moduleCode);
  }

  get modules(): string[] {
    return [...this.allowedModulesSignal()];
  }

  get hasAllModules(): boolean {
    return this.hasAllModulesSignal();
  }
}
