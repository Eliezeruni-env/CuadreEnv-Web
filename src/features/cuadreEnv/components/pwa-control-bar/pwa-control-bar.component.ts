import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-pwa-control-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pwa-control-bar.component.html',
  styleUrls: ['./pwa-control-bar.component.scss'],
})
export class PwaControlBarComponent {
  public pwaService = inject(PwaService);

  dismissOfflineBanner = false;
  dismissInstallFloating = signal<boolean>(
    typeof window !== 'undefined' &&
      (localStorage.getItem('cuadre_pwa_dismissed') === 'true' ||
        sessionStorage.getItem('cuadre_pwa_dismissed') === 'true'),
  );

  dismissFloating(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.dismissInstallFloating.set(true);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cuadre_pwa_dismissed', 'true');
        sessionStorage.setItem('cuadre_pwa_dismissed', 'true');
      } catch {}
    }
  }

  onInstallClick(): void {
    this.pwaService.promptInstall();
  }

  onUpdateClick(): void {
    this.pwaService.applyUpdate();
  }

  closeInstallModal(): void {
    this.pwaService.closeInstallModal();
  }

  closeIosModal(): void {
    this.pwaService.closeInstallModal();
  }

  setInstallTab(tab: 'android' | 'ios' | 'desktop'): void {
    this.pwaService.activeInstallTab.set(tab);
  }
}
