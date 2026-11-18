import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface TestmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  downloadUrl?: string;
  cid?: string;
}

export interface TestmailEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  timestamp: number;
  downloadUrl?: string;
  attachments?: TestmailAttachment[];
  tag?: string;
}

export interface TestmailApiResponse {
  result: 'success' | 'fail';
  message?: string | null;
  count: number;
  limit: number;
  offset: number;
  emails: TestmailEmail[];
}

export interface TestmailConfig {
  apiKey: string;
  namespace: string;
  sandboxEnabled: boolean;
}

const STORAGE_KEY_APIKEY = 'cuadreenv_testmail_apikey';
const STORAGE_KEY_NAMESPACE = 'cuadreenv_testmail_namespace';
const STORAGE_KEY_ENABLED = 'cuadreenv_testmail_sandbox_enabled';

export const DEFAULT_TESTMAIL_APIKEY = '1aa16f10-a5e5-4108-9c4a-eedfd26bbd03';
export const DEFAULT_TESTMAIL_NAMESPACE = 'tf6cj';

@Injectable({
  providedIn: 'root',
})
export class TestmailService {
  private http = inject(HttpClient);

  /**
   * Obtiene la configuración actual de Testmail
   */
  getConfig(): TestmailConfig {
    let apiKey = DEFAULT_TESTMAIL_APIKEY;
    let namespace = DEFAULT_TESTMAIL_NAMESPACE;
    let sandboxEnabled = true;

    if (typeof window !== 'undefined' && window.localStorage) {
      const storedKey = localStorage.getItem(STORAGE_KEY_APIKEY);
      const storedNs = localStorage.getItem(STORAGE_KEY_NAMESPACE);
      const storedEn = localStorage.getItem(STORAGE_KEY_ENABLED);

      if (storedKey) apiKey = storedKey.trim();
      if (storedNs) namespace = storedNs.trim();
      if (storedEn !== null) sandboxEnabled = storedEn === 'true';
    }

    return { apiKey, namespace, sandboxEnabled };
  }

  /**
   * Guarda nueva configuración en LocalStorage
   */
  saveConfig(config: Partial<TestmailConfig>): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    if (config.apiKey !== undefined) {
      localStorage.setItem(STORAGE_KEY_APIKEY, config.apiKey.trim());
    }
    if (config.namespace !== undefined) {
      localStorage.setItem(STORAGE_KEY_NAMESPACE, config.namespace.trim());
    }
    if (config.sandboxEnabled !== undefined) {
      localStorage.setItem(STORAGE_KEY_ENABLED, String(config.sandboxEnabled));
    }
  }

  /**
   * Sanitiza un tag a caracteres alfanuméricos válidos para Testmail (a-z, 0-9)
   */
  sanitizeTag(rawTag: string): string {
    if (!rawTag) return 'factura';
    const cleaned = rawTag.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleaned.length > 0 ? cleaned : 'factura';
  }

  /**
   * Genera una dirección de buzón dinámico de Testmail
   * Formato: namespace.tag@inbox.testmail.app
   */
  generateEmailAddress(tag?: string): string {
    const { namespace } = this.getConfig();
    const cleanTag = this.sanitizeTag(tag || 'factura');
    return `${namespace}.${cleanTag}@inbox.testmail.app`;
  }

  /**
   * Consulta los correos recibidos en el namespace de Testmail
   */
  async fetchEmails(options?: { tag?: string; limit?: number }): Promise<TestmailApiResponse> {
    const { apiKey, namespace } = this.getConfig();
    if (!apiKey || !namespace) {
      throw new Error('Testmail no está configurado (falta API Key o Namespace).');
    }

    let url = `https://api.testmail.app/api/json?apikey=${encodeURIComponent(apiKey)}&namespace=${encodeURIComponent(namespace)}&pretty=true`;
    if (options?.tag) {
      const tag = this.sanitizeTag(options.tag);
      url += `&tag=${encodeURIComponent(tag)}`;
    }
    if (options?.limit && options.limit > 0) {
      url += `&limit=${options.limit}`;
    }

    try {
      const response = await firstValueFrom(this.http.get<TestmailApiResponse>(url));
      return response;
    } catch (err: any) {
      // Fallback a fetch nativo para evitar interferencias de interceptores de sesión
      try {
        const rawRes = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!rawRes.ok) {
          throw new Error(`Testmail API HTTP Error: ${rawRes.status} ${rawRes.statusText}`);
        }
        return await rawRes.json() as TestmailApiResponse;
      } catch (fallbackErr: any) {
        throw new Error(err?.message || fallbackErr?.message || 'Error al conectar con la API de Testmail');
      }
    }
  }

  /**
   * Obtiene el correo más reciente recibido bajo un tag específico (o en todo el namespace)
   */
  async getLatestEmail(tag?: string): Promise<TestmailEmail | null> {
    try {
      const res = await this.fetchEmails({ tag, limit: 1 });
      if (res && res.result === 'success' && res.emails && res.emails.length > 0) {
        return res.emails[0];
      }
      return null;
    } catch (e) {
      console.warn('[TestmailService] No se pudo obtener el último correo:', e);
      return null;
    }
  }

  /**
   * Realiza un test de conexión al namespace de Testmail
   */
  async testConnection(): Promise<{ success: boolean; message: string; count?: number }> {
    try {
      const res = await this.fetchEmails({ limit: 1 });
      if (res.result === 'success') {
        return {
          success: true,
          message: `Conexión exitosa con Namespace "${this.getConfig().namespace}". Total en bandeja: ${res.count} correos.`,
          count: res.count,
        };
      }
      return {
        success: false,
        message: res.message || 'Respuesta no exitosa de Testmail.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Error de conexión con Testmail.app',
      };
    }
  }
}
