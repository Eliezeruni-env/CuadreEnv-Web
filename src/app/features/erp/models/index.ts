// Generic API Response
export interface ApiResponse<T> {
  success: boolean;
  data?: T | null;
  message?: string | null;
  errors?: string[] | null;
}

// PagedList
export interface PagedList<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalItemCount: number;
  pageCount?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
}

// Product & Catalog Enums / Types
export interface ProductTypeDto {
  id: number;
  name: string;
  description?: string | null;
  status: boolean;
}

export interface CategoryDto {
  id: number;
  name: string;
  description?: string | null;
  status: boolean;
}

export interface ProductDto {
  id: number;
  description: string;
  barcode?: string | null;
  reference?: string | null;
  cost: number;
  price: number;
  stock: number;
  minimumQuantity: number;
  maximumQuantity: number;
  status: boolean;
  productTypeId: number;
  productTypeName?: string | null;
  categoryId: number;
  categoryName?: string | null;
  warehouseId?: number | null;
  warehouseName?: string | null;
  creationDate?: string;
}

export interface ProductCreateDto {
  description: string;
  barcode?: string | null;
  reference?: string | null;
  cost: number;
  price: number;
  stock: number;
  minimumQuantity?: number;
  maximumQuantity?: number;
  status?: boolean;
  productTypeId: number;
  categoryId: number;
  warehouseId?: number;
}

// Warehouse & Inventory
export interface WarehouseDto {
  id: number;
  name: string;
  status: boolean;
  companyId?: number;
}

export interface InventoryMovementDto {
  id: number;
  productId: number;
  productName?: string;
  warehouseId: number;
  warehouseName?: string;
  quantity: number;
  type: string;
  reason?: string;
  date: string;
}

export interface TransferRequestDto {
  productId: number;
  fromWarehouseId: number;
  toWarehouseId: number;
  quantity: number;
}

// Customer
export interface CustomerDto {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  identification?: string | null;
  active?: boolean;
}

// Sales
export interface SaleDetailDto {
  productId: number;
  quantity: number;
  unitPrice: number;
}

export interface SaleRequestDto {
  customerId?: number | null;
  total: number;
  paidAmount: number;
  cashRegisterId?: number | null;
  dueDate?: string | null;
  details: SaleDetailDto[];
}

export interface SaleResponseDto {
  id: number;
  customerId?: number | null;
  total: number;
  paidAmount: number;
  cashRegisterId?: number | null;
  dueDate?: string | null;
  isCancelled: boolean;
  creationDate: string;
  details: {
    productId: number;
    quantity: number;
    unitPrice: number;
  }[];
}

// AccountReceivable & PaymentPlans
export interface PaymentPlanRequestDto {
  installmentAmount: number;
  totalInstallments: number;
  frequency?: string;
  startsAt?: string;
}

export interface CreateAccountReceivableRequestDto {
  companyId?: number;
  customerId?: number | null;
  saleId?: number | null;
  totalAmount: number;
  paidAmount?: number;
  dueDate?: string | null;
  plan?: PaymentPlanRequestDto | null;
}

export interface InstallmentDto {
  id: number;
  paymentPlanId: number;
  installmentNumber: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  isPaid: boolean;
}

export interface RegisterARPaymentRequestDto {
  amount: number;
  method?: string;
  reference?: string | null;
  cashRegisterId?: number | null;
}

export interface PayInstallmentRequestDto {
  amount: number;
  method?: string;
  cashRegisterId?: number | null;
}

export interface PaymentPlanDto {
  installmentAmount: number;
  totalInstallments: number;
  startDate: string;
  frequency: string;
}

export interface PaymentRecordDto {
  id: number;
  amount: number;
  date: string;
  method: string;
  reference?: string | null;
  notes?: string | null;
  isCurrent?: boolean;
}

export interface ReceivableDto {
  id: number;
  invoiceNumber: string;
  customerId?: number | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerIdentification?: string | null;
  description: string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: 'Pagado' | 'Parcial' | 'Pendiente' | 'Vencida';
  creationDate: string;
  dueDate?: string | null;
  avatarColor?: string;
  paymentPlan?: PaymentPlanDto;
  payments: PaymentRecordDto[];
}

export interface CreateReceivableDto {
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  description: string;
  totalAmount: number;
  initialPayment: number;
  totalInstallments: number;
  installmentAmount: number;
  startDate: string;
  frequency: string;
}

// CashRegister & POS
export interface CashRegisterDto {
  id: number;
  name: string;
  isOpen: boolean;
  balance: number;
  companyId?: number;
}

export interface CashMovementDto {
  id?: number;
  cashRegisterId: number;
  amount: number;
  type: string;
  category?: string;
  description?: string | null;
  reference?: string | null;
  paymentMethod?: string;
  creationDate?: string;
}

// Purchases & Supplier Payments
export interface PurchaseDetailDto {
  productId: number;
  quantity: number;
  costPrice: number;
}

export interface PurchaseDto {
  id?: number;
  supplierId?: number | null;
  total: number;
  details: PurchaseDetailDto[];
  creationDate?: string;
}

export interface PaymentDto {
  id?: number;
  saleId?: number | null;
  purchaseId?: number | null;
  amount: number;
  method: string;
  reference?: string | null;
  creationDate?: string;
}

// Auth & Users
export interface LoginRequestDto {
  email: string;
  password: string;
  deviceId?: string | null;
}

export interface RegisterRequestDto {
  email: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  userName?: string | null;
  createCompanyName?: string | null;
}

export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponseDto {
  id: number;
  email: string;
  name?: string;
  role?: string;
  active?: boolean;
}

export interface CreateCompanyRequest {
  name: string;
  address?: string | null;
  phone?: string | null;
}
