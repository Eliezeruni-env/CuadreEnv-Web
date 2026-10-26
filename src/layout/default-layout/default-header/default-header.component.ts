import { NgTemplateOutlet } from '@angular/common';
import { ThemeService } from '../../../features/cuadreEnv/services/theme.service';
import { Component, computed, inject, input, signal, ViewChild, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../features/cuadreEnv/services/auth.service';
import { TranslationService } from '../../../features/cuadreEnv/services/translation.service';
import { CashRegisterService } from '../../../features/cash-register/services/cash-register.service';
import { PermissionService } from '../../../features/roles/services/permission.service';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';

import {
  AvatarComponent,
  BreadcrumbRouterComponent,
  ColorModeService,
  ContainerComponent,
  DropdownComponent,
  DropdownDividerDirective,
  DropdownHeaderDirective,
  DropdownItemDirective,
  DropdownMenuDirective,
  DropdownToggleDirective,
  HeaderComponent,
  HeaderNavComponent,
  HeaderTogglerDirective,
  NavItemComponent,
  NavLinkDirective,
  SidebarToggleDirective,
} from '@coreui/angular';

import { IconDirective } from '@coreui/icons-angular';
import { HasModuleDirective } from '../../../app/shared/directives/has-module.directive';
import { CompanyService } from '../../../features/companies/services/company.service';

@Component({
  selector: 'app-default-header',
  templateUrl: './default-header.component.html',
  styleUrls: ['./default-header.component.scss'],
  imports: [
    ContainerComponent,
    HeaderTogglerDirective,
    SidebarToggleDirective,
    IconDirective,
    HeaderNavComponent,
    NavItemComponent,
    NavLinkDirective,
    RouterLink,
    RouterLinkActive,
    NgTemplateOutlet,
    BreadcrumbRouterComponent,
    DropdownComponent,
    DropdownToggleDirective,
    DropdownMenuDirective,
    DropdownItemDirective,
    DropdownDividerDirective,
    HasModuleDirective,
    CommandPaletteComponent,
  ],
})
export class DefaultHeaderComponent extends HeaderComponent implements OnInit {
  readonly #colorModeService = inject(ColorModeService);
  readonly colorMode = this.#colorModeService.colorMode;
  public authService = inject(AuthService);
  public translationService = inject(TranslationService);
  public themeService = inject(ThemeService);
  public companyService = inject(CompanyService);
  private readonly permissionService = inject(PermissionService);
  private cashRegisterService = inject(CashRegisterService);
  private router = inject(Router);

  @ViewChild('commandPalette') commandPalette?: CommandPaletteComponent;

  openCommandPalette(): void {
    this.commandPalette?.open();
  }

  isLogoutModalVisible = signal<boolean>(false);
  hasOpenCashRegister = signal<boolean>(false);
  openCashRegisterName = signal<string>('');

  readonly companyLogo = computed(() => {
    const settings = this.companyService.currentSettings();
    return settings.logoUrl?.trim() || null;
  });

  readonly companyDisplayName = computed(() => {
    const settings = this.companyService.currentSettings();
    return settings.commercialName?.trim() || settings.companyName?.trim() || 'CuadreEnv';
  });

  /**
   * Computes the first and last letter of the company name.
   * e.g., "CuadreEnv" -> "CV", "Acme" -> "AE", "Farmacia" -> "FA"
   */
  readonly companyInitials = computed(() => {
    const name = this.companyDisplayName().trim();
    if (!name) return 'CE';
    const first = name.charAt(0);
    const last = name.charAt(name.length - 1);
    return `${first}${last}`.toUpperCase();
  });

  readonly colorModes: { name: 'light' | 'dark' | 'auto'; text: string; icon: string }[] = [
    { name: 'light', text: 'Light', icon: 'cilSun' },
    { name: 'dark', text: 'Dark', icon: 'cilMoon' },
    { name: 'auto', text: 'Auto', icon: 'cilContrast' },
  ];

  readonly icons = computed(() => {
    const currentMode = this.colorMode();
    return (
      this.colorModes.find((mode) => mode.name === currentMode)?.icon ??
      'cilSun'
    );
  });

  readonly languages = [
    { code: 'es' as const, label: 'Español' },
    { code: 'en' as const, label: 'English' },
  ];

  readonly activeCompany = computed(() => this.authService.activeCompany());
  readonly userCompanies = computed(() => this.authService.userCompanies());
  readonly hasMultipleCompanies = computed(() => this.userCompanies().length > 1);

  readonly currentPlanName = computed(() => {
    const comp = this.authService.activeCompany();
    if (comp?.plan) return comp.plan;
    return 'Plan Pro';
  });

  readonly companyPlanBadgeClass = computed(() => {
    const plan = this.currentPlanName().toLowerCase();
    if (plan.includes('enterprise') || plan.includes('corporativo')) {
      return 'bg-purple-subtle text-purple border-purple-subtle';
    }
    if (plan.includes('pro') || plan.includes('business')) {
      return 'bg-primary-subtle text-primary border-primary-subtle';
    }
    return 'bg-success-subtle text-success border-success-subtle';
  });

  constructor() {
    super();
  }

  ngOnInit(): void {
    this.companyService.getCompanySettings().catch(() => {});
    if (this.authService.isAuthenticated() && this.authService.userCompanies().length === 0) {
      this.authService.loadUserCompanies().catch(() => {});
    }
  }

  async onSelectCompany(companyId: number): Promise<void> {
    await this.authService.switchCompany(companyId);
  }

  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.themeService.setTheme(theme);
  }

  sidebarId = input('sidebar1');

  async promptLogout() {
    if (!this.permissionService.hasModuleAccess('CashRegister')) {
      this.hasOpenCashRegister.set(false);
      this.isLogoutModalVisible.set(true);
      return;
    }

    try {
      const sessionRes = await this.cashRegisterService.getActiveSession();
      if (sessionRes?.success && sessionRes.data && sessionRes.data.isOpen) {
        this.hasOpenCashRegister.set(true);
        this.openCashRegisterName.set(sessionRes.data.name || 'Caja Principal');
      } else {
        this.hasOpenCashRegister.set(false);
      }
    } catch {
      this.hasOpenCashRegister.set(false);
    }
    this.isLogoutModalVisible.set(true);
  }

  cancelLogout() {
    this.isLogoutModalVisible.set(false);
  }

  async confirmLogout() {
    this.isLogoutModalVisible.set(false);
    if (this.hasOpenCashRegister()) {
      try {
        const sessionRes = await this.cashRegisterService.getActiveSession();
        if (sessionRes?.success && sessionRes.data && sessionRes.data.isOpen) {
          await this.cashRegisterService.closeSession({
            closingAmount: sessionRes.data.currentBalance ?? sessionRes.data.initialAmount ?? 0,
            notes: 'Cierre automático por cierre de sesión del usuario',
          });
        }
      } catch (err) {
        console.warn('Auto-close cash register on logout notice:', err);
      }
    }
    this.authService.logout();
  }

  goToCashRegisterClose() {
    this.isLogoutModalVisible.set(false);
    this.router.navigate(['/cash-register']);
  }

  logout() {
    this.promptLogout();
  }

  setLanguage(language: 'es' | 'en') {
    this.translationService.setLanguage(language);
  }

  exitImpersonation(): void {
    const returnUrl =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('cuadre_impersonation_return_url')
        : null;
    const fallbackUrl =
      typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:5173'
        : 'https://usm.cuadreenv.com';
    const targetUrl = returnUrl || fallbackUrl;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('cuadre_impersonation_return_url');
    }
    this.authService.clearSession();
    window.location.href = targetUrl;
  }
}
