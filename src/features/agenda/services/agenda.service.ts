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
  private mapReservableServiceDto(raw: any): ReservableServiceDto {
    const profIds = Array.isArray(raw?.assignedProfessionalIds ?? raw?.AssignedProfessionalIds)
      ? (raw.assignedProfessionalIds ?? raw.AssignedProfessionalIds)
      : [];
    return {
      id: Number(raw?.id ?? raw?.Id ?? 0),
      productId: Number(raw?.productId ?? raw?.ProductId ?? 0),
      productName: raw?.productName ?? raw?.ProductName ?? 'Servicio',
      categoryName: raw?.categoryName ?? raw?.CategoryName ?? 'General',
      durationMinutes: Number(raw?.durationMinutes ?? raw?.DurationMinutes ?? 30),
      bufferMinutes: Number(raw?.bufferTimeMinutes ?? raw?.BufferTimeMinutes ?? raw?.bufferMinutes ?? raw?.BufferMinutes ?? 0),
      price: Number(raw?.price ?? raw?.Price ?? 0),
      isPublic: Boolean(raw?.isPubliclyBookable ?? raw?.IsPubliclyBookable ?? raw?.isPublic ?? raw?.IsPublic ?? true),
      isActive: Boolean(raw?.isActive ?? raw?.IsActive ?? raw?.active ?? raw?.Active ?? true),
      colorHex: (raw?.colorHex ?? raw?.ColorHex) || '#4f46e5',
      assignedProfessionalIds: profIds,
      assignedProfessionalsCount: profIds.length,
    };
  }

  async getServices(): Promise<ReservableServiceDto[]> {
    const res = await this.api.get<any, any>('/Agenda/services');
    const rawList = extractArray<any>(res);
    return rawList.map((item) => this.mapReservableServiceDto(item));
  }

  async createService(service: {
    id?: number;
    productId: number;
    durationMinutes: number;
    bufferMinutes?: number;
    bufferTimeMinutes?: number;
    isPublic?: boolean;
    isPubliclyBookable?: boolean;
    displayOrder?: number;
    isActive?: boolean;
    colorHex?: string;
    assignedProfessionalIds: number[];
  }): Promise<ReservableServiceDto> {
    const payload = {
      id: service.id ?? null,
      productId: Number(service.productId),
      durationMinutes: Number(service.durationMinutes || 30),
      bufferTimeMinutes: Number(service.bufferTimeMinutes ?? service.bufferMinutes ?? 0),
      isPubliclyBookable: service.isPubliclyBookable ?? service.isPublic ?? true,
      displayOrder: Number(service.displayOrder ?? 0),
      colorHex: service.colorHex || '#4f46e5',
      isActive: service.isActive !== false,
      assignedProfessionalIds: service.assignedProfessionalIds || [],
      // Alias properties for backwards compatibility
      bufferMinutes: Number(service.bufferTimeMinutes ?? service.bufferMinutes ?? 0),
      isPublic: service.isPubliclyBookable ?? service.isPublic ?? true,
    };
    const res = await this.api.post<any, any>('/Agenda/services', payload);
    return this.mapReservableServiceDto(res?.data ?? res);
  }

  async updateService(id: number, service: {
    productId?: number;
    durationMinutes: number;
    bufferMinutes?: number;
    bufferTimeMinutes?: number;
    isPublic?: boolean;
    isPubliclyBookable?: boolean;
    displayOrder?: number;
    isActive?: boolean;
    colorHex?: string;
    assignedProfessionalIds: number[];
  }): Promise<ReservableServiceDto> {
    const payload = {
      id: Number(id),
      productId: Number(service.productId || 0),
      durationMinutes: Number(service.durationMinutes || 30),
      bufferTimeMinutes: Number(service.bufferTimeMinutes ?? service.bufferMinutes ?? 0),
      isPubliclyBookable: service.isPubliclyBookable ?? service.isPublic ?? true,
      displayOrder: Number(service.displayOrder ?? 0),
      colorHex: service.colorHex || '#4f46e5',
      isActive: service.isActive !== false,
      assignedProfessionalIds: service.assignedProfessionalIds || [],
      bufferMinutes: Number(service.bufferTimeMinutes ?? service.bufferMinutes ?? 0),
      isPublic: service.isPubliclyBookable ?? service.isPublic ?? true,
    };
    const res = await this.api.put<any, any>(`/Agenda/services/${id}`, payload);
    return this.mapReservableServiceDto(res?.data ?? res);
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
    const res: any = await this.api.get<any, any>('/Agenda/booking-page');
    const raw = res?.data ?? res?.Data ?? res;
    return {
      vanitySlug: raw?.slug || raw?.Slug || raw?.vanitySlug || 'mi-negocio',
      businessName: raw?.businessName || raw?.BusinessName || 'Mi Negocio',
      businessDescription: raw?.description || raw?.Description || raw?.businessDescription || '',
      logoUrl: raw?.logoUrl || raw?.LogoUrl || '',
      bannerUrl: raw?.coverImageUrl || raw?.CoverImageUrl || raw?.bannerUrl || '',
      brandColorHex: raw?.brandColorHex || raw?.BrandColorHex || '#111827',
      contactWhatsApp: raw?.whatsAppNumber || raw?.WhatsAppNumber || raw?.contactWhatsApp || '',
      address: raw?.address || raw?.Address || '',
      isPublished: raw?.isPublicActive ?? raw?.IsPublicActive ?? raw?.isPublished ?? true,
      requireManualConfirmation: raw?.requireManualConfirmation ?? false,
    };
  }

  async updateBookingPageSettings(settings: BookingPageSettingsDto): Promise<BookingPageSettingsDto> {
    const payload = {
      slug: settings.vanitySlug?.trim()?.toLowerCase() || 'mi-negocio',
      businessName: settings.businessName?.trim() || 'Mi Negocio',
      description: settings.businessDescription?.trim() || '',
      logoUrl: settings.logoUrl?.trim() || null,
      coverImageUrl: settings.bannerUrl?.trim() || null,
      brandColorHex: settings.brandColorHex?.trim() || '#111827',
      address: settings.address?.trim() || null,
      whatsAppNumber: settings.contactWhatsApp?.trim() || null,
      isPublicActive: settings.isPublished ?? true,
    };
    return await this.api.put<BookingPageSettingsDto, any>('/Agenda/booking-page', payload);
  }

  // ================= PUBLIC PORTAL CLIENT METHODS =================
  async getPublicProfile(slug: string): Promise<PublicBusinessProfileDto> {
    const res: any = await this.api.get<any, any>(`/public/booking/${slug}`);
    const raw = res?.data ?? res?.Data ?? res;
    return {
      businessName: raw?.businessName || raw?.BusinessName || 'Mi Negocio',
      businessDescription: raw?.description || raw?.Description || raw?.businessDescription || '',
      logoUrl: raw?.logoUrl || raw?.LogoUrl || '',
      bannerUrl: raw?.coverImageUrl || raw?.CoverImageUrl || raw?.bannerUrl || '',
      brandColorHex: raw?.brandColorHex || raw?.BrandColorHex || '#111827',
      contactWhatsApp: raw?.whatsAppNumber || raw?.WhatsAppNumber || raw?.contactWhatsApp || '',
      address: raw?.address || raw?.Address || '',
      services: (raw?.services || raw?.Services || []).map((s: any) => ({
        id: s.id ?? s.Id,
        name: s.name ?? s.Name,
        price: Number(s.price ?? s.Price ?? 0),
        durationMinutes: Number(s.durationMinutes ?? s.DurationMinutes ?? 30),
        colorHex: (s.colorHex ?? s.ColorHex) || '#4f46e5',
        description: s.description ?? s.Description,
      })),
      professionals: (raw?.professionals || raw?.Professionals || []).map((p: any) => ({
        id: p.id ?? p.Id,
        fullName: p.displayName ?? p.DisplayName ?? p.fullName,
        specialties: p.specialtyTitle ?? p.SpecialtyTitle ?? p.specialties,
        assignedServiceIds: p.assignedServiceIds ?? p.AssignedServiceIds ?? [],
      })),
    };
  }

  async getPublicSlots(slug: string, serviceId: number, date: string, professionalId?: number): Promise<AvailableSlotDto[]> {
    const params: any = { serviceId, date };
    if (professionalId) params.professionalId = professionalId;
    const res: any = await this.api.get<any, any>(`/public/booking/${slug}/slots`, { params });
    const data = res?.data ?? res?.Data ?? res;
    if (data && Array.isArray(data.slots)) {
      return data.slots;
    }
    if (data && Array.isArray(data.Slots)) {
      return data.Slots;
    }
    return extractArray<AvailableSlotDto>(res);
  }

  async reservePublicAppointment(slug: string, request: PublicBookingRequestDto): Promise<PublicBookingConfirmationDto> {
    const payload = {
      appointmentServiceId: request.serviceId,
      professionalId: request.professionalId,
      startAt: request.startAt,
      customerName: request.customerName,
      customerPhone: request.customerPhone,
      customerEmail: request.customerEmail,
      notes: request.notes,
    };
    const res: any = await this.api.post<any, any>(`/public/booking/${slug}/reserve`, payload);
    const raw = res?.data ?? res?.Data ?? res;
    return {
      bookingCode: raw?.bookingCode || raw?.BookingCode || '',
      managementToken: raw?.managementToken || raw?.ManagementToken || '',
      startAt: raw?.startAt || raw?.StartAt || '',
      endAt: raw?.endAt || raw?.EndAt || '',
      status: raw?.status || raw?.Status || 'Pending',
      serviceName: raw?.serviceName || raw?.ServiceName || '',
      servicePrice: Number(raw?.price ?? raw?.Price ?? raw?.servicePrice ?? 0),
      professionalName: raw?.professionalName || raw?.ProfessionalName || '',
      businessName: raw?.businessName || raw?.BusinessName || '',
      contactWhatsApp: raw?.contactWhatsApp || raw?.ContactWhatsApp || '',
      address: raw?.businessAddress || raw?.address || '',
      brandColorHex: raw?.brandColorHex || '#111827',
    };
  }

  async getPublicAppointmentStatus(slug: string, code: string, token?: string): Promise<any> {
    const params: any = {};
    if (token) params.token = token;
    const res: any = await this.api.get<any, any>(`/public/booking/${slug}/status/${code}`, { params });
    return res?.data ?? res?.Data ?? res;
  }

  async cancelPublicAppointment(slug: string, code: string, token: string, reason?: string): Promise<void> {
    await this.api.post(`/public/booking/${slug}/cancel`, { bookingCode: code, managementToken: token, cancellationReason: reason });
  }

  async reschedulePublicAppointment(slug: string, code: string, token: string, newStartAt: string): Promise<void> {
    await this.api.post(`/public/booking/${slug}/reschedule`, { bookingCode: code, managementToken: token, newStartAt });
  }
}
