export enum ManageRequestType {
  PurchaseReceipt = 1,
  InventoryAdjustment = 2,
  StockTransfer = 3,
  Cancellation = 4,
  WarehouseOutlet = 5,
  WarehouseTransfer = 6,
}

export interface TimelineItem {
  timestamp: string;
  action: string;
  userName: string;
  oldStatus?: string;
  newStatus?: string;
  comment?: string;
}

export interface ManageRequest {
  id: number;
  requestNumber: string;
  requestType: ManageRequestType;
  typeName: string;
  statusId: number; // 1: Pendiente, 2: Aprobado, 3: Rechazado
  statusName: string;
  creatorName: string;
  createdAt: string;
  updatedAt?: string;
  comment: string;
  reviewerName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  payloadJson: string; // JSON serializado de la operación
  payloadParsed?: any;
  timeline: TimelineItem[];
}
