import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class ReportsService {
  private readonly api = inject(ApiClientService);

  async getSalesReport(from?: string, to?: string, period: string = 'day'): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>('/Reports/sales', {
      params: { from, to, period },
    });
    return { success: true, data: res };
  }

  async getTopProducts(from?: string, to?: string): Promise<ApiResponse<any[]>> {
    const res = await this.api.get<any, any>('/Reports/top-products', {
      params: { from, to },
    });
    return { success: true, data: extractArray<any>(res) };
  }

  async getInventoryStatus(): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>('/Reports/inventory-status');
    return { success: true, data: res };
  }

  async getActiveCustomersReport(from?: string, to?: string): Promise<ApiResponse<any[]>> {
    const res = await this.api.get<any, any>('/Reports/active-customers', {
      params: { from, to },
    });
    return { success: true, data: extractArray<any>(res) };
  }

  async getAccountsReceivableSummary(from?: string, to?: string): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>('/Reports/accounts-receivable-summary', {
      params: { from, to },
    });
    return { success: true, data: res };
  }
}
