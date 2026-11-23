import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { WarehouseService } from '../../../../features/inventory/services/warehouse.service';
import { ProductService } from '../../../../features/products/services/product.service';
import { StockService } from '../../../../features/inventory/services/stock.service';
import { WarehouseEntryService } from '../../../../features/inventory/services/warehouse-entry.service';
import { WarehouseOutletService } from '../../../../features/inventory/services/warehouse-outlet.service';
import { WarehouseTransferService } from '../../../../features/inventory/services/warehouse-transfer.service';
import { NotificationService } from '../../../../features/cuadreEnv/services/notification.service';
import { BarcodeLookupService } from '../../../../features/products/services/barcode-lookup.service';
import { CameraBarcodeModalComponent } from '../camera-barcode-modal/camera-barcode-modal.component';
import {
  WarehouseMovementReceiptModalComponent,
  type MovementReceiptData,
} from '../warehouse-movement-receipt-modal/warehouse-movement-receipt-modal.component';
import type { Warehouse, WarehouseConcept } from '../../../models/warehouse';
import type { ProductMovementDetail, WarehouseMovementHeader } from '../../../models/movement';
import type { Product } from '../../../models/product';

export interface MovementLineItem extends ProductMovementDetail {
  description?: string;
}

export interface CatalogModalItem {
  product: Product;
  stock: number;
  cost: number;
  quantity: number;
  selected: boolean;
}

@Component({
  selector: 'app-warehouse-movement-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CameraBarcodeModalComponent,
    WarehouseMovementReceiptModalComponent,
  ],
  templateUrl: './warehouse-movement-form.component.html',
  styleUrls: ['./warehouse-movement-form.component.scss'],
})
export class WarehouseMovementFormComponent implements OnInit {
  @Input() mode: 'entry' | 'outlet' | 'transfer' = 'entry';

