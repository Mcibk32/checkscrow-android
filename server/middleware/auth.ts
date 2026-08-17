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
      // DIAGNOSTIC: this is the #1 place the "linking" flow silently stops.
      // A wrong/mismatched CLERK_SECRET_KEY (i.e. not the secret key for the
      // SAME Clerk instance as the frontend's pk_live_ publishable key), an
      // expired token, or a clock-skew issue all land here.
      console.warn('[Auth] Clerk verifyToken FAILED - treating as unverified:', verifyErr?.message || verifyErr);
    }
  }

  // Fallback: ONLY when CLERK_SECRET_KEY is not configured at all (local/testing
  // environments without Clerk backend credentials), inspect the token structure
  // without verifying its signature.
  // SECURITY: this must NEVER run merely because verifyToken() failed while a
  // secret key IS configured - falling back to an unverified decode in that case
  // would let an attacker submit a forged Clerk-shaped JWT with an arbitrary
  // `email` claim and get linked to (or auto-provisioned into) another person's
  // account. A failed verification must stay unauthenticated, not degrade to
  // trusting an unverified payload.
  if (!clerkUserId && !CLERK_SECRET_KEY) {
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

    // If not found by uid, attempt to fetch user profile details from Clerk API if configured.
    // This is the ONLY reliable source of the verified email for a fresh device
    // session (Clerk session tokens do not carry an `email` claim by default).
    let clerkProfileFetchFailed = false;
    if (!userRow && CLERK_SECRET_KEY) {
      try {
        const client = getClerkClient();
        if (client) {
          const clerkUser = await client.users.getUser(clerkUserId);
          if (clerkUser) {
            // Prefer the account's actual PRIMARY email address (not just index 0,
            // which could be a secondary/unverified address on multi-email accounts).
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
        // DIAGNOSTIC: this is the #2 place the flow silently stops. If this
        // throws (wrong secret key for this Clerk instance, network egress
        // blocked from this server to api.clerk.com, revoked key, etc.), we
        // MUST NOT silently fall through to creating a placeholder-email
        // account below - that is exactly how duplicate/garbage accounts get
        // created instead of linking to the real one.
        console.error(`[Auth] Clerk API user fetch FAILED for uid=${clerkUserId.slice(0, 10)}... :`, clerkErr?.message || clerkErr);
      }
    }

    // If still not found by uid, check by email to link existing PostgreSQL account
    if (!userRow && clerkEmail) {
      userRow = await getRow<any>(
        `SELECT id, uid, email, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at 
         FROM users WHERE LOWER(TRIM(email)) = $1`,
        [clerkEmail.toLowerCase().trim()]
      );

      if (userRow) {
        // Link Clerk UID to existing user
        await runQuery(`UPDATE users SET uid = $1, updated_at = NOW() WHERE id = $2`, [clerkUserId, userRow.id]);
        userRow.uid = clerkUserId;
        console.log(`[Auth] Linked existing PostgreSQL user id=${userRow.id} to Clerk uid=${clerkUserId.slice(0, 10)}... (matched by email)`);
      }
    }

    // If we still don't have a verified email AND the Clerk profile fetch
    // itself failed (as opposed to genuinely having no email on file), refuse
    // to auto-provision. Creating a user here would use a fake placeholder
    // email and can never be matched to the person's real website account.
    if (!userRow && !clerkEmail && clerkProfileFetchFailed) {
      console.error(`[Auth] Refusing to auto-provision a new user for uid=${clerkUserId.slice(0, 10)}... - could not obtain a verified email from Clerk. Treating session as unauthenticated.`);
      return null;
    }

    // If still not found, auto-provision the new customer in PostgreSQL with a zero-balance wallet
    if (!userRow) {
      console.log(`[Auth] No existing PostgreSQL user for uid=${clerkUserId.slice(0, 10)}... email=${maskEmail(clerkEmail)} - provisioning new account.`);
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
    // DIAGNOSTIC: if the APK is hitting this branch for /api/auth/me, the
    // problem is upstream in the frontend (no token was ever attached) - see
    // ClerkAuthBridge / api.ts, not this file.
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
