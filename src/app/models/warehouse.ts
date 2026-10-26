export interface Warehouse {
  id: number;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  managerName?: string;
  isMain?: boolean;
  isActive: boolean;
  createdAt?: string;
}

export interface WarehouseConcept {
  id: number;
  name: string;
  type: 'ENTRY' | 'OUTLET' | 'TRANSFER';
  description?: string;
  requiresAuthorization?: boolean;
}
