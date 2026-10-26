import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NcfSequenceService, NcfSequenceRange } from '../../services/ncf-sequence.service';

@Component({
  selector: 'app-ncf-alert-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isDgiiActive && ncfService.criticalAlerts().length > 0) {
      <div class="ncf-alerts-container mb-3">
        @for (alert of ncfService.criticalAlerts(); track alert.id) {
          <div
            class="alert d-flex align-items-center justify-content-between py-2 px-3 mb-2 rounded-3 border shadow-sm"
            [ngClass]="{
              'alert-danger bg-danger-subtle border-danger text-danger-emphasis': alert.alertLevel === 'CRITICAL',
              'alert-warning bg-warning-subtle border-warning text-warning-emphasis': alert.alertLevel === 'WARNING'
            }"
            role="alert"
          >
            <div class="d-flex align-items-center gap-2">
              <span class="fs-5">
                {{ alert.alertLevel === 'CRITICAL' ? '🚨' : '⚠️' }}
              </span>
              <div>
                <strong class="me-1">[{{ alert.typeCode }} - {{ alert.typeName }}]</strong>
                <span class="small">{{ alert.alertMessage }}</span>
              </div>
            </div>

            <div class="d-flex align-items-center gap-3 ms-3 text-nowrap">
              <span class="badge" [ngClass]="alert.alertLevel === 'CRITICAL' ? 'bg-danger' : 'bg-warning text-dark'">
                Disponibles: {{ alert.remaining }} / {{ alert.endNumber }}
              </span>
              <span class="small text-muted d-none d-md-inline">
                Vence: <strong>{{ alert.expirationDate }}</strong> ({{ alert.daysUntilExpiration }}d)
              </span>
              <a
                href="https://dgii.gov.do/ofv"
                target="_blank"
                rel="noopener"
                class="btn btn-sm"
                [ngClass]="alert.alertLevel === 'CRITICAL' ? 'btn-danger' : 'btn-outline-warning text-dark'"
              >
                Solicitar en OFV DGII
              </a>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .ncf-alerts-container {
      animation: fadeIn 0.3s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class NcfAlertBannerComponent {
  readonly isDgiiActive = false;
  readonly ncfService = inject(NcfSequenceService);
}
