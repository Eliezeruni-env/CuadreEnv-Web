import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PosLayoutComponent } from './pos-layout.component';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    SharedModule,
    PosLayoutComponent,
  ],
  exports: [PosLayoutComponent],
})
export class PosLayoutModule {}
