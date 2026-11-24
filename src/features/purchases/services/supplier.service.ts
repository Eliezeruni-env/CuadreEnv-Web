import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray, getCompanyId } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

const SUPPLIERS_STORAGE_KEY_BASE = 'cuadreenv_suppliers_db';

function getSuppliersStorageKey(): string {
  const compId = getCompanyId();
  return compId ? `${SUPPLIERS_STORAGE_KEY_BASE}_${compId}` : `${SUPPLIERS_STORAGE_KEY_BASE}_none`;
}

@Injectable({
  providedIn: 'root',
})
export class SupplierService {
  private readonly api = inject(ApiClientService);

  getLocalSuppliers(): any[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = localStorage.getItem(getSuppliersStorageKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveLocalSuppliers(list: any[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(getSuppliersStorageKey(), JSON.stringify(list));
    } catch {}
  }

  async getSuppliers(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<any[]>> {
    try {
      const res = await this.api.get<any, any>('/Supplier', {
        params,
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      const list = extractArray<any>(res);
      if (list && list.length > 0) {
        this.saveLocalSuppliers(list);
        return { success: true, data: list };
      }
    } catch {}
    return { success: true, data: this.getLocalSuppliers() };
  }

  async getSupplier(id: number): Promise<ApiResponse<any>> {
    try {
      const res = await this.api.get<any, any>(`/Supplier/${id}`);
      return { success: true, data: res?.data ?? res };
    } catch {
      const found = this.getLocalSuppliers().find((s) => s.id === id);
      if (found) return { success: true, data: found };
    }
    return { success: false, message: 'Proveedor no encontrado.' };
  }

  async createSupplier(data: any): Promise<ApiResponse<any>> {
    const compId = getCompanyId();
    const newId = data.id || Date.now();
    const fullSupplier = {
      ...data,
      id: newId,
      companyId: compId ? Number(compId) : undefined,
      active: data.active !== false,
    };

    try {
      const res = await this.api.post<any, any>('/Supplier', fullSupplier, {
        headers: { 'X-Silent-500': 'true', 'X-Silent-Error': 'true' },
      });
      const created = res?.data ?? res ?? fullSupplier;
      const list = this.getLocalSuppliers();
      list.unshift(created);
      this.saveLocalSuppliers(list);
      return { success: true, data: created };
    } catch {
      const list = this.getLocalSuppliers();
      list.unshift(fullSupplier);
      this.saveLocalSuppliers(list);
      return { success: true, data: fullSupplier };
    }
  }

  async updateSupplier(data: any): Promise<void> {
    try {
      await this.api.put('/Supplier', data);
    } catch {}
    const list = this.getLocalSuppliers().map((s) => (s.id === data.id ? { ...s, ...data } : s));
    this.saveLocalSuppliers(list);
  }

  async deleteSupplier(id: number): Promise<void> {
    try {
      await this.api.delete(`/Supplier/${id}`);
    } catch {}
    const list = this.getLocalSuppliers().filter((s) => s.id !== id);
    this.saveLocalSuppliers(list);
  }
}
