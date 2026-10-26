import { Component, Input, Output, EventEmitter, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { InvitationService } from '../../services/invitation.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { IconDirective } from '@coreui/icons-angular';
import {
  ButtonDirective,
  FormControlDirective,
  FormDirective,
  SpinnerComponent
} from '@coreui/angular';

@Component({
  selector: 'app-invite-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonDirective,
    FormControlDirective,
    FormDirective,
    SpinnerComponent,
    IconDirective
  ],
  templateUrl: './invite-modal.component.html',
})
export class InviteModalComponent {
  readonly translationService = inject(TranslationService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  isLoading = signal<boolean>(false);
  generatedInviteUrl = signal<string | null>(null);

  inviteForm: FormGroup;

  constructor(
    private invitationService: InvitationService,
    private notificationService: NotificationService,
    private fb: FormBuilder
  ) {
    this.inviteForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      validDays: [7, [Validators.required, Validators.min(1)]]
    });
  }

  open() {
    this.generatedInviteUrl.set(null);
    this.inviteForm.reset({
      email: '',
      validDays: 7
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async sendInvitation() {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formVal = this.inviteForm.value;

    try {
      const res = await this.invitationService.createInvitation(formVal.email, formVal.validDays);
      if (res.success && res.data) {
        // Construct join URL
        const domain = window.location.origin;
        const joinLink = `${domain}/#/accept-invitation?token=${res.data.token}`;
        this.generatedInviteUrl.set(joinLink);
        this.notificationService.success('Invitation token created!');
        this.saved.emit();
      } else {
        this.notificationService.error(res.message || 'Failed to create invitation.');
      }
    } catch (e: any) {
      this.notificationService.error(e?.response?.data?.message || e?.message || 'Error generating invitation.');
    } finally {
      this.isLoading.set(false);
    }
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    this.notificationService.success('Copied invitation URL to clipboard!');
  }
}
