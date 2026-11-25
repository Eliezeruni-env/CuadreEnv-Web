import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AgendaService } from '../../services/agenda.service';

@Component({
  selector: 'app-agenda-public-voucher',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './agenda-public-voucher.component.html',
  styleUrls: ['./agenda-public-voucher.component.scss'],
})
export class AgendaPublicVoucherComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly agendaService = inject(AgendaService);

  slug = signal<string>('barberia-central');
  bookingCode = signal<string>('CIT-000128');
  token = signal<string>('');

  isLoading = signal<boolean>(true);
  appointmentDetails = signal<any>(null);

  ngOnInit(): void {
    const s = this.route.snapshot.paramMap.get('slug');
    const code = this.route.snapshot.paramMap.get('code');
    const qToken = this.route.snapshot.queryParamMap.get('token');

    if (s) this.slug.set(s);
    if (code) this.bookingCode.set(code);

    const storedToken = qToken || sessionStorage.getItem(`booking_token_${code}`) || '';
    this.token.set(storedToken);

    this.checkStatus();
  }

  async checkStatus(): Promise<void> {
    try {
      this.isLoading.set(true);
      const res = await this.agendaService.getPublicAppointmentStatus(this.bookingCode(), this.token());
      this.appointmentDetails.set(res);
    } catch (err: any) {
      console.error('Error fetching appointment status', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  contactWhatsApp(): void {
    const phone = this.appointmentDetails()?.contactWhatsApp || '8095550100';
    const text = encodeURIComponent(`Hola, tengo una consulta sobre mi cita ${this.bookingCode()}.`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  }
}
