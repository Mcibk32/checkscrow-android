import { runQuery, getRow } from '../db/database';

export interface CreateNotificationParams {
  userId: string;
  type: 'wallet' | 'escrow' | 'account' | 'security' | 'kyc' | string;
  title: string;
  message: string;
  referenceId?: string | null;
  referenceType?: string | null;
  txQuery?: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
}

export async function createNotification(params: CreateNotificationParams): Promise<string | null> {
  const { userId, type, title, message, referenceId = null, referenceType = null, txQuery } = params;
  if (!userId) return null;

  const now = new Date().toISOString();
  const id = 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

  // Idempotency check: avoid duplicate notifications for the same event/reference
  if (referenceId && referenceType) {
    const checkSql = `SELECT id FROM notifications WHERE user_id = $1 AND type = $2 AND reference_id = $3 AND reference_type = $4 AND title = $5`;
    const checkParams = [userId, type, referenceId, referenceType, title];
    const existing = txQuery
      ? (await txQuery(checkSql, checkParams)).rows[0]
      : await getRow(checkSql, checkParams);

    if (existing) {
      return existing.id;
    }
  }

  const insertSql = `
    INSERT INTO notifications (id, user_id, type, title, message, reference_id, reference_type, is_read, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
  `;
  const insertParams = [id, userId, type, title, message, referenceId, referenceType, now];

  if (txQuery) {
    await txQuery(insertSql, insertParams);
  } else {
    await runQuery(insertSql, insertParams);
  }

  return id;
}
