export interface CashierDto {
  id: number;
  firstName: string;
  lastName: string;
  code: string;
  role: string;
  isActive: boolean;
}

export interface CashSessionDto {
  id: number;
  cashierId: number;
  openingAmount: number;
  closingAmount?: number;
  creationDate: string;
  closedAt?: string;
  isClosed: boolean;
}

export interface CashSessionSummaryDto {
  sessionId: number;
  openingAmount: number;
  totalCashSales: number;
  totalCardSales: number;
  totalTransferSales: number;
  totalChequeSales: number;
  totalEntries: number;
  totalWithdrawals: number;
}

export interface CashMovementDto {
  id?: number;
  cashSessionId: number;
  type: 'ENTRY' | 'WITHDRAWAL';
  amount: number;
  concept: string;
  observations?: string;
}

export interface CashierState {
  cashier: CashierDto | null;
  session: CashSessionDto | null;
  lastActive: string | null;
}
