import { Injectable } from '@angular/core';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogEntry {
  level: LogLevel;
  time: string;
  msg: string;
  context?: string;
  data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  private currentLevel: LogLevel = 'info';

  private readonly levelWeights: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    silent: 99,
  };

  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelWeights[level] >= this.levelWeights[this.currentLevel];
  }

  private format(level: LogLevel, msg: string, context?: string, data?: any): LogEntry {
    return {
      level,
      time: new Date().toISOString(),
      msg,
      ...(context ? { context } : {}),
      ...(data !== undefined ? { data } : {}),
    };
  }

  trace(msg: string, context?: string, data?: any) {
    if (!this.shouldLog('trace')) return;
    const entry = this.format('trace', msg, context, data);
    console.debug(`[TRACE] [${entry.time}]${context ? ` [${context}]` : ''} ${msg}`, data ?? '');
  }

  debug(msg: string, context?: string, data?: any) {
    if (!this.shouldLog('debug')) return;
    const entry = this.format('debug', msg, context, data);
    console.debug(`[DEBUG] [${entry.time}]${context ? ` [${context}]` : ''} ${msg}`, data ?? '');
  }

  info(msg: string, context?: string, data?: any) {
    if (!this.shouldLog('info')) return;
    const entry = this.format('info', msg, context, data);
    console.info(`%c[INFO]%c [${entry.time}]${context ? ` [${context}]` : ''} ${msg}`, 'color: #0284c7; font-weight: bold;', 'color: inherit;', data ?? '');
  }

  warn(msg: string, context?: string, data?: any) {
    if (!this.shouldLog('warn')) return;
    const entry = this.format('warn', msg, context, data);
    console.warn(`%c[WARN]%c [${entry.time}]${context ? ` [${context}]` : ''} ${msg}`, 'color: #d97706; font-weight: bold;', 'color: inherit;', data ?? '');
  }

  error(msg: string, context?: string, data?: any) {
    if (!this.shouldLog('error')) return;
    const entry = this.format('error', msg, context, data);
    console.error(`%c[ERROR]%c [${entry.time}]${context ? ` [${context}]` : ''} ${msg}`, 'color: #dc2626; font-weight: bold;', 'color: inherit;', data ?? '');
  }

  /**
   * Safe request error logger for API calls.
   * Suppresses alarmist error dumps for handled client-side statuses (e.g. 403, 404).
   */
  logApiError(method: string, url: string, status: number, message: string, details?: any) {
    if (status === 403) {
      this.warn(`Acceso restringido (403) en ${method.toUpperCase()} ${url}: ${message}`, 'SaaS-Security');
      return;
    }
    if (status === 404) {
      this.debug(`Recurso no disponible aún (404) en ${method.toUpperCase()} ${url}`, 'SaaS-API');
      return;
    }
    if (status >= 500) {
      this.error(`Error de servidor (${status}) en ${method.toUpperCase()} ${url}`, 'ApiClient', { message, details });
      return;
    }
    this.warn(`Solicitud (${status}) en ${method.toUpperCase()} ${url}`, 'ApiClient', { message, details });
  }
}

export const logger = new LoggerService();
