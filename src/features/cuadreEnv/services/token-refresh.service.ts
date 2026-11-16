import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError, shareReplay, finalize } from 'rxjs/operators';
import {
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  getCompanyId,
  setCompanyId,
} from './apiClient';
import { SessionInvalidationService } from './session-invalidation.service';
import { environment } from '../../../environments/environment';

export interface RefreshResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

@Injectable({
  providedIn: 'root',
})
export class TokenRefreshService {
  private httpBackend: HttpBackend;
  private sessionInvalidation: SessionInvalidationService;
  
  // Direct HttpClient created with HttpBackend to bypass all interceptors
  private directHttp!: HttpClient;

  // Single in-flight observable lock for concurrent refreshes
  private refreshInFlight$: Observable<string> | null = null;

  constructor(
    httpBackend?: HttpBackend,
    sessionInvalidation?: SessionInvalidationService
  ) {
    this.httpBackend = httpBackend ?? inject(HttpBackend, { optional: true })!;
    this.sessionInvalidation = sessionInvalidation ?? inject(SessionInvalidationService, { optional: true })!;
    if (this.httpBackend) {
      this.directHttp = new HttpClient(this.httpBackend);
    }
  }

  /**
   * Executes token refresh using direct HttpClient (no interceptors)
   * with a concurrency mutex lock.
   */
  refreshToken(): Observable<string> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    const currentRefreshToken = getRefreshToken();
    if (!currentRefreshToken) {
      this.handleRefreshFailure('No refresh token available');
      return throwError(() => new Error('NO_REFRESH_TOKEN'));
    }

    const currentAccessToken = getAccessToken();
    const activeCompany = getCompanyId();
    const baseUrl = environment.apiUrl || 'http://localhost:8080/v1';
    const refreshUrl = `${baseUrl.replace(/\/+$/, '')}/auth/refresh`;

    const request$ = this.directHttp
      .post<any>(
        refreshUrl,
        {
          refreshToken: currentRefreshToken,
          accessToken: currentAccessToken,
        },
        {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
            'X-Skip-Interceptor': 'true',
          }),
        }
      )
      .pipe(
        map((res: any) => {
          const newAccess =
            res?.accessToken ||
            res?.AccessToken ||
            res?.token ||
            res?.Token ||
            res?.data?.accessToken ||
            res?.data?.token;

          const newRefresh =
            res?.refreshToken ||
            res?.RefreshToken ||
            res?.data?.refreshToken ||
            currentRefreshToken;

          if (!newAccess) {
            throw new Error('API did not return a valid access token');
          }

          setAccessToken(newAccess);
          setRefreshToken(newRefresh);

          // Verify that refreshed token retains active company context
          this.verifyCompanyClaim(newAccess, activeCompany);

          return newAccess;
        }),
        catchError((err) => {
          this.handleRefreshFailure(err);
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay(1)
      );

    this.refreshInFlight$ = request$;
    return request$;
  }

  private verifyCompanyClaim(jwtToken: string, activeCompanyId: string | number | null): void {
    if (!activeCompanyId) return;

    try {
      const parts = jwtToken.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(jsonPayload);
        const tokenCompId =
          payload.companyId ||
          payload.CompanyId ||
          payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/groupsid'];

        if (tokenCompId != null && String(tokenCompId) !== String(activeCompanyId)) {
          console.warn('[TokenRefresh] Compañía activa ya no coincide con el nuevo token, invalidando selección de compañía.');
          setCompanyId(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cuadre_company_context_invalidated'));
          }
        }
      }
    } catch {
      // Ignore decoding error
    }
  }

  private handleRefreshFailure(err: any): void {
    setAccessToken(null);
    setRefreshToken(null);
    if (this.sessionInvalidation) {
      this.sessionInvalidation.invalidate();
    }
  }
}
