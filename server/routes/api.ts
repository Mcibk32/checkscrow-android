import { Router } from 'express';
import { requireAuth, optionalAuth, requireAdmin, requireModerator } from '../middleware/auth';
import { getCurrentUser, registerUser, loginUser, logoutUser } from '../controllers/authController';
import { getDashboardData } from '../controllers/dashboardController';
import { getWalletBalance, getWalletTransactions } from '../controllers/walletController';
import { initiateDeposit, verifyPayment, getPaymentStatus, handleWebhook } from '../controllers/paymentController';
import {
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  resolveAccountName,
} from '../controllers/bankAccountController';
import {
  requestWithdrawal,
  getWithdrawals,
  getWithdrawalByReference,
  cancelWithdrawal,
} from '../controllers/withdrawalController';
import {
  getEscrows,
  getEscrowById,
  createEscrow,
  fundEscrow,
  confirmEscrow,
  deliverEscrow,
  cancelEscrow,
  disputeEscrow,
  getDisputeDetails,
  resolveDispute,
  getChatMessages,
  sendChatMessage,
} from '../controllers/escrowController';
import {
  getActivityLogs,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  getUnifiedTransactions,
} from '../controllers/activityController';
import { getUserProfile, updateUserProfile, updateSecuritySettings, onboardUserProfile } from '../controllers/userController';
import { getKYCStatus, submitVerification } from '../controllers/kycController';
import {
  getAdminStats,
  getAdminUsers,
  getAdminUserById,
  updateUserStatus,
  updateUserRole,
  getAdminKyc,
  approveKyc,
  rejectKyc,
  getAdminEscrows,
  getAdminDisputes,
  getAdminWithdrawals,
  getAdminPayments,
  getAdminAuditLogs,
} from '../controllers/adminController';

const router = Router();

// Build Version Identifier
export const CHECKSCROW_VERSION = 'phase-registration-fix-001';

// Health Check Route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    version: CHECKSCROW_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// Diagnostic Debug Routes Endpoint (Safe: No secrets or sensitive configs)
router.get('/debug/routes', (req, res) => {
  res.json({
    success: true,
    version: CHECKSCROW_VERSION,
    routes: [
      'GET /api/health',
      'GET /api/debug/routes',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'GET /api/auth/me',
      'POST /api/auth/sync-login',
      'GET /api/dashboard',
      'GET /api/wallet/balance',
      'GET /api/wallet/transactions',
      'POST /api/wallet/deposit',
      'POST /api/wallet/withdraw',
      'GET /api/escrow',
      'POST /api/escrow',
      'GET /api/activity/logs',
      'GET /api/notifications',
      'GET /api/user/profile',
      'GET /api/kyc/status',
    ],
  });
});

// Auth Routes
router.get('/auth/me', requireAuth, getCurrentUser);
router.get('/me', requireAuth, getCurrentUser);
router.post('/auth/register', registerUser);
router.post('/register', registerUser);
router.post('/auth/login', loginUser);
router.post('/login', loginUser);
// Resolves (and, for a first-time Clerk identity, links or provisions) the
// CHECKSCROW account behind a verified Clerk session. All verification and
// linking happens inside requireAuth.
router.post('/auth/sync-login', requireAuth, getCurrentUser);
router.post('/auth/logout', logoutUser);
router.post('/logout', logoutUser);

// User Profile & Security Routes
router.get('/user/profile', requireAuth, getUserProfile);
router.get('/users/profile', requireAuth, getUserProfile);
router.put('/user/profile', requireAuth, updateUserProfile);
router.put('/users/profile', requireAuth, updateUserProfile);
router.post('/profile/onboard', requireAuth, onboardUserProfile);
router.post('/user/onboard', requireAuth, onboardUserProfile);
router.put('/user/security', requireAuth, updateSecuritySettings);
router.put('/users/security', requireAuth, updateSecuritySettings);

// KYC Routes
router.get('/kyc/status', requireAuth, getKYCStatus);
router.post('/kyc/verify', requireAuth, submitVerification);

