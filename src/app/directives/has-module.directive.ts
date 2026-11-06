import { Directive, Input, TemplateRef, ViewContainerRef, inject, effect, signal } from '@angular/core';
import { ModuleAccessService } from '../../features/cuadreEnv/services/module-access.service';
import { AuthService } from '../../features/cuadreEnv/services/auth.service';

@Directive({
  selector: '[hasModule]',
  standalone: true,
})
export class HasModuleDirective {
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);
  private authService = inject(AuthService, { optional: true });
  private moduleAccess = inject(ModuleAccessService);

  private moduleCodeSignal = signal<string>('');
  private isRendered = false;

  @Input() set hasModule(moduleCode: string) {
    this.moduleCodeSignal.set(moduleCode || '');
  }

  constructor() {
    effect(() => {
      const code = this.moduleCodeSignal();
      this.moduleAccess.allowedModulesSignal();
      const hasAccess = this.authService
        ? this.authService.hasModuleAccess(code)
        : this.moduleAccess.hasModuleAccess(code);

      if (hasAccess && !this.isRendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.isRendered = true;
      } else if (!hasAccess && this.isRendered) {
        this.viewContainer.clear();
        this.isRendered = false;
      }
    });
  }
}
