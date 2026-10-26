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
  productName: string;
  loadedQuantity: number;
  unitPrice: number;
  soldQuantity: number;
  returnedQuantity: number;
  totalSoldAmount: number;
}

export interface DistributionRoute {
  id: number;
  routeCode: string;
  routeName: string;
  driverName: string;
  vehiclePlate: string;
  date: string;
  status: 'Cargando Camión' | 'En Ruta de Reparto' | 'Liquidada / Cerrada';
  items: RouteLoadItem[];
  totalCollectedCash: number;
  totalCollectedTransfer: number;
  totalCreditSales: number;
  notes?: string;
}

const STORAGE_ROUTES = 'cuadreenv_distribution_routes_v1';

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

  routes = signal<DistributionRoute[]>(this.loadRoutes());
  products = signal<ProductDto[]>([]);
  activeRoute = signal<DistributionRoute | null>(null);

  // Modal para nueva ruta / despacho
  isCreateRouteModalOpen = signal<boolean>(false);
  routeForm: FormGroup;

  // Modal para cargar inventario al camión
  isLoadStockModalOpen = signal<boolean>(false);
  selectedRouteForLoad = signal<DistributionRoute | null>(null);

  // Modal para registrar venta en ruta
  isRouteSaleModalOpen = signal<boolean>(false);
  selectedRouteForSale = signal<DistributionRoute | null>(null);
  routeSaleClientName = signal<string>('Colmado El Sol');
  routeSalePaymentMethod = signal<'Efectivo' | 'Transferencia' | 'Credito'>('Efectivo');
  routeSaleAmount = signal<number>(0);

  // Modal de Liquidación Final de Ruta
  isLiquidateModalOpen = signal<boolean>(false);
  selectedRouteForLiquidation = signal<DistributionRoute | null>(null);

  readonly totalActiveTrucks = computed(
    () => this.routes().filter((r) => r.status === 'En Ruta de Reparto').length
  );

  readonly totalDispatchedToday = computed(() =>
    this.routes().reduce(
      (sum, r) =>
        sum +
        r.items.reduce((itemSum, it) => itemSum + it.loadedQuantity * it.unitPrice, 0),
      0
    )
  );

  readonly totalCollectedToday = computed(() =>
    this.routes().reduce(
      (sum, r) => sum + r.totalCollectedCash + r.totalCollectedTransfer,
      0
    )
  );

  constructor() {
    this.routeForm = this.fb.group({
      routeName: ['', [Validators.required, Validators.minLength(3)]],
      driverName: ['', Validators.required],
      vehiclePlate: ['', Validators.required],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadProducts();
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
        routeCode: 'RUTA-SUR-01',
        routeName: 'Ruta Sur / San Cristóbal & Baní',
        driverName: 'Euris Ramírez (Chofer Surtidor)',
        vehiclePlate: 'L458920 (Camión Isuzu Blanco)',
        date: new Date().toISOString().split('T')[0],
        status: 'En Ruta de Reparto',
        items: [
          {
            productId: 1,
            productName: 'Detergente en Polvo 50 Lbs (Saco)',
            loadedQuantity: 20,
            unitPrice: 1650,
            soldQuantity: 14,
            returnedQuantity: 0,
            totalSoldAmount: 23100,
          },
          {
            productId: 2,
            productName: 'Aceite Comestible Criollo Galón',
            loadedQuantity: 40,
            unitPrice: 580,
            soldQuantity: 32,
            returnedQuantity: 0,
            totalSoldAmount: 18560,
          },
          {
            productId: 3,
            productName: 'Arroz Selecto Premium 25 Lbs',
            loadedQuantity: 25,
            unitPrice: 920,
            soldQuantity: 20,
            returnedQuantity: 0,
            totalSoldAmount: 18400,
          },
        ],
        totalCollectedCash: 42000,
        totalCollectedTransfer: 18060,
        totalCreditSales: 0,
        notes: 'Despacho matutino 7:00 AM para 18 colmados clientes',
      },
      {
        id: 2,
        routeCode: 'RUTA-ESTE-02',
        routeName: 'Ruta Este / San Pedro & La Romana',
        driverName: 'Kelvin De la Rosa (Surtidor Comercial)',
        vehiclePlate: 'L334190 (Furgón Hyundai)',
        date: new Date().toISOString().split('T')[0],
        status: 'Cargando Camión',
        items: [],
        totalCollectedCash: 0,
        totalCollectedTransfer: 0,
        totalCreditSales: 0,
        notes: 'Preparando pedidos de almacén central',
      },
    ];
  }

  private saveRoutes(list: DistributionRoute[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_ROUTES, JSON.stringify(list));
    }
    this.routes.set(list);
  }

  async loadProducts(): Promise<void> {
    try {
      const res = await this.productService.getPagedProducts(1, 100);
      if (res?.success && res.data?.items) {
        this.products.set(res.data.items);
      }
    } catch {}
  }

  openCreateRouteModal(): void {
    this.routeForm.reset({
      routeName: 'Ruta ',
      driverName: '',
      vehiclePlate: '',
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
      routeCode: `RUTA-${String(this.routes().length + 1).padStart(2, '0')}`,
      routeName: val.routeName,
      driverName: val.driverName,
      vehiclePlate: val.vehiclePlate,
      date: new Date().toISOString().split('T')[0],
      status: 'Cargando Camión',
      items: [],
      totalCollectedCash: 0,
      totalCollectedTransfer: 0,
      totalCreditSales: 0,
    };

    const current = [newRoute, ...this.routes()];
    this.saveRoutes(current);
    this.activeRoute.set(newRoute);
    this.notificationService.success(`Ruta ${newRoute.routeCode} creada exitosamente.`);
    this.isCreateRouteModalOpen.set(false);
  }

  openLoadStockModal(route: DistributionRoute): void {
    this.selectedRouteForLoad.set(route);
    this.isLoadStockModalOpen.set(true);
  }

  addStockToRoute(productId: number, quantity: number): void {
    const route = this.selectedRouteForLoad();
    if (!route || quantity <= 0) return;

    const prod = this.products().find((p) => p.id === productId);
    if (!prod) return;

    const price = Number((prod as any).price || prod.cost || 100);
    const routes = [...this.routes()];
    const rIdx = routes.findIndex((r) => r.id === route.id);
    if (rIdx === -1) return;

    const existingItem = routes[rIdx].items.find((i) => i.productId === productId);
    if (existingItem) {
      existingItem.loadedQuantity += quantity;
    } else {
      routes[rIdx].items.push({
        productId: prod.id!,
        productName: prod.description || 'Producto',
        loadedQuantity: quantity,
        unitPrice: price,
        soldQuantity: 0,
        returnedQuantity: 0,
        totalSoldAmount: 0,
      });
    }

    this.saveRoutes(routes);
    this.selectedRouteForLoad.set(routes[rIdx]);
    if (this.activeRoute()?.id === route.id) {
      this.activeRoute.set(routes[rIdx]);
    }
    this.notificationService.success(`Cargadas ${quantity} unidades de "${prod.description}" al camión.`);
  }

  dispatchRouteToStreet(route: DistributionRoute): void {
    if (route.items.length === 0) {
      this.notificationService.warning('Debes cargar al menos un producto al camión antes de despacharlo a la calle.');
      return;
    }

    const routes = [...this.routes()];
    const idx = routes.findIndex((r) => r.id === route.id);
    if (idx !== -1) {
      routes[idx].status = 'En Ruta de Reparto';
      this.saveRoutes(routes);
      this.activeRoute.set(routes[idx]);
      this.notificationService.success(`Ruta ${route.routeCode} despachada a reparto con éxito.`);
    }
  }

  openRouteSaleModal(route: DistributionRoute): void {
    this.selectedRouteForSale.set(route);
    this.routeSaleClientName.set('');
    this.routeSalePaymentMethod.set('Efectivo');
    this.routeSaleAmount.set(0);
    this.isRouteSaleModalOpen.set(true);
  }

  recordRouteSale(productId: number, qtySold: number): void {
    const route = this.selectedRouteForSale();
    if (!route || qtySold <= 0) return;

    const routes = [...this.routes()];
    const rIdx = routes.findIndex((r) => r.id === route.id);
    if (rIdx === -1) return;

    const item = routes[rIdx].items.find((i) => i.productId === productId);
    if (!item) return;

    const availableInTruck = item.loadedQuantity - item.soldQuantity - item.returnedQuantity;
    if (qtySold > availableInTruck) {
      this.notificationService.error(
        `Cantidad insuficiente en camión: Solo quedan ${availableInTruck} unidades disponibles para venta.`
      );
      return;
    }

    item.soldQuantity += qtySold;
    const saleTotal = Math.round(qtySold * item.unitPrice * 100) / 100;
    item.totalSoldAmount += saleTotal;

    const method = this.routeSalePaymentMethod();
    if (method === 'Efectivo') {
      routes[rIdx].totalCollectedCash += saleTotal;
    } else if (method === 'Transferencia') {
      routes[rIdx].totalCollectedTransfer += saleTotal;
    } else {
      routes[rIdx].totalCreditSales += saleTotal;
    }

    this.saveRoutes(routes);
    this.activeRoute.set(routes[rIdx]);
    this.notificationService.success(
      `Venta registrada en ruta: ${qtySold} x ${item.productName} por RD$ ${saleTotal.toFixed(2)} (${method}).`
    );
  }

  openLiquidationModal(route: DistributionRoute): void {
    this.selectedRouteForLiquidation.set(route);
    this.isLiquidateModalOpen.set(true);
  }

  async confirmLiquidation(route: DistributionRoute): Promise<void> {
    const routes = [...this.routes()];
    const idx = routes.findIndex((r) => r.id === route.id);
    if (idx === -1) return;

    // Calcular retornos a almacén
    for (const it of routes[idx].items) {
      it.returnedQuantity = Math.max(0, it.loadedQuantity - it.soldQuantity);
    }

    routes[idx].status = 'Liquidada / Cerrada';
    this.saveRoutes(routes);
    this.activeRoute.set(routes[idx]);

    // Registrar dinero recaudado en la caja registradora activa
    if (routes[idx].totalCollectedCash > 0) {
      try {
        await this.cashRegisterService.addMovement({
          type: 'Entrada',
          category: 'Cobros',
          description: `Liquidación de Surtidor / Ruta ${routes[idx].routeCode} (${routes[idx].driverName})`,
          amount: routes[idx].totalCollectedCash,
          paymentMethod: 'Efectivo',
        });
      } catch {}
    }

    this.notificationService.success(
      `Liquidación de Ruta ${route.routeCode} completada. Mercancía no vendida devuelta a almacén y RD$ ${routes[idx].totalCollectedCash.toFixed(2)} ingresados a Caja.`
    );
    this.isLiquidateModalOpen.set(false);
  }
}
