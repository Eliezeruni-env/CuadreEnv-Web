import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgScrollbar } from 'ngx-scrollbar';
import { CommonModule } from '@angular/common';

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

import { DefaultFooterComponent, DefaultHeaderComponent } from './';
import { navItems as staticNavItems, ModuleNavItem } from './_nav';
import { NotificationService } from '../../features/cuadreEnv/services/notification.service';
import { TranslationService } from '../../features/cuadreEnv/services/translation.service';
import { ConfirmDialogComponent } from '../../features/cuadreEnv/components/confirm-dialog/confirm-dialog.component';
import { PwaControlBarComponent } from '../../features/cuadreEnv/components/pwa-control-bar/pwa-control-bar.component';

import { AuthService } from '../../features/cuadreEnv/services/auth.service';
import { PermissionService } from '../../features/roles/services/permission.service';
import { ModuleAccessService } from '../../features/cuadreEnv/services/module-access.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './default-layout.component.html',
  styleUrls: ['./default-layout.component.scss'],
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
    ConfirmDialogComponent,
    PwaControlBarComponent,
  ],
})
export class DefaultLayoutComponent {
  private readonly translationService = inject(TranslationService);
  public notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  public readonly moduleAccess = inject(ModuleAccessService);

  private cachedNavItems: ModuleNavItem[] = [];
  private cachedKey = '';

  public readonly navItems = computed(() => {
    const currentLang = this.translationService.language();
    const modules = (this.moduleAccess.allowedModulesSignal() || []).join(',');
    const role = (this.authService.currentRole() || this.moduleAccess.userRoleSignal() || '').toLowerCase();
    const cacheKey = `${currentLang}_${modules}_${role}`;

    if (this.cachedKey === cacheKey && this.cachedNavItems.length > 0) {
      return this.cachedNavItems;
    }

    const translated = this.translationService.getTranslatedNavItems(staticNavItems) as ModuleNavItem[];
    
    // Filtrar recursivamente usando moduleAccess.hasModule(item.moduleCode)
    const filterItem = (item: ModuleNavItem): ModuleNavItem | null => {
      if (item.title) return item;

      if (item.children && item.children.length > 0) {
        const filteredChildren = (item.children as ModuleNavItem[])
          .map(child => filterItem(child))
          .filter((child): child is ModuleNavItem => child !== null);

        if (filteredChildren.length === 0) {
          return null;
        }

        return {
          ...item,
          children: filteredChildren
        };
      }

      const moduleCode = item.moduleCode || '';
      return this.moduleAccess.hasModule(moduleCode) ? item : null;
    };

    const visible = translated
      .map(item => filterItem(item))
      .filter((item): item is ModuleNavItem => item !== null);

    // Limpiar títulos de sección que hayan quedado sin sub-ítems
    const finalItems = visible.filter((item, index, array) => {
      if (!item.title) return true;
      const rest = array.slice(index + 1);
      const nextTitleIndex = rest.findIndex(r => r.title);
      const sectionChildren = nextTitleIndex === -1 ? rest : rest.slice(0, nextTitleIndex);
      return sectionChildren.length > 0;
    });

    this.cachedKey = cacheKey;
    this.cachedNavItems = finalItems;
    return finalItems;
  });
}
