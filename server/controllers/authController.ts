import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { runQuery, getRow } from '../db/database';
import { AuthenticatedRequest, JWT_SECRET } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

export async function getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }
  res.json({ success: true, data: req.user });
}

export async function registerUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email, password, confirmPassword, fullName, phoneNumber, role } = req.body;

    if (!email || !password || !fullName) {
      res.status(400).json({ success: false, error: 'Full name, email, and password are required.' });
      return;
    }

    const trimmedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
      return;
    }

    if (fullName.trim().length < 2) {
      res.status(400).json({ success: false, error: 'Full name must be at least 2 characters long.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ success: false, error: 'Password confirmation does not match.' });
      return;
    }

    const cleanPhone = (phoneNumber || '').replace(/\s+/g, '');
    if (cleanPhone && !/^(?:\+?234|0)[789][01]\d{8}$/.test(cleanPhone)) {
      res.status(400).json({ success: false, error: 'Please enter a valid 11-digit Nigerian phone number (e.g. 08012345678 or +2348012345678).' });
      return;
    }

    const existingUser = await getRow(`SELECT id FROM users WHERE email = $1`, [trimmedEmail]);
    if (existingUser) {
      res.status(400).json({ success: false, error: 'An account with this email address already exists.' });
      return;
    }

    const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const walletId = 'wal_' + Date.now();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const allowedPublicRoles = ['buyer', 'seller', 'both'];
    const safeRole = allowedPublicRoles.includes(role) ? role : 'both';

    // Insert User
    await runQuery(
      `INSERT INTO users (id, email, password_hash, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', 'unverified', 1, $7, $8)`,
      [userId, trimmedEmail, passwordHash, fullName.trim(), cleanPhone, safeRole, now, now]
    );

    // Create default zero-balance Wallet
    await runQuery(
      `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
       VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)`,
      [walletId, userId, now]
    );

    // Log account creation activity
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'Account Registered', 'Successfully created CHECKSCROW account.', 'security', $3)`,
      ['act_' + Date.now(), userId, now]
    );

    // Create welcome notification
    await createNotification({
      userId,
      type: 'account',
      title: 'Welcome to CHECKSCROW',
      message: 'Your account has been successfully created. Welcome aboard!',
      referenceId: userId,
      referenceType: 'account',
    });

    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

    const newUser = {
      id: userId,
      email: trimmedEmail,
      fullName: fullName.trim(),
      phoneNumber: cleanPhone,
      role: safeRole,
      accountStatus: 'active',
      kycStatus: 'unverified',
      kycTier: 1,
      createdAt: now,
    };

    res.status(201).json({
      success: true,
      data: { token, user: newUser },
      message: 'Registration successful',
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: err.message || 'Server error during registration', details: String(err) });
  }
}

export async function loginUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required.' });
      return;
    }

    const userRow = await getRow<any>(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    if (!userRow) {
      res.status(401).json({ success: false, error: 'Invalid email or password.' });
      return;
    }

    if (userRow.account_status === 'suspended') {
      res.status(403).json({ success: false, error: 'Your account has been suspended. Please contact support.' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, userRow.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ success: false, error: 'Invalid email or password.' });
      return;
    }

    const token = jwt.sign({ userId: userRow.id }, JWT_SECRET, { expiresIn: '7d' });

    const user = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      phoneNumber: userRow.phone_number || '',
      role: userRow.role || 'both',
      accountStatus: userRow.account_status || 'active',
      kycStatus: userRow.kyc_status || 'unverified',
      kycTier: userRow.kyc_tier || 1,
      createdAt: userRow.created_at,
    };

    res.json({
      success: true,
      data: { token, user },
      message: 'Login successful',
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
}

export async function logoutUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  res.json({ success: true, data: true, message: 'Logged out successfully' });
}
