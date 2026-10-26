import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DgiiReportsService,
  DgiiReportSummary,
} from '../../services/dgii-reports.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import {
  ButtonDirective,
  ColComponent,
  ContainerComponent,
  RowComponent,
  SpinnerComponent,
} from '@coreui/angular';

@Component({
  selector: 'app-dgii-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ContainerComponent,
    RowComponent,
    ColComponent,
    ButtonDirective,
    SpinnerComponent,
  ],
  templateUrl: './dgii-reports.component.html',
  styleUrls: ['./dgii-reports.component.scss'],
})
export class DgiiReportsComponent implements OnInit {
  private readonly reportsService = inject(DgiiReportsService);
  private readonly notificationService = inject(NotificationService);

  activeReport = signal<'606' | '607' | '608'>('607');
  selectedYear = signal<number>(new Date().getFullYear());
  selectedMonth = signal<number>(new Date().getMonth() + 1);

  isLoading = signal<boolean>(false);
  isDownloading = signal<boolean>(false);

  reportData = signal<DgiiReportSummary | null>(null);

  years = [2026, 2025, 2024, 2023];
  months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];

  readonly periodLabel = computed(() => {
    const m = this.months.find((x) => x.value === this.selectedMonth())?.label;
    return `${m} ${this.selectedYear()}`;
  });

  ngOnInit() {
    this.loadReport();
  }

  setReportType(type: '606' | '607' | '608') {
    if (this.activeReport() === type) return;
    this.activeReport.set(type);
    this.loadReport();
  }

  async loadReport() {
    this.isLoading.set(true);
    try {
      let res;
      if (this.activeReport() === '606') {
        res = await this.reportsService.getReport606(this.selectedYear(), this.selectedMonth());
      } else if (this.activeReport() === '607') {
        res = await this.reportsService.getReport607(this.selectedYear(), this.selectedMonth());
      } else {
        res = await this.reportsService.getReport608(this.selectedYear(), this.selectedMonth());
      }

      if (res.success && res.data) {
        this.reportData.set(res.data);
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
      this.reportData.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  async downloadTxt() {
    this.isDownloading.set(true);
    try {
      await this.reportsService.downloadReportFile(
        this.activeReport(),
        this.selectedYear(),
        this.selectedMonth(),
      );
      this.notificationService.success(
        `Archivo DGII ${this.activeReport()} descargado exitosamente listo para la Oficina Virtual.`,
      );
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isDownloading.set(false);
    }
  }
}
