import { FormGroup } from '@angular/forms';

export interface MappedApiError {
  type: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  errorCode?: string;
  statusCode?: number;
  requestId?: string;
  timestamp?: string;
  path?: string;
  isCritical?: boolean;
  fieldErrors?: Record<string, string>;
}

/**
 * Maps raw backend API error payload into user-friendly localized messages,
 * structured field errors, and diagnostics data (requestId, timestamp).
 */
export function mapApiErrorToUserMessage(rawError: any): MappedApiError {
  const payload = rawError?.error ?? rawError?.response?.data ?? rawError ?? {};
  const statusCode = Number(payload?.statusCode || rawError?.status || 0);
  const errorCode = String(payload?.errorCode || payload?.code || '').trim().toUpperCase();
  const requestId = payload?.requestId || rawError?.requestId;
  const timestamp = payload?.timestamp || rawError?.timestamp || new Date().toISOString();
  const path = payload?.path || rawError?.url;

  const rawMessage = payload?.message || rawError?.message || '';

  // Extract structured field validation errors
  const fieldErrors = extractFieldErrors(payload);

  // 1. Connection Failure / Server Outage / Backend Inaccessible (statusCode === 0)
  if (
    statusCode === 0 ||
    (rawError?.name === 'HttpErrorResponse' && rawError?.status === 0) ||
    rawMessage.includes('Http failure response') ||
    rawMessage.includes('Failed to fetch') ||
    rawMessage.includes('NetworkError')
  ) {
    return {
      type: 'danger',
      title: 'Avería del Servidor',
      message: 'Estamos trabajando en una avería. El equipo de desarrollo se encargará de resolverlo a la brevedad.',
      errorCode: errorCode || 'SERVER_OUTAGE',
      statusCode: 0,
      requestId,
      timestamp,
      path,
      isCritical: true,
      fieldErrors,
    };
  }

  // 2. Critical Database / Infrastructure Errors (TABLE_MISSING, DB_ERROR, statusCode >= 500)
  if (errorCode === 'TABLE_MISSING' || errorCode === 'DB_ERROR' || statusCode >= 500) {
    let friendlyMessage = 'Estamos trabajando en una avería del servidor. El equipo de desarrollo se encargará de resolverlo a la brevedad.';
    if (errorCode === 'TABLE_MISSING') {
      friendlyMessage = 'El servicio no está disponible temporalmente por avería. El equipo de desarrollo se encargará de resolverlo.';
    }

    return {
      type: 'danger',
      title: 'Avería del Servidor',
      message: friendlyMessage,
      errorCode: errorCode || 'SERVER_ERROR',
      statusCode: statusCode || 500,
      requestId,
      timestamp,
      path,
      isCritical: true,
      fieldErrors,
    };
  }

  // 2. Validation / Invalid Model Errors
  if (errorCode === 'INVALID_MODEL' || statusCode === 422 || (statusCode === 400 && Object.keys(fieldErrors).length > 0)) {
    const errorDetails = Object.values(fieldErrors).join(', ');
    return {
      type: 'warning',
      title: 'Datos Inválidos',
      message: errorDetails || rawMessage || 'Uno o varios campos del formulario contienen errores o están incompletos.',
      errorCode: 'INVALID_MODEL',
      statusCode: statusCode || 400,
      requestId,
      timestamp,
      path,
      isCritical: false,
      fieldErrors,
    };
  }

  // 2b. Cierre de Caja con Operaciones Pendientes (OPEN_CASH_OPERATIONS)
  if (
    errorCode === 'OPEN_CASH_OPERATIONS' ||
    (typeof rawMessage === 'string' && (
      rawMessage.includes('OPEN_CASH_OPERATIONS') ||
      (rawMessage.toLowerCase().includes('venta') && (rawMessage.toLowerCase().includes('espera') || rawMessage.toLowerCase().includes('pendiente')))
    ))
  ) {
    return {
      type: 'warning',
      title: 'Ventas Pendientes en Caja',
      message: rawMessage || 'Existen ventas pendientes o en espera en el POS que deben completarse o anularse antes de realizar el cierre de caja.',
      errorCode: 'OPEN_CASH_OPERATIONS',
      statusCode: statusCode || 400,
      requestId,
      timestamp,
      path,
      isCritical: false,
      fieldErrors,
    };
  }

  // 3. Duplicate Key / Unique Constraints
  if (
    errorCode === 'DUPLICATE_KEY' ||
    errorCode === 'DUPLICATE_NAME' ||
    errorCode === 'DUPLICATE_BARCODE' ||
    errorCode === 'DUPLICATE_IDENTIFICATION'
  ) {
    let msg = 'Ya existe un registro con estos datos únicos (nombre, código o identificación duplicada).';
    if (errorCode === 'DUPLICATE_NAME') {
      msg = 'El nombre proporcionado ya está registrado. Por favor, ingresa uno diferente.';
    } else if (errorCode === 'DUPLICATE_BARCODE') {
      msg = 'El código de barras ya pertenece a otro producto registrado.';
    }

    return {
      type: 'warning',
      title: 'Registro Duplicado',
      message: rawMessage || msg,
      errorCode,
      statusCode: statusCode || 409,
      requestId,
      timestamp,
      path,
      isCritical: false,
      fieldErrors,
    };
  }

  // 4. Foreign Key / Referential Integrity Violation
  if (errorCode === 'FK_VIOLATION' || errorCode === 'FOREIGN_KEY_VIOLATION') {
    return {
      type: 'warning',
      title: 'Operación No Permitida',
      message: 'No se puede completar la acción porque el registro está vinculado con otros datos en el sistema.',
      errorCode: 'FK_VIOLATION',
      statusCode: statusCode || 409,
      requestId,
      timestamp,
      path,
      isCritical: false,
      fieldErrors,
    };
  }

  // 5. Null Value Error
  if (errorCode === 'NULL_VALUE') {
    return {
      type: 'warning',
      title: 'Campos Requeridos Faltantes',
      message: rawMessage || 'Uno o más campos obligatorios no fueron proporcionados.',
      errorCode: 'NULL_VALUE',
      statusCode: statusCode || 400,
      requestId,
      timestamp,
      path,
      isCritical: false,
      fieldErrors,
    };
  }

  // 6. Security / Auth Errors
  if (errorCode === 'USER_INACTIVE' || rawMessage.toLowerCase().includes('desactivad')) {
    return {
      type: 'danger',
      title: 'Usuario Desactivado',
      message: rawMessage || 'Este usuario está desactivado. Comuníquese con el administrador para reactivar su cuenta.',
      errorCode: 'USER_INACTIVE',
      statusCode: statusCode || 403,
      requestId,
      timestamp,
      path,
      isCritical: false,
    };
  }

  if (statusCode === 401 || errorCode === 'UNAUTHORIZED') {
    return {
      type: 'danger',
      title: 'Sesión Expirada',
      message: 'Tu sesión ha caducado o no estás autenticado. Por favor, inicia sesión nuevamente.',
      errorCode: 'UNAUTHORIZED',
      statusCode: 401,
      requestId,
      timestamp,
      path,
      isCritical: false,
    };
  }

  if (statusCode === 403 || errorCode === 'FORBIDDEN') {
    return {
      type: 'danger',
      title: 'Acceso Denegado',
      message: 'No tienes los permisos necesarios para realizar esta acción.',
      errorCode: 'FORBIDDEN',
      statusCode: 403,
      requestId,
      timestamp,
      path,
      isCritical: false,
    };
  }

  // 7. Not Found
  if (statusCode === 404 || errorCode === 'NOT_FOUND') {
    return {
      type: 'info',
      title: 'Recurso No Encontrado',
      message: rawMessage || 'El registro o elemento solicitado no existe o fue eliminado.',
      errorCode: 'NOT_FOUND',
      statusCode: 404,
      requestId,
      timestamp,
      path,
      isCritical: false,
    };
  }

  // 8. Method Not Allowed (405)
  if (statusCode === 405 || errorCode === 'METHOD_NOT_ALLOWED') {
    return {
      type: 'warning',
      title: 'Método No Permitido',
      message: rawMessage || 'La operación solicitada no está habilitada en este endpoint del servidor.',
      errorCode: 'METHOD_NOT_ALLOWED',
      statusCode: 405,
      requestId,
      timestamp,
      path,
      isCritical: false,
    };
  }

  // 8. General Default Fallback
  return {
    type: 'danger',
    title: payload?.title || 'Error en la Operación',
    message: rawMessage || 'Ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo.',
    errorCode: errorCode || 'UNKNOWN_ERROR',
    statusCode: statusCode || 400,
    requestId,
    timestamp,
    path,
    isCritical: false,
    fieldErrors,
  };
}

