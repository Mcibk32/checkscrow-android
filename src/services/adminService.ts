import { api } from './api';
import { ApiResponse } from '../types';

export interface AdminStats {
  totalUsers: number;
  verifiedUsers: number;
  pendingKyc: number;
  suspendedUsers: number;
  activeEscrows: number;
  completedEscrows: number;
  disputedEscrows: number;
  totalWalletBalances: number;
  totalLockedEscrow: number;
  pendingWithdrawals: number;
  successfulDeposits: number;
  failedPayments: number;
  openDisputes: number;
}

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: string;
  accountStatus: string;
  kycStatus: string;
  kycTier: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail extends AdminUserItem {
  registrationDate: string;
  wallet: {
    availableBalance: number;
    escrowBalance: number;
    pendingWithdrawalBalance: number;
    currency: string;
  };
  transactionCount: number;
  activeEscrowCount: number;
  recentActivity: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    timestamp: string;
  }>;
}

export interface KycApplicationItem {
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  kycStatus: string;
  kycTier: number;
  submissionDate: string;
}

export interface AdminEscrowItem {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  paymentStatus: string;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  sellerId?: string;
  sellerEmail?: string;
  sellerName?: string;
  createdAt: string;
  updatedAt: string;
  deadline: string;
}

export interface AdminDisputeItem {
  id: string;
  escrowId: string;
  escrowTitle: string;
  escrowAmount: number;
  escrowStatus: string;
  buyerEmail: string;
  sellerEmail: string;
  buyerId: string;
  sellerId?: string;
  raisedById: string;
  raisedByName: string;
  raisedByEmail: string;
  reason: string;
  description: string;
  status: string;
  resolution?: string;
  resolutionDetails?: string;
  buyerSplitAmount?: number | null;
  sellerSplitAmount?: number | null;
  createdAt: string;
  resolvedAt?: string;
}

export interface AdminWithdrawalItem {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  currency: string;
  bankName: string;
  accountName: string;
  maskedAccountNumber: string;
  status: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AdminPaymentItem {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  paymentMethod: string;
  createdAt: string;
  completedAt?: string;
}

export interface AdminAuditLogItem {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  category: string;
  targetId: string;
  targetType: string;
  description: string;
  metadata?: string;
  timestamp: string;
}

export const adminService = {
  async getStats(): Promise<ApiResponse<AdminStats>> {
    return api.get<AdminStats>('/admin/stats');
  },

  async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    account_status?: string;
    kyc_status?: string;
    role?: string;
  } = {}): Promise<ApiResponse<AdminUserItem[]>> {
    const q = new URLSearchParams();
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));
    if (params.search) q.append('search', params.search);
    if (params.account_status) q.append('account_status', params.account_status);
    if (params.kyc_status) q.append('kyc_status', params.kyc_status);
    if (params.role) q.append('role', params.role);
    return api.get<AdminUserItem[]>(`/admin/users?${q.toString()}`);
  },

  async getUserById(id: string): Promise<ApiResponse<AdminUserDetail>> {
    return api.get<AdminUserDetail>(`/admin/users/${id}`);
  },

  async updateUserStatus(id: string, status: 'active' | 'suspended' | 'inactive'): Promise<ApiResponse<void>> {
    return api.put<void>(`/admin/users/${id}/status`, { status });
  },

  async updateUserRole(id: string, role: 'user' | 'moderator' | 'admin'): Promise<ApiResponse<void>> {
    return api.put<void>(`/admin/users/${id}/role`, { role });
  },

  async getKycList(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {}): Promise<ApiResponse<KycApplicationItem[]>> {
    const q = new URLSearchParams();
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));
    if (params.status) q.append('status', params.status);
    if (params.search) q.append('search', params.search);
    return api.get<KycApplicationItem[]>(`/admin/kyc?${q.toString()}`);
  },

  async approveKyc(userId: string): Promise<ApiResponse<void>> {
    return api.post<void>(`/admin/kyc/${userId}/approve`);
  },

  async rejectKyc(userId: string, reason: string): Promise<ApiResponse<void>> {
    return api.post<void>(`/admin/kyc/${userId}/reject`, { reason });
  },

  async getEscrows(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {}): Promise<ApiResponse<AdminEscrowItem[]>> {
    const q = new URLSearchParams();
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));
    if (params.status) q.append('status', params.status);
    if (params.search) q.append('search', params.search);
    return api.get<AdminEscrowItem[]>(`/admin/escrows?${q.toString()}`);
  },

  async getDisputes(params: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}): Promise<ApiResponse<AdminDisputeItem[]>> {
    const q = new URLSearchParams();
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));
    if (params.status) q.append('status', params.status);
    return api.get<AdminDisputeItem[]>(`/admin/disputes?${q.toString()}`);
  },

  async resolveDispute(
    escrowId: string,
    body: {
      resolution: 'refund_buyer' | 'release_to_seller' | 'split';
      buyerAmount?: number;
      sellerAmount?: number;
      resolutionNotes?: string;
    }
  ): Promise<ApiResponse<void>> {
    return api.post<void>(`/admin/disputes/${escrowId}/resolve`, body);
  },

  async getWithdrawals(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {}): Promise<ApiResponse<AdminWithdrawalItem[]>> {
    const q = new URLSearchParams();
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));
    if (params.status) q.append('status', params.status);
    if (params.search) q.append('search', params.search);
    return api.get<AdminWithdrawalItem[]>(`/admin/withdrawals?${q.toString()}`);
  },

  async getPayments(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {}): Promise<ApiResponse<AdminPaymentItem[]>> {
    const q = new URLSearchParams();
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));
    if (params.status) q.append('status', params.status);
    if (params.search) q.append('search', params.search);
    return api.get<AdminPaymentItem[]>(`/admin/payments?${q.toString()}`);
  },

  async getAuditLogs(params: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  } = {}): Promise<ApiResponse<AdminAuditLogItem[]>> {
    const q = new URLSearchParams();
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));
    if (params.category) q.append('category', params.category);
    if (params.search) q.append('search', params.search);
    return api.get<AdminAuditLogItem[]>(`/admin/audit-logs?${q.toString()}`);
  },
};
