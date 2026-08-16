import { Response } from 'express';
import { runQuery, getRow, getAllRows } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

export async function createAuditLog(opts: {
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  category?: string;
  targetId?: string;
  targetType?: string;
  description?: string;
  metadata?: string;
}) {
  try {
    const id = 'aud_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const now = new Date().toISOString();
    await runQuery(
      `INSERT INTO audit_logs (id, actor_id, actor_name, actor_email, action, category, target_id, target_type, description, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        opts.actorId,
        opts.actorName,
        opts.actorEmail,
        opts.action,
        opts.category || 'admin',
        opts.targetId || '',
        opts.targetType || '',
        opts.description || '',
        opts.metadata || '',
        now,
      ]
    );
  } catch (err) {
    console.error('Failed to create audit log:', err);
  }
}

/**
 * GET /api/admin/stats
 * Returns REAL PostgreSQL platform statistics only.
 */
export async function getAdminStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const totalUsersRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM users`);
    const verifiedUsersRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM users WHERE kyc_status = 'verified'`);
    const pendingKycRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM users WHERE kyc_status = 'pending'`);
    const suspendedUsersRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM users WHERE account_status = 'suspended'`);

    const activeEscrowsRow = await getRow<any>(
      `SELECT COUNT(*)::int as count FROM escrows WHERE status IN ('active', 'awaiting_payment', 'funded', 'in_escrow', 'in_progress', 'delivered', 'disputed')`
    );
    const completedEscrowsRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM escrows WHERE status = 'completed'`);
    const disputedEscrowsRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM escrows WHERE status = 'disputed'`);

    const walletSumsRow = await getRow<any>(
      `SELECT COALESCE(SUM(available_balance), 0)::numeric as total_available, COALESCE(SUM(escrow_balance), 0)::numeric as total_escrow FROM wallets`
    );

    const pendingWithdrawalsRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM withdrawals WHERE status = 'pending'`);
    const successfulDepositsRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM payment_transactions WHERE status IN ('successful', 'completed')`);
    const failedPaymentsRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM payment_transactions WHERE status = 'failed'`);
    const openDisputesRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM escrow_disputes WHERE status IN ('pending', 'open', 'under_review')`);

    res.json({
      success: true,
      data: {
        totalUsers: totalUsersRow ? Number(totalUsersRow.count) : 0,
        verifiedUsers: verifiedUsersRow ? Number(verifiedUsersRow.count) : 0,
        pendingKyc: pendingKycRow ? Number(pendingKycRow.count) : 0,
        suspendedUsers: suspendedUsersRow ? Number(suspendedUsersRow.count) : 0,
        activeEscrows: activeEscrowsRow ? Number(activeEscrowsRow.count) : 0,
        completedEscrows: completedEscrowsRow ? Number(completedEscrowsRow.count) : 0,
        disputedEscrows: disputedEscrowsRow ? Number(disputedEscrowsRow.count) : 0,
        totalWalletBalances: walletSumsRow ? parseFloat(walletSumsRow.total_available || 0) : 0,
        totalLockedEscrow: walletSumsRow ? parseFloat(walletSumsRow.total_escrow || 0) : 0,
        pendingWithdrawals: pendingWithdrawalsRow ? Number(pendingWithdrawalsRow.count) : 0,
        successfulDeposits: successfulDepositsRow ? Number(successfulDepositsRow.count) : 0,
        failedPayments: failedPaymentsRow ? Number(failedPaymentsRow.count) : 0,
        openDisputes: openDisputesRow ? Number(openDisputesRow.count) : 0,
      },
    });
  } catch (err: any) {
    console.error('getAdminStats error:', err);
    res.status(500).json({ success: false, error: 'Failed to load administrative platform statistics.' });
  }
}

/**
 * GET /api/admin/users
 * Returns paginated user records with search and status filters.
 * Excludes password_hash and sensitive secrets.
 */
export async function getAdminUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const search = req.query.search ? String(req.query.search).trim() : '';
    const accountStatus = req.query.account_status ? String(req.query.account_status).trim() : '';
    const kycStatus = req.query.kyc_status ? String(req.query.kyc_status).trim() : '';
    const role = req.query.role ? String(req.query.role).trim() : '';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(full_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR phone_number LIKE $${params.length})`);
    }

    if (accountStatus) {
      params.push(accountStatus);
      whereClauses.push(`account_status = $${params.length}`);
    }

    if (kycStatus) {
      params.push(kycStatus);
      whereClauses.push(`kyc_status = $${params.length}`);
    }

    if (role) {
      params.push(role);
      whereClauses.push(`role = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM users ${whereSql}`, params);
    const total = countRow ? Number(countRow.count) : 0;

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rows = await getAllRows<any>(
      `SELECT id, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at, updated_at
       FROM users ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const users = rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      phoneNumber: u.phone_number || '',
      role: u.role || 'user',
      accountStatus: u.account_status || 'active',
      kycStatus: u.kyc_status || 'unverified',
      kycTier: u.kyc_tier || 1,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }));

    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getAdminUsers error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve user list.' });
  }
}

/**
 * GET /api/admin/users/:id
 * Detailed user profile inspection.
 */
export async function getAdminUserById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.params.id;
    const userRow = await getRow<any>(
      `SELECT id, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!userRow) {
      res.status(404).json({ success: false, error: 'User record not found.' });
      return;
    }

    const walletRow = await getRow<any>(
      `SELECT available_balance, escrow_balance, pending_withdrawal_balance, currency FROM wallets WHERE user_id = $1`,
      [userId]
    );

    const txCountRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM wallet_transactions WHERE user_id = $1`, [userId]);
    const activeEscrowRow = await getRow<any>(
      `SELECT COUNT(*)::int as count FROM escrows WHERE (buyer_id = $1 OR seller_id = $1) AND status IN ('active', 'awaiting_payment', 'funded', 'in_escrow', 'in_progress', 'delivered', 'disputed')`,
      [userId]
    );

    const recentActivity = await getAllRows<any>(
      `SELECT id, title, description, category, timestamp FROM activity_logs WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 10`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        phoneNumber: userRow.phone_number || '',
        role: userRow.role || 'user',
        accountStatus: userRow.account_status || 'active',
        kycStatus: userRow.kyc_status || 'unverified',
        kycTier: userRow.kyc_tier || 1,
        registrationDate: userRow.created_at,
        updatedAt: userRow.updated_at,
        wallet: {
          availableBalance: walletRow ? parseFloat(walletRow.available_balance || 0) : 0,
          escrowBalance: walletRow ? parseFloat(walletRow.escrow_balance || 0) : 0,
          pendingWithdrawalBalance: walletRow ? parseFloat(walletRow.pending_withdrawal_balance || 0) : 0,
          currency: walletRow ? walletRow.currency : 'NGN',
        },
        transactionCount: txCountRow ? Number(txCountRow.count) : 0,
        activeEscrowCount: activeEscrowRow ? Number(activeEscrowRow.count) : 0,
        recentActivity: recentActivity.map((act) => ({
          id: act.id,
          title: act.title,
          description: act.description,
          category: act.category,
          timestamp: act.timestamp,
        })),
      },
    });
  } catch (err: any) {
    console.error('getAdminUserById error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve detailed user profile.' });
  }
}

/**
 * PUT /api/admin/users/:id/status
 * Suspends, activates, or deactivates a user account.
 */
export async function updateUserStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const targetUserId = req.params.id;
    const { status } = req.body;

    if (!['active', 'suspended', 'inactive'].includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid account status. Allowed: active, suspended, inactive.' });
      return;
    }

    const targetUser = await getRow<any>(`SELECT id, email, full_name, role, account_status FROM users WHERE id = $1`, [targetUserId]);
    if (!targetUser) {
      res.status(404).json({ success: false, error: 'Target user not found.' });
      return;
    }

    // Moderators cannot alter administrators
    if (req.user.role === 'moderator' && targetUser.role === 'admin') {
      res.status(403).json({ success: false, error: 'Moderators are not permitted to modify administrator accounts.' });
      return;
    }

    // Prevent self-suspension
    if (targetUserId === req.user.id) {
      res.status(400).json({ success: false, error: 'You cannot suspend or modify your own account status.' });
      return;
    }

    // Prevent suspending the last remaining active admin
    if (targetUser.role === 'admin' && status !== 'active') {
      const activeAdminCountRow = await getRow<any>(
        `SELECT COUNT(*)::int as count FROM users WHERE role = 'admin' AND account_status = 'active' AND id != $1`,
        [targetUserId]
      );
      if (!activeAdminCountRow || Number(activeAdminCountRow.count) === 0) {
        res.status(400).json({ success: false, error: 'Cannot suspend or deactivate the last remaining active administrator.' });
        return;
      }
    }

    const now = new Date().toISOString();
    await runQuery(`UPDATE users SET account_status = $1, updated_at = $2 WHERE id = $3`, [status, now, targetUserId]);

    // Record activity log for target user
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'Account Status Updated', $3, 'security', $4)`,
      ['act_' + Date.now(), targetUserId, `Account status set to ${status} by moderation team`, now]
    );

    // Create user notification
    const notificationMessage =
      status === 'suspended'
        ? 'Your account has been suspended. Please contact support.'
        : `Your account status has been updated to ${status}.`;

    await createNotification({
      userId: targetUserId,
      type: 'security',
      title: status === 'suspended' ? 'Account Suspended' : 'Account Status Changed',
      message: notificationMessage,
    });

    // Record audit log
    await createAuditLog({
      actorId: req.user.id,
      actorName: req.user.fullName,
      actorEmail: req.user.email,
      action: 'user_status_update',
      category: 'user_management',
      targetId: targetUserId,
      targetType: 'user',
      description: `Updated status of user ${targetUser.email} from '${targetUser.account_status}' to '${status}'.`,
    });

    res.json({
      success: true,
      message: `User status successfully updated to ${status}.`,
    });
  } catch (err: any) {
    console.error('updateUserStatus error:', err);
    res.status(500).json({ success: false, error: 'Failed to update user account status.' });
  }
}

