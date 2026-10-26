import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BillingRoutingModule } from './billing-routing.module';
import { CreatebillingComponent } from './components/createbilling/createbilling.component';
import { ListbillingComponent } from './components/listbilling/listbilling.component';
import { ClientSearchComponent } from './components/client-search/client-search.component';
import { ProductSearchComponent } from './components/product-search/product-search.component';
import { ProductTableComponent } from './components/product-table/product-table.component';
import { GenericFiltersComponent } from './components/generic-filters/generic-filters.component';
import { KtPaginatorComponent } from './components/kt-paginator/kt-paginator.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    BillingRoutingModule,
    CreatebillingComponent,
    ListbillingComponent,
    ClientSearchComponent,
    ProductSearchComponent,
    ProductTableComponent,
    GenericFiltersComponent,
    KtPaginatorComponent,
  ],
  exports: [
    CreatebillingComponent,
    ListbillingComponent,
    ClientSearchComponent,
    ProductSearchComponent,
    ProductTableComponent,
    GenericFiltersComponent,
    KtPaginatorComponent,
  ],
})
export class BillingModule {}
