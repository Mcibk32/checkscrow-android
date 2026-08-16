import { Response } from 'express';
import { runQuery, getRow, getAllRows, withTransaction } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { paymentService } from '../services/paymentService';
import { maskAccountNumber } from './bankAccountController';
import { createNotification } from '../services/notificationService';

export async function requestWithdrawal(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const userId = req.user.id;

    // 1. Check user account status
    const user = await getRow<any>(`SELECT account_status FROM users WHERE id = $1`, [userId]);
    if (!user || user.account_status === 'suspended') {
      res.status(403).json({ success: false, error: 'Account is suspended or inactive. Withdrawal not permitted.' });
      return;
    }

    const rawAmount = Number(req.body.amount);
    const bankAccountId = req.body.bankAccountId ? String(req.body.bankAccountId).trim() : '';

    // If bankAccountId is not provided, allow passing bankCode & accountNumber
    const bankCode = req.body.bankCode ? String(req.body.bankCode).trim() : '';
    const accountNumber = req.body.accountNumber ? String(req.body.accountNumber).trim() : '';
    const bankName = req.body.bankName ? String(req.body.bankName).trim() : 'Nigerian Bank';
    const accountName = req.body.accountName ? String(req.body.accountName).trim() : 'ACCOUNT HOLDER';

    // 2. Validate amount
    if (isNaN(rawAmount) || rawAmount <= 0) {
      res.status(400).json({ success: false, error: 'Withdrawal amount must be greater than ₦0.00' });
      return;
    }

    const amount = Number(rawAmount.toFixed(2));
    if (amount <= 0 || isNaN(amount)) {
      res.status(400).json({ success: false, error: 'Invalid withdrawal amount format.' });
      return;
    }

    // 3. Resolve or verify bank account
    let targetBankAccount: any = null;

    if (bankAccountId) {
      targetBankAccount = await getRow<any>(
        `SELECT id, account_number, account_name, bank_code, bank_name, is_verified 
         FROM bank_accounts WHERE id = $1 AND user_id = $2`,
        [bankAccountId, userId]
      );

      if (!targetBankAccount) {
        res.status(404).json({ success: false, error: 'Selected bank account was not found or does not belong to you.' });
        return;
      }
    } else if (accountNumber && bankCode) {
      if (accountNumber.length !== 10 || !/^\d+$/.test(accountNumber)) {
        res.status(400).json({ success: false, error: 'Account number must be 10 digits.' });
        return;
      }

      // Check if this bank account is already saved, or temporarily create/use
      targetBankAccount = await getRow<any>(
        `SELECT id, account_number, account_name, bank_code, bank_name, is_verified 
         FROM bank_accounts WHERE user_id = $1 AND account_number = $2 AND bank_code = $3`,
        [userId, accountNumber, bankCode]
      );

      if (!targetBankAccount) {
        // Auto-save bank account
        const bnkId = 'bnk_' + Date.now();
        const now = new Date().toISOString();
        await runQuery(
          `INSERT INTO bank_accounts (id, user_id, account_number, account_name, bank_code, bank_name, is_verified, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, false, false, $7, $7)`,
          [bnkId, userId, accountNumber, accountName, bankCode, bankName, now]
        );
        targetBankAccount = {
          id: bnkId,
          account_number: accountNumber,
          account_name: accountName,
          bank_code: bankCode,
          bank_name: bankName,
          is_verified: false,
        };
      }
    } else {
      res.status(400).json({ success: false, error: 'Please select or provide a valid bank account for withdrawal.' });
      return;
    }

    const now = new Date().toISOString();
    const reference = 'WTH-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
    const withdrawalId = 'wth_' + Date.now();
    const txId = 'tx_' + Date.now();
    const actId = 'act_' + Date.now();

    let insufficientBalance = false;

    // 4. Atomic Balance Reservation in PostgreSQL Transaction
    await withTransaction(async (txQuery) => {
      const walletRes = await txQuery(
        `SELECT available_balance, pending_withdrawal_balance, currency FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      if (walletRes.rows.length === 0) {
        insufficientBalance = true;
        throw new Error('NO_WALLET');
      }

      const availableBalance = parseFloat(walletRes.rows[0].available_balance || 0);

      if (availableBalance < amount) {
        insufficientBalance = true;
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // Decrement available_balance and increment pending_withdrawal_balance
      const updateWallet = await txQuery(
        `UPDATE wallets 
         SET available_balance = available_balance - $1, 
             pending_withdrawal_balance = pending_withdrawal_balance + $1, 
             updated_at = $2 
         WHERE user_id = $3 AND available_balance >= $1`,
        [amount, now, userId]
      );

      if (updateWallet.rowCount === 0) {
        insufficientBalance = true;
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // Record withdrawal
      await txQuery(
        `INSERT INTO withdrawals (id, user_id, bank_account_id, amount, currency, status, reference, provider, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'NGN', 'pending', $5, 'paystack', $6, $6)`,
        [withdrawalId, userId, targetBankAccount.id, amount, reference, now]
      );

      // Record wallet transaction
      await txQuery(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
         VALUES ($1, $2, 'withdrawal', $3, 'pending', $4, $5, $6)`,
        [
          txId,
          userId,
          amount,
          reference,
          `Withdrawal request to ${targetBankAccount.bank_name} (${maskAccountNumber(targetBankAccount.account_number)})`,
          now,
        ]
      );

      // Record activity log
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Withdrawal Requested', $3, 'wallet', $4)`,
        [actId, userId, `Requested withdrawal of ₦${amount.toLocaleString()} to ${targetBankAccount.bank_name}`, now]
      );

      // Create notification
      await createNotification({
        userId,
        type: 'wallet',
        title: 'Withdrawal Initiated',
        message: `Your withdrawal request of ₦${amount.toLocaleString()} to ${targetBankAccount.bank_name} has been placed.`,
        referenceId: reference,
        referenceType: 'wallet',
        txQuery,
      });
    });

    // 5. Attempt Transfer via Paystack
    const transferResult = await paymentService.initiateTransfer({
      amount,
      accountNumber: targetBankAccount.account_number,
      accountName: targetBankAccount.account_name,
      bankCode: targetBankAccount.bank_code,
      reference,
      reason: `CHECKSCROW Withdrawal ${reference}`,
    });

    if (transferResult.success) {
      const updateNow = new Date().toISOString();
      await runQuery(
        `UPDATE withdrawals 
         SET status = 'processing', provider_reference = $1, updated_at = $2 
         WHERE id = $3`,
        [transferResult.providerReference || transferResult.transferCode || '', updateNow, withdrawalId]
      );

      await runQuery(
        `UPDATE wallet_transactions SET status = 'processing' WHERE reference = $1`,
        [reference]
      );

      res.status(201).json({
        success: true,
        data: {
          id: withdrawalId,
          reference,
          amount,
          currency: 'NGN',
          status: 'processing',
          bankAccount: {
            bankName: targetBankAccount.bank_name,
            accountName: targetBankAccount.account_name,
            maskedAccountNumber: maskAccountNumber(targetBankAccount.account_number),
          },
          createdAt: now,
        },
        message: 'Withdrawal initiated and being processed by payment gateway.',
      });
      return;
    }

    // If configuration error (e.g., transfers not active on Paystack account / missing keys)
    if (transferResult.isConfigError) {
      res.status(201).json({
        success: true,
        data: {
          id: withdrawalId,
          reference,
          amount,
          currency: 'NGN',
          status: 'pending',
          bankAccount: {
            bankName: targetBankAccount.bank_name,
            accountName: targetBankAccount.account_name,
            maskedAccountNumber: maskAccountNumber(targetBankAccount.account_number),
          },
          createdAt: now,
        },
        message: 'Withdrawal request created. Funds reserved as pending withdrawal.',
      });
      return;
    }

    // If explicit provider failure occurred, ATOMICALLY REVERSE THE RESERVATION!
    const failureReason = transferResult.errorMessage || 'Payout transfer failed at provider.';
    const rollbackNow = new Date().toISOString();

    await withTransaction(async (txQuery) => {
      // Revert balances
      await txQuery(
        `UPDATE wallets 
         SET available_balance = available_balance + $1, 
             pending_withdrawal_balance = pending_withdrawal_balance - $1, 
             updated_at = $2 
         WHERE user_id = $3 AND pending_withdrawal_balance >= $1`,
        [amount, rollbackNow, userId]
      );

      // Update withdrawal record
      await txQuery(
        `UPDATE withdrawals 
         SET status = 'failed', failure_reason = $1, updated_at = $2 
         WHERE id = $3`,
        [failureReason, rollbackNow, withdrawalId]
      );

      // Update wallet transaction
      await txQuery(
        `UPDATE wallet_transactions SET status = 'failed' WHERE reference = $1`,
        [reference]
      );

      // Record activity log
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Withdrawal Failed', $3, 'wallet', $4)`,
        ['act_' + Date.now(), userId, `Withdrawal of ₦${amount.toLocaleString()} failed: ${failureReason}. Funds restored.`, rollbackNow]
      );
    });

    res.status(400).json({
      success: false,
      error: `Withdrawal failed: ${failureReason}. Reserved funds have been restored to your available balance.`,
    });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_FUNDS' || err.message === 'NO_WALLET') {
      res.status(400).json({ success: false, error: 'Insufficient available wallet balance.' });
      return;
    }
    console.error('requestWithdrawal error:', err);
    res.status(500).json({ success: false, error: 'Failed to process withdrawal request.' });
  }
}

