import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ModuleAccessService } from '../../../features/cuadreEnv/services/module-access.service';
import { AuthService } from '../../../features/cuadreEnv/services/auth.service';
import { CustomerService } from '../../../features/customers/services/customer.service';
import type { CustomerDto } from '../../../features/cuadreEnv/types/api';

export interface CommandItem {
  id: string;
  title: string;
  category: 'Acciones Rápidas' | 'Módulos y Operaciones' | 'Inventario y Almacén' | 'Administración y Configuración' | 'Directorio de Clientes';
  icon: string;
  badge?: string;
  route?: string;
  action?: () => void;
  keywords?: string[];
  requiredModule?: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './command-palette.component.html',
  styleUrls: ['./command-palette.component.scss'],
})
export class CommandPaletteComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private moduleAccess = inject(ModuleAccessService);
  private authService = inject(AuthService);
  private customerService = inject(CustomerService);

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  isOpen = signal<boolean>(false);
  query = signal<string>('');
  selectedIndex = signal<number>(0);
  customers = signal<CustomerDto[]>([]);
  private isCustomersLoaded = false;

  private readonly allCommands: CommandItem[] = [
    // Acciones Rápidas
    {
      id: 'act-quick-pos',
      title: 'Venta Rápida POS (Atajos F2/F4/Enter)',
      category: 'Acciones Rápidas',
      icon: '⚡',
      badge: 'Cajero Rápido',
      route: '/sales/quick',
      keywords: ['vender rapido', 'pos express', 'cajero', 'f4', 'f2'],
      requiredModule: 'sales',
    },
    {
      id: 'act-sale',
      title: 'Libro de Ventas y Comprobantes',
      category: 'Acciones Rápidas',
      icon: '🛒',
      badge: 'Ventas',
      route: '/sales',
      keywords: ['vender', 'pos', 'cobrar', 'factura', 'caja', 'ticket'],
      requiredModule: 'sales',
    },
    {
      id: 'act-cash',
      title: 'Control de Caja y Turnos',
      category: 'Acciones Rápidas',
      icon: '💵',
      badge: 'Caja',
      route: '/cash-register',
      keywords: ['abrir caja', 'cerrar caja', 'cuadre', 'arqueo', 'efectivo'],
      requiredModule: 'cash-register',
    },
    {
      id: 'act-product-create',
      title: 'Nuevo Producto al Catálogo',
      category: 'Acciones Rápidas',
      icon: '📦',
      route: '/products',
      keywords: ['crear producto', 'articulo', 'item', 'precio', 'inventario'],
      requiredModule: 'products',
    },
    {
      id: 'act-purchase',
      title: 'Registrar Entrada / Orden de Compra',
      category: 'Acciones Rápidas',
      icon: '🚚',
      route: '/purchases',
      keywords: ['comprar', 'proveedor', 'factura suplidor', 'reposicion'],
      requiredModule: 'purchases-orders',
    },
    {
      id: 'act-customer',
      title: 'Registrar Nuevo Cliente',
      category: 'Acciones Rápidas',
      icon: '👤',
      route: '/customers',
      keywords: ['crear cliente', 'rnc', 'cedula', 'cuenta'],
      requiredModule: 'customers',
    },

    // Módulos y Operaciones
    {
      id: 'mod-dashboard',
      title: 'Dashboard / Tablero Principal',
      category: 'Módulos y Operaciones',
      icon: '📊',
      route: '/dashboard',
      keywords: ['inicio', 'home', 'resumen', 'kpi'],
      requiredModule: 'dashboard',
    },
    {
      id: 'mod-sales',
      title: 'Libro de Ventas',
      category: 'Módulos y Operaciones',
      icon: '🛍️',
      route: '/sales',
      keywords: ['ventas', 'historial de ventas', 'facturas emitidas'],
      requiredModule: 'sales',
    },
    {
      id: 'mod-billing',
      title: 'Facturación e Historial de Ventas',
      category: 'Módulos y Operaciones',
      icon: '📑',
      route: '/billing',
      keywords: ['factura', 'ventas', 'historial', 'cobros'],
      requiredModule: 'billing',
    },
    {
      id: 'mod-receivables',
      title: 'Cobros y Cuentas por Cobrar',
      category: 'Módulos y Operaciones',
      icon: '💰',
      route: '/receivables',
      keywords: ['credito', 'deuda', 'apartado', 'abono'],
      requiredModule: 'receivables',
    },
    {
      id: 'mod-credit-notes',
      title: 'Notas de Crédito y Devoluciones',
      category: 'Módulos y Operaciones',
      icon: '🧾',
      route: '/credit-notes',
      keywords: ['devolucion', 'nota de credito', 'reembolso'],
      requiredModule: 'credit-notes',
    },
    {
      id: 'mod-fraud',
      title: 'El Guardián Antirrobo (Auditoría Forense)',
      category: 'Módulos y Operaciones',
      icon: '🛡️',
      badge: 'Seguridad',
      route: '/cash-register/fraud-guardian',
      keywords: ['antirrobo', 'auditoria', 'riesgo', 'cajero', 'prevencion perdidas'],
      requiredModule: 'fraud-guardian',
    },
    {
      id: 'mod-metrics',
      title: 'Métricas Globales y Analítica',
      category: 'Módulos y Operaciones',
      icon: '📈',
      route: '/metrics',
      keywords: ['metricas', 'graficos', 'estadisticas', 'reportes'],
      requiredModule: 'metrics',
    },

    // Inventario y Almacén
    {
      id: 'inv-products',
      title: 'Catálogo de Productos',
      category: 'Inventario y Almacén',
      icon: '🏷️',
      route: '/products',
      keywords: ['articulos', 'precios', 'stock', 'barras'],
      requiredModule: 'products',
    },
    {
      id: 'inv-settings',
      title: 'Categorías y Tipos de Producto',
      category: 'Inventario y Almacén',
      icon: '⚙️',
      route: '/products/settings',
      keywords: ['categorias', 'clasificacion', 'marcas', 'familias'],
      requiredModule: 'products-settings',
    },
    {
      id: 'inv-stock',
      title: 'Consulta de Existencias y Stock',
      category: 'Inventario y Almacén',
      icon: '🏢',
      route: '/inventory/stock',
      keywords: ['stock actual', 'disponible', 'almacen', 'existencias'],
      requiredModule: 'inventory-stock',
    },
    {
      id: 'pur-receipts',
      title: 'Recepciones de Mercancía',
      category: 'Inventario y Almacén',
      icon: '📋',
      route: '/purchases/receipts',
      keywords: ['recepcion', 'recibir mercancia', 'albaran', 'orden de compra', 'conduce'],
      requiredModule: 'purchases-receipts',
    },
    {
      id: 'inv-entries',
      title: 'Entradas de Almacén',
      category: 'Inventario y Almacén',
      icon: '📥',
      route: '/inventory/entries',
      keywords: ['ingreso', 'entrada mercancia', 'suministro'],
      requiredModule: 'inventory-entries',
    },
    {
      id: 'inv-outlets',
      title: 'Salidas de Almacén',
      category: 'Inventario y Almacén',
      icon: '📤',
      route: '/inventory/outlets',
      keywords: ['despacho', 'salida mercancia', 'merma', 'consumo interno'],
      requiredModule: 'inventory-outlets',
    },
    {
      id: 'inv-transfers',
      title: 'Transferencias entre Almacenes',
      category: 'Inventario y Almacén',
      icon: '🔄',
      route: '/inventory/transfers',
      keywords: ['traspaso', 'mover stock', 'sucursales'],
      requiredModule: 'inventory-transfers',
    },
    {
      id: 'inv-warehouses',
      title: 'Gestión de Almacenes & Depósitos',
      category: 'Inventario y Almacén',
      icon: '🏬',
      route: '/inventory/warehouses',
      keywords: ['crear almacen', 'depositos', 'bodega'],
      requiredModule: 'inventory-warehouses',
    },
    {
      id: 'inv-requests',
      title: 'Autorizaciones de Stock (Solicitudes)',
      category: 'Inventario y Almacén',
      icon: '✍️',
      route: '/inventory/manage-requests',
      keywords: ['solicitud de stock', 'aprobacion almacen', 'autorizaciones'],
      requiredModule: 'inventory-manage-requests',
    },

    // Administración y Configuración
    {
      id: 'adm-users',
      title: 'Gestión de Usuarios y Equipo',
      category: 'Administración y Configuración',
      icon: '👥',
      route: '/users',
      keywords: ['usuarios', 'equipo', 'colaboradores', 'invitar'],
      requiredModule: 'users',
    },
    {
      id: 'adm-roles',
      title: 'Roles y Permisos de Seguridad',
      category: 'Administración y Configuración',
      icon: '🔐',
      route: '/admin/roles',
      keywords: ['permisos', 'seguridad', 'perfiles de usuario', 'matriz'],
      requiredModule: 'admin-roles',
      adminOnly: true,
    },
    {
      id: 'adm-matrix',
      title: 'Matriz Visual de Permisos',
      category: 'Administración y Configuración',
      icon: '🎛️',
      route: '/admin/roles/matrix',
      keywords: ['matriz', 'permisos', 'acceso por modulo'],
      requiredModule: 'admin-roles-matrix',
      adminOnly: true,
    },
    {
      id: 'adm-approvals',
      title: 'Bandeja de Aprobaciones Globales',
      category: 'Administración y Configuración',
      icon: '✅',
      route: '/admin/approvals',
      keywords: ['aprobaciones', 'eliminaciones', 'autorizar'],
      requiredModule: 'admin-approvals',
    },
    {
      id: 'adm-company',
      title: 'Configuración de la Empresa',
      category: 'Administración y Configuración',
      icon: '⚙️',
      route: '/company/settings',
      keywords: ['empresa', 'datos fiscales', 'moneda', 'rnc', 'logo'],
      requiredModule: 'company-settings',
      adminOnly: true,
    },
    {
      id: 'adm-profile',
      title: 'Mi Perfil de Usuario',
      category: 'Administración y Configuración',
      icon: '👤',
      route: '/profile',
      keywords: ['perfil', 'clave', 'mi cuenta', 'correo'],
    },
  ];

  readonly filteredCommands = computed(() => {
    const q = this.query().toLowerCase().trim();
    const isAdmin = this.authService.hasRole(['Admin', 'SuperAdmin']);

    // Filtrar primero por permisos de módulo del usuario
    const accessible = this.allCommands.filter((cmd) => {
      if (cmd.adminOnly && !isAdmin) return false;
      if (cmd.requiredModule && !this.moduleAccess.hasModule(cmd.requiredModule)) {
        return false;
      }
      return true;
    });

    if (!q) {
      return accessible.slice(0, 10);
    }

    const commandMatches = accessible.filter((cmd) => {
      const matchTitle = cmd.title.toLowerCase().includes(q);
      const matchCat = cmd.category.toLowerCase().includes(q);
      const matchKeywords = cmd.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false;
      return matchTitle || matchCat || matchKeywords;
    });

    // Búsqueda instantánea de clientes en el Command Palette
    const customerItems: CommandItem[] = [];
    if (q.length >= 2 && this.moduleAccess.hasModule('customers')) {
      const matched = this.customers().filter((c) => {
        const name = (c.name || '').toLowerCase();
        const id = (c.identification || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(q) || id.includes(q) || phone.includes(q);
      }).slice(0, 4);

      for (const cust of matched) {
        customerItems.push({
          id: `cust-${cust.id}`,
          title: `${cust.name || 'Cliente'} (${cust.identification || cust.phone || 'Sin RNC'})`,
          category: 'Directorio de Clientes',
          icon: '👤',
          badge: (cust as any).creditLimit ? `Límite: RD$ ${(cust as any).creditLimit}` : 'Cliente',
          route: `/customers?search=${encodeURIComponent(cust.name || '')}`,
          keywords: [cust.name || '', cust.identification || '', cust.phone || ''],
        });
      }
    }

    return [...commandMatches, ...customerItems];
  });

  @HostListener('window:keydown', ['$event'])
  handleGlobalShortcut(event: KeyboardEvent): void {
    // Abrir con Ctrl+K o Cmd+K
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.toggle();
      return;
    }

    if (!this.isOpen()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    const items = this.filteredCommands();
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = (this.selectedIndex() + 1) % items.length;
      this.selectedIndex.set(next);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = (this.selectedIndex() - 1 + items.length) % items.length;
      this.selectedIndex.set(prev);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const current = items[this.selectedIndex()];
      if (current) {
        this.executeCommand(current);
      }
    }
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  async loadCustomersIfPermitted(): Promise<void> {
    if (this.isCustomersLoaded || !this.moduleAccess.hasModule('customers')) return;
    try {
      const res = await this.customerService.getCustomers({ pageNumber: 1, pageSize: 50 });
      if (res?.data && Array.isArray(res.data)) {
        this.customers.set(res.data);
        this.isCustomersLoaded = true;
      }
    } catch {
      // ignore
    }
  }

  open(): void {
    this.isOpen.set(true);
    this.query.set('');
    this.selectedIndex.set(0);
    void this.loadCustomersIfPermitted();
    setTimeout(() => {
      this.searchInputRef?.nativeElement.focus();
    }, 50);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  onQueryChange(val: string): void {
    this.query.set(val);
    this.selectedIndex.set(0);
  }

  executeCommand(item: CommandItem): void {
    this.close();
    if (item.action) {
      item.action();
    } else if (item.route) {
      void this.router.navigateByUrl(item.route);
    }
  }
}
