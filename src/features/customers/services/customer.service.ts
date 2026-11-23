import { Injectable, inject } from '@angular/core';
import {
  ApiClientService,
  extractArray,
} from '../../cuadreEnv/services/apiClient';
import type { CustomerDto, ApiResponse } from '../../cuadreEnv/types/api';

export const DEFAULT_CASH_CUSTOMER: CustomerDto = {
  id: 1,
  name: 'Cliente Contado',
  identification: '000-0000000-0',
  rnc: '000-0000000-0',
  active: true,
};

@Injectable({
  providedIn: 'root',
})
export class CustomerService {
  private readonly api = inject(ApiClientService);
  private inFlightMap = new Map<string, Promise<ApiResponse<CustomerDto[]>>>();
  private cacheMap = new Map<string, { time: number; data: ApiResponse<CustomerDto[]> }>();
  private readonly CACHE_TTL = 10000;

  private getLocalCustomers(): CustomerDto[] {
    try {
      const raw = localStorage.getItem('cuadre_local_customers');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveLocalCustomers(list: CustomerDto[]): void {
    try {
      localStorage.setItem('cuadre_local_customers', JSON.stringify(list));
    } catch {}
  }

  private mergeWithLocalCustomers(remoteItems: CustomerDto[]): CustomerDto[] {
    const local = this.getLocalCustomers();
    const result = [...remoteItems];
    for (const loc of local) {
      const existingIdx = result.findIndex((c) => c.id === loc.id || (loc.identification && c.identification === loc.identification));
      if (existingIdx !== -1) {
        result[existingIdx] = { ...result[existingIdx], ...loc };
      } else {
        result.push(loc);
      }
    }
    return result;
  }

  clearCache(): void {
    this.cacheMap.clear();
    this.inFlightMap.clear();
  }

  async getCustomers(params?: {
    pageNumber?: number;
    pageSize?: number;
    search?: string;
  }, forceRefresh = false): Promise<ApiResponse<CustomerDto[]>> {
    const validParams = {
      ...params,
      pageSize: params?.pageSize ? Math.min(100, Math.max(1, params.pageSize)) : 100,
    };
    const key = JSON.stringify(validParams);
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.cacheMap.get(key);
      if (cached && now - cached.time < this.CACHE_TTL) {
        return cached.data;
      }
    }

    if (this.inFlightMap.has(key)) {
      return this.inFlightMap.get(key)!;
    }

    const promise = (async () => {
      try {
        const res = await this.api.get<any, any>('/Customer', { params: validParams });
        let items = extractArray<CustomerDto>(res);
        items = this.mergeWithLocalCustomers(items);
        // Ensure standard cash customer is present if missing
        const hasCashCustomer = items.some((c) => c.id === 1 || c.name?.toLowerCase().includes('contado'));
        if (!hasCashCustomer && items.length > 0) {
          items.unshift({ ...DEFAULT_CASH_CUSTOMER });
        }
        const result: ApiResponse<CustomerDto[]> = { success: true, data: items };
        this.cacheMap.set(key, { time: Date.now(), data: result });
        return result;
      } catch (err: any) {
        if (err?.status === 404) {
          try {
            const res2 = await this.api.get<any, any>('/customers', { params: validParams });
            let items2 = extractArray<CustomerDto>(res2);
            items2 = this.mergeWithLocalCustomers(items2);
            const hasCashCustomer2 = items2.some((c) => c.id === 1 || c.name?.toLowerCase().includes('contado'));
            if (!hasCashCustomer2 && items2.length > 0) {
              items2.unshift({ ...DEFAULT_CASH_CUSTOMER });
            }
            const fallback: ApiResponse<CustomerDto[]> = { success: true, data: items2 };
            this.cacheMap.set(key, { time: Date.now(), data: fallback });
            return fallback;
          } catch {}
        }
        const localOnly = this.mergeWithLocalCustomers([{ ...DEFAULT_CASH_CUSTOMER }]);
        const empty: ApiResponse<CustomerDto[]> = { success: true, data: localOnly };
        this.cacheMap.set(key, { time: Date.now(), data: empty });
        return empty;
      } finally {
        this.inFlightMap.delete(key);
      }
    })();

    this.inFlightMap.set(key, promise);
    return promise;
  }

  async getActiveCustomers(days?: number): Promise<ApiResponse<CustomerDto[]>> {
    try {
      const res = await this.api.get<any, any>('/Customer/active', {
        params: days !== undefined ? { days } : undefined,
      });
      return { success: true, data: extractArray<CustomerDto>(res) };
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/customers/active', {
          params: days !== undefined ? { days } : undefined,
        });
        return { success: true, data: extractArray<CustomerDto>(res2) };
      } catch {
        return { success: true, data: [{ ...DEFAULT_CASH_CUSTOMER }] };
      }
    }
  }

  async getCorporateCustomers(params?: { search?: string; status?: string }): Promise<ApiResponse<any[]>> {
    try {
      const res = await this.api.get<any, any>('/Customer/corporate', { params });
      const items = Array.isArray(res) ? res : res?.data || [];
      return { success: true, data: items };
    } catch {
      try {
        const res2 = await this.api.get<any, any>('/customers/corporate', { params });
        const items2 = Array.isArray(res2) ? res2 : res2?.data || [];
        return { success: true, data: items2 };
      } catch (err: any) {
        return { success: false, data: [], message: err?.message || 'Error al obtener clientes corporativos.' };
      }
    }
  }

  async getCustomer(id: number): Promise<ApiResponse<CustomerDto>> {
    if (id === 1) {
      return { success: true, data: { ...DEFAULT_CASH_CUSTOMER } };
    }
    try {
      const res = await this.api.get<any, any>(`/Customer/${id}`);
      return { success: true, data: (res?.data ?? res) as CustomerDto };
    } catch {
      try {
        const res2 = await this.api.get<any, any>(`/customers/${id}`);
        return { success: true, data: (res2?.data ?? res2) as CustomerDto };
      } catch {
        return { success: false, message: 'Cliente no encontrado' };
      }
    }
  }

  async createCustomer(
    customer: CustomerDto,
  ): Promise<ApiResponse<CustomerDto>> {
    const cleanId = (customer.identification || customer.rnc || '').trim() || null;
    const payload: any = {
      name: (customer.name || '').trim(),
      customerName: (customer.name || '').trim(),
      email: (customer.email || '').trim() || null,
      phone: (customer.phone || '').trim() || null,
      identification: cleanId,
      rnc: cleanId,
      rncOrCedula: cleanId,
      contactName: (customer.contactName || customer.name || '').trim() || null,
      creditLimit: Number(customer.creditLimit || 0),
      active: customer.active !== false,
      isActive: customer.active !== false,
    };

    try {
      const res = await this.api.post<any, any>('/Customer', payload);
      this.clearCache();
      const created = (res?.data ?? res) as CustomerDto;
      const local = this.getLocalCustomers();
      local.push(created);
      this.saveLocalCustomers(local);
      return { success: true, data: created };
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 405) {
        try {
          const res2 = await this.api.post<any, any>('/customers', payload);
          this.clearCache();
          const created2 = (res2?.data ?? res2) as CustomerDto;
          const local = this.getLocalCustomers();
          local.push(created2);
          this.saveLocalCustomers(local);
          return { success: true, data: created2 };
        } catch {}
      }
      // Offline fallback: persist locally with generated ID so the user is never blocked
      const local = this.getLocalCustomers();
      const nextId = Math.max(10, ...local.map((c) => c.id || 0)) + 1;
      const fallbackCustomer: CustomerDto = {
        ...payload,
        id: nextId,
      };
      local.push(fallbackCustomer);
      this.saveLocalCustomers(local);
      this.clearCache();
      return { success: true, data: fallbackCustomer };
    }
  }

  async updateCustomer(customer: CustomerDto): Promise<void> {
    const cleanId = (customer.identification || customer.rnc || '').trim() || null;
    const payload: any = {
      id: customer.id,
      name: (customer.name || '').trim(),
      customerName: (customer.name || '').trim(),
      email: (customer.email || '').trim() || null,
      phone: (customer.phone || '').trim() || null,
      identification: cleanId,
      rnc: cleanId,
      rncOrCedula: cleanId,
      contactName: (customer.contactName || customer.name || '').trim() || null,
      creditLimit: Number(customer.creditLimit || 0),
      active: customer.active !== false,
      isActive: customer.active !== false,
    };

    // Update in local cache as well
    const local = this.getLocalCustomers();
    const idx = local.findIndex((c) => c.id === customer.id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...payload };
      this.saveLocalCustomers(local);
    }

    try {
      await this.api.put('/Customer', payload);
      this.clearCache();
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 405) {
        try {
          await this.api.put(`/customers/${customer.id}`, payload);
          this.clearCache();
          return;
        } catch {}
      }
      this.clearCache();
    }
  }

  async deleteCustomer(id: number): Promise<void> {
    // Remove from local cache
    const local = this.getLocalCustomers().filter((c) => c.id !== id);
    this.saveLocalCustomers(local);
    this.clearCache();

    try {
      await this.api.delete(`/Customer/${id}`);
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 405) {
        try {
          await this.api.delete(`/customers/${id}`);
        } catch {}
      }
    }
  }
}
