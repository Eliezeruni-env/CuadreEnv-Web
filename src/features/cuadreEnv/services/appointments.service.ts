import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from './apiClient';
import type { ApiResponse } from '../types/api';

@Injectable({
  providedIn: 'root',
})
export class AppointmentsService {
  private readonly api = inject(ApiClientService);

  async getAppointments(params?: {
    pageNumber?: number;
    pageSize?: number;
  }): Promise<ApiResponse<any[]>> {
    const res = await this.api.get<any, any>('/Appointments', { params });
    return { success: true, data: extractArray<any>(res) };
  }

  async getAppointment(id: number): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>(`/Appointments/${id}`);
    return { success: true, data: res };
  }

  async createAppointment(appointment: any): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/Appointments', appointment);
    return { success: true, data: res };
  }

  async updateAppointment(id: number, appointment: any): Promise<void> {
    await this.api.put(`/Appointments/${id}`, appointment);
  }

  async deleteAppointment(id: number): Promise<void> {
    await this.api.delete(`/Appointments/${id}`);
  }
}
