import '@angular/compiler';
import { DestroyRef, Injector, runInInjectionContext, TemplateRef, ViewContainerRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ModuleAccessService } from '../../../features/cuadreEnv/services/module-access.service';
import { HasModuleDirective } from './has-module.directive';

function createMockInjector(providers: Map<any, any>) {
  return {
    get(token: any, notFoundValue?: any) {
      if (providers.has(token)) {
        return providers.get(token);
      }
      return notFoundValue;
    },
  } as any;
}

describe('HasModuleDirective', () => {
  it('creates and clears embedded view based on module access', () => {
    const mockViewContainer = {
      createEmbeddedView: vi.fn(),
      clear: vi.fn(),
    };
    const mockTemplateRef = {};
    const mockModuleAccess = {
      hasModule: vi.fn((code: string) => code === 'sales'),
    };
    const mockDestroyRef = { onDestroy: vi.fn() };

    const providers = new Map<any, any>();
    providers.set(ViewContainerRef, mockViewContainer);
    providers.set(TemplateRef, mockTemplateRef);
    providers.set(ModuleAccessService, mockModuleAccess);
    providers.set(DestroyRef, mockDestroyRef);
    const injector = createMockInjector(providers);
    providers.set(Injector, injector);

    let directive!: HasModuleDirective;
    runInInjectionContext(injector, () => {
      directive = new HasModuleDirective();
    });

    directive.appHasModule = 'sales';
    directive.ngOnInit();
    expect(mockViewContainer.createEmbeddedView).toHaveBeenCalledWith(mockTemplateRef);

    directive.appHasModule = 'billing';
    directive.ngOnInit();
    expect(mockViewContainer.clear).toHaveBeenCalled();
  });
});
