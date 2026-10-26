import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

export interface NcfSequenceRange {
  id: number;
  typeCode: string; // 'B01' | 'B02' | 'B04' | 'B14' | 'B15' | 'E31' | 'E32'
  typeName: string;
  prefix: string;
  currentNumber: number;
  startNumber: number;
  endNumber: number;
  expirationDate: string; // YYYY-MM-DD
  isActive: boolean;
  remaining?: number;
  daysUntilExpiration?: number;
  alertLevel?: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  alertMessage?: string;
}

const NCF_SEQUENCES_STORAGE_KEY = 'cuadreenv_ncf_sequences_db';

@Injectable({
  providedIn: 'root',
})
export class NcfSequenceService {
  private api = inject(ApiClientService);

  private sequencesSignal = signal<NcfSequenceRange[]>(this.loadStoredSequences());

  readonly sequences = computed(() => this.sequencesSignal().map((s) => this.enrichSequence(s)));

  readonly criticalAlerts = computed(() =>
    this.sequences().filter((s) => s.alertLevel === 'CRITICAL' || s.alertLevel === 'WARNING'),
  );

  private loadStoredSequences(): NcfSequenceRange[] {
    try {
      if (typeof window === 'undefined') return [];
      const raw = localStorage.getItem(NCF_SEQUENCES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Limpiar datos si coinciden con los mocks obsoletos de 965 o 4960
      if (Array.isArray(parsed) && parsed.some((item: any) => item.currentNumber === 965 || item.currentNumber === 4960)) {
        localStorage.removeItem(NCF_SEQUENCES_STORAGE_KEY);
        return [];
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveStoredSequences(list: NcfSequenceRange[]) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(NCF_SEQUENCES_STORAGE_KEY, JSON.stringify(list));
      }
      this.sequencesSignal.set(list);
    } catch {
      // ignore
    }
  }

  enrichSequence(seq: NcfSequenceRange): NcfSequenceRange {
    const remaining = Math.max(0, seq.endNumber - seq.currentNumber);
    
    // Calculate days until expiration
    const now = new Date().getTime();
    const exp = new Date(seq.expirationDate).getTime();
    const daysUntilExpiration = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

    let alertLevel: 'CRITICAL' | 'WARNING' | 'HEALTHY' = 'HEALTHY';
    let alertMessage = '';

    if (remaining <= 50 || daysUntilExpiration <= 7) {
      alertLevel = 'CRITICAL';
      if (remaining <= 50) {
        alertMessage = `🚨 ALERTA CRÍTICA DGII: Quedan solo ${remaining} números disponibles de ${seq.typeCode}. Solicite nueva autorización en la Oficina Virtual de inmediato.`;
      } else {
        alertMessage = `🚨 ALERTA CRÍTICA DGII: La secuencia ${seq.typeCode} vence en ${daysUntilExpiration} días (${seq.expirationDate}). Las facturas emitidas tras esa fecha serán invalidadas.`;
      }
    } else if (remaining <= 100 || daysUntilExpiration <= 15) {
      alertLevel = 'WARNING';
      if (remaining <= 100) {
        alertMessage = `⚠️ Advertencia DGII: Secuencia ${seq.typeCode} en agotamiento (${remaining} disponibles de ${seq.endNumber}).`;
      } else {
        alertMessage = `⚠️ Advertencia DGII: Secuencia ${seq.typeCode} próxima a vencer en ${daysUntilExpiration} días (${seq.expirationDate}).`;
      }
    }

    return {
      ...seq,
      remaining,
      daysUntilExpiration,
      alertLevel,
      alertMessage,
    };
  }

  /**
   * Consulta las secuencias fiscales activas de la DGII.
   * Rutas: GET /v1/ncf-sequences con fallback a /v1/fiscal-sequences
   */
  async getSequences(): Promise<ApiResponse<NcfSequenceRange[]>> {
    try {
      let res: any = null;
      try {
        res = await this.api.get<any, any>('/ncf-sequences');
      } catch {
        try {
          res = await this.api.get<any, any>('/fiscal-sequences');
        } catch {
          res = await this.api.get<any, any>('/FiscalSequence');
        }
      }

      const list = extractArray<NcfSequenceRange>(res);
      if (list && list.length > 0) {
        this.saveStoredSequences(list);
        return { success: true, data: this.sequences() };
      }
    } catch {
      // Offline fallback
    }
    return { success: true, data: this.sequences() };
  }

  /**
   * Registra o actualiza una secuencia fiscal autorizada por la DGII.
   * Rutas: POST /v1/ncf-sequences con fallback a /v1/fiscal-sequences
   */
  async saveSequence(sequence: Partial<NcfSequenceRange>): Promise<ApiResponse<NcfSequenceRange>> {
    let res: any = null;
    try {
      res = await this.api.post<any, any>('/ncf-sequences', sequence);
    } catch {
      try {
        res = await this.api.post<any, any>('/fiscal-sequences', sequence);
      } catch {
        res = await this.api.post<any, any>('/FiscalSequence', sequence);
      }
    }

    const saved = res?.data || res || sequence;
    const currentList = this.sequencesSignal();
    const index = currentList.findIndex((s) => s.typeCode === sequence.typeCode);
    let updatedList: NcfSequenceRange[];
    if (index >= 0) {
      updatedList = [...currentList];
      updatedList[index] = { ...updatedList[index], ...saved };
    } else {
      updatedList = [...currentList, saved as NcfSequenceRange];
    }
    this.saveStoredSequences(updatedList);
    return { success: true, data: saved };
  }

  /**
   * Solicita transaccionalmente el siguiente NCF asignado por el backend:
   * POST /v1/ncf-sequences/request-next
   */
  async requestNext(typeCode: string): Promise<string> {
    try {
      const res = await this.api.post<any, any>('/ncf-sequences/request-next', { typeCode });
      const nextNcf = res?.data?.ncf || res?.ncf || res?.data;
      if (nextNcf && typeof nextNcf === 'string') {
        return nextNcf;
      }
    } catch {
      // Fallback a consumo local seguro
    }
    return this.consumeSequence(typeCode);
  }

  getSequenceByType(typeCode: string): NcfSequenceRange | undefined {
    return this.sequences().find((s) => s.typeCode.toUpperCase() === typeCode.toUpperCase());
  }

  consumeSequence(typeCode: string): string {
    const list = [...this.sequencesSignal()];
    const index = list.findIndex((s) => s.typeCode.toUpperCase() === typeCode.toUpperCase());
    if (index === -1) {
      return '';
    }

    const item = list[index];
    if (item.currentNumber >= item.endNumber) {
      throw new Error(`Secuencia ${item.typeCode} agotada ante la DGII. No se pueden emitir más comprobantes.`);
    }

    item.currentNumber += 1;
    const formattedNumber = `${item.prefix}${String(item.currentNumber).padStart(8, '0')}`;
    this.saveStoredSequences(list);
    return formattedNumber;
  }
}
