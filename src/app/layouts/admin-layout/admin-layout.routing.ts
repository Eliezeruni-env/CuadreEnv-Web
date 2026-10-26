import { Routes } from '@angular/router';
import { moduleChildAccessGuard } from '../../guards/auth.guard';

export const AdminLayoutRoutes: Routes = [
  {
    path: '',
    canActivateChild: [moduleChildAccessGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('../../../features/dashboard/components/dashboard/routes').then(
            (m) => m.routes,
          ),
        data: { breadcrumb: 'Dashboard' },
      },
      {
        path: 'products',
        loadComponent: () =>
          import('../../../features/products/components/products/products.component').then(
            (m) => m.ProductsComponent,
          ),
        data: { breadcrumb: 'Catálogo de Productos' },
      },
      {
        path: 'products/settings',
        loadComponent: () =>
          import('../../../features/products/components/settings/product-settings.component').then(
            (m) => m.ProductSettingsComponent,
          ),
        data: { breadcrumb: 'Categorías y Tipos' },
      },
      {
        path: 'inventory',
        redirectTo: 'inventory/stock',
        pathMatch: 'full',
      },
      {
        path: 'inventory/stock',
        loadComponent: () =>
          import('../../../features/inventory/components/stock/stock.component').then(
            (m) => m.StockComponent,
          ),
        data: { breadcrumb: 'Control de Stock' },
      },
      {
        path: 'users',
        loadComponent: () =>
          import('../../../features/users/components/users/users.component').then(
            (m) => m.UsersComponent,
          ),
        data: { breadcrumb: 'Usuarios & Permisos' },
      },
      {
        path: 'sales',
        loadComponent: () =>
          import('../../../features/sales/components/sales/sales.component').then(
            (m) => m.SalesComponent,
          ),
        data: { breadcrumb: 'Ventas y Facturación' },
      },
      {
        path: 'sales/corporate',
        loadComponent: () =>
          import('../../../features/sales/components/corporate-sales/corporate-sales.component').then(
            (m) => m.CorporateSalesComponent,
          ),
        data: { breadcrumb: 'Ventas Corporativas' },
      },
      {
        path: 'sales/distribution',
        loadComponent: () =>
          import('../../../features/sales/components/distribution-routes/distribution-routes.component').then(
            (m) => m.DistributionRoutesComponent,
          ),
        data: { breadcrumb: 'Rutas & Surtidores' },
      },
      {
        path: 'receivables',
        loadComponent: () =>
          import('../../../features/sales/components/receivables/receivables.component').then(
            (m) => m.ReceivablesComponent,
          ),
        data: { breadcrumb: 'Cuentas por Cobrar' },
      },
      {
        path: 'billing',
        loadComponent: () =>
          import('../../../features/billing/components/listbilling/listbilling.component').then(
            (m) => m.ListbillingComponent,
          ),
        data: { breadcrumb: 'Facturación y NCF' },
      },
      {
        path: 'billing/create',
        loadComponent: () =>
          import('../../../features/billing/components/createbilling/createbilling.component').then(
            (m) => m.CreatebillingComponent,
          ),
        data: { breadcrumb: 'Nueva Factura' },
      },
      {
        path: 'billing/quotationNo/:quotationNo',
        loadComponent: () =>
          import('../../../features/billing/components/createbilling/createbilling.component').then(
            (m) => m.CreatebillingComponent,
          ),
        data: { breadcrumb: 'Facturar Cotización' },
      },
      {
        path: 'billing/reports',
        loadComponent: () =>
          import('../../../features/billing/components/dgii-reports/dgii-reports.component').then(
            (m) => m.DgiiReportsComponent,
          ),
        data: { breadcrumb: 'Reportes DGII (606/607)' },
      },
      {
        path: 'credit-notes',
        loadComponent: () =>
          import('../../../features/sales/components/credit-notes/credit-notes.component').then(
            (m) => m.CreditNotesComponent,
          ),
        data: { breadcrumb: 'Notas de Crédito y Devoluciones' },
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('../../../features/customers/components/customers/customers.component').then(
            (m) => m.CustomersComponent,
          ),
        data: { breadcrumb: 'Directorio de Clientes' },
      },
      {
        path: 'purchases',
        loadComponent: () =>
          import('../../../features/purchases/components/purchases/purchases.component').then(
            (m) => m.PurchasesComponent,
          ),
        data: { breadcrumb: 'Compras a Proveedores' },
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('../../../features/payments/components/payments/payments.component').then(
            (m) => m.PaymentsComponent,
          ),
        data: { breadcrumb: 'Pagos y Egresos' },
      },
      {
        path: 'cash-register',
        loadComponent: () =>
          import('../../../features/cash-register/components/cash-register/cash-register.component').then(
            (m) => m.CashRegisterComponent,
          ),
        data: { breadcrumb: 'Caja y Cuadres' },
      },
    ],
  },
];
