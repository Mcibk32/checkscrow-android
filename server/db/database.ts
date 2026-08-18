import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import path from 'path';

const { Pool } = pg;

let poolQueryHandler: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>;

const dbUrl = process.env.DATABASE_URL || '';

let poolInstance: pg.Pool | null = null;
let pgliteInstance: PGlite | null = null;
let usingPostgresPool = false;

function initPgliteFallback() {
  if (!pgliteInstance) {
    console.log('Initializing embedded PostgreSQL engine (PGlite)...');
    pgliteInstance = new PGlite();
  }
  poolQueryHandler = async (sql: string, params: any[] = []) => {
    const res = await pgliteInstance!.query(sql, params);
    return { rows: res.rows, rowCount: (res as any).affectedRows ?? res.rows.length };
  };
  usingPostgresPool = false;
}

// Enforce production DATABASE_URL presence and forbid PGlite fallback in production
if (process.env.NODE_ENV === 'production' && !dbUrl) {
  throw new Error('Missing DATABASE_URL in production; refusing to start with embedded fallback.');
}

if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
  console.log('Configuring PostgreSQL connection pool via pg.Pool...');
  poolInstance = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 3000,
  });
  usingPostgresPool = true;

  poolQueryHandler = async (sql: string, params: any[] = []) => {
    if (usingPostgresPool && poolInstance) {
      try {
        const res = await poolInstance.query(sql, params);
        return { rows: res.rows, rowCount: res.rowCount || 0 };
      } catch (err: any) {
        // In production we should NOT silently fallback to PGlite; surface error
        if (process.env.NODE_ENV === 'production') {
          console.error('[Database] PostgreSQL query error in production; refusing to fallback to PGlite:', err);
          throw err;
        }
        // In non-production: allow dynamic fallback if host unreachable
        if (err.code === 'EAI_AGAIN' || err.code === 'ENOTFOUND' || err.message?.includes('getaddrinfo')) {
          console.warn('[Database] External PostgreSQL host unreachable from this network context. Falling back to local PostgreSQL engine (PGlite)...');
          initPgliteFallback();
          const res = await pgliteInstance!.query(sql, params);
          return { rows: res.rows, rowCount: res.affectedRows || res.rows.length };
        }
        throw err;
      }
    } else {
      const res = await pgliteInstance!.query(sql, params);
      return { rows: res.rows, rowCount: res.affectedRows || res.rows.length };
    }
  };
} else {
  // Non-postgres URL: allow pglite fallback only for non-production
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is not a valid Postgres URL in production; refusing to start.');
  }
  initPgliteFallback();
}

export async function withTransaction<T>(
  callback: (txQuery: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>) => Promise<T>
): Promise<T> {
  if (usingPostgresPool && poolInstance) {
    try {
      const client = await poolInstance.connect();
      try {
        await client.query('BEGIN');
        const txQuery = async (sql: string, params: any[] = []) => {
          const res = await client.query(sql, params);
          return { rows: res.rows, rowCount: res.rowCount || 0 };
        };
        const result = await callback(txQuery);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (connErr: any) {
      // In production, fail startup / bubble error rather than local fallback.
      if (process.env.NODE_ENV === 'production') {
        console.error('[Database Transaction] Unable to obtain Postgres client in production:', connErr);
        throw connErr;
      }
      if (connErr.code === 'EAI_AGAIN' || connErr.code === 'ENOTFOUND' || connErr.message?.includes('getaddrinfo')) {
        console.warn('[Database Transaction] External PostgreSQL host unreachable. Using local PGlite transaction (non-production)...');
        initPgliteFallback();
      } else {
        throw connErr;
      }
    }
  }

  if (pgliteInstance) {
    await pgliteInstance.exec('BEGIN');
    try {
      const txQuery = async (sql: string, params: any[] = []) => {
        const res = await pgliteInstance!.query(sql, params);
        return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
      };
      const result = await callback(txQuery);
      await pgliteInstance.exec('COMMIT');
      return result;
    } catch (err) {
      await pgliteInstance.exec('ROLLBACK');
      throw err;
    }
  } else {
    throw new Error('Database instance unavailable');
  }
}

export async function runQuery(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  try {
    const res = await poolQueryHandler(sql, params);
    return { lastID: 0, changes: res.rowCount };
  } catch (err) {
    console.error('PostgreSQL Query Error:', err, 'SQL:', sql, 'Params:', params);
    throw err;
  }
}

export async function getRow<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  try {
    const res = await poolQueryHandler(sql, params);
    return (res.rows[0] as T) || undefined;
  } catch (err) {
    console.error('PostgreSQL GetRow Error:', err, 'SQL:', sql, 'Params:', params);
    throw err;
  }
}

export async function getAllRows<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const res = await poolQueryHandler(sql, params);
    return (res.rows || []) as T[];
  } catch (err) {
    console.error('PostgreSQL GetAllRows Error:', err, 'SQL:', sql, 'Params:', params);
    throw err;
  }
}

