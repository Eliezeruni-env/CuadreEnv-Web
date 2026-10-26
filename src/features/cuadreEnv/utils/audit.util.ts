import { AuditableEntity, FormOperationMode } from '../types/api';

/**
 * Formatea fechas de auditoría al formato local del usuario.
 * Solo para visualización en la interfaz.
 */
export function formatAuditDate(
  dateValue: string | Date | null | undefined,
  locale = 'es-DO',
): string {
  if (!dateValue) return '—';
  try {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Determina el estado de un registro auditable para etiquetas y badges.
 */
export function getAuditStatus(entity: AuditableEntity | null | undefined): {
  label: string;
  badgeClass: string;
  isDeleted: boolean;
  active: boolean;
} {
  if (!entity) {
    return { label: 'Desconocido', badgeClass: 'bg-secondary text-white', isDeleted: false, active: false };
  }

  if (entity.isDeleted) {
    return {
      label: 'Eliminado lógicamente',
      badgeClass: 'bg-danger-subtle text-danger border border-danger-subtle',
      isDeleted: true,
      active: false,
    };
  }

  if (entity.active === false) {
    return {
      label: 'Deshabilitado',
      badgeClass: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle',
      isDeleted: false,
      active: false,
    };
  }

  return {
    label: 'Habilitado / Activo',
    badgeClass: 'bg-success-subtle text-success border border-success-subtle',
    isDeleted: false,
    active: true,
  };
}

/**
 * Filtra y elimina campos de auditoría del payload antes de enviar a endpoints estándar
 * para evitar que el frontend intente mutar campos de solo lectura gestionados por el BE.
 */
export function stripAuditFields<T extends Record<string, any>>(payload: T): Partial<T> {
  const {
    creationDate: _cd,
    modificationDate: _md,
    createBy: _cb,
    modifiedBy: _mb,
    isDeleted: _id,
    active: _ac,
    ...clean
  } = payload;
  return clean as Partial<T>;
}

/**
 * Determina el modo de operación para un formulario dado el estado de la entidad.
 */
export function resolveFormOperationMode(
  entity: AuditableEntity | null | undefined,
  isCreating: boolean,
  action?: 'delete' | 'reactivate' | null,
): FormOperationMode {
  if (isCreating || !entity) {
    return 'creation';
  }
  if (action === 'delete') {
    return 'logical_deletion';
  }
  if (action === 'reactivate' || (entity.isDeleted && entity.active === false)) {
    return 'reactivation';
  }
  return 'edition';
}
