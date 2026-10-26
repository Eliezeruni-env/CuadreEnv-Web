export interface ProductDetails {
  productId: number;
  barCode?: string;
  productName: string;
  quantity: number;
  price: number;
  discountPercentage: number;
  discountAmount: number;
  itbisPercentage: number;
  itbisAmount: number;
  subTotal: number;
  totalAmount: number;
  warehouseId?: number;
  maxReturnQuantity?: number;
}
