import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class PosAudioService {
  private audioCtx: AudioContext | null = null;
  readonly isMuted = signal<boolean>(false);

  constructor() {
    if (typeof window !== 'undefined') {
      const storedMute = localStorage.getItem('cuadreenv_pos_audio_muted');
      if (storedMute === 'true') {
        this.isMuted.set(true);
      }
    }
  }

  toggleMute(): boolean {
    const next = !this.isMuted();
    this.isMuted.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cuadreenv_pos_audio_muted', String(next));
    }
    return next;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Beep suave y rápido al escanear/añadir un producto al carrito
   */
  playScanSuccess(): void {
    if (this.isMuted()) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // Tono A6 (brillante pero no estridente)

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Audio API no disponible o bloqueado por política de autoplay
    }
  }

  /**
   * Tono doble de alerta cuando un producto no existe o no tiene stock
   */
  playScanError(): void {
    if (this.isMuted()) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(320, ctx.currentTime);
      gain1.gain.setValueAtTime(0.07, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);

      // Segundo tono más grave a los 140ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(220, ctx.currentTime + 0.14);
      gain2.gain.setValueAtTime(0.07, ctx.currentTime + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.14);
      osc2.stop(ctx.currentTime + 0.28);
    } catch {
      // Audio API no disponible
    }
  }

  /**
   * Acorde suave ascendente al completar la venta (Campana de cobro)
   */
  playCheckoutSuccess(): void {
    if (this.isMuted()) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (Acorde Mayor)
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = ctx.currentTime + idx * 0.04;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.06, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    } catch {
      // Audio API no disponible
    }
  }
}
