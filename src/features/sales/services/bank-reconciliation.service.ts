import { Injectable, inject } from '@angular/core';
import { SaleService } from './sale.service';
import { getCompanyId, ApiClientService } from '../../cuadreEnv/services/apiClient';
import type { SaleResponseDto } from '../../cuadreEnv/types/api';

export type BankReconciliationStatus = 'PENDING' | 'VERIFIED' | 'DISCREPANT';

export interface BankTransferRecord {
  id: string; // Composite or Sale ID
  saleId: number;
  invoiceNumber: string;
  customerName: string;
  date: string;
  amount: number;
  bankName: string;
  accountLastFour?: string;
  confirmationNumber: string;
  rawPaymentMethod: string;
  status: BankReconciliationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  discrepancyReason?: string;
  notes?: string;
}

const RECONCILIATION_STORAGE_PREFIX = 'cuadreenv_bank_reconciliation_';

@Injectable({
  providedIn: 'root',
})
export class BankReconciliationService {
  private readonly saleService = inject(SaleService);
  private readonly api = inject(ApiClientService);

  private getStorageKey(): string {
    const compId = getCompanyId() || 'default';
    return `${RECONCILIATION_STORAGE_PREFIX}${compId}`;
  }

  getAuditAuditMap(): Record<string, { status: BankReconciliationStatus; verifiedBy?: string; verifiedAt?: string; discrepancyReason?: string }> {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  saveAuditState(
    recordId: string,
    status: BankReconciliationStatus,
    verifiedBy = 'Supervisor',
    discrepancyReason?: string,
  ): void {
    try {
      const map = this.getAuditAuditMap();
      map[recordId] = {
        status,
        verifiedBy,
        verifiedAt: new Date().toISOString(),
        discrepancyReason: status === 'DISCREPANT' ? discrepancyReason : undefined,
      };
      localStorage.setItem(this.getStorageKey(), JSON.stringify(map));

      // Asynchronously sync with Backend API
      const numericId = parseInt(recordId, 10);
      if (!isNaN(numericId) && numericId > 0) {
        if (status === 'VERIFIED') {
          this.api.post(`/BankReconciliation/${numericId}/reconcile`, { verifiedBy }).catch(() => {});
        } else if (status === 'DISCREPANT') {
          this.api.post(`/BankReconciliation/${numericId}/discrepancy`, {
            statementAmount: 0,
            differenceAmount: 0,
            discrepancyReason: discrepancyReason || 'Discrepancia detectada',
            verifiedBy,
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('Error saving bank reconciliation state:', e);
    }
  }

  /**
   * Extrae y normaliza todas las ventas que contengan transferencias bancarias
   */
  async getTransferRecords(): Promise<BankTransferRecord[]> {
    try {
      const res = await this.api.get<any, any>('/BankReconciliation/records');
      const backendItems = Array.isArray(res) ? res : res?.data;
      if (Array.isArray(backendItems) && backendItems.length > 0) {
        return backendItems.map((b: any) => ({
          id: String(b.id),
          saleId: b.saleId || b.id,
          invoiceNumber: b.invoiceNumber || `FAC-${b.id}`,
          customerName: b.customerName || 'Cliente',
          date: b.date || new Date().toISOString().split('T')[0],
          amount: b.registeredAmount || 0,
          bankName: b.destinationBank || 'Banco Popular',
          accountLastFour: b.accountLastFour,
          confirmationNumber: b.bankReference || 'TRF-0000',
          rawPaymentMethod: 'Transferencia',
          status: (b.status === 'VERIFIED' ? 'VERIFIED' : b.status === 'DISCREPANT' ? 'DISCREPANT' : 'PENDING') as BankReconciliationStatus,
          verifiedBy: b.verifiedBy,
          verifiedAt: b.verifiedAt,
          discrepancyReason: b.discrepancyReason,
          notes: b.notes
        }));
      }
    } catch {}

    const auditMap = this.getAuditAuditMap();
    const salesRes = await this.saleService.getSales({ pageSize: 150 });
    const sales: SaleResponseDto[] = salesRes.success && salesRes.data ? salesRes.data : [];

    const records: BankTransferRecord[] = [];

    for (const sale of sales) {
      const anySale = sale as any;
      const pm = (sale.paymentMethod || '').toLowerCase();
      const pr = (anySale.paymentReference || '').toLowerCase();
      const notes = (sale.notes || '').toLowerCase();

      const isTransfer =
        pm.includes('transfer') ||
        pr.includes('transfer') ||
        notes.includes('transfer') ||
        pm.includes('banco') ||
        pm.includes('cta') ||
        pr.includes('cta');

      if (!isTransfer) continue;

      // Extraer Nombre del Banco
      let bankName = 'Banco No Especificado';
      const knownBanks = ['Popular', 'BHD', 'Banreservas', 'Scotiabank', 'APAP', 'Santa Cruz', 'Promerica', 'Qik', 'Banesco'];
      for (const b of knownBanks) {
        if (
          sale.paymentMethod?.toLowerCase().includes(b.toLowerCase()) ||
          anySale.paymentReference?.toLowerCase().includes(b.toLowerCase()) ||
          sale.notes?.toLowerCase().includes(b.toLowerCase())
        ) {
          bankName = `Banco ${b}`;
          break;
        }
      }

      // Extraer últimos 4 dígitos
      let lastFour: string | undefined = undefined;
      const fourMatch = (sale.paymentMethod + ' ' + (anySale.paymentReference || '') + ' ' + (sale.notes || '')).match(
        /\*{2,4}(\d{4})|cta[:\s*]*(\d{4})/i,
      );
      if (fourMatch) {
        lastFour = fourMatch[1] || fourMatch[2];
      }

      // Extraer número de confirmación / referencia
      let confirmationNumber = 'Sin Referencia';
      const refMatch = (sale.paymentMethod + ' ' + (anySale.paymentReference || '') + ' ' + (sale.notes || '')).match(
        /ref[:\s*]*([A-Za-z0-9_-]+)/i,
      );
      if (refMatch && refMatch[1]) {
        confirmationNumber = refMatch[1].trim();
      } else if (anySale.paymentReference) {
        confirmationNumber = anySale.paymentReference.replace(/Ref:/i, '').trim();
      }

      const recordId = `TRF-${sale.id}`;
      const audit = auditMap[recordId];

      records.push({
        id: recordId,
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber || `VTA-${sale.id}`,
        customerName: sale.customerName || 'Cliente General',
        date: sale.creationDate || new Date().toISOString(),
        amount: Number(sale.total) || 0,
        bankName,
        accountLastFour: lastFour,
        confirmationNumber,
        rawPaymentMethod: sale.paymentMethod || 'Transferencia',
        status: audit?.status || 'PENDING',
        verifiedBy: audit?.verifiedBy,
        verifiedAt: audit?.verifiedAt,
        discrepancyReason: audit?.discrepancyReason,
        notes: sale.notes,
      });
    }

    // Ordenar de más reciente a más antiguo
    return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}
