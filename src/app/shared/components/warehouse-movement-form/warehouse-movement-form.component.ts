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
import { Router, RouterModule } from '@angular/router';
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

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('barcodeImageInput') barcodeImageInput?: ElementRef<HTMLInputElement>;

  // Receipt Modal State
  isReceiptModalOpen = signal<boolean>(false);
  receiptData: MovementReceiptData | null = null;

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
    await Promise.all([this.loadCatalogs(), this.loadProducts()]);
  }

  async loadCatalogs() {
    this.isLoadingCatalogs.set(true);
    try {
      const res = await this.warehouseService.getWarehouses();
      if (res?.success && res.data) {
        this.warehouses = res.data.filter((w) => w.isActive !== false);

        if (this.warehouses.length > 0) {
          const mainWh = this.warehouses.find((w) => w.isMain) || this.warehouses[0];
          this.warehouseId = mainWh.id;
          this.warehouseOfOriginId = mainWh.id;
          this.destinationWarehouseId =
            this.warehouses.length > 1 ? this.warehouses[1].id : this.warehouses[0].id;
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
      const res = await this.productService.getPagedProducts(1, 150);
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
          .map((p: any) => ({
            id: p.id || 0,
            description: p.description || p.name || '',
            barcode: p.barcode || p.reference || '',
            reference: p.reference || '',
            shortDescription: p.shortDescription || p.categoryName || '',
            cost: p.cost || 0,
            priceList: p.priceList || p.price || 0,
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
      }
    } catch {
      // Ignore
    }
  }

  onWarehouseChange() {
    if (this.mode === 'transfer' && this.warehouseOfOriginId === this.destinationWarehouseId) {
      const alt = this.warehouses.find((w) => w.id !== this.warehouseOfOriginId);
      if (alt) this.destinationWarehouseId = alt.id;
    }
  }

  getSelectedWarehouseName(): string {
    if (this.mode === 'transfer') {
      const origin = this.warehouses.find((w) => w.id === this.warehouseOfOriginId);
      const dest = this.warehouses.find((w) => w.id === this.destinationWarehouseId);
      return `${origin?.name || 'Origen'} ➔ ${dest?.name || 'Destino'}`;
    }
    const wh = this.warehouses.find((w) => w.id === this.warehouseId);
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
      .slice(0, 8);

    this.isSearchDropdownOpen = this.filteredProducts.length > 0;
  }

  selectProductFromDropdown(p: Product) {
    this.selectedProduct = p;
    this.searchTerm = `${p.description} (${p.barcode || 'S/C'})`;
    this.addCost = p.cost || 0;
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
    const cost = Number(this.addCost) >= 0 ? Number(this.addCost) : (this.selectedProduct.cost || 0);

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
        price: this.selectedProduct.priceList || cost * 1.3,
        warehouseId: this.mode === 'transfer' ? this.warehouseOfOriginId : this.warehouseId,
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
    if (this.productDetails.length === 0) {
      this.notificationService.warning('Debe agregar al menos un producto al movimiento.');
      return;
    }

    if (this.mode === 'transfer' && this.warehouseOfOriginId === this.destinationWarehouseId) {
      this.notificationService.error('El almacén de origen y destino no pueden ser iguales.');
      return;
    }

    this.isSaving.set(true);
    try {
      const payload: WarehouseMovementHeader = {
        warehouseId: this.mode === 'transfer' ? this.warehouseOfOriginId : this.warehouseId,
        warehouseOfOriginId: this.warehouseOfOriginId,
        destinationWarehouseId: this.destinationWarehouseId,
        conceptId: this.conceptId,
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

        const targetWhId = this.mode === 'transfer' ? this.destinationWarehouseId : this.warehouseId;
        const wh = this.warehouses.find((w) => w.id === targetWhId);
        const conc = this.concepts.find((c) => c.id === this.conceptId);
        const prefix = this.mode === 'entry' ? 'ENT' : this.mode === 'outlet' ? 'SAL' : 'TRF';
        const movId = res?.data?.id || 19;

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
    }
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
