export interface Product {
  id: number;
  description: string;
  barcode: string;
  shortDescription?: string;
  reference?: string;
  cost: number;
  priceList: number;
  taxRate: number;                             // % ITBIS / IVA (default 18)
  minimumQuantity: number;                     // Alerta de stock mínimo
  maximumQuantity: number;                     // Límite de stock máximo
  packingId: number;                           // Empaque / Caja
  productTypeId: number;                       // Tipo (Físico, Servicio, etc.)
  categoryId: number;                          // Categoría
  unitOfMeasurementId: number;                 // Unidad de medida (Unidad, Kg, Litro)
  expires: boolean;                            // Control de vencimiento
  expirationDate?: string | Date;
  invoiceWithoutStock: boolean;                // Bandera para permitir o bloquear venta en negativo
  stock?: number;                              // Existencia global calculada
  createdAt?: string;
  updatedAt?: string;
}

export interface Stock {
  id: number;
  warehouseId: number;
  warehouseName: string;
  productId: number;
  productName: string;
  barcode?: string;
  quantity: number;
  minimumQuantity?: number;
  maximumQuantity?: number;
  cost?: number;
  price?: number;
  lastUpdated?: string;
}

export interface ProductType {
  id: number;
  name: string;
  description?: string;
}

export interface Packing {
  id: number;
  name: string;
  unitsPerPack: number;
}

export interface UnitOfMeasurement {
  id: number;
  name: string;
  symbol: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
}
