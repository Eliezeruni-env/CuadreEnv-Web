import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../../cuadreEnv/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display deactivated user error message and not navigate when user is inactive', async () => {
    const authService = TestBed.inject(AuthService) as AuthService;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    vi.spyOn(authService, 'login').mockRejectedValue({
      error: {
        statusCode: 403,
        errorCode: 'USER_INACTIVE',
        message: 'Este usuario está desactivado. Contacte al administrador para reactivar su cuenta.'
      }
    });

    component.loginForm.patchValue({
      email: 'inactive@example.com',
      password: 'password123'
    });

    await component.onSubmit();

    expect(component.errorMessage()).toBe('Este usuario está desactivado. Contacte al administrador para reactivar su cuenta.');
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(component.isLoading()).toBe(false);
  });

  it('should handle successful login and redirect to dashboard when no returnUrl', async () => {
    const authService = TestBed.inject(AuthService) as AuthService;
    const router = TestBed.inject(Router);
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true as any);

    vi.spyOn(authService, 'login').mockResolvedValue({ accessToken: 'fake-jwt', refreshToken: 'fake-rt' });
    vi.spyOn(authService, 'companyId').mockReturnValue(1);
    vi.spyOn(authService, 'isSuperUser').mockReturnValue(false);
    authService.allowedModules.set(['sales']);

    component.loginForm.patchValue({
      email: 'admin@cuadreenv.com',
      password: 'validPassword123',
    });

    await component.onSubmit();

    expect(component.errorMessage()).toBeNull();
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/dashboard');
    expect(component.isLoading()).toBe(false);
  });

  it('shows the no-modules dialog and skips protected navigation after login', async () => {
    const authService = TestBed.inject(AuthService) as AuthService;
    const router = TestBed.inject(Router);
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true as any);

    vi.spyOn(authService, 'login').mockResolvedValue({ accessToken: 'fake-jwt', refreshToken: 'fake-rt' });
    authService.allowedModules.set([]);

    component.loginForm.patchValue({
      email: 'nomodules@cuadreenv.com',
      password: 'validPassword123',
    });

    await component.onSubmit();

    expect(component.showNoModulesDialog()).toBe(true);
    expect(navigateByUrlSpy).not.toHaveBeenCalled();
    expect(component.isLoading()).toBe(false);

    component.continueWithoutModules();

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/403');
  });

  it('should display "Correo o contraseña incorrectos" when API returns 400 or 401', async () => {
    const authService = TestBed.inject(AuthService) as AuthService;
    vi.spyOn(authService, 'login').mockRejectedValue({
      status: 400,
      error: {
        statusCode: 400,
        message: 'Invalid email or password',
        errorCode: 'INVALID_CREDENTIALS',
      },
    });

    component.loginForm.patchValue({
      email: 'wrong@cuadreenv.com',
      password: 'wrongPassword',
    });

    await component.onSubmit();

    expect(component.errorMessage()).toBe('Correo o contraseña incorrectos.');
    expect(component.isLoading()).toBe(false);
  });

  it('should display connection error message when API is offline (status 0)', async () => {
    const authService = TestBed.inject(AuthService) as AuthService;
    vi.spyOn(authService, 'login').mockRejectedValue({
      status: 0,
      statusText: 'Unknown Error',
    });

    component.loginForm.patchValue({
      email: 'offline@cuadreenv.com',
      password: 'password123',
    });

    await component.onSubmit();

    expect(component.errorMessage()).toBe('No se pudo conectar con la API en http://localhost:8080/v1. Verifique que el backend esté disponible.');
    expect(component.isLoading()).toBe(false);
  });

  it('should display forbidden message on 403 status', async () => {
    const authService = TestBed.inject(AuthService) as AuthService;
    vi.spyOn(authService, 'login').mockRejectedValue({
      status: 403,
      statusText: 'Forbidden',
      error: { message: 'Acceso no autorizado para este perfil.' },
    });

    component.loginForm.patchValue({
      email: 'forbidden@cuadreenv.com',
      password: 'password123',
    });

    await component.onSubmit();

    expect(component.errorMessage()).toBe('Acceso no autorizado para este perfil.');
    expect(component.isLoading()).toBe(false);
  });

  it('should display not found message on 404 status', async () => {
    const authService = TestBed.inject(AuthService) as AuthService;
    vi.spyOn(authService, 'login').mockRejectedValue({
      status: 404,
      statusText: 'Not Found',
    });

    component.loginForm.patchValue({
      email: 'notfound@cuadreenv.com',
      password: 'password123',
    });

    await component.onSubmit();

    expect(component.errorMessage()).toBe('El servicio de autenticación no fue encontrado en http://localhost:8080/v1/auth/login.');
    expect(component.isLoading()).toBe(false);
  });
});
