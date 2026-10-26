import { Component, signal, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../cuadreEnv/services/auth.service';
import { TranslationService } from '../../../../cuadreEnv/services/translation.service';

function getStableDeviceId(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    let id = localStorage.getItem('cuadre_device_id');
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'device-' + Math.random().toString(36).substring(2, 12);
      localStorage.setItem('cuadre_device_id', id);
    }
    return id;
  }
  return 'web-browser';
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
  ],
})
export class LoginComponent {
  readonly translationService = inject(TranslationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  loginForm: FormGroup;
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  showPassword = signal<boolean>(false);
  showNoModulesDialog = signal<boolean>(false);

  constructor() {
    const rememberedUser = typeof window !== 'undefined'
      ? (localStorage.getItem('cuadre_remember_user') || localStorage.getItem('cuadre_last_email') || '')
      : '';
    const wasRemembered = typeof window !== 'undefined'
      ? localStorage.getItem('cuadre_remember_me_checked') === 'true'
      : false;

    this.loginForm = this.fb.group({
      email: [rememberedUser, [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      rememberMe: [wasRemembered],
    });
  }

  toggleShowPassword() {
    this.showPassword.update((val) => !val);
  }

  async onSubmit() {
    if (this.isLoading()) {
      return;
    }

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const email = this.loginForm.value.email?.trim() || '';
    const password = this.loginForm.value.password || '';
    const rememberMe = !!this.loginForm.value.rememberMe;
    const deviceId = getStableDeviceId();

    try {
      await this.authService.login({
        email,
        password,
        deviceId,
        rememberMe,
      });

      // Persistencia de recordar usuario
      if (typeof window !== 'undefined' && window.localStorage) {
        if (rememberMe) {
          localStorage.setItem('cuadre_remember_user', email);
          localStorage.setItem('cuadre_remember_me_checked', 'true');
          localStorage.setItem('cuadre_last_email', email);
        } else {
          localStorage.removeItem('cuadre_remember_user');
          localStorage.removeItem('cuadre_remember_me_checked');
          localStorage.removeItem('cuadre_last_email');
        }
      }

      if (this.authService.allowedModules().length === 0) {
        this.showNoModulesDialog.set(true);
        return;
      }

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const isMobileDevice =
        typeof window !== 'undefined' &&
        (window.innerWidth <= 768 ||
          /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent.toLowerCase()) ||
          window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as any).standalone === true);

      const targetUrl = returnUrl && !returnUrl.includes('/login')
        ? returnUrl
        : (isMobileDevice ? '/mobile' : '/dashboard');

      const companyId = this.authService.companyId();
      const isSuperUser = this.authService.isSuperUser();

      if (!companyId && !isSuperUser) {
        this.router.navigate(['/companies/create']);
      } else {
        this.router.navigateByUrl(targetUrl);
      }
    } catch (error: any) {
      const responseBody = error?.error ?? error?.response?.data;
      const status = error?.status ?? error?.statusCode ?? responseBody?.statusCode ?? responseBody?.status ?? 0;
      const errorCode = String(responseBody?.errorCode || responseBody?.code || error?.code || '').trim().toUpperCase();
      const serverMsg = typeof responseBody?.message === 'string' ? responseBody.message : (typeof error?.message === 'string' ? error.message : '');

      // Log técnico seguro (nunca contraseñas ni tokens)
      console.error('[Login Diagnostic]', {
        url: error?.url || 'API',
        method: 'POST',
        status,
        statusText: error?.statusText,
        requestId: error?.requestId || error?.headers?.get?.('x-request-id'),
        message: serverMsg,
        rawError: error,
      });

      if (
        errorCode === 'USER_INACTIVE' ||
        serverMsg.toLowerCase().includes('desactivad') ||
        serverMsg.toLowerCase().includes('inactiv')
      ) {
        this.errorMessage.set(
          serverMsg || 'Este usuario está desactivado. Contacte al administrador para reactivar su cuenta.',
        );
        return;
      }

      if (status === 0) {
        this.errorMessage.set('No se pudo conectar con el servidor. Verifique que el backend esté disponible.');
        return;
      }

      if (status === 400 || status === 401) {
        this.errorMessage.set('Correo o contraseña incorrectos.');
        return;
      }

      if (status === 403) {
        this.errorMessage.set(serverMsg || 'Acceso denegado. No tiene permisos para acceder al sistema.');
        return;
      }

      if (status === 404) {
        this.errorMessage.set(serverMsg || 'El servicio de autenticación no fue encontrado en http://localhost:8080/v1/auth/login.');
        return;
      }

      if (status === 429) {
        this.errorMessage.set('Demasiados intentos. Espera unos segundos e inténtalo nuevamente.');
        return;
      }

      if (status >= 500) {
        this.errorMessage.set('Ocurrió un error interno. Intenta nuevamente.');
        return;
      }

      this.errorMessage.set(serverMsg || 'No se pudo iniciar sesión. Por favor verifique sus credenciales.');
    } finally {
      this.isLoading.set(false);
    }
  }

  continueWithoutModules() {
    this.showNoModulesDialog.set(false);
    void this.router.navigateByUrl('/403');
  }
}
