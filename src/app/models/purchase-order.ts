export interface PurchaseOrderDetail {
  productId: number;
  barCode?: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  subTotal?: number;
  itbis?: number;
  total?: number;
}

export interface PurchaseOrder {
  id: number;
  orderNumber: string;
  prefix?: string;
  supplierId: number;
  supplierName: string;
  supplierRnc?: string;
  warehouseId: number;
  warehouseName?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  statusId: number; // 1: Creada, 2: Recepción Parcial, 3: Completada, 4: Cancelada
  statusName?: string;
  notes?: string;
  subTotal: number;
  itbis: number;
  total: number;
  productDetails: PurchaseOrderDetail[];
}

export interface PurchaseOrderReceiptDetail {
  productId: number;
  barCode?: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  subTotal?: number;
  warehouseId: number;
}

export interface PurchaseOrderReceipt {
  id: number;
  receiptNumber: string;
  prefix?: string;
  purchaseOrderId: number;
  purchaseOrderNumber?: string;
  warehouseId: number;
  warehouseName?: string;
  supplierId: number;
  supplierName: string;
  receiptDate: string;
  statusId: number; // 1: Aplicado, 2: En Revisión, 3: Rechazado
  statusName?: string;
  comments?: string;
  hasDiscrepancies?: boolean;
  productDetails: PurchaseOrderReceiptDetail[];
}
