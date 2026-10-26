import { inject } from '@angular/core';
import { Router, type CanActivateFn, type ActivatedRouteSnapshot } from '@angular/router';
import { of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { PurchaseOrderReceiptService } from '../../features/purchases/services/purchase-order-receipt.service';
import { NotificationService } from '../../features/cuadreEnv/services/notification.service';

export const ReceptionExistsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const service = inject(PurchaseOrderReceiptService);
  const notificationService = inject(NotificationService);
  const router = inject(Router);

  const id = Number(route.paramMap.get('id') || route.paramMap.get('purchaseOrderId'));
  if (!id || id <= 0) {
    notificationService.error('Número de orden de compra no válido.');
    return of(router.parseUrl('/purchases'));
  }

  return service.existsReceiptOrRequest(id).pipe(
    map((exists) => {
      if (exists) {
        notificationService.warning(
          'Esta orden de compra ya fue recepcionada previamente o tiene una revisión pendiente en autorizaciones.',
        );
        return router.parseUrl('/purchases');
      }
      return true;
    }),
    catchError(() => {
      notificationService.error('Error al validar el estado de la recepción.');
      return of(router.parseUrl('/purchases'));
    }),
  );
};
