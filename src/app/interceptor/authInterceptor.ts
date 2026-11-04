import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpInterceptorFn,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { getAccessToken, getCompanyId } from '../../features/cuadreEnv/services/apiClient';

/**
 * Agrega automáticamente el encabezado Authorization: Bearer <jwt>.
 * Agrega X-Company-Id solo cuando exista una compañía activa válida en la sesión.
 * Nunca usa fallbacks como 1 o default.
 * Omite encabezados en endpoints públicos y en peticiones directas con X-Skip-Interceptor.
 */
function isPublicAuthEndpoint(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('/auth/login') ||
    lower.includes('/auth/register') ||
    lower.includes('/auth/refresh') ||
    lower.includes('/auth/forgot-password') ||
    lower.includes('/auth/reset-password') ||
    lower.includes('/auth/reset-password-request') ||
    lower.includes('/auth/confirm-reset-password') ||
    lower.includes('/onboarding') ||
    lower.includes('/companies/my-companies') ||
    lower.includes('/user-companies') ||
    lower.includes('/hc')
  );
}

function isValidCompanyId(compId: any): boolean {
  if (compId == null) return false;
  const str = String(compId).trim();
  if (!str || str === '0' || str === 'default' || str === 'null' || str === 'undefined') return false;
  const num = Number(str);
  return !isNaN(num) && num > 0;
}

export const authInterceptorFn: HttpInterceptorFn = (req, next) => {
  if (req.headers.has('X-Skip-Interceptor')) {
    const cleanReq = req.clone({
      headers: req.headers.delete('X-Skip-Interceptor'),
    });
    return next(cleanReq);
  }

  const token = getAccessToken();
  const companyId = getCompanyId();
  const isAuth = isPublicAuthEndpoint(req.url);

  let headers = req.headers;
  if (!isAuth && token && !headers.has('Authorization')) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  if (!isAuth && isValidCompanyId(companyId) && !headers.has('X-Company-Id')) {
    headers = headers.set('X-Company-Id', String(companyId));
  }

  if (
    !headers.has('Content-Type') &&
    !(req.body instanceof FormData) &&
    !(req.body instanceof Blob) &&
    req.method !== 'GET' &&
    req.method !== 'DELETE'
  ) {
    headers = headers.set('Content-Type', 'application/json');
  }

  // Garantizar que si el body incluye companyId, coincida con el tenant activo
  let body: any = req.body;
  if (
    !isAuth &&
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !(body instanceof FormData) &&
    !(body instanceof Blob)
  ) {
    const rawBody = body as Record<string, any>;
    if (isValidCompanyId(companyId) && ('companyId' in rawBody)) {
      body = { ...rawBody, companyId: Number(companyId) };
    }
  }

  const authReq = req.clone({
    headers,
    body,
    withCredentials: req.withCredentials !== undefined ? req.withCredentials : true,
  });
  return next(authReq);
};

export const authInterceptor = authInterceptorFn;

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    if (req.headers.has('X-Skip-Interceptor')) {
      const cleanReq = req.clone({
        headers: req.headers.delete('X-Skip-Interceptor'),
      });
      return next.handle(cleanReq);
    }

    const token = getAccessToken();
    const companyId = getCompanyId();
    const isAuth = isPublicAuthEndpoint(req.url);

    let headers = req.headers;
    if (!isAuth && token && !headers.has('Authorization')) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    if (!isAuth && isValidCompanyId(companyId) && !headers.has('X-Company-Id')) {
      headers = headers.set('X-Company-Id', String(companyId));
    }

    if (
      !headers.has('Content-Type') &&
      !(req.body instanceof FormData) &&
      !(req.body instanceof Blob) &&
      req.method !== 'GET' &&
      req.method !== 'DELETE'
    ) {
      headers = headers.set('Content-Type', 'application/json');
    }

    let body: any = req.body;
    if (
      !isAuth &&
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      !(body instanceof FormData) &&
      !(body instanceof Blob)
    ) {
      const rawBody = body as Record<string, any>;
      if (isValidCompanyId(companyId) && ('companyId' in rawBody)) {
        body = { ...rawBody, companyId: Number(companyId) };
      }
    }

    const authReq = req.clone({
      headers,
      body,
      withCredentials: req.withCredentials !== undefined ? req.withCredentials : true,
    });
    return next.handle(authReq);
  }
}
