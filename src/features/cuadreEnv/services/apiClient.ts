import {
  HttpClient,
  HttpBackend,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { TokenResponseDto } from '../types/api';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';
import { mapApiErrorToUserMessage, MappedApiError } from '../utils/api-error-mapper';
import { logger } from './logger.service';

export const API_BASE_URL = environment.API_BASE_URL;

export function validateApiConfiguration(): void {
  if (!environment.apiUrl || !environment.API_BASE_URL) {
    console.error(
      '[CuadreEnv Config Validation] Configuración de API incompleta en environment.',
      { apiUrl: environment.apiUrl, API_BASE_URL: environment.API_BASE_URL }
    );
  }
}
validateApiConfiguration();

export function resolveApiUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url.replace(/\/v1\/v1(?=\/|$)/g, '/v1');
  }
  const rawBase = (environment.apiUrl || 'http://localhost:8080/v1').replace(/\/$/, '');
  const rootBase = rawBase.replace(/\/v1$/, '');
  let path = url.startsWith('/') ? url : `/${url}`;

  // Eliminar prefijos duplicados /v1/v1
  path = path.replace(/^\/v1\/v1(?=\/|$)/, '/v1');

  // Endpoints at root: /hc, /swagger, SignalR hubs (/hubs)
  if (path.startsWith('/hc') || path.startsWith('/hubs') || path.startsWith('/swagger')) {
    return `${rootBase}${path}`;
  }

  // Already prefixed with /v1
  if (path.startsWith('/v1/') || path === '/v1') {
    return `${rootBase}${path}`;
  }

  // Route under /v1
  return `${rootBase}/v1${path}`;
}

export type TelemetryErrorCallback = (errorData: {
  method: string;
  url: string;
  statusCode: number;
  errorCode?: string;
  requestId?: string;
  timestamp: string;
  rawError: any;
}) => void;

let customTelemetryHandler: TelemetryErrorCallback | null = null;

export function registerTelemetryHandler(handler: TelemetryErrorCallback) {
  customTelemetryHandler = handler;
}

function debugLog(message: string, ...params: any[]) {
  if (
    typeof window !== 'undefined' &&
    localStorage.getItem('debugMode') === 'true'
  ) {
    console.log(`[SaaS-API] ${message}`, ...params);
  }
}

export function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'fe-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

let currentSessionEpoch = 0;

export function getSessionEpoch(): number {
  return currentSessionEpoch;
}

export function invalidateSessionEpoch(): void {
  currentSessionEpoch++;
}

const PRESERVED_STORAGE_KEYS = new Set([
  'coreui-free-angular-admin-template-theme',
  'debugMode',
  'app_lang',
]);

export function purgeTenantStorage(): void {
  if (typeof window === 'undefined') return;

  // Invalidate any in-flight requests from the previous tenant/session
  currentSessionEpoch++;

  // 1. Purge all sessionStorage
  try {
    if (window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch (e) {
    console.warn('[TenantIsolation] Could not clear sessionStorage:', e);
  }

  // 2. Purge all tenant/business data from localStorage, preserving only app preferences
  try {
    if (window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        const isProtectedOffline =
          key?.startsWith('cuadre_offline_queue_') ||
          key?.startsWith('cuadre_offline_conflicts_') ||
          key?.startsWith('cuadre_pos_held_sales_');
        if (key && !PRESERVED_STORAGE_KEYS.has(key) && !isProtectedOffline) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (e) {
    console.warn('[TenantIsolation] Could not clear localStorage:', e);
  }
}

export function isRememberMe(): boolean {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('cuadre_remember_me') === 'true';
  }
  return false;
}

export function setRememberMe(remember: boolean): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (remember) {
      localStorage.setItem('cuadre_remember_me', 'true');
    } else {
      localStorage.removeItem('cuadre_remember_me');
    }
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      if (window.sessionStorage) {
        sessionStorage.setItem('accessToken', token);
        sessionStorage.setItem('auth_token', token);
      }
      if (window.localStorage) {
        if (isRememberMe()) {
          localStorage.setItem('accessToken', token);
          localStorage.setItem('auth_token', token);
        } else {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('auth_token');
        }
      }
    } else {
      if (window.sessionStorage) {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('auth_token');
      }
      if (window.localStorage) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('auth_refresh_token');
      }
    }
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    const sessionToken =
      window.sessionStorage &&
      (sessionStorage.getItem('accessToken') || sessionStorage.getItem('auth_token'));
    if (sessionToken) {
      accessToken = sessionToken;
      return sessionToken;
    }

    if (isRememberMe() && window.localStorage) {
      const localToken = localStorage.getItem('accessToken') || localStorage.getItem('auth_token');
      if (localToken) {
        accessToken = localToken;
        return localToken;
      }
    }
  }
  return null;
}

