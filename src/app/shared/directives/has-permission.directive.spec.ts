import '@angular/compiler';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HasPermissionDirective } from './has-permission.directive';
import { PermissionService } from '../../../features/roles/services/permission.service';
import { AuthService } from '../../../features/cuadreEnv/services/auth.service';

@Component({
  template: `
    <button id="btn-sales-create" *appHasPermission="['Sales', 'Create']">Crear Venta</button>
    <button id="btn-sales-delete" *appHasPermission="'Sales:Delete'">Eliminar Venta</button>
  `,
  standalone: true,
  imports: [HasPermissionDirective],
})
class TestHostComponent {}

describe('HasPermissionDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let mockAuthService: any;
  let permissionService: PermissionService;

  beforeEach(async () => {
    mockAuthService = {
      isSuperUser: vi.fn().mockReturnValue(false),
      isPlatformSuperUser: vi.fn().mockReturnValue(false),
      hasExplicitModuleClaims: vi.fn().mockReturnValue(false),
      currentRole: vi.fn().mockReturnValue('Cajero'),
      currentRoles: vi.fn().mockReturnValue(['Cajero']),
      allowedModules: vi.fn().mockReturnValue([]),
      userPermissions: vi.fn().mockReturnValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [TestHostComponent, HasPermissionDirective],
      providers: [
        PermissionService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    permissionService = TestBed.inject(PermissionService);
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  it('should display Sales:Create for Cajero role', () => {
    const btnCreate = fixture.nativeElement.querySelector('#btn-sales-create');
    expect(btnCreate).toBeTruthy();
    expect(btnCreate.textContent).toContain('Crear Venta');
  });

  it('should hide Sales:Delete for Cajero role', () => {
    const btnDelete = fixture.nativeElement.querySelector('#btn-sales-delete');
    expect(btnDelete).toBeFalsy();
  });

  it('should show all buttons when user has Admin role', () => {
    mockAuthService.currentRole.mockReturnValue('Admin');
    mockAuthService.currentRoles.mockReturnValue(['Admin']);
    permissionService.refreshUserPermissions();
    fixture.detectChanges();

    const btnCreate = fixture.nativeElement.querySelector('#btn-sales-create');
    const btnDelete = fixture.nativeElement.querySelector('#btn-sales-delete');

    expect(btnCreate).toBeTruthy();
    expect(btnDelete).toBeTruthy();
  });
});
