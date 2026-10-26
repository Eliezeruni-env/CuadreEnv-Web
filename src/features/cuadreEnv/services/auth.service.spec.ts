import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import {
  ApiClientService,
  setAccessToken,
  getAccessToken,
  setRefreshToken,
} from './apiClient';

describe('AuthService & Session Persistence', () => {
  let mockRouter: any;
  let mockApiClient: any;

  beforeEach(() => {
    if (typeof window !== 'undefined') {
      if (window.sessionStorage) window.sessionStorage.clear();
      if (window.localStorage) window.localStorage.clear();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
    }
    setAccessToken(null);
    setRefreshToken(null);

    mockRouter = {
      navigate: vi.fn(),
    };
    mockApiClient = {
      post: vi.fn(),
      postWithoutInterceptors: vi.fn(),
      get: vi.fn().mockResolvedValue({ assignedModules: [], licensedModules: ['*'] }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: mockRouter },
        { provide: ApiClientService, useValue: mockApiClient },
      ],
    });
  });

  it('requires a fresh login when a cached JWT has no assigned modules', () => {
    // Fake JWT payload: { sub: "42", email: "admin@cuadre.com", role: "Admin", isSuperUser: true, exp: 9999999999 }
    const fakePayload = {
      sub: '42',
      email: 'admin@cuadre.com',
      role: 'Admin',
      isSuperUser: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(fakePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const fakeToken = `eyJhbGciOiJIUzI1NiJ9.${base64Payload}.signature`;

    setAccessToken(fakeToken);

    // Instantiate AuthService via TestBed
    const authService = TestBed.inject(AuthService);

    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.currentUser()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('uses allowedModules from the login user object as the authoritative module list', () => {
    const fakePayload = {
      sub: '42',
      email: 'user@cuadre.com',
      modules: ['*'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(fakePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const authService = TestBed.inject(AuthService);

    authService.applyTokenResponse({
      accessToken: `header.${base64Payload}.signature`,
      user: { allowedModules: ['sales', 'cashregister'] },
    });

    expect(authService.allowedModules()).toEqual(['sales', 'cashregister']);
    expect(authService.currentUser()?.allowedModules).toEqual(['sales', 'cashregister']);
    expect(authService.hasExplicitModuleClaims()).toBe(true);
  });

  it('parses AllowedModulesJson from the login user object as the authoritative module list', () => {
    const fakePayload = {
      sub: '42',
      email: 'user@cuadre.com',
      modules: ['*'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(fakePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const authService = TestBed.inject(AuthService);

    authService.applyTokenResponse({
      accessToken: `header.${base64Payload}.signature`,
      user: { AllowedModulesJson: '["sales","cashregister","customers"]' },
    });

    expect(authService.allowedModules()).toEqual(['sales', 'cashregister', 'customers']);
    expect(authService.currentUser()?.allowedModules).toEqual(['sales', 'cashregister', 'customers']);
    expect(authService.hasExplicitModuleClaims()).toBe(true);
  });

  it('uses user.modules when the login response omits allowedModules', () => {
    const fakePayload = {
      sub: '42',
      email: 'user@cuadre.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(fakePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const authService = TestBed.inject(AuthService);

    authService.applyTokenResponse({
      accessToken: `header.${base64Payload}.signature`,
      user: { modules: ['cash-register', 'customers'] },
    });

    expect(authService.allowedModules()).toEqual(['cash-register', 'customers']);
  });

  it('restores and preserves literal allowed modules from JWT claims', () => {
    const fakePayload = {
      sub: '42',
      allowedModules: ['cash-register', 'inventory-stock', 'customers'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(fakePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    setAccessToken(`header.${base64Payload}.signature`);
    const authService = TestBed.inject(AuthService);
    authService.licensedModules.set(['*']);

    expect(authService.allowedModules()).toEqual(['cash-register', 'inventory-stock', 'customers']);
    expect(authService.hasModule('cash-register')).toBe(true);
    expect(authService.hasModule('inventory-stock')).toBe(true);
    expect(authService.hasModule('billing')).toBe(false);
  });

  it('refreshes a cached session on startup to replace stale module claims', async () => {
    const oldPayload = {
      sub: '42',
      allowedModules: ['sales', 'billing'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const freshPayload = {
      sub: '42',
      allowedModules: ['sales'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const toToken = (payload: object) => {
      const base64Payload = btoa(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return `header.${base64Payload}.signature`;
    };
    setAccessToken(toToken(oldPayload));
    setRefreshToken('cached-refresh-token');
    mockApiClient.postWithoutInterceptors.mockResolvedValue({
      accessToken: toToken(freshPayload),
      refreshToken: 'rotated-refresh-token',
    });
    mockApiClient.get.mockResolvedValue({
      assignedModules: ['sales'],
      licensedModules: ['*'],
    });

    const authService = TestBed.inject(AuthService);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockApiClient.postWithoutInterceptors).toHaveBeenCalledWith('/auth/refresh', {
      refreshToken: 'cached-refresh-token',
      accessToken: toToken(oldPayload),
    });
    expect(authService.allowedModules()).toEqual(['sales']);
    expect(sessionStorage.getItem('allowedModules')).toBe('["sales"]');
  });

  it('keeps a valid access-token session when startup refresh is temporarily rejected', async () => {
    const payload = {
      sub: '42',
      allowedModules: ['sales'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const accessToken = `header.${base64Payload}.signature`;
    setAccessToken(accessToken);
    setRefreshToken('expired-refresh-token');
    mockApiClient.postWithoutInterceptors.mockRejectedValue({ status: 401, message: 'Refresh token expired' });
    mockApiClient.get.mockResolvedValue({
      assignedModules: ['sales'],
      modules: ['sales'],
      licensedModules: ['*'],
    });

    const authService = TestBed.inject(AuthService);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.allowedModules()).toEqual(['sales']);
    expect(getAccessToken()).toBe(accessToken);
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('refreshes permissions after a module change to the signed-in user only', async () => {
    const freshPayload = {
      sub: '42',
      allowedModules: ['customers'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(freshPayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const authService = TestBed.inject(AuthService);
    authService.applyTokenResponse({
      accessToken: `header.${base64Payload}.signature`,
    });
    authService.allowedModules.set(['sales', 'billing']);
    sessionStorage.setItem('allowedModules', '["sales","billing"]');
    setRefreshToken('current-refresh-token');
    mockApiClient.postWithoutInterceptors.mockResolvedValue({
      accessToken: `header.${base64Payload}.signature`,
      refreshToken: 'rotated-refresh-token',
    });
    mockApiClient.get.mockResolvedValue({
      assignedModules: ['customers'],
      licensedModules: ['*'],
    });

    expect(await authService.refreshPermissionsForUser(99)).toBe(false);
    expect(mockApiClient.postWithoutInterceptors).not.toHaveBeenCalled();
    expect(authService.allowedModules()).toEqual(['sales', 'billing']);

    expect(await authService.refreshPermissionsForUser(42)).toBe(true);
    expect(authService.allowedModules()).toEqual(['customers']);
    expect(sessionStorage.getItem('allowedModules')).toBe('["customers"]');
  });

  it('clears a cached session whose JWT explicitly has no assigned modules', () => {
    const fakePayload = {
      sub: '42',
      allowedModules: [],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(fakePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    setAccessToken(`header.${base64Payload}.signature`);

    const authService = TestBed.inject(AuthService);

    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.allowedModules()).toEqual([]);
    expect(getAccessToken()).toBeNull();
  });

  it('preserves the active module list when a renewed JWT omits module claims', () => {
    const fakePayload = {
      sub: '42',
      email: 'user@cuadre.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(fakePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const authService = TestBed.inject(AuthService);
    authService.allowedModules.set(['sales', 'cashregister']);
    authService.hasExplicitModuleClaims.set(true);
    sessionStorage.setItem('allowedModules', JSON.stringify(['billing']));
    authService.applyTokenResponse({ accessToken: `header.${base64Payload}.signature` });
    authService.licensedModules.set(['*']);

    expect(authService.allowedModules()).toEqual(['sales', 'cashregister']);
    expect(authService.hasModule('cash-register')).toBe(true);
    expect(sessionStorage.getItem('allowedModules')).toBe('["sales","cashregister"]');
  });

  it('clears stale cached permissions before applying the modules from a new login', async () => {
    const fakePayload = {
      sub: '43',
      allowedModules: ['sales'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const base64Payload = btoa(JSON.stringify(fakePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    mockApiClient.post.mockResolvedValue({
      accessToken: `header.${base64Payload}.signature`,
      refreshToken: 'new-refresh-token',
      user: { allowedModules: ['sales'] },
    });
    mockApiClient.get.mockResolvedValue({
      assignedModules: ['sales'],
      licensedModules: ['sales'],
    });
    localStorage.setItem('allowedModules', '["billing"]');
    const authService = TestBed.inject(AuthService);

    await authService.login({ email: 'new@cuadre.com', password: 'password' });

    expect(localStorage.getItem('allowedModules')).toBeNull();
    expect(authService.allowedModules()).toEqual(['sales']);
    expect(authService.hasModule('sales')).toBe(true);
    expect(authService.hasModule('billing')).toBe(false);
  });

  it('intersects wildcard user access with company modules returned by the API', async () => {
    const payload = {
      sub: '42',
      allowedModules: ['*'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    mockApiClient.get.mockResolvedValue({
      assignedModules: ['*'],
      licensedModules: ['audit', 'company'],
      modules: ['audit', 'company'],
      hasAllModules: false,
    });
    const authService = TestBed.inject(AuthService);
    authService.applyTokenResponse({ accessToken: `header.${encoded}.signature` });

    expect(authService.hasModule('audit')).toBe(false);
    expect(await authService.refreshModuleEntitlements()).toBe(true);
    expect(mockApiClient.get).toHaveBeenCalledWith('/auth/me/modules');
    expect(authService.hasModule('fraud-guardian')).toBe(true);
    expect(authService.hasModule('admin-roles')).toBe(true);
    expect(authService.hasModule('billing')).toBe(false);
  });

  it('fails closed when the company entitlement endpoint cannot be loaded', async () => {
    const payload = {
      sub: '42',
      allowedModules: ['*'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    mockApiClient.get.mockRejectedValue(new Error('404 Not Found'));
    const authService = TestBed.inject(AuthService);
    authService.applyTokenResponse({ accessToken: `header.${encoded}.signature` });

    expect(await authService.refreshModuleEntitlements()).toBe(false);
    expect(authService.licensedModules()).toEqual([]);
    expect(authService.hasModule('sales')).toBe(false);
  });

  it('updates the active module list when USM changes the user assignments', async () => {
    const payload = {
      sub: '42',
      allowedModules: ['sales', 'billing'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const authService = TestBed.inject(AuthService);
    authService.applyTokenResponse({ accessToken: `header.${encoded}.signature` });
    authService.allowedModules.set(['sales', 'billing']);
    mockApiClient.get.mockResolvedValue({
      assignedModules: ['sales', 'customers'],
      licensedModules: ['sales', 'customers', 'billing'],
    });

    expect(await authService.refreshModuleEntitlements(true)).toBe(true);
    expect(authService.allowedModules()).toEqual(['sales', 'customers']);
    expect(sessionStorage.getItem('allowedModules')).toBe('["sales","customers"]');
    expect(authService.hasModule('sales')).toBe(true);
    expect(authService.hasModule('billing')).toBe(false);
    expect(authService.hasModule('customers')).toBe(true);
  });

  it('should clear sessionStorage and reset signals on logout', () => {
    setAccessToken('any-token');
    const authService = TestBed.inject(AuthService);

    authService.logout();

    expect(getAccessToken()).toBeNull();
    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.currentUser()).toBeNull();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
