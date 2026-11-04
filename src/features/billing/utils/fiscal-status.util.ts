/**
 * Utilidad canónica para estados de facturación electrónica híbrida (.NET 10 & DGII)
 * Maneja el modo Mock (Dgii:Enabled = false) y el modo Real (Dgii:Enabled = true)
 * de acuerdo con la especificación SaaS de CuadreEnv.
 */

export type FiscalBackendStatus =
  | 'AcceptedByMock'
  | 'AcceptedByDgii'
  | 'RejectedByFiscalProvider'
  | 'RetryScheduled'
  | 'Pending'
  | 'Processing';

export interface FiscalStatusInfo {
  code: FiscalBackendStatus;
  label: string;
  badgeClass: string;
  isLegalAcceptance: boolean;
  description: string;
}

export function getFiscalStatusInfo(status?: string | null, isMockMode = false): FiscalStatusInfo {
  const norm = (status || '').trim();

  switch (norm) {
    case 'AcceptedByDgii':
      return {
        code: 'AcceptedByDgii',
        label: 'Aceptado por DGII',
        badgeClass: 'badge bg-success-subtle text-success border border-success-subtle',
        isLegalAcceptance: true,
        description: 'Documento e-CF validado y aceptado con plena validez fiscal ante la DGII.',
      };

    case 'AcceptedByMock':
      return {
        code: 'AcceptedByMock',
        label: 'Aceptado en modo prueba',
        badgeClass: 'badge bg-info-subtle text-info border border-info-subtle',
        isLegalAcceptance: false,
        description: 'Aceptado en modo prueba. No representa aceptación legal ante la DGII (Modo Mock).',
      };

    case 'RejectedByFiscalProvider':
      return {
        code: 'RejectedByFiscalProvider',
        label: 'Rechazado',
        badgeClass: 'badge bg-danger-subtle text-danger border border-danger-subtle',
        isLegalAcceptance: false,
        description: 'El proveedor fiscal o la DGII rechazó la validación del documento.',
      };

    case 'RetryScheduled':
      return {
        code: 'RetryScheduled',
        label: 'Pendiente de reintento',
        badgeClass: 'badge bg-warning-subtle text-warning border border-warning-subtle',
        isLegalAcceptance: false,
        description: 'Error temporal de comunicación con DGII. Reintento programado en segundo plano.',
      };

    case 'Processing':
      return {
        code: 'Processing',
        label: 'Procesando',
        badgeClass: 'badge bg-primary-subtle text-primary border border-primary-subtle',
        isLegalAcceptance: false,
        description: 'El comprobante está siendo firmado y transmitido al servicio fiscal.',
      };

    case 'Pending':
    default:
      if (isMockMode) {
        return {
          code: 'AcceptedByMock',
          label: 'Aceptado en modo prueba',
          badgeClass: 'badge bg-info-subtle text-info border border-info-subtle',
          isLegalAcceptance: false,
          description: 'Aceptado en modo prueba. No representa aceptación legal ante la DGII (Modo Mock).',
        };
      }
      return {
        code: 'Pending',
        label: 'Pendiente',
        badgeClass: 'badge bg-secondary-subtle text-secondary border border-secondary-subtle',
        isLegalAcceptance: false,
        description: 'Comprobante fiscal pendiente de envío.',
      };
  }
}

