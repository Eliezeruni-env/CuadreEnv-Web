import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListbillingComponent } from './components/listbilling/listbilling.component';
import { CreatebillingComponent } from './components/createbilling/createbilling.component';
import { DgiiReportsComponent } from './components/dgii-reports/dgii-reports.component';

export const routes: Routes = [
  {
    path: '',
    component: ListbillingComponent,
    data: { title: 'Facturación y Comprobantes Fiscales' },
  },
  {
    path: 'create',
    component: CreatebillingComponent,
    data: { title: 'Nueva Factura' },
  },
  {
    path: 'quotationNo/:quotationNo',
    component: CreatebillingComponent,
    data: { title: 'Facturar Cotización' },
  },
  {
    path: 'reports',
    component: DgiiReportsComponent,
    data: { title: 'Reportes Fiscales DGII (606, 607, 608)' },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BillingRoutingModule {}
