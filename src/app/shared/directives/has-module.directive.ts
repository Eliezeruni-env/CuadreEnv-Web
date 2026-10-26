import { Directive, effect, inject, Input, OnInit, signal, TemplateRef, ViewContainerRef } from '@angular/core';
import { ModuleAccessService } from '../../../features/cuadreEnv/services/module-access.service';

@Directive({
  selector: '[appHasModule],[hasModule]',
  standalone: true,
})
export class HasModuleDirective implements OnInit {
  private readonly moduleCodeSignal = signal('');
  private isVisible = false;

  private readonly view = inject(ViewContainerRef);
  private readonly template = inject(TemplateRef<any>);
  private readonly ms = inject(ModuleAccessService);

  @Input()
  set appHasModule(moduleCode: string) {
    this.moduleCodeSignal.set(moduleCode || '');
  }

  @Input()
  set hasModule(moduleCode: string) {
    this.moduleCodeSignal.set(moduleCode || '');
  }

  get appHasModule(): string {
    return this.moduleCodeSignal();
  }

  constructor() {
    effect(() => {
      const code = this.moduleCodeSignal();
      this.updateView(code);
    });
  }

  ngOnInit(): void {
    this.updateView(this.moduleCodeSignal());
  }

  private updateView(code: string): void {
    const hasAccess = this.ms.hasModule(code);
    if (hasAccess && !this.isVisible) {
      this.view.createEmbeddedView(this.template);
      this.isVisible = true;
    } else if (!hasAccess && this.isVisible) {
      this.view.clear();
      this.isVisible = false;
    }
  }
}
