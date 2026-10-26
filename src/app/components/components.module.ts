import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IconDirective } from '@coreui/icons-angular';

import { NavbarComponent } from './navbar/navbar.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { FooterComponent } from './footer/footer.component';
import { TopcardComponent } from './topcard/topcard.component';

const COMPONENTS = [
  NavbarComponent,
  SidebarComponent,
  FooterComponent,
  TopcardComponent,
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    IconDirective,
    ...COMPONENTS,
  ],
  exports: [
    ...COMPONENTS,
  ],
})
export class ComponentsModule {}
