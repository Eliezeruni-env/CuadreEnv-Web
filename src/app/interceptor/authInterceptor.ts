import { Injectable, inject } from '@angular/core';
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
 * Garantiza que NO se envíe companyId en el body para determinar el tenant,
 * ya que el backend obtiene la compañía del claim companyId del JWT.
 * Agrega X-Company-Id para compatibilidad sólo en peticiones autenticadas.
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
    lower.includes('/hc')
  );
}

export const authInterceptorFn: HttpInterceptorFn = (req, next) => {
  const token = getAccessToken();
  const companyId = getCompanyId();
  const isAuth = isPublicAuthEndpoint(req.url);

  let headers = req.headers;
  if (!isAuth && token && !headers.has('Authorization')) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  if (!isAuth && companyId && !headers.has('X-Company-Id')) {
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

  // Garantizar que si el body requiere companyId, use el tenant activo y nunca 0 o null
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
    if (
      companyId &&
      (rawBody['companyId'] === 0 ||
        rawBody['companyId'] === null ||
        rawBody['companyId'] === undefined ||
        rawBody['companyId'] === '0')
    ) {
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
    const token = getAccessToken();
    const companyId = getCompanyId();
    const isAuth = isPublicAuthEndpoint(req.url);

    let headers = req.headers;
    if (!isAuth && token && !headers.has('Authorization')) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    if (!isAuth && companyId && !headers.has('X-Company-Id')) {
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
      if (
        companyId &&
        (rawBody['companyId'] === 0 ||
          rawBody['companyId'] === null ||
          rawBody['companyId'] === undefined ||
          rawBody['companyId'] === '0')
      ) {
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
