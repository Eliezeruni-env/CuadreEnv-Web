import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type {
  ProfessionalDto,
  ReservableServiceDto,
  ProfessionalWeeklyScheduleDto,
} from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-professionals',
  standalone: true,
  imports: [CommonModule, FormsModule, IconDirective],
  templateUrl: './agenda-professionals.component.html',
  styleUrls: ['./agenda-professionals.component.scss'],
})
export class AgendaProfessionalsComponent implements OnInit {
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  professionals = signal<ProfessionalDto[]>([]);
  services = signal<ReservableServiceDto[]>([]);
  selectedProfessional = signal<ProfessionalDto | null>(null);

  // Modals
  isCreateModalOpen = signal<boolean>(false);
  isExceptionModalOpen = signal<boolean>(false);

  // New professional form
  formFullName = '';
  formSpecialties = '';
  formPhone = '';
  formEmail = '';
  formIsOwner = false;
  formColorHex = '#2563eb';
  selectedServiceIds: number[] = [];

  // Schedule form for selected professional
  workStartTime = '09:00';
  workEndTime = '18:00';
  breakStartTime = '12:00';
  breakEndTime = '13:00';
  activeDays = [1, 2, 3, 4, 5, 6]; // Lun - Sab

  // Exception form
  exceptionStartDate = '';
  exceptionEndDate = '';
  exceptionReason = '';
  exceptionIsAllDay = true;

  readonly weekDays = [1, 2, 3, 4, 5, 6, 0];
  readonly summaryDays = [1, 2, 3, 4, 5, 6, 0];
  dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  formatTime(val?: string, defaultVal: string = '09:00'): string {
    if (!val) return defaultVal;
    const clean = val.trim();
    if (clean.length >= 5) {
      return clean.substring(0, 5);
    }
    return defaultVal;
  }

