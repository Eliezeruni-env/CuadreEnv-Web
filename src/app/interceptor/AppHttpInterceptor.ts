import { Injectable, inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpInterceptorFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { NotificationService } from '../../features/cuadreEnv/services/notification.service';
import { getAccessToken, setAccessToken, setRefreshToken } from '../../features/cuadreEnv/services/apiClient';
import { SessionInvalidationService } from '../../features/cuadreEnv/services/session-invalidation.service';

const recentForbiddenNotifications = new Map<string, number>();
const FORBIDDEN_NOTIFICATION_WINDOW_MS = 1500;

/**
 * Manejador global de códigos HTTP conforme a la especificación de CuadreEnv:
 * - 401: Limpiar sesión, redirigir al login y mostrar "La sesión expiró o no es válida".
 * - 403: Mostrar el motivo devuelto por la API (asignación, licencia o permiso).
 * - 409: Mostrar el mensaje recibido desde la API (duplicados, conflictos o concurrencia).
 * - 422: Mostrar los errores de validación.
 * - 500: Mostrar mensaje genérico al usuario y registrar detalle técnico en el logger del frontend.
 */
export const appHttpInterceptorFn: HttpInterceptorFn = (req, next) => {
  const notificationService = inject(NotificationService, { optional: true });
  const router = inject(Router, { optional: true });
  const sessionInvalidation = inject(SessionInvalidationService);
  const moduleSnapshot = getModuleSnapshot();

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      handleGlobalHttpError(error, req, notificationService, router, sessionInvalidation, moduleSnapshot);
      return throwError(() => error);
    })
  );
};

export const appHttpInterceptor = appHttpInterceptorFn;

@Injectable()
export class AppHttpInterceptor implements HttpInterceptor {
  private readonly notificationService = inject(NotificationService, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly sessionInvalidation = inject(SessionInvalidationService);

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    const moduleSnapshot = getModuleSnapshot();
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        handleGlobalHttpError(error, req, this.notificationService, this.router, this.sessionInvalidation, moduleSnapshot);
        return throwError(() => error);
      })
    );
  }
}

function getModuleSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  const storedModules =
    window.sessionStorage?.getItem('allowedModules') ??
    window.localStorage?.getItem('allowedModules');
  if (!storedModules) return null;
  try {
    const modules = JSON.parse(storedModules);
    return Array.isArray(modules) && modules.every((module) => typeof module === 'string')
      ? [...modules].sort().join('|')
      : null;
  } catch {
    return null;
  }
}

