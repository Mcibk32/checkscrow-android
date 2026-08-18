import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { getRow, runQuery, withTransaction } from '../db/database';
import { createNotification } from '../services/notificationService';

export const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'checkscrow_dev_secret_key_2026_super_secure');
export const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (process.env.NODE_ENV === 'production') {
  if (!CLERK_SECRET_KEY) {
    throw new Error('Missing CLERK_SECRET_KEY in production');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('Missing JWT_SECRET in production');
  }
}

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

function maskEmail(email: string | null): string {
  if (!email) return '(none)';
  const at = email.indexOf('@');
  if (at <= 1) return '***' + email.slice(at);
  return email.slice(0, 2) + '***' + email.slice(at);
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
      console.log(`[Auth] Clerk token verified. sub=${clerkUserId ? clerkUserId.slice(0, 10) + '...' : '(none)'} tokenEmailClaim=${maskEmail(clerkEmail)}`);
    } catch (verifyErr: any) {
      console.warn('[Auth] Clerk verifyToken FAILED - treating as unauthenticated:', verifyErr?.message || verifyErr);
      // Do NOT fall back to unverified decoding. Treat as unauthenticated.
      clerkUserId = null;
    }
  } else {
    // No CLERK_SECRET_KEY configured; do not accept Clerk tokens (especially in production we threw earlier).
    console.warn('[Auth] CLERK_SECRET_KEY not configured. Clerk-based authentication disabled.');
  }

  // If identified as a Clerk user (verified only) proceed
  if (clerkUserId) {
    // Attempt to fetch Clerk profile details from Clerk API if configured.
    let clerkProfileFetchFailed = false;
    if (CLERK_SECRET_KEY) {
      try {
        const client = getClerkClient();
        if (client) {
          const clerkUser = await client.users.getUser(clerkUserId);
          if (clerkUser) {
            const primaryEmail =
              clerkUser.emailAddresses?.find((e: any) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
              clerkUser.emailAddresses?.[0]?.emailAddress ||
              null;
            if (primaryEmail) clerkEmail = primaryEmail;
            const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
            if (name) clerkFullName = name;
            clerkPhone = clerkUser.phoneNumbers?.[0]?.phoneNumber || clerkPhone;
            console.log(`[Auth] Clerk profile fetched for uid=${clerkUserId.slice(0, 10)}... resolvedEmail=${maskEmail(clerkEmail)}`);
          } else {
            console.warn(`[Auth] Clerk users.getUser(${clerkUserId.slice(0, 10)}...) returned no user.`);
          }
        } else {
          console.warn('[Auth] Clerk client unavailable (CLERK_SECRET_KEY missing at getClerkClient()).');
        }
      } catch (clerkErr: any) {
        clerkProfileFetchFailed = true;
        console.error(`[Auth] Clerk API user fetch FAILED for uid=${clerkUserId.slice(0, 10)}... :`, clerkErr?.message || clerkErr);
      }
    }

    try {
      // Use a transaction to perform safe linking/provisioning and wallet creation
      const userRow = await withTransaction<any>(async (txQuery) => {
        // 1) Re-check by UID inside the transaction
        let res = await txQuery(
          `SELECT id, uid, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at 
           FROM users WHERE uid = $1`,
          [clerkUserId]
        );
        if (res.rowCount > 0) {
          return res.rows[0];
        }

        // 2) If not found by uid, and we have an email, check by email
        if (clerkEmail) {
          res = await txQuery(
            `SELECT id, uid, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at 
             FROM users WHERE LOWER(TRIM(email)) = $1`,
            [clerkEmail.toLowerCase().trim()]
          );

          if (res.rowCount > 0) {
            const existing = res.rows[0];
            const existingUid = existing.uid || null;
            if (!existingUid) {
              // Safe to link: set uid
              await txQuery(`UPDATE users SET uid = $1, updated_at = NOW() WHERE id = $2`, [clerkUserId, existing.id]);
              existing.uid = clerkUserId;
              return existing;
            }
            if (existingUid === clerkUserId) {
              return existing;
            }

            // Conflict: existing user already linked to another Clerk UID => fail safely
            throw new Error('CLERK_UID_CONFLICT');
          }
        }

        // 3) Not found: auto-provision a new user and wallet atomically
        // Prepare safe values
        const newUserId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const newWalletId = 'wal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const safeEmail = (clerkEmail || `${clerkUserId}@user.checkscrow.ng`).toLowerCase().trim();
        const safeName = clerkFullName || 'CHECKSCROW User';
        const safePhone = clerkPhone || '';
        const now = new Date().toISOString();

        try {
          await txQuery(
            `INSERT INTO users (id, uid, email, password_hash, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at, updated_at)
             VALUES ($1, $2, $3, '', $4, $5, 'both', 'active', 'unverified', 1, $6, $7)`,
            [newUserId, clerkUserId, safeEmail, safeName, safePhone, now, now]
          );
        } catch (insertErr: any) {
          // If insert failed due to concurrent insert (unique constraint on email or uid), try to find the existing row and proceed
          if ((insertErr as any).code === '23505' || /duplicate key value/.test(insertErr?.message || '')) {
            // Re-fetch by uid then email
            let r = await txQuery(`SELECT id, uid, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at FROM users WHERE uid = $1`, [clerkUserId]);
            if (r.rowCount > 0) return r.rows[0];
            r = await txQuery(`SELECT id, uid, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at FROM users WHERE LOWER(TRIM(email)) = $1`, [safeEmail]);
            if (r.rowCount > 0) {
              const existing = r.rows[0];
              if (!existing.uid) {
                await txQuery(`UPDATE users SET uid = $1, updated_at = NOW() WHERE id = $2`, [clerkUserId, existing.id]);
                existing.uid = clerkUserId;
                return existing;
              }
              if (existing.uid === clerkUserId) return existing;
              throw new Error('CLERK_UID_CONFLICT');
            }
            throw insertErr; // rethrow if we cannot resolve
          }
          throw insertErr;
        }

        // Create wallet
        await txQuery(
          `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
           VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)`,
          [newWalletId, newUserId, now]
        );

        // Activity log
        await txQuery(
          `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
           VALUES ($1, $2, 'Account Registered', 'Successfully created CHECKSCROW account with Clerk.', 'security', $3)`,
          ['act_' + Date.now(), newUserId, now]
        );

        return {
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
      });

      // If transaction succeeded, optionally notify outside transaction (notification may use non-transactional paths)
      if (userRow) {
        try {
          await createNotification({
            userId: userRow.id,
            type: 'account',
            title: 'Welcome to CHECKSCROW',
            message: 'Your account has been successfully created. Welcome aboard!',
            referenceId: userRow.id,
            referenceType: 'account',
          });
        } catch (notifyErr) {
          console.warn('[Auth] createNotification failed (non-fatal):', notifyErr?.message || notifyErr);
        }

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
    } catch (err: any) {
      if (err?.message === 'CLERK_UID_CONFLICT') {
        console.error(`[Auth] Clerk UID conflict for uid=${clerkUserId.slice(0, 10)}... - existing account already linked to a different Clerk ID. Refusing to authenticate.`);
        return null;
      }
      console.error('[Auth] Unexpected error during Clerk user resolution:', err?.message || err);
      return null;
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
    console.warn(`[Auth] requireAuth: no Bearer token on ${req.method} ${req.originalUrl}`);
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
      console.warn(`[Auth] requireAuth: resolveUserFromToken returned null for ${req.method} ${req.originalUrl} - see [Auth] logs above for the exact reason.`);
      res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token.',
        code: 'INVALID_TOKEN',
      });
      return;
    }
    console.log(`[Auth] requireAuth: resolved user id=${authUser.id} for ${req.method} ${req.originalUrl}`);

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