// Dashboard Route (optional auth so guests get clean guest payload)
router.get('/dashboard', optionalAuth, getDashboardData);

// Bank Accounts Routes
router.get('/bank-accounts', requireAuth, getBankAccounts);
router.post('/bank-accounts', requireAuth, createBankAccount);
router.put('/bank-accounts/:id', requireAuth, updateBankAccount);
router.delete('/bank-accounts/:id', requireAuth, deleteBankAccount);
router.post('/bank-accounts/resolve', requireAuth, resolveAccountName);

// Wallet & Withdrawal Routes
router.get('/wallet/balance', requireAuth, getWalletBalance);
router.get('/wallet/transactions', requireAuth, getWalletTransactions);
router.post('/wallet/deposit', requireAuth, initiateDeposit);
router.post('/wallet/withdraw', requireAuth, requestWithdrawal);
router.get('/wallet/withdrawals', requireAuth, getWithdrawals);
router.get('/wallet/withdrawals/:reference', requireAuth, getWithdrawalByReference);
router.post('/wallet/withdrawals/:reference/cancel', requireAuth, cancelWithdrawal);

// Payment Verification & Webhook Routes
router.get('/payments/verify/:reference', requireAuth, verifyPayment);
router.get('/payments/status/:reference', requireAuth, getPaymentStatus);
router.post('/payments/webhook', handleWebhook);

// Escrow Routes
router.get('/escrow', requireAuth, getEscrows);
router.get('/escrow/:id', requireAuth, getEscrowById);
router.post('/escrow', requireAuth, createEscrow);
router.post('/escrow/:id/fund', requireAuth, fundEscrow);
router.post('/escrow/:id/confirm', requireAuth, confirmEscrow);
router.post('/escrow/:id/deliver', requireAuth, deliverEscrow);
router.post('/escrow/:id/cancel', requireAuth, cancelEscrow);
router.post('/escrow/:id/dispute', requireAuth, disputeEscrow);
router.get('/escrow/:id/dispute', requireAuth, getDisputeDetails);
router.post('/escrow/:id/dispute/resolve', requireModerator, resolveDispute);
router.get('/escrow/:id/chat', requireAuth, getChatMessages);
router.post('/escrow/:id/chat', requireAuth, sendChatMessage);

// Activity Logs, Notifications & Transactions
router.get('/activity/logs', requireAuth, getActivityLogs);
router.get('/notifications', requireAuth, getNotifications);
router.get('/notifications/unread-count', requireAuth, getUnreadCount);
router.put('/notifications/read-all', requireAuth, markAllNotificationsRead);
router.put('/notifications/:id/read', requireAuth, markNotificationRead);
router.get('/transactions', requireAuth, getUnifiedTransactions);

// Admin & Moderation Routes
router.get('/admin/stats', requireModerator, getAdminStats);
router.get('/admin/users', requireModerator, getAdminUsers);
router.get('/admin/users/:id', requireModerator, getAdminUserById);
router.put('/admin/users/:id/status', requireModerator, updateUserStatus);
router.put('/admin/users/:id/role', requireAdmin, updateUserRole);

router.get('/admin/kyc', requireModerator, getAdminKyc);
router.post('/admin/kyc/:userId/approve', requireModerator, approveKyc);
router.post('/admin/kyc/:userId/reject', requireModerator, rejectKyc);

router.get('/admin/escrows', requireModerator, getAdminEscrows);
router.get('/admin/disputes', requireModerator, getAdminDisputes);
router.post('/admin/disputes/:id/resolve', requireModerator, resolveDispute);

router.get('/admin/withdrawals', requireModerator, getAdminWithdrawals);
router.get('/admin/payments', requireModerator, getAdminPayments);
router.get('/admin/audit-logs', requireModerator, getAdminAuditLogs);

// 404 handler for unknown API endpoints
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Something went wrong while connecting to CHECKSCROW. Please try again.',
  });
});

export default router;
