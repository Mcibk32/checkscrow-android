import { api } from './api';
import { ApiResponse, WalletBalance, WalletTransaction, Withdrawal } from '../types';

export interface DepositPayload {
  amount: number;
  paymentMethod: 'bank_transfer' | 'card' | 'ussd' | string;
}

export interface DepositResponse {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  checkoutUrl?: string;
  provider?: string;
  providerReference?: string;
}

export interface VerifyPaymentResponse {
  reference: string;
  amount: number;
  currency: string;
  status: 'successful' | 'pending' | 'failed' | 'cancelled';
  alreadyCredited?: boolean;
  availableBalance?: number;
}

export interface WithdrawPayload {
  amount: number;
  bankAccountId?: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
}

export const walletService = {
  async getBalance(): Promise<ApiResponse<WalletBalance>> {
    return api.get<WalletBalance>('/wallet/balance');
  },

  async getTransactions(page = 1, limit = 20): Promise<ApiResponse<{ transactions: WalletTransaction[]; total: number }>> {
    return api.get<{ transactions: WalletTransaction[]; total: number }>(`/wallet/transactions?page=${page}&limit=${limit}`);
  },

  async initiateDeposit(payload: DepositPayload): Promise<ApiResponse<DepositResponse>> {
    return api.post<DepositResponse>('/wallet/deposit', payload);
  },

  async verifyPayment(reference: string): Promise<ApiResponse<VerifyPaymentResponse>> {
    return api.get<VerifyPaymentResponse>(`/payments/verify/${encodeURIComponent(reference)}`);
  },

  async getPaymentStatus(reference: string): Promise<ApiResponse<DepositResponse>> {
    return api.get<DepositResponse>(`/payments/status/${encodeURIComponent(reference)}`);
  },

  async initiateWithdrawal(payload: WithdrawPayload): Promise<ApiResponse<Withdrawal>> {
    return api.post<Withdrawal>('/wallet/withdraw', payload);
  },

  async getWithdrawals(): Promise<ApiResponse<Withdrawal[]>> {
    return api.get<Withdrawal[]>('/wallet/withdrawals');
  },

  async getWithdrawalByReference(reference: string): Promise<ApiResponse<Withdrawal>> {
    return api.get<Withdrawal>(`/wallet/withdrawals/${encodeURIComponent(reference)}`);
  },

  async cancelWithdrawal(reference: string): Promise<ApiResponse<{ reference: string; status: string; amount: number }>> {
    return api.post<{ reference: string; status: string; amount: number }>(`/wallet/withdrawals/${encodeURIComponent(reference)}/cancel`, {});
  },
};
