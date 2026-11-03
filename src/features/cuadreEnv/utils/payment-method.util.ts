/**
 * Utilidad unificada de traducción y formateo de métodos de pago.
 * Mapea valores en inglés (CASH, OTHER, CARD, TRANSFER, CREDIT, etc.) a español.
 */
export function formatPaymentMethodLabel(method?: string | null): string {
  if (!method || !method.trim()) return 'Efectivo';
  const clean = method.trim();
  const upper = clean.toUpperCase();

  switch (upper) {
    case 'CASH':
      return 'Efectivo';
    case 'OTHER':
      return 'Otro';
    case 'CARD':
    case 'DEBIT':
    case 'CREDIT_CARD':
      return 'Tarjeta';
    case 'TRANSFER':
    case 'BANK_TRANSFER':
      return 'Transferencia';
    case 'CREDIT':
      return 'Crédito';
    case 'CHECK':
      return 'Cheque';
    case 'MIXED':
      return 'Mixto';
    default:
      // Si contiene palabras en inglés
      if (upper.includes('CASH')) return clean.replace(/CASH/gi, 'Efectivo');
      if (upper.includes('OTHER')) return clean.replace(/OTHER/gi, 'Otro');
      if (upper.includes('CARD')) return clean.replace(/CARD/gi, 'Tarjeta');
      if (upper.includes('TRANSFER')) return clean.replace(/TRANSFER/gi, 'Transferencia');
      return clean;
  }
}

