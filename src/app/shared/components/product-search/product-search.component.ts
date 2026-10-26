import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../../features/products/services/product.service';
import { StockService } from '../../../../features/inventory/services/stock.service';
import { NotificationService } from '../../../../features/cuadreEnv/services/notification.service';
import { ProductPackagingService, ProductPackaging } from '../../../../features/products/services/product-packaging.service';
import { UnitOfMeasurementService } from '../../../../features/products/services/unit-of-measurement.service';
import type { ProductMovementDetail } from '../../../models/movement';
import type { Product } from '../../../models/product';

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-search.component.html',
  styleUrls: ['./product-search.component.scss'],
})
export class ProductSearchComponent implements OnInit, OnChanges {
  private productService = inject(ProductService);
  private stockService = inject(StockService);
  private notificationService = inject(NotificationService);
  private packagingService = inject(ProductPackagingService);
  private unitService = inject(UnitOfMeasurementService);

  @Input() warehouseId = 1;
  @Input() mode: 'entry' | 'outlet' | 'transfer' = 'entry';
  @Input() detailToEdit?: ProductMovementDetail | null = null;

  @Output() productAdded = new EventEmitter<ProductMovementDetail>();
  @Output() productUpdated = new EventEmitter<ProductMovementDetail>();

  allProducts: Product[] = [];
  filteredProducts: (Product & { stockInWarehouse: number })[] = [];

  searchTerm = '';
  selectedProduct: (Product & { stockInWarehouse: number }) | null = null;
  quantity = 1;
  cost = 0;
  isSearching = false;

  // Packaging and base unit variables
  currentPackaging: ProductPackaging | undefined;
  unitSymbol = 'lb';
  entryMode: 'base' | 'package' = 'base';
  packageCount = 1;
  packageCost = 0;

