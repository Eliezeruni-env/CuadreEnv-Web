import { ManageRequestTypeEnum, OperationStatusEnum } from '../../enums';

export interface ManageRequestPayload {
  type: ManageRequestTypeEnum;
  reason: string;
  requestedBy: string;
  amount?: number;
  metadata?: Record<string, any>;
}

export class ManageRequestHelper {
  static formatRequestType(type: ManageRequestTypeEnum): string {
    switch (type) {
      case ManageRequestTypeEnum.PriceOverride:
        return 'Cambio de Precio Especial';
      case ManageRequestTypeEnum.DiscountApproval:
        return 'Aprobación de Descuento';
      case ManageRequestTypeEnum.SaleCancellation:
        return 'Anulación de Venta';
      case ManageRequestTypeEnum.CashWithdrawalApproval:
        return 'Retiro de Efectivo / Salida';
      case ManageRequestTypeEnum.CreditLimitOverride:
        return 'Aumento Límite de Crédito';
      case ManageRequestTypeEnum.InventoryAdjustment:
        return 'Ajuste de Inventario';
      default:
        return 'Solicitud de Permiso';
    }
  }

  static getStatusBadgeVariant(status: OperationStatusEnum): string {
    switch (status) {
      case OperationStatusEnum.Approved:
      case OperationStatusEnum.Completed:
        return 'success';
      case OperationStatusEnum.Pending:
      case OperationStatusEnum.Active:
        return 'warning';
      case OperationStatusEnum.Rejected:
      case OperationStatusEnum.Cancelled:
        return 'danger';
      default:
        return 'secondary';
    }
  }
}
