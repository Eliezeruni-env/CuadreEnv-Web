import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CashierDto, CashSessionDto, CashierState } from '../models/cashier';

const CASHIER_STATE_STORAGE_KEY = 'app_pos_cashier_state';

@Injectable({
  providedIn: 'root',
})
export class CashierStateService {
  private initialState: CashierState = {
    cashier: null,
    session: null,
    lastActive: null,
  };

  private stateSubject = new BehaviorSubject<CashierState>(this.loadStateFromStorage());
  public state$: Observable<CashierState> = this.stateSubject.asObservable();

  constructor() {}

  private loadStateFromStorage(): CashierState {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(CASHIER_STATE_STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch (err) {
        console.error('Error loading CashierState from localStorage:', err);
      }
    }
    return this.initialState;
  }

  private saveState(state: CashierState): void {
    this.stateSubject.next(state);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(CASHIER_STATE_STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        console.error('Error saving CashierState to localStorage:', err);
      }
    }
  }

  public getState(): CashierState {
    return this.stateSubject.getValue();
  }

  public hasActiveSession(): boolean {
    const s = this.getState();
    return !!(s.cashier && s.session && !s.session.isClosed);
  }

  public setCashier(cashier: CashierDto): void {
    const current = this.getState();
    const next: CashierState = {
      ...current,
      cashier,
      lastActive: new Date().toISOString(),
    };
    this.saveState(next);
  }

  public setSession(session: CashSessionDto): void {
    const current = this.getState();
    const next: CashierState = {
      ...current,
      session,
      lastActive: new Date().toISOString(),
    };
    this.saveState(next);
  }

  public closeSession(closingAmount: number): void {
    const current = this.getState();
    if (current.session) {
      const updatedSession: CashSessionDto = {
        ...current.session,
        isClosed: true,
        closedAt: new Date().toISOString(),
        closingAmount,
      };
      const next: CashierState = {
        ...current,
        session: updatedSession,
        lastActive: new Date().toISOString(),
      };
      this.saveState(next);
    }
  }

  public clear(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(CASHIER_STATE_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    this.stateSubject.next(this.initialState);
  }

  public getDisplayInfo(): {
    cashierName: string;
    sessionId: number | null;
    openingAmount: number;
    creationDate: string;
  } {
    const s = this.getState();
    const name = s.cashier ? `${s.cashier.firstName} ${s.cashier.lastName}`.trim() : 'Sin Cajero';
    return {
      cashierName: name,
      sessionId: s.session?.id ?? null,
      openingAmount: s.session?.openingAmount ?? 0,
      creationDate: s.session?.creationDate ?? '',
    };
  }
}