export async function getWithdrawals(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const rows = await getAllRows<any>(
      `SELECT w.id, w.amount, w.currency, w.status, w.reference, w.provider, w.provider_reference, 
              w.failure_reason, w.created_at, w.updated_at, w.completed_at,
              b.bank_name, b.account_name, b.account_number
       FROM withdrawals w
       LEFT JOIN bank_accounts b ON w.bank_account_id = b.id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );

    const withdrawals = rows.map(w => ({
      id: w.id,
      amount: parseFloat(w.amount || 0),
      currency: w.currency || 'NGN',
      status: w.status,
      reference: w.reference,
      provider: w.provider,
      providerReference: w.provider_reference,
      failureReason: w.failure_reason,
      bankAccount: {
        bankName: w.bank_name || 'Bank',
        accountName: w.account_name || 'Account Holder',
        maskedAccountNumber: maskAccountNumber(w.account_number || ''),
      },
      createdAt: w.created_at,
      updatedAt: w.updated_at,
      completedAt: w.completed_at,
    }));

    res.json({
      success: true,
      data: withdrawals,
    });
  } catch (err: any) {
    console.error('getWithdrawals error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve withdrawals.' });
  }
}

export async function getWithdrawalByReference(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const reference = req.params.reference;
    const userId = req.user.id;

    const row = await getRow<any>(
      `SELECT w.id, w.amount, w.currency, w.status, w.reference, w.provider, w.provider_reference, 
              w.failure_reason, w.created_at, w.updated_at, w.completed_at,
              b.bank_name, b.account_name, b.account_number
       FROM withdrawals w
       LEFT JOIN bank_accounts b ON w.bank_account_id = b.id
       WHERE w.reference = $1 AND w.user_id = $2`,
      [reference, userId]
    );

    if (!row) {
      res.status(404).json({ success: false, error: 'Withdrawal not found or access denied.' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        amount: parseFloat(row.amount || 0),
        currency: row.currency || 'NGN',
        status: row.status,
        reference: row.reference,
        provider: row.provider,
        providerReference: row.provider_reference,
        failureReason: row.failure_reason,
        bankAccount: {
          bankName: row.bank_name || 'Bank',
          accountName: row.account_name || 'Account Holder',
          maskedAccountNumber: maskAccountNumber(row.account_number || ''),
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
      },
    });
  } catch (err: any) {
    console.error('getWithdrawalByReference error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve withdrawal details.' });
  }
}

export async function cancelWithdrawal(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const reference = req.params.reference;
    const userId = req.user.id;
    const now = new Date().toISOString();

    let notCancellable = false;
    let notFound = false;
    let withdrawalAmount = 0;

    await withTransaction(async (txQuery) => {
      // Lock withdrawal row
      const wRes = await txQuery(
        `SELECT id, amount, status FROM withdrawals WHERE reference = $1 AND user_id = $2 FOR UPDATE`,
        [reference, userId]
      );

      if (wRes.rows.length === 0) {
        notFound = true;
        throw new Error('NOT_FOUND');
      }

      const w = wRes.rows[0];
      withdrawalAmount = parseFloat(w.amount || 0);

      if (w.status !== 'pending' && w.status !== 'processing') {
        notCancellable = true;
        throw new Error('NOT_CANCELLABLE');
      }

      // Lock wallet row
      await txQuery(`SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);

      // Revert balances
      await txQuery(
        `UPDATE wallets 
         SET available_balance = available_balance + $1, 
             pending_withdrawal_balance = pending_withdrawal_balance - $1, 
             updated_at = $2 
         WHERE user_id = $3 AND pending_withdrawal_balance >= $1`,
        [withdrawalAmount, now, userId]
      );

      // Update withdrawal status
      await txQuery(
        `UPDATE withdrawals 
         SET status = 'cancelled', updated_at = $1 
         WHERE reference = $2 AND user_id = $3`,
        [now, reference, userId]
      );

      // Update wallet transaction
      await txQuery(
        `UPDATE wallet_transactions SET status = 'cancelled' WHERE reference = $1 AND user_id = $2`,
        [reference, userId]
      );

      // Record activity log
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Withdrawal Cancelled', $3, 'wallet', $4)`,
        ['act_' + Date.now(), userId, `Cancelled pending withdrawal of ₦${withdrawalAmount.toLocaleString()}. Funds restored.`, now]
      );
    });

    res.json({
      success: true,
      message: 'Withdrawal request cancelled and reserved funds returned to available balance.',
      data: {
        reference,
        status: 'cancelled',
        amount: withdrawalAmount,
      },
    });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Withdrawal not found or access denied.' });
      return;
    }
    if (err.message === 'NOT_CANCELLABLE') {
      res.status(400).json({ success: false, error: 'Withdrawal cannot be cancelled because it is already completed or failed.' });
      return;
    }
    console.error('cancelWithdrawal error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel withdrawal.' });
  }
}
