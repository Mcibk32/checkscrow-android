import { Response } from 'express';
import { runQuery, getRow, getAllRows, withTransaction } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { paymentService } from '../services/paymentService';
import { createNotification } from '../services/notificationService';

/**
 * POST /api/wallet/deposit
 * Initiates a wallet deposit transaction.
 * Creates a pending payment_transactions record in PostgreSQL.
 * DOES NOT INCREASE WALLET BALANCE.
 */
export async function initiateDeposit(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const amount = Number(req.body.amount);
    const paymentMethod = req.body.paymentMethod ? String(req.body.paymentMethod).trim() : 'card';
    const currency = 'NGN';

    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ success: false, error: 'Deposit amount must be greater than ₦0.00' });
      return;
    }

    const userId = req.user.id;
    const userEmail = req.user.email;
    const now = new Date().toISOString();
    const reference = 'CHK-DEP-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
    const paymentId = 'pay_' + Date.now();

    let paymentCreated = false;

    // 1. Create pending payment_transactions record in PostgreSQL
    await runQuery(
      `INSERT INTO payment_transactions (
        id, user_id, reference, provider, amount, currency, status, payment_method, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)`,
      [
        paymentId,
        userId,
        reference,
        process.env.PAYMENT_PROVIDER || 'paystack',
        amount,
        currency,
        paymentMethod,
        now,
        now,
      ]
    );
    paymentCreated = true;

    // 2. Initialize with configured Payment Provider
    let initResult;
    try {
      initResult = await paymentService.initializePayment({
        userId,
        userEmail,
        amount,
        currency,
        reference,
        paymentMethod,
      });
    } catch (err: any) {
      console.error('Payment initialization error:', err);

      // Safely mark payment_transactions status = 'failed'
      if (paymentCreated) {
        await runQuery(
          `UPDATE payment_transactions SET status = 'failed', updated_at = $1 WHERE id = $2 AND status = 'pending'`,
          [now, paymentId]
        ).catch(() => {});
      }

      // Audit log failed initiation
      await runQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Payment Initiation Failed', $3, 'wallet', $4)`,
        ['act_' + Date.now(), userId, `Failed to initiate deposit of ₦${amount.toLocaleString()}: ${err.message}`, now]
      ).catch(() => {});

      res.status(400).json({
        success: false,
        error: err.message || 'Payment provider configuration error. Unable to initialize checkout.',
      });
      return;
    }

    // 3. Update provider_reference and provider in database
    await runQuery(
      `UPDATE payment_transactions SET provider = $1, provider_reference = $2, updated_at = $3 WHERE id = $4`,
      [initResult.provider, initResult.providerReference || '', now, paymentId]
    );

    // 4. Record activity log
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'Payment Initiated', $3, 'wallet', $4)`,
      ['act_' + Date.now(), userId, `Initiated ₦${amount.toLocaleString()} deposit via ${initResult.provider} (Ref: ${reference})`, now]
    );

    // Create deposit initiated notification
    await createNotification({
      userId,
      type: 'wallet',
      title: 'Deposit Initiated',
      message: `Your deposit request of ₦${amount.toLocaleString()} (Ref: ${reference}) has been created.`,
      referenceId: reference,
      referenceType: 'wallet',
    });

    // Create deposit initiated notification
    await createNotification({
      userId,
      type: 'wallet',
      title: 'Deposit Initiated',
      message: `Your deposit request of ₦${amount.toLocaleString()} (Ref: ${reference}) has been created.`,
      referenceId: reference,
      referenceType: 'wallet',
    });

    // 5. Return payment checkout details. Wallet balance remains UNCHANGED.
    res.status(201).json({
      success: true,
      data: {
        reference,
        amount,
        currency,
        status: 'pending',
        checkoutUrl: initResult.checkoutUrl,
        provider: initResult.provider,
        providerReference: initResult.providerReference,
      },
      message: 'Payment initiated successfully. Please complete checkout to fund your wallet.',
    });
  } catch (err: any) {
    console.error('initiateDeposit error:', err);
    res.status(500).json({ success: false, error: 'Internal server error while initializing deposit.' });
  }
}

/**
 * GET /api/payments/verify/:reference
 * Verifies a payment transaction with the payment provider.
 * ATOMICALLY credits the wallet EXACTLY ONCE upon verified provider success.
 * Implements strict row-level locking and double-credit protection.
 */
export async function verifyPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const reference = String(req.params.reference || '').trim();
    if (!reference) {
      res.status(400).json({ success: false, error: 'Payment transaction reference is required.' });
      return;
    }

    const userId = req.user.id;

    // 1. Find payment transaction by reference and user ID (IDOR protection)
    const payment = await getRow<any>(
      `SELECT * FROM payment_transactions WHERE reference = $1 AND user_id = $2`,
      [reference, userId]
    );

    if (!payment) {
      res.status(404).json({ success: false, error: 'Payment transaction reference not found.' });
      return;
    }

    // 2. IDEMPOTENCY CHECK: If already successful, return current state without crediting again
    if (payment.status === 'successful') {
      const wallet = await getRow<any>(`SELECT available_balance FROM wallets WHERE user_id = $1`, [userId]);
      res.json({
        success: true,
        data: {
          reference: payment.reference,
          amount: parseFloat(payment.amount),
          currency: payment.currency || 'NGN',
          status: 'successful',
          alreadyCredited: true,
          availableBalance: wallet ? parseFloat(wallet.available_balance || 0) : 0,
        },
        message: 'Payment was previously verified and credited to your wallet.',
      });
      return;
    }

    const expectedAmount = parseFloat(payment.amount);

    // 3. Verify with payment provider API
    let verifyRes;
    try {
      verifyRes = await paymentService.verifyPayment(reference, expectedAmount);
    } catch (err: any) {
      console.error('Payment service verification exception:', err);
      res.status(400).json({
        success: false,
        error: err.message || 'Error communicating with payment gateway for verification.',
      });
      return;
    }

    if (!verifyRes.verified || verifyRes.status !== 'successful') {
      const now = new Date().toISOString();
      if (verifyRes.status === 'failed') {
        await runQuery(
          `UPDATE payment_transactions SET status = 'failed', updated_at = $1 WHERE id = $2`,
          [now, payment.id]
        );
      }

      await runQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Payment Verification Failed', $3, 'wallet', $4)`,
        ['act_' + Date.now(), userId, `Verification failed for ref ${reference}: ${verifyRes.errorMessage || 'Unconfirmed status'}`, now]
      );

      res.status(422).json({
        success: false,
        data: {
          reference,
          status: verifyRes.status || 'failed',
        },
        error: verifyRes.errorMessage || 'Payment could not be verified with payment provider.',
      });
      return;
    }

    // 4. ATOMIC POSTGRESQL TRANSACTION: Credit wallet exactly once with row-level locking
    const now = new Date().toISOString();
    let updatedBalance = 0;
    let doubleCreditBlocked = false;

    await withTransaction(async (txQuery) => {
      // Lock the payment row
      const payRes = await txQuery(
        `SELECT id, status, amount, user_id FROM payment_transactions WHERE reference = $1 FOR UPDATE`,
        [reference]
      );

      const payRow = payRes.rows[0];
      if (!payRow) {
        throw new Error('PAYMENT_NOT_FOUND');
      }

      // Re-check status inside transaction lock
      if (payRow.status === 'successful') {
        doubleCreditBlocked = true;
        return;
      }

      const creditAmount = parseFloat(payRow.amount);

      // Mark payment_transactions status = 'successful'
      const updatePay = await txQuery(
        `UPDATE payment_transactions 
         SET status = 'successful', provider_reference = $1, completed_at = $2, updated_at = $2 
         WHERE reference = $3 AND status = 'pending'`,
        [verifyRes.providerReference || '', now, reference]
      );

      if (updatePay.rowCount === 0) {
        // Status was updated concurrently
        doubleCreditBlocked = true;
        return;
      }

      // Ensure user wallet exists
      await txQuery(
        `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
         VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)
         ON CONFLICT (user_id) DO NOTHING`,
        ['wal_' + Date.now(), userId, now]
      );

      // Lock user wallet and credit available_balance
      const walletRes = await txQuery(
        `UPDATE wallets 
         SET available_balance = available_balance + $1, updated_at = $2 
         WHERE user_id = $3 
         RETURNING available_balance`,
        [creditAmount, now, userId]
      );

      if (walletRes.rows[0]) {
        updatedBalance = parseFloat(walletRes.rows[0].available_balance || 0);
      }

      // Create wallet_transactions record
      await txQuery(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'tx_' + Date.now(),
          userId,
          'deposit',
          creditAmount,
          'completed',
          reference,
          `Verified Naira Deposit via ${payment.provider || 'gateway'}`,
          now,
        ]
      );

      // Create activity_logs record
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Deposit Verified & Completed', $3, 'wallet', $4)`,
        [
          'act_' + Date.now(),
          userId,
          `Verified payment of ₦${creditAmount.toLocaleString()} credited to available wallet balance`,
          now,
        ]
      );

      // Create Deposit Successful notification
      await createNotification({
        userId,
        type: 'wallet',
        title: 'Deposit Successful',
        message: `Your deposit of ₦${creditAmount.toLocaleString()} has been credited to your available wallet balance.`,
        referenceId: reference,
        referenceType: 'wallet',
        txQuery,
      });
    });

    if (doubleCreditBlocked) {
      const wallet = await getRow<any>(`SELECT available_balance FROM wallets WHERE user_id = $1`, [userId]);
      res.json({
        success: true,
        data: {
          reference,
          amount: expectedAmount,
          currency: payment.currency || 'NGN',
          status: 'successful',
          alreadyCredited: true,
          availableBalance: wallet ? parseFloat(wallet.available_balance || 0) : 0,
        },
        message: 'Payment was verified and credited.',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        reference,
        amount: expectedAmount,
        currency: payment.currency || 'NGN',
        status: 'successful',
        availableBalance: updatedBalance,
      },
      message: 'Payment successfully verified! Your wallet has been credited.',
    });
  } catch (err: any) {
    console.error('verifyPayment error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete payment verification.' });
  }
}

