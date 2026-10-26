import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { delay, filter, map, tap } from 'rxjs/operators';

import { ColorModeService } from '@coreui/angular';
import { IconSetService } from '@coreui/icons-angular';
import { iconSubset } from './icons/icon-subset';

import { ModuleAccessService } from '../features/cuadreEnv/services/module-access.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  title = 'CuadreEnv';

  readonly #destroyRef: DestroyRef = inject(DestroyRef);
  readonly #activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #titleService = inject(Title);
  readonly #moduleAccessService = inject(ModuleAccessService);

  readonly #colorModeService = inject(ColorModeService);
  readonly #iconSetService = inject(IconSetService);

  constructor() {
    this.#titleService.setTitle(this.title);
    // iconSet singleton
    this.#iconSetService.icons = { ...iconSubset };
    this.#colorModeService.localStorageItemName.set(
      'coreui-free-angular-admin-template-theme-default',
    );
    this.#colorModeService.eventName.set('ColorSchemeChange');
  }

  ngOnInit(): void {
    // Inicialización de módulos al cargar la aplicación
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const storedModules = sessionStorage.getItem('allowedModules');
      if (storedModules) {
        try {
          this.#moduleAccessService.init(JSON.parse(storedModules));
        } catch {
          // ignore
        }
      }
    }

    this.#router.events
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((evt) => {
        if (!(evt instanceof NavigationEnd)) {
          return;
        }
      });

    // Clean up legacy hardcoded mock cache keys if present
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const legacyMockKeys = [
          'cuadreenv_purchase_orders_db',
          'cuadreenv_po_receipts_db',
          'cuadreenv_purchases_db',
          'cuadreenv_local_sales_cache',
          'cuadreEnv_inventory_movements',
          'cuadreenv_stock_matrix_db',
        ];
        for (const k of legacyMockKeys) {
          const val = localStorage.getItem(k);
          if (val && (val.includes('Distribuidora Nacional') || val.includes('Coca Cola 2L Regular') || val.includes('Arroz Premium'))) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch {
      // ignore
    }

    this.#activatedRoute.queryParams
      .pipe(
        delay(1),
        map((params) => <string>params['theme']?.match(/^[A-Za-z0-9\s]+/)?.[0]),
        filter((theme) => ['dark', 'light', 'auto'].includes(theme)),
        tap((theme) => {
          this.#colorModeService.colorMode.set(theme);
        }),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe();
  }
}