/**
 * PUT /api/admin/users/:id/role
 * Changes a user's system role (Admin only).
 */
export async function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const targetUserId = req.params.id;
    const { role } = req.body;

    if (!['user', 'moderator', 'admin'].includes(role)) {
      res.status(400).json({ success: false, error: 'Invalid role. Allowed roles: user, moderator, admin.' });
      return;
    }

    const targetUser = await getRow<any>(`SELECT id, email, full_name, role, account_status FROM users WHERE id = $1`, [targetUserId]);
    if (!targetUser) {
      res.status(404).json({ success: false, error: 'Target user not found.' });
      return;
    }

    // Prevent admin from demoting themselves
    if (targetUserId === req.user.id && role !== 'admin') {
      res.status(400).json({ success: false, error: 'You cannot demote yourself from the administrator role.' });
      return;
    }

    // Prevent demoting the last active administrator
    if (targetUser.role === 'admin' && role !== 'admin') {
      const activeAdminCountRow = await getRow<any>(
        `SELECT COUNT(*)::int as count FROM users WHERE role = 'admin' AND account_status = 'active' AND id != $1`,
        [targetUserId]
      );
      if (!activeAdminCountRow || Number(activeAdminCountRow.count) === 0) {
        res.status(400).json({ success: false, error: 'Cannot demote the last remaining active administrator.' });
        return;
      }
    }

    const now = new Date().toISOString();
    await runQuery(`UPDATE users SET role = $1, updated_at = $2 WHERE id = $3`, [role, now, targetUserId]);

    // Record activity log for user
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'Account Role Updated', $3, 'security', $4)`,
      ['act_' + Date.now(), targetUserId, `Account role changed to ${role}`, now]
    );

    // Create user notification
    await createNotification({
      userId: targetUserId,
      type: 'security',
      title: 'System Role Updated',
      message: `Your account system role has been updated to ${role.toUpperCase()}.`,
    });

    // Record audit log
    await createAuditLog({
      actorId: req.user.id,
      actorName: req.user.fullName,
      actorEmail: req.user.email,
      action: 'user_role_update',
      category: 'role_management',
      targetId: targetUserId,
      targetType: 'user',
      description: `Changed role of user ${targetUser.email} from '${targetUser.role}' to '${role}'.`,
    });

    res.json({
      success: true,
      message: `User role successfully updated to ${role}.`,
    });
  } catch (err: any) {
    console.error('updateUserRole error:', err);
    res.status(500).json({ success: false, error: 'Failed to update user system role.' });
  }
}

/**
 * GET /api/admin/kyc
 * Retrieves KYC verification applications.
 */
export async function getAdminKyc(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status).trim() : '';
    const search = req.query.search ? String(req.query.search).trim() : '';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      whereClauses.push(`kyc_status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(full_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM users ${whereSql}`, params);
    const total = countRow ? Number(countRow.count) : 0;

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rows = await getAllRows<any>(
      `SELECT id, email, full_name, phone_number, kyc_status, kyc_tier, created_at, updated_at
       FROM users ${whereSql}
       ORDER BY updated_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const applications = rows.map((r) => ({
      userId: r.id,
      fullName: r.full_name,
      email: r.email,
      phoneNumber: r.phone_number || '',
      kycStatus: r.kyc_status || 'unverified',
      kycTier: r.kyc_tier || 1,
      submissionDate: r.updated_at || r.created_at,
    }));

    res.json({
      success: true,
      data: applications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getAdminKyc error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve KYC applications.' });
  }
}

/**
 * POST /api/admin/kyc/:userId/approve
 * Approves a user's KYC verification.
 */
export async function approveKyc(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const userId = req.params.userId;
    const targetUser = await getRow<any>(`SELECT id, email, full_name, kyc_status FROM users WHERE id = $1`, [userId]);

    if (!targetUser) {
      res.status(404).json({ success: false, error: 'User record not found.' });
      return;
    }

    const now = new Date().toISOString();
    await runQuery(`UPDATE users SET kyc_status = 'verified', kyc_tier = 2, updated_at = $1 WHERE id = $2`, [now, userId]);

    // Record activity log
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'KYC Approved', $3, 'kyc', $4)`,
      ['act_' + Date.now(), userId, 'Identity verification approved by compliance team. Upgraded to Tier 2 Verified.', now]
    );

    // Notify user
    await createNotification({
      userId,
      type: 'kyc',
      title: 'KYC Verified!',
      message: 'Your identity verification application has been approved. You are now Tier 2 Verified with enhanced transaction limits.',
    });

    // Create audit log
    await createAuditLog({
      actorId: req.user.id,
      actorName: req.user.fullName,
      actorEmail: req.user.email,
      action: 'kyc_approve',
      category: 'kyc_moderation',
      targetId: userId,
      targetType: 'user',
      description: `Approved KYC verification for user ${targetUser.email}.`,
    });

    res.json({
      success: true,
      message: 'KYC verification approved successfully.',
    });
  } catch (err: any) {
    console.error('approveKyc error:', err);
    res.status(500).json({ success: false, error: 'Failed to approve KYC application.' });
  }
}

/**
 * POST /api/admin/kyc/:userId/reject
 * Rejects a user's KYC verification with reason.
 */
export async function rejectKyc(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const userId = req.params.userId;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'A valid reason is required to reject a KYC verification.' });
      return;
    }

    const targetUser = await getRow<any>(`SELECT id, email, full_name, kyc_status FROM users WHERE id = $1`, [userId]);
    if (!targetUser) {
      res.status(404).json({ success: false, error: 'User record not found.' });
      return;
    }

    const now = new Date().toISOString();
    await runQuery(`UPDATE users SET kyc_status = 'rejected', updated_at = $1 WHERE id = $2`, [now, userId]);

    const cleanReason = reason.trim();

    // Activity log
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'KYC Rejected', $3, 'kyc', $4)`,
      ['act_' + Date.now(), userId, `KYC verification rejected. Reason: ${cleanReason}`, now]
    );

    // Notify user
    await createNotification({
      userId,
      type: 'kyc',
      title: 'KYC Verification Update',
      message: `Your identity verification was rejected. Reason: ${cleanReason}. You may re-submit your documents.`,
    });

    // Audit log
    await createAuditLog({
      actorId: req.user.id,
      actorName: req.user.fullName,
      actorEmail: req.user.email,
      action: 'kyc_reject',
      category: 'kyc_moderation',
      targetId: userId,
      targetType: 'user',
      description: `Rejected KYC verification for user ${targetUser.email}. Reason: ${cleanReason}`,
    });

    res.json({
      success: true,
      message: 'KYC verification rejected successfully.',
    });
  } catch (err: any) {
    console.error('rejectKyc error:', err);
    res.status(500).json({ success: false, error: 'Failed to reject KYC application.' });
  }
}

