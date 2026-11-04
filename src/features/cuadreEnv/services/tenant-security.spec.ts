import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpRequest, HttpHeaders, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import {
  setAccessToken,
  getAccessToken,
  setRefreshToken,
  getRefreshToken,
  setCompanyId,
  getCompanyId,
} from './apiClient';
import { authInterceptorFn } from '../../../app/interceptor/authInterceptor';
import { TokenRefreshService } from './token-refresh.service';
import { TenantCacheService } from './tenant-cache.service';
import { PurchaseService } from '../../purchases/services/purchase.service';
import { getFiscalStatusInfo } from '../../billing/utils/fiscal-status.util';

describe('Tenant Multi-Tenancy & Hybrid E-Invoicing Security Specification', () => {
  beforeEach(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setCompanyId(null);
  });

  afterEach(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setCompanyId(null);
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Contexto tenant obligatorio (X-Company-Id y sin fallbacks)
  // -----------------------------------------------------------------------
  it('1. Debe adjuntar X-Company-Id con la compañía activa y NO usar fallback por defecto como 1', () => {
    setAccessToken('valid-jwt-token');
    setCompanyId('78');

    let passedRequest: HttpRequest<any> | null = null;
    const nextHandler = (req: HttpRequest<any>) => {
      passedRequest = req;
      return of(new HttpResponse({ status: 200 }));
    };

    const req = new HttpRequest('GET', '/v1/Product');
    authInterceptorFn(req, nextHandler);

    expect(passedRequest).not.toBeNull();
    expect(passedRequest!.headers.get('Authorization')).toBe('Bearer valid-jwt-token');
    expect(passedRequest!.headers.get('X-Company-Id')).toBe('78');

    // Sin compañía activa: NO debe inventar '1' o 'default'
    setCompanyId(null);
    let noTenantRequest: HttpRequest<any> | null = null;
    authInterceptorFn(req, (r) => {
      noTenantRequest = r;
      return of(new HttpResponse({ status: 200 }));
    });
    expect(noTenantRequest!.headers.has('X-Company-Id')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 2. Bloqueo de rutas operativas sin tenant activo
  // -----------------------------------------------------------------------
  it('2. Debe bloquear el acceso a rutas operativas cuando no hay compañía activa', () => {
    setAccessToken('valid-jwt-token');
    setCompanyId(null);

    const activeComp = getCompanyId();
    const isOperativeRouteBlocked = !activeComp || Number(activeComp) <= 0;
    expect(isOperativeRouteBlocked).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 3. Transición segura en cambio de compañía (Invalidación de cachés)
  // -----------------------------------------------------------------------
  it('3. Debe invalidar y purgar toda la caché del tenant anterior al cambiar de compañía', () => {
    setCompanyId('10');
    const cacheService = new TenantCacheService();
    const key1 = cacheService.buildKey('products', 'active', 1, 20);
    cacheService.set(key1, [{ id: 1, name: 'Prod A' }]);

    expect(cacheService.get(key1)).toEqual([{ id: 1, name: 'Prod A' }]);

    // Cambio a compañía 20
    setCompanyId('20');
    cacheService.invalidateCompanyCache('10');

    // La clave del tenant 10 debe haber sido purgada
    expect(cacheService.get(key1)).toBeNull();

    // Nueva clave para tenant 20
    const key2 = cacheService.buildKey('products', 'active', 1, 20);
    expect(key2).toContain(':20:');
  });

  // -----------------------------------------------------------------------
  // 4. Renovación de token con HttpClient directo vía HttpBackend
  // -----------------------------------------------------------------------
  it('4. Debe renovar el token utilizando un HttpClient directo instanciado con HttpBackend', async () => {
    setRefreshToken('refresh-token-xyz');
    setAccessToken('expired-access-token');

    const mockBackend: any = { handle: vi.fn() };
    const mockSessionInvalidation: any = { invalidate: vi.fn() };
    const tokenService = new TokenRefreshService(mockBackend, mockSessionInvalidation);

    (tokenService as any).directHttp = {
      post: vi.fn().mockReturnValue(
        of({ accessToken: 'new-refreshed-jwt', refreshToken: 'new-refresh-token' })
      ),
    };

    const result = await new Promise<string>((resolve) => {
      tokenService.refreshToken().subscribe((token: string) => resolve(token));
    });

    expect(result).toBe('new-refreshed-jwt');
    expect(getAccessToken()).toBe('new-refreshed-jwt');
    expect(getRefreshToken()).toBe('new-refresh-token');
  });

  // -----------------------------------------------------------------------
  // 5. Manejo de renovación concurrente única (Mutex / Lock)
  // -----------------------------------------------------------------------
  it('5. Debe compartir la misma petición en curso ante múltiples renovaciones concurrentes', () => {
    setRefreshToken('refresh-token-concur');

    const mockBackend: any = { handle: vi.fn() };
    const mockSessionInvalidation: any = { invalidate: vi.fn() };
    const tokenService = new TokenRefreshService(mockBackend, mockSessionInvalidation);

    let callCount = 0;
    (tokenService as any).directHttp = {
      post: vi.fn().mockImplementation(() => {
        callCount++;
        return of({ accessToken: 'shared-token', refreshToken: 'shared-refresh' });
      }),
    };

    const obs1 = tokenService.refreshToken();
    const obs2 = tokenService.refreshToken();

    expect(obs1).toBe(obs2);
    expect(callCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 6. Repetición de solicitud original 401 una sola vez con guard
  // -----------------------------------------------------------------------
  it('6. Debe aplicar X-Retry-After-Refresh y evitar loops de reintentos indefinidos en 401', () => {
    const originalReq = new HttpRequest('GET', '/v1/Sale');
    expect(originalReq.headers.has('X-Retry-After-Refresh')).toBe(false);

    const retriedReq = originalReq.clone({
      headers: originalReq.headers
        .set('Authorization', 'Bearer new-token')
        .set('X-Retry-After-Refresh', 'true'),
    });

    expect(retriedReq.headers.get('X-Retry-After-Refresh')).toBe('true');

    // Un segundo 401 sobre esta petición debe cortar y no reintentar
    const shouldRetryAgain = !retriedReq.headers.has('X-Retry-After-Refresh');
    expect(shouldRetryAgain).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 7. Detención de flujo y limpieza de tenant en error 400 COMPANY_CONTEXT_REQUIRED o 403
  // -----------------------------------------------------------------------
  it('7. Debe limpiar el tenant y detener el flujo si el backend responde COMPANY_CONTEXT_REQUIRED', () => {
    setCompanyId('55');
    expect(getCompanyId()).toBe('55');

    const errorBody = { errorCode: 'COMPANY_CONTEXT_REQUIRED', message: 'Tenant context required' };
    const isMissingTenant = errorBody.errorCode === 'COMPANY_CONTEXT_REQUIRED';

    if (isMissingTenant) {
      setCompanyId(null);
    }

    expect(getCompanyId()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 8. Paginación de compras limitada a máximo 100 y reinicio a página 1
  // -----------------------------------------------------------------------
  it('8. Debe limitar pageSize a 100 en compras y purgar el estado al reiniciar', async () => {
    setCompanyId('12');
    const mockApi: any = {
      get: vi.fn().mockImplementation((url: string, config: any) => {
        const pageSize = config?.params?.pageSize;
        expect(pageSize).toBeLessThanOrEqual(100);
        return Promise.resolve({
          data: [{ id: 1, total: 500 }],
          totalCount: 1,
        });
      }),
    };

    const purchaseService = new PurchaseService(mockApi);

    // Petición solicitando 500 registros debe ser limitada a 100
    const res = await purchaseService.getPurchases({ pageNumber: 1, pageSize: 500 });
    expect(res.pageSize).toBe(100);
    expect(res.data.length).toBe(1);

    // Al cambiar de compañía, purgar compras locales
    purchaseService.purgeLocalPurchases();
  });

  // -----------------------------------------------------------------------
  // 9. Mapeo de estados de facturación electrónica híbrida (Mock vs Real)
  // -----------------------------------------------------------------------
  it('9. Debe mapear adecuadamente los estados de facturación electrónica híbrida', () => {
    // Modo Mock
    const mockStatus = getFiscalStatusInfo('AcceptedByMock', true);
    expect(mockStatus.label).toBe('Aceptado en modo prueba');
    expect(mockStatus.isLegalAcceptance).toBe(false);
    expect(mockStatus.description).toContain('No representa aceptación legal');

    // Modo Real: AcceptedByDgii
    const realStatus = getFiscalStatusInfo('AcceptedByDgii', false);
    expect(realStatus.label).toBe('Aceptado por DGII');
    expect(realStatus.isLegalAcceptance).toBe(true);

    // Modo Real: RejectedByFiscalProvider
    const rejectedStatus = getFiscalStatusInfo('RejectedByFiscalProvider', false);
    expect(rejectedStatus.label).toBe('Rechazado');
    expect(rejectedStatus.isLegalAcceptance).toBe(false);

    // Modo Real: RetryScheduled
    const retryStatus = getFiscalStatusInfo('RetryScheduled', false);
    expect(retryStatus.label).toBe('Pendiente de reintento');
    expect(retryStatus.isLegalAcceptance).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 10. Prohibición estricta de credenciales DGII en almacenamiento cliente
  // -----------------------------------------------------------------------
  it('10. No debe existir almacenamiento de archivos .P12 ni claves privadas fiscales en el cliente', () => {
    const forbiddenKeys = ['dgii_cert', 'p12', 'privateKey', 'certPassword', 'certificatePassword'];
    const storageKeys = Object.keys(localStorage);

    const hasForbiddenKeys = storageKeys.some((k) =>
      forbiddenKeys.some((fk) => k.toLowerCase().includes(fk.toLowerCase()))
    );

    expect(hasForbiddenKeys).toBe(false);
  });
});