/**
 * Extracts normalized field error map { [field]: 'Error message' } from varied backend formats.
 */
function extractFieldErrors(payload: any): Record<string, string> {
  const result: Record<string, string> = {};

  if (!payload) return result;

  // Case A: payload.errors is an array of objects e.g. [{ field: 'cost', message: 'Must be > 0' }]
  if (Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      if (typeof item === 'object' && item !== null) {
        const field = item.field || item.propertyName || item.name;
        const msg = item.message || item.errorMessage || item.error;
        if (field && msg) {
          result[lowercaseFirst(field)] = String(msg);
        }
      } else if (typeof item === 'string') {
        const parts = item.split(':');
        if (parts.length > 1) {
          result[lowercaseFirst(parts[0].trim())] = parts.slice(1).join(':').trim();
        }
      }
    }
  }

  // Case B: payload.errors is an object e.g. { cost: ['Must be > 0'], description: 'Required' }
  if (payload.errors && typeof payload.errors === 'object' && !Array.isArray(payload.errors)) {
    for (const [key, val] of Object.entries(payload.errors)) {
      const msg = Array.isArray(val) ? val.join(', ') : String(val);
      result[lowercaseFirst(key)] = msg;
    }
  }

  // Case C: payload.error?.details array
  if (Array.isArray(payload.error?.details)) {
    for (const item of payload.error.details) {
      if (item?.field && item?.message) {
        result[lowercaseFirst(item.field)] = String(item.message);
      }
    }
  }

  return result;
}

function lowercaseFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Applies backend validation field errors onto an Angular Reactive FormGroup.
 */
export function applyFieldErrorsToForm(
  formGroup: FormGroup,
  fieldErrors?: Record<string, string>,
): void {
  if (!formGroup || !fieldErrors) return;

  for (const [fieldName, errorMessage] of Object.entries(fieldErrors)) {
    const control = formGroup.get(fieldName);
    if (control) {
      control.setErrors({
        serverError: errorMessage,
        ...control.errors,
      });
      control.markAsTouched();
    }
  }
}
