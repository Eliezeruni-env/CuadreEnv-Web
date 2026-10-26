import { Component, signal } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../cuadreEnv/services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
  ],
})
export class RegisterComponent {
  registerForm: FormGroup;
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  currentStep = signal<number>(1);
  showPassword = signal<boolean>(false);
  showRepeatPassword = signal<boolean>(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
  ) {
    this.registerForm = this.fb.group(
      {
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        repeatPassword: ['', [Validators.required]],
        firstName: [''],
        lastName: [''],
        userName: [''],
        createCompanyName: [''],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  toggleShowPassword() {
    this.showPassword.update((v) => !v);
  }

  toggleShowRepeatPassword() {
    this.showRepeatPassword.update((v) => !v);
  }

  nextStep() {
    const step1Controls = ['email', 'password', 'repeatPassword'];
    let hasError = false;

    step1Controls.forEach((field) => {
      const ctrl = this.registerForm.get(field);
      ctrl?.markAsTouched();
      if (ctrl?.invalid) {
        hasError = true;
      }
    });

    if (this.registerForm.hasError('mismatch')) {
      hasError = true;
    }

    if (hasError) {
      return;
    }

    this.currentStep.set(2);
  }

  prevStep() {
    this.currentStep.set(1);
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('repeatPassword')?.value
      ? null
      : { mismatch: true };
  }

  async onSubmit() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const formVal = this.registerForm.value;

    try {
      const res = await this.authService.register({
        email: formVal.email,
        password: formVal.password,
        firstName: formVal.firstName || null,
        lastName: formVal.lastName || null,
        userName: formVal.userName || null,
        createCompanyName: formVal.createCompanyName || null,
      });

      if (res.success) {
        this.successMessage.set('Registration successful! Logging in...');

        // Auto-login after registration
        await this.authService.login({
          email: formVal.email,
          password: formVal.password,
          deviceId: 'web-browser',
        });

        setTimeout(() => {
          if (formVal.createCompanyName) {
            this.router.navigate(['/dashboard']);
          } else {
            this.router.navigate(['/companies/create']);
          }
        }, 1500);
      } else {
        this.errorMessage.set(res.message || 'Registration failed.');
      }
    } catch (error: any) {
      const serverMsg = error?.response?.data?.message || error?.message;
      const errors = error?.response?.data?.errors;
      if (errors && errors.length > 0) {
        this.errorMessage.set(errors.join(', '));
      } else {
        this.errorMessage.set(
          serverMsg || 'An error occurred during registration.',
        );
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
