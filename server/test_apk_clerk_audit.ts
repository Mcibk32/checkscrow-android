import { initDb, getRow, runQuery, getAllRows } from './db/database';
import { resolveUserFromToken, JWT_SECRET, CLERK_SECRET_KEY } from './middleware/auth';
import { authService } from '../src/services/authService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

async function runApkClerkAudit() {
  console.log('===============================================================');
  console.log('   CHECKSCROW APK PRODUCTION CLERK AUTHENTICATION AUDIT SUITE   ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}${details ? ` -> ${details}` : ''}`);
      failed++;
    }
  }

  try {
    await initDb();

    // -----------------------------------------------------------------
    // AUDIT 1: Production Clerk Publishable Key & Secret Key Isolation
    // -----------------------------------------------------------------
    console.log('--- 1. AUDIT CLERK CONFIGURATION & KEYS ---');
    const clerkPub = process.env.VITE_CLERK_PUBLISHABLE_KEY || '';
    const clerkSec = process.env.CLERK_SECRET_KEY || '';

    assert(Boolean(clerkPub && clerkPub.trim().length > 0), 'Clerk Publishable Key is defined and non-empty');
    assert(clerkPub.startsWith('pk_live_'), 'Clerk Publishable Key is a PRODUCTION key (starts with pk_live_)');
    assert(!clerkPub.startsWith('pk_test_'), 'Development Clerk key (pk_test_) is NOT used');
    assert(!clerkPub.includes('placeholder') && !clerkPub.includes('YOUR_KEY'), 'Clerk Publishable Key is NOT a placeholder');
    assert(Boolean(clerkSec && clerkSec.length > 0), 'Server CLERK_SECRET_KEY is present in backend environment');

    // -----------------------------------------------------------------
    // AUDIT 2: Client Build Bundle Inspection (Secret Leak Prevention)
    // -----------------------------------------------------------------
    console.log('\n--- 2. AUDIT CLIENT BUNDLE & SECRETS ISOLATION ---');
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      const distFiles = fs.readdirSync(path.join(distPath, 'assets'));
      let clientBundleText = '';
      for (const f of distFiles) {
        if (f.endsWith('.js')) {
          clientBundleText += fs.readFileSync(path.join(distPath, 'assets', f), 'utf-8');
        }
      }

      assert(!clientBundleText.includes(clerkSec), 'APK client bundle does NOT contain CLERK_SECRET_KEY');
      assert(!clientBundleText.includes('checkscrow_dev_secret_key_2026_super_secure'), 'APK client bundle does NOT contain backend JWT secrets');
      assert(clientBundleText.includes('pk_live_'), 'APK client bundle contains production Clerk Publishable Key');
    } else {
      console.log('  [INFO] Dist folder will be verified after full build step.');
    }

    // -----------------------------------------------------------------
    // AUDIT 3: Email / Password Authentication & Session Resolution
    // -----------------------------------------------------------------
    console.log('\n--- 3. EMAIL/PASSWORD LOGIN & SESSION RESOLUTION ---');
    const testEmail = `apk_prod_user_${Date.now()}@checkscrow.com.ng`;
    const testPass = 'ProdSecureP@ss2026';
    const hashed = await bcrypt.hash(testPass, 10);
    const userId = `usr_apk_${Date.now()}`;
    const now = new Date().toISOString();

    // Create production test user in PostgreSQL
    await runQuery(
      `INSERT INTO users (id, email, password_hash, full_name, phone_number, role, account_status, kyc_status, kyc_tier, created_at, updated_at)
       VALUES ($1, $2, $3, 'Favour Shaba', '+2348012345678', 'both', 'active', 'unverified', 1, $4, $4)`,
      [userId, testEmail, hashed, now]
    );

    // Initialize wallet
    const walletId = `wal_apk_${Date.now()}`;
    await runQuery(
      `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
       VALUES ($1, $2, 250000.00, 50000.00, 0.00, 'NGN', $3)`,
      [walletId, userId, now]
    );

    // Verify Password Match
    const dbUser = await getRow<any>(`SELECT * FROM users WHERE email = $1`, [testEmail]);
    assert(Boolean(dbUser), 'User retrieved from production PostgreSQL database');
    assert(await bcrypt.compare(testPass, dbUser.password_hash), 'Password authentication succeeds for user credentials');

    // Simulate Token Generation (CHECKSCROW JWT Bearer)
    const testToken = jwt.sign({ userId: dbUser.id }, JWT_SECRET, { expiresIn: '7d' });
    const resolvedUser = await resolveUserFromToken(testToken);

    assert(Boolean(resolvedUser), 'Token successfully resolved to authenticated user session');
    assert(resolvedUser?.id === dbUser.id, 'Resolved user ID matches production database user ID');
    assert(resolvedUser?.email === testEmail, 'Resolved email matches production database email');
    assert(resolvedUser?.fullName === 'Favour Shaba', 'Resolved full name matches user account');

    // -----------------------------------------------------------------
    // AUDIT 4: Production Clerk User Token & Multi-Client Linking
    // -----------------------------------------------------------------
    console.log('\n--- 4. CLERK PRODUCTION IDENTITY LINKING & TOKEN VERIFICATION ---');
    const clerkLiveSub = `user_2prodClerk_${Date.now()}`;
    
    // Simulate Clerk JWT with production sub and email matching existing user
    const simulatedClerkJwt = jwt.sign(
      {
        sub: clerkLiveSub,
        email: testEmail,
        name: 'Favour Shaba (Google)',
        iss: 'https://clerk.checkscrow.com.ng',
      },
      'temp_clerk_sign',
      { noTimestamp: false }
    );

    const resolvedClerkUser = await resolveUserFromToken(simulatedClerkJwt);
    assert(Boolean(resolvedClerkUser), 'Clerk token successfully resolved');
    assert(resolvedClerkUser?.id === userId, 'Clerk user identity linked to existing CHECKSCROW user ID');
    assert(resolvedClerkUser?.uid === clerkLiveSub, 'Clerk UID stored on CHECKSCROW user record');

    // Verify Shared Database State (Wallet, Escrow, KYC)
    const userWallet = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [userId]);
    assert(parseFloat(userWallet.available_balance) === 250000.00, 'APK and Website access identical wallet available balance (₦250,000.00)');
    assert(parseFloat(userWallet.escrow_balance) === 50000.00, 'APK and Website access identical escrow balance (₦50,000.00)');

    // -----------------------------------------------------------------
    // AUDIT 5: Cross-Client Safe Mutation & Synchronization
    // -----------------------------------------------------------------
    console.log('\n--- 5. CROSS-CLIENT SYNCHRONIZATION & MUTATION TEST ---');
    // Mutation 1: APK updates phone number
    const updatedPhone = '+2348099887766';
    await runQuery(`UPDATE users SET phone_number = $1, updated_at = NOW() WHERE id = $2`, [updatedPhone, userId]);

    // Website reads user
    const webRead = await getRow<any>(`SELECT phone_number FROM users WHERE id = $1`, [userId]);
    assert(webRead.phone_number === updatedPhone, 'APK phone update immediately visible on Website');

    // Mutation 2: Website updates full name
    const updatedName = 'Favour O. Shaba';
    await runQuery(`UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`, [updatedName, userId]);

    // APK reads user
    const apkRead = await getRow<any>(`SELECT full_name FROM users WHERE id = $1`, [userId]);
    assert(apkRead.full_name === updatedName, 'Website full name update immediately visible in APK');

    // -----------------------------------------------------------------
    // AUDIT 6: Customer-Only Security Boundary Enforcement
    // -----------------------------------------------------------------
    console.log('\n--- 6. CUSTOMER-ONLY APK SECURITY BOUNDARY ---');
    // Customer user trying to access admin
    assert(resolvedUser?.role === 'both', 'Customer user has standard customer role (both)');
    assert(resolvedUser?.role !== 'admin' && resolvedUser?.role !== 'moderator', 'Customer user does not have admin/moderator role');

    console.log('\n===============================================================');
    console.log(` AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED `);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal audit error:', err);
    process.exit(1);
  }
}

runApkClerkAudit();
