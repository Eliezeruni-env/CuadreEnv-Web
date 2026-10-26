import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export interface ConfirmDialogState {
  isOpen: boolean;
  options: ConfirmDialogOptions | null;
  resolve?: (value: boolean) => void;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  private readonly stateSubject = new BehaviorSubject<ConfirmDialogState>({
    isOpen: false,
    options: null,
  });

  public readonly state$: Observable<ConfirmDialogState> = this.stateSubject.asObservable();

  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.stateSubject.next({
        isOpen: true,
        options: {
          confirmText: 'Confirmar',
          cancelText: 'Cancelar',
          type: 'danger',
          ...options,
        },
        resolve,
      });
    });
  }

  handleAction(confirmed: boolean): void {
    const currentState = this.stateSubject.value;
    if (currentState.resolve) {
      currentState.resolve(confirmed);
    }
    this.stateSubject.next({
      isOpen: false,
      options: null,
    });
  }
}
