import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { AgendaReportsDto } from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, IconDirective],
  templateUrl: './agenda-reports.component.html',
  styleUrls: ['./agenda-reports.component.scss'],
})
export class AgendaReportsComponent implements OnInit {
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  reportsData = signal<AgendaReportsDto | null>(null);

  selectedMonth = 11;
  selectedYear = 2026;

  ngOnInit(): void {
    this.loadReports();
  }

  async loadReports(): Promise<void> {
    try {
      this.isLoading.set(true);
      const data = await this.agendaService.getReports(this.selectedYear, this.selectedMonth);
      this.reportsData.set(data);
    } catch (err: any) {
      this.notificationService.error('Error al cargar reportes', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  exportData(): void {
    this.notificationService.success('Exportando reporte', 'Se está generando el archivo Excel del reporte de citas.');
  }

  getMaxDaily(): number {
    const list = this.reportsData()?.dailyAppointments || [];
    if (list.length === 0) return 10;
    return Math.max(...list.map((d) => d.count), 1);
  }
}
