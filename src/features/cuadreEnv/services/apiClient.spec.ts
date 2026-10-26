import '@angular/compiler';
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  API_BASE_URL,
  unwrap,
  setAccessToken,
  getAccessToken,
  setRefreshToken,
  doRefresh,
  extractArray,
  type ApiClientService,
} from './apiClient';
import { environment } from '../../../environments/environment';

describe('ApiClient Central HTTP & /v1 configuration', () => {
  afterEach(() => {
    setAccessToken(null);
    setRefreshToken(null);
  });

  it('should use the Angular API base URL', () => {
    expect(API_BASE_URL).toBe(environment.API_BASE_URL);
  });

  it('should store and retrieve access token for Authorization header', () => {
    setAccessToken('test-token-123');
    expect(getAccessToken()).toEqual('test-token-123');
  });

  it('does not reuse an expired access token when refresh fails', async () => {
    setAccessToken('expired-access-token');
    setRefreshToken('refresh-token');
    const refreshError = { status: 0, message: 'API unavailable' };
    const client = {
      postWithoutInterceptors: vi.fn().mockRejectedValue(refreshError),
    } as unknown as ApiClientService;

    await expect(doRefresh(client)).rejects.toBe(refreshError);
    expect(client.postWithoutInterceptors).toHaveBeenCalledWith('/auth/refresh', {
      refreshToken: 'refresh-token',
      accessToken: 'expired-access-token',
    });
  });

  it('keeps the current access token when an invalid refresh token is rejected', async () => {
    setAccessToken('still-valid-access-token');
    setRefreshToken('expired-refresh-token');
    const refreshError = { status: 401, message: 'Refresh token expired' };
    const client = {
      postWithoutInterceptors: vi.fn().mockRejectedValue(refreshError),
    } as unknown as ApiClientService;

    await expect(doRefresh(client)).rejects.toBe(refreshError);

    expect(getAccessToken()).toBe('still-valid-access-token');
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  describe('unwrap function', () => {
    it('should unwrap payload from ApiResponse<T> when success is true', () => {
      const apiResponse = {
        success: true,
        data: { id: 10, name: 'Acme Corp' },
        message: 'Success',
      };
      const result = unwrap(apiResponse);
      expect(result).toEqual({ id: 10, name: 'Acme Corp' });
    });

    it('should throw error with message and errors when ApiResponse success is false', () => {
      const apiResponse = {
        success: false,
        data: null,
        message: 'Invalid payload',
        errors: ['Field X is required'],
      };
      expect(() => unwrap(apiResponse)).toThrowError('Invalid payload');
      try {
        unwrap(apiResponse);
      } catch (err: any) {
        expect(err.errors).toEqual(['Field X is required']);
      }
    });

    it('should return raw DTO as-is when body is not an ApiResponse wrapper (e.g. /companysettings)', () => {
      const rawDto = {
        companyId: 1,
        theme: 'dark',
        maxUsers: 50,
      };
      const result = unwrap(rawDto);
      expect(result).toEqual(rawDto);
    });
  });

  describe('extractArray function', () => {
    it('should extract array from wrapped ApiResponse', () => {
      const response = {
        success: true,
        data: [{ id: 1 }, { id: 2 }],
      };
      expect(extractArray(response)).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should return direct array as-is', () => {
      expect(extractArray([{ id: 1 }])).toEqual([{ id: 1 }]);
    });

    it('should return empty array for null or undefined', () => {
      expect(extractArray(null)).toEqual([]);
    });
  });
});
