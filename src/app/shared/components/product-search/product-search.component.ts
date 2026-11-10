import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../../features/products/services/product.service';
import { StockService } from '../../../../features/inventory/services/stock.service';
import { WarehouseService } from '../../../../features/inventory/services/warehouse.service';
import { NotificationService } from '../../../../features/cuadreEnv/services/notification.service';
import { ProductPackagingService, ProductPackaging } from '../../../../features/products/services/product-packaging.service';
import { UnitOfMeasurementService } from '../../../../features/products/services/unit-of-measurement.service';
import { BarcodeLookupService } from '../../../../features/products/services/barcode-lookup.service';
import { CameraBarcodeModalComponent } from '../camera-barcode-modal/camera-barcode-modal.component';
import type { ProductMovementDetail } from '../../../models/movement';
import type { Product } from '../../../models/product';

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CommonModule, FormsModule, CameraBarcodeModalComponent],
  templateUrl: './product-search.component.html',
  styleUrls: ['./product-search.component.scss'],
})
export class ProductSearchComponent implements OnInit, OnChanges {
  private productService = inject(ProductService);
  private stockService = inject(StockService);
  private warehouseService = inject(WarehouseService);
  private notificationService = inject(NotificationService);
  private packagingService = inject(ProductPackagingService);
  private unitService = inject(UnitOfMeasurementService);
  private barcodeLookupService = inject(BarcodeLookupService);

  @Input() warehouseId = 1;
  @Input() mode: 'entry' | 'outlet' | 'transfer' = 'entry';
  @Input() detailToEdit?: ProductMovementDetail | null = null;

  @Output() productAdded = new EventEmitter<ProductMovementDetail>();
  @Output() productUpdated = new EventEmitter<ProductMovementDetail>();

  allProducts: Product[] = [];
  filteredProducts: (Product & { stockInWarehouse: number })[] = [];
  warehouses = signal<any[]>([]);

  searchTerm = '';
  selectedProduct: (Product & { stockInWarehouse: number }) | null = null;
  quantity = 1;
  cost = 0;
  isSearching = false;

  // Barcode & Camera features
  isCameraScannerOpen = signal<boolean>(false);
  isDecodingBarcodeImage = signal<boolean>(false);
  isGlobalSearching = signal<boolean>(false);

  // Packaging and base unit variables
  currentPackaging: ProductPackaging | undefined;
  unitSymbol = 'lb';
  entryMode: 'base' | 'package' = 'base';
  packageCount = 1;
  packageCost = 0;
  scannedBarcode = '';
  @ViewChild('quantityInput') quantityInput?: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  async ngOnInit() {
    await Promise.all([
      this.loadProducts(),
      this.loadWarehouses(),
    ]);
  }

  async loadWarehouses() {
    try {
      const res = await this.warehouseService.getWarehouses();
      if (res?.success && res.data) {
        this.warehouses.set(res.data);
      }
    } catch {
      // ignore
    }
  }