  async ngOnInit() {
    await this.loadProducts();
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['warehouseId'] && this.allProducts.length > 0) {
      await this.refreshFilteredProducts();
    }
    if (changes['detailToEdit'] && this.detailToEdit) {
      this.populateEdit(this.detailToEdit);
    }
  }

  async loadProducts() {
    this.isSearching = true;
    try {
      const res = await this.productService.getPagedProducts(1, 100);
      if (res?.success && res.data?.items) {
        this.allProducts = (res.data.items as any[])
          .filter(
            (p: any) =>
              p.productTypeId !== 2 &&
              !p.isService &&
              p.productType?.name !== 'Servicio' &&
              p.productType?.description !== 'Servicio'
          )
          .map((p: any) => ({
            id: p.id || 0,
            description: p.description || '',
            barcode: p.barcode || '',
            reference: p.reference || '',
            shortDescription: p.shortDescription || '',
            cost: p.cost || 0,
            priceList: p.priceList || p.price || (p.cost ? p.cost * 1.3 : 0),
            taxRate: p.taxRate || 18,
            minimumQuantity: p.minimumQuantity || 5,
            maximumQuantity: p.maximumQuantity || 100,
            packingId: p.packingId || 1,
            productTypeId: p.productTypeId || 1,
            categoryId: p.categoryId || 1,
            unitOfMeasurementId: p.unitOfMeasurementId || 1,
            expires: p.expires || false,
            invoiceWithoutStock: p.invoiceWithoutStock || false,
            stock: p.stock || 0,
          }));
        await this.refreshFilteredProducts();
      }
    } catch {
      // ignore
    } finally {
      this.isSearching = false;
    }
  }

  async refreshFilteredProducts() {
    const q = this.searchTerm.toLowerCase().trim();
    const baseList = q
      ? this.allProducts.filter(
          (p) =>
            p.description.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q)),
        )
      : this.allProducts.slice(0, 15);

    const withStock = await Promise.all(
      baseList.map(async (p) => {
        const stock = await this.stockService.getProductStockInWarehouse(
          this.warehouseId,
          p.id,
        );
        return { ...p, stockInWarehouse: stock };
      }),
    );

    this.filteredProducts = withStock;
  }

  async onSearchInput() {
    await this.refreshFilteredProducts();
  }

  selectProduct(p: Product & { stockInWarehouse: number }) {
    this.selectedProduct = p;
    this.cost = p.cost || 0;
    this.currentPackaging = this.packagingService.getPackaging(p.id);
    const unit = p.unitOfMeasurementId ? this.unitService.getUnitById(p.unitOfMeasurementId) : undefined;
    this.unitSymbol = unit?.symbol || 'lb';

    if (this.currentPackaging && this.currentPackaging.hasPackaging && this.currentPackaging.packageUnitsCount > 0) {
      this.entryMode = 'package';
      this.packageCount = 1;
      const factor = this.currentPackaging.packageUnitsCount;
      this.packageCost = this.currentPackaging.packageCost || (this.cost * factor);
      this.quantity = factor;
    } else {
      this.entryMode = 'base';
      this.quantity = 1;
    }
  }

  setEntryMode(mode: 'base' | 'package') {
    this.entryMode = mode;
    if (mode === 'package' && this.currentPackaging && this.currentPackaging.hasPackaging) {
      this.onPackageValuesChange();
    } else {
      this.quantity = 1;
      this.cost = this.selectedProduct?.cost || 0;
    }
  }

  onPackageValuesChange() {
    if (this.entryMode === 'package' && this.currentPackaging && this.currentPackaging.hasPackaging) {
      const factor = this.currentPackaging.packageUnitsCount || 1;
      this.quantity = Math.round(Number(this.packageCount || 0) * factor * 100) / 100;
      if (this.packageCost > 0 && factor > 0) {
        this.cost = Math.round((Number(this.packageCost) / factor) * 10000) / 10000;
      }
    }
  }

  populateEdit(detail: ProductMovementDetail) {
    const found = this.allProducts.find((p) => p.id === detail.productId);
    if (found) {
      this.selectedProduct = { ...found, stockInWarehouse: detail.stockAvailable || 0 };
    } else {
      this.selectedProduct = {
        id: detail.productId,
        description: detail.productName,
        barcode: detail.barCode || '',
        cost: detail.cost || 0,
        priceList: detail.price || 0,
        taxRate: 18,
        minimumQuantity: 5,
        maximumQuantity: 100,
        packingId: 1,
        productTypeId: 1,
        categoryId: 1,
        unitOfMeasurementId: 1,
        expires: false,
        invoiceWithoutStock: false,
        stockInWarehouse: detail.stockAvailable || 0,
      };
    }
    this.quantity = detail.quantity;
    this.cost = detail.cost || detail.price || 0;
    this.currentPackaging = this.packagingService.getPackaging(detail.productId);
  }

  submitProduct() {
    if (!this.selectedProduct) {
      this.notificationService.warning('Seleccione un producto para agregar.');
      return;
    }

    if (this.quantity <= 0) {
      this.notificationService.warning('La cantidad debe ser mayor a cero.');
      return;
    }

    // Validation for Outlets & Transfers
    if (this.mode === 'outlet' || this.mode === 'transfer') {
      const allowWithoutStock = this.selectedProduct.invoiceWithoutStock;
      const available = this.selectedProduct.stockInWarehouse;
      if (!allowWithoutStock && this.quantity > available) {
        this.notificationService.error(
          `Stock insuficiente en el almacén de origen (Disponible: ${available} ${this.unitSymbol}, Solicitado: ${this.quantity} ${this.unitSymbol}).`,
        );
        return;
      }
    }

    let displayName = this.selectedProduct.description;
    if (this.entryMode === 'package' && this.currentPackaging && this.currentPackaging.hasPackaging) {
      const pName = this.currentPackaging.packageUnitName || 'Empaque';
      displayName = `${this.selectedProduct.description} [${this.packageCount} ${pName}(s) de ${this.currentPackaging.packageUnitsCount} ${this.unitSymbol}]`;
    }

    const detail: ProductMovementDetail = {
      productId: this.selectedProduct.id,
      barCode: this.selectedProduct.barcode,
      productName: displayName,
      quantity: Number(this.quantity),
      cost: Number(this.cost) || Number(this.selectedProduct.cost) || 0,
      price: Number(this.selectedProduct.priceList) || 0,
      warehouseId: this.warehouseId,
      stockAvailable: this.selectedProduct.stockInWarehouse,
    };

    if (this.detailToEdit) {
      this.productUpdated.emit(detail);
      this.notificationService.success(`Línea "${detail.productName}" actualizada.`);
    } else {
      this.productAdded.emit(detail);
      this.notificationService.success(`Producto "${detail.productName}" agregado (+${detail.quantity} ${this.unitSymbol}).`);
    }

    this.resetSelection();
  }

  resetSelection() {
    this.selectedProduct = null;
    this.currentPackaging = undefined;
    this.entryMode = 'base';
    this.packageCount = 1;
    this.packageCost = 0;
    this.quantity = 1;
    this.cost = 0;
    this.searchTerm = '';
    this.refreshFilteredProducts();
  }
}
