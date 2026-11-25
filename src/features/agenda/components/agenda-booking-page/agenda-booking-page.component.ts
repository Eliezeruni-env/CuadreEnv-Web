import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { BookingPageSettingsDto, ReservableServiceDto } from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-booking-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agenda-booking-page.component.html',
  styleUrls: ['./agenda-booking-page.component.scss'],
})
export class AgendaBookingPageComponent implements OnInit {
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  services = signal<ReservableServiceDto[]>([]);

  // Settings form
  vanitySlug = 'barberia-central';
  businessName = 'Barbería Central';
  businessDescription = 'Cortes modernos, barba y cuidado masculino con atención personalizada. ¡Reserva tu cita y luce tu mejor estilo!';
  logoUrl = '';
  bannerUrl = '';
  brandColorHex = '#111827';
  contactWhatsApp = '8095550100';
  address = 'Av. John F. Kennedy #123, Santo Domingo, R.D.';
  isPublished = true;
  requireManualConfirmation = false;

  previewDevice = signal<'desktop' | 'mobile'>('desktop');

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      this.isLoading.set(true);
      const [resSettings, resServices] = await Promise.all([
        this.agendaService.getBookingPageSettings(),
        this.agendaService.getServices(),
      ]);

      if (resSettings) {
        this.vanitySlug = resSettings.vanitySlug || 'barberia-central';
        this.businessName = resSettings.businessName || 'Barbería Central';
        this.businessDescription = resSettings.businessDescription || '';
        this.logoUrl = resSettings.logoUrl || '';
        this.bannerUrl = resSettings.bannerUrl || '';
        this.brandColorHex = resSettings.brandColorHex || '#111827';
        this.contactWhatsApp = resSettings.contactWhatsApp || '';
        this.address = resSettings.address || '';
        this.isPublished = resSettings.isPublished ?? true;
        this.requireManualConfirmation = resSettings.requireManualConfirmation ?? false;
      }
      this.services.set(resServices);
    } catch (err: any) {
      this.notificationService.error('Error al cargar configuración de portal público', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  get publicBookingUrl(): string {
    return `${window.location.origin}/reservas/${this.vanitySlug}`;
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.publicBookingUrl);
    this.notificationService.success('Enlace copiado', 'El enlace de reserva ha sido copiado.');
  }

  shareWhatsApp(): void {
    const text = encodeURIComponent(`¡Hola! Reserva tu cita en línea en ${this.businessName}: ${this.publicBookingUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  openPublicPage(): void {
    window.open(this.publicBookingUrl, '_blank');
  }

  async saveSettings(): Promise<void> {
    try {
      this.isSaving.set(true);
      await this.agendaService.updateBookingPageSettings({
        vanitySlug: this.vanitySlug,
        businessName: this.businessName,
        businessDescription: this.businessDescription,
        logoUrl: this.logoUrl,
        bannerUrl: this.bannerUrl,
        brandColorHex: this.brandColorHex,
        contactWhatsApp: this.contactWhatsApp,
        address: this.address,
        isPublished: this.isPublished,
        requireManualConfirmation: this.requireManualConfirmation,
      });

      this.notificationService.success('Página actualizada', 'Los cambios en tu página de reservas fueron guardados.');
    } catch (err: any) {
      this.notificationService.error('Error al guardar', err?.message);
    } finally {
      this.isSaving.set(false);
    }
  }
}
