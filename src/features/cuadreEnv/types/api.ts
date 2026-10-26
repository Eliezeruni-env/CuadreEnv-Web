// ApiResponse<T> estándar de la API CuadreEnv
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T | null;
  message?: string | null;
  errors?: string[];
}

/**
 * Auditoría estándar expuesta por el backend para todas las entidades
 */
export interface AuditableEntity {
  creationDate?: string | null;
  modificationDate?: string | null;
  createBy?: string | number | null;
  modifiedBy?: string | number | null;
  active?: boolean;
  isDeleted?: boolean;
}

/**
 * Distinción de estados operativos en formularios del sistema
 */
export type FormOperationMode = 'creation' | 'edition' | 'logical_deletion' | 'reactivation';


// PagedResult<T> canónico de CuadreEnv
export interface PagedResult<T> {
  items: T[];
  pageSize: number;
  pageCount: number;
  totalItemCount: number;
}

// PagedList<T> alias para compatibilidad
export interface PagedList<T> extends PagedResult<T> {
  pageNumber?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
}

// ProductType Enum & Options
export enum ProductTypeEnum {
  Standard = 1,     // Producto Estándar
  Service = 2,      // Servicio
  Digital = 3,      // Producto Digital
  Combo = 4,        // Combo / Paquete
  RawMaterial = 5   // Materia Prima / Insumo
}

export const PRODUCT_TYPE_OPTIONS = [
  { id: ProductTypeEnum.Standard, name: 'Producto Estándar (Físico)' },
  { id: ProductTypeEnum.Service, name: 'Servicio / Mano de Obra' },
  { id: ProductTypeEnum.Digital, name: 'Producto Digital / Licencia' },
  { id: ProductTypeEnum.Combo, name: 'Combo / Kit de Productos' },
  { id: ProductTypeEnum.RawMaterial, name: 'Materia Prima / Insumo' },
];

// Category Enum & Options
export enum CategoryEnum {
  General = 1,
  Alimentos = 2,
  Bebidas = 3,
  Papeleria = 4,
  Servicios = 5
}

export const CATEGORY_OPTIONS = [
  { id: CategoryEnum.General, name: 'General' },
  { id: CategoryEnum.Alimentos, name: 'Alimentos' },
  { id: CategoryEnum.Bebidas, name: 'Bebidas' },
  { id: CategoryEnum.Papeleria, name: 'Papelería' },
  { id: CategoryEnum.Servicios, name: 'Servicios' },
];

// Auth DTOs
export interface RegisterRequestDto {
  email: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  userName?: string | null;
  createCompanyName?: string | null;
}

export interface LoginRequestDto {
  email: string;
  password: string;
  deviceId?: string | null;
  rememberMe?: boolean;
}

export interface UserCompanyDto {
  id: number;
  name: string;
  commercialName?: string | null;
  rnc?: string | null;
  role?: string | null;
  plan?: string | null;
  isDefault?: boolean;
}

export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  companyId?: number;
  userCompanies?: UserCompanyDto[];
  user?: {
    id?: number;
    email?: string;
    companyId?: number;
    userCompanies?: UserCompanyDto[];
    allowedModules?: string[];
  };
}

export interface UserResponseDto {
  id: number;
  email: string;
  allowedModules?: string[];
}

export interface SessionDto {
  deviceId: string;
  createdAt: string; // ISO
  lastUsedAt?: string | null;
  isActive: boolean;
  expires: string; // ISO
}

// Company
export interface CreateCompanyRequest {
  name: string;
  address?: string | null;
  phone?: string | null;
}

export interface CompanyBankAccountDto {
  id: string;
  bankName: string;
  accountNumber: string;
  accountType?: string;
  currency?: string;
  holderName?: string;
  holderRnc?: string;
  isDefault?: boolean;
}