let memoryRefreshToken: string | null = null;

export function getRefreshToken(): string | null {
  if (memoryRefreshToken) return memoryRefreshToken;
  if (typeof window !== 'undefined') {
    const sessionRefresh =
      window.sessionStorage &&
      (sessionStorage.getItem('refreshToken') || sessionStorage.getItem('auth_refresh_token'));
    if (sessionRefresh) {
      memoryRefreshToken = sessionRefresh;
      return sessionRefresh;
    }

    if (isRememberMe() && window.localStorage) {
      return localStorage.getItem('refreshToken') || localStorage.getItem('auth_refresh_token');
    }
  }
  return null;
}

export function setRefreshToken(token?: string | null) {
  memoryRefreshToken = token ?? null;
  if (typeof window !== 'undefined') {
    if (token) {
      if (window.sessionStorage) {
        sessionStorage.setItem('refreshToken', token);
        sessionStorage.setItem('auth_refresh_token', token);
      }
      if (window.localStorage) {
        if (isRememberMe()) {
          localStorage.setItem('refreshToken', token);
          localStorage.setItem('auth_refresh_token', token);
        } else {
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('auth_refresh_token');
        }
      }
    } else {
      if (window.sessionStorage) {
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('auth_refresh_token');
      }
      if (window.localStorage) {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('auth_refresh_token');
      }
    }
  }
}

let activeCompanyId: string | null = null;

export function setCompanyId(companyId: string | number | null) {
  activeCompanyId = companyId && String(companyId) !== '0' && String(companyId) !== 'null' ? String(companyId) : null;
  if (typeof window !== 'undefined') {
    if (activeCompanyId) {
      if (window.sessionStorage) {
        sessionStorage.setItem('currentCompanyId', activeCompanyId);
        sessionStorage.setItem('auth_company_id', activeCompanyId);
        sessionStorage.setItem('companyId', activeCompanyId);
      }
      if (window.localStorage) {
        if (isRememberMe()) {
          localStorage.setItem('currentCompanyId', activeCompanyId);
          localStorage.setItem('auth_company_id', activeCompanyId);
          localStorage.setItem('companyId', activeCompanyId);
        } else {
          localStorage.removeItem('currentCompanyId');
          localStorage.removeItem('auth_company_id');
          localStorage.removeItem('companyId');
        }
      }
    } else {
      if (window.localStorage) {
        localStorage.removeItem('currentCompanyId');
        localStorage.removeItem('auth_company_id');
        localStorage.removeItem('companyId');
      }
      if (window.sessionStorage) {
        sessionStorage.removeItem('currentCompanyId');
        sessionStorage.removeItem('auth_company_id');
        sessionStorage.removeItem('companyId');
      }
    }
  }
}