  private warehouseService = inject(WarehouseService);
  private productService = inject(ProductService);
  private stockService = inject(StockService);
  private entryService = inject(WarehouseEntryService);
  private outletService = inject(WarehouseOutletService);
  private transferService = inject(WarehouseTransferService);
  private notificationService = inject(NotificationService);
  private barcodeLookupService = inject(BarcodeLookupService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('barcodeImageInput') barcodeImageInput?: ElementRef<HTMLInputElement>;

  // Receipt Modal State
  isReceiptModalOpen = signal<boolean>(false);
  receiptData: MovementReceiptData | null = null;

  // Catalog Multi-Select Modal State
  isCatalogModalOpen = signal<boolean>(false);
  catalogSearchTerm = '';
  catalogFilter: 'all' | 'with-stock' | 'zero-stock' = 'all';
  catalogItems: CatalogModalItem[] = [];

  // Active Warehouse Stock Cache
  activeWarehouseStockMap = new Map<number, number>();

  // Catalogs
  warehouses: Warehouse[] = [];
  concepts: WarehouseConcept[] = [];
  allProducts: Product[] = [];
  filteredProducts: (Product & { stockInWarehouse?: number })[] = [];

  // Movement Form Fields
  warehouseId = 1;
  warehouseOfOriginId = 1;
  destinationWarehouseId = 2;
  conceptId = 1;
  commentary = '';

  // Product Entry Row Controls
  searchTerm = '';
  selectedProduct: (Product & { stockInWarehouse?: number }) | null = null;
  addQuantity = 1;
  addCost = 0;
  isSearchDropdownOpen = false;

  // Table Lines
  productDetails: MovementLineItem[] = [];

  // Async States
  isLoadingCatalogs = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  private _isSubmitting = false;
  isCameraScannerOpen = signal<boolean>(false);
  isDecodingBarcodeImage = signal<boolean>(false);

  // Computeds / Totals
  get totalItems(): number {
    return this.productDetails.length;
  }

  get totalUnits(): number {
    return this.productDetails.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }

  get totalCost(): number {
    return this.productDetails.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.cost) || 0),
      0
    );
  }

  get selectedConceptDescription(): string {
    const concept = this.concepts.find((c) => c.id === this.conceptId);
    return concept?.description || '';
  }

  async ngOnInit() {
    // 1. Cargar almacenes locales de inmediato (síncrono) para render instantáneo sin esperas
    const localWhs = this.warehouseService.getLocalWarehouses();
    const availableWhs = (localWhs && localWhs.length > 0)
      ? localWhs.filter((w) => w.isActive !== false)
      : [this.warehouseService.createDefaultMainWarehouse()];

    this.warehouses = availableWhs.map((w) => ({ ...w, id: Number(w.id) }));
    const qWh = Number(this.route.snapshot.queryParamMap.get('warehouseId') || this.route.snapshot.queryParamMap.get('originWarehouseId'));
    if (qWh && this.warehouses.some((w) => Number(w.id) === qWh)) {
      this.warehouseId = qWh;
      this.warehouseOfOriginId = qWh;
    } else {
      const mainWh = this.warehouses.find((w) => w.isMain) || this.warehouses[0];
      this.warehouseId = Number(mainWh.id);
      this.warehouseOfOriginId = Number(mainWh.id);
    }
    this.destinationWarehouseId =
      this.warehouses.length > 1 ? Number(this.warehouses[1].id) : Number(this.warehouses[0].id);
    this.loadConcepts();
    this.isLoadingCatalogs.set(false);

    // 2. Cargar catálogos y productos en paralelo
    await Promise.all([this.loadCatalogs(), this.loadProducts()]);
    await this.updateActiveWarehouseStock();
  }

  async loadCatalogs() {
    try {
      const res = await this.warehouseService.getWarehouses();
      if (res?.success && res.data && res.data.length > 0) {
        this.warehouses = res.data.filter((w) => w.isActive !== false).map((w) => ({ ...w, id: Number(w.id) }));

        const qWh = Number(this.route.snapshot.queryParamMap.get('warehouseId') || this.route.snapshot.queryParamMap.get('originWarehouseId'));
        if (qWh && this.warehouses.some((w) => Number(w.id) === qWh)) {
          this.warehouseId = qWh;
          this.warehouseOfOriginId = qWh;
        } else if (!this.warehouses.some((w) => Number(w.id) === Number(this.warehouseId))) {
          const mainWh = this.warehouses.find((w) => w.isMain) || this.warehouses[0];
          this.warehouseId = Number(mainWh.id);
          this.warehouseOfOriginId = Number(mainWh.id);
        }

        if (this.warehouses.length > 1) {
          const altWh = this.warehouses.find((w) => Number(w.id) !== Number(this.warehouseOfOriginId));
          if (altWh) this.destinationWarehouseId = Number(altWh.id);
        }
      }

      this.loadConcepts();
    } catch {
      // Graceful fallback
    } finally {
      this.isLoadingCatalogs.set(false);
    }
  }

  loadConcepts() {
    const type = this.mode === 'entry' ? 'ENTRY' : this.mode === 'outlet' ? 'OUTLET' : 'TRANSFER';
    this.concepts = this.warehouseService.getConcepts(type);
    if (this.concepts.length > 0) {
      this.conceptId = this.concepts[0].id;
    }
  }

  async loadProducts() {
    try {
      const res = await this.productService.getPagedProducts(1, 200);
      if (res?.success && res.data?.items) {
        this.allProducts = (res.data.items as any[])
          .filter((p: any) => {
            if (!p) return false;
            if (p.isService === true || p.type === 'service' || p.type === 'Servicio') return false;
            if (p.productTypeId === 2 || p.ProductTypeId === 2) return false;
            const code = String(p.barcode || p.reference || '').toUpperCase().trim();
            if (code.startsWith('SERV-') || code.startsWith('SERV')) return false;
            return true;
          })
          .map((p: any) => {
            const metrics = this.productService.getProductMetrics(p.id || 0);
            const cost = Math.abs(Number(
              p.cost ?? p.Cost ?? p.purchasePrice ?? p.PurchasePrice ?? p.unitCost ?? p.UnitCost ?? p.standardCost ?? p.StandardCost ?? metrics?.cost ?? 0
            )) || 0;
            const price = Math.abs(Number(
              p.priceList ?? p.price ?? (cost > 0 ? cost * 1.35 : 0)
            )) || 0;

            return {
              id: Number(p.id) || 0,
              description: p.description || p.name || `Producto #${p.id}`,
              barcode: p.barcode || p.reference || '',
              reference: p.reference || '',
              shortDescription: p.shortDescription || p.categoryName || '',
              cost: cost,
              priceList: price,
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
            };
          });
      }
    } catch {
      // Ignore
    }
  }

  async updateActiveWarehouseStock() {
    const currentWhId = this.mode === 'transfer' ? Number(this.warehouseOfOriginId) : Number(this.warehouseId);
    if (!currentWhId) return;

    try {
      const stockRes = await this.stockService.getStock({ warehouseId: currentWhId });
      if (stockRes?.success && stockRes.data) {
        this.activeWarehouseStockMap.clear();
        stockRes.data.forEach((s) => {
          this.activeWarehouseStockMap.set(Number(s.productId), Number(s.quantity) || 0);
        });

        // Actualizar stock en memoria para los productos
        this.allProducts.forEach((p) => {
          if (this.activeWarehouseStockMap.has(p.id)) {
            p.stock = this.activeWarehouseStockMap.get(p.id) || 0;
          }
        });

        if (this.selectedProduct) {
          this.selectedProduct.stock = this.activeWarehouseStockMap.get(this.selectedProduct.id) || 0;
          this.selectedProduct.stockInWarehouse = this.selectedProduct.stock;
        }
      }
    } catch {
      // ignore
    }
  }

  async onWarehouseChange() {
    this.warehouseId = Number(this.warehouseId);
    this.warehouseOfOriginId = Number(this.warehouseOfOriginId);
    this.destinationWarehouseId = Number(this.destinationWarehouseId);

    if (this.mode === 'transfer' && this.warehouseOfOriginId === this.destinationWarehouseId) {
      const alt = this.warehouses.find((w) => Number(w.id) !== this.warehouseOfOriginId);
      if (alt) this.destinationWarehouseId = Number(alt.id);
    }
    await this.updateActiveWarehouseStock();

    if (this.isCatalogModalOpen()) {
      this.openProductCatalogModal();
    }
  }

  getSelectedWarehouseName(): string {
    if (this.mode === 'transfer') {
      const origin = this.warehouses.find((w) => Number(w.id) === Number(this.warehouseOfOriginId));
      const dest = this.warehouses.find((w) => Number(w.id) === Number(this.destinationWarehouseId));
      return `${origin?.name || 'Origen'} ➔ ${dest?.name || 'Destino'}`;
    }
    const wh = this.warehouses.find((w) => Number(w.id) === Number(this.warehouseId));
    return wh ? `${wh.name} (${wh.code || 'WH-' + wh.id})` : 'Almacén Principal';
  }

  // --- Product Search & Autocomplete ---
  onSearchInput() {
    const q = (this.searchTerm || '').toLowerCase().trim();
    if (!q) {
      this.filteredProducts = [];
      this.isSearchDropdownOpen = false;
      return;
    }

    this.filteredProducts = this.allProducts
      .filter((p) =>
        p.description.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.shortDescription && p.shortDescription.toLowerCase().includes(q))
      )
      .map((p) => ({
        ...p,
        stockInWarehouse: this.activeWarehouseStockMap.get(p.id) ?? p.stock ?? 0,
      }))
      .slice(0, 8);

    this.isSearchDropdownOpen = this.filteredProducts.length > 0;
  }

  selectProductFromDropdown(p: Product) {
    const resolvedStock = this.activeWarehouseStockMap.get(p.id) ?? p.stock ?? 0;
    this.selectedProduct = { ...p, stockInWarehouse: resolvedStock, stock: resolvedStock };
    this.searchTerm = `${p.description} (${p.barcode || 'S/C'})`;
    const metrics = this.productService.getProductMetrics(p.id);
    const resolvedCost = Number(p.cost) > 0
      ? Number(p.cost)
      : (metrics?.cost && Number(metrics.cost) > 0
          ? Number(metrics.cost)
          : (Number(p.priceList) > 0
              ? Math.round((Number(p.priceList) / 1.35) * 100) / 100
              : (Number((p as any).price) > 0 ? Math.round((Number((p as any).price) / 1.35) * 100) / 100 : 0)));
    this.addCost = resolvedCost;
    this.addQuantity = 1;
    this.isSearchDropdownOpen = false;
  }

  closeSearchDropdownWithDelay() {
    setTimeout(() => {
      this.isSearchDropdownOpen = false;
    }, 250);
  }

  // --- Barcode / Enter Handler ---
  async handleSearchEnter(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const raw = (this.searchTerm || '').trim();
    if (!raw) return;

    // Check exact barcode match first
    const match = this.allProducts.find(
      (p) =>
        p.barcode &&
        p.barcode.trim().toLowerCase() === raw.toLowerCase()
    );

    if (match) {
      this.selectProductFromDropdown(match);
      this.notificationService.info(`Producto seleccionado: ${match.description}`);
      return;
    }

    // If first item in filtered list
    if (this.filteredProducts.length > 0) {
      this.selectProductFromDropdown(this.filteredProducts[0]);
      return;
    }

    // Try global/barcode lookup service
    try {
      const globalProd = await this.barcodeLookupService.lookupUniversalProduct(raw);
      if (globalProd) {
        const newProd: Product = {
          id: Date.now(),
          description: globalProd.description || globalProd.name,
          barcode: globalProd.barcode,
          shortDescription: globalProd.brand || 'Catálogo global',
          cost: 0,
          priceList: 0,
          taxRate: 18,
          minimumQuantity: 5,
          maximumQuantity: 100,
          packingId: 1,
          productTypeId: 1,
          categoryId: 1,
          unitOfMeasurementId: 1,
          expires: false,
          invoiceWithoutStock: false,
          stock: 0,
        };
        this.allProducts.unshift(newProd);
        this.selectProductFromDropdown(newProd);
        this.notificationService.success(`Producto encontrado globalmente: ${newProd.description}`);
      } else {
        this.notificationService.warning(`No se encontró producto con código: ${raw}`);
      }
    } catch {
      this.notificationService.warning(`No se encontró producto para: ${raw}`);
    }
  }

  // --- Add Product to List ---
  addProductLine() {
    if (!this.selectedProduct) {
      if (this.searchTerm.trim() && this.filteredProducts.length > 0) {
        this.selectProductFromDropdown(this.filteredProducts[0]);
      } else {
        this.notificationService.warning('Selecciona o busca un producto válido antes de agregar.');
        return;
      }
    }

    if (!this.selectedProduct) return;

    const qty = Number(this.addQuantity) || 1;
    const metrics = this.selectedProduct ? this.productService.getProductMetrics(this.selectedProduct.id) : null;
    const fallbackCost = Number(this.selectedProduct?.cost) > 0
      ? Number(this.selectedProduct!.cost)
      : (metrics?.cost && Number(metrics.cost) > 0
          ? Number(metrics.cost)
          : (Number(this.selectedProduct?.priceList) > 0
              ? Math.round((Number(this.selectedProduct!.priceList) / 1.35) * 100) / 100
              : (Number((this.selectedProduct as any)?.price) > 0 ? Math.round((Number((this.selectedProduct as any).price) / 1.35) * 100) / 100 : 0)));
    const cost = Number(this.addCost) > 0 ? Number(this.addCost) : fallbackCost;

    // Validate outlet/transfer stock
    if (this.mode !== 'entry' && this.selectedProduct.stock !== undefined) {
      const currentInTable = this.productDetails
        .filter((d) => d.productId === this.selectedProduct!.id)
        .reduce((s, i) => s + i.quantity, 0);

      if (currentInTable + qty > (this.selectedProduct.stock || 0) && (this.selectedProduct.stock || 0) > 0) {
        this.notificationService.warning(
          `Advertencia: Stock disponible en almacén (${this.selectedProduct.stock} uds) es menor que la salida solicitada.`
        );
      }
    }

    const existingIdx = this.productDetails.findIndex(
      (d) => d.productId === this.selectedProduct!.id
    );

    if (existingIdx !== -1) {
      this.productDetails[existingIdx].quantity += qty;
      this.productDetails[existingIdx].cost = cost;
      this.productDetails = [...this.productDetails];
    } else {
      const newLine: MovementLineItem = {
        productId: this.selectedProduct.id,
        productName: this.selectedProduct.description,
        description: this.selectedProduct.shortDescription || this.selectedProduct.reference || '',
        barCode: this.selectedProduct.barcode || `PRD-${this.selectedProduct.id}`,
        quantity: qty,
        cost: cost,
        price: this.selectedProduct.priceList || cost * 1.35,
        warehouseId: this.mode === 'transfer' ? Number(this.warehouseOfOriginId) : Number(this.warehouseId),
        stockAvailable: this.selectedProduct.stock,
      };
      this.productDetails = [...this.productDetails, newLine];
    }

    // Reset row controls
    this.searchTerm = '';
    this.selectedProduct = null;
    this.addQuantity = 1;
    this.addCost = 0;
    this.filteredProducts = [];
    this.isSearchDropdownOpen = false;
    this.searchInput?.nativeElement?.focus();
  }

  // --- Inline Row Changes ---
  onLineChange(idx: number) {
    if (this.productDetails[idx]) {
      const item = this.productDetails[idx];
      if (item.quantity < 1) item.quantity = 1;
      if (item.cost !== undefined && item.cost < 0) item.cost = 0;
      this.productDetails = [...this.productDetails];
    }
  }

  removeProduct(idx: number) {
    this.productDetails = this.productDetails.filter((_, i) => i !== idx);
  }

  // --- Catalog Multi-Select Modal Methods ---
  openProductCatalogModal() {
    this.catalogSearchTerm = '';
    this.catalogFilter = 'all';

    this.catalogItems = this.allProducts.map((p) => {
      const stock = this.activeWarehouseStockMap.has(p.id)
        ? (this.activeWarehouseStockMap.get(p.id) || 0)
        : (p.stock || 0);
      const existingInTable = this.productDetails.find((d) => d.productId === p.id);
      const metrics = this.productService.getProductMetrics(p.id);
      const cost = Number(p.cost) > 0
        ? Number(p.cost)
        : (metrics?.cost && Number(metrics.cost) > 0
            ? Number(metrics.cost)
            : (Number(p.priceList) > 0
                ? Math.round((Number(p.priceList) / 1.35) * 100) / 100
                : (Number((p as any).price) > 0 ? Math.round((Number((p as any).price) / 1.35) * 100) / 100 : 0)));

      return {
        product: p,
        stock: stock,
        cost: cost,
        quantity: existingInTable ? existingInTable.quantity : 1,
        selected: false,
      };
    });

    this.isCatalogModalOpen.set(true);
  }

  closeProductCatalogModal() {
    this.isCatalogModalOpen.set(false);
  }

  get filteredCatalogItems(): CatalogModalItem[] {
    const q = (this.catalogSearchTerm || '').toLowerCase().trim();
    return this.catalogItems.filter((item) => {
      if (this.catalogFilter === 'with-stock' && item.stock <= 0) return false;
      if (this.catalogFilter === 'zero-stock' && item.stock > 0) return false;

      if (!q) return true;
      return (
        item.product.description.toLowerCase().includes(q) ||
        (item.product.barcode && item.product.barcode.toLowerCase().includes(q)) ||
        (item.product.shortDescription && item.product.shortDescription.toLowerCase().includes(q))
      );
    });
  }

  toggleSelectAllCatalog(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.filteredCatalogItems.forEach((it) => (it.selected = checked));
  }

  isAllCatalogSelected(): boolean {
    const items = this.filteredCatalogItems;
    if (items.length === 0) return false;
    return items.every((it) => it.selected);
  }

  get selectedCatalogCount(): number {
    return this.catalogItems.filter((it) => it.selected).length;
  }

  get selectedCatalogUnits(): number {
    return this.catalogItems
      .filter((it) => it.selected)
      .reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  }

  get selectedCatalogCost(): number {
    return this.catalogItems
      .filter((it) => it.selected)
      .reduce((sum, it) => sum + (Number(it.quantity) || 1) * (Number(it.cost) || 0), 0);
  }

  confirmAddCatalogProducts() {
    const selected = this.catalogItems.filter((it) => it.selected);
    if (selected.length === 0) {
      this.notificationService.warning('Selecciona al menos un producto del catálogo.');
      return;
    }

    let addedCount = 0;
    const targetWhId = this.mode === 'transfer' ? Number(this.warehouseOfOriginId) : Number(this.warehouseId);

    selected.forEach((it) => {
      const p = it.product;
      const qty = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
      const metrics = this.productService.getProductMetrics(p.id);
      const fallbackCost = Number(p.cost) > 0
        ? Number(p.cost)
        : (metrics?.cost && Number(metrics.cost) > 0
            ? Number(metrics.cost)
            : (Number(p.priceList) > 0
                ? Math.round((Number(p.priceList) / 1.35) * 100) / 100
                : (Number((p as any).price) > 0 ? Math.round((Number((p as any).price) / 1.35) * 100) / 100 : 0)));
      const cost = Number(it.cost) > 0 ? Number(it.cost) : fallbackCost;

      const existingIdx = this.productDetails.findIndex((d) => d.productId === p.id);
      if (existingIdx !== -1) {
        this.productDetails[existingIdx].quantity += qty;
        this.productDetails[existingIdx].cost = cost;
      } else {
        const newLine: MovementLineItem = {
          productId: p.id,
          productName: p.description,
          description: p.shortDescription || p.reference || '',
          barCode: p.barcode || `PRD-${p.id}`,
          quantity: qty,
          cost: cost,
          price: p.priceList || cost * 1.35,
          warehouseId: targetWhId,
          stockAvailable: it.stock,
        };
        this.productDetails.push(newLine);
      }
      addedCount++;
    });

    this.productDetails = [...this.productDetails];
    this.notificationService.success(`${addedCount} productos agregados al movimiento desde el catálogo.`);
    this.closeProductCatalogModal();
  }

  // --- Camera Scanner Modal ---
  openCameraScanner() {
    this.isCameraScannerOpen.set(true);
  }

  async onCameraBarcodeScanned(code: string) {
    this.isCameraScannerOpen.set(false);
    if (!code) return;
    this.searchTerm = code;
    this.notificationService.success(`Código escaneado: ${code}`);
    await this.handleSearchEnter();
  }

  // --- File / Image Barcode Decoder ---
  async onBarcodeImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.isDecodingBarcodeImage.set(true);
    try {
      this.notificationService.info('Analizando imagen para decodificar código de barras...');
      const decodedCode = await this.barcodeLookupService.decodeBarcodeFromImage(file);
      if (decodedCode) {
        this.searchTerm = decodedCode;
        this.notificationService.success(`Código detectado en la imagen: ${decodedCode}`);
        await this.handleSearchEnter();
      } else {
        this.notificationService.warning('No se detectó ningún código de barras en la imagen.');
      }
    } catch (err: any) {
      this.notificationService.error(
        err?.message || 'Error al procesar el archivo de imagen.'
      );
    } finally {
      this.isDecodingBarcodeImage.set(false);
      input.value = '';
    }
  }

  // --- Save / Submit Movement ---
  async saveMovement() {
    // Escudo inmediato e incondicional contra doble click / duplicidad
    if (this._isSubmitting || this.isSaving()) return;
    this._isSubmitting = true;
    this.isSaving.set(true);

    try {
      if (this.productDetails.length === 0) {
        this.notificationService.warning('Debe agregar al menos un producto al movimiento.');
        return;
      }

      if (this.mode === 'transfer' && Number(this.warehouseOfOriginId) === Number(this.destinationWarehouseId)) {
        this.notificationService.error('El almacén de origen y destino no pueden ser iguales.');
        return;
      }
      const payload: WarehouseMovementHeader = {
        warehouseId: this.mode === 'transfer' ? Number(this.warehouseOfOriginId) : Number(this.warehouseId),
        warehouseOfOriginId: Number(this.warehouseOfOriginId),
        destinationWarehouseId: Number(this.destinationWarehouseId),
        conceptId: Number(this.conceptId),
        commentary: this.commentary || '',
        statusId: 1,
        totalQuantity: this.totalUnits,
        totalCost: this.totalCost,
        productDetails: this.productDetails,
      };

      let res: any;
      if (this.mode === 'entry') {
        res = await this.entryService.createEntry(payload);
      } else if (this.mode === 'outlet') {
        res = await this.outletService.createOutlet(payload);
      } else {
        res = await this.transferService.createTransfer(payload);
      }

      if (res?.success) {
        const msg =
          res.message ||
          (this.mode === 'entry'
            ? 'Entrada registrada exitosamente.'
            : this.mode === 'outlet'
            ? 'Salida procesada exitosamente.'
            : 'Transferencia completada exitosamente.');
        this.notificationService.success(msg);

        const targetWhId = this.mode === 'transfer' ? Number(this.destinationWarehouseId) : Number(this.warehouseId);
        const wh = this.warehouses.find((w) => Number(w.id) === targetWhId);
        const conc = this.concepts.find((c) => Number(c.id) === Number(this.conceptId));
        const prefix = this.mode === 'entry' ? 'ENT' : this.mode === 'outlet' ? 'SAL' : 'TRF';
        const movId = res?.data?.id || Date.now().toString().slice(-6);

        this.receiptData = {
          movementCode: `${prefix}-${movId}`,
          movementType: this.mode,
          statusLabel: 'Aplicado',
          warehouseName: wh?.name || 'Almacén Principal',
          warehouseLocation: (wh as any)?.description || (wh as any)?.address || 'Bodega Central',
          conceptName: conc?.name || (this.mode === 'entry' ? 'Entrada de almacén' : this.mode === 'outlet' ? 'Salida de almacén' : 'Transferencia'),
          conceptDescription: conc?.description || 'Recepción de stock',
          date: new Date().toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          time: new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }),
          items: this.productDetails.map((d: any) => ({
            code: d.productCode || d.barcode || `PROD-${d.productId}`,
            name: d.productName || 'Producto',
            description: d.description || '',
            quantity: Number(d.quantity) || 1,
            unitCost: Number(d.cost) || 0,
            totalCost: (Number(d.cost) || 0) * (Number(d.quantity) || 1),
          })),
          totalUnits: this.totalUnits,
          totalCost: this.totalCost,
        };
        this.isReceiptModalOpen.set(true);
      } else {
        this.notificationService.error(res?.message || 'Error al procesar el movimiento.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSaving.set(false);
      this._isSubmitting = false;
    }
  }

  toggleCatalogRow(it: CatalogModalItem, event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.closest('input'))) return;
    it.selected = !it.selected;
  }

  onReceiptClosed(): void {
    this.isReceiptModalOpen.set(false);
    this.cancel();
  }

  cancel() {
    const route =
      this.mode === 'entry'
        ? '/inventory/entries'
        : this.mode === 'outlet'
        ? '/inventory/outlets'
        : '/inventory/transfers';
    this.router.navigate([route]);
  }
}
