import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminLayoutComponent } from './admin-layout.component';
import { AdminLayoutRoutes } from './admin-layout.routing';
import { SharedModule } from '../../shared/shared.module';
import { ComponentsModule } from '../../components/components.module';

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(AdminLayoutRoutes),
    SharedModule,
    ComponentsModule,
    AdminLayoutComponent,
  ],
  exports: [AdminLayoutComponent],
})
export class AdminLayoutModule {}
