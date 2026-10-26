import { Component, EventEmitter, Output, ViewChild, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ModalComponent,
  ModalHeaderComponent,
  ModalBodyComponent,
  ModalFooterComponent,
  ButtonDirective,
  ModalTitleDirective,
  FormControlDirective,
  FormLabelDirective,
} from '@coreui/angular';
import { AuthService } from '../../../cuadreEnv/services/auth.service';

@Component({
  selector: 'app-auth-pos-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    ModalHeaderComponent,
    ModalBodyComponent,
    ModalFooterComponent,
    ButtonDirective,
    ModalTitleDirective,
    FormControlDirective,
    FormLabelDirective,
  ],
  templateUrl: './auth-pos-modal.component.html',
})
export class AuthPosModalComponent {
  private readonly authService = inject(AuthService);

  @ViewChild('modal') modal!: ModalComponent;
  @Output() authenticated = new EventEmitter<{ success: boolean; pin: string }>();

  visible = signal(false);
  pin = signal('');
  errorMessage = signal('');
  actionLabel = signal('Autorizar');

  open(actionLabel: string = 'Autorizar') {
    this.actionLabel.set(actionLabel);
    this.pin.set('');
    this.errorMessage.set('');
    this.visible.set(true);
  }

  close() {
    this.visible.set(false);
  }

  handleVisibleChange(event: any) {
    this.visible.set(event);
  }

  confirm() {
    const isSuper = this.authService.isSuperUser();
    const entered = (this.pin() || '').trim();

    if (isSuper) {
      this.errorMessage.set('');
      this.close();
      this.authenticated.emit({ success: true, pin: 'AUTH-ADMIN-SESSION' });
      return;
    }

    if (!entered) {
      this.errorMessage.set('Por favor, ingresa tu clave de supervisor.');
      return;
    }

    this.errorMessage.set('Acción restringida: Se requiere inicio de sesión con rol de Administrador o Supervisor para aprobar esta operación.');
  }
}

