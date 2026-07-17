import type { HomeDashboardResponse } from '@vatrushka/shared';

import { apiClient } from '../../../api';

export function getHomeDashboard(): Promise<HomeDashboardResponse> {
  return apiClient.getHomeDashboard();
}
