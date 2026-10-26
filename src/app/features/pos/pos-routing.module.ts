import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PosHomeLayoutComponent } from './home-layout/home-layout.component';
import { PosHomeComponent } from './home/home.component';
import { PosPaymentsComponent } from './payments/payments.component';
import { PosWaitingComponent } from './waiting/waiting.component';
import { PosReturnComponent } from './return/return.component';
import { PosSearchSaleComponent } from './search-sale/search-sale.component';
import { cashSessionGuard } from './Guards';

export const posRoutes: Routes = [
  {
    path: '',
    component: PosHomeLayoutComponent,
    canActivate: [cashSessionGuard],
    children: [
      {
        path: '',
        component: PosHomeComponent,
        data: { breadcrumb: 'Punto de Venta' },
      },
      {
        path: 'payments',
        component: PosPaymentsComponent,
        data: { breadcrumb: 'Cobros POS' },
      },
      {
        path: 'waiting',
        component: PosWaitingComponent,
        data: { breadcrumb: 'Tickets en Espera' },
      },
      {
        path: 'return',
        component: PosReturnComponent,
        data: { breadcrumb: 'Devoluciones POS' },
      },
      {
        path: 'search-sale',
        component: PosSearchSaleComponent,
        data: { breadcrumb: 'Buscar Venta' },
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(posRoutes)],
  exports: [RouterModule],
})
export class PosRoutingModule {}
