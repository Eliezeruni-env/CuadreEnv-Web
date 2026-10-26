import { Component, signal, inject, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../cuadreEnv/services/auth.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  resetForm: FormGroup;
  token = signal<string>('');
  emailParam = signal<string>('');
  hasToken = signal<boolean>(true);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  isSuccess = signal<boolean>(false);

  showNewPassword = signal<boolean>(false);
  showConfirmPassword = signal<boolean>(false);

  constructor() {
    this.resetForm = this.fb.group(
      {
        email: ['', [Validators.required, Validators.email]],
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const token = qp.get('token') || qp.get('code') || '';
    const email = qp.get('email') || '';

    this.token.set(token);
    this.emailParam.set(email);

    if (email) {
      this.resetForm.patchValue({ email });
    }

    if (!token) {
      this.hasToken.set(false);
      this.errorMessage.set(
        'El enlace de restablecimiento es inválido o no incluye el token de seguridad. Por favor solicita uno nuevo.',
      );
    }
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  toggleShowNewPassword(): void {
    this.showNewPassword.update((v) => !v);
  }

  toggleShowConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  async onSubmit(): Promise<void> {
    if (this.isLoading() || !this.hasToken()) return;

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    const email = (this.resetForm.value.email || '').trim().toLowerCase();
    const newPassword = this.resetForm.value.newPassword;
    const token = this.token();

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.resetPassword({
        email,
        token,
        newPassword,
      });

      // Si el email estaba recordado, actualizarlo con este email
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('cuadre_remember_user', email);
        localStorage.setItem('cuadre_last_email', email);
      }

      this.isSuccess.set(true);
    } catch (err: any) {
      const msg =
        err?.error?.message ||
        err?.message ||
        'No pudimos restablecer tu contraseña. El enlace puede haber expirado.';
      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }
}
