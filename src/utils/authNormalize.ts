import { KYCStatus, UserProfile, UserRole } from '../types';

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RawRecord) : null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
};

const pickString = (record: RawRecord, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

const looksLikeUser = (record: RawRecord | null): boolean =>
  !!record && (asString(record.email) !== undefined || asString(record.id) !== undefined || asString(record.userId) !== undefined);

const VALID_ROLES: UserRole[] = ['buyer', 'seller', 'both', 'admin', 'moderator'];
const VALID_KYC_STATUSES: KYCStatus[] = ['unverified', 'pending', 'verified', 'rejected'];

/**
 * The CHECKSCROW API is served by more than one deployment generation, and the
 * auth payloads differ between them:
 *   { success, data: { token, user } }        (this repository's server)
 *   { authenticated, user, role }             (production www.checkscrow.com.ng)
 *   { token, user }
 * plus snake_case field names on some rows. These helpers accept every shape so
 * the app never renders an empty profile because of an envelope mismatch.
 */
export const extractSessionToken = (payload: unknown): string | null => {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.data) || {};
  const tokenKeys = ['token', 'sessionToken', 'session_token', 'accessToken', 'access_token', 'jwt'];
  return pickString(root, tokenKeys) ?? pickString(nested, tokenKeys) ?? null;
};

/** `false` only when the server explicitly reports an unauthenticated session. */
export const isExplicitlyUnauthenticated = (payload: unknown): boolean => {
  const root = asRecord(payload);
  if (!root) return false;
  const nested = asRecord(root.data);
  return root.authenticated === false || (!!nested && nested.authenticated === false);
};

const findUserRecord = (payload: unknown): { user: RawRecord; parent: RawRecord } | null => {
  const root = asRecord(payload);
  if (!root) return null;

  const nested = asRecord(root.data);
  const candidates: Array<{ user: RawRecord | null; parent: RawRecord }> = [
    { user: asRecord(root.user), parent: root },
    { user: asRecord(root.profile), parent: root },
    ...(nested
      ? [
          { user: asRecord(nested.user), parent: nested },
          { user: asRecord(nested.profile), parent: nested },
          { user: nested, parent: nested },
        ]
      : []),
    { user: root, parent: root },
  ];

  for (const candidate of candidates) {
    if (looksLikeUser(candidate.user)) {
      return { user: candidate.user as RawRecord, parent: candidate.parent };
    }
  }
  return null;
};

export const normalizeUserProfile = (payload: unknown): UserProfile | null => {
  if (isExplicitlyUnauthenticated(payload)) return null;

  const found = findUserRecord(payload);
  if (!found) return null;
  const { user, parent } = found;

  const id = pickString(user, ['id', 'userId', 'user_id', 'uid']);
  const email = pickString(user, ['email', 'emailAddress', 'email_address']);
  if (!id && !email) return null;

  const firstName = pickString(user, ['firstName', 'first_name']);
  const lastName = pickString(user, ['lastName', 'last_name']);
  const composedName = [firstName, lastName].filter(Boolean).join(' ').trim();

  const rawRole = pickString(user, ['role', 'accountType', 'account_type']) ?? pickString(parent, ['role']);
  const role = (VALID_ROLES as string[]).includes(rawRole ?? '') ? (rawRole as UserRole) : 'both';

  const rawKycStatus = pickString(user, ['kycStatus', 'kyc_status', 'verificationStatus', 'verification_status']);
  const kycStatus = (VALID_KYC_STATUSES as string[]).includes(rawKycStatus ?? '')
    ? (rawKycStatus as KYCStatus)
    : 'unverified';

  return {
    id: id ?? email ?? '',
    uid: pickString(user, ['uid', 'clerkUserId', 'clerk_user_id', 'clerkId', 'clerk_id']),
    email: email ?? '',
    fullName:
      pickString(user, ['fullName', 'full_name', 'name', 'displayName']) ||
      composedName ||
      (email ? email.split('@')[0] : 'CHECKSCROW User'),
    phoneNumber: pickString(user, ['phoneNumber', 'phone_number', 'phone']) ?? '',
    avatarUrl: pickString(user, ['avatarUrl', 'avatar_url', 'imageUrl', 'image_url', 'profileImage']),
    role,
    kycStatus,
    kycTier: asNumber(user.kycTier ?? user.kyc_tier ?? user.tier) ?? 1,
    createdAt: pickString(user, ['createdAt', 'created_at']) ?? '',
    updatedAt: pickString(user, ['updatedAt', 'updated_at']) ?? '',
    twoFactorEnabled:
      user.twoFactorEnabled === true ||
      user.two_factor_enabled === true ||
      user.twoFactorEnabled === 'true' ||
      user.mfaEnabled === true,
  };
};
