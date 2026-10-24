import { inject } from '@angular/core';
import { Router, CanActivateChildFn, CanActivateFn } from '@angular/router';
import { AuthService } from '../../features/cuadreEnv/services/auth.service';
import { PermissionService } from '../../features/roles/services/permission.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const redirectLogin = () => {
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

import { ModuleAccessService } from '../../features/cuadreEnv/services/module-access.service';

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
      const router = inject(Router);

      const isSuperAdmin =
        authService?.isSuperAdmin() === true ||
        authService?.currentRole()?.toLowerCase() === 'superadmin';
      const hasAccess =
        (isSuperAdmin && authService?.hasAllModules()) ||
        moduleService.hasModuleAccess(moduleCode);
      if (hasAccess) return true;

      router.navigate(['/dashboard'], { queryParams: { error: 'no-access', module: moduleCode } });
      return false;
    };
  }

  const route = moduleCodeOrRoute;
  const authService = inject(AuthService, { optional: true });
  const moduleService = inject(ModuleAccessService);
  const router = inject(Router);
  const targetModule = (route?.data?.['module'] as string) || 'dashboard';

  const isSuperAdmin =
    authService?.isSuperAdmin() === true ||
    authService?.currentRole()?.toLowerCase() === 'superadmin';
  const hasAccess =
    (isSuperAdmin && authService?.hasAllModules()) ||
    moduleService.hasModuleAccess(targetModule);
  if (hasAccess) return true;

  router.navigate(['/dashboard'], { queryParams: { error: 'no-access', module: targetModule } });
  return false;
}

export const moduleAccessGuard = moduleGuard;

export const moduleChildAccessGuard: CanActivateChildFn = (route, state) => {
  const authService = inject(AuthService, { optional: true });
  const moduleService = inject(ModuleAccessService);
  const router = inject(Router);
  const targetModule = (route?.data?.['module'] as string) || 'dashboard';

  const hasAccess =
    authService?.isSuperUser() ||
    authService?.hasRole(['Admin', 'SuperUser', 'SuperAdmin', 'SysAdmin']) ||
    (authService?.hasModuleAccess(targetModule) ?? moduleService.hasModule(targetModule));
  if (hasAccess) return true;

  router.navigate(['/dashboard'], { queryParams: { error: 'no-access', module: targetModule } });
  return false;
};