export function getCompanyId(): string | null {
  if (typeof window !== 'undefined') {
    // 1. Authoritative source: Signed JWT claims
    const token = getAccessToken();
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const base64Url = parts[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            window
              .atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join(''),
          );
          const payload = JSON.parse(jsonPayload);
          const compClaim =
            payload.companyId ??
            payload.CompanyId ??
            payload.company_id ??
            payload.tenantId ??
            payload.TenantId ??
            payload.tenant_id ??
            payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/groupsid'] ??
            payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/sid'];
          if (compClaim !== undefined && compClaim !== null && compClaim !== '') {
            activeCompanyId = String(compClaim);
            return activeCompanyId;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (activeCompanyId) return activeCompanyId;

  if (typeof window !== 'undefined') {
    try {
      const fromStorage =
        (window.localStorage && (localStorage.getItem('currentCompanyId') || localStorage.getItem('auth_company_id') || localStorage.getItem('companyId') || localStorage.getItem('CompanyId'))) ||
        (window.sessionStorage && (sessionStorage.getItem('currentCompanyId') || sessionStorage.getItem('auth_company_id') || sessionStorage.getItem('companyId') || sessionStorage.getItem('CompanyId')));
      if (fromStorage && fromStorage !== 'null' && fromStorage !== 'undefined' && fromStorage !== '0') {
        activeCompanyId = fromStorage;
        return activeCompanyId;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function unwrap<T = any>(body: any): T {
  if (body && typeof body === 'object') {
    if ('success' in body && 'data' in body) {
      if (body.success) return body.data as T;
      const error: any = new Error(body.message || 'API error');
      error.errors = body.errors;
      throw error;
    }
    if ('Success' in body && 'Data' in body) {
      if (body.Success) return body.Data as T;
      const error: any = new Error(body.Message || 'API error');
      error.errors = body.Errors;
      throw error;
    }
    if ('isSuccess' in body && 'value' in body) {
      if (body.isSuccess) return body.value as T;
      const error: any = new Error(body.error || 'API error');
      throw error;
    }
  }
  return body as T;
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private notificationService = inject(NotificationService, { optional: true });
  private readonly interceptorFreeHttp: HttpClient;

  constructor(
    private readonly http: HttpClient,
    backend: HttpBackend,
  ) {
    this.interceptorFreeHttp = new HttpClient(backend);
  }

  get<T = any, R = T>(
    url: string,
    options?: { params?: Record<string, any>; headers?: Record<string, string> },
  ): Promise<R> {
    return this.request<T, R>('GET', url, options);
  }

  post<T = any, R = T>(
    url: string,
    body?: any,
    options?: { params?: Record<string, any>; headers?: Record<string, string> },
  ): Promise<R> {
    return this.request<T, R>('POST', url, { body, ...options });
  }

  put<T = any, R = T>(
    url: string,
    body?: any,
    options?: { params?: Record<string, any>; headers?: Record<string, string> },
  ): Promise<R> {
    return this.request<T, R>('PUT', url, { body, ...options });
  }

  patch<T = any, R = T>(
    url: string,
    body?: any,
    options?: { params?: Record<string, any>; headers?: Record<string, string> },
  ): Promise<R> {
    return this.request<T, R>('PATCH', url, { body, ...options });
  }

  delete<T = any, R = T>(
    url: string,
    options?: { params?: Record<string, any>; headers?: Record<string, string> },
  ): Promise<R> {
    return this.request<T, R>('DELETE', url, options);
  }

  postWithoutInterceptors<T = any, R = T>(url: string, body?: T): Promise<R> {
    return firstValueFrom(
      this.interceptorFreeHttp.post<R>(resolveApiUrl(url), body, {
        headers: new HttpHeaders({
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Correlation-ID': generateCorrelationId(),
        }),
        withCredentials: true,
      }),
    ).then((response) => unwrap<R>(response));
  }

  private async request<T, R>(
    method: string,
    url: string,
    options: {
      body?: any;
      params?: Record<string, any>;
      headers?: Record<string, string>;
      withCredentials?: boolean;
    } = {},
    retry = false,
  ): Promise<R> {
    const correlationId = generateCorrelationId();
    const token = getAccessToken();
    const compId = getCompanyId();

    const isPublicAuth =
      url.toLowerCase().includes('/auth/login') ||
      url.toLowerCase().includes('/auth/register') ||
      url.toLowerCase().includes('/auth/forgot-password') ||
      url.toLowerCase().includes('/auth/reset-password') ||
      url.toLowerCase().includes('/hc');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Correlation-ID': correlationId,
      ...(!isPublicAuth && token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(!isPublicAuth && compId ? { 'X-Company-Id': String(compId) } : {}),
      ...(options.headers || {}),
    };

    if (method.toUpperCase() === 'POST' && (url.toLowerCase() === '/sale' || url.toLowerCase() === '/v1/sale' || url.toLowerCase().startsWith('/sale'))) {
      if (!headers['X-Idempotency-Key'] || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headers['X-Idempotency-Key'])) {
        headers['X-Idempotency-Key'] = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      }
    }
    
    const rawParams = options.params || {};
    const cleanParams: Record<string, any> = {};
    const seenLower = new Set<string>();
    for (const [key, value] of Object.entries(rawParams)) {
      if (value !== null && value !== undefined && value !== '' && value !== 'null') {
        const lower = key.toLowerCase();
        if (!seenLower.has(lower)) {
          seenLower.add(lower);
          // Backend limits pageSize to max 100
          if ((lower === 'pagesize' || lower === 'page_size') && typeof value === 'number' && value > 100) {
            cleanParams[key] = 100;
          } else if ((lower === 'pagesize' || lower === 'page_size') && typeof value === 'string' && parseInt(value, 10) > 100) {
            cleanParams[key] = '100';
          } else {
            cleanParams[key] = value;
          }
        }
      }
    }
    const params = new HttpParams({ fromObject: cleanParams });
    const requestEpoch = currentSessionEpoch;
    const fullUrl = resolveApiUrl(url);
    debugLog(`Outgoing request: [${method}] ${fullUrl}`);

    try {
      const body = await firstValueFrom(
        this.http.request<T>(method, fullUrl, {
          body: options.body,
          headers,
          params,
          withCredentials: options.withCredentials ?? true,
        }),
      );
      if (requestEpoch !== currentSessionEpoch) {
        debugLog(`[TenantIsolation] In-flight response discarded due to session/tenant change: [${method}] ${url}`);
        const cancelledError: any = new Error('Request discarded: session or tenant changed');
        cancelledError.isStaleSession = true;
        throw cancelledError;
      }
      return unwrap<R>(body);
    } catch (error: any) {
      const mapped = mapApiErrorToUserMessage(error);
      const statusCode = error instanceof HttpErrorResponse ? error.status : (mapped.statusCode || 0);

      // Enhance error object with mapped details for calling components
      if (error && typeof error === 'object') {
        error.mappedError = mapped;
        error.requestId = mapped.requestId;
        error.fieldErrors = mapped.fieldErrors;
      }

      logRequestError(method, url, error, mapped);

      // Telemetry dispatch on server errors (statusCode >= 500)
      if (statusCode >= 500) {
        dispatchTelemetry(method, url, statusCode, mapped, error);
      }

      // Display server outage notification only on user actions (mutations), never on background GET data fetching or silenced requests
      const isSilencedReq = Boolean(
        options.headers?.['X-Silent-Error'] ||
        options.headers?.['x-silent-error'] ||
        options.headers?.['X-Silent-500'] ||
        options.headers?.['x-silent-500']
      );
      const isMutation = method !== 'GET';
      if (!isSilencedReq && isMutation && (statusCode === 0 || statusCode >= 500 || mapped.errorCode === 'SERVER_OUTAGE')) {
        this.notificationService?.show(
          mapped.title,
          mapped.message,
          'danger',
          10000,
          { isCritical: true, requestId: mapped.requestId, errorCode: mapped.errorCode }
        );
      }

      // AuthInterceptor handles 401 and 403 globally
      throw error;
    }
  }
}

function logRequestError(method: string, url: string, error: any, mapped?: MappedApiError) {
  const status = error?.status || mapped?.statusCode || 0;
  const msg = mapped?.message || error?.message || 'Error de petición';
  logger.logApiError(method, url, status, msg, {
    errorCode: mapped?.errorCode,
    requestId: mapped?.requestId,
    body: error?.error,
  });
}

function dispatchTelemetry(
  method: string,
  url: string,
  statusCode: number,
  mapped: MappedApiError,
  rawError: any,
) {
  const telemetryData = {
    method,
    url,
    statusCode,
    errorCode: mapped.errorCode,
    requestId: mapped.requestId,
    timestamp: mapped.timestamp || new Date().toISOString(),
    rawError: rawError?.error || rawError?.message,
  };

  try {
    console.error('[SaaS-Telemetry] Error 500+ reported:', telemetryData);
    if (customTelemetryHandler) {
      customTelemetryHandler(telemetryData);
    }
  } catch (err) {
    console.warn('[SaaS-Telemetry] Failed to dispatch telemetry event:', err);
  }
}

function handleMissingCompanyClaim(body: any) {
  const missing =
    body?.errors?.includes?.('MISSING_COMPANY_CLAIM') ||
    body?.Errors?.includes?.('MISSING_COMPANY_CLAIM') ||
    body?.message?.includes?.('CompanyId claim missing') ||
    body?.Message?.includes?.('CompanyId claim missing');
  if (
    missing &&
    typeof window !== 'undefined' &&
    !window.location.href.includes('/companies/create') &&
    !window.location.href.includes('/login')
  ) {
    window.location.href = '/companies/create';
  }
}

export async function doLogin(
  client: ApiClientService,
  email: string,
  password: string,
  deviceId?: string,
) {
  const body = await client.post<any, any>('/auth/login', {
    email,
    password,
    deviceId,
  });

  const accessToken =
    body?.accessToken ||
    body?.AccessToken ||
    body?.token ||
    body?.Token ||
    body?.data?.accessToken ||
    body?.data?.AccessToken ||
    body?.data?.token;

  const refreshToken =
    body?.refreshToken ||
    body?.RefreshToken ||
    body?.data?.refreshToken ||
    body?.data?.RefreshToken;

  if (accessToken) setAccessToken(accessToken);
  if (refreshToken) setRefreshToken(refreshToken);

  return {
    accessToken,
    refreshToken,
    ...body,
  };
}

export async function doForgotPassword(
  client: ApiClientService,
  email: string,
): Promise<{ success: boolean; message: string; data?: any }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  try {
    const res: any = await client.post<any, any>('/auth/forgot-password', { email: cleanEmail });
    return {
      success: res?.success !== false,
      message: res?.message || 'Si el correo electrónico está registrado, recibirás un enlace de recuperación.',
      data: res?.data ?? res,
    };
  } catch (err: any) {
    try {
      const res2: any = await client.post<any, any>('/Auth/forgot-password', { email: cleanEmail });
      return {
        success: res2?.success !== false,
        message: res2?.message || 'Si el correo electrónico está registrado, recibirás un enlace de recuperación.',
        data: res2?.data ?? res2,
      };
    } catch {
      try {
        const res3: any = await client.post<any, any>('/auth/reset-password-request', { email: cleanEmail });
        return {
          success: res3?.success !== false,
          message: res3?.message || 'Si el correo electrónico está registrado, recibirás un enlace de recuperación.',
          data: res3?.data ?? res3,
        };
      } catch (finalErr: any) {
        // En caso de que el backend no tenga aún implementado el servicio SMTP o endpoint específico,
        // devolver respuesta segura estándar de la industria (no enumeración de emails)
        return {
          success: true,
          message: 'Si el correo electrónico está registrado, recibirás un enlace con instrucciones para restablecer tu contraseña.',
        };
      }
    }
  }
}

export async function doResetPassword(
  client: ApiClientService,
  payload: { email: string; token: string; newPassword: string },
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const res: any = await client.post<any, any>('/auth/reset-password', payload);
    return {
      success: res?.success !== false,
      message: res?.message || 'Contraseña restablecida exitosamente.',
      data: res?.data ?? res,
    };
  } catch (err: any) {
    try {
      const res2: any = await client.post<any, any>('/Auth/reset-password', payload);
      return {
        success: res2?.success !== false,
        message: res2?.message || 'Contraseña restablecida exitosamente.',
        data: res2?.data ?? res2,
      };
    } catch {
      try {
        const res3: any = await client.post<any, any>('/auth/confirm-reset-password', payload);
        return {
          success: res3?.success !== false,
          message: res3?.message || 'Contraseña restablecida exitosamente.',
          data: res3?.data ?? res3,
        };
      } catch (finalErr: any) {
        const msg = finalErr?.error?.message || finalErr?.message || 'El enlace de recuperación es inválido o ha expirado.';
        throw new Error(msg);
      }
    }
  }
}

let ongoingRefreshPromise: Promise<TokenResponseDto> | null = null;

export async function doRefresh(
  client: ApiClientService,
): Promise<TokenResponseDto> {
  if (ongoingRefreshPromise) {
    return ongoingRefreshPromise;
  }

  ongoingRefreshPromise = (async () => {
    const currentRefresh = getRefreshToken();
    const currentAccess = getAccessToken();
    if (!currentRefresh) {
      throw new Error('No hay un token de renovación disponible.');
    }

    try {
      const res: any = await client.postWithoutInterceptors<any, any>('/auth/refresh', {
        refreshToken: currentRefresh,
        accessToken: currentAccess,
      });

      const token =
        res?.accessToken ||
        res?.AccessToken ||
        res?.token ||
        res?.Token ||
        res?.data?.accessToken ||
        res?.data?.token;

      const refresh =
        res?.refreshToken ||
        res?.RefreshToken ||
        res?.data?.refreshToken;

      if (!token) {
        throw new Error('La API no devolvió un token de acceso renovado.');
      }

      setAccessToken(token);
      if (refresh) setRefreshToken(refresh);
      return { accessToken: token, refreshToken: refresh || currentRefresh };
    } catch (err: any) {
      const status = err?.status || err?.statusCode || 0;
      if (status === 400 || status === 401 || status === 403) {
        setRefreshToken(null);
      }
      throw err;
    }
  })().finally(() => {
    ongoingRefreshPromise = null;
  });

  return ongoingRefreshPromise;
}

export async function logout(client?: ApiClientService) {
  const currentRefresh = getRefreshToken();
  if (client && currentRefresh) {
    try {
      await client.post('/auth/revoke', { refreshToken: currentRefresh }).catch(() => {});
    } catch {
      // ignore
    }
  }
  setAccessToken(null);
  purgeTenantStorage();
}

export function extractArray<T>(resData: any): T[] {
  if (!resData) return [];
  if (typeof resData === 'string') {
    try {
      return extractArray<T>(JSON.parse(resData));
    } catch {
      return [];
    }
  }
  if (Array.isArray(resData)) return resData;

  const dataPayload = resData.data !== undefined ? resData.data : resData.Data;
  if (dataPayload !== undefined && dataPayload !== null && dataPayload !== resData) {
    return extractArray<T>(dataPayload);
  }

  const itemsPayload =
    resData.items ??
    resData.Items ??
    resData.value ??
    resData.Value ??
    resData.records ??
    resData.Records;

  if (Array.isArray(itemsPayload)) {
    return itemsPayload;
  }

  return [];
}
