import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { AgendaDashboardDto, AppointmentListItemDto } from '../../models/agenda.models';
import { AppointmentStatus } from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './agenda-dashboard.component.html',
  styleUrls: ['./agenda-dashboard.component.scss'],
})
export class AgendaDashboardComponent implements OnInit {
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  isLoading = signal<boolean>(true);
  dashboardData = signal<AgendaDashboardDto | null>(null);
  selectedDate = signal<string>(new Date().toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }));

  ngOnInit(): void {
    this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    try {
      this.isLoading.set(true);
      const data = await this.agendaService.getDashboard();
      this.dashboardData.set(data);
    } catch (err: any) {
      this.notificationService.error('Error al cargar panel de agenda', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async confirmPending(appointment: AppointmentListItemDto): Promise<void> {
    try {
      await this.agendaService.updateAppointmentStatus(appointment.id, AppointmentStatus.Confirmed);
      this.notificationService.success('Cita confirmada', `La cita ${appointment.bookingCode} fue confirmada exitosamente.`);
      await this.loadDashboard();
    } catch (err: any) {
      this.notificationService.error('Error', err?.message || 'No se pudo confirmar la cita.');
    }
  }

  async rejectPending(appointment: AppointmentListItemDto): Promise<void> {
    if (!confirm(`¿Deseas rechazar la cita ${appointment.bookingCode} de ${appointment.customerName}?`)) return;
    try {
      await this.agendaService.updateAppointmentStatus(appointment.id, AppointmentStatus.Cancelled, 'Rechazado por el negocio');
      this.notificationService.success('Cita rechazada', `La cita ${appointment.bookingCode} ha sido cancelada.`);
      await this.loadDashboard();
    } catch (err: any) {
      this.notificationService.error('Error', err?.message || 'No se pudo rechazar la cita.');
    }
  }

  copyBookingLink(): void {
    const url = `${window.location.origin}/reservas/barberia-central`;
    navigator.clipboard.writeText(url);
    this.notificationService.success('Enlace copiado', 'El enlace de reserva ha sido copiado al portapapeles.');
  }

  getStatusClass(status: AppointmentStatus): string {
    switch (status) {
      case AppointmentStatus.Confirmed: return 'status-confirmed';
      case AppointmentStatus.Pending: return 'status-pending';
      case AppointmentStatus.Completed: return 'status-completed';
      case AppointmentStatus.Cancelled: return 'status-cancelled';
      case AppointmentStatus.Rescheduled: return 'status-rescheduled';
      default: return 'status-default';
    }
  }

  getStatusLabel(status: AppointmentStatus): string {
    switch (status) {
      case AppointmentStatus.Confirmed: return 'Confirmada';
      case AppointmentStatus.Pending: return 'Pendiente';
      case AppointmentStatus.Completed: return 'Completada';
      case AppointmentStatus.Cancelled: return 'Cancelada';
      case AppointmentStatus.Rescheduled: return 'Reprogramada';
      case AppointmentStatus.Expired: return 'Vencida';
      default: return 'Desconocido';
    }
  }
}