export interface CompanySettingsDto {
  id?: number;
  companyId?: number;
  companyName?: string | null;
  commercialName?: string | null;
  rnc?: string | null;
  address?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  invoiceFooterPhrase?: string | null;
  creditDaysLimit?: number;
  blockSalesIfOverdue?: boolean;
  currency?: string;
  timeZone?: string;
  invoiceNumberFormat?: string;
  defaultStockAlertThreshold?: number;
  defaultTaxPercentage?: number;
  ticketInstagram?: string | null;
  ticketWhatsapp?: string | null;
  ticketShowQr?: boolean;
  ticketPaperSize?: string;
  allowNegativeStock?: boolean;
  cashToleranceAmount?: number;
  bankAccounts?: CompanyBankAccountDto[];
}

export interface Company {
  id: number;
  name: string;
  rnc?: string | null;
  address?: string | null;
  phone?: string | null;
  settings?: CompanySettingsDto | null;
}

// User / Domain mapping
export interface UserPagedResponse {
  items: UserDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserDto {
  id?: number;
  firstName: string;
  lastName: string;
  identification?: string | null;
  gender?: string; // "M"|"F" or single char
  email: string;
  password?: string | null;
  passwordHash?: string | null; // backend expects PasswordHash for Admin create; prefer Register flow
  phoneNumber?: string | null;
  emergencyContact?: string | null;
  cvFileUrl?: string | null;
  cvFileName?: string | null;
  identificationFileUrl?: string | null;
  identificationFileName?: string | null;
  birthDate?: string | null; // date ISO
  userName?: string | null;
  companyId?: number;
  companyName?: string | null;
  role?: string; // "Admin" | "Manager" | "Employee"
  roles?: string[]; // Multiple roles assigned to employee
  roleIds?: number[];
  active?: boolean;
  isSuperUser?: boolean;
  allowedModules?: string[];
  temporaryPassword?: string | null;
  tempPasswordSent?: boolean;
}

export interface CreateUserPayload {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  userName?: string | null;
  role?: string;
  companyId?: number | null;
  temporaryPassword?: string | null;
  sendByEmail?: boolean;
  allowedModules?: string[];
}

export interface UpdateUserPayload {
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  userName?: string | null;
  role?: string;
  companyId?: number | null;
  allowedModules?: string[];
}

export interface ResetUserPasswordRequest {
  temporaryPassword?: string | null;
  sendByEmail?: boolean;
}

export interface SendInvoiceEmailItem {
  productName: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SendInvoiceEmailRequest {
  email: string;
  subject?: string | null;
  message?: string | null;
  attachPdf: boolean;
  invoiceHtml?: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  customerRnc?: string | null;
  cashierName?: string | null;
  cashRegisterName?: string | null;
  paymentMethod?: string | null;
  items?: SendInvoiceEmailItem[] | null;
  subtotal?: number | null;
  discount?: number | null;
  itbis?: number | null;
  total?: number | null;
  notes?: string | null;
}

// Invitation
export interface InvitationRequest {
  email: string;
  validDays?: number;
}

export interface AcceptInvitationRequest {
  token: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
  userName?: string | null;
  role?: string | null;
}

// Product
export interface ProductDto {
  id?: number;
  description?: string | null;
  barcode?: string | null;
  companyId?: number;
  cost: number;
  stock: number;
  price?: number;
  priceList?: number;
  taxRate?: number;
  shortDescription?: string | null;
  reference?: string | null;
  maximumQuantity?: number;
  minimumQuantity?: number;
  minimumStock?: number;
  minStock?: number;
  productTypeId?: number;
  categoryId?: number;
  categoryName?: string | null;
  CategoryName?: string | null;
  category?: { id?: number; name?: string; description?: string } | null;
  unitOfMeasurementId?: number;
  invoiceWithoutStock?: boolean;
  expirationDate?: string | null;
  isOrganic?: boolean;
  imageUrl?: string | null;
  photoUrl?: string | null;
  allowFractional?: boolean;
  profitMargin?: number;
}

// Warehouse / Inventory
export interface WarehouseDto {
  id: number;
  name: string;
  companyId: number;
}
export interface CreateWarehouseDto {
  name: string;
}
export interface InventoryDto {
  productId: number;
  warehouseId: number;
  quantity: number;
}
export interface MovementDto {
  id: number;
  productId: number;
  fromWarehouseId?: number | null;
  toWarehouseId?: number | null;
  quantity: number;
  type: string;
}
export interface MovementRequestDto {
  productId: number;
  warehouseId: number;
  quantity: number;
}
export interface TransferRequestDto {
  productId: number;
  fromWarehouseId: number;
  toWarehouseId: number;
  quantity: number;
}

// Sale DTOs (frontend)
export interface SaleDetailDto {
  productId: number;
  quantity: number;
  unitPrice: number;
}
export type SaleOriginChannel = 'POS_PRESENCIAL' | 'CREDITO' | 'ADMINISTRATIVO' | 'SERVICIO' | 'ONLINE';

export interface SaleRequestDto {
  customerId?: number | null;
  total: number;
  paidAmount: number;
  cashRegisterId?: number | null;
  dueDate?: string | null;
  details: SaleDetailDto[];
  originChannel?: SaleOriginChannel;
  paymentMethod?: string;
  notes?: string;
}

export interface SaleResponseDto {
  id: number;
  customerId?: number | null;
  customerName?: string;
  total: number;
  paidAmount: number;
  cashRegisterId?: number | null;
  cashRegisterName?: string;
  dueDate?: string | null;
  isCancelled: boolean;
  cancellationReason?: string;
  cancelledAt?: string;
  creationDate: string;
  createdAt?: string;
  originChannel?: SaleOriginChannel;
  paymentMethod?: string;
  invoiceNumber?: string;
  notes?: string;
  details: {
    productId: number;
    quantity: number;
    unitPrice: number;
    productName?: string;
    productCode?: string;
    productTypeId?: number;
    isService?: boolean;
    total?: number;
  }[];
}

// Customer
export interface CustomerDto {
  id?: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  identification?: string | null;
  rnc?: string | null;
  contactName?: string | null;
  creditLimit?: number;
  active?: boolean;
}

// Purchase
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

// Payment
export interface PaymentDto {
  id?: number;
  saleId?: number | null;
  purchaseId?: number | null;
  amount: number;
  method: string;
  reference?: string | null;
  creationDate?: string;
}

// CashRegister
export interface CashRegisterDto {
  id?: number;
  name: string;
  isOpen: boolean;
  balance: number;
  companyId?: number;
  cashierId?: number;
  createdDate?: string;
  updatedDate?: string;
}

// CashMovement
export interface CashMovementDto {
  id?: number;
  cashRegisterId: number;
  amount: number;
  type: string;
  description?: string | null;
  creationDate?: string;
}

// AccountReceivable & PaymentPlan DTOs
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

// ---------------------------------------------------------------------------
// Roles, Permissions & Deletion Approval Contracts (Multi-Tenant RBAC)
// ---------------------------------------------------------------------------

export interface PermissionDto {
  id: number;
  module: 'Sales' | 'Inventory' | 'Billing' | 'CashRegister' | 'Receivables' | 'Customers' | 'Audit' | 'Reports' | 'Company';
  action: 'View' | 'Create' | 'Edit' | 'Delete' | 'Approve' | 'Export';
  description?: string;
}

export interface RoleDto {
  id: number;
  companyId?: number;
  name: string;
  description?: string;
  isSystem?: boolean;
  isSystemRole?: boolean;
  userCount?: number;
  assignedUsersCount?: number;
  permissions?: PermissionDto[];
  permissionIds?: number[];
  allowedModules?: string[];
  createdAt?: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissionIds?: number[];
  allowedModules?: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissionIds?: number[];
  allowedModules?: string[];
}

export interface DeletionApprovalDto {
  id: number;
  companyId?: number;
  entityType: string;
  entityId: number;
  entityCode?: string;
  entityDescription?: string;
  requestedByUserId: number;
  requestedByUserName: string;
  requestedAt: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'Pending' | 'Approved' | 'Rejected';
  reviewedByUserId?: number;
  reviewedByUserName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  rejectionReason?: string;
}
