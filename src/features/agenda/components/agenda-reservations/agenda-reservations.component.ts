import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type {
  AppointmentListItemDto,
  ReservableServiceDto,
  ProfessionalDto,
} from '../../models/agenda.models';
import {
  AppointmentStatus,
  AppointmentOrigin,
  AppointmentBillingStatus,
} from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-reservations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agenda-reservations.component.html',
  styleUrls: ['./agenda-reservations.component.scss'],
})
export class AgendaReservationsComponent implements OnInit {
  protected readonly Math = Math;
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  appointments = signal<AppointmentListItemDto[]>([]);
  services = signal<ReservableServiceDto[]>([]);
  professionals = signal<ProfessionalDto[]>([]);

  // Pagination
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  // Filter signals
  activeTab = signal<string>('all');
  searchQuery = signal<string>('');
  selectedServiceId = signal<number | null>(null);
  selectedProfessionalId = signal<number | null>(null);
  selectedOrigin = signal<string>('all');

  // Modal signals
  isNewAppointmentModalOpen = signal<boolean>(false);
  isRescheduleModalOpen = signal<boolean>(false);
  selectedAppointment = signal<AppointmentListItemDto | null>(null);

  // Form fields
  formServiceId = 0;
  formProfessionalId = 0;
  formDate = '';
  formTime = '';
  formCustomerName = '';
  formCustomerPhone = '';
  formCustomerEmail = '';
  formNotes = '';

