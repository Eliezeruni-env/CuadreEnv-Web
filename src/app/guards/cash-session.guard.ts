import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CashierStateService } from '../services/cashierStateService.service';

export const cashSessionGuard: CanActivateFn = (_route, _state) => {
  const cashierStateService = inject(CashierStateService);
  const router = inject(Router);

  if (cashierStateService.hasActiveSession()) {
    return true;
  }

  // If no active session, redirect to cash register management or open modal route
  router.navigate(['/cash-register'], {
    queryParams: { requiresOpenSession: 'true', returnUrl: _state.url },
  });
  return false;
};
