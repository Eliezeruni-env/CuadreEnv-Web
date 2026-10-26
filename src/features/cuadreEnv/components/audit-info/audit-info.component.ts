import { Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditableEntity, FormOperationMode } from '../../types/api';
import { formatAuditDate, getAuditStatus } from '../../utils/audit.util';

@Component({
  selector: 'app-audit-info',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="audit-info-panel rounded-3 p-3 bg-light border border-light-subtle shadow-sm my-3" *ngIf="entity">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 pb-2 border-bottom">
        <div class="d-flex align-items-center gap-2">
          <span class="badge text-uppercase px-2.5 py-1" [ngClass]="modeBadgeClass">
            {{ modeLabel }}
          </span>
          <span class="badge px-2.5 py-1" [ngClass]="statusInfo.badgeClass">
            {{ statusInfo.label }}
          </span>
        </div>
        <small class="text-muted fst-italic">Campos de auditoría del sistema (Solo lectura)</small>
      </div>

      <div class="row g-2 small text-secondary">
        <div class="col-sm-6 col-md-3">
          <span class="fw-semibold text-dark d-block">Fecha de creación:</span>
          <span class="text-nowrap" id="audit-creation-date">{{ formattedCreationDate }}</span>
        </div>
        <div class="col-sm-6 col-md-3">
          <span class="fw-semibold text-dark d-block">Creado por:</span>
          <span id="audit-created-by">{{ entity.createBy || 'Sistema' }}</span>
        </div>
        <div class="col-sm-6 col-md-3">
          <span class="fw-semibold text-dark d-block">Última modificación:</span>
          <span class="text-nowrap" id="audit-modification-date">{{ formattedModificationDate }}</span>
        </div>
        <div class="col-sm-6 col-md-3">
          <span class="fw-semibold text-dark d-block">Modificado por:</span>
          <span id="audit-modified-by">{{ entity.modifiedBy || '—' }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .audit-info-panel {
      background-color: var(--cui-tertiary-bg, #f8f9fa) !important;
      font-size: 0.85rem;
    }
  `],
})
export class AuditInfoComponent {
  @Input() entity?: AuditableEntity | null;
  @Input() mode: FormOperationMode = 'edition';

  get formattedCreationDate(): string {
    return formatAuditDate(this.entity?.creationDate);
  }

  get formattedModificationDate(): string {
    return formatAuditDate(this.entity?.modificationDate);
  }

  get statusInfo() {
    return getAuditStatus(this.entity);
  }

  get modeLabel(): string {
    switch (this.mode) {
      case 'creation':
        return 'Modo: Creación';
      case 'edition':
        return 'Modo: Edición';
      case 'logical_deletion':
        return 'Modo: Eliminación Lógica';
      case 'reactivation':
        return 'Modo: Reactivación';
      default:
        return 'Modo: Lectura';
    }
  }

  get modeBadgeClass(): string {
    switch (this.mode) {
      case 'creation':
        return 'bg-primary-subtle text-primary border border-primary-subtle';
      case 'edition':
        return 'bg-info-subtle text-info-emphasis border border-info-subtle';
      case 'logical_deletion':
        return 'bg-danger-subtle text-danger border border-danger-subtle';
      case 'reactivation':
        return 'bg-success-subtle text-success border border-success-subtle';
      default:
        return 'bg-secondary-subtle text-secondary border border-secondary-subtle';
    }
  }
}
