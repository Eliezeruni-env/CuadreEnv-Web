import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ErpRoutingModule } from './erp-routing.module';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    ErpRoutingModule,
    SharedModule,
  ],
})
export class ErpModule {}
