import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly api = inject(ApiClientService);

  async getMySubscription(): Promise<ApiResponse<any>> {
    const res = await this.api.get<any, any>('/Subscription/my');
    return { success: true, data: res };
  }
}
