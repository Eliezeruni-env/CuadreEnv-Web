import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { PosLayoutComponent } from './layouts/pos-layout/pos-layout.component';

export const AppRoutes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('../features/dashboard/components/dashboard/routes').then(
            (m) => m.routes
          ),
        data: { breadcrumb: 'Dashboard' },
      },
      {
        path: 'products',
        loadComponent: () =>
          import(
            '../features/products/components/products/products.component'
          ).then((m) => m.ProductsComponent),
        data: { breadcrumb: 'Catálogo de Productos' },
      },
      {
        path: 'products/settings',
        loadComponent: () =>
          import(
            '../features/products/components/settings/product-settings.component'
          ).then((m) => m.ProductSettingsComponent),
        data: { breadcrumb: 'Categorías y Tipos' },
      },
      {
        path: 'inventory',
        redirectTo: 'inventory/stock',
        pathMatch: 'full',
      },
      {
        path: 'inventory/warehouses',
        loadComponent: () =>
          import(
            '../features/inventory/components/warehouse/warehouse-list.component'
          ).then((m) => m.WarehouseListComponent),
        data: { breadcrumb: 'Almacenes' },
      },
      {
        path: 'inventory/entries',
        loadComponent: () =>
          import(
            '../features/inventory/components/warehouse-entry/listwarehouse-entry.component'
          ).then((m) => m.ListwarehouseEntryComponent),
        data: { breadcrumb: 'Entradas' },
      },
      {
        path: 'inventory/entries/create',
        loadComponent: () =>
          import(
            '../features/inventory/components/warehouse-entry/createwarehouse-entry.component'
          ).then((m) => m.CreatewarehouseEntryComponent),
        data: { breadcrumb: 'Nueva Entrada' },
      },
      {
        path: 'inventory/outlets',
        loadComponent: () =>
          import(
            '../features/inventory/components/warehouse-outlet/listwarehouse-outlet.component'
          ).then((m) => m.ListwarehouseOutletComponent),
        data: { breadcrumb: 'Salidas' },
      },
      {
        path: 'inventory/outlets/create',
        loadComponent: () =>
          import(
            '../features/inventory/components/warehouse-outlet/createwarehouse-outlet.component'
          ).then((m) => m.CreatewarehouseOutletComponent),
        data: { breadcrumb: 'Nueva Salida' },
      },
      {
        path: 'inventory/transfers',
        loadComponent: () =>
          import(
            '../features/inventory/components/warehouse-transfer/listwarehouse-transfer.component'
          ).then((m) => m.ListwarehouseTransferComponent),
        data: { breadcrumb: 'Transferencias' },
      },
      {
        path: 'inventory/transfers/create',
        loadComponent: () =>
          import(
            '../features/inventory/components/warehouse-transfer/createwarehouse-transfer.component'
          ).then((m) => m.CreatewarehouseTransferComponent),
        data: { breadcrumb: 'Nueva Transferencia' },
      },
      {
        path: 'inventory/stock',
        loadComponent: () =>
          import(
            '../features/inventory/components/stock/stock.component'
          ).then((m) => m.StockComponent),
        data: { breadcrumb: 'Control de Stock' },
      },
      {
        path: 'inventory/manage-requests',
        loadComponent: () =>
          import(
            '../features/inventory/components/manage-request/manage-request-list.component'
          ).then((m) => m.ManageRequestListComponent),
        data: { breadcrumb: 'Autorizaciones' },
      },
      {
        path: 'purchases/receipts',
        loadComponent: () =>
          import(
            '../features/purchases/components/purchase-order-receipt/purchase-order-receipt-list.component'
          ).then((m) => m.PurchaseOrderReceiptListComponent),
        data: { breadcrumb: 'Recepciones' },
      },
      {
        path: 'purchases/receipts/create',
        loadComponent: () =>
          import(
            '../features/purchases/components/purchase-order-receipt/purchase-order-receipt-form.component'
          ).then((m) => m.PurchaseOrderReceiptFormComponent),
        data: { breadcrumb: 'Nueva Recepción' },
      },
      {
        path: 'purchases/receipts/create/:id',
        loadComponent: () =>
          import(
            '../features/purchases/components/purchase-order-receipt/purchase-order-receipt-form.component'
          ).then((m) => m.PurchaseOrderReceiptFormComponent),
        canActivate: [() => import('./guards/reception-exists.guard').then(m => m.ReceptionExistsGuard)],
        data: { breadcrumb: 'Recepción' },
      },
      {
        path: 'users',
        loadComponent: () =>
          import(
            '../features/users/components/users/users.component'
          ).then((m) => m.UsersComponent),
        data: { breadcrumb: 'Usuarios & Permisos' },
      },
      {
        path: 'sales',
        loadComponent: () =>
          import(
            '../features/sales/components/sales/sales.component'
          ).then((m) => m.SalesComponent),
        data: { breadcrumb: 'Ventas y Facturación' },
      },
      {
        path: 'sales/corporate',
        loadComponent: () =>
          import(
            '../features/sales/components/corporate-sales/corporate-sales.component'
          ).then((m) => m.CorporateSalesComponent),
        data: { breadcrumb: 'Ventas Corporativas' },
      },
      {
        path: 'sales/distribution',
        loadComponent: () =>
          import(
            '../features/sales/components/distribution-routes/distribution-routes.component'
          ).then((m) => m.DistributionRoutesComponent),
        data: { breadcrumb: 'Rutas & Surtidores' },
      },
      {
        path: 'products/detail-sales',
        loadComponent: () =>
          import(
            '../features/products/components/products/products.component'
          ).then((m) => m.ProductsComponent),
        data: { breadcrumb: 'Venta Fraccionada / Menudeo' },
      },
      {
        path: 'receivables',
        loadComponent: () =>
          import(
            '../features/sales/components/receivables/receivables.component'
          ).then((m) => m.ReceivablesComponent),
        data: { breadcrumb: 'Cuentas por Cobrar' },
      },
      {
        path: 'billing',
        loadComponent: () =>
          import(
            '../features/billing/components/listbilling/listbilling.component'
          ).then((m) => m.ListbillingComponent),
        data: { breadcrumb: 'Facturación y NCF' },
      },
      {
        path: 'billing/create',
        loadComponent: () =>
          import(
            '../features/billing/components/createbilling/createbilling.component'
          ).then((m) => m.CreatebillingComponent),
        data: { breadcrumb: 'Nueva Factura' },
      },
      {
        path: 'billing/quotationNo/:quotationNo',
        loadComponent: () =>
          import(
            '../features/billing/components/createbilling/createbilling.component'
          ).then((m) => m.CreatebillingComponent),
        data: { breadcrumb: 'Facturar Cotización' },
      },
      {
        path: 'billing/reports',
        loadComponent: () =>
          import(
            '../features/billing/components/dgii-reports/dgii-reports.component'
          ).then((m) => m.DgiiReportsComponent),
        data: { breadcrumb: 'Reportes DGII (606/607)' },
      },
      {
        path: 'credit-notes',
        loadComponent: () =>
          import(
            '../features/sales/components/credit-notes/credit-notes.component'
          ).then((m) => m.CreditNotesComponent),
        data: { breadcrumb: 'Notas de Crédito' },
      },
      {
        path: 'customers',
        loadComponent: () =>
          import(
            '../features/customers/components/customers/customers.component'
          ).then((m) => m.CustomersComponent),
        data: { breadcrumb: 'Directorio de Clientes' },
      },
      {
        path: 'purchases',
        loadComponent: () =>
          import(
            '../features/purchases/components/purchases/purchases.component'
          ).then((m) => m.PurchasesComponent),
        data: { breadcrumb: 'Compras a Proveedores' },
      },
      {
        path: 'payments',
        loadComponent: () =>
          import(
            '../features/payments/components/payments/payments.component'
          ).then((m) => m.PaymentsComponent),
        data: { breadcrumb: 'Pagos y Egresos' },
      },
      {
        path: 'cash-register',
        loadComponent: () =>
          import(
            '../features/cash-register/components/cash-register/cash-register.component'
          ).then((m) => m.CashRegisterComponent),
        data: { breadcrumb: 'Caja y Cuadres' },
      },
    ],
  },
  {
    path: 'pos',
    component: PosLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            '../features/cash-register/components/cash-register/cash-register.component'
          ).then((m) => m.CashRegisterComponent),
        data: { breadcrumb: 'Punto de Venta Directo' },
      },
    ],
  },
  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import(
            '../features/pages/components/pages/login/login.component'
          ).then((m) => m.LoginComponent),
        data: { breadcrumb: 'Iniciar Sesión' },
      },
      {
        path: 'register',
        loadComponent: () =>
          import(
            '../features/pages/components/pages/register/register.component'
          ).then((m) => m.RegisterComponent),
        data: { breadcrumb: 'Registro' },
      },
      {
        path: 'accept-invitation',
        loadComponent: () =>
          import(
            '../features/pages/components/pages/accept-invitation/accept-invitation.component'
          ).then((m) => m.AcceptInvitationComponent),
        data: { breadcrumb: 'Aceptar Invitación' },
      },
      {
        path: '404',
        loadComponent: () =>
          import(
            '../features/pages/components/pages/page404/page404.component'
          ).then((m) => m.Page404Component),
        data: { breadcrumb: 'Página no encontrada' },
      },
      {
        path: '500',
        loadComponent: () =>
          import(
            '../features/pages/components/pages/page500/page500.component'
          ).then((m) => m.Page500Component),
        data: { breadcrumb: 'Error de Servidor' },
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];

@NgModule({
  imports: [RouterModule.forRoot(AppRoutes, { useHash: true })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