  getScheduleSnippet(prof: ProfessionalDto): string {
    const avail = prof.weeklyAvailabilities;
    if (!avail || avail.length === 0) return 'Lun - Sáb 09:00 - 18:00';
    const working = avail.filter((w) => w.isWorkingDay);
    if (working.length === 0) return 'Sin horario activo';
    const first = working[0];
    const sTime = this.formatTime(first.startTime, '09:00');
    const eTime = this.formatTime(first.endTime, '18:00');
    if (working.length === 7) return `Todos los días ${sTime} - ${eTime}`;
    if (working.length === 6 && !working.some((w) => w.dayOfWeek === 0)) return `Lun - Sáb ${sTime} - ${eTime}`;
    return `${working.length} días/sem ${sTime} - ${eTime}`;
  }

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      this.isLoading.set(true);
      const [resProfs, resServices] = await Promise.all([
        this.agendaService.getProfessionals(),
        this.agendaService.getServices(),
      ]);
      this.professionals.set(resProfs);
      this.services.set(resServices);
      if (resProfs.length > 0) {
        const currentSelected = this.selectedProfessional();
        const found = currentSelected ? resProfs.find((p) => p.id === currentSelected.id) : null;
        this.selectProfessional(found || resProfs[0]);
      }
    } catch (err: any) {
      this.notificationService.error('Error al cargar personal', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectProfessional(prof: ProfessionalDto): void {
    this.selectedProfessional.set(prof);
    const avail = prof.weeklyAvailabilities;
    if (avail && avail.length > 0) {
      const first = avail.find((w) => w.isWorkingDay) || avail[0];
      this.workStartTime = this.formatTime(first?.startTime, '09:00');
      this.workEndTime = this.formatTime(first?.endTime, '18:00');
      this.breakStartTime = this.formatTime(first?.breakStartTime, '12:00');
      this.breakEndTime = this.formatTime(first?.breakEndTime, '13:00');
      this.activeDays = avail.filter((w) => w.isWorkingDay).map((w) => Number(w.dayOfWeek));
      if (this.activeDays.length === 0) {
        this.activeDays = [1, 2, 3, 4, 5, 6];
      }
    } else {
      this.workStartTime = '09:00';
      this.workEndTime = '18:00';
      this.breakStartTime = '12:00';
      this.breakEndTime = '13:00';
      this.activeDays = [1, 2, 3, 4, 5, 6];
    }
  }

  toggleDay(dayIndex: number): void {
    if (this.activeDays.includes(dayIndex)) {
      this.activeDays = this.activeDays.filter((d) => d !== dayIndex);
    } else {
      this.activeDays = [...this.activeDays, dayIndex];
    }
  }

  async saveSchedule(): Promise<void> {
    const prof = this.selectedProfessional();
    if (!prof) return;

    try {
      const schedules: ProfessionalWeeklyScheduleDto[] = [];
      for (let i = 0; i < 7; i++) {
        const isWorking = this.activeDays.includes(i);
        schedules.push({
          dayOfWeek: i,
          isWorkingDay: isWorking,
          startTime: `${this.workStartTime}:00`,
          endTime: `${this.workEndTime}:00`,
          breakStartTime: this.breakStartTime ? `${this.breakStartTime}:00` : undefined,
          breakEndTime: this.breakEndTime ? `${this.breakEndTime}:00` : undefined,
        });
      }

      await this.agendaService.updateProfessionalSchedule(prof.id, schedules);
      this.notificationService.success('Horario guardado', `Se actualizó el horario de ${prof.fullName}.`);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error al guardar horario', err?.message);
    }
  }

  openCreateModal(): void {
    this.formFullName = '';
    this.formSpecialties = '';
    this.formPhone = '';
    this.formEmail = '';
    this.formIsOwner = false;
    this.formColorHex = '#2563eb';
    this.selectedServiceIds = this.services().map((s) => s.id);
    this.isCreateModalOpen.set(true);
  }

  toggleService(svcId: number): void {
    const idx = this.selectedServiceIds.indexOf(svcId);
    if (idx >= 0) {
      this.selectedServiceIds.splice(idx, 1);
    } else {
      this.selectedServiceIds.push(svcId);
    }
  }

  async submitCreateProfessional(): Promise<void> {
    if (!this.formFullName) {
      this.notificationService.error('Error', 'El nombre del profesional es obligatorio.');
      return;
    }

    try {
      await this.agendaService.createProfessional({
        fullName: this.formFullName,
        specialties: this.formSpecialties,
        phone: this.formPhone || undefined,
        email: this.formEmail || undefined,
        colorHex: this.formColorHex,
        isOwner: this.formIsOwner,
        assignedServiceIds: this.selectedServiceIds,
      });

      this.notificationService.success('Colaborador creado', 'El nuevo profesional ha sido registrado.');
      this.isCreateModalOpen.set(false);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error al crear profesional', err?.message);
    }
  }

  openExceptionModal(): void {
    const today = new Date().toISOString().split('T')[0];
    this.exceptionStartDate = today;
    this.exceptionEndDate = today;
    this.exceptionReason = 'Vacaciones / Permiso';
    this.exceptionIsAllDay = true;
    this.isExceptionModalOpen.set(true);
  }

  async submitException(): Promise<void> {
    const prof = this.selectedProfessional();
    if (!prof || !this.exceptionStartDate || !this.exceptionEndDate) {
      this.notificationService.error('Error', 'Completa las fechas de bloqueo.');
      return;
    }

    try {
      await this.agendaService.addProfessionalException(prof.id, {
        startDateTime: `${this.exceptionStartDate}T00:00:00`,
        endDateTime: `${this.exceptionEndDate}T23:59:59`,
        isAllDay: this.exceptionIsAllDay,
        reason: this.exceptionReason,
      });

      this.notificationService.success('Horario bloqueado', 'La excepción ha sido agregada.');
      this.isExceptionModalOpen.set(false);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error al bloquear horario', err?.message);
    }
  }
}
