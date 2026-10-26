import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private readonly api = inject(ApiClientService);

  async getCategories(): Promise<ApiResponse<any[]>> {
    try {
      const res = await this.api.get<any, any>('/Category');
      const list = extractArray<any>(res);
      return { success: true, data: list };
    } catch (err: any) {
      if (err?.status === 404) {
        try {
          const res2 = await this.api.get<any, any>('/categories');
          return { success: true, data: extractArray<any>(res2) };
        } catch {
          // Fallback failed
        }
      }
      return { success: true, data: [] };
    }
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
