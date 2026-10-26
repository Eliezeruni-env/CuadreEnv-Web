import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { throwError } from 'rxjs';
import { NotificationService } from '../../features/cuadreEnv/services/notification.service';
import { SessionInvalidationService } from '../../features/cuadreEnv/services/session-invalidation.service';
import { appHttpInterceptorFn } from './AppHttpInterceptor';

describe('appHttpInterceptorFn permission error handling', () => {
  it('does not toast a stale 403 after the allowed-module list changes', async () => {
    const notifications = { warning: vi.fn() };
    const request = new HttpRequest('GET', '/v1/sales');
    const error = new HttpErrorResponse({
      status: 403,
      statusText: 'Forbidden',
      error: { code: 'PERMISSION_DENIED', message: 'Permission denied.' },
    });
    sessionStorage.setItem('allowedModules', JSON.stringify([]));

    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationService, useValue: notifications },
        { provide: Router, useValue: { url: '/sales', navigate: vi.fn() } },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      appHttpInterceptorFn(request, () => {
        sessionStorage.setItem('allowedModules', JSON.stringify(['sales']));
        return throwError(() => error);
      }),
    );

    await new Promise<void>((resolve) => {
      result.subscribe({ error: () => resolve() });
    });
    expect(notifications.warning).not.toHaveBeenCalled();
    expect(notifications.warning).not.toHaveBeenCalled();
    sessionStorage.removeItem('allowedModules');
    TestBed.resetTestingModule();
  });

  it('keeps the current feature route for MODULE_ACCESS_DENIED responses', async () => {
    const notifications = { warning: vi.fn() };
    const navigate = vi.fn();
    const request = new HttpRequest('GET', '/v1/sales');
    const error = new HttpErrorResponse({
      status: 403,
      statusText: 'Forbidden',
      error: { errorCode: 'MODULE_ACCESS_DENIED', message: 'Access denied.' },
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationService, useValue: notifications },
        { provide: Router, useValue: { url: '/sales', navigate } },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      appHttpInterceptorFn(request, () => throwError(() => error)),
    );

    await new Promise<void>((resolve) => {
      result.subscribe({ error: () => resolve() });
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(notifications.warning).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
  });

  it('invalidates the session through a decoupled event on 401', async () => {
    const invalidate = vi.fn();
    const notifications = { error: vi.fn() };
    const request = new HttpRequest('GET', '/v1/users');
    const error = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });

    TestBed.configureTestingModule({
      providers: [
        { provide: SessionInvalidationService, useValue: { invalidate } },
        { provide: NotificationService, useValue: notifications },
        { provide: Router, useValue: { url: '/users', navigate: vi.fn() } },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      appHttpInterceptorFn(request, () => throwError(() => error)),
    );

    await new Promise<void>((resolve) => {
      result.subscribe({ error: () => resolve() });
    });

    expect(invalidate).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
  });
});
