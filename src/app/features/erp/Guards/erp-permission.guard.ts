import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const erpPermissionGuard: CanActivateFn = (_route, _state) => {
  const router = inject(Router);
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (!token) {
    router.navigate(['/login']);
    return false;
  }
  return true;
};
