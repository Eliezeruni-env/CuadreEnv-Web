import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from './user.service';

describe('UserService Direct Pagination Contract & SaaS Management', () => {
  let service: UserService;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    };

    service = new UserService(mockApiClient);
  });

  it('should parse direct un-wrapped paginated response from GET /v1/users', async () => {
    const backendResponse = {
      items: [
        { id: 1, firstName: 'Juan', lastName: 'Perez', email: 'juan@test.com', role: 'Admin', active: true },
        { id: 2, firstName: 'Maria', lastName: 'Lopez', email: 'maria@test.com', role: 'Employee', active: false },
      ],
      total: 25,
      page: 1,
      pageSize: 10,
      totalPages: 3,
    };

    mockApiClient.get.mockResolvedValue(backendResponse);

    const result = await service.getUsers({ page: 1, pageSize: 10, q: 'juan' });

    expect(mockApiClient.get).toHaveBeenCalledWith('/users', {
      params: { page: 1, pageSize: 10, q: 'juan' },
    });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.totalPages).toBe(3);
  });

  it('should expose persisted AllowedModulesJson as an editable module list', async () => {
    mockApiClient.get.mockResolvedValue({
      items: [{
        id: 1,
        firstName: 'Juan',
        lastName: 'Perez',
        email: 'juan@test.com',
        allowedModulesJson: '["sales","cashregister"]',
      }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const result = await service.getUsers();

    expect(result.items[0].allowedModules).toEqual(['sales', 'cashregister']);
  });

  it('should call PATCH /users/{id}/status for activation/deactivation', async () => {
    mockApiClient.patch.mockResolvedValue({});

    await service.toggleStatus(5, false);

    expect(mockApiClient.patch).toHaveBeenCalledWith('/users/5/status', { active: false });
  });

  it('should call POST /users/{id}/reset-password', async () => {
    mockApiClient.post.mockResolvedValue({ result: 'Temp123!' });

    const res = await service.resetPassword(5, { sendByEmail: true });

    expect(mockApiClient.post).toHaveBeenCalledWith('/users/5/reset-password', { sendByEmail: true });
    expect(res.result).toBe('Temp123!');
  });

  it('should not include companyId when creating a user (tenant inferred by backend JWT)', async () => {
    mockApiClient.post.mockResolvedValue({ id: 10 });

    await service.createUser({
      email: 'colab@empresa.com',
      firstName: 'Carlos',
      lastName: 'Santana',
      role: 'Vendedor',
      companyId: 999, // Should be omitted
    } as any);

    expect(mockApiClient.post).toHaveBeenCalledWith('/users', {
      email: 'colab@empresa.com',
      firstName: 'Carlos',
      lastName: 'Santana',
      userName: 'colab@empresa.com',
      role: 'Vendedor',
      temporaryPassword: null,
      sendByEmail: true,
      allowedModules: [],
    });
  });

  it('should send explicit module assignments when creating a user', async () => {
    mockApiClient.post.mockResolvedValue({ id: 10 });

    await service.createUser({
      email: 'colab@empresa.com',
      firstName: 'Carlos',
      lastName: 'Santana',
      allowedModules: ['sales', 'cashregister', 'customers'],
    });

    expect(mockApiClient.post).toHaveBeenCalledWith('/users', expect.objectContaining({
      allowedModules: ['sales', 'cashregister', 'customers'],
    }));
  });

  it('should include module assignments when updating a user', async () => {
    mockApiClient.put.mockResolvedValue({});

    await service.updateUser(5, {
      firstName: 'Carlos',
      lastName: 'Santana',
      userName: 'carlos@example.com',
      role: 'Employee',
      allowedModules: ['sales', 'cashregister'],
    });

    expect(mockApiClient.put).toHaveBeenCalledWith('/users/5', expect.objectContaining({
      allowedModules: ['sales', 'cashregister'],
    }));
  });

  it('should return empty list gracefully when getUsers receives a 404', async () => {
    mockApiClient.get.mockRejectedValue({ status: 404, message: 'Resource not found' });

    const res = await service.getUsers({ page: 1, pageSize: 10 });

    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.success).toBe(true);
  });

  it('should throw friendly error when updating non-existent or foreign tenant user (404)', async () => {
    mockApiClient.put.mockRejectedValue({ status: 404 });

    await expect(
      service.updateUser(999, { firstName: 'Ghost', lastName: 'User' }),
    ).rejects.toThrow('No se puede actualizar: el usuario no existe o pertenece a otra empresa.');
  });
});
