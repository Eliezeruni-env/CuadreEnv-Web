export interface ServiceItemDto {
  id?: number;
  code: string; // e.g. SERV-1024
  name: string;
  description?: string | null;
  price: number; // Precio de venta / Honorarios
  cost?: number; // Costo base / Insumos
  categoryId?: number;
  categoryName?: string;
  productTypeId?: number;
  isActive: boolean;
  taxRate?: number; // 0 o 0.18
  estimatedDuration?: string | null; // ej. "1 hora", "45 mins"
  createdAt?: string | null;
  updatedAt?: string | null;
}
