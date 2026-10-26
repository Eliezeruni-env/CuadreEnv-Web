import { describe, it, expect } from 'vitest';
import { ConfirmDialogService } from './confirm-dialog.service';

describe('ConfirmDialogService', () => {
  it('should initialize with null state', () => {
    const service = new ConfirmDialogService();
    expect(service.state()).toBeNull();
  });

  it('should set state when confirm is called and resolve true on handleConfirm', async () => {
    const service = new ConfirmDialogService();

    const promise = service.confirm({
      title: '¿Eliminar producto?',
      message: '¿Estás seguro de que deseas eliminar este producto?',
      itemName: 'Laptop Dell XPS',
      itemType: 'Producto',
      variant: 'danger',
    });

    const currentState = service.state();
    expect(currentState).not.toBeNull();
    expect(currentState?.isOpen).toBe(true);
    expect(currentState?.title).toBe('¿Eliminar producto?');
    expect(currentState?.itemName).toBe('Laptop Dell XPS');
    expect(currentState?.confirmText).toBe('Eliminar');
    expect(currentState?.cancelText).toBe('Cancelar');
    expect(currentState?.variant).toBe('danger');

    service.handleConfirm();

    const result = await promise;
    expect(result).toBe(true);
    expect(service.state()).toBeNull();
  });

  it('should resolve false on handleCancel and close dialog', async () => {
    const service = new ConfirmDialogService();

    const promise = service.confirm({
      title: '¿Desactivar usuario?',
      message: 'El usuario no podrá iniciar sesión.',
      variant: 'warning',
    });

    expect(service.state()?.confirmText).toBe('Continuar');

    service.handleCancel();

    const result = await promise;
    expect(result).toBe(false);
    expect(service.state()).toBeNull();
  });
});
