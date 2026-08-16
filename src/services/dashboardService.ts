import { api } from './api';
import { ApiResponse } from '../types';

export interface DashboardResponseData {
  isGuest: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    kycStatus: string;
    kycTier: number;
  } | null;
  wallet: {
    availableBalance: number;
    escrowBalance: number;
    pendingWithdrawalBalance: number;
    currency: string;
  };
  escrow: {
    protectedFunds: number;
    currency: string;
  };
  recentTransactions: any[];
  activeEscrows: any[];
}

export const dashboardService = {
  async getDashboardData(): Promise<ApiResponse<DashboardResponseData>> {
    return api.get<DashboardResponseData>('/dashboard');
  },
};
