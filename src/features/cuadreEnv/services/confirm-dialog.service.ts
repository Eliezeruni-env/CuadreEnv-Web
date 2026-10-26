import { Injectable, signal } from '@angular/core';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  itemName?: string;
  itemType?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'info';
  icon?: string;
  details?: string;
}

export interface ConfirmDialogState extends ConfirmDialogOptions {
  id: number;
  isOpen: boolean;
  resolve: (value: boolean) => void;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  private dialogState = signal<ConfirmDialogState | null>(null);
  private nextId = 1;

  readonly state = this.dialogState.asReadonly();

  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const id = this.nextId++;
      this.dialogState.set({
        ...options,
        id,
        isOpen: true,
        confirmText: options.confirmText || (options.variant === 'warning' ? 'Continuar' : 'Eliminar'),
        cancelText: options.cancelText || 'Cancelar',
        variant: options.variant || 'danger',
        icon: options.icon || (options.variant === 'warning' ? 'cilWarning' : 'cilTrash'),
        resolve,
      });
    });
  }

  handleConfirm() {
    const current = this.dialogState();
    if (current) {
      current.resolve(true);
      this.close();
    }
  }

  handleCancel() {
    const current = this.dialogState();
    if (current) {
      current.resolve(false);
      this.close();
    }
  }

  private close() {
    this.dialogState.set(null);
  }
}
