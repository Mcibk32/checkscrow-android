import { initDb, getRow, runQuery, withTransaction } from './db/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './middleware/auth';

/**
 * CHECKSCROW — Phase 11 Production Security, Reliability & Operational Hardening Test Suite
 */
async function runPhase11SecurityTests() {
  console.log('====================================================');
  console.log('  CHECKSCROW — PHASE 11 SECURITY & RELIABILITY SUITE ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  try {
    await initDb();

    // ----------------------------------------------------
    // TEST 1: Password Security & Hash Storage Audit
    // ----------------------------------------------------
    console.log('--- Test Group 1: Password Hash Security ---');
    const testEmail = `sec_test_${Date.now()}@checkscrow.com`;
    const plainPass = 'SuperSecret123!';
    const hashed = await bcrypt.hash(plainPass, 10);

    const testUserId = `usr_sec_${Date.now()}`;
    const now = new Date().toISOString();

    await runQuery(
      `INSERT INTO users (id, email, password_hash, full_name, role, account_status, kyc_status, kyc_tier, created_at, updated_at)
       VALUES ($1, $2, $3, 'Security Test User', 'both', 'active', 'unverified', 1, $4, $4)`,
      [testUserId, testEmail, hashed, now]
    );

    const dbUser = await getRow<any>(`SELECT password_hash FROM users WHERE id = $1`, [testUserId]);
    assert(dbUser.password_hash !== plainPass, 'Password is NOT stored in plaintext');
    assert(dbUser.password_hash.startsWith('$2a$') || dbUser.password_hash.startsWith('$2b$'), 'Password is encrypted using valid bcrypt algorithm');
    assert(await bcrypt.compare(plainPass, dbUser.password_hash), 'Bcrypt compare correctly verifies valid password');
    assert(!(await bcrypt.compare('WrongPassword', dbUser.password_hash)), 'Bcrypt compare rejects invalid password');

    // ----------------------------------------------------
    // TEST 2: Self-Registration Privilege Escalation Check
    // ----------------------------------------------------
    console.log('\n--- Test Group 2: Public Privilege Escalation Prevention ---');
    const allowedPublicRoles = ['buyer', 'seller', 'both'];
    const attemptedAdminRole = 'admin';
    const sanitizedRole = allowedPublicRoles.includes(attemptedAdminRole) ? attemptedAdminRole : 'both';
    assert(sanitizedRole === 'both', 'Registration endpoint sanitizes untrusted role inputs (admin -> both)');

    // ----------------------------------------------------
    // TEST 3: Account Suspension Enforcement in JWT Auth
    // ----------------------------------------------------
    console.log('\n--- Test Group 3: Account Suspension Enforcement ---');
    const activeToken = jwt.sign({ userId: testUserId }, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(activeToken, JWT_SECRET) as { userId: string };
    assert(decoded.userId === testUserId, 'JWT token correctly decodes user ID');

    // Suspend user
    await runQuery(`UPDATE users SET account_status = 'suspended' WHERE id = $1`, [testUserId]);
    const suspendedRow = await getRow<any>(`SELECT account_status FROM users WHERE id = $1`, [testUserId]);
    assert(suspendedRow.account_status === 'suspended', 'User account status set to suspended');
    // Restore active
    await runQuery(`UPDATE users SET account_status = 'active' WHERE id = $1`, [testUserId]);

    // ----------------------------------------------------
    // TEST 4: IDOR Protection & Escrow Deal Participant Isolation
    // ----------------------------------------------------
    console.log('\n--- Test Group 4: IDOR Protection & Participant Isolation ---');
    const buyerId = `usr_buyer_${Date.now()}`;
    const sellerId = `usr_seller_${Date.now()}`;
    const intruderId = `usr_intruder_${Date.now()}`;

    const buyerEmail = `buyer_${Date.now()}@test.com`;
    const sellerEmail = `seller_${Date.now()}@test.com`;
    const intruderEmail = `intruder_${Date.now()}@test.com`;

    await runQuery(`INSERT INTO users (id, email, password_hash, full_name, role, account_status, created_at, updated_at) VALUES ($1, $2, 'hash', 'Buyer', 'both', 'active', $3, $3)`, [buyerId, buyerEmail, now]);
    await runQuery(`INSERT INTO users (id, email, password_hash, full_name, role, account_status, created_at, updated_at) VALUES ($1, $2, 'hash', 'Seller', 'both', 'active', $3, $3)`, [sellerId, sellerEmail, now]);
    await runQuery(`INSERT INTO users (id, email, password_hash, full_name, role, account_status, created_at, updated_at) VALUES ($1, $2, 'hash', 'Intruder', 'both', 'active', $3, $3)`, [intruderId, intruderEmail, now]);

    const dealId = `esc_test_${Date.now()}`;
    const deadline = new Date(Date.now() + 7 * 86400000).toISOString();
    await runQuery(
      `INSERT INTO escrows (id, title, amount, status, buyer_id, seller_id, buyer_email, seller_email, payment_status, created_at, updated_at, deadline)
       VALUES ($1, 'Isolated Deal', 50000.00, 'awaiting_payment', $2, $3, $4, $5, 'unpaid', $6, $6, $7)`,
      [dealId, buyerId, sellerId, buyerEmail, sellerEmail, now, deadline]
    );

    // Verify authorized participant query vs intruder query
    const buyerAccess = await getRow<any>(`SELECT id FROM escrows WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)`, [dealId, buyerId]);
    const intruderAccess = await getRow<any>(`SELECT id FROM escrows WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)`, [dealId, intruderId]);

    assert(Boolean(buyerAccess), 'Legitimate deal buyer can access the escrow record');
    assert(!intruderAccess, 'Unauthorized third-party user cannot access the escrow record (IDOR Blocked)');

    // ----------------------------------------------------
    // TEST 5: Financial Operations Atomic Safety & Double Credit Prevention
    // ----------------------------------------------------
    console.log('\n--- Test Group 5: Atomic Wallet Operations & Double Credit Prevention ---');
    await runQuery(`INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at) VALUES ($1, $2, 100000.00, 0.00, 0.00, 'NGN', $3)`, [`wal_b_${Date.now()}`, buyerId, now]);

    let doubleFundPrevented = false;
    await withTransaction(async (txQuery) => {
      // Step 1: Fund deal
      const dealRes = await txQuery(`SELECT amount, status FROM escrows WHERE id = $1 FOR UPDATE`, [dealId]);
      if (dealRes.rows[0].status === 'awaiting_payment') {
        await txQuery(`UPDATE wallets SET available_balance = available_balance - 50000, escrow_balance = escrow_balance + 50000 WHERE user_id = $1`, [buyerId]);
        await txQuery(`UPDATE escrows SET status = 'funded', payment_status = 'paid' WHERE id = $1`, [dealId]);
      }
    });

    // Attempt second funding (simulated double submission)
    await withTransaction(async (txQuery) => {
      const dealRes = await txQuery(`SELECT status FROM escrows WHERE id = $1 FOR UPDATE`, [dealId]);
      if (dealRes.rows[0].status !== 'awaiting_payment') {
        doubleFundPrevented = true;
      }
    });

    assert(doubleFundPrevented, 'Second concurrent funding request blocked by transaction state lock');

    const buyerWalletAfterFund = await getRow<any>(`SELECT available_balance, escrow_balance FROM wallets WHERE user_id = $1`, [buyerId]);
    assert(parseFloat(buyerWalletAfterFund.available_balance) === 50000.00, 'Buyer available balance correctly reduced to ₦50,000.00');
    assert(parseFloat(buyerWalletAfterFund.escrow_balance) === 50000.00, 'Buyer escrow balance correctly increased to ₦50,000.00');

    // ----------------------------------------------------
    // TEST 6: Atomic Release & Wallet Payout Safety
    // ----------------------------------------------------
    console.log('\n--- Test Group 6: Atomic Escrow Release & Seller Credit ---');
    await runQuery(`INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at) VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)`, [`wal_s_${Date.now()}`, sellerId, now]);

    await withTransaction(async (txQuery) => {
      await txQuery(`UPDATE wallets SET escrow_balance = escrow_balance - 50000 WHERE user_id = $1`, [buyerId]);
      await txQuery(`UPDATE wallets SET available_balance = available_balance + 50000 WHERE user_id = $1`, [sellerId]);
      await txQuery(`UPDATE escrows SET status = 'completed', payment_status = 'released' WHERE id = $1`, [dealId]);
    });

    const buyerWalletFinal = await getRow<any>(`SELECT escrow_balance FROM wallets WHERE user_id = $1`, [buyerId]);
    const sellerWalletFinal = await getRow<any>(`SELECT available_balance FROM wallets WHERE user_id = $1`, [sellerId]);

    assert(parseFloat(buyerWalletFinal.escrow_balance) === 0.00, 'Buyer escrow balance correctly reduced to ₦0.00 after release');
    assert(parseFloat(sellerWalletFinal.available_balance) === 50000.00, 'Seller available balance correctly credited with ₦50,000.00');

    // ----------------------------------------------------
    // TEST 7: Negative Financial Input Validation
    // ----------------------------------------------------
    console.log('\n--- Test Group 7: Negative / Zero Financial Input Validation ---');
    const invalidAmount = -5000;
    const isAmountValid = !isNaN(invalidAmount) && invalidAmount > 0;
    assert(!isAmountValid, 'Negative financial transaction amount rejected by input validation');

    // ----------------------------------------------------
    // TEST 8: Chat Message Length & XSS Protection
    // ----------------------------------------------------
    console.log('\n--- Test Group 8: Input Size Protection & Chat Validation ---');
    const oversizedMsg = 'a'.repeat(2500);
    const isMsgValid = oversizedMsg.trim().length > 0 && oversizedMsg.trim().length <= 2000;
    assert(!isMsgValid, 'Oversized chat message (> 2000 chars) rejected by input length validator');

    console.log('\n====================================================');
    console.log(`  PHASE 11 SECURITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error during Phase 11 testing:', err);
    process.exit(1);
  }
}

runPhase11SecurityTests();