/**
 * GET /api/payments/:reference
 * Gets payment details by reference for authenticated user.
 */
export async function getPaymentStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const reference = req.params.reference;
    const payment = await getRow<any>(
      `SELECT id, reference, provider, amount, currency, status, payment_method, created_at, completed_at
       FROM payment_transactions WHERE reference = $1 AND user_id = $2`,
      [reference, req.user.id]
    );

    if (!payment) {
      res.status(404).json({ success: false, error: 'Payment transaction not found.' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: payment.id,
        reference: payment.reference,
        provider: payment.provider,
        amount: parseFloat(payment.amount),
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.payment_method,
        createdAt: payment.created_at,
        completedAt: payment.completed_at,
      },
    });
  } catch (err: any) {
    console.error('getPaymentStatus error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve payment status.' });
  }
}

/**
 * POST /api/payments/webhook
 * Server-side payment webhook handler.
 * Verifies cryptographic provider signature before processing payload.
 * Executes atomic idempotent wallet crediting.
 */
export async function handleWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const signature =
      (req.headers['x-paystack-signature'] as string) ||
      (req.headers['verif-hash'] as string) ||
      (req.headers['x-flutterwave-signature'] as string) ||
      '';

    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const isSignatureValid = paymentService.verifyWebhookSignature(rawBody, signature);

    if (!isSignatureValid && process.env.PAYMENT_PROVIDER !== 'virtual_bank') {
      console.warn('Webhook signature verification failed. Rejecting untrusted webhook event.');
      res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
      return;
    }

    const event = req.body;
    const eventName = event ? (event.event || event['event.type'] || '') : '';

    // --- HANDLE PAYOUT / TRANSFER WEBHOOK EVENTS ---
    if (eventName === 'transfer.success' || eventName === 'transfer.failed' || eventName === 'transfer.reversed') {
      const reference = event.data?.reference;
      if (!reference) {
        res.status(400).json({ success: false, error: 'Missing transfer reference in webhook body.' });
        return;
      }

      const withdrawal = await getRow<any>(
        `SELECT id, user_id, amount, status FROM withdrawals WHERE reference = $1`,
        [reference]
      );

      if (!withdrawal) {
        res.status(404).json({ success: false, error: 'Withdrawal reference not found.' });
        return;
      }

      const userId = withdrawal.user_id;
      const amount = parseFloat(withdrawal.amount);
      const now = new Date().toISOString();

      if (eventName === 'transfer.success') {
        if (withdrawal.status === 'successful') {
          res.json({ success: true, message: 'Transfer already marked successful.' });
          return;
        }

        await withTransaction(async (txQuery) => {
          const wRes = await txQuery(`SELECT status FROM withdrawals WHERE reference = $1 FOR UPDATE`, [reference]);
          if (!wRes.rows[0] || wRes.rows[0].status === 'successful') return;

          // Deduct from pending_withdrawal_balance
          await txQuery(
            `UPDATE wallets 
             SET pending_withdrawal_balance = pending_withdrawal_balance - $1, updated_at = $2 
             WHERE user_id = $3 AND pending_withdrawal_balance >= $1`,
            [amount, now, userId]
          );

          // Update withdrawal status
          await txQuery(
            `UPDATE withdrawals 
             SET status = 'successful', provider_reference = $1, completed_at = $2, updated_at = $2 
             WHERE reference = $3`,
            [String(event.data?.id || event.data?.transfer_code || ''), now, reference]
          );

          // Update wallet transaction
          await txQuery(
            `UPDATE wallet_transactions SET status = 'completed' WHERE reference = $1`,
            [reference]
          );

          // Record activity log
          await txQuery(
            `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
             VALUES ($1, $2, 'Payout Completed via Webhook', $3, 'wallet', $4)`,
            ['act_' + Date.now(), userId, `Withdrawal of ₦${amount.toLocaleString()} confirmed successful by Paystack`, now]
          );
        });

        res.json({ success: true, message: 'Transfer success webhook processed.' });
        return;
      } else {
        // transfer.failed or transfer.reversed
        if (withdrawal.status === 'failed' || withdrawal.status === 'cancelled') {
          res.json({ success: true, message: 'Transfer already processed as failed/cancelled.' });
          return;
        }

        const failureReason = event.data?.reason || event.data?.gateway_response || 'Transfer failed at provider';

        await withTransaction(async (txQuery) => {
          const wRes = await txQuery(`SELECT status FROM withdrawals WHERE reference = $1 FOR UPDATE`, [reference]);
          const currentStatus = wRes.rows[0]?.status;
          if (!currentStatus || currentStatus === 'failed' || currentStatus === 'cancelled') return;

          await txQuery(`SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);

          if (currentStatus === 'successful') {
            // Restore to available_balance if previously marked successful
            await txQuery(
              `UPDATE wallets SET available_balance = available_balance + $1, updated_at = $2 WHERE user_id = $3`,
              [amount, now, userId]
            );
          } else {
            // Pending or processing: restore available_balance and reduce pending_withdrawal_balance
            await txQuery(
              `UPDATE wallets 
               SET available_balance = available_balance + $1, 
                   pending_withdrawal_balance = pending_withdrawal_balance - $1, 
                   updated_at = $2 
               WHERE user_id = $3 AND pending_withdrawal_balance >= $1`,
              [amount, now, userId]
            );
          }

          // Update withdrawal status
          await txQuery(
            `UPDATE withdrawals 
             SET status = 'failed', failure_reason = $1, updated_at = $2 
             WHERE reference = $3`,
            [failureReason, now, reference]
          );

          // Update wallet transaction
          await txQuery(
            `UPDATE wallet_transactions SET status = 'failed' WHERE reference = $1`,
            [reference]
          );

          // Record activity log
          await txQuery(
            `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
             VALUES ($1, $2, 'Payout Failed via Webhook', $3, 'wallet', $4)`,
            ['act_' + Date.now(), userId, `Withdrawal of ₦${amount.toLocaleString()} failed: ${failureReason}. Funds restored.`, now]
          );
        });

        res.json({ success: true, message: 'Transfer failure webhook processed and funds restored.' });
        return;
      }
    }

    // --- HANDLE DEPOSIT WEBHOOK EVENTS ---
    let reference = '';
    let eventStatus = '';

    if (event && event.event === 'charge.success' && event.data) {
      // Paystack event format
      reference = event.data.reference;
      eventStatus = event.data.status === 'success' ? 'successful' : 'failed';
    } else if (event && event['event.type'] === 'CARD_TRANSACTION' && event.data) {
      // Flutterwave event format
      reference = event.data.tx_ref;
      eventStatus = event.data.status === 'successful' ? 'successful' : 'failed';
    } else if (event && event.reference) {
      reference = event.reference;
      eventStatus = event.status || 'successful';
    }

    if (!reference || eventStatus !== 'successful') {
      res.json({ success: true, message: 'Webhook received but event not actionable.' });
      return;
    }

    // Find pending payment transaction in PostgreSQL
    const payment = await getRow<any>(
      `SELECT * FROM payment_transactions WHERE reference = $1`,
      [reference]
    );

    if (!payment) {
      res.status(404).json({ success: false, error: 'Payment transaction reference not found.' });
      return;
    }

    if (payment.status === 'successful') {
      // Already credited - idempotent success
      res.json({ success: true, message: 'Payment already processed.' });
      return;
    }

    const userId = payment.user_id;
    const creditAmount = parseFloat(payment.amount);
    const now = new Date().toISOString();

    await withTransaction(async (txQuery) => {
      // Lock payment transaction row
      const payRes = await txQuery(
        `SELECT id, status FROM payment_transactions WHERE reference = $1 FOR UPDATE`,
        [reference]
      );

      const payRow = payRes.rows[0];
      if (!payRow || payRow.status === 'successful') {
        return;
      }

      // Mark payment_transactions status = 'successful'
      const updatePay = await txQuery(
        `UPDATE payment_transactions 
         SET status = 'successful', completed_at = $1, updated_at = $1 
         WHERE reference = $2 AND status = 'pending'`,
        [now, reference]
      );

      if (updatePay.rowCount === 0) {
        return;
      }

      // Ensure user wallet exists
      await txQuery(
        `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
         VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)
         ON CONFLICT (user_id) DO NOTHING`,
        ['wal_' + Date.now(), userId, now]
      );

      // Lock user wallet and credit available_balance
      await txQuery(
        `UPDATE wallets SET available_balance = available_balance + $1, updated_at = $2 WHERE user_id = $3`,
        [creditAmount, now, userId]
      );

      // Create wallet_transactions record
      await txQuery(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'tx_' + Date.now(),
          userId,
          'deposit',
          creditAmount,
          'completed',
          reference,
          `Verified Naira Deposit via Webhook (${payment.provider})`,
          now,
        ]
      );

      // Create activity_logs record
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Deposit Verified & Completed via Webhook', $3, 'wallet', $4)`,
        [
          'act_' + Date.now(),
          userId,
          `Webhook confirmed payment of ₦${creditAmount.toLocaleString()} credited to wallet`,
          now,
        ]
      );
    });

    res.json({ success: true, message: 'Webhook processed and wallet credited successfully.' });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ success: false, error: 'Failed to process payment webhook.' });
  }
}
