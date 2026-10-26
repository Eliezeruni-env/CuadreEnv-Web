import { Injectable, signal } from '@angular/core';
import { mapApiErrorToUserMessage, MappedApiError } from '../utils/api-error-mapper';

export interface ToastMessage {
  id: number;
  title: string;
  message: string;
  color: 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'dark';
  visible: boolean;
  requestId?: string;
  errorCode?: string;
  isCritical?: boolean;
  copied?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  toasts = signal<ToastMessage[]>([]);
  private nextId = 1;

  show(
    title: string,
    message: string,
    color: ToastMessage['color'] = 'info',
    delay = 6000,
    meta?: { requestId?: string; errorCode?: string; isCritical?: boolean },
  ) {
    const id = this.nextId++;
    const newToast: ToastMessage = {
      id,
      title,
      message,
      color,
      visible: true,
      requestId: meta?.requestId,
      errorCode: meta?.errorCode,
      isCritical: meta?.isCritical,
      copied: false,
    };

    // Prevent duplicate toast if already showing the exact same title & message
    const existing = this.toasts().find(
      (t) => t.visible && t.title === title && t.message === message,
    );
    if (existing) {
      return existing.id;
    }

    this.toasts.update((prev) => [...prev, newToast]);

    // Keep critical errors longer (10s) so user has time to copy requestId
    const effectiveDelay = meta?.isCritical ? Math.max(delay, 10000) : delay;

    if (effectiveDelay > 0) {
      setTimeout(() => {
        this.remove(id);
      }, effectiveDelay);
    }
    return id;
  }

  showApiError(rawError: any): MappedApiError {
    const mapped = mapApiErrorToUserMessage(rawError);
    const colorMap: Record<string, ToastMessage['color']> = {
      danger: 'danger',
      warning: 'warning',
      info: 'info',
    };

    this.show(
      mapped.title,
      mapped.message,
      colorMap[mapped.type] || 'danger',
      mapped.isCritical ? 10000 : 6000,
      {
        requestId: mapped.requestId,
        errorCode: mapped.errorCode,
        isCritical: mapped.isCritical,
      },
    );

    return mapped;
  }

  success(message: string, title = 'Éxito') {
    this.show(title, message, 'success');
  }

  error(message: string, title = 'Error', requestId?: string) {
    this.show(title, message, 'danger', 6000, { requestId });
  }

  warning(message: string, title = 'Advertencia', requestId?: string) {
    this.show(title, message, 'warning', 6000, { requestId });
  }

  info(message: string, title = 'Información') {
    this.show(title, message, 'info');
  }

  async copyRequestId(id: number, requestId?: string) {
    if (!requestId) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(requestId);
      } else {
        // Fallback for older clipboard access
        const el = document.createElement('textarea');
        el.value = requestId;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }

      this.toasts.update((prev) =>
        prev.map((t) => (t.id === id ? { ...t, copied: true } : t)),
      );

      setTimeout(() => {
        this.toasts.update((prev) =>
          prev.map((t) => (t.id === id ? { ...t, copied: false } : t)),
        );
      }, 2500);
    } catch (err) {
      console.warn('Failed to copy requestId to clipboard:', err);
    }
  }

  remove(id: number) {
    this.toasts.update((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: false } : t)),
    );
    // Cleanup from DOM array after transition completes
    setTimeout(() => {
      this.toasts.update((prev) => prev.filter((t) => t.id !== id));
    }, 400);
  }
}

