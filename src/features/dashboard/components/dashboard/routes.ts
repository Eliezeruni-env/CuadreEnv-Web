import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./dashboard.component').then(m => m.DashboardComponent),
    data: {
      module: 'Dashboard',
      title: $localize`Dashboard`
    }
  }
];
