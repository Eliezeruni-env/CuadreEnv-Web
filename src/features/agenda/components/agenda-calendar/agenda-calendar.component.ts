import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { AppointmentListItemDto, ProfessionalDto } from '../../models/agenda.models';
import { AppointmentStatus } from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agenda-calendar.component.html',
  styleUrls: ['./agenda-calendar.component.scss'],
})
export class AgendaCalendarComponent implements OnInit {
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  appointments = signal<AppointmentListItemDto[]>([]);
  professionals = signal<ProfessionalDto[]>([]);

  selectedProfessionalId = signal<number | null>(null);
  currentDate = signal<Date>(new Date());
  calendarView = signal<'day' | 'week' | 'month'>('week');

  hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  weekDays = signal<{ name: string; date: Date }[]>([]);

  ngOnInit(): void {
    this.calculateWeekDays();
    this.loadData();
  }

  calculateWeekDays(): void {
    const curr = new Date(this.currentDate());
    const day = curr.getDay(); // 0 = Sunday, 1 = Monday...
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // Monday of current week
    const monday = new Date(curr);
    monday.setDate(diff);

    const days: { name: string; date: Date }[] = [];
    const names = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(monday);
      nextDate.setDate(monday.getDate() + i);
      days.push({ name: names[i], date: nextDate });
    }
    this.weekDays.set(days);
  }

  get weekRangeLabel(): string {
    const days = this.weekDays();
    if (days.length === 0) return '';
    const first = days[0].date;
    const last = days[days.length - 1].date;
    const m1 = first.toLocaleDateString('es-ES', { month: 'short' });
    const m2 = last.toLocaleDateString('es-ES', { month: 'short' });
    if (m1 === m2) {
      return `${first.getDate()} - ${last.getDate()} de ${m1} ${last.getFullYear()}`;
    }
    return `${first.getDate()} ${m1} - ${last.getDate()} ${m2} ${last.getFullYear()}`;
  }

  get displayHours(): number[] {
    const defaultHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const apptHours = this.appointments().map((a) => new Date(a.startAt).getHours());
    const merged = Array.from(new Set([...defaultHours, ...apptHours])).sort((a, b) => a - b);
    return merged;
  }

  async loadData(): Promise<void> {
    try {
      this.isLoading.set(true);
      const start = new Date(this.currentDate());
      start.setDate(start.getDate() - 15);
      const end = new Date(this.currentDate());
      end.setDate(end.getDate() + 15);

      const [resAppts, resProfs] = await Promise.all([
        this.agendaService.getCalendar(start.toISOString(), end.toISOString(), this.selectedProfessionalId() || undefined),
        this.agendaService.getProfessionals(),
      ]);
      this.appointments.set(resAppts);
      this.professionals.set(resProfs);
    } catch (err: any) {
      this.notificationService.error('Error al cargar calendario', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  navigate(direction: 'prev' | 'next' | 'today'): void {
    const d = new Date(this.currentDate());
    if (direction === 'today') {
      this.currentDate.set(new Date());
    } else {
      const offset = this.calendarView() === 'day' ? 1 : 7;
      d.setDate(d.getDate() + (direction === 'next' ? offset : -offset));
      this.currentDate.set(d);
    }
    this.calculateWeekDays();
    this.loadData();
  }

  getAppointmentsForSlot(date: Date, hour: number): AppointmentListItemDto[] {
    return this.appointments().filter((a) => {
      const apptDate = new Date(a.startAt);
      return (
        apptDate.getFullYear() === date.getFullYear() &&
        apptDate.getMonth() === date.getMonth() &&
        apptDate.getDate() === date.getDate() &&
        apptDate.getHours() === hour
      );
    });
  }

  getStatusClass(status: any): string {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'confirmed' || s === 'confirmada' || s === '1') return 'slot-confirmed';
    if (s === 'pending' || s === 'pendiente' || s === '0') return 'slot-pending';
    if (s === 'completed' || s === 'completada' || s === '2') return 'slot-completed';
    if (s === 'cancelled' || s === 'cancelada' || s === '3') return 'slot-cancelled';
    if (s === 'rescheduled' || s === 'reprogramada' || s === '4') return 'slot-pending';
    return 'slot-default';
  }
}
