import { ResolveFn } from '@angular/router';

export const dashboardKpiResolver: ResolveFn<any> = () => {
  return { loadedAt: new Date().toISOString() };
};
