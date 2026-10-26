import type { INavData } from '@coreui/angular';

export interface ModuleNavItem extends INavData {
  moduleCode?: string;
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
    name: 'Clientes',
    url: '/customers',
    moduleCode: 'customers',
    iconComponent: { name: 'cil-user' },
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
