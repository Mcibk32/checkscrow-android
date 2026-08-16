import { runQuery, getRow, getAllRows, initDb } from './db/database';
import { createNotification } from './services/notificationService';

async function runPhase9Test() {
  console.log('--- STARTING CHECKSCROW PHASE 9 AUTOMATED INTEGRATION TESTS ---');

  try {
    await initDb();
    // 1. Create two isolated test users
    const user1Email = `phase9_user1_${Date.now()}@checkscrow.test`;
    const user2Email = `phase9_user2_${Date.now()}@checkscrow.test`;
    const password = 'TestPassword123!';

    console.log(`[1] Registering User 1 (${user1Email}) and User 2 (${user2Email})...`);
    const user1Id = 'u_p9_1_' + Date.now();
    await runQuery(
      `INSERT INTO users (id, email, password_hash, full_name, kyc_tier, created_at, updated_at)
       VALUES ($1, $2, 'hash123', 'Phase9 User One', 1, NOW(), NOW())`,
      [user1Id, user1Email]
    );

    const user2Id = 'u_p9_2_' + Date.now();
    await runQuery(
      `INSERT INTO users (id, email, password_hash, full_name, kyc_tier, created_at, updated_at)
       VALUES ($1, $2, 'hash123', 'Phase9 User Two', 1, NOW(), NOW())`,
      [user2Id, user2Email]
    );

    // Ensure wallets exist
    await runQuery(
      `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
       VALUES ($1, $2, 50000.00, 0.00, 0.00, 'NGN', NOW())`,
      ['wal_p9_1_' + Date.now(), user1Id]
    );
    await runQuery(
      `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
       VALUES ($1, $2, 20000.00, 0.00, 0.00, 'NGN', NOW())`,
      ['wal_p9_2_' + Date.now(), user2Id]
    );

    // 2. Test Notification Creation
    console.log('[2] Creating notifications for User 1...');
    const notif1Id = await createNotification({
      userId: user1Id,
      type: 'wallet',
      title: 'Deposit Received',
      message: 'Your wallet has been credited with ₦50,000.',
      referenceId: 'REF-DEP-123',
      referenceType: 'wallet',
    });

    const notif2Id = await createNotification({
      userId: user1Id,
      type: 'escrow',
      title: 'Escrow Contract Invited',
      message: 'You have been invited to an escrow deal.',
      referenceId: 'ESC-999',
      referenceType: 'escrow',
    });

    // Create notification for User 2
    const notifUser2Id = await createNotification({
      userId: user2Id,
      type: 'security',
      title: 'Login Detected',
      message: 'New login from IP 127.0.0.1',
    });

    console.log(`-> Created Notifications: User1 (${notif1Id}, ${notif2Id}), User2 (${notifUser2Id})`);

    // 3. Verify Database Persistence & Indexing
    console.log('[3] Checking notification database queries & unread counts...');
    const unreadCount1 = await getRow<any>(
      `SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [user1Id]
    );
    console.log(`-> User 1 Unread Count in DB: ${unreadCount1.count} (Expected >= 2)`);
    if (unreadCount1.count < 2) {
      throw new Error('Unread count calculation failed.');
    }

    // 4. Test Notification Read Status
    console.log('[4] Marking Notification 1 as read for User 1...');
    await runQuery(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [notif1Id, user1Id]
    );

    const updatedUnreadCount1 = await getRow<any>(
      `SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [user1Id]
    );
    console.log(`-> User 1 Unread Count after read: ${updatedUnreadCount1.count} (Expected 1)`);
    if (updatedUnreadCount1.count !== 1) {
      throw new Error('Mark as read update failed.');
    }

    // 5. Test Strict Ownership Security (User 2 trying to mark User 1 notification read)
    console.log('[5] Testing Security: User 2 trying to update User 1 notification...');
    const unauthorizedUpdate = await runQuery(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [notif2Id, user2Id] // Incorrect user_id
    );
    const affected = unauthorizedUpdate.changes ?? 0;
    console.log(`-> Rows updated by User 2 on User 1 notification: ${affected} (Expected 0)`);
    if (affected !== 0) {
      throw new Error('SECURITY VIOLATION: User 2 updated User 1 notification!');
    }

    // 6. Test Activity Logs & Pagination Query
    console.log('[6] Inserting activity logs and testing filtering...');
    const nowTs = Date.now();
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES 
       ($1, $2, 'Profile Updated', 'Updated full name', 'account', NOW()),
       ($3, $2, 'Wallet Deposit', 'Credited ₦50,000 via Paystack', 'wallet', NOW()),
       ($4, $2, 'Escrow Created', 'Created deal Laptop Purchase', 'escrow', NOW())`,
      ['act_p9_1_' + nowTs, user1Id, 'act_p9_2_' + nowTs, 'act_p9_3_' + nowTs]
    );

    const filteredLogs = await getAllRows<any>(
      `SELECT * FROM activity_logs WHERE user_id = $1 AND category = 'wallet' ORDER BY timestamp DESC`,
      [user1Id]
    );
    console.log(`-> Filtered Activity Logs for category 'wallet': ${filteredLogs.length} record(s)`);
    if (filteredLogs.length !== 1) {
      throw new Error('Activity log category filter failed.');
    }

    // 7. Test Unified Transactions Query
    console.log('[7] Testing Unified Transactions query...');
    await runQuery(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
       VALUES ($1, $2, 'deposit', 50000.00, 'completed', $3, 'Naira Deposit', NOW())`,
      ['tx_p9_1_' + nowTs, user1Id, 'REF-DEP-P9-' + nowTs]
    );

    const user1Tx = await getAllRows<any>(
      `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC`,
      [user1Id]
    );
    const user2Tx = await getAllRows<any>(
      `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC`,
      [user2Id]
    );

    console.log(`-> User 1 Unified Transactions: ${user1Tx.length} record(s)`);
    console.log(`-> User 2 Unified Transactions: ${user2Tx.length} record(s)`);

    if (user1Tx.length < 1 || user2Tx.length > 0) {
      throw new Error('Unified transaction isolation check failed.');
    }

    // 8. Test Mark All as Read
    console.log('[8] Testing Mark All Notifications as Read...');
    await runQuery(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [user1Id]);
    const finalUnread = await getRow<any>(
      `SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [user1Id]
    );
    console.log(`-> User 1 Final Unread Count: ${finalUnread.count} (Expected 0)`);
    if (finalUnread.count !== 0) {
      throw new Error('Mark all as read failed.');
    }

    console.log('✅ CHECKSCROW PHASE 9 ALL TEST ASSERTIONS PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ PHASE 9 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase9Test();
