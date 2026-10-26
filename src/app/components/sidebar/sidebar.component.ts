import {
  Component,
  Input,
  Output,
  EventEmitter,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconDirective } from '@coreui/icons-angular';
import { PermissionService } from '../../../features/roles/services/permission.service';
import { ModuleAccessService } from '../../../features/cuadreEnv/services/module-access.service';

export interface RouteInfo {
  path?: string;
  moduleCode?: string;
  title: string;
  icon?: string;
  class?: string;
  badge?: string;
  badgeClass?: string;
  isTitle?: boolean;
  isExpanded?: boolean;
  children?: RouteInfo[];
}

export const ROUTES: RouteInfo[] = [
  {
    path: '/dashboard',
    moduleCode: 'dashboard',
    title: 'Dashboard',
    icon: 'cilSpeedometer',
    class: '',
  },
  {
    title: 'Operaciones Comerciales',
    isTitle: true,
  },
  {
    path: '/sales',
    moduleCode: 'sales',
    title: 'Ventas y Facturación',
    icon: 'cilCart',
    class: '',
  },
  {
    path: '/mobile',
    moduleCode: 'sales',
    title: 'Punto de Venta Móvil',
    icon: 'cilPhone',
    class: '',
  },
  {
    path: '/services',
    moduleCode: 'services',
    title: 'Servicios',
    icon: 'cilNotes',
    class: '',
  },
  {
    path: '/billing',
    moduleCode: 'billing',
    title: 'Facturación',
    icon: 'cilDescription',
    class: '',
  },
  {
    path: '/credit-notes',
    moduleCode: 'credit-notes',
    title: 'Notas de Crédito',
    icon: 'cilNotes',
    class: '',
  },
  {
    path: '/cash-register',
    moduleCode: 'cashregister',
    title: 'Caja y Cuadres',
    icon: 'cilCalculator',
    class: '',
  },
  {
    path: '/cash-register/fraud-guardian',
    moduleCode: 'fraud-guardian',
    title: 'Fraud Guardian',
    icon: 'cilShieldAlt',
    class: '',
  },
  {
    path: '/receivables',
    moduleCode: 'receivables',
    title: 'Cuentas por Cobrar',
    icon: 'cilDollar',
    class: '',
  },
  {
    path: '/customers',
    moduleCode: 'customers',
    title: 'Clientes',
    icon: 'cilUser',
    class: '',
  },
  {
    title: 'Inventario & Catálogo',
    isTitle: true,
  },
  {
    path: '/inventory',
    moduleCode: 'inventory',
    title: 'Almacenes & Stock',
    icon: 'cilSwapHorizontal',
    class: '',
  },
  {
    path: '/inventory/entries',
    moduleCode: 'inventory-entries',
    title: 'Entradas de Inventario',
    icon: 'cilArrowThickFromBottom',
    class: '',
  },
  {
    path: '/inventory/outlets',
    moduleCode: 'inventory-outlets',
    title: 'Salidas de Inventario',
    icon: 'cilArrowThickToBottom',
    class: '',
  },
  // {
  //   path: '/billing/reports',
  //   moduleCode: 'billing-reports-dgii',
  //   title: 'Reportes DGII',
  //   icon: 'cilChartPie',
  //   class: '',
  // },
  {
    path: '/inventory/transfers',
    moduleCode: 'inventory-transfers',
    title: 'Transferencias',
    icon: 'cilSwapHorizontal',
    class: '',
  },
  {
    path: '/inventory/warehouses',
    moduleCode: 'inventory-warehouses',
    title: 'Almacenes',
    icon: 'cilStorage',
    class: '',
  },
  {
    path: '/inventory/manage-requests',
    moduleCode: 'inventory-manage-requests',
    title: 'Solicitudes de Inventario',
    icon: 'cilTask',
    class: '',
  },
  {
    path: '/inventory/stock',
    moduleCode: 'inventory-stock',
    title: 'Existencias',
    icon: 'cilLayers',
    class: '',
  },
  {
    title: 'Catálogo de Productos',
    icon: 'cilStorage',
    class: '',
    isExpanded: false,
    children: [
      {
        path: '/products',
        moduleCode: 'products',
        title: 'Listado de Productos',
      },
      {
        path: '/products/settings',
        moduleCode: 'products-settings',
        title: 'Categorías y Tipos',
      },
    ],
  },
  {
    title: 'Contabilidad & Compras',
    isTitle: true,
  },
  {
    path: '/purchases',
    moduleCode: 'purchases-orders',
    title: 'Compras a Proveedores',
    icon: 'cilTruck',
    class: '',
  },
  {
    path: '/purchases/suppliers',
    moduleCode: 'purchases-suppliers',
    title: 'Proveedores',
    icon: 'cilTruck',
    class: '',
  },
  {
    path: '/purchases/receipts',
    moduleCode: 'purchases-receipts',
    title: 'Recepciones de Compra',
    icon: 'cilInbox',
    class: '',
  },
  {
    path: '/payments',
    moduleCode: 'payments',
    title: 'Pagos y Egresos',
    icon: 'cilCreditCard',
    class: '',
  },
  {
    title: 'Reportes',
    isTitle: true,
  },
  {
    path: '/metrics',
    moduleCode: 'metrics',
    title: 'Métricas',
    icon: 'cilChartPie',
    class: '',
  },
  {
    path: '/reports',
    moduleCode: 'reports',
    title: 'Reportes',
    icon: 'cilChart',
    class: '',
  },
  {
    title: 'Administración',
    isTitle: true,
  },
  {
    path: '/users',
    moduleCode: 'users',
    title: 'Usuarios y Equipo',
    icon: 'cilPeople',
    class: '',
  },
  {
    path: '/admin/roles',
    moduleCode: 'admin-roles',
    title: 'Roles y Permisos',
    icon: 'cilSettings',
    class: '',
  },
  {
    path: '/admin/roles/matrix',
    moduleCode: 'admin-roles-matrix',
    title: 'Matriz de Permisos',
    icon: 'cilGrid',
    class: '',
  },
  {
    path: '/admin/approvals',
    moduleCode: 'admin-approvals',
    title: 'Bandeja de Aprobaciones',
    icon: 'cilCheckCircle',
    class: '',
  },
  {
    path: '/company/settings',
    moduleCode: 'company-settings',
    title: 'Configuración de Empresa',
    icon: 'cilSettings',
    class: '',
  },
  {
    path: '/profile',
    moduleCode: 'profile',
    title: 'Mi Perfil',
    icon: 'cilUser',
    class: '',
  },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, IconDirective],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  @Input() sidebarVisible = true;
  @Input() mobileOpen = false;
  @Output() closeMobileSidebar = new EventEmitter<void>();

  hoveredItem: RouteInfo | null = null;
  floatingTop = 0;
  private hoverTimeout: any;
  private readonly permissionService = inject(PermissionService);
  private readonly moduleAccessService = inject(ModuleAccessService);

  readonly menuItems = computed(() => {
    this.moduleAccessService.allowedModulesSignal();
    return this.filterMenuItems(ROUTES);
  });

  hasModule(moduleCode?: string): boolean {
    if (!moduleCode) return false;
    return this.permissionService.hasModule(moduleCode);
  }

  private filterMenuItems(items: readonly RouteInfo[]): RouteInfo[] {
    const filtered = items.flatMap((item) => {
      if (item.isTitle) return [{ ...item }];

      if (item.children?.length) {
        const children = this.filterMenuItems(item.children);
        return children.length ? [{ ...item, children }] : [];
      }

      const moduleCode = item.moduleCode || item.path;
      return moduleCode && this.hasModule(moduleCode)
        ? [{ ...item }]
        : [];
    });

    return filtered.filter((item, index) => {
      if (!item.isTitle) return true;
      const following = filtered.slice(index + 1);
      const nextTitle = following.findIndex((next) => next.isTitle);
      return (
        following.slice(0, nextTitle < 0 ? following.length : nextTitle)
          .length > 0
      );
    });
  }

  toggleAccordion(item: RouteInfo) {
    if (!this.sidebarVisible) return;
    item.isExpanded = !item.isExpanded;
  }

  onItemMouseEnter(item: RouteInfo, event: MouseEvent) {
    if (this.sidebarVisible || !item.children || item.children.length === 0) {
      return;
    }
    clearTimeout(this.hoverTimeout);
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.floatingTop = rect.top;
    this.hoveredItem = item;
  }

  onItemMouseLeave() {
    if (this.sidebarVisible) return;
    this.hoverTimeout = setTimeout(() => {
      this.hoveredItem = null;
    }, 150);
  }

  cancelHoverLeave() {
    clearTimeout(this.hoverTimeout);
  }
}
