import { Response } from 'express';
import { runQuery, getRow, getAllRows, withTransaction } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';

export async function getWalletBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    let wallet = await getRow<any>(
      `SELECT available_balance, escrow_balance, pending_withdrawal_balance, currency FROM wallets WHERE user_id = $1`,
      [req.user.id]
    );

    // If wallet doesn't exist yet, lazily create zero balance wallet
    if (!wallet) {
      const walletId = 'wal_' + Date.now();
      const now = new Date().toISOString();
      await runQuery(
        `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
         VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)
         ON CONFLICT (user_id) DO NOTHING`,
        [walletId, req.user.id, now]
      );
      wallet = {
        available_balance: 0,
        escrow_balance: 0,
        pending_withdrawal_balance: 0,
        currency: 'NGN',
      };
    }

    res.json({
      success: true,
      data: {
        availableBalance: parseFloat(wallet.available_balance || 0),
        escrowBalance: parseFloat(wallet.escrow_balance || 0),
        pendingWithdrawalBalance: parseFloat(wallet.pending_withdrawal_balance || 0),
        currency: wallet.currency || 'NGN',
      },
    });
  } catch (err: any) {
    console.error('getWalletBalance error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve wallet balance.' });
  }
}

export async function getWalletTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const rawTxs = await getAllRows<any>(
      `SELECT id, type, amount, status, reference, description, created_at
       FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    const transactions = rawTxs.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount || 0),
      status: tx.status,
      reference: tx.reference,
      description: tx.description,
      createdAt: tx.created_at,
    }));

    res.json({
      success: true,
      data: {
        transactions,
        total: transactions.length,
      },
    });
  } catch (err: any) {
    console.error('getWalletTransactions error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve wallet transactions.' });
  }
}

export async function depositFunds(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const amount = Number(req.body.amount);
    const paymentMethod = req.body.paymentMethod ? String(req.body.paymentMethod).trim() : 'Direct Bank Transfer';

    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ success: false, error: 'Deposit amount must be greater than ₦0.00' });
      return;
    }

    const userId = req.user.id;
    const now = new Date().toISOString();
    const reference = 'DEP-' + Math.floor(100000 + Math.random() * 900000);
    const txId = 'tx_' + Date.now();
    const actId = 'act_' + Date.now();

    await withTransaction(async (txQuery) => {
      // Lock wallet or ensure row exists
      const walletRes = await txQuery(`SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
      if (walletRes.rows.length === 0) {
        await txQuery(
          `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
           VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)`,
          ['wal_' + Date.now(), userId, now]
        );
      }

      // Increment available_balance
      const updateRes = await txQuery(
        `UPDATE wallets SET available_balance = available_balance + $1, updated_at = $2 WHERE user_id = $3`,
        [amount, now, userId]
      );

      if (updateRes.rowCount === 0) {
        throw new Error('FAILED_WAL_UPDATE');
      }

      // Record transaction
      await txQuery(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
         VALUES ($1, $2, 'deposit', $3, 'completed', $4, $5, $6)`,
        [txId, userId, amount, reference, `Naira Deposit via ${paymentMethod}`, now]
      );

      // Record activity log
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Deposit Completed', $3, 'wallet', $4)`,
        [actId, userId, `Deposited ₦${amount.toLocaleString()} into available balance`, now]
      );
    });

    res.json({
      success: true,
      data: {
        reference,
        amount,
        status: 'completed',
      },
      message: 'Deposit completed successfully.',
    });
  } catch (err: any) {
    console.error('depositFunds error:', err);
    res.status(500).json({ success: false, error: 'Deposit failed. Transaction was rolled back.' });
  }
}

export async function withdrawFunds(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const amount = Number(req.body.amount);
    const bankName = req.body.bankName ? String(req.body.bankName).trim() : 'Nigerian Bank';
    const accountNumber = req.body.accountNumber ? String(req.body.accountNumber).trim() : '';

    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ success: false, error: 'Withdrawal amount must be greater than ₦0.00' });
      return;
    }

    const userId = req.user.id;
    const now = new Date().toISOString();
    const reference = 'WTH-' + Math.floor(100000 + Math.random() * 900000);
    const txId = 'tx_' + Date.now();
    const actId = 'act_' + Date.now();

    let insufficientFunds = false;

    await withTransaction(async (txQuery) => {
      // Lock wallet row for update
      const walletRes = await txQuery(
        `SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      const availableBalance = walletRes.rows[0] ? parseFloat(walletRes.rows[0].available_balance || 0) : 0;
      if (availableBalance < amount) {
        insufficientFunds = true;
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // Deduct available_balance and add to pending_withdrawal_balance
      const updateRes = await txQuery(
        `UPDATE wallets 
         SET available_balance = available_balance - $1, 
             pending_withdrawal_balance = pending_withdrawal_balance + $1, 
             updated_at = $2 
         WHERE user_id = $3 AND available_balance >= $1`,
        [amount, now, userId]
      );

      if (updateRes.rowCount === 0) {
        insufficientFunds = true;
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // Record transaction
      await txQuery(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
         VALUES ($1, $2, 'withdrawal', $3, 'pending', $4, $5, $6)`,
        [txId, userId, amount, reference, `Withdrawal request to ${bankName} (${accountNumber})`, now]
      );

      // Record activity log
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Withdrawal Initiated', $3, 'wallet', $4)`,
        [actId, userId, `Requested withdrawal of ₦${amount.toLocaleString()} to bank account`, now]
      );
    });

    res.json({
      success: true,
      data: {
        reference,
        amount,
        status: 'pending',
      },
      message: 'Withdrawal request submitted successfully.',
    });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_FUNDS') {
      res.status(400).json({ success: false, error: 'Insufficient available wallet balance.' });
      return;
    }
    console.error('withdrawFunds error:', err);
    res.status(500).json({ success: false, error: 'Withdrawal failed. Transaction was rolled back.' });
  }
}