  getWarehouseName(): string {
    const found = this.warehouses().find(w => w.id === this.warehouseId);
    return found?.name || `Almacén #${this.warehouseId}`;
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
          .filter((p: any) => {
            if (!p) return false;
            if (p.isService === true || p.type === 'service' || p.type === 'Servicio') return false;
            if (p.productTypeId === 2 || p.ProductTypeId === 2) return false;
            if (p.invoiceWithoutStock === true) return false;
            const code = String(p.barcode || p.reference || '').toUpperCase().trim();
            if (code.startsWith('SERV-') || code.startsWith('SERV')) return false;
            const typeName = String(p.productTypeName || p.productType?.name || '').toLowerCase();
            if (typeName.includes('serv')) return false;
            const catName = String(p.categoryName || p.category?.name || '').toLowerCase();
            if (catName.includes('serv')) return false;
            return true;
          })
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
    const raw = (this.searchTerm || '').trim();
    if (raw.length >= 6) {
      const direct = this.allProducts.find(p => p.barcode && p.barcode.trim().toLowerCase() === raw.toLowerCase());
      if (direct) {
        await this.handleDirectBarcodeMatch(direct);
        return;
      }
    }
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

  async handleDirectBarcodeMatch(found: Product) {
    const stock = await this.stockService.getProductStockInWarehouse(
      this.warehouseId,
      found.id,
    );
    this.scannedBarcode = found.barcode || found.reference || String(found.id);
    this.selectProduct({ ...found, stockInWarehouse: stock });
    this.searchTerm = '';
    this.scannedBarcode = '';
    this.notificationService.success('¡Producto seleccionado! ' + found.description);
    setTimeout(() => {
      this.quantityInput?.nativeElement?.focus();
      this.quantityInput?.nativeElement?.select();
    }, 100);
  }

  openCameraScanner(): void {
    this.isCameraScannerOpen.set(true);
  }

  async onCameraBarcodeScanned(code: string): Promise<void> {
    this.isCameraScannerOpen.set(false);
    if (!code) return;
    this.searchTerm = code;
    this.notificationService.success(`¡Código escaneado: ${code}!`);
    await this.processBarcodeSearch(code, true);
  }

  async onBarcodeImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.isDecodingBarcodeImage.set(true);
    try {
      this.notificationService.info('Analizando imagen para decodificar código de barras...');
      const decodedCode = await this.barcodeLookupService.decodeBarcodeFromImage(file);
      if (decodedCode) {
        this.searchTerm = decodedCode;
        this.notificationService.success(`¡Código detectado en la imagen: ${decodedCode}!`);
        await this.processBarcodeSearch(decodedCode, true);
      }
    } catch (err: any) {
      this.notificationService.error(err?.message || 'No se pudo decodificar el código de barras de la imagen.');
    } finally {
      this.isDecodingBarcodeImage.set(false);
      input.value = '';
    }
  }

  async onGlobalSearchClicked(): Promise<void> {
    const raw = (this.searchTerm || '').trim();
    if (!raw) {
      this.notificationService.warning('Ingresa un código de barra para buscar globalmente.');
      return;
    }
    await this.processBarcodeSearch(raw, true);
  }

  async onBarcodeEntered(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const raw = (this.searchTerm || '').trim();
    if (!raw) return;
    await this.processBarcodeSearch(raw, false);
  }

