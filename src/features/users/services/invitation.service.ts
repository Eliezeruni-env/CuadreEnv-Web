import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import type {
  InvitationRequest,
  AcceptInvitationRequest,
  ApiResponse,
} from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class InvitationService {
  private readonly api = inject(ApiClientService);
  async createInvitation(
    email: string,
    validDays?: number,
  ): Promise<ApiResponse<{ token: string; expiresAt: string }>> {
    const res = await this.api.post<any, { token: string; expiresAt: string }>(
      '/Invitations',
      {
        email,
        validDays,
      },
    );
    return { success: true, data: res };
  }

  async acceptInvitation(
    data: AcceptInvitationRequest,
  ): Promise<ApiResponse<any>> {
    const res = await this.api.post<any, any>('/Invitations/accept', data);
    return { success: true, data: res };
  }
}
