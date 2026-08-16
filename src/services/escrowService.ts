import { api } from './api';
import { ApiResponse, EscrowTransaction, EscrowChatMessage, EscrowDispute } from '../types';

export interface CreateEscrowPayload {
  title: string;
  description: string;
  amount: number;
  role: 'buyer' | 'seller';
  counterpartyEmail: string;
  counterpartyPhone?: string;
  inspectionPeriodDays: number;
  terms: string;
  deadline?: string;
}

export const escrowService = {
  async getEscrows(status?: string): Promise<ApiResponse<EscrowTransaction[]>> {
    const query = status ? `?status=${status}` : '';
    return api.get<EscrowTransaction[]>(`/escrow${query}`);
  },

  async getEscrowById(id: string): Promise<ApiResponse<EscrowTransaction>> {
    return api.get<EscrowTransaction>(`/escrow/${id}`);
  },

  async createEscrow(payload: CreateEscrowPayload): Promise<ApiResponse<EscrowTransaction>> {
    return api.post<EscrowTransaction>('/escrow', payload);
  },

  async fundEscrow(escrowId: string): Promise<ApiResponse<{ message: string; escrow: EscrowTransaction }>> {
    return api.post<{ message: string; escrow: EscrowTransaction }>(`/escrow/${escrowId}/fund`);
  },

  async markDelivered(escrowId: string): Promise<ApiResponse<{ message: string; escrow: EscrowTransaction }>> {
    return api.post<{ message: string; escrow: EscrowTransaction }>(`/escrow/${escrowId}/deliver`);
  },

  async confirmCompletion(escrowId: string): Promise<ApiResponse<{ message: string; escrow: EscrowTransaction }>> {
    return api.post<{ message: string; escrow: EscrowTransaction }>(`/escrow/${escrowId}/confirm`);
  },

  async cancelEscrow(escrowId: string): Promise<ApiResponse<{ message: string }>> {
    return api.post<{ message: string }>(`/escrow/${escrowId}/cancel`);
  },

  async raiseDispute(escrowId: string, reason: string, description: string): Promise<ApiResponse<EscrowDispute>> {
    return api.post<EscrowDispute>(`/escrow/${escrowId}/dispute`, { reason, description });
  },

  async getDisputeDetails(escrowId: string): Promise<ApiResponse<EscrowDispute>> {
    return api.get<EscrowDispute>(`/escrow/${escrowId}/dispute`);
  },

  async resolveDispute(
    escrowId: string,
    payload: {
      resolution: 'refund_buyer' | 'release_to_seller' | 'split';
      buyerAmount?: number;
      sellerAmount?: number;
      resolutionNotes?: string;
    }
  ): Promise<ApiResponse<{ message: string }>> {
    return api.post<{ message: string }>(`/escrow/${escrowId}/dispute/resolve`, payload);
  },

  async getChatMessages(escrowId: string): Promise<ApiResponse<EscrowChatMessage[]>> {
    return api.get<EscrowChatMessage[]>(`/escrow/${escrowId}/chat`);
  },

  async sendChatMessage(escrowId: string, message: string): Promise<ApiResponse<EscrowChatMessage>> {
    return api.post<EscrowChatMessage>(`/escrow/${escrowId}/chat`, { message });
  }
};
