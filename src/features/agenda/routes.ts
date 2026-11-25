import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./components/agenda-dashboard/agenda-dashboard.component').then(
        (m) => m.AgendaDashboardComponent,
      ),
    data: { breadcrumb: 'Panel de Agenda' },
  },
  {
    path: 'reservations',
    loadComponent: () =>
      import('./components/agenda-reservations/agenda-reservations.component').then(
        (m) => m.AgendaReservationsComponent,
      ),
    data: { breadcrumb: 'Reservas y Solicitudes' },
  },
  {
    path: 'calendar',
    loadComponent: () =>
      import('./components/agenda-calendar/agenda-calendar.component').then(
        (m) => m.AgendaCalendarComponent,
      ),
    data: { breadcrumb: 'Calendario' },
  },
  {
    path: 'services',
    loadComponent: () =>
      import('./components/agenda-services/agenda-services.component').then(
        (m) => m.AgendaServicesComponent,
      ),
    data: { breadcrumb: 'Servicios Reservables' },
  },
  {
    path: 'professionals',
    loadComponent: () =>
      import('./components/agenda-professionals/agenda-professionals.component').then(
        (m) => m.AgendaProfessionalsComponent,
      ),
    data: { breadcrumb: 'Personal y Disponibilidad' },
  },
  {
    path: 'clients',
    loadComponent: () =>
      import('./components/agenda-clients/agenda-clients.component').then(
        (m) => m.AgendaClientsComponent,
      ),
    data: { breadcrumb: 'Clientes de Agenda' },
  },
  {
    path: 'booking-page',
    loadComponent: () =>
      import('./components/agenda-booking-page/agenda-booking-page.component').then(
        (m) => m.AgendaBookingPageComponent,
      ),
    data: { breadcrumb: 'Mi Página de Reservas' },
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./components/agenda-reports/agenda-reports.component').then(
        (m) => m.AgendaReportsComponent,
      ),
    data: { breadcrumb: 'Reportes de Citas' },
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./components/agenda-settings/agenda-settings.component').then(
        (m) => m.AgendaSettingsComponent,
      ),
    data: { breadcrumb: 'Configuración de Citas' },
  },
];
