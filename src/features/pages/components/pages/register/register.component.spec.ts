import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../../../cuadreEnv/services/auth.service';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  beforeEach(() => {
    authService = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.currentStep()).toBe(1);
  });

  it('should not advance to step 2 if step 1 inputs are invalid', () => {
    component.registerForm.patchValue({
      email: 'invalid-email',
      password: '123',
      repeatPassword: '456'
    });

    component.nextStep();
    expect(component.currentStep()).toBe(1);
  });

  it('should advance to step 2 when step 1 inputs are valid and allow returning to step 1', () => {
    component.registerForm.patchValue({
      email: 'test@example.com',
      password: 'password123',
      repeatPassword: 'password123',
      firstName: 'Juan',
      lastName: 'Pérez'
    });

    component.nextStep();
    expect(component.currentStep()).toBe(2);

    component.prevStep();
    expect(component.currentStep()).toBe(1);
  });

  it('should call authService.register and navigate on successful submission', async () => {
    const registerSpy = vi.spyOn(authService, 'register').mockResolvedValue({
      success: true,
      message: 'OK'
    } as any);
    const loginSpy = vi.spyOn(authService, 'login').mockResolvedValue({} as any);

    component.registerForm.patchValue({
      email: 'test@example.com',
      password: 'password123',
      repeatPassword: 'password123',
      firstName: 'Juan',
      lastName: 'Pérez',
      userName: 'juanp',
      createCompanyName: 'Mi Empresa SRL'
    });

    await component.onSubmit();

    expect(registerSpy).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Juan',
      lastName: 'Pérez',
      userName: 'juanp',
      createCompanyName: 'Mi Empresa SRL'
    });
    expect(loginSpy).toHaveBeenCalled();
  });
});
