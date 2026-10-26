import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { erpPermissionGuard } from './Guards';
import { dashboardKpiResolver } from './resolvers';

export const erpRoutes: Routes = [
  {
    path: '',
    canActivate: [erpPermissionGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('../../../features/dashboard/components/dashboard/routes').then(
            (m) => m.routes
          ),
        resolve: { kpi: dashboardKpiResolver },
        data: { breadcrumb: 'Dashboard' },
      },
      {
        path: 'products',
        loadComponent: () =>
          import(
            '../../../features/products/components/products/products.component'
          ).then((m) => m.ProductsComponent),
        data: { breadcrumb: 'Catálogo de Productos' },
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import(
            '../../../features/inventory/components/inventory/inventory.component'
          ).then((m) => m.InventoryComponent),
        data: { breadcrumb: 'Almacenes & Stock' },
      },
      {
        path: 'sales',
        loadComponent: () =>
          import(
            '../../../features/sales/components/sales/sales.component'
          ).then((m) => m.SalesComponent),
        data: { breadcrumb: 'Ventas y Facturación' },
      },
      {
        path: 'receivables',
        loadComponent: () =>
          import(
            '../../../features/sales/components/receivables/receivables.component'
          ).then((m) => m.ReceivablesComponent),
        data: { breadcrumb: 'Cuentas por Cobrar' },
      },
      {
        path: 'customers',
        loadComponent: () =>
          import(
            '../../../features/customers/components/customers/customers.component'
          ).then((m) => m.CustomersComponent),
        data: { breadcrumb: 'Clientes' },
      },
      {
        path: 'purchases',
        loadComponent: () =>
          import(
            '../../../features/purchases/components/purchases/purchases.component'
          ).then((m) => m.PurchasesComponent),
        data: { breadcrumb: 'Compras' },
      },
      {
        path: 'payments',
        loadComponent: () =>
          import(
            '../../../features/payments/components/payments/payments.component'
          ).then((m) => m.PaymentsComponent),
        data: { breadcrumb: 'Pagos' },
      },
      {
        path: 'cash-register',
        loadComponent: () =>
          import(
            '../../../features/cash-register/components/cash-register/cash-register.component'
          ).then((m) => m.CashRegisterComponent),
        data: { breadcrumb: 'Caja' },
      },
      {
        path: 'users',
        loadComponent: () =>
          import(
            '../../../features/users/components/users/users.component'
          ).then((m) => m.UsersComponent),
        data: { breadcrumb: 'Usuarios' },
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(erpRoutes)],
  exports: [RouterModule],
})
export class ErpRoutingModule {}
