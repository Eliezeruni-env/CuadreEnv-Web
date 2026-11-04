import { inject } from '@angular/core';
import { Router, CanActivateChildFn, CanActivateFn } from '@angular/router';
import { AuthService } from '../../features/cuadreEnv/services/auth.service';
import { PermissionService } from '../../features/roles/services/permission.service';
import { ModuleAccessService } from '../../features/cuadreEnv/services/module-access.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const redirectLogin = () => {
    const isPwaOrMobile =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true ||
        window.location.search.includes('source=pwa') ||
        window.location.search.includes('pwa=true') ||
        window.innerWidth <= 768 ||
        /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent.toLowerCase()) ||
        sessionStorage.getItem('cuadre_mobile_session_active') === 'true');

    if (isPwaOrMobile) {
      router.navigate(['/mobile']);
      return false;
    }

    const returnUrl = state?.url && !state.url.includes('/login') ? state.url : '/dashboard';
    router.navigate(['/login'], { queryParams: { returnUrl } });
    return false;
  };

  const checkTenantAccess = (): boolean => {
    if (!authService.isAuthenticated()) {
      return redirectLogin();
    }

    const companyId = authService.companyId();
    const role = authService.currentRole();
    const isSuper = authService.isSuperUser();

    // Si el usuario no tiene CompanyId válido, bloquear rutas SaaS que requieren tenant
    if (!companyId || companyId <= 0) {
      if (isSuper) {
        return true;
      }
      if (role === 'Admin') {
        const currentUrl = router.url || state?.url || '';
        if (!currentUrl.includes('/companies/create')) {
          router.navigate(['/companies/create']);
          return false;
        }
        return true;
      }
      router.navigate(['/login'], { queryParams: { error: 'missing_tenant' } });
      return false;
    }

    return true;
  };

  if (!authService.isInitializing()) {
    return checkTenantAccess();
  }

  return toObservable(authService.isInitializing).pipe(
    filter((isInit) => !isInit),
    take(1),
    map(() => checkTenantAccess())
  );
};

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (
    authService.isAuthenticated() &&
    (authService.isSuperUser() || authService.hasRole(['Admin', 'SuperUser', 'SuperAdmin', 'SysAdmin', 'Manager']))
  ) {
    return true;
  }
  router.navigate(['/dashboard']);
  return false;
};

/**
 * Helper unificado para determinar si el usuario tiene acceso irrestricto de administración o wildcard.
 */
function hasElevatedAccess(authService: AuthService | null, moduleService: ModuleAccessService): boolean {
  if (!authService) return false;
  const isSuper =
    authService.isSuperUser() === true ||
    authService.isPlatformSuperUser() === true ||
    authService.isSuperAdmin() === true ||
    authService.hasRole(['Admin', 'SuperUser', 'SuperAdmin', 'SysAdmin', 'Manager']) === true;

  const hasWildcard =
    authService.hasAllModules?.() === true ||
    moduleService.hasAllModules === true ||
    authService.allowedModules?.()?.includes('*') === true ||
    authService.allowedModules?.()?.includes('all') === true;

  return isSuper || hasWildcard;
}

/**
 * Guard que valida que el usuario tenga acceso al módulo especificado por código o ruta.
 * Soporta la sintaxis moduleGuard('moduleCode') o directo en canActivate.
 */
export function moduleGuard(moduleCode: string): CanActivateFn;
export function moduleGuard(route: any, state: any): boolean;
export function moduleGuard(moduleCodeOrRoute: any, state?: any): any {
  if (typeof moduleCodeOrRoute === 'string') {
    const moduleCode = moduleCodeOrRoute;
    return () => {
      const authService = inject(AuthService, { optional: true });
      const moduleService = inject(ModuleAccessService);
      const permissionService = inject(PermissionService, { optional: true });
      const router = inject(Router);

      if (hasElevatedAccess(authService, moduleService)) {
        return true;
      }

      const hasAccess =
        (moduleService.hasModuleAccess ? moduleService.hasModuleAccess(moduleCode) : moduleService.hasModule(moduleCode)) ||
        (authService?.hasModuleAccess ? authService.hasModuleAccess(moduleCode) : authService?.hasModule(moduleCode)) ||
        (permissionService?.hasModuleAccess ? permissionService.hasModuleAccess(moduleCode) : false);

      if (hasAccess) return true;

      router.navigate(['/403'], { queryParams: { error: 'no-access', module: moduleCode } });
      return false;
    };
  }

  const route = moduleCodeOrRoute;
  const authService = inject(AuthService, { optional: true });
  const moduleService = inject(ModuleAccessService);
  const permissionService = inject(PermissionService, { optional: true });
  const router = inject(Router);
  const targetModule = (route?.data?.['module'] as string) || 'dashboard';

  if (hasElevatedAccess(authService, moduleService)) {
    return true;
  }

  const hasAccess =
    (moduleService.hasModuleAccess ? moduleService.hasModuleAccess(targetModule) : moduleService.hasModule(targetModule)) ||
    (authService?.hasModuleAccess ? authService.hasModuleAccess(targetModule) : authService?.hasModule(targetModule)) ||
    (permissionService?.hasModuleAccess ? permissionService.hasModuleAccess(targetModule) : false);

  if (hasAccess) return true;

  router.navigate(['/403'], { queryParams: { error: 'no-access', module: targetModule } });
  return false;
}

export const moduleAccessGuard = moduleGuard;

export const moduleChildAccessGuard: CanActivateChildFn = (route, state) => {
  const authService = inject(AuthService, { optional: true });
  const moduleService = inject(ModuleAccessService);
  const permissionService = inject(PermissionService, { optional: true });
  const router = inject(Router);
  const targetModule = (route?.data?.['module'] as string) || 'dashboard';

  if (hasElevatedAccess(authService, moduleService)) {
    return true;
  }

  const hasAccess =
    (moduleService.hasModuleAccess ? moduleService.hasModuleAccess(targetModule) : moduleService.hasModule(targetModule)) ||
    (authService?.hasModuleAccess ? authService.hasModuleAccess(targetModule) : authService?.hasModule(targetModule)) ||
    (permissionService?.hasModuleAccess ? permissionService.hasModuleAccess(targetModule) : false);

  if (hasAccess) return true;

  router.navigate(['/403'], { queryParams: { error: 'no-access', module: targetModule } });
  return false;
};
