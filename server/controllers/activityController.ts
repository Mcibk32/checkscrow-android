import { Response } from 'express';
import { runQuery, getRow, getAllRows } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';

/**
 * GET /api/notifications
 * Retrieves paginated notifications for the authenticated user.
 */
export async function getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const userId = req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await getRow<any>(`SELECT COUNT(*) as total FROM notifications WHERE user_id = $1`, [userId]);
    const total = parseInt(countRes?.total || '0', 10);

    const rows = await getAllRows<any>(
      `SELECT id, user_id, type, title, message, reference_id, reference_type, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const notifications = rows.map((n) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      referenceId: n.reference_id,
      referenceType: n.reference_type,
      isRead: Boolean(n.is_read),
      createdAt: n.created_at,
    }));

    res.json({
      success: true,
      data: notifications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getNotifications error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve notifications.' });
  }
}

/**
 * GET /api/notifications/unread-count
 * Returns unread notification count for the authenticated user.
 */
export async function getUnreadCount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const countRes = await getRow<any>(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );

    const count = parseInt(countRes?.count || '0', 10);
    res.json({ success: true, count });
  } catch (err: any) {
    console.error('getUnreadCount error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve unread notification count.' });
  }
}

/**
 * PUT /api/notifications/:id/read
 * Marks a specific notification as read with strict ownership check.
 */
export async function markNotificationRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const { id } = req.params;
    const userId = req.user.id;

    const notif = await getRow<any>(`SELECT id, user_id FROM notifications WHERE id = $1`, [id]);
    if (!notif) {
      res.status(404).json({ success: false, error: 'Notification not found.' });
      return;
    }

    if (notif.user_id !== userId) {
      res.status(403).json({ success: false, error: 'Access denied. Notification belongs to another user.' });
      return;
    }

    await runQuery(`UPDATE notifications SET is_read = true WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err: any) {
    console.error('markNotificationRead error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read.' });
  }
}

/**
 * PUT /api/notifications/read-all
 * Marks all unread notifications as read for the authenticated user.
 */
export async function markAllNotificationsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    await runQuery(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [req.user.id]);
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err: any) {
    console.error('markAllNotificationsRead error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark notifications as read.' });
  }
}

/**
 * GET /api/activity/logs
 * Retrieves paginated activity logs for the authenticated user with optional category filter.
 */
export async function getActivityLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const userId = req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const category = req.query.category ? String(req.query.category).trim() : null;

    let whereClause = `WHERE user_id = $1`;
    const params: any[] = [userId];

    if (category) {
      whereClause += ` AND category = $2`;
      params.push(category);
    }

    const countRes = await getRow<any>(`SELECT COUNT(*) as total FROM activity_logs ${whereClause}`, params);
    const total = parseInt(countRes?.total || '0', 10);

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rawLogs = await getAllRows<any>(
      `SELECT id, title, description, category, timestamp
       FROM activity_logs
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const logs = rawLogs.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      category: l.category,
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
    console.error('getActivityLogs error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve activity logs.' });
  }
}

/**
 * GET /api/transactions
 * Retrieves unified financial transaction history for the authenticated user from wallet_transactions.
 */
export async function getUnifiedTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const userId = req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const typeFilter = req.query.type ? String(req.query.type).trim() : null;

    let whereClause = `WHERE user_id = $1`;
    const params: any[] = [userId];

    if (typeFilter) {
      whereClause += ` AND type = $2`;
      params.push(typeFilter);
    }

    const countRes = await getRow<any>(`SELECT COUNT(*) as total FROM wallet_transactions ${whereClause}`, params);
    const total = parseInt(countRes?.total || '0', 10);

    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rawTxs = await getAllRows<any>(
      `SELECT id, type, amount, currency, status, reference, description, created_at
       FROM wallet_transactions
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      queryParams
    );

    const transactions = rawTxs.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount || 0),
      currency: tx.currency || 'NGN',
      status: tx.status,
      reference: tx.reference,
      description: tx.description,
      createdAt: tx.created_at,
      relatedReference: tx.reference,
    }));

    res.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error('getUnifiedTransactions error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve transaction history.' });
  }
}
