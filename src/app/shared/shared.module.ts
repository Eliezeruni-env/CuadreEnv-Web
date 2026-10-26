import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IconDirective } from '@coreui/icons-angular';

import { AppGenericFiltersComponent } from './components/app-generic-filters/app-generic-filters.component';
import { AppProductTableComponent } from './components/app-product-table/app-product-table.component';
import { BreadcrumbComponent } from './components/breadcrumb/breadcrumb.component';
import { CashOpeningModalComponent } from './components/cash-opening-modal/cash-opening-modal.component';
import { CashReconciliationDialogComponent } from './components/cash-reconciliation-dialog/cash-reconciliation-dialog.component';
import { CashReconciliationReceiptComponent } from './components/cash-reconciliation-receipt/cash-reconciliation-receipt.component';
import { CashMovementDialogComponent } from './components/cashMovement-Dialog/cash-movement-dialog.component';
import { ClientSearchComponent } from './components/client-search/client-search.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { InventoryGeneralDataComponent } from './components/inventory-general-data/inventory-general-data.component';
import { ListActionButtonComponent } from './components/list-action-button/list-action-button.component';
import { ListPaginationComponent } from './components/list-pagination/list-pagination.component';
import { ManageRequestModalComponent } from './components/manage-request-modal/manage-request-modal.component';
import { MaskPhoneInputComponent } from './components/mask-phone-input/mask-phone-input.component';
import { NerpDialogComponent } from './components/nerp-dialog/nerp-dialog.component';
import { ProductSearchComponent } from './components/product-search/product-search.component';
import { SearchModalComponent } from './components/search-modals/search-modal.component';
import { SplashscreenComponent } from './components/splashscreen/splashscreen.component';
import { StatusIndicatorComponent } from './components/status-indicator/status-indicator.component';
import { SupplierSearchComponent } from './components/supplier-search/supplier-search.component';

import { PhoneMaskDirective } from './directives/phone-mask.directive';
import { RncMaskDirective } from './directives/rnc-mask.directive';

const SHARED_COMPONENTS = [
  AppGenericFiltersComponent,
  AppProductTableComponent,
  BreadcrumbComponent,
  CashOpeningModalComponent,
  CashReconciliationDialogComponent,
  CashReconciliationReceiptComponent,
  CashMovementDialogComponent,
  ClientSearchComponent,
  ConfirmDialogComponent,
  InventoryGeneralDataComponent,
  ListActionButtonComponent,
  ListPaginationComponent,
  ManageRequestModalComponent,
  MaskPhoneInputComponent,
  NerpDialogComponent,
  ProductSearchComponent,
  SearchModalComponent,
  SplashscreenComponent,
  StatusIndicatorComponent,
  SupplierSearchComponent,
];

const SHARED_DIRECTIVES = [
  PhoneMaskDirective,
  RncMaskDirective,
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    IconDirective,
    ...SHARED_COMPONENTS,
    ...SHARED_DIRECTIVES,
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    IconDirective,
    ...SHARED_COMPONENTS,
    ...SHARED_DIRECTIVES,
  ],
})
export class SharedModule {}
