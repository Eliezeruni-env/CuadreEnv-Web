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
    'sales': ['sales', 'ventas', 'quick-sale', 'pos', 'prj-pos', 'prj_pos'],
    'mobile-pos': ['mobile-pos', 'mobilepos', 'mobile', 'pos-mobile'],
    'sales.corporate': ['sales.corporate', 'sales-corporate', 'corporate'],
    'sales.distribution': ['sales.distribution', 'sales-distribution', 'distribution'],
    'products.detail_sales': ['products.detail_sales', 'products-detail-sales', 'detail-sales', 'detail_sales', 'ventasfraccionadas', 'menudeo'],
    'cash-register': ['cash-register', 'cashregister', 'caja', 'prj-cuadre', 'cuadre'],
    'billing': ['billing', 'facturacion', 'prj-factura', 'factura'],
    'credit-notes': ['credit-notes', 'creditnotes', 'notas-de-credito'],
    'receivables': ['receivables', 'cobros'],
    'customers': ['customers', 'clientes', 'prj-crm', 'crm'],
    'products': ['products', 'productos', 'catalogo', 'prj-almacen', 'almacen'],
    'products-settings': ['products-settings', 'categories', 'category', 'configuracion-productos'],
    'inventory-stock': ['inventory-stock', 'stock', 'prj-almacen'],
    'inventory-entries': ['inventory-entries', 'entries'],
    'purchases': ['purchases', 'compras'],
    'purchases-orders': ['purchases-orders', 'orders'],
    'purchases-receipts': ['purchases-receipts', 'receipts'],
    'reports': ['reports', 'metricas', 'metrics', 'billing-reports-dgii'],
    'metrics': ['metrics', 'metricas', 'reports', 'billing-reports-dgii'],
    'billing-reports-dgii': ['billing-reports-dgii', 'reports', 'metricas', 'metrics'],
    'audit': ['audit', 'fraud-guardian'],
    'fraud-guardian': ['fraud-guardian', 'audit'],
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
    'admin-approvals': ['admin-approvals', 'aprobaciones'],
    // Funciones granulares de Caja / POS
    'pos-sound': ['pos-sound', 'pos_sound', 'sound'],
    'pos-autoprint': ['pos-autoprint', 'pos_autoprint', 'autoprint'],
    'pos-void-history': ['pos-void-history', 'pos_void_history', 'void-history'],
    'pos-ticket-config': ['pos-ticket-config', 'pos_ticket_config', 'ticket-config'],
    'pos-barcodes': ['pos-barcodes', 'pos_barcodes', 'barcodes'],
    'pos-compact-mode': ['pos-compact-mode', 'pos_compact_mode', 'compact-mode'],
    'pos-shortcuts': ['pos-shortcuts', 'pos_shortcuts', 'shortcuts'],
    'pos-calculator': ['pos-calculator', 'pos_calculator', 'calculator'],
    'pos-held-sales': ['pos-held-sales', 'pos_held_sales', 'held-sales', 'pos-hold-sale'],
    'pos-reprint': ['pos-reprint', 'pos_reprint', 'reprint'],
    'pos-open-drawer': ['pos-open-drawer', 'pos_open_drawer', 'open-drawer', 'drawer'],
    'pos-clear-cart': ['pos-clear-cart', 'pos_clear_cart', 'clear-cart'],
    'pos-configure-ncf': ['pos-configure-ncf', 'pos_configure_ncf', 'configure-ncf', 'ncf-step2'],
    // Preferencias de UI Global
    'system-language': ['system-language', 'system_language', 'language', 'idioma'],
    'system-theme': ['system-theme', 'system_theme', 'theme', 'dark-mode', 'color-mode']
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

    // 2. Si tiene comodín '*' o 'all', otorga acceso completo a todos los módulos.
    const hasWildcard = currentModules.includes('*') || currentModules.includes('all');
    if (hasWildcard) {
      return true;
    }

    // Dashboard está disponible si el usuario tiene al menos un módulo asignado
    if (targetCode === 'dashboard') {
      return currentModules.length > 0;
    }

    // 3. Coincidencia directa exacta
    if (currentModules.includes(targetCode)) {
      return true;
    }

    // 3.5 Soporte especial y retrocompatible para Terminal Móvil (mobile-pos)
    if (targetCode === 'mobile-pos' || targetCode === 'mobile' || targetCode === 'mobilepos' || targetCode === 'pos-mobile') {
      if (currentModules.includes('mobile-pos') || currentModules.includes('mobile') || currentModules.includes('mobilepos') || currentModules.includes('pos-mobile')) {
        return true;
      }
      if (currentModules.includes('no-mobile') || currentModules.includes('no-mobile-pos')) {
        return false;
      }
      const hasGranularPos = currentModules.some(m => m.startsWith('pos-') || m.startsWith('pos_'));
      if (hasGranularPos) {
        return false;
      }
      // Usuarios legacy en producción con permiso de ventas: acceden a mobile
      return this.hasModuleAccess('sales');
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

  /**
   * Verificación granular de funcionalidades o botones específicos.
   * Soporta fallback inteligente:
   * - Si el usuario tiene acceso total '*' o 'all', retorna true.
   * - Si el usuario tiene la clave exacta o un alias en allowedModules, retorna true.
   * - Si el usuario tiene configurada alguna regla granular de su familia (ej. 'pos-*' o 'system-*'),
   *   y esta opción NO está concedida, retorna false (desactivada explícitamente desde USM).
   * - Modo retrocompatible / legacy: Si no tiene ninguna bandera 'pos-*', hereda el acceso del módulo padre.
   */
  public hasFeature(featureCode: string, parentModule?: string): boolean {
    if (!featureCode?.trim()) return true;
    const target = featureCode.trim().toLowerCase();

    if (this.hasAllModulesSignal()) return true;

    const currentModules = this.allowedModulesSignal();
    if (!currentModules || currentModules.length === 0) return false;

    // 1. Verificación directa en el listado de módulos y alias granulares
    if (this.hasModuleAccess(target)) {
      return true;
    }

    // 2. Control de familia POS
    if (target.startsWith('pos-')) {
      const hasAnyPosConfigured = currentModules.some(m => m.startsWith('pos-') || m.startsWith('pos_'));
      if (hasAnyPosConfigured) {
        // El usuario ya tiene granularidad POS configurada y esta opción no está seleccionada en USM
        return false;
      }
      // Modo retrocompatible: hereda del módulo padre de ventas / caja
      return parentModule ? this.hasModuleAccess(parentModule) : this.hasModuleAccess('sales');
    }

    // 3. Control de familia de configuración del sistema (idioma / tema)
    if (target.startsWith('system-')) {
      const hasAnySystemConfigured = currentModules.some(m => m.startsWith('system-') || m.startsWith('system_'));
      if (hasAnySystemConfigured) {
        return false;
      }
      // Por defecto activado para no romper experiencia legacy si no fue restringido en USM
      return true;
    }

    return parentModule ? this.hasModuleAccess(parentModule) : true;
  }

  get modules(): string[] {
    return [...this.allowedModulesSignal()];
  }

  get hasAllModules(): boolean {
    return this.hasAllModulesSignal();
  }
}
