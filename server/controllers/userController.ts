import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { runQuery, getRow } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

export async function getUserProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const userRow = await getRow<any>(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    if (!userRow) {
      res.status(404).json({ success: false, error: 'User profile not found' });
      return;
    }

    const userProfile = {
      id: userRow.id,
      uid: userRow.uid,
      email: userRow.email,
      fullName: userRow.full_name,
      phoneNumber: userRow.phone_number || '',
      role: userRow.role || 'both',
      accountStatus: userRow.account_status || 'active',
      kycStatus: userRow.kyc_status || 'unverified',
      kycTier: userRow.kyc_tier || 1,
      createdAt: userRow.created_at,
      updatedAt: userRow.updated_at,
    };

    res.json({ success: true, data: userProfile });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateUserProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { fullName, phoneNumber } = req.body;
    const now = new Date().toISOString();

    if (fullName && fullName.trim().length < 2) {
      res.status(400).json({ success: false, error: 'Full name must be at least 2 characters long.' });
      return;
    }

    const cleanPhone = phoneNumber ? phoneNumber.replace(/\s+/g, '') : null;
    if (cleanPhone && !/^(?:\+?234|0)[789][01]\d{8}$/.test(cleanPhone)) {
      res.status(400).json({ success: false, error: 'Please enter a valid 11-digit Nigerian phone number.' });
      return;
    }

    await runQuery(
      `UPDATE users SET full_name = COALESCE($1, full_name), phone_number = COALESCE($2, phone_number), updated_at = $3 WHERE id = $4`,
      [fullName ? fullName.trim() : null, cleanPhone, now, req.user.id]
    );

    // Create activity log
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'Profile Updated', 'Updated account contact details and profile info.', 'account', $3)`,
      ['act_' + Date.now(), req.user.id, now]
    );

    // Create notification
    await createNotification({
      userId: req.user.id,
      type: 'account',
      title: 'Profile Details Updated',
      message: 'Your profile details have been successfully updated.',
      referenceId: req.user.id,
      referenceType: 'account',
    });

    const updatedRow = await getRow<any>(`SELECT * FROM users WHERE id = $1`, [req.user.id]);

    const updatedProfile = {
      id: updatedRow.id,
      email: updatedRow.email,
      fullName: updatedRow.full_name,
      phoneNumber: updatedRow.phone_number || '',
      role: updatedRow.role || 'both',
      accountStatus: updatedRow.account_status || 'active',
      kycStatus: updatedRow.kyc_status || 'unverified',
      kycTier: updatedRow.kyc_tier || 1,
      createdAt: updatedRow.created_at,
      updatedAt: updatedRow.updated_at,
    };

    res.json({ success: true, data: updatedProfile, message: 'Profile updated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateSecuritySettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Current password and new password are required.' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'New password must be at least 8 characters long.' });
      return;
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      res.status(400).json({ success: false, error: 'New passwords do not match.' });
      return;
    }

    const userRow = await getRow<any>(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    if (!userRow) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const match = await bcrypt.compare(currentPassword, userRow.password_hash);
    if (!match) {
      res.status(400).json({ success: false, error: 'Current password is incorrect.' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();
    await runQuery(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`, [newHash, now, req.user.id]);

    // Create activity log
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'Security Password Changed', 'Account password was changed successfully.', 'security', $3)`,
      ['act_' + Date.now(), req.user.id, now]
    );

    // Create notification
    await createNotification({
      userId: req.user.id,
      type: 'security',
      title: 'Security Alert: Password Changed',
      message: 'Your account password was successfully updated.',
      referenceId: req.user.id,
      referenceType: 'security',
    });

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function onboardUserProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { fullName, phoneNumber, role } = req.body;
    const now = new Date().toISOString();

    const allowedRoles = ['buyer', 'seller', 'both'];
    const safeRole = role && allowedRoles.includes(role) ? role : undefined;

    let cleanPhone: string | null = null;
    if (phoneNumber) {
      cleanPhone = phoneNumber.replace(/\s+/g, '');
      if (cleanPhone && !/^(?:\+?234|0)[789][01]\d{8}$/.test(cleanPhone)) {
        res.status(400).json({ success: false, error: 'Please enter a valid 11-digit Nigerian phone number.' });
        return;
      }
    }

    await runQuery(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name), 
           phone_number = COALESCE($2, phone_number),
           role = COALESCE($3, role),
           updated_at = $4 
       WHERE id = $5`,
      [fullName ? fullName.trim() : null, cleanPhone, safeRole || null, now, req.user.id]
    );

    const updatedRow = await getRow<any>(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    const userProfile = {
      id: updatedRow.id,
      uid: updatedRow.uid,
      email: updatedRow.email,
      fullName: updatedRow.full_name,
      phoneNumber: updatedRow.phone_number || '',
      role: updatedRow.role || 'both',
      accountStatus: updatedRow.account_status || 'active',
      kycStatus: updatedRow.kyc_status || 'unverified',
      kycTier: updatedRow.kyc_tier || 1,
      createdAt: updatedRow.created_at,
      updatedAt: updatedRow.updated_at,
    };

    res.json({
      success: true,
      data: userProfile,
      message: 'Onboarding completed successfully',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
