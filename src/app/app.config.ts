import { ApplicationConfig, ErrorHandler, Injectable } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  provideRouter,
  withInMemoryScrolling,
  withViewTransitions,
  withHashLocation,
  withEnabledBlockingInitialNavigation,
  withRouterConfig,
} from '@angular/router';
import { IconSetService } from '@coreui/icons-angular';
import { iconSubset } from './icons/icon-subset';
import { routes } from './app.routes';
import { authInterceptor, appHttpInterceptor } from './interceptor';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const errorMsg =
      error instanceof Error ? error.message : JSON.stringify(error);
    if (
      errorMsg.includes('ResizeObserver') ||
      errorMsg.includes('Loading chunk') ||
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('NG0100')
    ) {
      return;
    }
    console.error('Unhandled Application Error:', error);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withRouterConfig({
        onSameUrlNavigation: 'reload',
      }),
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
      withEnabledBlockingInitialNavigation(),
      withHashLocation(),
    ),
    {
      provide: IconSetService,
      useFactory: () => {
        const iconSet = new IconSetService();
        iconSet.icons = { ...iconSubset };
        return iconSet;
      },
    },
    provideHttpClient(withInterceptors([authInterceptor, appHttpInterceptor])),
    provideAnimationsAsync(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
