import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { WarehouseService } from '../../../inventory/services/warehouse.service';
import { StockService } from '../../../inventory/services/stock.service';
import { ProductService } from '../../../products/services/product.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { DistributionRouteService } from '../../services/distribution-route.service';
import { formatDateInRD } from '../../../cuadreEnv/utils/rd-date.util';
export interface RouteLoadItem {
  productId: number;
  productCode: string;
  productName: string;
  loadedQuantity: number;
  soldQuantity: number;
  returnedQuantity: number;
  unitPrice: number;
  totalSoldAmount: number;
  totalRemainingValue: number;
  stockAvailable?: number;
  isSelected?: boolean;
}

export interface DistributionRoute {
  id: number;
  routeCode: string;
  routeName: string;
  coverageZone: string;
  driverName: string;
  vehiclePlate: string;
  vehicleName: string;
  date: string;
  status: 'Cargando' | 'En reparto' | 'Liquidada';
  items: RouteLoadItem[];
  totalCollectedCash: number;
  totalCollectedTransfer: number;
  totalCreditSales: number;
  originWarehouse: string;
}

export interface SaleProductOnTruck {
  id: number;
  name: string;
  code: string;
  stock: number;
  price: number;
  quantity: number;
  inCart: boolean;
}

export interface CartItem {
  id: number;
  name: string;
  code: string;
  quantity: number;
  price: number;
  subtotal: number;
}

const STORAGE_ROUTES = 'cuadreenv_distribution_routes_v2';

@Component({
  selector: 'app-distribution-routes',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './distribution-routes.component.html',
  styleUrls: ['./distribution-routes.component.scss'],
})
export class DistributionRoutesComponent implements OnInit {
  private warehouseService = inject(WarehouseService);
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private notificationService = inject(NotificationService);
  private cashRegisterService = inject(CashRegisterService);
  private routeService = inject(DistributionRouteService);
  private fb = inject(FormBuilder);

  // Active view: 'dashboard' | 'load-stock' | 'route-sale' | 'liquidate'
  currentView = signal<'dashboard' | 'load-stock' | 'route-sale' | 'liquidate'>(
    'dashboard',
  );

  routes = signal<DistributionRoute[]>(this.loadRoutes());
  activeRoute = signal<DistributionRoute | null>(null);
  searchRouteTerm = signal<string>('');

  // Date Filter
  selectedDateLabel = signal<string>(formatDateInRD(new Date(), { dateStyle: 'full' }));

  // Modal: Nueva hoja de despacho
  isCreateRouteModalOpen = signal<boolean>(false);
  routeForm: FormGroup;

  // Screen 2: Cargar Mercancía
  loadOriginWarehouse = signal<string>('Almacén Principal');
  loadSearchTerm = signal<string>('');
  productsToLoad = signal<RouteLoadItem[]>([]);

  // Screen 3: Venta en Ruta
  selectedClient = signal<string>('Cliente General');
  salePaymentMethod = signal<'Efectivo' | 'Transferencia' | 'Crédito'>(
    'Efectivo',
  );
  saleSearchTerm = signal<string>('');
  truckProducts = signal<SaleProductOnTruck[]>([]);

