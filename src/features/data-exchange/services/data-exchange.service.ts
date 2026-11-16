import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../cuadreEnv/types/api';
import {
  ImportPreviewResponseDto,
  ImportConfirmResponseDto,
  DataExchangeLogDto
} from '../models/data-exchange.models';

@Injectable({
  providedIn: 'root'
})
export class DataExchangeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl =
    (environment.apiUrl || 'http://localhost:8080').replace(/\/v1\/?$/, '').replace(/\/$/, '') + '/v1/data-exchange';

  /**
   * Descarga la plantilla oficial en blanco con encabezados, validaciones y ejemplos (.xlsx o .csv)
   */
  async downloadTemplate(entity: string, format: 'xlsx' | 'csv' = 'xlsx'): Promise<void> {
    const url = `${this.baseUrl}/templates/${entity}?format=${format}`;
    const response = await firstValueFrom(
      this.http.get(url, {
        responseType: 'blob',
        observe: 'response'
      })
    );

    const blob = response.body;
    if (!blob) throw new Error('No se recibió contenido para la plantilla.');

    let filename = `Plantilla_${entity}.${format}`;
    const disposition = response.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, '').trim();
      }
    }

    this.triggerBrowserDownload(blob, filename);
  }

  /**
   * Exporta el catálogo completo actual de la empresa en .xlsx o .csv
   */
  async exportData(entity: string, format: 'xlsx' | 'csv' = 'xlsx'): Promise<void> {
    const url = `${this.baseUrl}/export/${entity}?format=${format}`;
    const response = await firstValueFrom(
      this.http.get(url, {
        responseType: 'blob',
        observe: 'response'
      })
    );

    const blob = response.body;
    if (!blob) throw new Error('No se recibió contenido para la exportación.');

    let filename = `Catalogo_${entity}_${new Date().toISOString().slice(0, 10)}.${format}`;
    const disposition = response.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, '').trim();
      }
    }

    this.triggerBrowserDownload(blob, filename);
  }

  /**
   * Sube archivo para previsualización, detección de cambios y validación estricta de lote
   */
  async previewImport(
    entity: string,
    file: File,
    mode: 'create_and_update' | 'create_only' = 'create_and_update'
  ): Promise<ApiResponse<ImportPreviewResponseDto>> {
    const url = `${this.baseUrl}/preview/${entity}?mode=${mode}`;
    const formData = new FormData();
    formData.append('file', file, file.name);

    return await firstValueFrom(
      this.http.post<ApiResponse<ImportPreviewResponseDto>>(url, formData)
    );
  }

  /**
   * Confirma la aplicación atómica e idempotente del lote validado
   */
  async confirmImport(batchId: string): Promise<ApiResponse<ImportConfirmResponseDto>> {
    const url = `${this.baseUrl}/confirm/${batchId}`;
    return await firstValueFrom(
      this.http.post<ApiResponse<ImportConfirmResponseDto>>(url, {})
    );
  }

  /**
   * Descarga reporte en Excel con todas las filas que tuvieron errores de validación
   */
  async downloadErrors(batchId: string): Promise<void> {
    const url = `${this.baseUrl}/errors/${batchId}`;
    const response = await firstValueFrom(
      this.http.get(url, {
        responseType: 'blob',
        observe: 'response'
      })
    );

    const blob = response.body;
    if (!blob) throw new Error('No se recibió reporte de errores.');

    let filename = `Errores_Importacion_${batchId.slice(0, 8)}.xlsx`;
    const disposition = response.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, '').trim();
      }
    }

    this.triggerBrowserDownload(blob, filename);
  }

  /**
   * Obtiene historial de intercambios de datos (importaciones y exportaciones)
   */
  async getHistory(): Promise<ApiResponse<DataExchangeLogDto[]>> {
    const url = `${this.baseUrl}/history`;
    return await firstValueFrom(
      this.http.get<ApiResponse<DataExchangeLogDto[]>>(url)
    );
  }

  private triggerBrowserDownload(blob: Blob, filename: string): void {
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }
}