let schemaInitialized = false;

export async function initDb() {
  if (schemaInitialized) return;
  console.log('Initializing PostgreSQL database schema...');

  // Test pool connection if configured
  if (usingPostgresPool && poolInstance) {
    try {
      const client = await poolInstance.connect();
      client.release();
    } catch (err: any) {
      console.warn('[Database] External PostgreSQL host unreachable on startup. Initializing embedded PostgreSQL engine (PGlite)...');
      initPgliteFallback();
    }
  }

  if (!usingPostgresPool && !pgliteInstance) {
    initPgliteFallback();
  }

  // Users table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      uid VARCHAR(255) UNIQUE,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT DEFAULT '',
      full_name VARCHAR(255) NOT NULL,
      phone_number VARCHAR(50) DEFAULT '',
      role VARCHAR(50) DEFAULT 'both',
      account_status VARCHAR(50) DEFAULT 'active',
      kyc_status VARCHAR(50) DEFAULT 'unverified',
      kyc_tier INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);

  // Migration for uid column and nullable password_hash if table already existed
  try {
    await runQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS uid VARCHAR(255) UNIQUE`);
  } catch {}
  try {
    await runQuery(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
  } catch {}
  try {
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid)`);
  } catch {}

  // Wallets table - NUMERIC for exact money storage
  await runQuery(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      available_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
      escrow_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
      pending_withdrawal_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(10) DEFAULT 'NGN',
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);

  // Wallet Transactions table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      amount NUMERIC(15, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'NGN',
      status VARCHAR(50) NOT NULL,
      reference VARCHAR(100) NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);

  try {
    await runQuery(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'NGN'`);
  } catch (e) {}

  // Escrows table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      amount NUMERIC(15, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'NGN',
      status VARCHAR(50) NOT NULL,
      buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      seller_email VARCHAR(255) DEFAULT '',
      buyer_email VARCHAR(255) DEFAULT '',
      user_role VARCHAR(50) DEFAULT 'buyer',
      counterparty_name VARCHAR(255) DEFAULT '',
      inspection_period_days INTEGER DEFAULT 3,
      terms TEXT DEFAULT '',
      payment_status VARCHAR(50) DEFAULT 'unpaid',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
      deadline TIMESTAMP WITH TIME ZONE NOT NULL,
      delivered_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      cancelled_at TIMESTAMP WITH TIME ZONE,
      refunded_at TIMESTAMP WITH TIME ZONE
    )
  `);

  // Ensure extra columns exist if table was created earlier
  try {
    await runQuery(`ALTER TABLE escrows ADD COLUMN IF NOT EXISTS seller_id TEXT REFERENCES users(id) ON DELETE SET NULL`);
    await runQuery(`ALTER TABLE escrows ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE`);
    await runQuery(`ALTER TABLE escrows ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE`);
    await runQuery(`ALTER TABLE escrows ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE`);
    await runQuery(`ALTER TABLE escrows ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE`);
  } catch (e) {
    // Columns already exist
  }

  // Activity Logs table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      category VARCHAR(50) DEFAULT 'general',
      timestamp TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);

  // Escrow Chat Messages table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS escrow_chat_messages (
      id TEXT PRIMARY KEY,
      escrow_id TEXT NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_name VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      timestamp TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);

  // Escrow Disputes table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS escrow_disputes (
      id TEXT PRIMARY KEY,
      escrow_id TEXT NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
      raised_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      status VARCHAR(50) DEFAULT 'pending',
      resolution VARCHAR(50) DEFAULT '',
      resolution_details TEXT DEFAULT '',
      resolved_by TEXT REFERENCES users(id),
      buyer_split_amount NUMERIC(15, 2),
      seller_split_amount NUMERIC(15, 2),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      resolved_at TIMESTAMP WITH TIME ZONE
    )
  `);

  try {
    await runQuery(`ALTER TABLE escrow_disputes ADD COLUMN IF NOT EXISTS resolution VARCHAR(50) DEFAULT ''`);
    await runQuery(`ALTER TABLE escrow_disputes ADD COLUMN IF NOT EXISTS resolution_details TEXT DEFAULT ''`);
    await runQuery(`ALTER TABLE escrow_disputes ADD COLUMN IF NOT EXISTS resolved_by TEXT REFERENCES users(id)`);
    await runQuery(`ALTER TABLE escrow_disputes ADD COLUMN IF NOT EXISTS buyer_split_amount NUMERIC(15, 2)`);
    await runQuery(`ALTER TABLE escrow_disputes ADD COLUMN IF NOT EXISTS seller_split_amount NUMERIC(15, 2)`);
    await runQuery(`ALTER TABLE escrow_disputes ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE`);
  } catch (e) {
    // Columns already exist
  }

  // Payment Transactions table - Source of truth for deposits
  await runQuery(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reference VARCHAR(255) UNIQUE NOT NULL,
      provider VARCHAR(50) NOT NULL,
      amount NUMERIC(15, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'NGN',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      provider_reference VARCHAR(255) DEFAULT '',
      payment_method VARCHAR(50) DEFAULT '',
      metadata TEXT DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
      completed_at TIMESTAMP WITH TIME ZONE
    )
  `);

  // Bank Accounts table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_number VARCHAR(20) NOT NULL,
      account_name VARCHAR(255) NOT NULL,
      bank_code VARCHAR(50) NOT NULL,
      bank_name VARCHAR(255) NOT NULL,
      is_verified BOOLEAN DEFAULT false,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);

  // Withdrawals table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bank_account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
      amount NUMERIC(15, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'NGN',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      reference VARCHAR(255) UNIQUE NOT NULL,
      provider VARCHAR(50) DEFAULT 'paystack',
      provider_reference VARCHAR(255) DEFAULT '',
      failure_reason TEXT DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
      completed_at TIMESTAMP WITH TIME ZONE
    )
  `);

  // Notifications table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      reference_id VARCHAR(255) DEFAULT NULL,
      reference_type VARCHAR(50) DEFAULT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);

  // Audit Logs table for administrative moderation activities
  await runQuery(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_name VARCHAR(255) NOT NULL,
      actor_email VARCHAR(255) NOT NULL,
      action VARCHAR(100) NOT NULL,
      category VARCHAR(50) DEFAULT 'admin',
      target_id TEXT DEFAULT '',
      target_type VARCHAR(50) DEFAULT '',
      description TEXT DEFAULT '',
      metadata TEXT DEFAULT '',
      timestamp TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);

  // Create indexes for high performance
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_tx_user ON wallet_transactions(user_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_escrows_buyer ON escrows(buyer_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_escrows_seller ON escrows(seller_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_activities_user ON activity_logs(user_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_chat_escrow ON escrow_chat_messages(escrow_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_payments_user ON payment_transactions(user_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_payments_ref ON payment_transactions(reference)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(user_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_withdrawals_ref ON withdrawals(reference)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC)`);

  // Ensure default system administrator user exists
  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@checkscrow.ng').trim().toLowerCase();
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Password123!';
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash(adminPassword, 10);
  const now = new Date().toISOString();
  const existingAdmin = await getRow<any>(`SELECT id FROM users WHERE email = $1`, [adminEmail]);
  if (!existingAdmin) {
    const adminId = 'usr_admin_' + Date.now();
    await runQuery(
      `INSERT INTO users (id, email, password_hash, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at, updated_at)
       VALUES ($1, $2, $3, 'CHECKSCROW System Admin', '08000000000', 'admin', 'active', 'verified', 2, $4, $4)
       ON CONFLICT (email) DO NOTHING`,
      [adminId, adminEmail, hash, now]
    );
    await runQuery(
      `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
       VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)
       ON CONFLICT (user_id) DO NOTHING`,
      ['wal_admin_' + Date.now(), adminId, now]
    );
  } else {
    // Synchronize password hash and role
    await runQuery(
      `UPDATE users SET password_hash = $1, role = 'admin', account_status = 'active', kyc_status = 'verified', updated_at = $2 WHERE id = $3`,
      [hash, now, existingAdmin.id]
    );
  }

  schemaInitialized = true;
  console.log('PostgreSQL database tables and indexes initialized successfully.');
}
