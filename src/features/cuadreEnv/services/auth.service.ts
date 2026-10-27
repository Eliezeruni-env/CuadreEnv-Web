import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpBackend, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  ApiClientService,
  doLogin,
  doRefresh,
  logout as clientLogout,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setCompanyId,
  isRememberMe,
  setRememberMe,
  purgeTenantStorage,
  resolveApiUrl,
  generateCorrelationId,
  unwrap,
  doForgotPassword,
  doResetPassword,
} from './apiClient';
import type {
  LoginRequestDto,
  RegisterRequestDto,
  TokenResponseDto,
  UserResponseDto,
  UserCompanyDto,
  ApiResponse,
} from '../types/api';
import { API_CONSTANTS } from '../../../app/constants';
import { NotificationService } from './notification.service';
import { SessionInvalidationService } from './session-invalidation.service';
import { ModuleAccessService } from './module-access.service';

interface DecodedToken {
  email?: string;
  Email?: string;
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'?: string;
  sub?: string; // userId
  id?: string | number;
  userId?: string | number;
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'?: string;
  name?: string;
  fullName?: string;
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'?: string;
  role?: string;
  roles?: string[] | string;
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'?:
    | string
    | string[];
  companyId?: string | number;
  CompanyId?: string | number;
  company_id?: string | number;
  tenantId?: string | number;
  TenantId?: string | number;
  tenant_id?: string | number;
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/groupsid'?:
    | string
    | number;
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/sid'?: string | number;
  isSuperUser?: boolean | string;
  IsSuperUser?: boolean | string;
  is_superuser?: boolean | string;
  exp?: number;
  permissions?: string[] | string;
  Permissions?: string[] | string;
  permission?: string[] | string;
  modules?: string[] | string;
  Modules?: string[] | string;
  module?: string[] | string;
  Module?: string[] | string;
  allowed_modules?: string[] | string;
  allowedModules?: string[] | string;
  AllowedModules?: string[] | string;
  AllowedModulesJson?: string[] | string;
  allowedModulesJson?: string[] | string;
  userCompanies?: UserCompanyDto[] | string;
  companies?: UserCompanyDto[] | string;
  isImpersonated?: boolean;
  impersonatedBy?: any;
  [key: string]: any;
}

interface AuthenticatedUser {
  email: string;
  id: number;
  fullName?: string;
  allowedModules: string[];
}

