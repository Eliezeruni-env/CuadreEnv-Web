import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card border-0 shadow-sm text-center p-4 p-md-5 my-4 mx-auto" style="max-width: 32rem;">
      <div class="text-warning mb-3" aria-hidden="true">
        <span style="font-size: 3.5rem; display: inline-block; line-height: 1;">🔒</span>
      </div>
      <h2 class="h4 fw-bold mb-2">Acceso Denegado</h2>
      <p class="text-secondary mb-4">
        {{ message || 'No tienes acceso a este módulo. Contacta al administrador.' }}
      </p>
      <div class="d-flex justify-content-center gap-2">
        <a class="btn btn-primary px-4" [routerLink]="['/dashboard']">
          Volver al Dashboard
        </a>
      </div>
    </div>
  `
})
export class AccessDeniedComponent {
  @Input() message: string = 'No tienes acceso a este módulo. Contacta al administrador.';
  @Input() moduleCode: string = '';
}