/**
 * GET /api/admin/escrows
 * Retrieves all escrow deals for inspection.
 */
export async function getAdminEscrows(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status).trim() : '';
    const search = req.query.search ? String(req.query.search).trim() : '';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(title) LIKE $${params.length} OR LOWER(buyer_email) LIKE $${params.length} OR LOWER(seller_email) LIKE $${params.length} OR id LIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM escrows ${whereSql}`, params);
    const total = countRow ? Number(countRow.count) : 0;

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rows = await getAllRows<any>(
      `SELECT e.*, b.full_name as buyer_name, s.full_name as seller_name 
       FROM escrows e
       LEFT JOIN users b ON e.buyer_id = b.id
       LEFT JOIN users s ON e.seller_id = s.id
       ${whereSql}
       ORDER BY e.created_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const escrows = rows.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      amount: parseFloat(e.amount || 0),
      currency: e.currency || 'NGN',
      status: e.status,
      paymentStatus: e.payment_status || 'unpaid',
      buyerId: e.buyer_id,
      buyerEmail: e.buyer_email,
      buyerName: e.buyer_name || e.buyer_email?.split('@')[0] || 'Buyer',
      sellerId: e.seller_id,
      sellerEmail: e.seller_email,
      sellerName: e.seller_name || e.seller_email?.split('@')[0] || 'Seller',
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      deadline: e.deadline,
    }));

    res.json({
      success: true,
      data: escrows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getAdminEscrows error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve escrows.' });
  }
}

