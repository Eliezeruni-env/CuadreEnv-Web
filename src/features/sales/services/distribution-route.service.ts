import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { DistributionRoute, RouteLoadItem } from '../components/distribution-routes/distribution-routes.component';

@Injectable({
  providedIn: 'root',
})
export class DistributionRouteService {
  private readonly api = inject(ApiClientService);

  async getRoutes(params?: { status?: string; search?: string; date?: string }): Promise<ApiResponse<DistributionRoute[]>> {
    try {
      const res = await this.api.get<any, any>('/DistributionRoutes', { params });
      const data = Array.isArray(res) ? res : res?.data || [];
      return { success: true, data };
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/api/DistributionRoutes', { params });
        const data2 = Array.isArray(res2) ? res2 : res2?.data || [];
        return { success: true, data: data2 };
      } catch (err: any) {
        return { success: false, data: [], message: err?.message || 'Error al obtener rutas.' };
      }
    }
  }

  async getRouteById(id: number): Promise<ApiResponse<DistributionRoute>> {
    try {
      const res = await this.api.get<any, any>(`/DistributionRoutes/${id}`);
      return { success: true, data: res?.data || res };
    } catch {
      const res2 = await this.api.get<any, any>(`/api/DistributionRoutes/${id}`);
      return { success: true, data: res2?.data || res2 };
    }
  }

  async createRoute(data: any): Promise<ApiResponse<DistributionRoute>> {
    try {
      const res = await this.api.post<any, any>('/DistributionRoutes', data);
      return { success: true, data: res?.data || res };
    } catch {
      const res2 = await this.api.post<any, any>('/api/DistributionRoutes', data);
      return { success: true, data: res2?.data || res2 };
    }
  }

  async loadItems(id: number, data: any): Promise<ApiResponse<DistributionRoute>> {
    try {
      const res = await this.api.post<any, any>(`/DistributionRoutes/${id}/load-items`, data);
      return { success: true, data: res?.data || res };
    } catch {
      const res2 = await this.api.post<any, any>(`/api/DistributionRoutes/${id}/load-items`, data);
      return { success: true, data: res2?.data || res2 };
    }
  }

  async registerSale(id: number, data: any): Promise<ApiResponse<DistributionRoute>> {
    try {
      const res = await this.api.post<any, any>(`/DistributionRoutes/${id}/sale`, data);
      return { success: true, data: res?.data || res };
    } catch {
      const res2 = await this.api.post<any, any>(`/api/DistributionRoutes/${id}/sale`, data);
      return { success: true, data: res2?.data || res2 };
    }
  }

  async liquidateRoute(id: number, data: any): Promise<ApiResponse<DistributionRoute>> {
    try {
      const res = await this.api.post<any, any>(`/DistributionRoutes/${id}/liquidate`, data);
      return { success: true, data: res?.data || res };
    } catch {
      const res2 = await this.api.post<any, any>(`/api/DistributionRoutes/${id}/liquidate`, data);
      return { success: true, data: res2?.data || res2 };
    }
  }
}