function handleGlobalHttpError(
  error: HttpErrorResponse,
  req: HttpRequest<any>,
  notificationService: NotificationService | null,
  router: Router | null,
  sessionInvalidation: SessionInvalidationService,
  moduleSnapshot: string | null,
): void {
  const status = error.status;
  const lowerUrl = req.url.toLowerCase();
  const isLoginRequest = lowerUrl.includes('/auth/login');
  const isRefreshRequest = lowerUrl.includes('/auth/refresh');

  // 1. Manejo Status 0: Falla de conexión con la API o error de CORS/red
  if (status === 0) {
    if (isRefreshRequest) return;
    console.error('[API Network/CORS Error]', {
      url: req.urlWithParams || req.url,
      method: req.method,
      error,
    });
    if (notificationService) {
      notificationService.error(
        'No se pudo conectar con la API en http://localhost:8080/v1. Verifique que el backend esté disponible y los encabezados CORS estén autorizados.',
        'Falla de Conexión / CORS'
      );
    }
    return;
  }

  // 2. Manejo 400: Solicitud Inválida / Credenciales en Login
  if (status === 400) {
    if (isLoginRequest) {
      if (notificationService) {
        notificationService.error('Correo o contraseña incorrectos.', 'Acceso Inválido');
      }
      return;
    }
    if (isRefreshRequest) return;

    const errorBody = error.error;
    const isMissingCompany =
      errorBody?.errorCode === 'MISSING_COMPANY_CLAIM' ||
      errorBody?.code === 'MISSING_COMPANY_CLAIM' ||
      errorBody?.message?.includes?.('CompanyId claim missing') ||
      errorBody?.message?.includes?.('MISSING_COMPANY_CLAIM') ||
      errorBody?.Message?.includes?.('CompanyId claim missing') ||
      (typeof errorBody === 'string' && (errorBody.includes('CompanyId claim missing') || errorBody.includes('MISSING_COMPANY_CLAIM')));

    if (isMissingCompany) {
      if (notificationService) {
        notificationService.error(
          'Tu usuario no tiene una empresa activa asignada o seleccionada. Selecciona una empresa o sucursal para continuar.',
          'Empresa Requerida'
        );
      }
      if (router && !router.url.includes('/login') && !router.url.includes('/company/settings') && !router.url.includes('/companies/create')) {
        router.navigate(['/company/settings']);
      }
      return;
    }

    const apiMsg =
      error.error?.message ||
      (typeof error.error === 'string' ? error.error : null) ||
      'Solicitud no procesable. Verifique los datos suministrados.';

    if (notificationService && req.method !== 'GET') {
      notificationService.warning(apiMsg, 'Solicitud Inválida');
    }
    return;
  }

  // 3. Manejo 401: No autorizado / Sesión expirada
  if (status === 401) {
    console.warn('[API 401 Unauthorized]', {
      url: req.urlWithParams || req.url,
      method: req.method,
      error: error.error,
    });
    if (isLoginRequest) {
      if (notificationService) {
        notificationService.error('Correo o contraseña incorrectos.', 'Acceso Inválido');
      }
      return;
    }
    if (isRefreshRequest) return;

    setAccessToken(null);
    setRefreshToken(null);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('cuadre_access_token');
      localStorage.removeItem('cuadre_refresh_token');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('auth_token');
    }

    sessionInvalidation.invalidate();

    if (notificationService) {
      notificationService.error(
        'La sesión expiró o no es válida',
        'Sesión Expirada'
      );
    }

    if (router && !router.url.includes('/login')) {
      router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
    }
    return;
  }

  // 4. Manejo 403: Prohibido / Sin permisos suficientes
  if (status === 403) {
    const errorBody = error.error;
    const isMissingCompany =
      errorBody?.errorCode === 'MISSING_COMPANY_CLAIM' ||
      errorBody?.code === 'MISSING_COMPANY_CLAIM' ||
      errorBody?.message?.includes?.('CompanyId claim missing') ||
      errorBody?.message?.includes?.('MISSING_COMPANY_CLAIM') ||
      errorBody?.Message?.includes?.('CompanyId claim missing') ||
      (typeof errorBody === 'string' && (errorBody.includes('CompanyId claim missing') || errorBody.includes('MISSING_COMPANY_CLAIM')));

    if (isMissingCompany) {
      if (notificationService) {
        notificationService.error(
          'Acceso denegado por ausencia de empresa activa. Por favor, selecciona una empresa vinculada a tu cuenta.',
          'Empresa Requerida'
        );
      }
      if (router && !router.url.includes('/login') && !router.url.includes('/company/settings') && !router.url.includes('/companies/create')) {
        router.navigate(['/company/settings']);
      }
      return;
    }

    const apiCode =
      typeof error.error?.errorCode === 'string'
        ? error.error.errorCode
        : typeof error.error?.code === 'string'
          ? error.error.code
          : null;
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const title =
      apiCode === 'MODULE_NOT_ASSIGNED'
        ? 'Módulo no asignado'
        : apiCode === 'MODULE_NOT_LICENSED'
          ? 'Módulo no incluido en el plan'
          : 'Acceso denegado (403)';
    console.warn('[API 403 Forbidden]', {
      url: req.urlWithParams || req.url,
      method: req.method,
      error: error.error,
    });
    const permissionsChanged = moduleSnapshot !== null &&
      moduleSnapshot !== getModuleSnapshot();
    const notificationKey = `${req.method}:${req.urlWithParams || req.url}:${apiCode ?? 'FORBIDDEN'}`;
    const now = Date.now();
    const lastNotificationAt = recentForbiddenNotifications.get(notificationKey) ?? 0;
    for (const [key, timestamp] of recentForbiddenNotifications) {
      if (now - timestamp > FORBIDDEN_NOTIFICATION_WINDOW_MS) {
        recentForbiddenNotifications.delete(key);
      }
    }
    const isDuplicate = now - lastNotificationAt < FORBIDDEN_NOTIFICATION_WINDOW_MS;
    const isModuleAccessDenied =
      apiCode === 'MODULE_ACCESS_DENIED' || apiCode === 'MODULE_NOT_ASSIGNED';
    const isDashboardRead = req.method === 'GET' && router?.url.split(/[?#]/, 1)[0] === '/dashboard';
    if (isModuleAccessDenied || isDashboardRead) return;
    if (notificationService && !permissionsChanged && !isDuplicate) {
      recentForbiddenNotifications.set(notificationKey, now);
      notificationService.warning(
        apiMessage || 'No tienes permisos para realizar esta operación.',
        title
      );
    }
    return;
  }

  // Manejo 404: Recurso no encontrado
  if (status === 404) {
    const reqUrl = (req.urlWithParams || req.url || '').toLowerCase();
    const isSilencedProbe =
      reqUrl.includes('/cash-sessions/active-session') ||
      reqUrl.includes('/companysettings') ||
      reqUrl.includes('/auth/user-companies') ||
      reqUrl.includes('/accountreceivable') ||
      reqUrl.includes('/sale/') ||
      reqUrl.includes('/payments') ||
      req.headers.has('x-silent-error') ||
      req.headers.has('X-Silent-Error') ||
      req.headers.has('x-silent-404') ||
      req.headers.has('X-Silent-404');

    if (!isSilencedProbe) {
      console.warn('[API 404 Not Found]', {
        url: req.urlWithParams || req.url,
        method: req.method,
        error: error.error,
      });

      if (notificationService && req.method !== 'GET') {
        const notFoundMsg =
          error.error?.message ||
          (typeof error.error === 'string' ? error.error : null) ||
          'El recurso solicitado no fue encontrado en el servidor.';
        notificationService.warning(notFoundMsg, 'No Encontrado (404)');
      }
    }
    return;
  }

  // 5. Manejo 409: Conflicto / Duplicado / Concurrencia
  if (status === 409) {
    const conflictMessage =
      error.error?.message ||
      (typeof error.error === 'string' ? error.error : null) ||
      'Se detectó un conflicto de concurrencia o un registro duplicado en el sistema.';

    if (notificationService) {
      notificationService.warning(conflictMessage, 'Conflicto');
    }
    return;
  }

  // 6. Manejo 422: Error de validación de entidad
  if (status === 422) {
    let validationDetails = '';
    if (error.error?.errors) {
      if (Array.isArray(error.error.errors)) {
        validationDetails = error.error.errors.join(' · ');
      } else if (typeof error.error.errors === 'object') {
        const errList: string[] = [];
        for (const [field, msgs] of Object.entries(error.error.errors)) {
          if (Array.isArray(msgs)) {
            errList.push(`${field}: ${msgs.join(', ')}`);
          } else if (typeof msgs === 'string') {
            errList.push(`${field}: ${msgs}`);
          }
        }
        validationDetails = errList.join(' · ');
      }
    }

    const message =
      validationDetails ||
      error.error?.message ||
      'Los datos suministrados no cumplen las reglas de validación requeridas.';

    if (notificationService) {
      notificationService.warning(message, 'Validación Requerida');
    }
    return;
  }

  // 7. Manejo 429: Demasiados intentos (Rate limit)
  if (status === 429) {
    if (notificationService) {
      notificationService.warning(
        'Demasiados intentos. Espera unos segundos e inténtalo nuevamente.',
        'Límite de Solicitudes'
      );
    }
    return;
  }

  // 8. Manejo 500: Error interno de servidor
  if (status >= 500) {
    const requestId =
      error.headers?.get('x-request-id') ||
      error.headers?.get('X-Request-Id') ||
      error.headers?.get('X-Correlation-ID') ||
      error.headers?.get('x-correlation-id') ||
      undefined;

    const fullUrl = error.url || req.urlWithParams || req.url;
    const currentUser = getAccessToken() ? 'authenticated' : 'unauthenticated';

    // Registrar detalle técnico ÚNICAMENTE en el logger del frontend
    console.error('[API 500 Internal Server Error]', {
      timestamp: new Date().toISOString(),
      url: fullUrl,
      method: req.method,
      status: error.status,
      statusText: error.statusText,
      responseBody: error.error,
      requestId,
      authenticatedUser: currentUser,
    });

    // Mostrar al usuario mensaje genérico amigable sin stack traces ni SQL
    if (notificationService) {
      notificationService.error(
        'Ocurrió un error interno. Intenta nuevamente.',
        'Error del Servidor',
        requestId
      );
    }
    return;
  }

  // Otros errores HTTP (ej. 404)
  if (notificationService && req.method !== 'GET') {
    const fallbackMsg =
      error.error?.message ||
      (typeof error.error === 'string' ? error.error : null) ||
      'Ocurrió un error al procesar la solicitud.';
    notificationService.error(fallbackMsg, 'Atención');
  }
}
