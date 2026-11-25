import type { INavData } from '@coreui/angular';

export interface ModuleNavItem extends INavData {
  moduleCode?: string;
  children?: ModuleNavItem[];
}

export const ADMIN_NAV_ITEMS: ModuleNavItem[] = [
  {
    name: 'Dashboard',
    url: '/dashboard',
    moduleCode: 'dashboard',
    iconComponent: { name: 'cil-speedometer' },
  },
  {
    title: true,
    name: 'Operaciones Comerciales',
  },
  {
    name: 'Ventas',
    url: '/sales',
    moduleCode: 'sales',
    iconComponent: { name: 'cil-cart' },
  },
  {
    name: 'Facturación & NCF',
    url: '/billing',
    moduleCode: 'billing',
    iconComponent: { name: 'cil-notes' },
  },
  {
    name: 'Caja',
    url: '/cash-register',
    moduleCode: 'cashregister',
    iconComponent: { name: 'cil-calculator' },
  },
  {
    name: 'Cobros',
    url: '/receivables',
    moduleCode: 'receivables',
    iconComponent: { name: 'cil-dollar' },
  },
  {
    name: 'Notas de Crédito',
    url: '/credit-notes',
    moduleCode: 'credit-notes',
    iconComponent: { name: 'cil-description' },
  },
  {
    name: 'Conciliación Bancaria',
    url: '/sales/bank-reconciliation',
    moduleCode: 'sales',
    iconComponent: { name: 'cil-bank' },
  },
  {
    name: 'Clientes',
    url: '/customers',
    moduleCode: 'customers',
    iconComponent: { name: 'cil-user' },
  },
  {
    title: true,
    name: 'Agenda & Citas',
  },
  {
    name: 'Panel Agenda',
    url: '/agenda/dashboard',
    moduleCode: 'appointments',
    iconComponent: { name: 'cil-speedometer' },
  },
  {
    name: 'Citas',
    url: '/agenda',
    iconComponent: { name: 'cil-calendar' },
    moduleCode: 'appointments',
    children: [
      {
        name: 'Calendario',
        url: '/agenda/calendar',
      },
      {
        name: 'Reservas',
        url: '/agenda/reservations',
      },
      {
        name: 'Clientes',
        url: '/agenda/clients',
      },
      {
        name: 'Mi página de reservas',
        url: '/agenda/booking-page',
      },
    ],
  },
  {
    name: 'Servicios',
    url: '/agenda/services',
    moduleCode: 'appointments',
    iconComponent: { name: 'cil-cut' },
  },
  {
    name: 'Personal',
    url: '/agenda/professionals',
    moduleCode: 'appointments',
    iconComponent: { name: 'cil-people' },
  },
  {
    name: 'Reportes',
    url: '/agenda/reports',
    moduleCode: 'appointments',
    iconComponent: { name: 'cil-chart-line' },
  },
  {
    name: 'Configuración',
    url: '/agenda/settings',
    moduleCode: 'appointments',
    iconComponent: { name: 'cil-settings' },
  },
  {
    title: true,
    name: 'Catálogo e Inventario',
  },
  {
    name: 'Inventario y Almacenes',
    url: '/inventory',
    moduleCode: 'inventory',
    iconComponent: { name: 'cil-swap-horizontal' },
  },
  {
    name: 'Reposición Inteligente',
    url: '/inventory/intelligence',
    moduleCode: 'inventory-stock',
    iconComponent: { name: 'cil-chart-line' },
  },
  {
    name: 'Lotes y Vencimientos FEFO',
    url: '/inventory/lot-expiration',
    moduleCode: 'inventory-stock',
    iconComponent: { name: 'cil-calendar' },
  },
  {
    name: 'Productos',
    url: '/products',
    moduleCode: 'products',
    iconComponent: { name: 'cil-storage' },
  },
  {
    name: 'Categorías y Tipos',
    url: '/products/settings',
    moduleCode: 'products-settings',
    iconComponent: { name: 'cil-settings' },
  },
  {
    title: true,
    name: 'Contabilidad y Proveedores',
  },
  {
    name: 'Compras',
    url: '/purchases',
    moduleCode: 'purchases-orders',
    iconComponent: { name: 'cil-truck' },
  },
  {
    name: 'Pagos a Proveedores',
    url: '/payments',
    moduleCode: 'payments',
    iconComponent: { name: 'cil-credit-card' },
  },
  {
    title: true,
    name: 'Administración',
  },
  {
    name: 'Usuarios y Equipo',
    url: '/users',
    moduleCode: 'users',
    iconComponent: { name: 'cil-people' },
  },
];
