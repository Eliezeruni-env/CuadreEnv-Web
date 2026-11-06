import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private readonly api = inject(ApiClientService);
  private inFlightCategories: Promise<ApiResponse<any[]>> | null = null;
  private cachedCategories: ApiResponse<any[]> | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL = 15000;

  async getCategories(forceRefresh = false): Promise<ApiResponse<any[]>> {
    const now = Date.now();
    if (!forceRefresh && this.cachedCategories && now - this.lastFetchTime < this.CACHE_TTL) {
      return this.cachedCategories;
    }
    if (this.inFlightCategories) {
      return this.inFlightCategories;
    }

    this.inFlightCategories = (async () => {
      try {
        const res = await this.api.get<any, any>('/Category');
        const list = extractArray<any>(res);
        const result: ApiResponse<any[]> = { success: true, data: list };
        this.lastFetchTime = Date.now();
        this.cachedCategories = result;
        return result;
      } catch (err: any) {
        if (err?.status === 404) {
          try {
            const res2 = await this.api.get<any, any>('/categories');
            const fallback: ApiResponse<any[]> = { success: true, data: extractArray<any>(res2) };
            this.lastFetchTime = Date.now();
            this.cachedCategories = fallback;
            return fallback;
          } catch {}
        }
        const empty: ApiResponse<any[]> = { success: true, data: [] };
        this.lastFetchTime = Date.now();
        this.cachedCategories = empty;
        return empty;
      } finally {
        this.inFlightCategories = null;
      }
    })();

    return this.inFlightCategories;
  }

  async createCategory(category: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/Category', category);
    return { success: true, data: res };
  }

  async getCategory(id: number): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>(`/Category/${id}`);
    return { success: true, data: res };
  }

  async updateCategory(id: number, category: any): Promise<ApiResponse<any>> {
    let res: any;
    try {
      res = await this.api.put<any, any>(`/Category/${id}`, { id, ...category });
    } catch {
      try {
        res = await this.api.put<any, any>('/Category', { id, ...category });
      } catch {
        res = await this.api.post<any, any>(`/Category/${id}`, { id, ...category });
      }
    }
    return { success: true, data: res };
  }

  async deleteCategory(id: number): Promise<void> {
    await this.api.delete(`/Category/${id}`);
  }
}
