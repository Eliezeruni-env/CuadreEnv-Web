// src/app/services/theme.service.ts
import { Injectable, inject } from '@angular/core';
import { ColorModeService } from '@coreui/angular';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly colorMode = inject(ColorModeService);
  private readonly storageKey = 'app-theme';

  get isDark(): boolean {
    return this.colorMode.colorMode() === 'dark';
  }

  constructor() {
    const saved = localStorage.getItem(this.storageKey) as 'light' | 'dark' | 'auto' | null;
    if (saved) {
      this.setTheme(saved);
    }
  }

  /** Set the theme explicitly and persist */
  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.colorMode.colorMode.set(theme);
    localStorage.setItem(this.storageKey, theme);
  }

  /** Toggle between light and dark */
  toggle(): void {
    const current = this.colorMode.colorMode();
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next as 'light' | 'dark' | 'auto');
  }
}