/**
 * GET /api/admin/disputes
 * Retrieves all escrow disputes for arbitration.
 */
export async function getAdminDisputes(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status).trim() : '';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      whereClauses.push(`d.status = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM escrow_disputes d ${whereSql}`, params);
    const total = countRow ? Number(countRow.count) : 0;

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rows = await getAllRows<any>(
      `SELECT d.*, 
              e.title as escrow_title, e.amount as escrow_amount, e.status as escrow_status, e.buyer_email, e.seller_email, e.buyer_id, e.seller_id,
              rb.full_name as raised_by_name, rb.email as raised_by_email
       FROM escrow_disputes d
       JOIN escrows e ON d.escrow_id = e.id
       LEFT JOIN users rb ON d.raised_by_id = rb.id
       ${whereSql}
       ORDER BY d.created_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const disputes = rows.map((d) => ({
      id: d.id,
      escrowId: d.escrow_id,
      escrowTitle: d.escrow_title,
      escrowAmount: parseFloat(d.escrow_amount || 0),
      escrowStatus: d.escrow_status,
      buyerEmail: d.buyer_email,
      sellerEmail: d.seller_email,
      buyerId: d.buyer_id,
      sellerId: d.seller_id,
      raisedById: d.raised_by_id,
      raisedByName: d.raised_by_name || 'User',
      raisedByEmail: d.raised_by_email || '',
      reason: d.reason,
      description: d.description,
      status: d.status,
      resolution: d.resolution,
      resolutionDetails: d.resolution_details,
      buyerSplitAmount: d.buyer_split_amount ? parseFloat(d.buyer_split_amount) : null,
      sellerSplitAmount: d.seller_split_amount ? parseFloat(d.seller_split_amount) : null,
      createdAt: d.created_at,
      resolvedAt: d.resolved_at,
    }));

    res.json({
      success: true,
      data: disputes,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getAdminDisputes error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve dispute records.' });
  }
}

/**
 * GET /api/admin/withdrawals
 * Retrieves all withdrawal requests with masked account numbers.
 */
export async function getAdminWithdrawals(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status).trim() : '';
    const search = req.query.search ? String(req.query.search).trim() : '';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      whereClauses.push(`w.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(w.reference) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length} OR LOWER(u.full_name) LIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await getRow<any>(
      `SELECT COUNT(*)::int as count FROM withdrawals w JOIN users u ON w.user_id = u.id ${whereSql}`,
      params
    );
    const total = countRow ? Number(countRow.count) : 0;

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rows = await getAllRows<any>(
      `SELECT w.*, u.full_name, u.email, b.bank_name, b.account_number, b.account_name
       FROM withdrawals w
       JOIN users u ON w.user_id = u.id
       LEFT JOIN bank_accounts b ON w.bank_account_id = b.id
       ${whereSql}
       ORDER BY w.created_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const maskAccount = (num?: string) => {
      if (!num || num.length < 4) return '******';
      return '******' + num.slice(-4);
    };

    const withdrawals = rows.map((w) => ({
      id: w.id,
      reference: w.reference,
      userId: w.user_id,
      userName: w.full_name,
      userEmail: w.email,
      amount: parseFloat(w.amount || 0),
      currency: w.currency || 'NGN',
      bankName: w.bank_name || 'Bank',
      accountName: w.account_name || 'Account',
      maskedAccountNumber: maskAccount(w.account_number),
      status: w.status,
      failureReason: w.failure_reason || '',
      createdAt: w.created_at,
      completedAt: w.completed_at,
    }));

    res.json({
      success: true,
      data: withdrawals,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getAdminWithdrawals error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve withdrawal records.' });
  }
}

/**
 * GET /api/admin/payments
 * Retrieves all payment transactions (Deposits). Read-only.
 */
export async function getAdminPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status).trim() : '';
    const search = req.query.search ? String(req.query.search).trim() : '';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      whereClauses.push(`p.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(p.reference) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length} OR LOWER(u.full_name) LIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await getRow<any>(
      `SELECT COUNT(*)::int as count FROM payment_transactions p JOIN users u ON p.user_id = u.id ${whereSql}`,
      params
    );
    const total = countRow ? Number(countRow.count) : 0;

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rows = await getAllRows<any>(
      `SELECT p.*, u.full_name, u.email
       FROM payment_transactions p
       JOIN users u ON p.user_id = u.id
       ${whereSql}
       ORDER BY p.created_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const payments = rows.map((p) => ({
      id: p.id,
      reference: p.reference,
      userId: p.user_id,
      userName: p.full_name,
      userEmail: p.email,
      amount: parseFloat(p.amount || 0),
      currency: p.currency || 'NGN',
      provider: p.provider || 'paystack',
      status: p.status,
      paymentMethod: p.payment_method || 'card',
      createdAt: p.created_at,
      completedAt: p.completed_at,
    }));

    res.json({
      success: true,
      data: payments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getAdminPayments error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve payment records.' });
  }
}

/**
 * GET /api/admin/audit-logs
 * Retrieves platform administrative audit logs.
 */
export async function getAdminAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const category = req.query.category ? String(req.query.category).trim() : '';
    const search = req.query.search ? String(req.query.search).trim() : '';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (category) {
      params.push(category);
      whereClauses.push(`category = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(actor_name) LIKE $${params.length} OR LOWER(actor_email) LIKE $${params.length} OR LOWER(action) LIKE $${params.length} OR LOWER(description) LIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await getRow<any>(`SELECT COUNT(*)::int as count FROM audit_logs ${whereSql}`, params);
    const total = countRow ? Number(countRow.count) : 0;

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rows = await getAllRows<any>(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY timestamp DESC LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const logs = rows.map((l) => ({
      id: l.id,
      actorId: l.actor_id,
      actorName: l.actor_name,
      actorEmail: l.actor_email,
      action: l.action,
      category: l.category,
      targetId: l.target_id,
      targetType: l.target_type,
      description: l.description,
      metadata: l.metadata,
      timestamp: l.timestamp,
    }));

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getAdminAuditLogs error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve audit log records.' });
  }
}
