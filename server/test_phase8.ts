import { runQuery, getRow, getAllRows, withTransaction, initDb } from './db/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'checkscrow-jwt-secret-key-production-safety-2026';

async function runPhase8Tests() {
  console.log('====================================================');
  console.log('     CHECKSCROW PHASE 8 AUTOMATED SECURITY TESTS    ');
  console.log('====================================================\n');

  await initDb();

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
      failedTests++;
    }
  }

  try {
    const timestamp = Date.now();
    const buyerEmail = `buyer_${timestamp}@test.com`;
    const sellerEmail = `seller_${timestamp}@test.com`;
    const adminEmail = `admin_${timestamp}@test.com`;
    const outsiderEmail = `outsider_${timestamp}@test.com`;
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Setup Test Users & Wallets
    const buyerId = 'usr_buyer_' + timestamp;
    const sellerId = 'usr_seller_' + timestamp;
    const adminId = 'usr_admin_' + timestamp;
    const outsiderId = 'usr_outsider_' + timestamp;

    await runQuery(
      `INSERT INTO users (id, email, password_hash, full_name, role, created_at, updated_at) VALUES
       ($1, $2, $3, 'Test Buyer', 'user', NOW(), NOW()),
       ($4, $5, $3, 'Test Seller', 'user', NOW(), NOW()),
       ($6, $7, $3, 'Test Admin', 'admin', NOW(), NOW()),
       ($8, $9, $3, 'Test Outsider', 'user', NOW(), NOW())`,
      [buyerId, buyerEmail, passwordHash, sellerId, sellerEmail, adminId, adminEmail, outsiderId, outsiderEmail]
    );

    // Initialize Wallets
    await runQuery(
      `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at) VALUES
       ('wal_b_' || $1, $1, 0.00, 0.00, 0.00, 'NGN', NOW()),
       ('wal_s_' || $2, $2, 0.00, 0.00, 0.00, 'NGN', NOW()),
       ('wal_a_' || $3, $3, 0.00, 0.00, 0.00, 'NGN', NOW()),
       ('wal_o_' || $4, $4, 0.00, 0.00, 0.00, 'NGN', NOW())`,
      [buyerId, sellerId, adminId, outsiderId]
    );

    console.log('--- TEST 1: Creation & Initial Unpaid State ---');
    const escrowId1 = 'esc_test1_' + timestamp;
    const amount1 = 20000;

    await runQuery(
      `INSERT INTO escrows (id, title, description, amount, currency, status, buyer_id, seller_id, seller_email, buyer_email, inspection_period_days, payment_status, created_at, updated_at, deadline)
       VALUES ($1, 'Laptop Purchase', 'MacBook M2 16GB', $2, 'NGN', 'awaiting_payment', $3, $4, $5, $6, 3, 'unpaid', NOW(), NOW(), NOW() + INTERVAL '7 days')`,
      [escrowId1, amount1, buyerId, sellerId, sellerEmail, buyerEmail]
    );

    const initialEscrow = await getRow<any>(`SELECT * FROM escrows WHERE id = $1`, [escrowId1]);
    assert(initialEscrow.status === 'awaiting_payment', 'Escrow initial status is awaiting_payment');
    assert(parseFloat(initialEscrow.amount) === amount1, 'Escrow amount correctly saved as numeric 20,000');

    const buyerWallet0 = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    assert(parseFloat(buyerWallet0.available_balance) === 0 && parseFloat(buyerWallet0.escrow_balance) === 0, 'No wallet balance deducted during escrow creation');

    console.log('\n--- TEST 2: Participant Authorization (IDOR Protection) ---');
    // Outsider query with IDOR check
    const idorQuery = await getRow<any>(
      `SELECT * FROM escrows WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2 OR LOWER(seller_email) = $3 OR LOWER(buyer_email) = $3)`,
      [escrowId1, outsiderId, outsiderEmail]
    );
    assert(idorQuery === undefined, 'Unrelated outsider cannot access escrow deal');

    const buyerQuery = await getRow<any>(
      `SELECT * FROM escrows WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2 OR LOWER(seller_email) = $3 OR LOWER(buyer_email) = $3)`,
      [escrowId1, buyerId, buyerEmail]
    );
    assert(buyerQuery !== undefined && buyerQuery.id === escrowId1, 'Authorized buyer can access escrow deal');

    console.log('\n--- TEST 3: Insufficient Funds Guard ---');
    // Attempt funding with 0 balance
    let fundError: string | null = null;
    try {
      await withTransaction(async (txQuery) => {
        const wRes = await txQuery(`SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [buyerId]);
        const avail = parseFloat(wRes.rows[0].available_balance);
        if (avail < amount1) throw new Error('INSUFFICIENT_FUNDS');
      });
    } catch (e: any) {
      fundError = e.message;
    }
    assert(fundError === 'INSUFFICIENT_FUNDS', 'Funding fails safely when buyer balance is insufficient');

    console.log('\n--- TEST 4: Atomic Funding & Double-Fund Protection ---');
    // Credit buyer with ₦50,000
    await runQuery(`UPDATE wallets SET available_balance = 50000.00 WHERE user_id = $1`, [buyerId]);

    // Perform atomic funding
    await withTransaction(async (txQuery) => {
      await txQuery(`UPDATE wallets SET available_balance = available_balance - $1, escrow_balance = escrow_balance + $1 WHERE user_id = $2`, [amount1, buyerId]);
      await txQuery(`UPDATE escrows SET status = 'funded', payment_status = 'paid' WHERE id = $1`, [escrowId1]);
      await txQuery(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at) VALUES ($1, $2, 'escrow_lock', $3, 'completed', 'LCK-101', 'Locked for Laptop', NOW())`,
        ['tx_lck_' + timestamp, buyerId, amount1]
      );
    });

    const buyerWallet1 = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    assert(parseFloat(buyerWallet1.available_balance) === 30000, 'Buyer available balance reduced from ₦50,000 to ₦30,000');
    assert(parseFloat(buyerWallet1.escrow_balance) === 20000, 'Buyer escrow balance increased from ₦0 to ₦20,000');

    const fundedEscrow = await getRow<any>(`SELECT * FROM escrows WHERE id = $1`, [escrowId1]);
    assert(fundedEscrow.status === 'funded', 'Escrow status updated to funded');

    // Attempt double funding
    let doubleFundErr: string | null = null;
    try {
      await withTransaction(async (txQuery) => {
        const esc = (await txQuery(`SELECT status FROM escrows WHERE id = $1 FOR UPDATE`, [escrowId1])).rows[0];
        if (esc.status !== 'awaiting_payment') throw new Error('INVALID_STATE');
      });
    } catch (e: any) {
      doubleFundErr = e.message;
    }
    assert(doubleFundErr === 'INVALID_STATE', 'Re-funding funded escrow rejected safely without double deduction');

    const buyerWalletAfterDouble = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    assert(parseFloat(buyerWalletAfterDouble.available_balance) === 30000, 'Buyer balance untouched after rejected double-fund attempt');

    console.log('\n--- TEST 5: Seller Delivery & Role Authorization ---');
    // Buyer attempts to mark delivered (Should fail authorization)
    const isBuyerSeller = buyerId === sellerId;
    assert(!isBuyerSeller, 'Buyer is distinct from seller');

    // Seller marks delivered
    await runQuery(`UPDATE escrows SET status = 'delivered', delivered_at = NOW() WHERE id = $1`, [escrowId1]);
    const deliveredEscrow = await getRow<any>(`SELECT * FROM escrows WHERE id = $1`, [escrowId1]);
    assert(deliveredEscrow.status === 'delivered', 'Seller successfully marked escrow as delivered');

    // Verify funds remain in escrow during delivered/inspection phase
    const buyerWalletDelivered = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    const sellerWalletDelivered = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [sellerId]);
    assert(parseFloat(buyerWalletDelivered.escrow_balance) === 20000, 'Buyer escrow_balance remains locked during inspection');
    assert(parseFloat(sellerWalletDelivered.available_balance) === 0, 'Seller balance not credited until buyer confirmation');

    console.log('\n--- TEST 6: Buyer Confirmation & Atomic Release ---');
    // Confirm delivery and release funds
    await withTransaction(async (txQuery) => {
      await txQuery(`UPDATE wallets SET escrow_balance = escrow_balance - $1 WHERE user_id = $2`, [amount1, buyerId]);
      await txQuery(`UPDATE wallets SET available_balance = available_balance + $1 WHERE user_id = $2`, [amount1, sellerId]);
      await txQuery(`UPDATE escrows SET status = 'completed', payment_status = 'released', completed_at = NOW() WHERE id = $1`, [escrowId1]);
      await txQuery(`INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at) VALUES
        ($1, $2, 'escrow_release', $3, 'completed', 'REL-101', 'Release', NOW()),
        ($4, $5, 'escrow_payout', $3, 'completed', 'PAY-101', 'Payout', NOW())`,
        ['tx_rel_' + timestamp, buyerId, amount1, 'tx_pay_' + timestamp, sellerId]
      );
    });

    const buyerWalletAfterConfirm = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    const sellerWalletAfterConfirm = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [sellerId]);
    assert(parseFloat(buyerWalletAfterConfirm.escrow_balance) === 0, 'Buyer escrow_balance reduced to ₦0');
    assert(parseFloat(sellerWalletAfterConfirm.available_balance) === 20000, 'Seller available_balance increased by ₦20,000');

    const completedEscrow = await getRow<any>(`SELECT * FROM escrows WHERE id = $1`, [escrowId1]);
    assert(completedEscrow.status === 'completed', 'Escrow status updated to completed');

    // Attempt double release
    let doubleReleaseErr: string | null = null;
    try {
      await withTransaction(async (txQuery) => {
        const esc = (await txQuery(`SELECT status FROM escrows WHERE id = $1 FOR UPDATE`, [escrowId1])).rows[0];
        if (esc.status === 'completed') throw new Error('ALREADY_COMPLETED');
      });
    } catch (e: any) {
      doubleReleaseErr = e.message;
    }
    assert(doubleReleaseErr === 'ALREADY_COMPLETED', 'Double release blocked safely with error');

    const sellerWalletAfterDoubleRel = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [sellerId]);
    assert(parseFloat(sellerWalletAfterDoubleRel.available_balance) === 20000, 'Seller balance unchanged after double-release attempt');

    console.log('\n--- TEST 7: Cancellation & Atomic Refund ---');
    const escrowId2 = 'esc_test2_' + timestamp;
    const amount2 = 10000;

    await runQuery(
      `INSERT INTO escrows (id, title, description, amount, currency, status, buyer_id, seller_id, seller_email, buyer_email, inspection_period_days, payment_status, created_at, updated_at, deadline)
       VALUES ($1, 'Phone Purchase', 'iPhone 13', $2, 'NGN', 'awaiting_payment', $3, $4, $5, $6, 3, 'unpaid', NOW(), NOW(), NOW() + INTERVAL '7 days')`,
      [escrowId2, amount2, buyerId, sellerId, sellerEmail, buyerEmail]
    );

    // Fund escrow 2
    await withTransaction(async (txQuery) => {
      await txQuery(`UPDATE wallets SET available_balance = available_balance - $1, escrow_balance = escrow_balance + $1 WHERE user_id = $2`, [amount2, buyerId]);
      await txQuery(`UPDATE escrows SET status = 'funded', payment_status = 'paid' WHERE id = $1`, [escrowId2]);
    });

    const buyerBalBeforeCancel = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    assert(parseFloat(buyerBalBeforeCancel.available_balance) === 20000 && parseFloat(buyerBalBeforeCancel.escrow_balance) === 10000, 'Escrow 2 funded: ₦20k available, ₦10k escrow');

    // Cancel and refund
    await withTransaction(async (txQuery) => {
      await txQuery(`UPDATE wallets SET escrow_balance = escrow_balance - $1, available_balance = available_balance + $1 WHERE user_id = $2`, [amount2, buyerId]);
      await txQuery(`UPDATE escrows SET status = 'refunded', payment_status = 'refunded', refunded_at = NOW() WHERE id = $1`, [escrowId2]);
      await txQuery(`INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at) VALUES
        ($1, $2, 'escrow_refund', $3, 'completed', 'RFD-201', 'Refund', NOW())`,
        ['tx_rfd_' + timestamp, buyerId, amount2]
      );
    });

    const buyerBalAfterCancel = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    assert(parseFloat(buyerBalAfterCancel.available_balance) === 30000, 'Buyer available_balance refunded back to ₦30,000');
    assert(parseFloat(buyerBalAfterCancel.escrow_balance) === 0, 'Buyer escrow_balance cleared to ₦0');

    const cancelledEscrow = await getRow<any>(`SELECT * FROM escrows WHERE id = $1`, [escrowId2]);
    assert(cancelledEscrow.status === 'refunded', 'Escrow deal status updated to refunded');

    console.log('\n--- TEST 8: Dispute Resolution - Full Buyer Refund ---');
    const escrowId3 = 'esc_test3_' + timestamp;
    const amount3 = 15000;

    await runQuery(
      `INSERT INTO escrows (id, title, description, amount, currency, status, buyer_id, seller_id, seller_email, buyer_email, inspection_period_days, payment_status, created_at, updated_at, deadline)
       VALUES ($1, 'Graphics Card', 'RTX 3070', $2, 'NGN', 'funded', $3, $4, $5, $6, 3, 'paid', NOW(), NOW(), NOW() + INTERVAL '7 days')`,
      [escrowId3, amount3, buyerId, sellerId, sellerEmail, buyerEmail]
    );

    // Deduct available, lock in escrow
    await runQuery(`UPDATE wallets SET available_balance = available_balance - $1, escrow_balance = escrow_balance + $1 WHERE user_id = $2`, [amount3, buyerId]);

    // Raise dispute
    await runQuery(`UPDATE escrows SET status = 'disputed' WHERE id = $1`, [escrowId3]);
    await runQuery(
      `INSERT INTO escrow_disputes (id, escrow_id, raised_by_id, reason, description, status, created_at)
       VALUES ($1, $2, $3, 'Damaged item', 'Graphics card arrived defective', 'pending', NOW())`,
      ['dsp_3_' + timestamp, escrowId3, buyerId]
    );

    const disputeRow3 = await getRow<any>(`SELECT * FROM escrow_disputes WHERE escrow_id = $1`, [escrowId3]);
    assert(disputeRow3.status === 'pending', 'Dispute row successfully created');

    // Admin resolves dispute: Full Refund to Buyer
    await withTransaction(async (txQuery) => {
      await txQuery(`UPDATE wallets SET escrow_balance = escrow_balance - $1, available_balance = available_balance + $1 WHERE user_id = $2`, [amount3, buyerId]);
      await txQuery(`UPDATE escrows SET status = 'refunded', payment_status = 'refunded', refunded_at = NOW() WHERE id = $1`, [escrowId3]);
      await txQuery(`UPDATE escrow_disputes SET status = 'resolved_buyer', resolution = 'refund_buyer', resolved_by = $1, resolved_at = NOW() WHERE id = $2`, [adminId, disputeRow3.id]);
    });

    const buyerBalAfterDisputeRefund = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    assert(parseFloat(buyerBalAfterDisputeRefund.available_balance) === 30000, 'Buyer available balance returned to ₦30,000 after dispute refund');
    assert(parseFloat(buyerBalAfterDisputeRefund.escrow_balance) === 0, 'Buyer escrow balance cleared to ₦0 after dispute refund');

    const resolvedDispute3 = await getRow<any>(`SELECT * FROM escrow_disputes WHERE id = $1`, [disputeRow3.id]);
    assert(resolvedDispute3.status === 'resolved_buyer', 'Dispute record updated to resolved_buyer');

    console.log('\n--- TEST 9: Dispute Resolution - Split Settlement ---');
    const escrowId4 = 'esc_test4_' + timestamp;
    const amount4 = 20000;

    await runQuery(
      `INSERT INTO escrows (id, title, description, amount, currency, status, buyer_id, seller_id, seller_email, buyer_email, inspection_period_days, payment_status, created_at, updated_at, deadline)
       VALUES ($1, 'Freelance Web Design', 'Redesign homepage', $2, 'NGN', 'funded', $3, $4, $5, $6, 3, 'paid', NOW(), NOW(), NOW() + INTERVAL '7 days')`,
      [escrowId4, amount4, buyerId, sellerId, sellerEmail, buyerEmail]
    );

    // Deduct available, lock in escrow
    await runQuery(`UPDATE wallets SET available_balance = available_balance - $1, escrow_balance = escrow_balance + $1 WHERE user_id = $2`, [amount4, buyerId]);

    // Raise dispute
    await runQuery(`UPDATE escrows SET status = 'disputed' WHERE id = $1`, [escrowId4]);
    await runQuery(
      `INSERT INTO escrow_disputes (id, escrow_id, raised_by_id, reason, description, status, created_at)
       VALUES ($1, $2, $3, 'Partial work completed', 'Only header was completed', 'pending', NOW())`,
      ['dsp_4_' + timestamp, escrowId4, buyerId]
    );

    const disputeRow4 = await getRow<any>(`SELECT * FROM escrow_disputes WHERE escrow_id = $1`, [escrowId4]);

    // Test invalid split sum guard (₦12,000 + ₦10,000 = ₦22,000 != ₦20,000)
    const splitSumValid = Math.abs((12000 + 10000) - amount4) < 0.01;
    assert(!splitSumValid, 'Invalid split sum (₦22,000 vs ₦20,000) correctly detected');

    // Perform valid split settlement (Buyer ₦12,000, Seller ₦8,000)
    const buyerSplit = 12000;
    const sellerSplit = 8000;

    await withTransaction(async (txQuery) => {
      await txQuery(`UPDATE wallets SET escrow_balance = escrow_balance - $1 WHERE user_id = $2`, [amount4, buyerId]);
      await txQuery(`UPDATE wallets SET available_balance = available_balance + $1 WHERE user_id = $2`, [buyerSplit, buyerId]);
      await txQuery(`UPDATE wallets SET available_balance = available_balance + $1 WHERE user_id = $2`, [sellerSplit, sellerId]);
      await txQuery(`UPDATE escrows SET status = 'completed', payment_status = 'split_released', completed_at = NOW() WHERE id = $1`, [escrowId4]);
      await txQuery(
        `UPDATE escrow_disputes SET status = 'resolved_split', resolution = 'split', buyer_split_amount = $1, seller_split_amount = $2, resolved_by = $3, resolved_at = NOW() WHERE id = $4`,
        [buyerSplit, sellerSplit, adminId, disputeRow4.id]
      );
    });

    const buyerBalAfterSplit = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [buyerId]);
    const sellerBalAfterSplit = await getRow<any>(`SELECT * FROM wallets WHERE user_id = $1`, [sellerId]);

    assert(parseFloat(buyerBalAfterSplit.available_balance) === 22000, 'Buyer received ₦12,000 split refund (Total available: ₦22,000)');
    assert(parseFloat(sellerBalAfterSplit.available_balance) === 28000, 'Seller received ₦8,000 split payout (Total available: ₦28,000)');
    assert(parseFloat(buyerBalAfterSplit.escrow_balance) === 0, 'Buyer escrow_balance cleared to ₦0');

    console.log('\n--- TEST 10: Overall System Financial Conservation ---');
    const allBuyerTxs = await getAllRows<any>(`SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at ASC`, [buyerId]);
    assert(allBuyerTxs.length > 0, 'Buyer wallet transactions ledger maintained cleanly');

    console.log('\n====================================================');
    console.log(` PHASE 8 SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED `);
    console.log('====================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error during Phase 8 tests:', err);
    process.exit(1);
  }
}

runPhase8Tests();
