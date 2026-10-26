/**
 * Dominican Republic (AST / UTC-4) Time and Date Utilities
 * Ensures all time calculations, greetings, and formatting reflect Dominican Republic
 * local time (America/Santo_Domingo) regardless of client/server host timezone.
 */

export const DOMINICAN_TIMEZONE = 'America/Santo_Domingo';
export const DOMINICAN_LOCALE = 'es-DO';

/**
 * Returns current date/time adjusted to Dominican Republic timezone
 */
export function getNowInRD(): Date {
  const now = new Date();
  const rdStr = now.toLocaleString('en-US', { timeZone: DOMINICAN_TIMEZONE });
  return new Date(rdStr);
}

/**
 * Returns the current hour (0-23) in Dominican Republic
 */
export function getRDHours(date: Date | string = new Date()): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return new Date().getHours();

  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: DOMINICAN_TIMEZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(d);

  return parseInt(hourStr, 10);
}

/**
 * Returns greeting ('Buenos días', 'Buenas tardes', 'Buenas noches') based on Dominican Republic time
 */
export function getRDGreeting(date: Date | string = new Date()): string {
  const hour = getRDHours(date);
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Formats time in Dominican Republic timezone (e.g., '10:30 a. m.')
 */
export function formatTimeInRD(
  date: Date | string | null | undefined = new Date(),
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true }
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat(DOMINICAN_LOCALE, {
    timeZone: DOMINICAN_TIMEZONE,
    ...options,
  }).format(d);
}

/**
 * Formats date in Dominican Republic timezone (e.g., '18/10/2026')
 */
export function formatDateInRD(
  date: Date | string | null | undefined = new Date(),
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat(DOMINICAN_LOCALE, {
    timeZone: DOMINICAN_TIMEZONE,
    ...options,
  }).format(d);
}

/**
 * Formats full date and time in Dominican Republic timezone (e.g., '18/10/2026, 10:30 a. m.')
 */
export function formatDateTimeInRD(
  date: Date | string | null | undefined = new Date(),
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat(DOMINICAN_LOCALE, {
    timeZone: DOMINICAN_TIMEZONE,
    ...options,
  }).format(d);
}

/**
 * Calculates human-readable duration between two dates (e.g., "3h 45m" or "25m")
 */
export function calculateShiftDuration(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined = new Date()
): string {
  if (!startDate) return '0m';
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : (endDate || new Date());
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '0m';

  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Safely parses Date object, ISO string, or preformatted string without throwing Invalid Date
 */
export function parseDateSafely(date: Date | string | null | undefined): Date {
  if (!date) return getNowInRD();
  if (date instanceof Date) return isNaN(date.getTime()) ? getNowInRD() : date;

  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) return parsed;

  const parts = String(date).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    const year = parseInt(parts[3], 10);
    const timeMatch = String(date).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.\s*m\.|p\.\s*m\.)?/i);
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const meridiem = (timeMatch[4] || '').toLowerCase().replace(/\s|\./g, '');
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
    }
    const customDate = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(customDate.getTime())) return customDate;
  }

  return getNowInRD();
}

/**
 * Formats time strictly in Dominican Republic timezone in 12-hour format with AM/PM (e.g. '12:00 PM')
 */
export function formatInvoiceTime(date: Date | string | null | undefined = new Date()): string {
  const d = parseDateSafely(date);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DOMINICAN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Formats date strictly in Dominican Republic timezone (e.g. '19/10/2026')
 */
export function formatInvoiceDate(date: Date | string | null | undefined = new Date()): string {
  const d = parseDateSafely(date);
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: DOMINICAN_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats full invoice date and time with exact 12:00 AM/PM format (e.g. '19/10/2026 12:00 PM')
 */
export function formatInvoiceDateTime(date: Date | string | null | undefined = new Date()): string {
  const d = parseDateSafely(date);
  const dateStr = formatInvoiceDate(d);
  const timeStr = formatInvoiceTime(d);
  return `${dateStr} ${timeStr}`;
}