  // Reschedule form
  rescheduleDate = '';
  rescheduleTime = '';
  rescheduleProfessionalId = 0;

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      this.isLoading.set(true);
      const [resAppointments, resServices, resProfessionals] = await Promise.all([
        this.agendaService.getAppointments(),
        this.agendaService.getServices(),
        this.agendaService.getProfessionals(),
      ]);
      this.appointments.set(resAppointments.items);
      this.services.set(resServices);
      this.professionals.set(resProfessionals);
    } catch (err: any) {
      this.notificationService.error('Error al cargar reservas', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  normalizeStatus(status: any): string {
    if (status === 1 || String(status).toLowerCase() === 'confirmed' || String(status).toLowerCase() === 'confirmada') return 'Confirmed';
    if (status === 0 || String(status).toLowerCase() === 'pending' || String(status).toLowerCase() === 'pendiente') return 'Pending';
    if (status === 2 || String(status).toLowerCase() === 'completed' || String(status).toLowerCase() === 'completada' || String(status).toLowerCase() === 'finalizada') return 'Completed';
    if (status === 3 || String(status).toLowerCase() === 'cancelled' || String(status).toLowerCase() === 'cancelada') return 'Cancelled';
    if (status === 6 || String(status).toLowerCase() === 'rescheduled' || String(status).toLowerCase() === 'reprogramada') return 'Rescheduled';
    if (status === 4 || String(status).toLowerCase() === 'noshow') return 'NoShow';
    if (status === 5 || String(status).toLowerCase() === 'inprogress') return 'InProgress';
    return String(status || 'Pending');
  }

  get filteredAppointments(): AppointmentListItemDto[] {
    let list = this.appointments();

    // Tab filter
    if (this.activeTab() === 'pending') {
      list = list.filter((a) => this.normalizeStatus(a.status) === 'Pending');
    } else if (this.activeTab() === 'confirmed') {
      list = list.filter((a) => this.normalizeStatus(a.status) === 'Confirmed');
    } else if (this.activeTab() === 'rescheduled') {
      list = list.filter((a) => this.normalizeStatus(a.status) === 'Rescheduled');
    } else if (this.activeTab() === 'completed') {
      list = list.filter((a) => this.normalizeStatus(a.status) === 'Completed');
    }

    // Search query
    if (this.searchQuery().trim()) {
      const q = this.searchQuery().toLowerCase().trim();
      list = list.filter(
        (a) =>
          (a.customerName && a.customerName.toLowerCase().includes(q)) ||
          (a.bookingCode && a.bookingCode.toLowerCase().includes(q)) ||
          (a.customerPhone && a.customerPhone.includes(q)),
      );
    }

    // Service filter
    if (this.selectedServiceId()) {
      list = list.filter((a) => a.serviceId === this.selectedServiceId());
    }

    // Professional filter
    if (this.selectedProfessionalId()) {
      list = list.filter((a) => a.professionalId === this.selectedProfessionalId());
    }

    // Origin filter
    if (this.selectedOrigin() !== 'all') {
      const orig = this.selectedOrigin() === 'web' ? AppointmentOrigin.Web : AppointmentOrigin.Manual;
      list = list.filter((a) => a.origin === orig);
    }

    return list;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredAppointments.length / this.pageSize()));
  }

  get paginatedAppointments(): AppointmentListItemDto[] {
    const page = Math.min(this.currentPage(), this.totalPages);
    const start = (page - 1) * this.pageSize();
    return this.filteredAppointments.slice(start, start + this.pageSize());
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage.set(page);
    }
  }

  get pendingCount(): number {
    return this.appointments().filter((a) => this.normalizeStatus(a.status) === 'Pending').length;
  }

  get confirmedCount(): number {
    return this.appointments().filter((a) => this.normalizeStatus(a.status) === 'Confirmed').length;
  }

  get rescheduledCount(): number {
    return this.appointments().filter((a) => this.normalizeStatus(a.status) === 'Rescheduled').length;
  }

  get cancelledCount(): number {
    return this.appointments().filter((a) => this.normalizeStatus(a.status) === 'Cancelled').length;
  }

  async confirmAppointment(appt: AppointmentListItemDto): Promise<void> {
    try {
      await this.agendaService.updateAppointmentStatus(appt.id, AppointmentStatus.Confirmed);
      this.notificationService.success('Cita confirmada', `La cita ${appt.bookingCode} fue confirmada.`);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error', err?.message);
    }
  }

  openRescheduleModal(appt: AppointmentListItemDto): void {
    this.selectedAppointment.set(appt);
    const d = new Date(appt.startAt);
    this.rescheduleDate = d.toISOString().split('T')[0];
    this.rescheduleTime = d.toTimeString().substring(0, 5);
    this.rescheduleProfessionalId = appt.professionalId || 0;
    this.isRescheduleModalOpen.set(true);
  }

  async submitReschedule(): Promise<void> {
    const appt = this.selectedAppointment();
    if (!appt || !this.rescheduleDate || !this.rescheduleTime) {
      this.notificationService.error('Error', 'Selecciona la nueva fecha y hora.');
      return;
    }

    try {
      const newStartAt = `${this.rescheduleDate}T${this.rescheduleTime}:00`;
      await this.agendaService.rescheduleAppointment(
        appt.id,
        newStartAt,
        this.rescheduleProfessionalId > 0 ? this.rescheduleProfessionalId : undefined,
      );
      this.notificationService.success('Cita reprogramada', 'El nuevo horario ha sido reservado correctamente.');
      this.isRescheduleModalOpen.set(false);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error al reprogramar', err?.message);
    }
  }

  async cancelAppointment(appt: AppointmentListItemDto): Promise<void> {
    if (!confirm(`¿Estás seguro de cancelar la cita ${appt.bookingCode}?`)) return;
    try {
      await this.agendaService.updateAppointmentStatus(appt.id, AppointmentStatus.Cancelled, 'Cancelado manualmente');
      this.notificationService.success('Cita cancelada', `La cita ${appt.bookingCode} ha sido cancelada.`);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error', err?.message);
    }
  }

  async invoiceAppointment(appt: AppointmentListItemDto): Promise<void> {
    if (appt.billingStatus === AppointmentBillingStatus.Invoiced || appt.billingStatus === AppointmentBillingStatus.Paid) {
      this.notificationService.warning('Ya facturada', `Esta cita ya tiene la factura ${appt.invoiceNumber || ''}.`);
      return;
    }
    try {
      const res = await this.agendaService.invoiceAppointment(appt.id);
      this.notificationService.success('Factura generada', `Se generó la factura ${res.invoiceNumber} vinculada a la cita.`);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error al facturar', err?.message);
    }
  }

  openNewAppointmentModal(): void {
    const now = new Date();
    this.formDate = now.toISOString().split('T')[0];
    this.formTime = '10:00';
    this.formServiceId = this.services().length > 0 ? this.services()[0].id : 0;
    this.formProfessionalId = 0;
    this.formCustomerName = '';
    this.formCustomerPhone = '';
    this.formCustomerEmail = '';
    this.formNotes = '';
    this.isNewAppointmentModalOpen.set(true);
  }

  async submitNewAppointment(): Promise<void> {
    if (!this.formCustomerName || !this.formCustomerPhone || !this.formDate || !this.formTime || !this.formServiceId) {
      this.notificationService.error('Campos incompletos', 'Por favor llena los campos obligatorios.');
      return;
    }

    try {
      const startAt = `${this.formDate}T${this.formTime}:00`;
      await this.agendaService.createManualAppointment({
        serviceId: this.formServiceId,
        appointmentServiceId: this.formServiceId,
        professionalId: this.formProfessionalId > 0 ? this.formProfessionalId : undefined,
        startAt,
        customerName: this.formCustomerName,
        customerPhone: this.formCustomerPhone,
        customerEmail: this.formCustomerEmail || undefined,
        notes: this.formNotes || undefined,
      });

      this.notificationService.success('Cita creada', 'La cita fue creada exitosamente.');
      this.isNewAppointmentModalOpen.set(false);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error al crear cita', err?.message);
    }
  }

  getStatusClass(status: any): string {
    const s = this.normalizeStatus(status);
    switch (s) {
      case 'Confirmed': return 'status-confirmed';
      case 'Pending': return 'status-pending';
      case 'Completed': return 'status-completed';
      case 'Cancelled': return 'status-cancelled';
      case 'Rescheduled': return 'status-rescheduled';
      default: return 'status-default';
    }
  }

  getStatusLabel(status: any): string {
    const s = this.normalizeStatus(status);
    switch (s) {
      case 'Confirmed': return 'Confirmada';
      case 'Pending': return 'Pendiente';
      case 'Completed': return 'Completada';
      case 'Cancelled': return 'Cancelada';
      case 'Rescheduled': return 'Reprogramada';
      case 'NoShow': return 'No asistió';
      case 'InProgress': return 'En progreso';
      case 'Expired': return 'Vencida';
      default: return s || 'Pendiente';
    }
  }
}
