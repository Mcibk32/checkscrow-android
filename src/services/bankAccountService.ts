import { api } from './api';
import { ApiResponse, BankAccount } from '../types';

export interface AddBankAccountPayload {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  accountName?: string;
  isDefault?: boolean;
}

export const bankAccountService = {
  async getBankAccounts(): Promise<ApiResponse<BankAccount[]>> {
    return api.get<BankAccount[]>('/bank-accounts');
  },

  async addBankAccount(payload: AddBankAccountPayload): Promise<ApiResponse<BankAccount>> {
    return api.post<BankAccount>('/bank-accounts', payload);
  },

  async updateBankAccount(id: string, payload: { isDefault?: boolean }): Promise<ApiResponse<{ message: string }>> {
    return api.put<{ message: string }>(`/bank-accounts/${id}`, payload);
  },

  async deleteBankAccount(id: string): Promise<ApiResponse<{ message: string }>> {
    return api.delete<{ message: string }>(`/bank-accounts/${id}`);
  },

  async resolveAccountName(accountNumber: string, bankCode: string): Promise<ApiResponse<{ accountNumber: string; accountName: string; verified: boolean }>> {
    return api.post<{ accountNumber: string; accountName: string; verified: boolean }>('/bank-accounts/resolve', { accountNumber, bankCode });
  },
};
