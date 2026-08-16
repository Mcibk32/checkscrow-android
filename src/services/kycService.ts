import { api } from './api';
import { ApiResponse, KYCStatus } from '../types';

export interface SubmitKYCPayload {
  bvn?: string;
  nin?: string;
  idType?: 'passport' | 'drivers_license' | 'voters_card' | 'nin_slip';
  idNumber?: string;
  idDocumentUrl?: string;
  selfieUrl?: string;
}

export const kycService = {
  async getKYCStatus(): Promise<ApiResponse<{ status: KYCStatus; tier: number; rejectionReason?: string }>> {
    return api.get<{ status: KYCStatus; tier: number; rejectionReason?: string }>('/kyc/status');
  },

  async submitVerification(payload: SubmitKYCPayload): Promise<ApiResponse<{ message: string; status: KYCStatus }>> {
    return api.post<{ message: string; status: KYCStatus }>('/kyc/verify', payload);
  }
};
