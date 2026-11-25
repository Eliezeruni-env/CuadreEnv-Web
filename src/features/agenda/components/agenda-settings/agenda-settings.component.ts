import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { AgendaSettingsDto } from '../../models/agenda.models';
import { AppointmentConfirmationMode } from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './agenda-settings.component.html',
  styleUrls: ['./agenda-settings.component.scss'],
})
export class AgendaSettingsComponent implements OnInit {
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);

  // Form fields
  timeZoneId = 'America/Santo_Domingo';
  confirmationMode: AppointmentConfirmationMode = AppointmentConfirmationMode.Automatic;
  defaultDurationMinutes = 30;
  minLeadTimeHours = 2;
  maxLeadTimeDays = 30;
  slotLockMinutes = 30;
  cancellationLeadTimeHours = 3;
  slotIntervalMinutes = 10;
  reminder24h = true;
  reminder1h = true;
  reminderWhatsApp = true;
  reminderEmail = true;

  ngOnInit(): void {
    this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    try {
      this.isLoading.set(true);
      const res = await this.agendaService.getSettings();
      if (res) {
        this.timeZoneId = res.timeZoneId || 'America/Santo_Domingo';
        this.confirmationMode = res.confirmationMode ?? AppointmentConfirmationMode.Automatic;
        this.defaultDurationMinutes = res.defaultDurationMinutes || 30;
        this.minLeadTimeHours = res.minLeadTimeHours ?? 2;
        this.maxLeadTimeDays = res.maxLeadTimeDays || 30;
        this.slotLockMinutes = res.slotLockMinutes || 30;
        this.cancellationLeadTimeHours = res.cancellationLeadTimeHours ?? 3;
        this.slotIntervalMinutes = res.slotIntervalMinutes || 10;
        this.reminder24h = res.reminder24h ?? true;
        this.reminder1h = res.reminder1h ?? true;
        this.reminderWhatsApp = res.reminderWhatsApp ?? true;
        this.reminderEmail = res.reminderEmail ?? true;
      }
    } catch (err: any) {
      this.notificationService.error('Error al cargar configuración', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveSettings(): Promise<void> {
    try {
      this.isSaving.set(true);
      await this.agendaService.updateSettings({
        timeZoneId: this.timeZoneId,
        confirmationMode: this.confirmationMode,
        defaultDurationMinutes: this.defaultDurationMinutes,
        minLeadTimeHours: this.minLeadTimeHours,
        maxLeadTimeDays: this.maxLeadTimeDays,
        slotLockMinutes: this.slotLockMinutes,
        cancellationLeadTimeHours: this.cancellationLeadTimeHours,
        slotIntervalMinutes: this.slotIntervalMinutes,
        reminder24h: this.reminder24h,
        reminder1h: this.reminder1h,
        reminderWhatsApp: this.reminderWhatsApp,
        reminderEmail: this.reminderEmail,
      });

      this.notificationService.success('Configuración guardada', 'Los parámetros de la agenda fueron actualizados exitosamente.');
    } catch (err: any) {
      this.notificationService.error('Error al guardar', err?.message);
    } finally {
      this.isSaving.set(false);
    }
  }

  copyLink(): void {
    const url = `${window.location.origin}/reservas/barberia-central`;
    navigator.clipboard.writeText(url);
    this.notificationService.success('Enlace copiado', 'El enlace de reserva fue copiado.');
  }
}
