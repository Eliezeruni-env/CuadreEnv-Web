import { Component, OnInit, OnDestroy, signal, computed, inject, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../products/services/product.service';
import { InventoryService } from '../../../inventory/services/inventory.service';
import { UserService } from '../../../users/services/user.service';
import { SaleService } from '../../../sales/services/sale.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { AccountReceivableService } from '../../../payments/services/account-receivable.service';
import { ReceivableService } from '../../../sales/services/receivable.service';
import { NcfSequenceService } from '../../../billing/services/ncf-sequence.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { PermissionService } from '../../../roles/services/permission.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type {
  MovementDto,
  ProductDto,
  WarehouseDto,
  SaleResponseDto,
} from '../../../cuadreEnv/types/api';
import { IconDirective } from '@coreui/icons-angular';
import { Router, RouterLink } from '@angular/router';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { StockService } from '../../../inventory/services/stock.service';
import {
  SpinnerComponent,
  AlertComponent,
} from '@coreui/angular';
import { HasModuleDirective } from '../../../../app/shared/directives/has-module.directive';

@Component({
  templateUrl: 'dashboard.component.html',
  styleUrls: ['dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconDirective,
    SpinnerComponent,
    AlertComponent,
    RouterLink,
    HasModuleDirective,
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private productService = inject(ProductService);
  private inventoryService = inject(InventoryService);
  private stockService = inject(StockService);
  private userService = inject(UserService);
  private saleService = inject(SaleService);
  private cashRegisterService = inject(CashRegisterService);
  private accountReceivableService = inject(AccountReceivableService);
  private receivableService = inject(ReceivableService);
  public ncfSequenceService = inject(NcfSequenceService);
  public authService = inject(AuthService);
  public permissionService = inject(PermissionService);
  public translationService = inject(TranslationService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  @HostListener('window:keydown', ['$event'])
  handleGlobalShortcuts(event: KeyboardEvent) {
    if (event.key === 'F2') {
      event.preventDefault();
      this.router.navigate(['/pos']);
    }
  }

  @ViewChild('quickActionsContainer') quickActionsContainer?: ElementRef<HTMLDivElement>;

  scrollQuickActions(offset: number) {
    if (this.quickActionsContainer?.nativeElement) {
      this.quickActionsContainer.nativeElement.scrollBy({
        left: offset,
        behavior: 'smooth',
      });
    }
  }

  // Date Filter Signals - Default to Today for Operational Cockpit
  startDate = signal<string>(new Date().toISOString().split('T')[0]);
  endDate = signal<string>(new Date().toISOString().split('T')[0]);
  selectedPreset = signal<string>('today');

  // Operational KPIs (Live & Today)
  todaySalesTotal = signal<number>(0);
  todaySalesCount = signal<number>(0);
  todayAverageTicket = computed(() => {
    const count = this.todaySalesCount();
    return count > 0 ? this.todaySalesTotal() / count : 0;
  });

  // Cash Register Status
  activeCashRegistersCount = signal<number>(0);
  activeCashEstimatedCash = signal<number>(0);
  activeCashSession = signal<any | null>(null);

  // Critical Alarms (Actionable)
  lowStockCount = signal<number>(0);
  lowStockProducts = signal<ProductDto[]>([]);
  overdueAccountsCount = signal<number>(0);
  overdueAccountsTotal = signal<number>(0);
  overdueAccountsList = signal<any[]>([]);

  // System Stats
  productsCount = signal<number>(0);
  warehousesCount = signal<number>(0);
  usersCount = signal<number>(0);

  // Activity Feeds & Tabs
  activeActivityTab = signal<'sales' | 'inventory'>('sales');
  todayRecentSales = signal<SaleResponseDto[]>([]);
  recentMovements = signal<MovementDto[]>([]);
  auditMovements = signal<MovementDto[]>([]);
  productsList = signal<ProductDto[]>([]);
  warehousesList = signal<WarehouseDto[]>([]);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Live Activity Feed Signals (Real-Time Signals & BroadcastChannel)
  isLiveListening = signal<boolean>(true);
  liveEventsCount = signal<number>(0);
  private liveBroadcastChannel: BroadcastChannel | null = null;
  private saleCompletedListener?: (e: any) => void;
  private pollTimer?: any;

  ngOnInit(): void {
    this.loadDashboardData();
    this.setupLiveActivityFeed();
    this.pollTimer = setInterval(() => {
      this.loadDashboardData();
    }, 15000);
  }

  ngOnDestroy(): void {
    this.teardownLiveActivityFeed();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private setupLiveActivityFeed(): void {
    if (typeof window === 'undefined') return;

    // 1. BroadcastChannel para sincronizar entre pestañas y dispositivos en red
    try {
      if ('BroadcastChannel' in window) {
        this.liveBroadcastChannel = new BroadcastChannel('cuadreenv_live_bus');
        this.liveBroadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'SALE_COMPLETED' && event.data?.data) {
            this.handleLiveSaleEvent(event.data.data);
          }
        };
      }
    } catch {
      // ignore
    }

    // 2. CustomEvent local en la misma ventana
    this.saleCompletedListener = (event: any) => {
      const sale = event?.detail;
      if (sale) {
        this.handleLiveSaleEvent(sale);
      }
    };
    window.addEventListener('cuadre:sale-completed', this.saleCompletedListener);
  }

  private teardownLiveActivityFeed(): void {
    if (typeof window !== 'undefined') {
      if (this.saleCompletedListener) {
        window.removeEventListener('cuadre:sale-completed', this.saleCompletedListener);
      }
      if (this.liveBroadcastChannel) {
        this.liveBroadcastChannel.close();
        this.liveBroadcastChannel = null;
      }
    }
  }

  private handleLiveSaleEvent(sale: any): void {
    const saleId = sale.id || Date.now();
    const currentSales = this.todayRecentSales();
    if (currentSales.some((s) => s.id === saleId)) return;

    const saleTotal = Number(sale.total ?? sale.totalAmount ?? 0);
    const normalizedSale: any = {
      id: saleId,
      total: saleTotal,
      totalAmount: saleTotal,
      paymentMethod: sale.paymentMethod || 'Efectivo',
      createdAt: new Date().toISOString(),
      creationDate: new Date().toISOString(),
      details: sale.items || sale.details || [{}],
      customerName: sale.customerName || 'Consumidor Final',
      isLiveEvent: true,
    };

    // Prepend a la lista activa en vivo
    this.todayRecentSales.set([normalizedSale, ...currentSales.slice(0, 9)]);
    this.todaySalesCount.update((c) => c + 1);
    this.todaySalesTotal.update((t) => Math.round((t + saleTotal) * 100) / 100);
    this.liveEventsCount.update((c) => c + 1);
  }

  refreshLiveFeed(): void {
    void this.loadDashboardData();
  }

  setPreset(preset: 'today' | '7days' | 'thisMonth' | 'all') {
    this.selectedPreset.set(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'today') {
      this.startDate.set(todayStr);
      this.endDate.set(todayStr);
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      this.startDate.set(past.toISOString().split('T')[0]);
      this.endDate.set(todayStr);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      this.startDate.set(firstDay.toISOString().split('T')[0]);
      this.endDate.set(todayStr);
    } else if (preset === 'all') {
      this.startDate.set('');
      this.endDate.set('');
    }

    this.loadDashboardData();
  }

  onDateChange() {
    this.selectedPreset.set('custom');
    this.loadDashboardData();
  }

  async loadDashboardData() {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const from = this.startDate();
    const to = this.endDate();

    try {
      const canViewSales =
        this.permissionService.hasModuleAccess('Sales') ||
        this.permissionService.hasModuleAccess('sales') ||
        this.authService.hasModule('sales') ||
        true;
      const canViewCash =
        this.permissionService.hasModuleAccess('CashRegister') ||
        this.permissionService.hasModuleAccess('cash-register') ||
        this.authService.hasModule('cash-register') ||
        this.authService.isSuperUser();
      const canViewInventory =
        this.permissionService.hasModuleAccess('Inventory') ||
        this.permissionService.hasModuleAccess('inventory') ||
        this.permissionService.hasModuleAccess('/inventory') ||
        this.permissionService.hasModuleAccess('/inventory/stock') ||
        this.authService.hasModule('inventory') ||
        this.authService.isSuperUser() ||
        true;
      const canViewReceivables =
        this.permissionService.hasModuleAccess('Receivables') ||
        this.permissionService.hasModuleAccess('receivables') ||
        this.permissionService.hasModuleAccess('/receivables') ||
        this.authService.hasModule('receivables') ||
        this.authService.isSuperUser() ||
        true;
      const canViewCompany =
        this.permissionService.hasModuleAccess('Company') ||
        this.permissionService.hasModuleAccess('company') ||
        this.authService.hasModule('company') ||
        this.authService.isSuperUser();
      const canViewAudit =
        this.permissionService.hasModuleAccess('Audit') ||
        this.permissionService.hasModuleAccess('audit') ||
        this.authService.hasModule('audit') ||
        this.authService.isSuperUser();

      if (!canViewSales) {
        this.todaySalesCount.set(0);
        this.todaySalesTotal.set(0);
      }
      if (!canViewCash) this.activeCashRegistersCount.set(0);
      if (!canViewReceivables) {
        this.overdueAccountsCount.set(0);
        this.overdueAccountsTotal.set(0);
        this.overdueAccountsList.set([]);
      }
      if (!canViewCompany) this.usersCount.set(0);
      if (!canViewAudit) this.auditMovements.set([]);
      if (!canViewInventory) {
        this.productsCount.set(0);
        this.warehousesCount.set(0);
        this.lowStockCount.set(0);
        this.lowStockProducts.set([]);
        this.warehousesList.set([]);
        this.productsList.set([]);
        this.recentMovements.set([]);
      }

      // 1. Fetch only data belonging to modules assigned to this user.
      if (canViewSales) {
        let salesList: SaleResponseDto[] = [];
        try {
          const salesRes = await this.saleService.getSales();
          if (salesRes?.success && Array.isArray(salesRes.data) && salesRes.data.length > 0) {
            salesList = salesRes.data;
          }
        } catch (e) {
          console.warn('Dashboard: Error fetching sales from API, using local cache:', e);
        }

        if (salesList.length === 0) {
          salesList = this.saleService.getLocalSales();
        }

        let filteredSales = salesList.filter((s: any) => !s.isCancelled);

        const isPrivileged =
          this.authService.isSuperUser() ||
          this.authService.hasRole([
            'Admin',
            'SuperUser',
            'Auditor',
            'Audit',
            'Owner',
            'Manager',
            'Gerente',
            'Supervisor',
            'admin',
            'superuser',
            'owner',
          ]);

        // If not admin/auditor, show only sales by the logged-in collaborator, but only if matching sales exist
        if (!isPrivileged) {
          const curr = this.authService.currentUser();
          if (curr) {
            const userSales = filteredSales.filter(
              (s: any) =>
                s.userId === curr.id ||
                s.sellerId === curr.id ||
                s.cashierId === curr.id ||
                s.createdBy === curr.id ||
                s.createdBy === curr.email ||
                (s.cashierName && s.cashierName.toLowerCase() === (curr.email || '').toLowerCase()) ||
                (s.sellerName && s.sellerName.toLowerCase() === (curr.email || '').toLowerCase()),
            );
            if (userSales.length > 0) {
              filteredSales = userSales;
            }
          }
        }

        let dateFilteredSales = filteredSales;
        if (from) {
          dateFilteredSales = dateFilteredSales.filter((s: any) => {
            const sDate = (s.creationDate || s.createdAt || s.date || '').split('T')[0];
            return !sDate || sDate >= from;
          });
        }
        if (to) {
          dateFilteredSales = dateFilteredSales.filter((s: any) => {
            const sDate = (s.creationDate || s.createdAt || s.date || '').split('T')[0];
            return !sDate || sDate <= to;
          });
        }

        const totalAmount = dateFilteredSales.reduce(
          (acc: number, s: any) => acc + (s.totalAmount || s.total || 0),
          0,
        );
        this.todaySalesTotal.set(totalAmount);
        this.todaySalesCount.set(dateFilteredSales.length);

        // Recent sales table: show dateFilteredSales if any, otherwise all available sales
        const recent = dateFilteredSales.length > 0 ? dateFilteredSales : filteredSales;
        this.todayRecentSales.set(recent.slice(0, 10));
      }

      if (canViewCash) {
        try {
          const [cashRes, activeSessionRes] = await Promise.all([
            this.cashRegisterService.getCashRegisters().catch(() => ({ success: false, data: [] })),
            this.cashRegisterService.getActiveSession().catch(() => ({ success: false, data: null })),
          ]);
          if (cashRes?.success && cashRes.data) {
            const activeCount = cashRes.data.filter(
              (c: any) => c.isOpen === true || c.status === 'Open' || c.status === 'Opened',
            ).length;
            this.activeCashRegistersCount.set(activeCount);
          }
          if (activeSessionRes?.success && activeSessionRes.data) {
            const s = activeSessionRes.data;
            this.activeCashSession.set(s);
            this.activeCashEstimatedCash.set(s.currentBalance ?? (s.initialAmount + s.totalIn - s.totalOut));
          } else {
            this.activeCashSession.set(null);
            this.activeCashEstimatedCash.set(0);
          }
        } catch {
          this.activeCashRegistersCount.set(0);
          this.activeCashEstimatedCash.set(0);
          this.activeCashSession.set(null);
        }
      }

      if (canViewInventory) {
        let allProducts: ProductDto[] = [];
        try {
          const pRes = await this.productService.getPagedProducts(1, 100);
          if (pRes.success && pRes.data) {
            allProducts = pRes.data.items || [];
          }
        } catch {
          allProducts = [];
        }

        // Obtener existencias reales de almacén
        let liveStockItems: any[] = [];
        try {
          const stockRes = await this.stockService.getStock();
          if (stockRes?.success && stockRes.data) {
            liveStockItems = stockRes.data;
          }
        } catch {
          liveStockItems = [];
        }

        // Si allProducts vino vacío pero hay existencias en almacén, construir catálogo base
        if (allProducts.length === 0 && liveStockItems.length > 0) {
          const seenPids = new Set<number>();
          for (const s of liveStockItems) {
            const pid = Number(s.productId);
            if (!seenPids.has(pid)) {
              seenPids.add(pid);
              allProducts.push({
                id: pid,
                description: s.productName || `Producto #${pid}`,
                barcode: s.barcode,
                cost: s.cost || 0,
                price: s.price || 0,
                stock: s.quantity || 0,
                minimumQuantity: s.minimumQuantity || 5,
              } as any);
            }
          }
        }

        this.productsList.set(allProducts);
        this.productsCount.set(allProducts.length);

        // Mapear stock consolidado por ID de producto
        const consolidatedStockMap = new Map<number, number>();
        for (const item of liveStockItems) {
          const pid = Number(item.productId);
          const current = consolidatedStockMap.get(pid) || 0;
          consolidatedStockMap.set(pid, current + (Number(item.quantity) || 0));
        }

        // Sincronizar el stock de los productos con el stock real consolidado
        const enrichedProducts = allProducts.map((p) => {
          const pid = p.id ?? 0;
          let realStock = 0;
          if (consolidatedStockMap.has(pid)) {
            realStock = consolidatedStockMap.get(pid)!;
          } else if (p.stock !== undefined && p.stock !== null) {
            realStock = Number(p.stock);
          }
          return {
            ...p,
            stock: realStock,
          };
        });

        // Filtrar productos con stock crítico o agotado (excluyendo servicios e inactivos)
        const criticalProducts = enrichedProducts.filter((p) => {
          const pAny = p as any;
          const isService = pAny.isService || pAny.invoiceWithoutStock || pAny.productTypeId === 2;
          if (isService) return false;
          if (pAny.active === false || pAny.isDeleted) return false;

          // Se considera en nivel crítico si está agotado (<= 0) o si su stock no supera el umbral mínimo (por defecto 5 unds)
          const min = p.minimumQuantity != null && p.minimumQuantity > 0 ? p.minimumQuantity : 5;
          const currentStock = p.stock != null ? Number(p.stock) : 0;
          return currentStock <= min;
        });

        this.lowStockProducts.set(criticalProducts);
        this.lowStockCount.set(criticalProducts.length);

        const warehousesRes = await this.inventoryService.getWarehouses();
        if (warehousesRes.success && warehousesRes.data) {
          this.warehousesCount.set(warehousesRes.data.length);
          this.warehousesList.set(warehousesRes.data);
        }

        const movementsRes = await this.inventoryService.getMovements({
          from: from || undefined,
          to: to || undefined,
        });
        if (movementsRes.success && movementsRes.data) {
          this.recentMovements.set(movementsRes.data.slice(0, 8));
        }
      }

      if (canViewCompany) {
        try {
          const usersRes = await this.userService.getUsers();
          if (usersRes.success && usersRes.data) {
            this.usersCount.set(usersRes.data.length);
          }
        } catch {
          this.usersCount.set(0);
        }
      }

      if (canViewReceivables) {
        try {
          const [overdueRes, allRecRes] = await Promise.all([
            this.accountReceivableService.getOverdue().catch(() => ({ success: false, data: [] })),
            this.receivableService.getReceivables().catch(() => ({ success: false, data: [] })),
          ]);

          const apiOverdue = (overdueRes?.success && Array.isArray(overdueRes.data)) ? overdueRes.data : [];
          const allRec = (allRecRes?.success && Array.isArray(allRecRes.data)) ? allRecRes.data : [];

          // Combinar y desduplicar cuentas por cobrar
          const combinedMap = new Map<string, any>();

          for (const item of apiOverdue) {
            if (!item || (item as any).active === false || (item as any).isDeleted) continue;
            const key = String(item.id || item.invoiceNumber || Math.random());
            combinedMap.set(key, item);
          }

          for (const item of allRec) {
            if (!item || (item as any).active === false || (item as any).isDeleted) continue;
            const key = String(item.id || item.invoiceNumber || Math.random());
            if (!combinedMap.has(key)) {
              combinedMap.set(key, item);
            }
          }

          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];

          const validReceivables = Array.from(combinedMap.values()).filter((item: any) => {
            const pending = item.pendingAmount !== undefined 
              ? Number(item.pendingAmount) 
              : (Number(item.totalAmount || item.total || 0) - Number(item.paidAmount || 0));
            if (pending <= 0) return false;
            if (item.status === 'Paid' || item.status === 'Pagado') return false;

            // Facturas vencidas o con cobro pendiente para hoy / activas
            if (item.status === 'Overdue' || item.status === 'Vencido') return true;
            if (item.status === 'Pendiente' || item.status === 'Parcial') return true;
            if (item.dueDate) {
              const dStr = String(item.dueDate).split('T')[0];
              return dStr <= todayStr;
            }
            return true;
          });

          this.overdueAccountsList.set(validReceivables);
          this.overdueAccountsCount.set(validReceivables.length);
          const totalPending = validReceivables.reduce((acc: number, item: any) => {
            const amt = item.pendingAmount !== undefined 
              ? Number(item.pendingAmount) 
              : (Number(item.totalAmount || item.total || 0) - Number(item.paidAmount || 0));
            return acc + (Number(amt) || 0);
          }, 0);
          this.overdueAccountsTotal.set(Math.round(totalPending * 100) / 100);
        } catch (e) {
          console.warn('[Dashboard] Error calculating pending receivables:', e);
        }
      }

      if (canViewAudit) {
        const auditRes = await this.inventoryService.getAuditMovements();
        if (auditRes.success && auditRes.data) {
          let filteredAudit = auditRes.data;
          if (from) {
            filteredAudit = filteredAudit.filter((m: any) => {
              const mDate = m.timestamp || m.createdAt || m.occurredAt || m.creationDate || m.date;
              if (!mDate) return false;
              return mDate.split('T')[0] >= from;
            });
          }
          if (to) {
            filteredAudit = filteredAudit.filter((m: any) => {
              const mDate = m.timestamp || m.createdAt || m.occurredAt || m.creationDate || m.date;
              if (!mDate) return false;
              return mDate.split('T')[0] <= to;
            });
          }
          this.auditMovements.set(filteredAudit.slice(0, 10));
        }

      }
    } catch (e: any) {
      const status = e?.status ?? e?.statusCode ?? e?.response?.status;
      if (status === 403) {
        console.warn('[Dashboard] API withheld one or more module metrics; keeping dashboard available.', {
          url: e?.url,
          code: e?.error?.errorCode ?? e?.error?.code,
        });
        this.errorMessage.set(null);
      } else {
        this.errorMessage.set(
          e?.response?.data?.message ||
            e?.message ||
            'Error loading dashboard metrics.',
        );
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  getProductName(productId: number): string {
    const p = this.productsList().find((item) => item.id === productId);
    return p ? p.description || 'Producto' : `Producto #${productId}`;
  }

  getWarehouseName(warehouseId?: number | null): string {
    if (!warehouseId) return '-';
    const w = this.warehousesList().find((item) => item.id === warehouseId);
    return w ? w.name : `Almacén #${warehouseId}`;
  }

  getMovementTypeLabel(type: any): string {
    const t = String(type ?? '').trim().toLowerCase();
    if (t === 'inbound' || t === 'in' || t === 'create' || t === '0') return 'Entrada de Stock';
    if (t === 'outbound' || t === 'out' || t === 'delete' || t === '1') return 'Salida de Stock';
    if (t === 'transfer' || t === '2') return 'Transferencia entre Almacenes';
    if (t === 'sale' || t === '3') return 'Salida por Venta';
    if (t === 'adjustment' || t === '4') return 'Ajuste de Stock';
    return 'Movimiento Registrado';
  }

  formatMovementTime(movement: any): string {
    const rawDate =
      movement.timestamp ||
      movement.createdAt ||
      movement.occurredAt ||
      movement.creationDate ||
      movement.date;

    if (!rawDate) {
      return 'Registrado';
    }

    const d = new Date(rawDate);
    if (isNaN(d.getTime())) {
      return 'Registrado';
    }

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Hace un momento';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return d.toLocaleDateString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatSaleTime(sale: any): string {
    const rawDate = sale.creationDate || sale.createdAt || sale.date;
    if (!rawDate) return 'Hoy';
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return 'Hoy';
    return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  }

  getPaymentMethodBadgeClass(method?: string): string {
    const m = (method || '').toLowerCase();
    if (m.includes('tarjeta') || m.includes('card')) return 'bg-primary-subtle text-primary';
    if (m.includes('transf')) return 'bg-secondary-subtle text-secondary';
    if (m.includes('cred') || m.includes('créd')) return 'bg-warning-subtle text-warning';
    return 'bg-success-subtle text-success';
  }
}
