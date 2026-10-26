import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { PermissionService } from '../../../features/roles/services/permission.service';

/**
 * Directiva estructural para control de acceso RBAC granular.
 *
 * Ejemplos de uso:
 *  - `<button *appHasPermission="['Sales', 'Create']">Nueva Venta</button>`
 *  - `<button *appHasPermission="'Sales:Delete'">Eliminar Venta</button>`
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnInit, OnDestroy {
  private currentPermission: [string, string] | null = null;
  private isVisible = false;
  private sub?: Subscription;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private permissionService: PermissionService
  ) {}

  @Input()
  set appHasPermission(val: [string, string] | string | null | undefined) {
    if (!val) {
      this.currentPermission = null;
    } else if (Array.isArray(val) && val.length >= 2) {
      this.currentPermission = [val[0], val[1]];
    } else if (typeof val === 'string') {
      const parts = val.includes(':') ? val.split(':') : val.split('.');
      if (parts.length >= 2) {
        this.currentPermission = [parts[0].trim(), parts[1].trim()];
      } else {
        this.currentPermission = [parts[0].trim(), 'View'];
      }
    }
    this.updateView();
  }

  ngOnInit(): void {
    // Re-evaluar si los permisos cambian en tiempo de ejecución (ej. tras recargar perfil o roles)
    this.sub = this.permissionService.userRoles$.subscribe(() => {
      this.updateView();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private updateView(): void {
    if (!this.currentPermission) {
      this.show();
      return;
    }

    const [module, action] = this.currentPermission;
    const hasAccess = this.permissionService.hasPermission(module, action);

    if (hasAccess && !this.isVisible) {
      this.show();
    } else if (!hasAccess && this.isVisible) {
      this.hide();
    }
  }

  private show(): void {
    this.viewContainer.createEmbeddedView(this.templateRef);
    this.isVisible = true;
  }

  private hide(): void {
    this.viewContainer.clear();
    this.isVisible = false;
  }
}
