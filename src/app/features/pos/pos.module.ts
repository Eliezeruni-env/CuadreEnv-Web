import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PosRoutingModule } from './pos-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { PosHomeLayoutComponent } from './home-layout/home-layout.component';
import { PosHomeComponent } from './home/home.component';
import { PosPaymentsComponent } from './payments/payments.component';
import { PosWaitingComponent } from './waiting/waiting.component';
import { PosReturnComponent } from './return/return.component';
import { PosSearchSaleComponent } from './search-sale/search-sale.component';

@NgModule({
  imports: [
    CommonModule,
    PosRoutingModule,
    SharedModule,
    PosHomeLayoutComponent,
    PosHomeComponent,
    PosPaymentsComponent,
    PosWaitingComponent,
    PosReturnComponent,
    PosSearchSaleComponent,
  ],
})
export class PosModule {}
