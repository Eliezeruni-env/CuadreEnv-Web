import { Component, signal, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../cuadreEnv/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  forgotForm: FormGroup;
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isSubmitted = signal<boolean>(false);
  submittedEmail = signal<string>('');
  resendCooldown = signal<number>(0);

  private cooldownTimer: any = null;

  constructor() {
    const rememberedEmail = typeof window !== 'undefined'
      ? (localStorage.getItem('cuadre_remember_user') || localStorage.getItem('cuadre_last_email') || '')
      : '';

    this.forgotForm = this.fb.group({
      email: [rememberedEmail, [Validators.required, Validators.email]],
    });
  }

  async onSubmit() {
    if (this.isLoading() || this.resendCooldown() > 0) return;

    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    const email = (this.forgotForm.value.email || '').trim().toLowerCase();
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await this.authService.forgotPassword(email);
      this.submittedEmail.set(email);
      this.successMessage.set(
        res.message || 'Hemos enviado las instrucciones para restablecer tu contraseña a tu correo.'
      );
      this.isSubmitted.set(true);
      this.startCooldown(60);
    } catch (err: any) {
      const msg =
        err?.error?.message ||
        err?.message ||
        'No pudimos procesar la solicitud. Por favor verifica tu correo e intenta nuevamente.';
      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }

  startCooldown(seconds: number) {
    this.resendCooldown.set(seconds);
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const current = this.resendCooldown();
      if (current <= 1) {
        clearInterval(this.cooldownTimer);
        this.resendCooldown.set(0);
      } else {
        this.resendCooldown.set(current - 1);
      }
    }, 1000);
  }
}
