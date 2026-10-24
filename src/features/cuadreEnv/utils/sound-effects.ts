/**
 * Utilidad de Efectos de Sonido Sintetizados para POS y PWA
 * Utiliza Web Audio API nativo: 0 dependencias externas, 0 MB de descarga, latencia ultra-baja.
 */

class SoundEffectsService {
  private audioCtx: AudioContext | null = null;
  private isEnabled = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('cuadre_sound_enabled');
      this.isEnabled = stored !== 'false';
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Beep nítido y rápido de escaneo de código de barras (estilo Motorola / Zebra / Honeywell)
   */
  playScannerBeep(): void {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200, ctx.currentTime);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.075);
    } catch {
      // Ignorar restricciones de audio del navegador
    }
  }

  /**
   * Alias genérico de Beep
   */
  playBeep(): void {
    this.playScannerBeep();
  }

  /**
   * Beep grave de error o código no encontrado
   */
  playErrorBeep(): void {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(320, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.12);

      // Segundo pulso de error
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(280, now + 0.15);
      gain2.gain.setValueAtTime(0.15, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now + 0.15);
      osc2.stop(now + 0.28);
    } catch {
      // ignore
    }
  }

  /**
   * Sonido "Ka-ching!" / Campana de Caja Registradora al completar venta exitosa
   */
  playKaChing(): void {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. Primer 'Ding' metálico
      const bell1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      bell1.type = 'sine';
      bell1.frequency.setValueAtTime(1320, now); // E6
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      bell1.connect(gain1);
      gain1.connect(ctx.destination);
      bell1.start(now);
      bell1.stop(now + 0.25);

      // 2. Segundo 'Ching' más alto con resonancia prolongada
      const bell2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      bell2.type = 'sine';
      bell2.frequency.setValueAtTime(1975, now + 0.09); // B6
      gain2.gain.setValueAtTime(0.3, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      bell2.connect(gain2);
      gain2.connect(ctx.destination);
      bell2.start(now + 0.09);
      bell2.stop(now + 0.65);

      // 3. Destello de monedas / brillo armónico
      const shimmer = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmer.type = 'triangle';
      shimmer.frequency.setValueAtTime(2637, now + 0.14); // E7
      shimmerGain.gain.setValueAtTime(0.12, now + 0.14);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(ctx.destination);
      shimmer.start(now + 0.14);
      shimmer.stop(now + 0.55);
    } catch {
      // ignore
    }
  }

  toggleSound(): boolean {
    this.isEnabled = !this.isEnabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cuadre_sound_enabled', String(this.isEnabled));
    }
    return this.isEnabled;
  }

  isSoundActive(): boolean {
    return this.isEnabled;
  }
}

export const soundEffects = new SoundEffectsService();
