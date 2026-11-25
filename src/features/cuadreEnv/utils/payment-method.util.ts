/**
 * Utilidad unificada de traducción y formateo de métodos de pago.
 * Mapea valores numéricos y en inglés (CASH, OTHER, CARD, TRANSFER, CREDIT, etc.) a español.
 */
export function formatPaymentMethodLabel(method?: string | number | null): string {
  if (method === null || method === undefined || method === '') return 'Efectivo';
  
  const clean = String(method).trim();
  const upper = clean.toUpperCase();

  switch (upper) {
    case '1':
    case 'CASH':
      return 'Efectivo';
    case '2':
    case 'CARD':
    case 'DEBIT':
    case 'CREDIT_CARD':
      return 'Tarjeta';
    case '3':
    case 'TRANSFER':
    case 'BANK_TRANSFER':
      return 'Transferencia';
    case '4':
    case 'CREDIT':
      return 'Crédito';
    case '5':
    case 'CHECK':
      return 'Cheque';
    case '6':
    case 'OTHER':
      return 'Otro';
    case 'MIXED':
      return 'Mixto';
    default:
      if (upper.includes('CASH')) return clean.replace(/CASH/gi, 'Efectivo');
      if (upper.includes('OTHER')) return clean.replace(/OTHER/gi, 'Otro');
      if (upper.includes('CARD')) return clean.replace(/CARD/gi, 'Tarjeta');
      if (upper.includes('TRANSFER')) return clean.replace(/TRANSFER/gi, 'Transferencia');
      return clean;
  }
}
