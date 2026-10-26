import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApprovalService } from './approval.service';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import { AuthService } from '../../cuadreEnv/services/auth.service';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let mockApi: any;
  let mockAuth: any;

  beforeEach(() => {
    mockApi = {
      get: vi.fn().mockRejectedValue(new Error('Endpoint not found')),
      post: vi.fn().mockRejectedValue(new Error('Endpoint not found')),
    };

    mockAuth = {
      companyId: vi.fn().mockReturnValue(99),
      currentUser: vi.fn().mockReturnValue({ id: 1, email: 'admin@empresa.com' }),
    };

    TestBed.configureTestingModule({
      providers: [
        ApprovalService,
        { provide: ApiClientService, useValue: mockApi },
        { provide: AuthService, useValue: mockAuth },
      ],
    });

    localStorage.clear();
    service = TestBed.inject(ApprovalService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with pending approvals and computed counters', async () => {
    const list = await service.loadApprovals();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(service.pendingCount()).toBeGreaterThan(0);
  });

  it('should approve a pending deletion request', async () => {
    const pending = service.pendingApprovals();
    const first = pending[0];

    const approved = await service.approve(first.id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewedByUserId).toBe(1);

    const afterPending = service.pendingApprovals();
    expect(afterPending.some((a) => a.id === first.id)).toBeFalsy();
  });

  it('should reject a pending deletion request with a reason', async () => {
    const pending = service.pendingApprovals();
    const first = pending[0];

    const rejected = await service.reject(first.id, 'No procede porque está en cierre fiscal');
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe('No procede porque está en cierre fiscal');

    const afterPending = service.pendingApprovals();
    expect(afterPending.some((a) => a.id === first.id)).toBeFalsy();
  });
});
