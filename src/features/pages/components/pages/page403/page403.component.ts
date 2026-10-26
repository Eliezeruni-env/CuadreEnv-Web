import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../cuadreEnv/services/auth.service';

@Component({
  selector: 'app-page403',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './page403.component.html',
})
export class Page403Component {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly hasAssignedModules = computed(
    () => this.authService.allowedModules().length > 0,
  );

  readonly requestedModuleCode = computed(() => {
    return (this.route.snapshot.queryParams['module'] || '')
      .toLowerCase()
      .trim();
  });

  readonly moduleFriendlyName = computed(() => {
    const code = this.requestedModuleCode();
    const names: Record<string, string> = {
      sales: 'Ventas & Punto de Venta (POS)',
      pos: 'Ventas Rápidas (POS)',
      'sales.corporate': 'Ventas Corporativas B2B',
      'sales-corporate': 'Ventas Corporativas B2B',
      'sales.distribution': 'Rutas de Distribución',
      'sales-distribution': 'Rutas de Distribución',
      // 'products.detail_sales': 'Venta Fraccionada y Menudeo',
      // 'products-detail-sales': 'Venta Fraccionada y Menudeo',
      billing: 'Facturación y Comprobantes Fiscales',
      'billing-reports-dgii': 'Reportes Fiscales DGII',
      'credit-notes': 'Notas de Crédito y Devoluciones',
      'cash-register': 'Control de Caja y Turnos',
      'fraud-guardian': 'Auditoría Forense Antirrobo (Fraud Guardian)',
      receivables: 'Cuentas por Cobrar',
      customers: 'Directorio de Clientes',
      products: 'Catálogo de Productos',
      'products-settings': 'Configuración de Categorías y Tipos',
      'inventory-stock': 'Control de Stock / Existencias',
      'inventory-entries': 'Entradas de Almacén',
      'inventory-outlets': 'Salidas de Almacén',
      'inventory-transfers': 'Transferencias entre Almacenes',
      'inventory-warehouses': 'Almacenes y Depósitos',
      'inventory-manage-requests': 'Bandeja de Autorizaciones de Stock',
      'purchases-suppliers': 'Directorio de Proveedores',
      purchases: 'Órdenes de Compra',
      'purchases-orders': 'Órdenes de Compra',
      'purchases-receipts': 'Recepciones de Mercancía',
      payments: 'Pagos a Proveedores',
      services: 'Catálogo de Servicios',
      metrics: 'Métricas Financieras Globales',
      reports: 'Reportes Financieros',
      users: 'Gestión de Usuarios y Equipo',
      'admin-roles': 'Roles y Permisos',
      'admin-roles-matrix': 'Matriz de Permisos',
      'admin-approvals': 'Bandeja de Aprobaciones Administrativas',
      'company-settings': 'Configuración de Empresa',
    };
    return names[code] || (code ? code.toUpperCase() : 'este módulo');
  });

  switchAccount(): void {
    this.authService.clearSession();
    void this.router.navigate(['/login']);
  }
}
