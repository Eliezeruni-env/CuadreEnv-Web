import { inject } from '@angular/core';
import { Router, Routes, CanActivateFn } from '@angular/router';
import { authGuard, adminGuard, moduleGuard, moduleAccessGuard, moduleChildAccessGuard } from './guards/auth.guard';

export const rootRedirectGuard: CanActivateFn = () => {
  const router = inject(Router);
  const isMobile =
    typeof window !== 'undefined' &&
    (window.innerWidth <= 768 ||
      /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent.toLowerCase()) ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true);

  if (isMobile) {
    router.navigate(['/mobile']);
    return false;
  }
  router.navigate(['/dashboard']);
  return false;
};

export const routes: Routes = [
  {
    path: '',
    canActivate: [rootRedirectGuard],
    pathMatch: 'full',
    children: []
  },
  {
    path: 'mobile',
    loadComponent: () => import('../features/sales/components/mobile-pos/mobile-owner-pos.component').then((m) => m.MobileOwnerPosComponent),
    data: { module: 'sales', title: 'CuadreEnv Mobile POS & Vista Ejecutiva' }
  },
  {
    path: 'mobile-pos',
    redirectTo: 'mobile',
    pathMatch: 'full'
  },
  {
    path: '',
    loadComponent: () => import('../layout').then(m => m.DefaultLayoutComponent),
    canActivate: [authGuard],
    canActivateChild: [moduleChildAccessGuard],
    data: {
      title: 'Home'
    },
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('../features/dashboard/components/dashboard/routes').then((m) => m.routes),
        canActivate: [moduleGuard('dashboard')]
      },
      {
        path: 'products',
        loadComponent: () => import('../features/products/components/products/products.component').then((m) => m.ProductsComponent),
        canActivate: [moduleGuard('products')],
        data: { module: 'products', title: 'Products Catalogue' }
      },
      {
        path: 'products/settings',
        loadComponent: () => import('../features/products/components/settings/product-settings.component').then((m) => m.ProductSettingsComponent),
        canActivate: [moduleGuard('products-settings')],
        data: { module: 'products-settings', title: 'Configuración de Productos' }
      },
      {
        path: 'inventory',
        redirectTo: 'inventory/stock',
        pathMatch: 'full'
      },
      {
        path: 'inventory/warehouses',
        loadComponent: () => import('../features/inventory/components/warehouse/warehouse-list.component').then((m) => m.WarehouseListComponent),
        canActivate: [moduleGuard('inventory-warehouses')],
        data: { module: 'inventory-warehouses', title: 'Gestión de Almacenes' }
      },
      {
        path: 'inventory/entries',
        loadComponent: () => import('../features/inventory/components/warehouse-entry/listwarehouse-entry.component').then((m) => m.ListwarehouseEntryComponent),
        canActivate: [moduleGuard('inventory-entries')],
        data: { module: 'inventory-entries', title: 'Entradas de Almacén' }
      },
      {
        path: 'inventory/entries/create',
        loadComponent: () => import('../features/inventory/components/warehouse-entry/createwarehouse-entry.component').then((m) => m.CreatewarehouseEntryComponent),
        canActivate: [moduleGuard('inventory-entries')],
        data: { module: 'inventory-entries', title: 'Nueva Entrada' }
      },
      {
        path: 'inventory/outlets',
        loadComponent: () => import('../features/inventory/components/warehouse-outlet/listwarehouse-outlet.component').then((m) => m.ListwarehouseOutletComponent),
        canActivate: [moduleGuard('inventory-outlets')],
        data: { module: 'inventory-outlets', title: 'Salidas de Almacén' }
      },
      {
        path: 'inventory/outlets/create',
        loadComponent: () => import('../features/inventory/components/warehouse-outlet/createwarehouse-outlet.component').then((m) => m.CreatewarehouseOutletComponent),
        canActivate: [moduleGuard('inventory-outlets')],
        data: { module: 'inventory-outlets', title: 'Nueva Salida' }
      },
      {
        path: 'inventory/transfers',
        loadComponent: () => import('../features/inventory/components/warehouse-transfer/listwarehouse-transfer.component').then((m) => m.ListwarehouseTransferComponent),
        canActivate: [moduleGuard('inventory-transfers')],
        data: { module: 'inventory-transfers', title: 'Transferencias entre Almacenes' }
      },
      {
        path: 'inventory/transfers/create',
        loadComponent: () => import('../features/inventory/components/warehouse-transfer/createwarehouse-transfer.component').then((m) => m.CreatewarehouseTransferComponent),
        canActivate: [moduleGuard('inventory-transfers')],
        data: { module: 'inventory-transfers', title: 'Nueva Transferencia' }
      },
      {
        path: 'inventory/stock',
        loadComponent: () => import('../features/inventory/components/stock/stock.component').then((m) => m.StockComponent),
        canActivate: [moduleGuard('inventory-stock')],
        data: { module: 'inventory-stock', title: 'Consulta de Existencias / Stock' }
      },
      {
        path: 'inventory/manage-requests',
        loadComponent: () => import('../features/inventory/components/manage-request/manage-request-list.component').then((m) => m.ManageRequestListComponent),
        canActivate: [moduleGuard('inventory-manage-requests')],
        data: { module: 'inventory-manage-requests', title: 'Bandeja de Aprobaciones' }
      },
      {
        path: 'purchases/receipts',
        loadComponent: () => import('../features/purchases/components/purchase-order-receipt/purchase-order-receipt-list.component').then((m) => m.PurchaseOrderReceiptListComponent),
        canActivate: [moduleGuard('purchases-receipts')],
        data: { module: 'purchases-receipts', title: 'Recepciones de Compra' }
      },
      {
        path: 'purchases/receipts/create',
        loadComponent: () => import('../features/purchases/components/purchase-order-receipt/purchase-order-receipt-form.component').then((m) => m.PurchaseOrderReceiptFormComponent),
        canActivate: [moduleGuard('purchases-receipts')],
        data: { module: 'purchases-receipts', title: 'Nueva Recepción' }
      },
      {
        path: 'purchases/receipts/create/:id',
        loadComponent: () => import('../features/purchases/components/purchase-order-receipt/purchase-order-receipt-form.component').then((m) => m.PurchaseOrderReceiptFormComponent),
        canActivate: [moduleGuard('purchases-receipts'), () => import('./guards/reception-exists.guard').then(m => m.ReceptionExistsGuard)],
        data: { module: 'purchases-receipts', title: 'Recepción de Orden' }
      },
      {
        path: 'users',
        loadComponent: () => import('../features/users/components/users/users.component').then((m) => m.UsersComponent),
        canActivate: [moduleAccessGuard('users')],
        data: { module: 'users', title: 'Team Management' }
      },
      {
        path: 'sales',
        loadComponent: () => import('../features/sales/components/sales/sales.component').then((m) => m.SalesComponent),
        canActivate: [moduleGuard('sales')],
        data: { module: 'sales', title: 'Sales Register' }
      },
      {
        path: 'sales/corporate',
        loadComponent: () => import('../features/sales/components/corporate-sales/corporate-sales.component').then((m) => m.CorporateSalesComponent),
        canActivate: [moduleGuard('sales.corporate')],
        data: { module: 'sales.corporate', title: 'Ventas Corporativas B2B' }
      },
      {
        path: 'sales/distribution',
        loadComponent: () => import('../features/sales/components/distribution-routes/distribution-routes.component').then((m) => m.DistributionRoutesComponent),
        canActivate: [moduleGuard('sales.distribution')],
        data: { module: 'sales.distribution', title: 'Rutas de Distribución' }
      },
      {
        path: 'products/detail-sales',
        loadComponent: () => import('../features/products/components/products/products.component').then((m) => m.ProductsComponent),
        canActivate: [moduleGuard('products.detail_sales')],
        data: { module: 'products.detail_sales', title: 'Venta Fraccionada / Menudeo' }
      },
      {
        path: 'pos',
        loadComponent: () => import('../features/sales/components/quick-sale-page/quick-sale-page.component').then((m) => m.QuickSalePageComponent),
        canActivate: [moduleGuard('sales')],
        data: { module: 'sales', title: 'Punto de Venta (POS)' }
      },
      {
        path: 'sales/pos',
        redirectTo: 'pos',
        pathMatch: 'full'
      },
      {
        path: 'sales/quick',
        redirectTo: 'pos',
        pathMatch: 'full'
      },
      {
        path: 'sales/service',
        loadComponent: () => import('../features/sales/components/service-sale-page/service-sale-page.component').then((m) => m.ServiceSalePageComponent),
        canActivate: [moduleGuard('sales')],
        data: { module: 'sales', title: 'Venta de Servicios' }
      },
      {
        path: 'receivables',
        loadComponent: () => import('../features/sales/components/receivables/receivables.component').then((m) => m.ReceivablesComponent),
        canActivate: [moduleGuard('receivables')],
        data: { module: 'receivables', title: 'Ventas por Cobrar' }
      },
      {
        path: 'sales/receivables',
        redirectTo: 'receivables',
        pathMatch: 'full'
      },
      {
        path: 'payments/accounts-receivable',
        redirectTo: 'receivables',
        pathMatch: 'full'
      },
      {
        path: 'billing',
        loadComponent: () => import('../features/billing/components/listbilling/listbilling.component').then((m) => m.ListbillingComponent),
        canActivate: [moduleGuard('billing')],
        data: { module: 'billing', title: 'Facturación y Comprobantes Fiscales' }
      },
      {
        path: 'billing/create',
        loadComponent: () => import('../features/billing/components/createbilling/createbilling.component').then((m) => m.CreatebillingComponent),
        canActivate: [moduleGuard('billing')],
        data: { module: 'billing', title: 'Nueva Factura' }
      },
      {
        path: 'billing/quotationNo/:quotationNo',
        loadComponent: () => import('../features/billing/components/createbilling/createbilling.component').then((m) => m.CreatebillingComponent),
        canActivate: [moduleGuard('billing')],
        data: { module: 'billing', title: 'Facturar Cotización' }
      },
      {
        path: 'billing/reports',
        loadComponent: () => import('../features/billing/components/dgii-reports/dgii-reports.component').then((m) => m.DgiiReportsComponent),
        canActivate: [moduleGuard('billing-reports-dgii')],
        data: { module: 'billing-reports-dgii', title: 'Reportes Fiscales DGII (606, 607, 608)' }
      },
      {
        path: 'credit-notes',
        loadComponent: () => import('../features/sales/components/credit-notes/credit-notes.component').then((m) => m.CreditNotesComponent),
        canActivate: [moduleGuard('credit-notes')],
        data: { module: 'credit-notes', title: 'Notas de Crédito y Devoluciones' }
      },
      {
        path: 'sales/credit-notes',
        redirectTo: 'credit-notes',
        pathMatch: 'full'
      },
      {
        path: 'customers',
        loadComponent: () => import('../features/customers/components/customers/customers.component').then((m) => m.CustomersComponent),
        canActivate: [moduleGuard('customers')],
        data: { module: 'customers', title: 'Customers Directory' }
      },
      {
        path: 'purchases',
        loadComponent: () => import('../features/purchases/components/purchases/purchases.component').then((m) => m.PurchasesComponent),
        canActivate: [moduleGuard('purchases-orders')],
        data: { module: 'purchases-orders', title: 'Purchases Log' }
      },
      {
        path: 'payments',
        loadComponent: () => import('../features/payments/components/payments/payments.component').then((m) => m.PaymentsComponent),
        canActivate: [moduleGuard('payments')],
        data: { module: 'payments', title: 'Payments Ledger' }
      },
      {
        path: 'cash-register',
        loadComponent: () => import('../features/cash-register/components/cash-register/cash-register.component').then((m) => m.CashRegisterComponent),
        canActivate: [moduleGuard('cash-register')],
        data: { module: 'cash-register', title: 'Cash Register Control' }
      },
      {
        path: 'cash-register/sessions',
        redirectTo: 'cash-register',
        pathMatch: 'full'
      },
      {
        path: 'cash-register/fraud-guardian',
        loadComponent: () => import('../features/cash-register/components/loss-prevention/fraud-guardian-dashboard.component').then((m) => m.FraudGuardianDashboardComponent),
        canActivate: [moduleGuard('fraud-guardian')],
        data: { module: 'fraud-guardian', title: 'El Guardián Antirrobo (Auditoría Forense)' }
      },
      {
        path: 'metrics',
        loadComponent: () => import('../features/dashboard/components/metrics/metrics.component').then((m) => m.MetricsComponent),
        canActivate: [moduleGuard('metrics')],
        data: { module: 'metrics', title: 'Métricas Globales' }
      },
      {
        path: 'reports',
        loadComponent: () => import('../features/dashboard/components/metrics/metrics.component').then((m) => m.MetricsComponent),
        canActivate: [moduleGuard('billing-reports-dgii')],
        data: { module: 'billing-reports-dgii', title: 'Reportes' }
      },
      {
        path: 'services',
        loadComponent: () => import('../features/services/components/services-list/services-list.component').then((m) => m.ServicesListComponent),
        canActivate: [moduleGuard('services')],
        data: { module: 'services', title: 'Catálogo de Servicios' }
      },
      {
        path: 'purchases/suppliers',
        loadComponent: () => import('../features/purchases/components/suppliers/suppliers.component').then((m) => m.SuppliersComponent),
        canActivate: [moduleGuard('purchases-suppliers')],
        data: { module: 'purchases-suppliers', title: 'Directorio de Proveedores' }
      },
      {
        path: 'suppliers',
        redirectTo: 'purchases/suppliers',
        pathMatch: 'full'
      },
      {
        path: 'profile',
        loadComponent: () => import('../features/users/components/user-profile/user-profile.component').then((m) => m.UserProfileComponent),
        canActivate: [moduleAccessGuard('profile')],
        data: { module: 'profile', title: 'Mi Perfil' }
      },
      {
        path: 'admin/roles',
        loadComponent: () => import('../features/roles/components/roles-list/roles-list.component').then((m) => m.RolesListComponent),
        canActivate: [moduleAccessGuard('admin-roles')],
        data: { module: 'admin-roles', title: 'Gestión de Roles y Permisos' }
      },
      {
        path: 'roles',
        redirectTo: 'admin/roles',
        pathMatch: 'full'
      },
      {
        path: 'admin/roles/matrix',
        loadComponent: () => import('../features/roles/components/permission-matrix/permission-matrix.component').then((m) => m.PermissionMatrixComponent),
        canActivate: [moduleAccessGuard('admin-roles-matrix')],
        data: { module: 'admin-roles-matrix', title: 'Matriz de Permisos' }
      },
      {
        path: 'admin/approvals',
        loadComponent: () => import('../features/approvals/components/approval-inbox/approval-inbox.component').then((m) => m.ApprovalInboxComponent),
        canActivate: [moduleAccessGuard('admin-approvals')],
        data: { module: 'admin-approvals', title: 'Bandeja de Aprobaciones' }
      },
      {
        path: 'approvals',
        redirectTo: 'admin/approvals',
        pathMatch: 'full'
      },
      {
        path: 'company/settings',
        loadComponent: () => import('../features/companies/components/company-settings/company-settings.component').then((m) => m.CompanySettingsComponent),
        canActivate: [moduleAccessGuard('company-settings')],
        data: { module: 'company-settings', title: 'Configuración de Empresa' }
      },
      {
        path: 'companies/settings',
        redirectTo: 'company/settings',
        pathMatch: 'full'
      },
      {
        path: 'pages',
        loadChildren: () => import('../features/pages/components/pages/routes').then((m) => m.routes)
      }
    ]
  },
  {
    path: 'companies/create',
    loadComponent: () => import('../features/companies/components/companies/create-company.component').then(m => m.CreateCompanyComponent),
    canActivate: [authGuard],
    data: { title: 'Register Company' }
  },
  {
    path: 'accept-invitation',
    loadComponent: () => import('../features/pages/components/pages/accept-invitation/accept-invitation.component').then(m => m.AcceptInvitationComponent),
    data: { title: 'Join Team' }
  },
  {
    path: '403',
    loadComponent: () => import('../features/pages/components/pages/page403/page403.component').then((m) => m.Page403Component),
    data: { title: 'Sin acceso' }
  },
  {
    path: 'forbidden',
    redirectTo: '403',
    pathMatch: 'full'
  },
  {
    path: '404',
    loadComponent: () => import('../features/pages/components/pages/page404/page404.component').then(m => m.Page404Component),
    data: {
      title: 'Page 404'
    }
  },
  {
    path: '500',
    loadComponent: () => import('../features/pages/components/pages/page500/page500.component').then(m => m.Page500Component),
    data: {
      title: 'Page 500'
    }
  },
  {
    path: 'login',
    loadComponent: () => import('../features/pages/components/pages/login/login.component').then(m => m.LoginComponent),
    data: {
      title: 'Login Page'
    }
  },
  {
    path: 'register',
    loadComponent: () => import('../features/pages/components/pages/register/register.component').then(m => m.RegisterComponent),
    data: {
      title: 'Register Page'
    }
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('../features/pages/components/pages/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
    data: {
      title: 'Recuperar Contraseña'
    }
  },
  {
    path: 'reset-password',
    loadComponent: () => import('../features/pages/components/pages/reset-password/reset-password.component').then(m => m.ResetPasswordComponent),
    data: {
      title: 'Restablecer Contraseña'
    }
  },
  { path: '**', redirectTo: 'dashboard' }
];
