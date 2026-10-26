import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  timestamp: Date;
  autohide?: boolean;
  delay?: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  messages = signal<ToastMessage[]>([]);

  show(options: {
    title?: string;
    message: string;
    type?: 'success' | 'danger' | 'warning' | 'info';
    autohide?: boolean;
    delay?: number;
  }) {
    const id = Math.random().toString(36).substring(2, 9);
    const toast: ToastMessage = {
      id,
      title: options.title,
      message: options.message,
      type: options.type || 'info',
      timestamp: new Date(),
      autohide: options.autohide !== false,
      delay: options.delay || 4000,
    };

    this.messages.update((items) => [...items, toast]);

    if (toast.autohide) {
      setTimeout(() => {
        this.remove(id);
      }, toast.delay);
    }
  }

  success(message: string, title = 'Éxito') {
    this.show({ title, message, type: 'success' });
  }

  error(message: string, title = 'Error') {
    this.show({ title, message, type: 'danger' });
  }

  warning(message: string, title = 'Advertencia') {
    this.show({ title, message, type: 'warning' });
  }

  info(message: string, title = 'Información') {
    this.show({ title, message, type: 'info' });
  }

  remove(id: string) {
    this.messages.update((items) => items.filter((m) => m.id !== id));
  }
}
