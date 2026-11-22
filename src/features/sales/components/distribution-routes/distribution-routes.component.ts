import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { WarehouseService } from '../../../inventory/services/warehouse.service';
import { StockService } from '../../../inventory/services/stock.service';
import { ProductService } from '../../../products/services/product.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import type { ProductDto } from '../../../cuadreEnv/types/api';

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
  private fb = inject(FormBuilder);

  // Active view: 'dashboard' | 'load-stock' | 'route-sale' | 'liquidate'
  currentView = signal<'dashboard' | 'load-stock' | 'route-sale' | 'liquidate'>('dashboard');

  routes = signal<DistributionRoute[]>(this.loadRoutes());
  activeRoute = signal<DistributionRoute | null>(null);
  searchRouteTerm = signal<string>('');

  // Date Filter
  selectedDateLabel = signal<string>('Hoy, 16 de ene. de 2025');

  // Modal: Nueva hoja de despacho
  isCreateRouteModalOpen = signal<boolean>(false);
  routeForm: FormGroup;

  // Screen 2: Cargar Mercancía
  loadOriginWarehouse = signal<string>('Almacén Principal');
  loadSearchTerm = signal<string>('');
  productsToLoad = signal<RouteLoadItem[]>([
    {
      productId: 101,
      productCode: 'NES-001',
      productName: 'Nesquik',
      loadedQuantity: 10,
      soldQuantity: 0,
      returnedQuantity: 0,
      unitPrice: 250,
      totalSoldAmount: 0,
      totalRemainingValue: 2500,
      stockAvailable: 51,
      isSelected: true,
    },
    {
      productId: 102,
      productCode: 'COC-001',
      productName: 'Coca-Cola',
      loadedQuantity: 10,
      soldQuantity: 0,
      returnedQuantity: 0,
      unitPrice: 75,
      totalSoldAmount: 0,
      totalRemainingValue: 750,
      stockAvailable: 10,
      isSelected: true,
    },
  ]);

  // Screen 3: Venta en Ruta
  selectedClient = signal<string>('Colmado El Progreso');
  salePaymentMethod = signal<'Efectivo' | 'Transferencia' | 'Crédito'>('Efectivo');
  saleSearchTerm = signal<string>('');
  truckProducts = signal<SaleProductOnTruck[]>([
    { id: 1, name: 'Detergente', code: 'DET-001', stock: 18, price: 1650, quantity: 2, inCart: true },
    { id: 2, name: 'Aceite', code: 'ACE-001', stock: 25, price: 580, quantity: 1, inCart: true },
    { id: 3, name: 'Arroz (10 lb)', code: 'ARR-010', stock: 30, price: 890, quantity: 0, inCart: false },
    { id: 4, name: 'Azúcar (5 lb)', code: 'AZU-005', stock: 20, price: 320, quantity: 0, inCart: false },
    { id: 5, name: 'Leche (1 L)', code: 'LEC-001', stock: 15, price: 125, quantity: 0, inCart: false },
    { id: 6, name: 'Jabón de baño', code: 'JAB-001', stock: 22, price: 95, quantity: 0, inCart: false },
  ]);

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
  countedCash = signal<number>(42000);
  destinationCashBox = signal<string>('Caja #54');
  destinationReturnWarehouse = signal<string>('Almacén Principal');
  returnedQuantities = signal<{ [productId: number]: number }>({
    1: 6,
    2: 8,
    3: 5,
  });

  // Computed KPIs
  readonly totalActiveTrucks = computed(() => {
    return this.routes().filter((r) => r.status === 'En reparto').length;
  });

  readonly totalLoadedToday = computed(() => {
    return 79200;
  });

  readonly totalCollectedToday = computed(() => {
    return 60060;
  });

  readonly filteredRoutes = computed(() => {
    const term = this.searchRouteTerm().toLowerCase().trim();
    if (!term) return this.routes();
    return this.routes().filter(
      (r) =>
        r.routeName.toLowerCase().includes(term) ||
        r.coverageZone.toLowerCase().includes(term) ||
        r.driverName.toLowerCase().includes(term)
    );
  });

  readonly filteredTruckProducts = computed(() => {
    const term = this.saleSearchTerm().toLowerCase().trim();
    if (!term) return this.truckProducts();
    return this.truckProducts().filter(
      (p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
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

  ngOnInit(): void {
    if (this.routes().length > 0) {
      this.activeRoute.set(this.routes()[0]);
    }
  }

  private loadRoutes(): DistributionRoute[] {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_ROUTES);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return [
      {
        id: 1,
        routeCode: 'Ruta Sur',
        routeName: 'Ruta Sur',
        coverageZone: 'San Cristóbal y Baní',
        driverName: 'Euris Ramírez',
        vehiclePlate: 'L458920',
        vehicleName: 'Camión F-023',
        date: '16/01/2025',
        status: 'En reparto',
        originWarehouse: 'Almacén Principal',
        items: [
          {
            productId: 1,
            productCode: 'DET-001',
            productName: 'Detergente',
            loadedQuantity: 20,
            soldQuantity: 14,
            returnedQuantity: 6,
            unitPrice: 3850,
            totalSoldAmount: 53900,
            totalRemainingValue: 23100,
          },
          {
            productId: 2,
            productCode: 'ACE-001',
            productName: 'Aceite',
            loadedQuantity: 40,
            soldQuantity: 32,
            returnedQuantity: 8,
            unitPrice: 2320,
            totalSoldAmount: 74240,
            totalRemainingValue: 18560,
          },
          {
            productId: 3,
            productCode: 'ARR-010',
            productName: 'Arroz',
            loadedQuantity: 25,
            soldQuantity: 20,
            returnedQuantity: 5,
            unitPrice: 3680,
            totalSoldAmount: 73600,
            totalRemainingValue: 18400,
          },
        ],
        totalCollectedCash: 42000,
        totalCollectedTransfer: 18060,
        totalCreditSales: 0,
      },
      {
        id: 2,
        routeCode: 'Ruta Este',
        routeName: 'Ruta Este',
        coverageZone: 'San Pedro y La Romana',
        driverName: 'Carlos Méndez',
        vehiclePlate: 'L456789',
        vehicleName: 'Vehículo de Ruta 01',
        date: '16/01/2025',
        status: 'Cargando',
        originWarehouse: 'Almacén Principal',
        items: [],
        totalCollectedCash: 0,
        totalCollectedTransfer: 0,
        totalCreditSales: 0,
      },
    ];
  }

  private saveRoutes(list: DistributionRoute[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_ROUTES, JSON.stringify(list));
    }
    this.routes.set(list);
  }

  selectRoute(route: DistributionRoute): void {
    this.activeRoute.set(route);
  }

  // Navigation between sub-views
  openDashboard(): void {
    this.currentView.set('dashboard');
  }

  openLoadStockView(): void {
    this.currentView.set('load-stock');
  }

  openRouteSaleView(): void {
    this.currentView.set('route-sale');
  }

  openLiquidateView(): void {
    this.currentView.set('liquidate');
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
    this.notificationService.success(`Ruta ${newRoute.routeName} creada en borrador.`);
    this.openLoadStockView();
  }

  // Load Stock Actions
  toggleAllLoadSelection(event: any): void {
    const checked = event.target.checked;
    this.productsToLoad.update((items) =>
      items.map((i) => ({ ...i, isSelected: checked }))
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
          : i
      )
    );
  }

  confirmLoadToTruck(): void {
    this.notificationService.success('Mercancía cargada exitosamente al vehículo.');
    this.currentView.set('dashboard');
  }

  startRoute(): void {
    if (this.activeRoute()) {
      const active = this.activeRoute()!;
      active.status = 'En reparto';
      const updated = this.routes().map((r) => (r.id === active.id ? active : r));
      this.saveRoutes(updated);
      this.notificationService.success(`Ruta ${active.routeName} iniciada. Camión en calle.`);
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
      list.map((p) => ({ ...p, quantity: 0, inCart: false }))
    );
  }

  confirmRouteSale(): void {
    const total = this.cartSubtotal();
    if (total <= 0) {
      this.notificationService.warning('El carrito está vacío. Agrega productos para vender.');
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
      const updated = this.routes().map((item) => (item.id === r.id ? r : item));
      this.saveRoutes(updated);
    }

    this.notificationService.success(`Venta de RD$ ${total.toLocaleString()} registrada exitosamente.`);
    this.clearCart();
    this.currentView.set('dashboard');
  }

  // Liquidate Actions
  confirmRouteLiquidation(): void {
    if (this.activeRoute()) {
      const r = this.activeRoute()!;
      r.status = 'Liquidada';
      const updated = this.routes().map((item) => (item.id === r.id ? r : item));
      this.saveRoutes(updated);
      this.notificationService.success(`Ruta ${r.routeName} liquidada y cerrada exitosamente.`);
    }
    this.currentView.set('dashboard');
  }
}
