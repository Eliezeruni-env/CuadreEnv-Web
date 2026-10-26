export interface CashierLogDto {
  id?: number;
  cashierId: number;
  cashSessionId?: number;
  action: 'OPEN_SESSION' | 'CLOSE_SESSION' | 'CASH_ENTRY' | 'CASH_WITHDRAWAL' | 'SALE' | 'PAYMENT' | 'VOID';
  details: string;
  timestamp: string;
  ipAddress?: string;
  device?: string;
}

export interface CashierAuditDto {
  sessionId: number;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  initialAmount: number;
  closingAmount?: number;
  expectedAmount: number;
  difference: number;
  status: 'BALANCED' | 'SURPLUS' | 'SHORTAGE' | 'OPEN';
  notes?: string;
}
