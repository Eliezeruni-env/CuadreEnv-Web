import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-status-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-indicator.component.html',
  styleUrls: ['./status-indicator.component.scss'],
})
export class StatusIndicatorComponent implements OnChanges {
  @Input() status: string | boolean = '';
  @Input() label?: string;
  @Input() variant?: 'success' | 'warning' | 'danger' | 'info' | 'secondary';

  badgeClass = 'badge-secondary-soft';

  ngOnChanges() {
    this.computeBadgeClass();
  }

  private computeBadgeClass() {
    if (this.variant) {
      this.badgeClass = `badge-${this.variant}-soft`;
      return;
    }

    const s = String(this.status).toLowerCase().trim();
    if (s === 'true' || s === 'pagada' || s === 'pagado' || s === 'completado' || s === 'activo' || s === 'open' || s === 'processed') {
      this.badgeClass = 'badge-success-soft';
    } else if (s === 'parcial' || s === 'pendiente' || s === 'warning' || s === 'in-progress') {
      this.badgeClass = 'badge-warning-soft';
    } else if (s === 'vencida' || s === 'vencido' || s === 'cancelado' || s === 'false' || s === 'inactivo' || s === 'cancelled' || s === 'error') {
      this.badgeClass = 'badge-danger-soft';
    } else {
      this.badgeClass = 'badge-secondary-soft';
    }
  }
}
