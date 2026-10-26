import { Directive, Input, TemplateRef, ViewContainerRef, inject, effect } from '@angular/core';
import { ModuleAccessService } from '../../features/cuadreEnv/services/module-access.service';
import { AuthService } from '../../features/cuadreEnv/services/auth.service';

@Directive({
  selector: '[hasModule]',
  standalone: true
})
export class HasModuleDirective {
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);
  private authService = inject(AuthService, { optional: true });
  private moduleAccess = inject(ModuleAccessService);

  private requiredModule: string = '';

  @Input() set hasModule(moduleCode: string) {
    this.requiredModule = moduleCode;
    effect(() => {
      // Forzar suscripción al signal reactivo de módulos
      this.moduleAccess.allowedModulesSignal();
      const hasAccess = this.authService
        ? this.authService.hasModuleAccess(this.requiredModule)
        : this.moduleAccess.hasModuleAccess(this.requiredModule);

      this.viewContainer.clear();
      if (hasAccess) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      }
    }, { allowSignalWrites: true });
  }
}
