import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { ApiResponse } from '../../cuadreEnv/types/api';

export interface TaxpayerDto {
  rnc: string;
  name: string;
  commercialName?: string;
  category?: string;
  paymentRegime?: string;
  status: 'ACTIVO' | 'SUSPENDIDO' | 'EN CESE' | 'DESCONOCIDO' | string;
  isValid: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TaxpayerService {
  private readonly api = inject(ApiClientService);

  /**
   * Normaliza visualmente un documento RNC o Cédula eliminando guiones y espacios.
   */
  normalizeDocument(raw: string): string {
    if (!raw) return '';
    return raw.replace(/[-\s]/g, '').trim();
  }

  /**
   * Formatea un RNC (9 dígitos) o Cédula (11 dígitos) con sus guiones estándar dominicanos.
   */
  formatDocument(cleanDoc: string): string {
    const clean = this.normalizeDocument(cleanDoc);
    if (clean.length === 9) {
      // Formato RNC: 1-01-00000-1 o 101-00000-1
      return `${clean.substring(0, 3)}-${clean.substring(3, 8)}-${clean.substring(8)}`;
    }
    if (clean.length === 11) {
      // Formato Cédula: 001-0000000-1
      return `${clean.substring(0, 3)}-${clean.substring(3, 10)}-${clean.substring(10)}`;
    }
    return clean;
  }

  /**
   * Consulta el padrón oficial de la DGII a través del backend.
   * El backend valida la existencia real, razón social y estado del contribuyente.
   */
  async getTaxpayer(rncOrCedula: string): Promise<ApiResponse<TaxpayerDto>> {
    const clean = this.normalizeDocument(rncOrCedula);
    if (!clean || clean.length < 9) {
      return {
        success: false,
        message: 'El documento debe contener al menos 9 dígitos (RNC) u 11 dígitos (Cédula).',
      };
    }

    try {
      // 1. Intentar ruta canónica GET /v1/dgii/taxpayers/{rnc}
      const res = await this.api.get<any, any>(`/dgii/taxpayers/${clean}`);
      const data = res?.data || res;

      return {
        success: true,
        data: {
          rnc: clean,
          name: data.name || data.businessName || data.razonSocial || '',
          commercialName: data.commercialName || data.nombreComercial || '',
          category: data.category || data.actividadEconomica || 'General',
          paymentRegime: data.paymentRegime || data.regimen || 'Ordinario',
          status: (data.status || 'ACTIVO').toUpperCase(),
          isValid: data.status ? data.status.toUpperCase() === 'ACTIVO' : true,
        },
      };
    } catch (err: any) {
      // 2. Fallback a compatibilidad GET /v1/taxpayers/{rnc}
      try {
        const fallbackRes = await this.api.get<any, any>(`/taxpayers/${clean}`);
        const fData = fallbackRes?.data || fallbackRes;
        return {
          success: true,
          data: {
            rnc: clean,
            name: fData.name || fData.businessName || fData.razonSocial || '',
            commercialName: fData.commercialName || '',
            category: fData.category || '',
            paymentRegime: fData.paymentRegime || '',
            status: (fData.status || 'ACTIVO').toUpperCase(),
            isValid: true,
          },
        };
      } catch (fErr: any) {
        throw err?.mappedError ? err : fErr;
      }
    }
  }

  /**
   * Registra o actualiza la información fiscal de un contribuyente en el backend.
   */
  async saveTaxpayer(taxpayer: TaxpayerDto): Promise<ApiResponse<TaxpayerDto>> {
    const payload = {
      ...taxpayer,
      rnc: this.normalizeDocument(taxpayer.rnc),
    };
    const res = await this.api.post<any, any>('/taxpayers', payload);
    return {
      success: true,
      data: (res?.data || res) as TaxpayerDto,
      message: 'Contribuyente guardado correctamente en la base de datos fiscal.',
    };
  }
}
