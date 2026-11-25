import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type {
  AgendaDashboardDto,
  AppointmentListItemDto,
  ReservableServiceDto,
  ProfessionalDto,
  AgendaClientDto,
  AgendaReportsDto,
  AgendaSettingsDto,
  BookingPageSettingsDto,
  AvailableSlotDto,
  PublicBusinessProfileDto,
  PublicBookingRequestDto,
  PublicBookingConfirmationDto,
  AppointmentStatus,
  ProfessionalWeeklyScheduleDto,
  ProfessionalExceptionDto,
} from '../models/agenda.models';

@Injectable({
  providedIn: 'root',
})
export class AgendaService {
  private readonly api = inject(ApiClientService);

  // ================= ADMIN DASHBOARD & CALENDAR =================
  async getDashboard(): Promise<AgendaDashboardDto> {
    return await this.api.get<AgendaDashboardDto, any>('/Agenda/dashboard');
  }

  async getCalendar(start: string, end: string, professionalId?: number): Promise<AppointmentListItemDto[]> {
    const params: any = { start, end };
    if (professionalId) params.professionalId = professionalId;
    const res = await this.api.get<any, any>('/Agenda/calendar', { params });
    return extractArray<AppointmentListItemDto>(res);
  }

  // ================= APPOINTMENTS MANAGEMENT =================
  async getAppointments(filters?: {
    status?: AppointmentStatus;
    start?: string;
    end?: string;
    search?: string;
    professionalId?: number;
    serviceId?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: AppointmentListItemDto[]; totalCount: number }> {
    const res = await this.api.get<any, any>('/Agenda/appointments', { params: filters });
    if (res && res.items) {
      return { items: res.items, totalCount: res.totalCount || res.items.length };
    }
    const arr = extractArray<AppointmentListItemDto>(res);
    return { items: arr, totalCount: arr.length };
  }

  async createManualAppointment(request: {
    serviceId: number;
    professionalId?: number;
    startAt: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    notes?: string;
  }): Promise<AppointmentListItemDto> {
    return await this.api.post<AppointmentListItemDto, any>('/Agenda/appointments', request);
  }

  async updateAppointmentStatus(id: number, status: AppointmentStatus, cancellationReason?: string): Promise<void> {
    await this.api.put(`/Agenda/appointments/${id}/status`, { status, cancellationReason });
  }

  async rescheduleAppointment(id: number, newStartAt: string, newProfessionalId?: number): Promise<void> {
    await this.api.post(`/Agenda/appointments/${id}/reschedule`, { newStartAt, newProfessionalId });
  }

  async invoiceAppointment(id: number, paymentMethodId: number = 1): Promise<{ saleId: number; invoiceNumber: string }> {
    return await this.api.post<{ saleId: number; invoiceNumber: string }, any>(`/Agenda/appointments/${id}/invoice`, { paymentMethodId });
  }

  // ================= SERVICES =================
  async getServices(): Promise<ReservableServiceDto[]> {
    const res = await this.api.get<any, any>('/Agenda/services');
    return extractArray<ReservableServiceDto>(res);
  }

  async createService(service: {
    productId: number;
    durationMinutes: number;
    bufferMinutes?: number;
    isPublic: boolean;
    colorHex?: string;
    assignedProfessionalIds: number[];
  }): Promise<ReservableServiceDto> {
    return await this.api.post<ReservableServiceDto, any>('/Agenda/services', service);
  }

  async updateService(id: number, service: {
    durationMinutes: number;
    bufferMinutes?: number;
    isPublic: boolean;
    isActive: boolean;
    colorHex?: string;
    assignedProfessionalIds: number[];
  }): Promise<ReservableServiceDto> {
    return await this.api.put<ReservableServiceDto, any>(`/Agenda/services/${id}`, service);
  }

  // ================= PROFESSIONALS =================
  async getProfessionals(): Promise<ProfessionalDto[]> {
    const res = await this.api.get<any, any>('/Agenda/professionals');
    return extractArray<ProfessionalDto>(res);
  }

  async createProfessional(professional: {
    fullName: string;
    specialties: string;
    phone?: string;
    email?: string;
    colorHex?: string;
    isOwner?: boolean;
    assignedServiceIds: number[];
  }): Promise<ProfessionalDto> {
    return await this.api.post<ProfessionalDto, any>('/Agenda/professionals', professional);
  }

  async updateProfessional(id: number, professional: {
    fullName: string;
    specialties: string;
    phone?: string;
    email?: string;
    colorHex?: string;
    isActive: boolean;
    assignedServiceIds: number[];
  }): Promise<ProfessionalDto> {
    return await this.api.put<ProfessionalDto, any>(`/Agenda/professionals/${id}`, professional);
  }

  async updateProfessionalSchedule(id: number, schedules: ProfessionalWeeklyScheduleDto[]): Promise<void> {
    await this.api.put(`/Agenda/professionals/${id}/schedule`, schedules);
  }

  async addProfessionalException(id: number, exception: ProfessionalExceptionDto): Promise<void> {
    await this.api.post(`/Agenda/professionals/${id}/exception`, exception);
  }

  // ================= CRM CLIENTS =================
  async getClients(search?: string, month?: number): Promise<AgendaClientDto[]> {
    const params: any = {};
    if (search) params.search = search;
    if (month) params.month = month;
    const res = await this.api.get<any, any>('/Agenda/clients', { params });
    return extractArray<AgendaClientDto>(res);
  }

  async getClientHistory(customerId: number): Promise<AppointmentListItemDto[]> {
    const res = await this.api.get<any, any>(`/Agenda/clients/${customerId}/history`);
    return extractArray<AppointmentListItemDto>(res);
  }

  // ================= REPORTS =================
  async getReports(year?: number, month?: number): Promise<AgendaReportsDto> {
    const params: any = {};
    if (year) params.year = year;
    if (month) params.month = month;
    return await this.api.get<AgendaReportsDto, any>('/Agenda/reports', { params });
  }

  // ================= SETTINGS =================
  async getSettings(): Promise<AgendaSettingsDto> {
    return await this.api.get<AgendaSettingsDto, any>('/Agenda/settings');
  }

  async updateSettings(settings: AgendaSettingsDto): Promise<AgendaSettingsDto> {
    return await this.api.put<AgendaSettingsDto, any>('/Agenda/settings', settings);
  }

  // ================= BOOKING PAGE SETTINGS =================
  async getBookingPageSettings(): Promise<BookingPageSettingsDto> {
    return await this.api.get<BookingPageSettingsDto, any>('/Agenda/booking-page');
  }

  async updateBookingPageSettings(settings: BookingPageSettingsDto): Promise<BookingPageSettingsDto> {
    return await this.api.put<BookingPageSettingsDto, any>('/Agenda/booking-page', settings);
  }

  // ================= PUBLIC PORTAL CLIENT METHODS =================
  async getPublicProfile(slug: string): Promise<PublicBusinessProfileDto> {
    return await this.api.get<PublicBusinessProfileDto, any>(`/public/booking/${slug}`);
  }

  async getPublicSlots(slug: string, serviceId: number, date: string, professionalId?: number): Promise<AvailableSlotDto[]> {
    const params: any = { serviceId, date };
    if (professionalId) params.professionalId = professionalId;
    const res = await this.api.get<any, any>(`/public/booking/${slug}/slots`, { params });
    return extractArray<AvailableSlotDto>(res);
  }

  async reservePublicAppointment(request: PublicBookingRequestDto): Promise<PublicBookingConfirmationDto> {
    return await this.api.post<PublicBookingConfirmationDto, any>('/public/booking/reserve', request);
  }

  async getPublicAppointmentStatus(code: string, token?: string): Promise<any> {
    const params: any = {};
    if (token) params.token = token;
    return await this.api.get<any, any>(`/public/booking/status/${code}`, { params });
  }

  async cancelPublicAppointment(code: string, token: string, reason?: string): Promise<void> {
    await this.api.post('/public/booking/cancel', { bookingCode: code, managementToken: token, cancellationReason: reason });
  }

  async reschedulePublicAppointment(code: string, token: string, newStartAt: string): Promise<void> {
    await this.api.post('/public/booking/reschedule', { bookingCode: code, managementToken: token, newStartAt });
  }
}