  async processBarcodeSearch(raw: string, forceGlobalLookup = false): Promise<void> {
    if (!raw) return;
    const cleanCode = raw.trim();
    const lower = cleanCode.toLowerCase();

    // 1. Si ya existe en el catálogo local de la empresa, lo seleccionamos directamente
    const exact = this.allProducts.find(
      (p) =>
        (p.barcode && p.barcode.trim().toLowerCase() === lower) ||
        (p.reference && p.reference.trim().toLowerCase() === lower) ||
        String(p.id) === lower,
    );
    if (exact && !forceGlobalLookup) {
      await this.handleDirectBarcodeMatch(exact);
      return;
    }

    if (this.filteredProducts.length === 1 && !forceGlobalLookup) {
      await this.handleDirectBarcodeMatch(this.filteredProducts[0]);
      return;
    }

    const partial = this.allProducts.find(
      (p) => p.barcode && p.barcode.toLowerCase().includes(lower),
    );
    if (partial && !forceGlobalLookup) {
      await this.handleDirectBarcodeMatch(partial);
      return;
    }

    // Si ya existe pero se forzó la búsqueda global, confirmamos o reutilizamos
    if (exact) {
      await this.handleDirectBarcodeMatch(exact);
      return;
    }

    // 2. BÚSQUEDA GLOBAL (OpenFoodFacts / UPC / Bases internacionales)
    // En Entrada de Almacén esto permite que productos nuevos se descubran y creen al instante
    this.isGlobalSearching.set(true);
    const targetWhName = this.getWarehouseName();
    this.notificationService.info(`Buscando código "${cleanCode}" en bases de datos globales...`);

    try {
      const meta = await this.barcodeLookupService.lookupUniversalProduct(cleanCode);
      if (meta && (meta.name || meta.description)) {
        const prodName = meta.name || meta.description || `Producto ${cleanCode}`;
        this.notificationService.success(`¡Encontrado globalmente: "${prodName}"! Creando en el sistema para ${targetWhName}...`);

        const suggestedRef = meta.brand
          ? `${meta.brand.slice(0, 4).toUpperCase()}-${cleanCode.slice(-4)}`
          : `REF-${cleanCode.slice(-4)}`;

        // Crear producto tangible de una vez en el backend
        const createRes = await this.productService.createProduct({
          description: prodName,
          barcode: cleanCode,
          reference: suggestedRef,
          shortDescription: meta.brand ? `${meta.brand} - ${prodName}` : prodName,
          cost: 0,
          price: 0,
          stock: 0,
          productTypeId: 1, // Almacenable / Físico
          categoryId: 1,
          unitOfMeasurementId: 1,
          packingId: 1,
          minimumQuantity: 5,
          maximumQuantity: 100,
          imageUrl: meta.imageUrl || '',
        } as any);

        if (createRes?.success && createRes.data) {
          const rawItem: any = (createRes.data as any)?.data || createRes.data;
          const mapped: Product = {
            id: rawItem.id || 0,
            description: rawItem.description || prodName,
            barcode: rawItem.barcode || cleanCode,
            reference: rawItem.reference || suggestedRef,
            shortDescription: rawItem.shortDescription || '',
            cost: rawItem.cost || 0,
            priceList: rawItem.priceList || rawItem.price || 0,
            taxRate: rawItem.taxRate || 18,
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

          this.allProducts.unshift(mapped);
          await this.handleDirectBarcodeMatch(mapped);
          this.notificationService.success(`✨ "${prodName}" creado de una vez y seleccionado para ingresar a ${targetWhName}.`);
          return;
        }
      }

      // 3. Si no existe globalmente, permitir crear al instante con un nombre rápido sin abandonar la pantalla
      const manualName = window.prompt(
        `El código "${cleanCode}" no fue encontrado en la base de datos local ni global.\n\nEscriba el nombre del nuevo producto para crearlo de una vez en el catálogo y darle entrada a "${targetWhName}":`
      );
      if (manualName && manualName.trim()) {
        const prodName = manualName.trim();
        const createRes = await this.productService.createProduct({
          description: prodName,
          barcode: cleanCode,
          reference: `REF-${cleanCode.slice(-4)}`,
          cost: 0,
          price: 0,
          stock: 0,
          productTypeId: 1,
          categoryId: 1,
          unitOfMeasurementId: 1,
          packingId: 1,
          minimumQuantity: 5,
          maximumQuantity: 100,
        } as any);

        if (createRes?.success && createRes.data) {
          const rawItem: any = (createRes.data as any)?.data || createRes.data;
          const mapped: Product = {
            id: rawItem.id || 0,
            description: rawItem.description || prodName,
            barcode: rawItem.barcode || cleanCode,
            reference: rawItem.reference || `REF-${cleanCode.slice(-4)}`,
            shortDescription: '',
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

          this.allProducts.unshift(mapped);
          await this.handleDirectBarcodeMatch(mapped);
          this.notificationService.success(`✓ "${prodName}" creado y seleccionado para entrada en ${targetWhName}.`);
          return;
        }
      }

      this.notificationService.warning(`No se agregó ningún producto para el código "${cleanCode}".`);
    } catch (err: any) {
      console.warn('Error en búsqueda global / creación rápida:', err);
      this.notificationService.warning(`No se pudo procesar el código "${cleanCode}". Intente nuevamente.`);
    } finally {
      this.isGlobalSearching.set(false);
    }
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
