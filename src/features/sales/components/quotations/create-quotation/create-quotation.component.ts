import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { QuotationService } from '../../../services/quotation.service';
import {
  CustomerService,
  DEFAULT_CASH_CUSTOMER,
} from '../../../../customers/services/customer.service';
import { ProductService } from '../../../../products/services/product.service';
import { WarehouseService } from '../../../../inventory/services/warehouse.service';
import { StockService } from '../../../../inventory/services/stock.service';
import { NotificationService } from '../../../../cuadreEnv/services/notification.service';
import type { CustomerDto, ProductDto } from '../../../../cuadreEnv/types/api';
import type { Warehouse } from '../../../../../app/models/warehouse';
import type {
  QuotationStatus,
  CreateQuotationDto,
} from '../../../types/quotation.types';

export interface QuotationFormItem {
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  itbisRate: number;
  notes?: string;
}

@Component({
  selector: 'app-create-quotation',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './create-quotation.component.html',
  styleUrls: ['./create-quotation.component.scss'],
})
export class CreateQuotationComponent implements OnInit {
  private quotationService = inject(QuotationService);
  private customerService = inject(CustomerService);
  private productService = inject(ProductService);
  private warehouseService = inject(WarehouseService);
  private stockService = inject(StockService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Form State
  quotationId = signal<number | null>(null);
  quotationNumber = signal<string>('COT-NUEVA');
  status = signal<QuotationStatus>('DRAFT');

  customerId = signal<number>(1); // Default: Cliente Contado
  warehouseId = signal<number>(1); // Almacén seleccionado para la cotización
  issueDate = signal<string>(new Date().toISOString().substring(0, 10));
  expirationDate = signal<string>(
    new Date(Date.now() + 15 * 86400000).toISOString().substring(0, 10),
  );
  paymentCondition = signal<string>('Contado');
  sellerId = signal<number | null>(null);
  observations = signal<string>('');

  // Products
  items = signal<QuotationFormItem[]>([]);
  productSearchTerm = signal<string>('');
  filteredProducts = signal<ProductDto[]>([]);
  isSearchDropdownOpen = signal<boolean>(false);

  // Catalogs
  customers = signal<CustomerDto[]>([]);
  warehouses = signal<Warehouse[]>([]);
  warehouseStockMap = signal<Map<number, number>>(new Map());
  allProducts = signal<ProductDto[]>([]);

  // Async
  isSaving = signal<boolean>(false);
  isLoading = signal<boolean>(false);

  // Computeds
  readonly totalProductsCount = computed(() => this.items().length);

  readonly totalUnitsCount = computed(() =>
    this.items().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
  );

  readonly subtotal = computed(() =>
    this.items().reduce((sum, item) => {
      const q = Number(item.quantity) || 0;
      const p = Number(item.unitPrice) || 0;
      const d = Number(item.discountRate) || 0;
      return sum + q * p * (1 - d / 100);
    }, 0),
  );

  readonly discountTotal = computed(() =>
    this.items().reduce((sum, item) => {
      const q = Number(item.quantity) || 0;
      const p = Number(item.unitPrice) || 0;
      const d = Number(item.discountRate) || 0;
      return sum + q * p * (d / 100);
    }, 0),
  );

  readonly itbisTotal = computed(() =>
    this.items().reduce((sum, item) => {
      const q = Number(item.quantity) || 0;
      const p = Number(item.unitPrice) || 0;
      const d = Number(item.discountRate) || 0;
      const base = q * p * (1 - d / 100);
      const rate = Number(item.itbisRate) || 0;
      return sum + base * (rate / 100);
    }, 0),
  );

  readonly grandTotal = computed(() => this.subtotal() + this.itbisTotal());

  ngOnInit(): void {
    this.loadCatalogs();
    const idParam = this.route.snapshot.queryParamMap.get('id');
    if (idParam) {
      this.loadExistingQuotation(Number(idParam));
    } else {
      // Default sample items matching Image 5
      this.items.set([
        {
          productId: 1,
          productCode: '7500001000017',
          productName: 'Coca-Cola Original',
          quantity: 10,
          unitPrice: 300,
          discountRate: 0,
          itbisRate: 18,
        },
        {
          productId: 2,
          productCode: '7613033687140',
          productName: 'Nesquik',
          quantity: 40,
          unitPrice: 200,
          discountRate: 0,
          itbisRate: 18,
        },
      ]);
    }
  }

  async loadCatalogs(): Promise<void> {
    try {
      const custRes = await this.customerService.getCustomers();
      let custList: CustomerDto[] = [];
      if (custRes?.success && custRes.data && custRes.data.length > 0) {
        custList = [...custRes.data];
      }
      if (!custList.some((c) => c.id === 1)) {
        custList.unshift(DEFAULT_CASH_CUSTOMER);
      }
      this.customers.set(custList);

      // Load Warehouses
      const whRes = await this.warehouseService.getWarehouses();
      if (whRes?.success && whRes.data && whRes.data.length > 0) {
        const whs = whRes.data.filter((w) => w.isActive !== false);
        this.warehouses.set(whs);
        const mainWh = whs.find((w) => w.isMain) || whs[0];
        this.warehouseId.set(Number(mainWh.id));
      } else {
        const defaultWh = this.warehouseService.createDefaultMainWarehouse();
        this.warehouses.set([defaultWh]);
        this.warehouseId.set(1);
      }

      await this.loadWarehouseStock(this.warehouseId());

      const prodRes = await this.productService.getPagedProducts(1, 150);
      if (prodRes?.data?.items) {
        this.allProducts.set(prodRes.data.items);
      }
    } catch (e) {
      console.warn('Error loading catalogs:', e);
    }
  }

  async onWarehouseChange(whId: number): Promise<void> {
    this.warehouseId.set(Number(whId));
    await this.loadWarehouseStock(Number(whId));
    if (this.productSearchTerm().trim()) {
      this.onProductSearchInput(this.productSearchTerm());
    }
  }

  async loadWarehouseStock(whId: number): Promise<void> {
    try {
      const stockRes = await this.stockService.getStock({ warehouseId: whId });
      const map = new Map<number, number>();
      if (stockRes?.success && stockRes.data) {
        stockRes.data.forEach((s) => {
          map.set(Number(s.productId), Number(s.quantity) || 0);
        });
      }
      this.warehouseStockMap.set(map);
    } catch {
      // ignore
    }
  }

  async loadExistingQuotation(id: number): Promise<void> {
    this.isLoading.set(true);
    try {
      const q = await this.quotationService.getQuotationById(id);
      if (q) {
        this.quotationId.set(q.id);
        this.quotationNumber.set(q.quotationNumber);
        this.status.set(q.status);
        this.customerId.set(q.customerId);
        if (q.issueDate) this.issueDate.set(q.issueDate.substring(0, 10));
        if (q.expirationDate)
          this.expirationDate.set(q.expirationDate.substring(0, 10));
        this.paymentCondition.set(q.paymentCondition || 'Contado');
        this.observations.set(q.notes || '');

        if (q.details && q.details.length > 0) {
          this.items.set(
            q.details.map((d) => ({
              productId: d.productId,
              productCode: d.productCode,
              productName: d.productName,
              quantity: d.quantity,
              unitPrice: d.unitPrice,
              discountRate: d.discountRate,
              itbisRate: d.itbisRate,
              notes: d.notes,
            })),
          );
        }
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  onProductSearchInput(term: string): void {
    this.productSearchTerm.set(term);
    const q = term.trim().toLowerCase();
    if (!q) {
      this.filteredProducts.set([]);
      this.isSearchDropdownOpen.set(false);
      return;
    }
    const stockMap = this.warehouseStockMap();
    const matches = this.allProducts().filter((p) => {
      const textMatch =
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.shortDescription && p.shortDescription.toLowerCase().includes(q)) ||
        (p.reference && p.reference.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q));

      if (!textMatch) return false;

      // Excluir productos con 0 stock a menos que permitan facturar sin stock
      const allowWithoutStock = (p as any).invoiceWithoutStock === true;
      const currentStock =
        p.id != null && stockMap.has(p.id)
          ? stockMap.get(p.id) || 0
          : (p as any).stock || 0;
      return allowWithoutStock || currentStock > 0;
    });
    this.filteredProducts.set(matches.slice(0, 8));
    this.isSearchDropdownOpen.set(matches.length > 0);
  }

  selectProduct(product: ProductDto): void {
    const pId = Number(product.id) || Date.now();
    const existing = this.items().find((i) => i.productId === pId);
    if (existing) {
      existing.quantity += 1;
      this.items.set([...this.items()]);
    } else {
      this.items.update((list) => [
        ...list,
        {
          productId: pId,
          productCode: product.reference || product.barcode || `PROD-${pId}`,
          productName:
            product.description || product.shortDescription || 'Producto',
          quantity: 1,
          unitPrice: Number(product.price) || Number(product.cost) || 100,
          discountRate: 0,
          itbisRate: 18,
        },
      ]);
    }
    this.productSearchTerm.set('');
    this.isSearchDropdownOpen.set(false);
  }

  addNewBlankItem(): void {
    this.items.update((list) => [
      ...list,
      {
        productId: Date.now(),
        productCode: `ITEM-${list.length + 1}`,
        productName: 'Nuevo Producto / Servicio',
        quantity: 1,
        unitPrice: 500,
        discountRate: 0,
        itbisRate: 18,
      },
    ]);
  }

  removeItem(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  getItemSubtotal(item: QuotationFormItem): number {
    return item.quantity * item.unitPrice * (1 - item.discountRate / 100);
  }

  getItemItbis(item: QuotationFormItem): number {
    return this.getItemSubtotal(item) * (item.itbisRate / 100);
  }

  getItemTotal(item: QuotationFormItem): number {
    return this.getItemSubtotal(item) + this.getItemItbis(item);
  }

  cancel(): void {
    this.router.navigate(['/sales/quotations']);
  }

  async save(statusToSave: QuotationStatus = 'DRAFT'): Promise<void> {
    if (this.items().length === 0) {
      this.notificationService.warning(
        'Debe agregar al menos un producto a la cotización.',
      );
      return;
    }

    this.isSaving.set(true);
    try {
      const selectedCustomer = this.customers().find(
        (c) => c.id === this.customerId(),
      );
      const payload: CreateQuotationDto = {
        customerId: this.customerId(),
        customerName: selectedCustomer?.name || 'Comercial Duarte',
        issueDate: this.issueDate(),
        expirationDate: this.expirationDate(),
        paymentCondition: this.paymentCondition(),
        notes: this.observations(),
        status: statusToSave,
        details: this.items().map((i) => ({
          productId: i.productId,
          productCode: i.productCode,
          productName: i.productName,
          quantity: Number(i.quantity) || 1,
          unitPrice: Number(i.unitPrice) || 0,
          discountRate: Number(i.discountRate) || 0,
          itbisRate: Number(i.itbisRate) || 0,
          notes: i.notes,
        })),
      };

      const res = await this.quotationService.createQuotation(payload);
      if (res.success) {
        this.notificationService.success(
          statusToSave === 'SENT'
            ? 'Cotización guardada y enviada al cliente exitosamente.'
            : 'Cotización guardada en borrador exitosamente.',
        );
        this.router.navigate(['/sales/quotations']);
      } else {
        this.notificationService.error(
          res.message || 'Error al guardar cotización',
        );
      }
    } catch (e: any) {
      this.notificationService.error(
        e?.message || 'Error al guardar cotización',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  showPdfPreview(): void {
    this.notificationService.info(
      'Generando vista previa de cotización en formato PDF...',
    );
    window.print();
  }
}
