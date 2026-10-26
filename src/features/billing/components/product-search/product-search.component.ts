import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../products/services/product.service';
import { BillingService } from '../../services/billing.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { ProductDto } from '../../../cuadreEnv/types/api';
import type { ProductDetails } from '../../../../app/models/billing';

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-search.component.html',
  styleUrls: ['./product-search.component.scss'],
})
export class ProductSearchComponent implements OnInit {
  private productService = inject(ProductService);
  private billingService = inject(BillingService);
  private notificationService = inject(NotificationService);

  @Input() warehouseId: number = 1;
  @Input() itbis: number = 18;

  @Input() set detailToEdit(detail: ProductDetails | null | undefined) {
    if (detail) {
      this.isEditing = true;
      this.editingIndex = (detail as any)._editIndex ?? null;
      this.selectedProductId = detail.productId;
      this.selectedProduct = this.products().find((p) => p.id === detail.productId) || null;
      this.currentDetail = { ...detail };
      this.recalculate();
    } else {
      this.resetForm();
    }
  }

  @Output() productAdded = new EventEmitter<ProductDetails>();
  @Output() productUpdated = new EventEmitter<{ index: number; detail: ProductDetails }>();

  products = signal<ProductDto[]>([]);
  selectedProductId: number = 0;
  selectedProduct: ProductDto | null = null;
  isEditing = false;
  editingIndex: number | null = null;

  currentDetail: ProductDetails = {
    productId: 0,
    barCode: '',
    productName: '',
    quantity: 1,
    price: 0,
    discountPercentage: 0,
    discountAmount: 0,
    itbisPercentage: 18,
    itbisAmount: 0,
    subTotal: 0,
    totalAmount: 0,
    warehouseId: 1,
  };

  async ngOnInit() {
    await this.loadProducts();
  }

  async loadProducts() {
    try {
      const res = await this.productService.getPagedProducts(1, 100);
      const items = res?.data?.items || (Array.isArray(res?.data) ? res.data : []);
      if (items.length > 0) {
        this.products.set(items);
      } else {
        const searchRes = await this.productService.searchProducts('');
        if (searchRes?.success && searchRes.data && searchRes.data.length > 0) {
          this.products.set(searchRes.data);
        } else {
          this.products.set([]);
        }
      }
    } catch {
      this.products.set([]);
    }
  }

  onProductSelected(id: number) {
    const p = this.products().find((it) => it.id === id);
    if (p) {
      this.selectedProduct = p;
      this.currentDetail.productId = p.id || 0;
      this.currentDetail.barCode = p.barcode || `PROD-${p.id}`;
      this.currentDetail.productName = p.description || `Producto #${p.id}`;
      this.currentDetail.price = p.cost || 0;
      this.currentDetail.warehouseId = this.warehouseId;
      this.currentDetail.itbisPercentage = this.itbis;
      if (!this.currentDetail.quantity || this.currentDetail.quantity <= 0) {
        this.currentDetail.quantity = 1;
      }
      this.recalculate();
    }
  }

  recalculate() {
    const line = this.billingService.calculateLineTotals(
      this.currentDetail.price,
      this.currentDetail.quantity,
      this.currentDetail.discountPercentage,
      this.currentDetail.itbisPercentage,
    );
    this.currentDetail.discountAmount = line.discountAmount;
    this.currentDetail.subTotal = line.subTotal;
    this.currentDetail.itbisAmount = line.itbisAmount;
    this.currentDetail.totalAmount = line.totalAmount;
  }

  submitProduct() {
    if (!this.selectedProductId || this.currentDetail.quantity <= 0) {
      this.notificationService.warning('Selecciona un producto y una cantidad válida.');
      return;
    }

    // Stock validation
    if (this.selectedProduct && this.selectedProduct.stock !== undefined) {
      if (this.currentDetail.quantity > this.selectedProduct.stock) {
        this.notificationService.warning(
          `Atención: La cantidad ingresada (${this.currentDetail.quantity}) supera el stock disponible (${this.selectedProduct.stock}).`,
        );
      }
    }

    this.recalculate();

    if (this.isEditing && this.editingIndex !== null) {
      this.productUpdated.emit({
        index: this.editingIndex,
        detail: { ...this.currentDetail },
      });
      this.notificationService.success('Producto actualizado en la factura.');
    } else {
      this.productAdded.emit({ ...this.currentDetail });
      this.notificationService.success('Producto agregado a la factura.');
    }

    this.resetForm();
  }

  cancelEdit() {
    this.resetForm();
  }

  resetForm() {
    this.isEditing = false;
    this.editingIndex = null;
    this.selectedProductId = 0;
    this.selectedProduct = null;
    this.currentDetail = {
      productId: 0,
      barCode: '',
      productName: '',
      quantity: 1,
      price: 0,
      discountPercentage: 0,
      discountAmount: 0,
      itbisPercentage: this.itbis,
      itbisAmount: 0,
      subTotal: 0,
      totalAmount: 0,
      warehouseId: this.warehouseId,
    };
  }
}
