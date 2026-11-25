export enum AppointmentStatus {
  Pending = 0,
  Confirmed = 1,
  Completed = 2,
  Cancelled = 3,
  NoShow = 4,
  InProgress = 5,
  Rescheduled = 6,
  Expired = 8,
}

export enum AppointmentBillingStatus {
  Unbilled = 0,
  Invoiced = 1,
  PartiallyPaid = 2,
  Paid = 3,
  Refunded = 4,
}

export enum AppointmentOrigin {
  Manual = 0,
  Web = 1,
  Mobile = 2,
  Recurring = 3,
}

export enum AppointmentConfirmationMode {
  Automatic = 0,
  Manual = 1,
}

export interface AvailableSlotDto {
  startAt: string;
  endAt: string;
  professionalId: number;
  professionalName: string;
}

export interface AgendaDashboardKpisDto {
  appointmentsToday: number;
  pendingCount: number;
  confirmedCount: number;
  invoicedRevenue: number;
  totalMonthAppointments: number;
  attendanceRate: number;
  occupancyRate: number;
}

export interface WeeklyOccupancyDto {
  dayName: string;
  date: string;
  occupancyPercentage: number;
}

export interface AppointmentListItemDto {
  id: number;
  bookingCode: string;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceId: number;
  serviceName: string;
  servicePrice: number;
  professionalId?: number;
  professionalName?: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  origin: AppointmentOrigin;
  status: AppointmentStatus;
  billingStatus: AppointmentBillingStatus;
  saleId?: number;
  invoiceNumber?: string;
  notes?: string;
  expiresAt?: string;
}

export interface AgendaDashboardDto {
  kpis: AgendaDashboardKpisDto;
  todayTimeline: AppointmentListItemDto[];
  pendingRequests: AppointmentListItemDto[];
  weeklyOccupancy: WeeklyOccupancyDto[];
  upcomingAppointments: AppointmentListItemDto[];
}

export interface ReservableServiceDto {
  id: number;
  productId: number;
  productName: string;
  categoryName: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  isPublic: boolean;
  isActive: boolean;
  colorHex: string;
  assignedProfessionalIds: number[];
  assignedProfessionalsCount: number;
}

export interface ProfessionalWeeklyScheduleDto {
  id?: number;
  dayOfWeek: number; // 0=Sunday, 1=Monday... 6=Saturday
  isWorkingDay: boolean;
  startTime: string; // "09:00:00"
  endTime: string;   // "18:00:00"
  breakStartTime?: string; // "12:00:00"
  breakEndTime?: string;   // "13:00:00"
}

export interface ProfessionalExceptionDto {
  id?: number;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
  reason?: string;
}

export interface ProfessionalDto {
  id: number;
  userId?: number;
  fullName: string;
  email?: string;
  phone?: string;
  specialties: string;
  colorHex: string;
  isActive: boolean;
  isOwner: boolean;
  assignedServiceIds: number[];
  weeklyAvailabilities: ProfessionalWeeklyScheduleDto[];
  exceptions: ProfessionalExceptionDto[];
}

export interface AgendaClientDto {
  customerId: number;
  fullName: string;
  phone: string;
  email?: string;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  lastAppointmentDate?: string;
  nextAppointmentDate?: string;
  isActive: boolean;
  isRecurrent: boolean;
  recentAppointments: AppointmentListItemDto[];
}

export interface AgendaSettingsDto {
  id?: number;
  timeZoneId: string;
  confirmationMode: AppointmentConfirmationMode;
  defaultDurationMinutes: number;
  minLeadTimeHours: number;
  maxLeadTimeDays: number;
  slotLockMinutes: number;
  cancellationLeadTimeHours: number;
  slotIntervalMinutes: number;
  reminder24h: boolean;
  reminder1h: boolean;
  reminderWhatsApp: boolean;
  reminderEmail: boolean;
}

export interface BookingPageSettingsDto {
  id?: number;
  vanitySlug: string;
  isPublished: boolean;
  requireManualConfirmation: boolean;
  businessName: string;
  businessDescription?: string;
  logoUrl?: string;
  bannerUrl?: string;
  brandColorHex: string;
  contactWhatsApp?: string;
  address?: string;
  publicUrl?: string;
  qrCodeUrl?: string;
}

export interface DailyAppointmentStatDto {
  day: number;
  count: number;
}

export interface StatusDistributionStatDto {
  statusName: string;
  count: number;
  percentage: number;
  colorHex: string;
}

export interface TopServiceStatDto {
  serviceName: string;
  count: number;
  invoicedTotal: number;
}

export interface StaffPerformanceStatDto {
  staffName: string;
  completedAppointments: number;
  occupancyPercentage: number;
}

export interface AgendaReportsDto {
  monthLabel: string;
  totalAppointments: number;
  attendanceRate: number;
  occupancyRate: number;
  invoicedTotal: number;
  dailyAppointments: DailyAppointmentStatDto[];
  statusDistribution: StatusDistributionStatDto[];
  topServices: TopServiceStatDto[];
  staffPerformance: StaffPerformanceStatDto[];
}

export interface PublicServiceDto {
  id: number;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  colorHex: string;
}

export interface PublicProfessionalDto {
  id: number;
  name: string;
  specialties?: string;
  avatarUrl?: string;
}

export interface PublicBusinessProfileDto {
  businessName: string;
  businessDescription?: string;
  logoUrl?: string;
  bannerUrl?: string;
  brandColorHex: string;
  contactWhatsApp?: string;
  address?: string;
  services: PublicServiceDto[];
  professionals: PublicProfessionalDto[];
}

export interface PublicBookingRequestDto {
  vanitySlug: string;
  serviceId: number;
  professionalId?: number;
  startAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: string;
}

export interface PublicBookingConfirmationDto {
  bookingCode: string;
  managementToken: string;
  status: string;
  startAt: string;
  endAt: string;
  serviceName: string;
  servicePrice: number;
  professionalName?: string;
  businessName: string;
  contactWhatsApp?: string;
  address?: string;
  brandColorHex: string;
}
