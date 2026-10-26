export interface ProductMovementDetail {
  productId: number;
  barCode?: string;
  productName: string;
  quantity: number;
  cost?: number;
  price?: number;
  warehouseId: number;
  stockAvailable?: number;
}

export interface WarehouseMovementHeader {
  id?: number;
  prefix?: string;
  movementNumber?: string;
  warehouseId?: number;            // Receptor para entradas / Emisor para salidas
  warehouseName?: string;
  warehouseOfOriginId?: number;    // Origen para transferencias
  warehouseOfOriginName?: string;
  destinationWarehouseId?: number; // Destino para transferencias
  destinationWarehouseName?: string;
  conceptId: number;               // Motivo del movimiento
  conceptName?: string;
  commentary?: string;
  createDate?: string | Date;
  statusId: number;                // 1: Aplicado, 2: Pendiente, 3: Anulado
  statusName?: string;
  totalQuantity?: number;
  totalCost?: number;
  productDetails: ProductMovementDetail[];
}

export interface WarehouseEntry extends WarehouseMovementHeader {
  type?: 'ENTRY';
}

export interface WarehouseOutlet extends WarehouseMovementHeader {
  type?: 'OUTLET';
}

export interface WarehouseTransfer extends WarehouseMovementHeader {
  type?: 'TRANSFER';
}
