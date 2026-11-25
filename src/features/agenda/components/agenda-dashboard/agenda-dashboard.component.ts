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
  vanitySlug = signal<string>('mi-negocio');

  get publicBookingUrl(): string {
    if (typeof window === 'undefined') return `/reservas/${this.vanitySlug()}`;
    const origin = window.location.origin;
    const path = window.location.pathname.replace(/\/+$/, '');
    return `${origin}${path}/#/reservas/${this.vanitySlug()}`;
  }

  ngOnInit(): void {
    this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    try {
      this.isLoading.set(true);
      const [data, bpSettings] = await Promise.all([
        this.agendaService.getDashboard(),
        this.agendaService.getBookingPageSettings().catch(() => null),
      ]);
      this.dashboardData.set(data);
      if (bpSettings && bpSettings.vanitySlug) {
        this.vanitySlug.set(bpSettings.vanitySlug);
      }
    } catch (err: any) {
      this.notificationService.error('Error al cargar panel de agenda', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  copyBookingLink(): void {
    const url = this.publicBookingUrl;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          this.notificationService.success(
            'Enlace copiado',
            'El enlace de reserva ha sido copiado al portapapeles.',
          );
        })
        .catch(() => {
          this.fallbackCopyText(url);
        });
    } else {
      this.fallbackCopyText(url);
    }
  }

  private fallbackCopyText(text: string): void {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.notificationService.success(
        'Enlace copiado',
        'El enlace de reserva ha sido copiado al portapapeles.',
      );
    } catch {
      this.notificationService.info('Enlace para compartir', text);
    }
  }

  shareOnWhatsApp(): void {
    const text = encodeURIComponent(
      `¡Hola! Reserva tu cita en línea fácilmente aquí: ${this.publicBookingUrl}`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
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