  cart = computed<CartItem[]>(() => {
    return this.truckProducts()
      .filter((p) => p.inCart && p.quantity > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        quantity: p.quantity,
        price: p.price,
        subtotal: p.quantity * p.price,
      }));
  });

  cartSubtotal = computed(() => {
    return this.cart().reduce((sum, item) => sum + item.subtotal, 0);
  });

  // Screen 4: Liquidación de Ruta
  countedCash = signal<number>(0);
  destinationCashBox = signal<string>('Caja Principal');
  destinationReturnWarehouse = signal<string>('Almacén Principal');
  returnedQuantities = signal<{ [productId: number]: number }>({});

  // Computed KPIs
  readonly totalActiveTrucks = computed(() => {
    return this.routes().filter((r) => r.status === 'En reparto').length;
  });

  readonly totalLoadedToday = computed(() => {
    return this.routes().reduce((sum, r) => {
      const itemsSum = (r.items || []).reduce(
        (iSum, it) => iSum + (it.loadedQuantity || 0) * (it.unitPrice || 0),
        0,
      );
      return sum + itemsSum;
    }, 0);
  });

  readonly totalCollectedToday = computed(() => {
    return this.routes().reduce(
      (sum, r) =>
        sum +
        (r.totalCollectedCash || 0) +
        (r.totalCollectedTransfer || 0),
      0,
    );
  });

  readonly filteredRoutes = computed(() => {
    const term = this.searchRouteTerm().toLowerCase().trim();
    if (!term) return this.routes();
    return this.routes().filter(
      (r) =>
        r.routeName.toLowerCase().includes(term) ||
        r.coverageZone.toLowerCase().includes(term) ||
        r.driverName.toLowerCase().includes(term),
    );
  });

  readonly filteredTruckProducts = computed(() => {
    const term = this.saleSearchTerm().toLowerCase().trim();
    if (!term) return this.truckProducts();
    return this.truckProducts().filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term),
    );
  });

  readonly totalSelectedLoadUnits = computed(() => {
    return this.productsToLoad()
      .filter((p) => p.isSelected)
      .reduce((sum, p) => sum + (p.loadedQuantity || 0), 0);
  });

  readonly totalSelectedLoadItemsCount = computed(() => {
    return this.productsToLoad().filter((p) => p.isSelected).length;
  });

  constructor() {
    this.routeForm = this.fb.group({
      routeName: ['Ruta Este / San Pedro y La Romana', [Validators.required]],
      driverName: ['', Validators.required],
      vehiclePlate: ['', Validators.required],
      originWarehouse: ['Almacén Principal', Validators.required],
      plannedDate: ['2026-11-22', Validators.required],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.fetchRoutesFromBackend();
    await this.loadAvailableProducts();
    if (this.routes().length > 0 && !this.activeRoute()) {
      this.activeRoute.set(this.routes()[0]);
      this.updateTruckProductsFromActiveRoute();
    }
  }

  async loadAvailableProducts(): Promise<void> {
    try {
      const res = await this.productService.getPagedProducts(1, 50);
      if (res?.success && res.data?.items) {
        const items: RouteLoadItem[] = res.data.items.map((p: any) => ({
          productId: p.id,
          productCode: p.code || p.barCode || `PRD-${p.id}`,
          productName: p.name || p.description,
          loadedQuantity: 0,
          soldQuantity: 0,
          returnedQuantity: 0,
          unitPrice: p.price || 0,
          totalSoldAmount: 0,
          totalRemainingValue: 0,
          stockAvailable: p.currentStock || p.stock || 0,
          isSelected: false,
        }));
        this.productsToLoad.set(items);
      }
    } catch {}
  }

  updateTruckProductsFromActiveRoute(): void {
    const route = this.activeRoute();
    if (!route || !route.items || route.items.length === 0) {
      this.truckProducts.set([]);
      return;
    }
    this.truckProducts.set(
      route.items.map((it) => ({
        id: it.productId,
        name: it.productName,
        code: it.productCode,
        stock: Math.max(0, it.loadedQuantity - it.soldQuantity),
        price: it.unitPrice,
        quantity: 0,
        inCart: false,
      })),
    );
  }

  async fetchRoutesFromBackend(): Promise<void> {
    try {
      const res = await this.routeService.getRoutes();
      if (res.success && res.data && res.data.length > 0) {
        this.routes.set(res.data);
        if (
          !this.activeRoute() ||
          !res.data.some((r: any) => r.id === this.activeRoute()?.id)
        ) {
          this.activeRoute.set(res.data[0]);
          this.updateTruckProductsFromActiveRoute();
        }
      }
    } catch {}
  }

  private loadRoutes(): DistributionRoute[] {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_ROUTES);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  private saveRoutes(list: DistributionRoute[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_ROUTES, JSON.stringify(list));
    }
    this.routes.set(list);
  }

  selectRoute(route: DistributionRoute): void {
    this.activeRoute.set(route);
    this.updateTruckProductsFromActiveRoute();
  }

  // Navigation between sub-views
  openDashboard(): void {
    this.currentView.set('dashboard');
  }

  openLoadStockView(): void {
    this.currentView.set('load-stock');
  }

  openRouteSaleView(): void {
    this.updateTruckProductsFromActiveRoute();
    this.currentView.set('route-sale');
  }

  openLiquidateView(): void {
    if (this.activeRoute()) {
      const r = this.activeRoute()!;
      this.countedCash.set(r.totalCollectedCash || 0);
      const returned: { [productId: number]: number } = {};
      for (const item of r.items || []) {
        returned[item.productId] = Math.max(0, item.loadedQuantity - item.soldQuantity);
      }
      this.returnedQuantities.set(returned);
    } else {
      this.countedCash.set(0);
      this.returnedQuantities.set({});
    }
    this.currentView.set('liquidate');
  }

  getReturnedQuantity(item: RouteLoadItem): number {
    const val = this.returnedQuantities()[item.productId];
    return val !== undefined ? val : (item.loadedQuantity - item.soldQuantity);
  }

  setReturnedQuantity(item: RouteLoadItem, qty: number): void {
    const map = { ...this.returnedQuantities(), [item.productId]: qty };
    this.returnedQuantities.set(map);
  }

  // Modal: Nueva hoja de despacho
  openCreateRouteModal(): void {
    this.routeForm.reset({
      routeName: 'Ruta Este / San Pedro y La Romana',
      driverName: '',
      vehiclePlate: '',
      originWarehouse: 'Almacén Principal',
      plannedDate: '2026-11-22',
    });
    this.isCreateRouteModalOpen.set(true);
  }

  saveNewRoute(): void {
    if (this.routeForm.invalid) {
      this.routeForm.markAllAsTouched();
      return;
    }

    const val = this.routeForm.value;
    const newRoute: DistributionRoute = {
      id: Date.now(),
      routeCode: val.routeName.split('/')[0].trim() || 'Nueva Ruta',
      routeName: val.routeName,
      coverageZone: val.routeName.split('/')[1]?.trim() || val.routeName,
      driverName: val.driverName || 'Chofer Asignado',
      vehiclePlate: val.vehiclePlate || 'PLACA-001',
      vehicleName: 'Camión ' + (val.vehiclePlate || '01'),
      date: val.plannedDate,
      status: 'Cargando',
      originWarehouse: val.originWarehouse,
      items: [],
      totalCollectedCash: 0,
      totalCollectedTransfer: 0,
      totalCreditSales: 0,
    };

    const updated = [newRoute, ...this.routes()];
    this.saveRoutes(updated);
    this.activeRoute.set(newRoute);
    this.isCreateRouteModalOpen.set(false);
    this.notificationService.success(
      `Ruta ${newRoute.routeName} creada en borrador.`,
    );
    this.openLoadStockView();
  }

  // Load Stock Actions
  toggleAllLoadSelection(event: any): void {
    const checked = event.target.checked;
    this.productsToLoad.update((items) =>
      items.map((i) => ({ ...i, isSelected: checked })),
    );
  }

  updateLoadQuantity(item: RouteLoadItem, delta: number): void {
    const newQty = Math.max(1, (item.loadedQuantity || 0) + delta);
    this.productsToLoad.update((items) =>
      items.map((i) =>
        i.productId === item.productId
          ? {
              ...i,
              loadedQuantity: newQty,
              totalRemainingValue: newQty * i.unitPrice,
            }
          : i,
      ),
    );
  }

  confirmLoadToTruck(): void {
    const selected = this.productsToLoad().filter(
      (p) => p.isSelected && (p.loadedQuantity || 0) > 0,
    );
    if (this.activeRoute()) {
      const active = { ...this.activeRoute()! };
      active.items = selected;
      const updated = this.routes().map((r) =>
        r.id === active.id ? active : r,
      );
      this.saveRoutes(updated);
      this.activeRoute.set(active);
      this.updateTruckProductsFromActiveRoute();
    }
    this.notificationService.success(
      'Mercancía cargada exitosamente al vehículo.',
    );
    this.currentView.set('dashboard');
  }

  startRoute(): void {
    if (this.activeRoute()) {
      const active = this.activeRoute()!;
      active.status = 'En reparto';
      const updated = this.routes().map((r) =>
        r.id === active.id ? active : r,
      );
      this.saveRoutes(updated);
      this.notificationService.success(
        `Ruta ${active.routeName} iniciada. Camión en calle.`,
      );
    }
    this.currentView.set('dashboard');
  }

  // Route Sale Actions
  incrementTruckProductQty(product: SaleProductOnTruck): void {
    if (product.quantity < product.stock) {
      product.quantity++;
      product.inCart = true;
    }
  }

  decrementTruckProductQty(product: SaleProductOnTruck): void {
    if (product.quantity > 0) {
      product.quantity--;
      if (product.quantity === 0) {
        product.inCart = false;
      }
    }
  }

  addToCart(product: SaleProductOnTruck): void {
    if (product.quantity === 0) {
      product.quantity = 1;
    }
    product.inCart = true;
  }

  removeFromCart(itemId: number): void {
    const prod = this.truckProducts().find((p) => p.id === itemId);
    if (prod) {
      prod.quantity = 0;
      prod.inCart = false;
    }
  }

  clearCart(): void {
    this.truckProducts.update((list) =>
      list.map((p) => ({ ...p, quantity: 0, inCart: false })),
    );
  }

  confirmRouteSale(): void {
    const total = this.cartSubtotal();
    if (total <= 0) {
      this.notificationService.warning(
        'El carrito está vacío. Agrega productos para vender.',
      );
      return;
    }

    if (this.activeRoute()) {
      const r = this.activeRoute()!;
      if (this.salePaymentMethod() === 'Efectivo') {
        r.totalCollectedCash += total;
      } else if (this.salePaymentMethod() === 'Transferencia') {
        r.totalCollectedTransfer += total;
      } else {
        r.totalCreditSales += total;
      }
      const updated = this.routes().map((item) =>
        item.id === r.id ? r : item,
      );
      this.saveRoutes(updated);
    }

    this.notificationService.success(
      `Venta de RD$ ${total.toLocaleString()} registrada exitosamente.`,
    );
    this.clearCart();
    this.currentView.set('dashboard');
  }

  // Liquidate Actions
  confirmRouteLiquidation(): void {
    if (this.activeRoute()) {
      const r = this.activeRoute()!;
      r.status = 'Liquidada';
      const updated = this.routes().map((item) =>
        item.id === r.id ? r : item,
      );
      this.saveRoutes(updated);
      this.notificationService.success(
        `Ruta ${r.routeName} liquidada y cerrada exitosamente.`,
      );
    }
    this.currentView.set('dashboard');
  }
}
