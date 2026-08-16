export type UserRole = 'buyer' | 'seller' | 'both' | 'admin' | 'moderator';

export type KYCStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface UserProfile {
  id: string;
  uid?: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  role: UserRole;
  kycStatus: KYCStatus;
  kycTier: number; // Tier 1, Tier 2, Tier 3
  createdAt: string;
  updatedAt: string;
  twoFactorEnabled: boolean;
}

export interface WalletBalance {
  availableBalance: number;
  escrowBalance: number;
  pendingWithdrawalBalance: number;
  currency: 'NGN';
}

export type TransactionType = 'deposit' | 'withdrawal' | 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'fee';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface WalletTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: 'NGN';
  status: TransactionStatus;
  reference: string;
  description: string;
  createdAt: string;
  relatedEscrowId?: string;
}

export type EscrowRole = 'buyer' | 'seller';
export type EscrowStatus = 
  | 'draft'
  | 'awaiting_payment'
  | 'in_escrow'
  | 'funded'
  | 'in_progress'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'refunded';

export interface EscrowMilestone {
  id: string;
  title: string;
  amount: number;
  description?: string;
  status: 'pending' | 'completed' | 'approved';
  dueDate?: string;
}

export interface EscrowTransaction {
  id: string;
  title: string;
  description: string;
  amount: number;
  feeAmount: number;
  totalAmount: number;
  currency: 'NGN';
  status: EscrowStatus;
  userRole: EscrowRole;
  counterpartyName: string;
  counterpartyEmail: string;
  counterpartyPhone?: string;
  buyerId: string;
  sellerId: string;
  deadline: string;
  inspectionPeriodDays: number;
  terms: string;
  milestones?: EscrowMilestone[];
  createdAt: string;
  updatedAt: string;
}

export interface EscrowChatMessage {
  id: string;
  escrowId: string;
  senderId: string;
  senderName: string;
  message: string;
  attachments?: { name: string; url: string; type: string }[];
  createdAt: string;
  isSystemEvent?: boolean;
}

export interface EscrowDispute {
  id: string;
  escrowId: string;
  raisedById: string;
  raisedByName: string;
  reason: string;
  description: string;
  evidenceUrls: string[];
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  resolutionDetails?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ActivityLog {
  id: string;
  title: string;
  description: string;
  category: 'auth' | 'wallet' | 'escrow' | 'kyc' | 'security';
  timestamp: string;
  ipAddress?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
  linkUrl?: string;
}

export interface BankAccount {
  id: string;
  accountNumber: string;
  maskedAccountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  isVerified: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type WithdrawalStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'cancelled';

export interface Withdrawal {
  id: string;
  amount: number;
  currency: 'NGN';
  status: WithdrawalStatus;
  reference: string;
  provider?: string;
  providerReference?: string;
  failureReason?: string;
  bankAccount?: {
    bankName: string;
    accountName: string;
    maskedAccountNumber: string;
  };
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  code?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
