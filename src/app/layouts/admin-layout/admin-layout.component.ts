import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgScrollbar } from 'ngx-scrollbar';
import { IconDirective } from '@coreui/icons-angular';
import {
  ContainerComponent,
  ShadowOnScrollDirective,
  SidebarBrandComponent,
  SidebarComponent,
  SidebarFooterComponent,
  SidebarHeaderComponent,
  SidebarNavComponent,
  SidebarToggleDirective,
  SidebarTogglerDirective,
  ToasterComponent,
  ToastComponent,
  ToastHeaderComponent,
  ToastBodyComponent,
} from '@coreui/angular';

import { DefaultFooterComponent, DefaultHeaderComponent } from '../../../layout/default-layout';
import { ADMIN_NAV_ITEMS } from '../../constants';
import { TranslationService } from '../../features/erp/services/translation.service';
import { NotificationService } from '../../../features/cuadreEnv/services/notification.service';
import { BreadcrumbComponent } from '../../shared/components/breadcrumb/breadcrumb.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionService } from '../../../features/roles/services/permission.service';

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    SidebarHeaderComponent,
    SidebarBrandComponent,
    SidebarNavComponent,
    SidebarFooterComponent,
    SidebarToggleDirective,
    SidebarTogglerDirective,
    ContainerComponent,
    DefaultFooterComponent,
    DefaultHeaderComponent,
    IconDirective,
    NgScrollbar,
    RouterOutlet,
    RouterLink,
    ShadowOnScrollDirective,
    ToasterComponent,
    ToastComponent,
    ToastHeaderComponent,
    ToastBodyComponent,
    BreadcrumbComponent,
    ConfirmDialogComponent,
  ],
})
export class AdminLayoutComponent {
  private readonly translationService = inject(TranslationService);
  private readonly permissionService = inject(PermissionService);
  public readonly notificationService = inject(NotificationService);

  public readonly navItems = computed(() => {
    const translated = this.translationService.getTranslatedNavItems(ADMIN_NAV_ITEMS);
    return this.permissionService.filterNavigationItems(translated);
  });
}
