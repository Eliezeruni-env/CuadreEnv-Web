export * from './account';
export * from './cashierRoles';
export * from './concept-type';
export * from './manage-request-type';
export * from './operation-status';
export * from './order-type';
export * from './posOperations';
export * from './prefix';

export enum RoleEnum {
  Admin = 'Admin',
  Manager = 'Manager',
  Employee = 'Employee',
  Viewer = 'Viewer',
}

export enum ProductTypeEnum {
  Standard = 1,
  Service = 2,
  Digital = 3,
  Combo = 4,
  RawMaterial = 5,
}

export const PRODUCT_TYPE_LABELS: Record<ProductTypeEnum, string> = {
  [ProductTypeEnum.Standard]: 'Producto Estándar (Físico)',
  [ProductTypeEnum.Service]: 'Servicio / Mano de Obra',
  [ProductTypeEnum.Digital]: 'Producto Digital / Licencia',
  [ProductTypeEnum.Combo]: 'Combo / Kit de Productos',
  [ProductTypeEnum.RawMaterial]: 'Materia Prima / Insumo',
};

export enum CategoryEnum {
  General = 1,
  Alimentos = 2,
  Bebidas = 3,
  Papeleria = 4,
  Servicios = 5,
}

export const CATEGORY_LABELS: Record<CategoryEnum, string> = {
  [CategoryEnum.General]: 'General',
  [CategoryEnum.Alimentos]: 'Alimentos',
  [CategoryEnum.Bebidas]: 'Bebidas',
  [CategoryEnum.Papeleria]: 'Papelería',
  [CategoryEnum.Servicios]: 'Servicios',
};

export enum PaymentMethodEnum {
  Cash = 'CASH',
  Transfer = 'TRANSFER',
  Card = 'CARD',
  Check = 'CHECK',
}

export enum ReceivableStatusEnum {
  Pending = 'Pendiente',
  Partial = 'Parcial',
  Paid = 'Pagado',
  Overdue = 'Vencida',
}

export enum MovementTypeEnum {
  Entry = 'Entrada',
  Exit = 'Salida',
  Transfer = 'Transferencia',
}
