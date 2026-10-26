import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SessionInvalidationService {
  private readonly invalidatedSubject = new Subject<void>();
  readonly invalidated$ = this.invalidatedSubject.asObservable();

  invalidate(): void {
    this.invalidatedSubject.next();
  }
}
