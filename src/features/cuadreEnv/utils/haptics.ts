/**
 * Utilidad de Feedback Háptico para PWA Móvil
 */
export function triggerHaptic(durationMs: number | number[] = 15): void {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Ignorar si el navegador o permisos lo restringen
    }
  }
}

export function triggerHapticSuccess(): void {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([20, 40, 20]);
    } catch {
      // ignore
    }
  }
}
