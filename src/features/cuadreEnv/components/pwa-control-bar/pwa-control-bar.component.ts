import { Component, inject } from '@angular/core';
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
  dismissInstallFloating = typeof window !== 'undefined' && localStorage.getItem('cuadre_pwa_dismissed') === 'true';

  dismissFloating(): void {
    this.dismissInstallFloating = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cuadre_pwa_dismissed', 'true');
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
