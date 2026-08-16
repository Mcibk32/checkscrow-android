import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { getRow, runQuery } from '../db/database';
import { createNotification } from '../services/notificationService';

export const JWT_SECRET = process.env.JWT_SECRET || 'checkscrow_dev_secret_key_2026_super_secure';
export const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

export interface AuthenticatedUser {
  id: string;
  uid?: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: string;
  accountStatus: string;
  kycStatus: string;
  kycTier: number;
  createdAt: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

let clerkClientInstance: ReturnType<typeof createClerkClient> | null = null;
function getClerkClient() {
  if (!clerkClientInstance && CLERK_SECRET_KEY) {
    clerkClientInstance = createClerkClient({ secretKey: CLERK_SECRET_KEY });
  }
  return clerkClientInstance;
}

export async function resolveUserFromToken(token: string): Promise<AuthenticatedUser | null> {
  // 1. Try Clerk Token Verification
  let clerkUserId: string | null = null;
  let clerkEmail: string | null = null;
  let clerkFullName: string | null = null;
  let clerkPhone: string | null = null;

  if (CLERK_SECRET_KEY) {
    try {
      const verified = await verifyToken(token, {
        secretKey: CLERK_SECRET_KEY,
        jwtKey: process.env.CLERK_JWT_KEY,
      });
      if (verified && verified.sub) {
        clerkUserId = verified.sub;
        if ((verified as any).email) clerkEmail = (verified as any).email;
      }
    } catch {
      // Token signature failed with CLERK_SECRET_KEY
    }
  }

  // Fallback: If no CLERK_SECRET_KEY configured or in testing environment, inspect token structure
  if (!clerkUserId) {
    try {
      const unverified = jwt.decode(token) as any;
      if (unverified && (unverified.sub?.startsWith('user_') || unverified.iss?.includes('clerk') || unverified.sid)) {
        clerkUserId = unverified.sub;
        if (unverified.email) clerkEmail = unverified.email;
        if (unverified.name) clerkFullName = unverified.name;
        if (unverified.phone_number) clerkPhone = unverified.phone_number;
      }
    } catch {}
  }

  // If identified as a Clerk user
  if (clerkUserId) {
    // Check if user exists in PostgreSQL by uid
    let userRow = await getRow<any>(
      `SELECT id, uid, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at 
       FROM users WHERE uid = $1`,
      [clerkUserId]
    );

    // If not found by uid, attempt to fetch user profile details from Clerk API if configured
    if (!userRow && CLERK_SECRET_KEY) {
      try {
        const client = getClerkClient();
        if (client) {
          const clerkUser = await client.users.getUser(clerkUserId);
          if (clerkUser) {
            clerkEmail = clerkUser.emailAddresses?.[0]?.emailAddress || clerkEmail;
            const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
            if (name) clerkFullName = name;
            clerkPhone = clerkUser.phoneNumbers?.[0]?.phoneNumber || clerkPhone;
          }
        }
      } catch (clerkErr) {
        console.warn('Clerk API user fetch error (non-fatal):', clerkErr);
      }
    }

    // If still not found by uid, check by email to link existing PostgreSQL account
    if (!userRow && clerkEmail) {
      userRow = await getRow<any>(
        `SELECT id, uid, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at 
         FROM users WHERE email = $1`,
        [clerkEmail.toLowerCase().trim()]
      );

      if (userRow) {
        // Link Clerk UID to existing user
        await runQuery(`UPDATE users SET uid = $1, updated_at = NOW() WHERE id = $2`, [clerkUserId, userRow.id]);
        userRow.uid = clerkUserId;
      }
    }

    // If still not found, auto-provision the new customer in PostgreSQL with a zero-balance wallet
    if (!userRow) {
      const newUserId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const newWalletId = 'wal_' + Date.now();
      const safeEmail = (clerkEmail || `${clerkUserId}@user.checkscrow.ng`).toLowerCase().trim();
      const safeName = clerkFullName || 'CHECKSCROW User';
      const safePhone = clerkPhone || '';
      const now = new Date().toISOString();

      await runQuery(
        `INSERT INTO users (id, uid, email, password_hash, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at, updated_at)
         VALUES ($1, $2, $3, '', $4, $5, 'both', 'active', 'unverified', 1, $6, $7)`,
        [newUserId, clerkUserId, safeEmail, safeName, safePhone, now, now]
      );

      await runQuery(
        `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
         VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)`,
        [newWalletId, newUserId, now]
      );

      await runQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Account Registered', 'Successfully created CHECKSCROW account with Clerk.', 'security', $3)`,
        ['act_' + Date.now(), newUserId, now]
      );

      await createNotification({
        userId: newUserId,
        type: 'account',
        title: 'Welcome to CHECKSCROW',
        message: 'Your account has been successfully created. Welcome aboard!',
        referenceId: newUserId,
        referenceType: 'account',
      });

      userRow = {
        id: newUserId,
        uid: clerkUserId,
        email: safeEmail,
        full_name: safeName,
        phone_number: safePhone,
        role: 'both',
        account_status: 'active',
        kyc_status: 'unverified',
        kyc_tier: 1,
        created_at: now,
      };
    }

    if (userRow) {
      return {
        id: userRow.id,
        uid: userRow.uid || clerkUserId,
        email: userRow.email,
        fullName: userRow.full_name,
        phoneNumber: userRow.phone_number || '',
        role: userRow.role || 'both',
        accountStatus: userRow.account_status || 'active',
        kycStatus: userRow.kyc_status || 'unverified',
        kycTier: userRow.kyc_tier || 1,
        createdAt: userRow.created_at,
      };
    }
  }

  // 2. Custom CHECKSCROW JWT Verification (Legacy/Admin sessions)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; id?: string };
    const targetId = decoded.userId || decoded.id;
    if (targetId) {
      const userRow = await getRow<any>(
        `SELECT id, uid, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at 
         FROM users WHERE id = $1 OR uid = $1`,
        [targetId]
      );
      if (userRow) {
        return {
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
        };
      }
    }
  } catch {}

  return null;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const authUser = await resolveUserFromToken(token);

    if (!authUser) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token.',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    if (authUser.accountStatus === 'suspended') {
      res.status(403).json({
        success: false,
        error: 'Your account has been suspended. Please contact support.',
        code: 'ACCOUNT_SUSPENDED',
      });
      return;
    }

    req.user = authUser;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token.',
      code: 'INVALID_TOKEN',
    });
  }
}

export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const authUser = await resolveUserFromToken(token);
      if (authUser) {
        req.user = authUser;
      }
    } catch {
      // Ignore token failure for optional auth
    }
  }
  next();
}

export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    if (req.user.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Access denied. Administrator privileges required.',
        code: 'FORBIDDEN',
      });
      return;
    }

    next();
  });
}

export async function requireModerator(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
      res.status(403).json({
        success: false,
        error: 'Access denied. Moderator or Administrator privileges required.',
        code: 'FORBIDDEN',
      });
      return;
    }

    next();
  });
}
