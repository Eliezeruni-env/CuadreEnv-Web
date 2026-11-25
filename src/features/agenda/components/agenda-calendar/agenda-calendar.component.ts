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
    const first = curr.getDate() - curr.getDay() + 1; // Lunes
    const days: { name: string; date: Date }[] = [];
    const names = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(curr);
      nextDate.setDate(first + i);
      days.push({ name: names[i], date: nextDate });
    }
    this.weekDays.set(days);
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

  getStatusClass(status: AppointmentStatus): string {
    switch (status) {
      case AppointmentStatus.Confirmed: return 'slot-confirmed';
      case AppointmentStatus.Pending: return 'slot-pending';
      case AppointmentStatus.Completed: return 'slot-completed';
      case AppointmentStatus.Cancelled: return 'slot-cancelled';
      default: return 'slot-default';
    }
  }
}
