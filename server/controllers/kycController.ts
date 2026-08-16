import { Response } from 'express';
import { runQuery, getRow } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

export async function getKYCStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const userRow = await getRow<any>(`SELECT kyc_status, kyc_tier FROM users WHERE id = $1`, [req.user.id]);
    res.json({
      success: true,
      data: {
        status: userRow ? userRow.kyc_status : 'unverified',
        tier: userRow ? userRow.kyc_tier : 1,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function submitVerification(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { bvn, nin } = req.body;
    const cleanBvn = bvn ? bvn.trim().replace(/\D/g, '') : '';
    const cleanNin = nin ? nin.trim().replace(/\D/g, '') : '';

    if (!cleanBvn && !cleanNin) {
      res.status(400).json({ success: false, error: 'A valid 11-digit BVN or NIN is required for identity verification.' });
      return;
    }

    if (cleanBvn && cleanBvn.length !== 11) {
      res.status(400).json({ success: false, error: 'BVN must be exactly 11 digits.' });
      return;
    }

    if (cleanNin && cleanNin.length !== 11) {
      res.status(400).json({ success: false, error: 'NIN must be exactly 11 digits.' });
      return;
    }

    const now = new Date().toISOString();

    // Mark KYC as pending tier 2 review upon submission
    await runQuery(
      `UPDATE users SET kyc_status = 'pending', kyc_tier = 2, updated_at = $1 WHERE id = $2`,
      [now, req.user.id]
    );

    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'KYC Verification Submitted', 'Submitted BVN/NIN for automated verification review', 'security', $3)`,
      ['act_' + Date.now(), req.user.id, now]
    );

    // Create notification
    await createNotification({
      userId: req.user.id,
      type: 'kyc',
      title: 'KYC Verification Submitted',
      message: 'Your BVN/NIN identity details have been submitted and are under review.',
      referenceId: req.user.id,
      referenceType: 'kyc',
    });

    res.json({
      success: true,
      data: { status: 'pending', tier: 2 },
      message: 'KYC Verification details submitted successfully and currently under review.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
