import { Injectable, signal, computed } from '@angular/core';

export interface PwaTenantConfig {
  slug: string;
  name: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  iconPath192: string;
  iconPath512: string;
}

const DEFAULT_PWA_CONFIG: PwaTenantConfig = {
  slug: 'cuadreenv',
  name: 'CuadreEnv POS & Facturación',
  shortName: 'CuadreEnv',
  themeColor: '#0f172a',
  backgroundColor: '#0f172a',
  iconPath192: '/assets/brand/android-chrome-192x192.png',
  iconPath512: '/assets/brand/android-chrome-512x512.png',
};

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  public isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  public hasUpdateAvailable = signal<boolean>(false);
  public canInstall = signal<boolean>(false);
  public isInstalled = signal<boolean>(false);
  public isIos = signal<boolean>(false);
  public showIosInstructions = signal<boolean>(false);
  public showInstallModal = signal<boolean>(false);
  public activeInstallTab = signal<'android' | 'ios' | 'desktop'>('android');
  public currentTenantSlug = signal<string>('cuadreenv');

  private waitingWorker: ServiceWorker | null = null;
  private deferredPrompt: any = null;

  constructor() {
    this.initPwa();
  }

  public getDetectedPlatform(): 'android' | 'ios' | 'desktop' {
    if (typeof window === 'undefined') return 'desktop';
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua) && !(window as any).MSStream) {
      return 'ios';
    }
    if (/android/.test(ua)) {
      return 'android';
    }
    return 'desktop';
  }

  private initPwa(): void {
    if (typeof window === 'undefined') return;

    // 1. Detectar dispositivo iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    this.isIos.set(isAppleDevice);
    this.activeInstallTab.set(this.getDetectedPlatform());

    // 2. Detectar si ya corre en modo Standalone (PWA Instalada)
    const isStandalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)')?.matches) ||
      (window.navigator as any)?.standalone === true ||
      (typeof document !== 'undefined' && document.referrer?.includes('android-app://'));
    this.isInstalled.set(!!isStandalone);

    if (typeof window.matchMedia === 'function') {
      window.matchMedia('(display-mode: standalone)')?.addEventListener?.('change', (e) => {
        if (e.matches) {
          this.isInstalled.set(true);
          this.canInstall.set(false);
          this.showInstallModal.set(false);
        }
      });
    }

    // 3. Multitenant PWA Detection (?e= o localStorage)
    this.resolveAndApplyTenant();

    // 4. Monitoreo de conectividad Online / Offline
    window.addEventListener('online', () => {
      this.isOnline.set(true);
    });
    window.addEventListener('offline', () => {
      this.isOnline.set(false);
    });

    // 5. Escuchar disponibilidad de actualización de SW
    window.addEventListener('cuadreenv:pwa-update-ready', (event: any) => {
      const reg = event.detail as ServiceWorkerRegistration;
      if (reg?.waiting) {
        this.waitingWorker = reg.waiting;
      }
      this.hasUpdateAvailable.set(true);
    });

    // 6. Escuchar evento nativo y personalizado de instalación A2HS
    const capturePrompt = (prompt: any) => {
      if (!prompt) return;
      this.deferredPrompt = prompt;
      (window as any).__pwaInstallPrompt = prompt;
      if (!this.isInstalled()) {
        this.canInstall.set(true);
      }
    };

    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      capturePrompt(e);
    });

    window.addEventListener('cuadreenv:pwa-installable', () => {
      capturePrompt((window as any).__pwaInstallPrompt);
    });

    const markInstalled = () => {
      this.deferredPrompt = null;
      (window as any).__pwaInstallPrompt = null;
      this.canInstall.set(false);
      this.isInstalled.set(true);
      this.showInstallModal.set(false);
      this.showIosInstructions.set(false);
    };

    window.addEventListener('appinstalled', markInstalled);
    window.addEventListener('cuadreenv:pwa-installed', markInstalled);

    // Si ya había capturado el prompt antes de inicializar el servicio
    if ((window as any).__pwaInstallPrompt && !this.isInstalled()) {
      capturePrompt((window as any).__pwaInstallPrompt);
    }
  }

  /**
   * Resuelve el tenant activo desde URL o LocalStorage y actualiza el Manifest dinámicamente
   */
  public resolveAndApplyTenant(): void {
    if (typeof window === 'undefined') return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tenantParam =
        urlParams.get('e') ||
        urlParams.get('tenant') ||
        urlParams.get('empresa');

      let slug = 'cuadreenv';

      if (tenantParam) {
        slug = tenantParam.trim().toLowerCase();
        localStorage.setItem('cuadreenv_pwa_tenant', slug);
      } else {
        const storedSlug = localStorage.getItem('cuadreenv_pwa_tenant');
        if (storedSlug) {
          slug = storedSlug.trim().toLowerCase();
        }
      }

      this.currentTenantSlug.set(slug);
      this.applyDynamicManifest(slug);
    } catch (e) {
      console.warn('[PWA] Error resolving tenant:', e);
    }
  }

  /**
   * Asegura el manifest correcto y metadatos de la PWA
   */
  private applyDynamicManifest(slug: string): void {
    try {
      const formattedName = slug.charAt(0).toUpperCase() + slug.slice(1);
      const isDefault = slug === 'cuadreenv';
      const shortName = isDefault ? 'CuadreEnv' : formattedName.slice(0, 11);

      // CRÍTICO: Mantener siempre la URL estática válida 'assets/manifest.webmanifest'.
      // NUNCA asignar un Blob URL a link[rel="manifest"] porque Chromium rechaza orígenes blob
      // y cancela el evento beforeinstallprompt y la verificabilidad de la PWA.
      let manifestEl = document.getElementById('pwa-manifest-link') as HTMLLinkElement;
      if (!manifestEl) {
        manifestEl = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
      }
      if (manifestEl && !manifestEl.href.includes('assets/manifest.webmanifest')) {
        manifestEl.href = 'assets/manifest.webmanifest';
      }

      // Actualizar título de Apple y página
      const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appleTitle) {
        appleTitle.setAttribute('content', shortName);
      }
      document.title = `${shortName} - POS CuadreEnv`;
    } catch (e) {
      console.warn('[PWA] Error applying dynamic manifest:', e);
    }
  }

  /**
   * Ejecuta el prompt de instalación o abre el asistente guiado
   */
  public async promptInstall(): Promise<void> {
    // Si estamos en iOS, abrir directamente guía de Safari
    if (this.isIos()) {
      this.activeInstallTab.set('ios');
      this.showInstallModal.set(true);
      this.showIosInstructions.set(true);
      return;
    }

    const promptEvent =
      this.deferredPrompt ||
      (typeof window !== 'undefined' ? (window as any).__pwaInstallPrompt : null);

    // 1. Si el navegador soporta y tiene listo el diálogo nativo (Android Chrome / Edge / Desktop Chrome):
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const choiceResult = await promptEvent.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
          this.canInstall.set(false);
          this.isInstalled.set(true);
          this.showInstallModal.set(false);
          this.deferredPrompt = null;
          if (typeof window !== 'undefined') {
            (window as any).__pwaInstallPrompt = null;
          }
          return;
        }
        // Si el usuario presionó "Cancelar" en el diálogo nativo
        return;
      } catch (e) {
        console.warn('[PWA] Native install prompt error, displaying instructions:', e);
      }
    }

    // 2. Si no hay prompt nativo disponible (ej. iOS, navegador que ya mostró el prompt, o sin soporte directo):
    // Mostrar modal con instrucciones paso a paso para su plataforma
    this.activeInstallTab.set(this.getDetectedPlatform());
    this.showInstallModal.set(true);
  }

  /**
   * Aplica la nueva versión del Service Worker y recarga la app
   */
  public applyUpdate(): void {
    if (this.waitingWorker) {
      this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    if (navigator?.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    setTimeout(() => {
      window.location.reload();
    }, 200);
  }

  public closeInstallModal(): void {
    this.showInstallModal.set(false);
    this.showIosInstructions.set(false);
  }

  public closeIosModal(): void {
    this.closeInstallModal();
  }
}
