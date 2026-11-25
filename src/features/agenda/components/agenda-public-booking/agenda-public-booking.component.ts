import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type {
  PublicBusinessProfileDto,
  PublicServiceDto,
  PublicProfessionalDto,
  AvailableSlotDto,
} from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-public-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agenda-public-booking.component.html',
  styleUrls: ['./agenda-public-booking.component.scss'],
})
export class AgendaPublicBookingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);

  slug = signal<string>('barberia-central');
  isLoading = signal<boolean>(true);
  isSubmitting = signal<boolean>(false);

  profile = signal<PublicBusinessProfileDto | null>(null);

  // Wizard step: 1 = Servicio, 2 = Horario, 3 = Tus datos
  currentStep = signal<number>(1);

  // Selections
  selectedService = signal<PublicServiceDto | null>(null);
  selectedProfessional = signal<PublicProfessionalDto | null>(null);
  selectedDate = signal<string>(new Date().toISOString().split('T')[0]);
  selectedSlot = signal<AvailableSlotDto | null>(null);
  availableSlots = signal<AvailableSlotDto[]>([]);

  // Step 3 Customer Form
  customerName = '';
  customerPhone = '';
  customerEmail = '';
  customerNotes = '';

  // Calendar dates
  monthDates = signal<{ date: string; dayNum: number; dayName: string; isSelected: boolean }[]>([]);

  ngOnInit(): void {
    const slugParam = this.route.snapshot.paramMap.get('slug');
    if (slugParam) {
      this.slug.set(slugParam);
    }
    this.generateMonthDays();
    this.loadProfile();
  }

  generateMonthDays(): void {
    const today = new Date();
    const days: { date: string; dayNum: number; dayName: string; isSelected: boolean }[] = [];
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const str = d.toISOString().split('T')[0];
      days.push({
        date: str,
        dayNum: d.getDate(),
        dayName: dayNames[d.getDay()],
        isSelected: i === 0,
      });
    }
    this.monthDates.set(days);
    this.selectedDate.set(days[0].date);
  }

  async loadProfile(): Promise<void> {
    try {
      this.isLoading.set(true);
      const data = await this.agendaService.getPublicProfile(this.slug());
      this.profile.set(data);
      if (data && data.services && data.services.length > 0) {
        this.selectedService.set(data.services[0]);
      }
    } catch (err: any) {
      this.notificationService.error('Error al cargar negocio', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectService(svc: PublicServiceDto): void {
    this.selectedService.set(svc);
    this.goToStep(2);
    this.loadSlots();
  }

  selectDate(dStr: string): void {
    this.selectedDate.set(dStr);
    const updated = this.monthDates().map((d) => ({
      ...d,
      isSelected: d.date === dStr,
    }));
    this.monthDates.set(updated);
    this.loadSlots();
  }

  selectProfessional(prof: PublicProfessionalDto | null): void {
    this.selectedProfessional.set(prof);
    this.loadSlots();
  }

  async loadSlots(): Promise<void> {
    const svc = this.selectedService();
    if (!svc) return;

    try {
      const slots = await this.agendaService.getPublicSlots(
        this.slug(),
        svc.id,
        this.selectedDate(),
        this.selectedProfessional() ? this.selectedProfessional()!.id : undefined,
      );
      this.availableSlots.set(slots);
      if (slots.length > 0) {
        this.selectedSlot.set(slots[0]);
      } else {
        this.selectedSlot.set(null);
      }
    } catch (err: any) {
      console.error('Error loading slots', err);
    }
  }

  selectSlot(slot: AvailableSlotDto): void {
    this.selectedSlot.set(slot);
  }

  goToStep(step: number): void {
    if (step === 2 && !this.selectedService()) {
      this.notificationService.warning('Selecciona un servicio', 'Debes elegir un servicio primero.');
      return;
    }
    if (step === 3 && !this.selectedSlot()) {
      this.notificationService.warning('Selecciona un horario', 'Debes elegir un horario disponible.');
      return;
    }
    this.currentStep.set(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async submitReservation(): Promise<void> {
    if (!this.customerName.trim() || !this.customerPhone.trim()) {
      this.notificationService.error('Datos requeridos', 'Por favor ingresa tu nombre y teléfono.');
      return;
    }

    const svc = this.selectedService();
    const slot = this.selectedSlot();
    if (!svc || !slot) return;

    try {
      this.isSubmitting.set(true);
      const res = await this.agendaService.reservePublicAppointment({
        vanitySlug: this.slug(),
        serviceId: svc.id,
        professionalId: slot.professionalId > 0 ? slot.professionalId : undefined,
        startAt: slot.startAt,
        customerName: this.customerName.trim(),
        customerPhone: this.customerPhone.trim(),
        customerEmail: this.customerEmail.trim() || undefined,
        notes: this.customerNotes.trim() || undefined,
      });

      // Save management token in session storage for voucher consultation
      sessionStorage.setItem(`booking_token_${res.bookingCode}`, res.managementToken);

      // Navigate to voucher screen
      this.router.navigate(['/reservas', this.slug(), 'comprobante', res.bookingCode], {
        queryParams: { token: res.managementToken },
      });
    } catch (err: any) {
      this.notificationService.error('Error al reservar', err?.message || 'El horario seleccionado ya no está disponible.');
      this.loadSlots();
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