interface LoginResponseUser extends Record<string, unknown> {
  allowedModules?: unknown;
  AllowedModules?: unknown;
  allowedModulesJson?: unknown;
  AllowedModulesJson?: unknown;
  modules?: unknown;
  Modules?: unknown;
  module?: unknown;
  Module?: unknown;
  companyId?: unknown;
  CompanyId?: unknown;
  userCompanies?: unknown;
  companies?: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiClientService);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly sessionInvalidation = inject(SessionInvalidationService);
  public readonly moduleAccessService = inject(ModuleAccessService);
  private readonly httpBackend = inject(HttpBackend, { optional: true });
  private readonly directHttp = this.httpBackend
    ? new HttpClient(this.httpBackend)
    : null;
  private moduleEntitlementRefresh: Promise<boolean> | null = null;
  private moduleRefreshInterval: number | null = null;
  private entitlementErrorNotified = false;

  currentUser = signal<AuthenticatedUser | null>(null);
  currentRole = signal<string | null>(null);
  currentRoles = computed<string[]>(() => {
    const r = this.currentRole();
    return r ? [r] : [];
  });
  companyId = signal<number | null>(this.getInitialCompanyId());
  currentCompanyId = computed<number | null>(() => this.companyId());
  userCompanies = signal<UserCompanyDto[]>(this.getStoredUserCompanies());
  activeCompany = computed<UserCompanyDto | null>(() => {
    const id = this.companyId();
    if (!id) return null;
    return this.userCompanies().find((c) => c.id === id) || null;
  });
  userPermissions = signal<string[]>([]);
  allowedModules = signal<string[]>([]);
  licensedModules = signal<string[] | null>(null);
  hasAllModules = computed(() => this.allowedModules().includes('*'));
  hasExplicitModuleClaims = signal(false);
  isPlatformSuperUser = signal(false);
  isSuperAdmin = computed<boolean>(() => this.isPlatformSuperUser());
  isImpersonated = signal<boolean>(false);
  impersonatedBy = signal<{ id?: any; email?: string; name?: string } | null>(
    null,
  );
  isAuthenticated = signal<boolean>(false);
  isInitializing = signal<boolean>(true);

  private getInitialCompanyId(): number | null {
    if (typeof window === 'undefined') return null;
    try {
      const stored =
        window.sessionStorage?.getItem('currentCompanyId') ||
        window.sessionStorage?.getItem('auth_company_id') ||
        window.sessionStorage?.getItem('companyId') ||
        (isRememberMe()
          ? window.localStorage?.getItem('currentCompanyId') ||
            window.localStorage?.getItem('auth_company_id') ||
            window.localStorage?.getItem('companyId')
          : null);
      if (
        stored &&
        stored !== 'null' &&
        stored !== 'undefined' &&
        stored !== '0'
      ) {
        const parsed = parseInt(stored, 10);
        return !isNaN(parsed) && parsed > 0 ? parsed : null;
      }
    } catch {}
    return null;
  }

  private getStoredUserCompanies(): UserCompanyDto[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw =
        window.sessionStorage?.getItem('userCompanies') ||
        (isRememberMe() ? window.localStorage?.getItem('userCompanies') : null);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }

  constructor() {
    this.sessionInvalidation.invalidated$.subscribe(() => this.clearSession());
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.refreshModulesWhenActive);
      document.addEventListener(
        'visibilitychange',
        this.refreshModulesWhenActive,
      );
      this.moduleRefreshInterval = window.setInterval(
        this.refreshModulesInBackground,
        30_000,
      );
    }
    this.initializeSession();
  }

  private readonly refreshModulesWhenActive = () => {
    if (
      this.isAuthenticated() &&
      (document.visibilityState === 'visible' ||
        document.visibilityState === undefined)
    ) {
      void this.refreshModuleEntitlements(true);
    }
  };

  private readonly refreshModulesInBackground = () => {
    if (this.isAuthenticated() && document.visibilityState === 'visible') {
      void this.refreshModuleEntitlements(true);
    }
  };

  private async initializeSession() {
    if (typeof window !== 'undefined' && window.location?.search) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const impersonateToken = urlParams.get('impersonate_token');
        if (impersonateToken) {
          const returnUrl =
            urlParams.get('return_url') ||
            (window.location.hostname === 'localhost'
              ? 'http://localhost:5173'
              : 'https://usm.cuadreenv.com');
          localStorage.setItem('cuadre_impersonation_return_url', returnUrl);
          setAccessToken(impersonateToken);
          urlParams.delete('impersonate_token');
          urlParams.delete('return_url');
          const cleanSearch = urlParams.toString();
          const cleanUrl =
            window.location.pathname +
            (cleanSearch ? '?' + cleanSearch : '') +
            window.location.hash;
          window.history.replaceState({}, '', cleanUrl);
          this.notificationService.info(
            'Sesión de soporte e impersonación activada.',
          );
        }
      } catch {
        // ignore
      }
    }

    const at = getAccessToken();
    let hasValidAccessToken = false;
    let decodedPayload: DecodedToken | null = null;

    if (at) {
      decodedPayload = this.decodeJwt(at);
      if (decodedPayload) {
        // Aplicar datos del token decodificado para mantener estado inmediato
        this.applyDecodedToken(decodedPayload);
        const isNotExpired =
          !decodedPayload.exp || decodedPayload.exp * 1000 > Date.now();
        hasValidAccessToken = isNotExpired && this.isAuthenticated();
      }
    }

    const rt = getRefreshToken();
    if (rt) {
      try {
        const tokens = await doRefresh(this.api);
        if (tokens?.accessToken) {
          this.handleTokenResponse(tokens, false);
          hasValidAccessToken = true;
        }
      } catch (error: any) {
        const status = error?.status ?? error?.statusCode ?? 0;
        const isNetworkOrOffline =
          (typeof navigator !== 'undefined' && !navigator.onLine) ||
          status === 0 ||
          error?.message?.includes('Network') ||
          error?.message?.includes('Failed to fetch');

        // Si es falla de red / offline o el token aún es válido, NUNCA cerrar sesión automáticamente
        if (
          isNetworkOrOffline ||
          (hasValidAccessToken && this.isAuthenticated())
        ) {
          console.warn(
            '[AuthService] No se pudo renovar con el servidor (sin conexión o error transitorio); conservando sesión local persistente.',
            error,
          );
        } else if (status === 401 || status === 403) {
          // El servidor revocó explícitamente el refresh token
          console.warn(
            '[AuthService] El token de renovación fue revocado o expiró en el servidor.',
          );
          this.clearSession();
        }
      }
    } else if (!hasValidAccessToken) {
      // Solo limpiar si no hay refreshToken y el accessToken ya venció o no existe
      this.clearSession();
    }

    if (this.isAuthenticated()) {
      if (this.userCompanies().length === 0) {
        await this.loadUserCompanies();
      }
      await this.refreshModuleEntitlements();
    }

    this.isInitializing.set(false);
  }

  private decodeJwt(token: string): DecodedToken | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  private applyDecodedToken(
    decoded: DecodedToken,
    responseUser?: Record<string, unknown>,
    rawTokensResponse?: any,
    preservePreviousModules = false,
  ) {
    const email =
      decoded.email ||
      decoded.Email ||
      decoded[
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
      ] ||
      decoded.sub ||
      '';
    const rawId =
      decoded.sub ||
      decoded.id ||
      decoded.userId ||
      decoded[
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'
      ] ||
      '0';
    const id = parseInt(rawId.toString(), 10) || 0;
    const fullName =
      decoded.name ||
      decoded.fullName ||
      decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'];

    let rawRole =
      decoded.role ||
      decoded.roles ||
      decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      'User';

    if (Array.isArray(rawRole)) {
      rawRole = rawRole[0] || 'User';
    }

    // 1. Extraer userCompanies vinculadas al usuario
    const rawUserCompanies =
      rawTokensResponse?.userCompanies ||
      rawTokensResponse?.companies ||
      rawTokensResponse?.data?.userCompanies ||
      responseUser?.['userCompanies'] ||
      responseUser?.['companies'] ||
      decoded?.userCompanies ||
      decoded?.companies;

    if (Array.isArray(rawUserCompanies) && rawUserCompanies.length > 0) {
      const parsedCompanies: UserCompanyDto[] = rawUserCompanies
        .map((c: any) => ({
          id: Number(c.id ?? c.companyId ?? c.CompanyId ?? 0),
          name: String(c.name ?? c.companyName ?? c.CompanyName ?? ''),
          commercialName: c.commercialName ?? c.CommercialName ?? undefined,
          rnc: c.rnc ?? c.Rnc ?? undefined,
          role: c.role ?? c.Role ?? undefined,
          plan: c.plan ?? c.Plan ?? undefined,
          isDefault: Boolean(c.isDefault ?? c.IsDefault ?? false),
        }))
        .filter((c) => c.id > 0);

      if (parsedCompanies.length > 0) {
        this.userCompanies.set(parsedCompanies);
        if (typeof window !== 'undefined') {
          try {
            window.sessionStorage?.setItem(
              'userCompanies',
              JSON.stringify(parsedCompanies),
            );
            if (isRememberMe()) {
              window.localStorage?.setItem(
                'userCompanies',
                JSON.stringify(parsedCompanies),
              );
            } else {
              window.localStorage?.removeItem('userCompanies');
            }
          } catch {}
        }
      }
    }

    // 2. Extraer y determinar claim companyId asegurando que nunca opere con null o 0
    const rawCompanyId =
      decoded.companyId ??
      decoded.CompanyId ??
      decoded.company_id ??
      decoded.tenantId ??
      decoded.TenantId ??
      decoded.tenant_id ??
      rawTokensResponse?.companyId ??
      rawTokensResponse?.CompanyId ??
      rawTokensResponse?.data?.companyId ??
      decoded[
        'http://schemas.microsoft.com/ws/2008/06/identity/claims/groupsid'
      ] ??
      decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/sid'];

    let compId: number | null = null;
    if (rawCompanyId !== undefined && rawCompanyId !== null) {
      const parsed = parseInt(rawCompanyId.toString(), 10);
      compId = !isNaN(parsed) && parsed > 0 ? parsed : null;
    }

    // Si no vino claim válido en token, consultar almacenamiento local o sesión previa activa
    if (compId === null || compId <= 0) {
      const storedCompId = this.getInitialCompanyId();
      if (storedCompId && storedCompId > 0) {
        compId = storedCompId;
      }
    }

    // Si sigue sin definirse pero hay empresas vinculadas, asignar la empresa por defecto o la primera
    if ((compId === null || compId <= 0) && this.userCompanies().length > 0) {
      const defaultCompany =
        this.userCompanies().find((c) => c.isDefault) ||
        this.userCompanies()[0];
      if (defaultCompany?.id) {
        compId = defaultCompany.id;
      }
    }

    const previousCompId = this.companyId();
    if (
      (compId === null || compId <= 0) &&
      previousCompId &&
      previousCompId > 0 &&
      this.isAuthenticated()
    ) {
      compId = previousCompId;
    }

    const responseModuleKey = responseUser
      ? ([
          'allowedModules',
          'allowed_modules',
          'modules',
          'module',
          'AllowedModules',
          'Modules',
          'Module',
          'allowedModulesJson',
          'AllowedModulesJson',
        ].find((key) =>
          Object.prototype.hasOwnProperty.call(responseUser, key),
        ) ?? null)
      : null;
    const responseHasAllowedModules = responseModuleKey !== null;
    const rawResponseModules = responseModuleKey
      ? responseUser?.[responseModuleKey]
      : undefined;
    const parsedResponseModules = this.parseStringList(rawResponseModules);

    this.currentRole.set(rawRole);
    this.companyId.set(compId);
    if (compId && compId > 0) {
      setCompanyId(compId);
    }
    this.hasExplicitModuleClaims.set(
      responseHasAllowedModules ||
        [
          'modules',
          'Modules',
          'module',
          'Module',
          'allowed_modules',
          'allowedModules',
          'AllowedModulesJson',
          'allowedModulesJson',
        ].some(
          (claim) =>
            Object.prototype.hasOwnProperty.call(decoded, claim) &&
            decoded[claim] !== null,
        ),
    );
    const rawSuperUser =
      decoded.isSuperUser ?? decoded.IsSuperUser ?? decoded.is_superuser;
    this.isPlatformSuperUser.set(
      rawSuperUser === true ||
        (typeof rawSuperUser === 'string' &&
          rawSuperUser.toLowerCase() === 'true'),
    );

    // Extraer permisos asignados desde el JWT emitido por USM/Backend
    const rawPermissions =
      decoded.permissions ??
      decoded.Permissions ??
      decoded.permission ??
      decoded[
        'http://schemas.microsoft.com/ws/2008/06/identity/claims/userdata'
      ] ??
      [];
    const parsedPermissions = this.parseStringList(rawPermissions);

    // Extraer módulos permitidos definidos para este rol en USM conservando valores literales
    const rawModules =
      decoded.allowedModules ??
      decoded.allowed_modules ??
      decoded.modules ??
      decoded.module ??
      decoded['AllowedModules'] ??
      decoded.Modules ??
      decoded.Module ??
      decoded.AllowedModulesJson ??
      decoded.allowedModulesJson ??
      [];
    const parsedModules = responseHasAllowedModules
      ? parsedResponseModules
      : this.parseStringList(rawModules);
    let literalModules = [
      ...new Set(parsedModules.map((m) => String(m).trim()).filter(Boolean)),
    ];

    if (literalModules.length === 0) {
      if (preservePreviousModules && this.allowedModules().length > 0) {
        literalModules = this.allowedModules();
      } else {
        this.clearSession();
        return;
      }
    }

    this.userPermissions.set(parsedPermissions);
    this.allowedModules.set(literalModules);
    const currentUserObj = {
      email,
      id,
      fullName,
      allowedModules: literalModules,
    };
    this.currentUser.set(currentUserObj);
    const isImpersonated = Boolean(
      decoded.isImpersonated || (rawTokensResponse as any)?.['isImpersonated'],
    );
    this.isImpersonated.set(isImpersonated);
    const impBy =
      decoded.impersonatedBy || (rawTokensResponse as any)?.['impersonatedBy'] || null;
    this.impersonatedBy.set(impBy);
    this.isAuthenticated.set(true);

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('currentUser', JSON.stringify(currentUserObj));
        localStorage.setItem('currentUser', JSON.stringify(currentUserObj));
      } catch {}
      if (window.sessionStorage) {
        sessionStorage.setItem(
          'allowedModules',
          JSON.stringify(literalModules),
        );
        sessionStorage.setItem(
          'hasAllModules',
          JSON.stringify(this.hasAllModules()),
        );
      }
      if (window.localStorage) {
        if (isRememberMe()) {
          localStorage.setItem('allowed_modules', JSON.stringify(literalModules));
          localStorage.setItem(
            'hasAllModules',
            JSON.stringify(this.hasAllModules()),
          );
        } else {
          localStorage.removeItem('allowed_modules');
          localStorage.removeItem('allowedModules');
          localStorage.removeItem('hasAllModules');
        }
      }
    }

    this.moduleAccessService.init(literalModules, rawRole);

    if (typeof window !== 'undefined') {
      if (compId && compId > 0) {
        window.sessionStorage?.setItem('companyId', String(compId));
        window.sessionStorage?.setItem('currentCompanyId', String(compId));
        window.sessionStorage?.setItem('auth_company_id', String(compId));
        if (isRememberMe()) {
          window.localStorage?.setItem(
            API_CONSTANTS.COMPANY_ID_KEY,
            String(compId),
          );
          window.localStorage?.setItem('companyId', String(compId));
          window.localStorage?.setItem('currentCompanyId', String(compId));
          window.localStorage?.setItem('auth_company_id', String(compId));
        } else {
          window.localStorage?.removeItem(API_CONSTANTS.COMPANY_ID_KEY);
          window.localStorage?.removeItem('companyId');
          window.localStorage?.removeItem('currentCompanyId');
          window.localStorage?.removeItem('auth_company_id');
        }
      } else {
        window.localStorage?.removeItem(API_CONSTANTS.COMPANY_ID_KEY);
        window.localStorage?.removeItem('companyId');
        window.localStorage?.removeItem('currentCompanyId');
        window.localStorage?.removeItem('auth_company_id');
        window.sessionStorage?.removeItem('companyId');
        window.sessionStorage?.removeItem('currentCompanyId');
        window.sessionStorage?.removeItem('auth_company_id');
      }
    }
  }

  private parseStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (typeof value !== 'string' || !value.trim()) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map(String)
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // Claims are also emitted as comma-separated strings by the API.
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeModuleList(modules: readonly string[]): string[] {
    return [
      ...new Set(
        modules
          .map((module) => this.normalizeModuleCode(module))
          .filter(Boolean),
      ),
    ];
  }

  private normalizeModuleCode(moduleCode: string): string {
    const compact = moduleCode
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9*]/g, '');
    const aliases: Record<string, string> = {
      '*': '*',
      sale: 'sales',
      ventas: 'sales',
      venta: 'sales',
      cash: 'cashregister',
      cashregister: 'cashregister',
      cashregisters: 'cashregister',
      caja: 'cashregister',

      // Submódulos granulares de inventario (NO colapsar a 'inventory')
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
      // Módulo padre general de inventario
      inventory: 'inventory',
      inventario: 'inventory',

      // Submódulos granulares de compras (NO colapsar a 'purchases')
      purchasesorders: 'purchases-orders',
      orders: 'purchases-orders',
      ordenesdecompra: 'purchases-orders',
      purchasesreceipts: 'purchases-receipts',
      receipts: 'purchases-receipts',
      recepciones: 'purchases-receipts',
      recepcion: 'purchases-receipts',
      purchasessuppliers: 'purchases-suppliers',
      suppliers: 'purchases-suppliers',
      proveedor: 'purchases-suppliers',
      proveedores: 'purchases-suppliers',
      // Módulo padre general de compras
      purchases: 'purchases',
      purchase: 'purchases',
      compras: 'purchases',
      compra: 'purchases',

      // Módulos independientes adicionales
      payments: 'payments',
      pagos: 'payments',
      pago: 'payments',
      services: 'services',
      servicios: 'services',
      servicio: 'services',
      creditnotes: 'credit-notes',
      notasdecredito: 'credit-notes',
      notadecredito: 'credit-notes',
      mobilepos: 'mobile-pos',

      // Catálogo de productos
      products: 'products',
      productos: 'products',
      producto: 'products',

      // Módulos base
      billing: 'billing',
      billingreportsdgii: 'reports',
      facturacion: 'billing',
      customers: 'customers',
      customer: 'customers',
      clientes: 'customers',
      cliente: 'customers',
      receivables: 'receivables',
      cobros: 'receivables',
      cuentasporcobrar: 'receivables',
      reports: 'reports',
      reporte: 'reports',
      reportes: 'reports',
      metricas: 'metrics',
      metrics: 'metrics',
      fraudguardian: 'audit',
      auditoria: 'audit',
      aprobaciones: 'audit',
      audit: 'audit',
      adminroles: 'admin-roles',
      adminrolesmatrix: 'admin-roles-matrix',
      adminapprovals: 'admin-approvals',
      companysettings: 'company-settings',
      users: 'users',
      usuarios: 'users',
      roles: 'admin-roles',
      profile: 'profile',
      perfil: 'profile',
      company: 'company',
      empresa: 'company',

      // Venta fraccionada / menudeo y submódulos de ventas y productos
      productsdetailsales: 'products.detail_sales',
      productsdetailsale: 'products.detail_sales',
      detailsales: 'products.detail_sales',
      detailsale: 'products.detail_sales',
      ventasfraccionadas: 'products.detail_sales',
      ventafraccionada: 'products.detail_sales',
      menudeo: 'products.detail_sales',
      fraccionada: 'products.detail_sales',
      salescorporate: 'sales.corporate',
      corporate: 'sales.corporate',
      ventascorporativas: 'sales.corporate',
      salesdistribution: 'sales.distribution',
      distribution: 'sales.distribution',
      rutasdedistribucion: 'sales.distribution',
      productssettings: 'products-settings',
      configuracionproductos: 'products-settings',
    };
    return aliases[compact] ?? compact;
  }

  isModuleLicensed(moduleCode: string, licensed: string[]): boolean {
    if (!licensed || !licensed.length) return false;
    if (licensed.includes('*')) return true;

    const normTarget = this.normalizeModuleCode(moduleCode);
    const licensedNorm = licensed.map((m) => this.normalizeModuleCode(m));
    if (licensedNorm.includes(normTarget)) return true;

    // Paquetes comerciales y jerarquías de módulos:
    if (licensedNorm.includes('company')) {
      if (
        [
          'admin-roles',
          'admin-roles-matrix',
          'company-settings',
          'users',
          'roles',
          'company',
        ].includes(normTarget)
      ) {
        return true;
      }
    }

    if (licensedNorm.includes('audit')) {
      if (
        ['audit', 'fraud-guardian', 'admin-approvals'].includes(normTarget)
      ) {
        return true;
      }
    }

    if (licensedNorm.includes('sales')) {
      if (
        [
          'sales',
          'quick-sale',
          'pos',
          'mobile-pos',
          'sales.corporate',
          'sales.distribution',
          'products.detail_sales',
          'products',
          'products-settings',
          'credit-notes',
        ].includes(normTarget)
      ) {
        return true;
      }
    }

    if (licensedNorm.includes('inventory')) {
      if (
        normTarget.startsWith('inventory-') ||
        ['inventory', 'stock'].includes(normTarget)
      ) {
        return true;
      }
    }

    if (licensedNorm.includes('purchases')) {
      if (
        normTarget.startsWith('purchases-') ||
        ['purchases', 'payments'].includes(normTarget)
      ) {
        return true;
      }
    }

    if (licensedNorm.includes('products')) {
      if (
        [
          'products',
          'products-settings',
          'products.detail_sales',
        ].includes(normTarget)
      ) {
        return true;
      }
    }

    return false;
  }

  hasModule(moduleCode: string): boolean {
    if (!moduleCode?.trim()) return false;

    // Si tiene comodín explícito '*', o es superusuario de plataforma sin lista restrictiva
    const assigned = this.allowedModules();
    const hasWildcard = assigned.includes('*') || assigned.includes('all');
    if (!hasWildcard && assigned.length > 0) {
      // Si el usuario tiene una lista taxativa de módulos asignados desde el USM, se respeta estrictamente
      return this.moduleAccessService.hasModuleAccess(moduleCode);
    }

    if (this.isSuperUser() || this.isPlatformSuperUser()) return true;

    const licensed = this.licensedModules();
    if (licensed !== null && licensed.length === 0) return false;

    // 1. Verificar si el módulo está licenciado para la empresa
    if (licensed !== null && !licensed.includes('*')) {
      if (!this.isModuleLicensed(moduleCode, licensed)) {
        return false;
      }
    } else if (licensed === null && hasWildcard) {
      // Si las licencias de la empresa aún no han cargado y el usuario tiene comodín '*',
      // no abrir acceso general hasta confirmar contra /auth/me/modules
      return false;
    }

    // 2. Si el usuario tiene asignado '*', tiene acceso a los módulos licenciados por la empresa
    if (hasWildcard) {
      return true;
    }

    // 3. De lo contrario, verificar autorización explícita / granular
    return this.moduleAccessService.hasModuleAccess(moduleCode);
  }

  hasModuleAccess(requiredModule: string): boolean {
    return this.hasModule(requiredModule);
  }

  hasPermission(permission: string): boolean {
    const perms = this.userPermissions().map((p) => p.toLowerCase());
    return perms.includes('*') || perms.includes(permission.toLowerCase());
  }

  hasLicensedModule(moduleCode: string): boolean {
    if (!moduleCode?.trim()) return false;
    if (this.normalizeModuleCode(moduleCode) === 'inventory-warehouses')
      return true;
    const licensed = this.licensedModules();
    if (licensed === null) return false;
    return this.isModuleLicensed(moduleCode, licensed);
  }

  hasAnyModuleAccess(): boolean {
    const licensed = this.licensedModules();
    if (licensed === null) return false;
    if (licensed.length === 0) return false;
    const assignedModules = this.allowedModules();
    if (!assignedModules.length) return false;
    if (assignedModules.includes('*') || licensed.includes('*')) return true;
    return assignedModules.some((module) => this.isModuleLicensed(module, licensed));
  }

  refreshModuleEntitlements(silent = false): Promise<boolean> {
    if (this.moduleEntitlementRefresh) return this.moduleEntitlementRefresh;

    const wrappedRefresh = this.loadModuleEntitlements(silent).finally(() => {
      this.moduleEntitlementRefresh = null;
    });
    this.moduleEntitlementRefresh = wrappedRefresh;
    return wrappedRefresh;
  }

  fetchEffectiveModules(): Observable<string[]> {
    return from(this.loadModuleEntitlements(true)).pipe(
      map(() => this.moduleAccessService.allowedModulesSignal()),
      catchError(() => of(this.moduleAccessService.allowedModulesSignal())),
    );
  }

  private async loadModuleEntitlements(silent: boolean): Promise<boolean> {
    try {
      let payload: any = null;
      try {
        const response = await this.api.get<any, any>('/auth/me/modules');
        payload = response?.data ?? response?.Data ?? response;
      } catch {
        try {
          const response = await this.api.get<any, any>('/api/users/login-sync');
          payload = response?.data ?? response?.Data ?? response;
        } catch {
          const response = await this.api.get<any, any>('/v1/auth/me');
          payload = response?.data ?? response?.Data ?? response;
        }
      }

      const rawAssignedModules =
        payload?.allowed_modules ??
        payload?.allowedModules ??
        payload?.AllowedModulesJson ??
        payload?.allowedModulesJson ??
        payload?.assignedModules ??
        payload?.AssignedModules ??
        payload?.modules ??
        payload?.Modules ??
        payload?.module ??
        payload?.user?.allowed_modules ??
        payload?.user?.allowedModules ??
        payload?.user?.AllowedModulesJson;

      const rawLicensedModules = payload?.licensedModules ??
        payload?.LicensedModules ?? ['*'];

      if (rawAssignedModules === undefined || rawAssignedModules === null) {
        throw new Error(
          'La API no devolvió los módulos asignados actuales del usuario.',
        );
      }

      const assignedModules = [
        ...new Set(
          this.parseStringList(rawAssignedModules)
            .map((m) => m.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      let licensedModules = [
        ...new Set(
          this.parseStringList(rawLicensedModules)
            .map((m) => m.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];

      // Si la API no especificó licencias para la empresa o vino vacío, no bloquear las asignaciones del usuario
      if (licensedModules.length === 0) {
        licensedModules = ['*'];
      }

      this.allowedModules.set(assignedModules);
      this.licensedModules.set(licensedModules);
      this.hasExplicitModuleClaims.set(true);
      this.currentUser.update((user) =>
        user ? { ...user, allowedModules: assignedModules } : user,
      );

      const currentRole = this.currentRole();
      this.moduleAccessService.setAllowedModules(assignedModules, currentRole);

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('allowedModules', JSON.stringify(assignedModules));
        sessionStorage.setItem(
          'hasAllModules',
          JSON.stringify(assignedModules.includes('*')),
        );
        if (isRememberMe()) {
          localStorage.setItem('allowed_modules', JSON.stringify(assignedModules));
        } else {
          localStorage.removeItem('allowed_modules');
        }
      }
      this.entitlementErrorNotified = false;
      return true;
    } catch (error) {
      this.licensedModules.set([]);
      this.allowedModules.set([]);
      this.moduleAccessService.setAllowedModules([]);
      this.currentUser.update((user) =>
        user ? { ...user, allowedModules: [] } : user,
      );
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('allowedModules', JSON.stringify([]));
        sessionStorage.setItem('hasAllModules', JSON.stringify(false));
      }
      return false;
    }
  }

  private handleTokenResponse(tokens: any, preservePreviousModules = true) {
    const rawToken =
      tokens?.accessToken ||
      tokens?.AccessToken ||
      tokens?.token ||
      tokens?.Token ||
      tokens?.data?.accessToken ||
      tokens?.data?.AccessToken ||
      tokens?.data?.token;

    if (rawToken) {
      const decoded = this.decodeJwt(rawToken);
      if (decoded) {
        const previousModules = this.allowedModules();
        const hadExplicitModuleClaims = this.hasExplicitModuleClaims();
        const previousCompId = this.companyId();
        const responseUser =
          tokens?.user ??
          tokens?.User ??
          tokens?.data?.user ??
          tokens?.data?.User;
        this.licensedModules.set(null);
        this.applyDecodedToken(
          decoded,
          responseUser && typeof responseUser === 'object'
            ? (responseUser as LoginResponseUser)
            : undefined,
          tokens,
          preservePreviousModules,
        );
        if (
          preservePreviousModules &&
          !this.hasExplicitModuleClaims() &&
          hadExplicitModuleClaims &&
          previousModules.length > 0
        ) {
          this.allowedModules.set(previousModules);
          this.currentUser.update((user) =>
            user ? { ...user, allowedModules: previousModules } : user,
          );
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.setItem(
              'allowedModules',
              JSON.stringify(previousModules),
            );
            sessionStorage.setItem(
              'hasAllModules',
              JSON.stringify(previousModules.includes('*')),
            );
          }
          this.moduleAccessService.init(previousModules);
          this.hasExplicitModuleClaims.set(true);
        }
        // Siempre mantener CompanyId si la renovación no incluye claim de compañía
        if (
          (!this.companyId() || this.companyId()! <= 0) &&
          previousCompId &&
          previousCompId > 0
        ) {
          this.companyId.set(previousCompId);
          setCompanyId(previousCompId);
        }
      }
    }
  }

  async login(credentials: LoginRequestDto) {
    // Asegurar que el login no dependa de un token previo ni de un tenant previo
    this.clearSession();
    purgeTenantStorage();
    setRememberMe(!!credentials.rememberMe);
    const tokens = await doLogin(
      this.api,
      credentials.email,
      credentials.password,
      credentials.deviceId || undefined,
    );
    const loginUser =
      (tokens as any)?.user ||
      (tokens as any)?.User ||
      (tokens as any)?.data?.user;
    if (loginUser) {
      const userModules = loginUser.allowedModules || loginUser.modules || [];
      const parsedUserModules = [
        ...new Set(
          this.parseStringList(userModules)
            .map((m) => m.trim())
            .filter(Boolean),
        ),
      ];
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem(
          'allowedModules',
          JSON.stringify(parsedUserModules),
        );
        sessionStorage.setItem(
          'hasAllModules',
          JSON.stringify(parsedUserModules.includes('*')),
        );
      }
      this.moduleAccessService.init(parsedUserModules);
    }
    this.handleTokenResponse(tokens);
    await this.refreshModuleEntitlements();
    return tokens;
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message: string; data?: any }> {
    return doForgotPassword(this.api, email);
  }

  async resetPassword(payload: { email: string; token: string; newPassword: string }): Promise<{ success: boolean; message: string; data?: any }> {
    return doResetPassword(this.api, payload);
  }

  applyTokenResponse(tokens: any) {
    const rawToken =
      tokens?.accessToken ||
      tokens?.AccessToken ||
      tokens?.token ||
      tokens?.data?.accessToken ||
      tokens?.data?.token;
    const rawRefresh =
      tokens?.refreshToken ||
      tokens?.RefreshToken ||
      tokens?.data?.refreshToken;

    if (rawToken) setAccessToken(rawToken);
    if (rawRefresh) setRefreshToken(rawRefresh);
    this.handleTokenResponse(tokens);
  }

  async refreshSession(): Promise<void> {
    try {
      const currentRefresh = getRefreshToken();
      const currentAccess = getAccessToken();
      if (!currentRefresh) {
        throw new Error('No hay un token de renovación disponible.');
      }

      const res: any = this.api?.postWithoutInterceptors
        ? await this.api.postWithoutInterceptors<any, any>('/auth/refresh', {
            refreshToken: currentRefresh,
            accessToken: currentAccess,
          })
        : this.directHttp
          ? await firstValueFrom(
              this.directHttp.post<any>(
                resolveApiUrl('/auth/refresh'),
                {
                  refreshToken: currentRefresh,
                  accessToken: currentAccess,
                },
                {
                  headers: new HttpHeaders({
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-Correlation-ID': generateCorrelationId(),
                  }),
                  withCredentials: true,
                },
              ),
            )
          : null;

      const unwrapData = unwrap(res);
      const token =
        unwrapData?.accessToken ||
        unwrapData?.AccessToken ||
        unwrapData?.token ||
        unwrapData?.Token ||
        res?.accessToken ||
        res?.AccessToken ||
        res?.token;

      const refresh =
        unwrapData?.refreshToken ||
        unwrapData?.RefreshToken ||
        res?.refreshToken ||
        res?.RefreshToken;

      if (!token) {
        throw new Error('La API no devolvió un token de acceso renovado.');
      }

      setAccessToken(token);
      if (refresh) setRefreshToken(refresh);

      this.handleTokenResponse(
        { ...res, accessToken: token, refreshToken: refresh },
        true,
      );
      await this.refreshModuleEntitlements(true);
    } catch (error) {
      console.error(
        '[AuthService] No se pudo renovar la sesión ni sus permisos.',
        error,
      );
      this.clearSession();
    }
  }

  async refreshPermissionsForUser(userId: number): Promise<boolean> {
    if (!Number.isInteger(userId) || this.currentUser()?.id !== userId) {
      return false;
    }

    await this.refreshSession();
    return true;
  }

  async getMe(): Promise<ApiResponse<any>> {
    try {
      const res = await this.api.get<any, any>('/auth/me');
      return { success: true, data: res?.data ?? res?.Data ?? res };
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/Auth/me');
        return { success: true, data: res2?.data ?? res2?.Data ?? res2 };
      } catch (err: any) {
        return {
          success: false,
          message:
            err?.message || 'Error al obtener datos del usuario autenticado',
        };
      }
    }
  }

  async register(
    data: RegisterRequestDto,
  ): Promise<ApiResponse<UserResponseDto>> {
    const res = await this.api.post<any, UserResponseDto>(
      '/Auth/register',
      data,
    );
    return { success: true, data: res };
  }

  async getDevToken(
    companyId: number,
    userId?: number,
    email?: string,
  ): Promise<TokenResponseDto> {
    const tokens = await this.api.post<any, TokenResponseDto>(
      '/Auth/dev/token',
      {
        companyId,
        userId,
        email,
      },
    );
    this.applyTokenResponse(tokens);
    await this.refreshModuleEntitlements();
    return tokens;
  }

  logout() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const compId = this.companyId() || 'default';
      const queueKey = `cuadre_offline_queue_${compId}`;
      const conflictsKey = `cuadre_offline_conflicts_${compId}`;
      const rawQueue = localStorage.getItem(queueKey);
      const rawConflicts = localStorage.getItem(conflictsKey);
      const hasUnsynced =
        (rawQueue && rawQueue.length > 30) ||
        (rawConflicts && rawConflicts.length > 30);
      if (hasUnsynced) {
        const proceed = window.confirm(
          'ATENCIÓN: Hay ventas o incidencias offline pendientes de sincronizar en esta terminal.\n\nLas ventas permanecerán guardadas y cifradas en este equipo, pero no se sincronizarán en la nube hasta que inicies sesión nuevamente con esta empresa.\n\n¿Deseas cerrar sesión de todos modos?',
        );
        if (!proceed) {
          return;
        }
      }

      const activeSessionRaw =
        localStorage.getItem('app_active_cash_register_session') ||
        localStorage.getItem('cuadreenv_active_cash_register_session') ||
        localStorage.getItem('cuadre_active_cash_register_session');
      if (activeSessionRaw) {
        try {
          const sess = JSON.parse(activeSessionRaw);
          if (sess?.id) {
            void this.api
              .post(`/CashRegister/${sess.id}/close`, {
                actualAmount: sess.currentBalance ?? sess.initialAmount ?? 0,
                breakdownJson: null,
                notes: 'Cierre automático por fin de sesión',
              })
              .catch(() => {});
          }
        } catch {}
        localStorage.removeItem('app_active_cash_register_session');
        localStorage.removeItem('cuadreenv_active_cash_register_session');
        localStorage.removeItem('cuadre_active_cash_register_session');
      }
    }
    void clientLogout(this.api);
    this.clearSession();
    this.router.navigate(['/login']);
  }

  async revokeAllSessions(): Promise<void> {
    try {
      await this.api.post('/auth/revoke-all', {});
    } catch {
      // ignore
    }
    this.logout();
  }

  clearSession() {
    this.currentUser.set(null);
    this.currentRole.set(null);
    this.companyId.set(null);
    this.userCompanies.set([]);
    this.userPermissions.set([]);
    this.allowedModules.set([]);
    this.hasExplicitModuleClaims.set(false);
    this.isPlatformSuperUser.set(false);
    this.licensedModules.set(null);
    this.isAuthenticated.set(false);
    setAccessToken(null);
    setRefreshToken(null);
    setCompanyId(null);
    setRememberMe(false);
    purgeTenantStorage();
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('userCompanies');
      localStorage.removeItem('currentCompanyId');
      localStorage.removeItem(API_CONSTANTS.COMPANY_ID_KEY);
      localStorage.removeItem(API_CONSTANTS.AUTH_TOKEN_KEY);
      localStorage.removeItem(API_CONSTANTS.AUTH_REFRESH_TOKEN_KEY);
      localStorage.removeItem('companyId');
      localStorage.removeItem('auth_company_id');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('auth_refresh_token');
      localStorage.removeItem('cuadre_access_token');
      localStorage.removeItem('cuadre_refresh_token');
      localStorage.removeItem('allowedModules');
      localStorage.removeItem('allowed_modules');
      localStorage.removeItem('cuadre_remember_me');
      localStorage.removeItem('cuadre_remember_me_checked');
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('userCompanies');
      sessionStorage.removeItem('currentCompanyId');
      sessionStorage.removeItem('allowedModules');
      sessionStorage.removeItem('hasAllModules');
      sessionStorage.removeItem('companyId');
      sessionStorage.removeItem('auth_company_id');
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('auth_token');
    }
    this.moduleAccessService.init([]);
  }

  async loadUserCompanies(): Promise<UserCompanyDto[]> {
    if (!this.isAuthenticated()) return this.userCompanies();
    try {
      let list: any[] = [];
      try {
        const res = await this.api.get<any, any>('/users/my-companies');
        if (Array.isArray(res)) list = res;
        else if (Array.isArray(res?.data)) list = res.data;
        else if (Array.isArray(res?.Data)) list = res.Data;
      } catch {
        try {
          const res = await this.api.get<any, any>('/auth/user-companies');
          if (Array.isArray(res)) list = res;
          else if (Array.isArray(res?.data)) list = res.data;
          else if (Array.isArray(res?.Data)) list = res.Data;
        } catch {
          // Fallback a /Company solo para SuperAdmin para evitar 403 y alertas de seguridad
          if (this.isSuperUser() || this.hasRole(['SuperAdmin'])) {
            try {
              const compRes = await this.api.get<any, any>('/Company');
              if (Array.isArray(compRes)) list = compRes;
              else if (Array.isArray(compRes?.data)) list = compRes.data;
              else if (Array.isArray(compRes?.Data)) list = compRes.Data;
            } catch {}
          }
        }
      }

      if (list.length > 0) {
        const mapped: UserCompanyDto[] = list
          .map((c) => ({
            id: Number(c.id ?? c.companyId ?? c.CompanyId ?? 0),
            name: String(c.name ?? c.companyName ?? c.CompanyName ?? ''),
            commercialName: c.commercialName ?? c.CommercialName ?? undefined,
            rnc: c.rnc ?? c.Rnc ?? undefined,
            role: c.role ?? c.Role ?? undefined,
            plan: c.plan ?? c.Plan ?? c.planName ?? c.PlanName ?? undefined,
            isDefault: Boolean(c.isDefault ?? c.IsDefault ?? false),
          }))
          .filter((c) => c.id > 0);

        if (mapped.length > 0) {
          this.userCompanies.set(mapped);
          if (typeof window !== 'undefined') {
            window.localStorage?.setItem(
              'userCompanies',
              JSON.stringify(mapped),
            );
            window.sessionStorage?.setItem(
              'userCompanies',
              JSON.stringify(mapped),
            );
          }

          // Si el usuario no tenía un companyId válido, asignar el default o la primera
          if (!this.companyId() || this.companyId()! <= 0) {
            const defaultCompany = mapped.find((c) => c.isDefault) || mapped[0];
            if (defaultCompany?.id) {
              this.companyId.set(defaultCompany.id);
              setCompanyId(defaultCompany.id);
              if (typeof window !== 'undefined') {
                window.localStorage?.setItem(
                  API_CONSTANTS.COMPANY_ID_KEY,
                  String(defaultCompany.id),
                );
                window.localStorage?.setItem(
                  'companyId',
                  String(defaultCompany.id),
                );
                window.localStorage?.setItem(
                  'currentCompanyId',
                  String(defaultCompany.id),
                );
                window.localStorage?.setItem(
                  'auth_company_id',
                  String(defaultCompany.id),
                );
              }
            }
          }
          return mapped;
        }
      }
    } catch (err) {
      console.warn(
        '[AuthService] No se pudieron cargar las empresas del usuario:',
        err,
      );
    }
    return this.userCompanies();
  }

  async switchCompany(newCompanyId: number): Promise<boolean> {
    if (!newCompanyId || newCompanyId <= 0) {
      this.notificationService.error('Empresa inválida');
      return false;
    }
    if (newCompanyId === this.companyId()) {
      return true;
    }

    try {
      // 1. Purgar datos de caja y temporales del tenant anterior para evitar contaminación
      if (typeof window !== 'undefined') {
        window.localStorage?.removeItem('app_active_cash_register_session');
        window.localStorage?.removeItem(
          'cuadreenv_active_cash_register_session',
        );
        window.localStorage?.removeItem('cuadre_active_cash_register_session');
        window.localStorage?.removeItem('cuadre_company_settings');
        window.sessionStorage?.removeItem('cuadre_company_settings');
        window.sessionStorage?.removeItem('active_company_id');
      }

      // 2. Establecer el nuevo tenant en el servicio y en el cliente HTTP
      this.companyId.set(newCompanyId);
      setCompanyId(newCompanyId);

      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(
          API_CONSTANTS.COMPANY_ID_KEY,
          String(newCompanyId),
        );
        window.localStorage?.setItem('companyId', String(newCompanyId));
        window.localStorage?.setItem('currentCompanyId', String(newCompanyId));
        window.localStorage?.setItem('auth_company_id', String(newCompanyId));
        window.sessionStorage?.setItem('companyId', String(newCompanyId));
        window.sessionStorage?.setItem(
          'currentCompanyId',
          String(newCompanyId),
        );
        window.sessionStorage?.setItem('auth_company_id', String(newCompanyId));
      }

      // 3. Informar al backend si el endpoint de selección de empresa existe
      try {
        await this.api
          .post('/auth/switch-company', { companyId: newCompanyId })
          .catch(() => {});
      } catch {}

      // 4. Refrescar módulos y licencias
      await this.refreshModuleEntitlements(true).catch(() => {});

      // 5. Recargar la interfaz para limpiar cachés de componentes y estado en memoria
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return true;
    } catch (err: any) {
      this.notificationService.error(
        err?.message || 'Error al cambiar de empresa',
      );
      return false;
    }
  }

  hasRole(roles: string[]): boolean {
    const userRole = this.currentRole();
    return userRole
      ? roles.map((r) => r.toLowerCase()).includes(userRole.toLowerCase())
      : false;
  }

  isSuperUser(): boolean {
    const role = (this.currentRole() || '').toLowerCase();
    return (
      role === 'admin' ||
      role === 'superuser' ||
      role === 'superadmin' ||
      role === 'sysadmin'
    );
  }
}
