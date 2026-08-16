import { Response } from 'express';
import { getRow, getAllRows, runQuery } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';

export async function getDashboardData(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      // Guest state response
      res.json({
        success: true,
        data: {
          isGuest: true,
          user: null,
          wallet: {
            availableBalance: 0,
            escrowBalance: 0,
            pendingWithdrawalBalance: 0,
            currency: 'NGN',
          },
          escrow: {
            protectedFunds: 0,
            currency: 'NGN',
          },
          recentTransactions: [],
          activeEscrows: [],
        },
      });
      return;
    }

    const userId = req.user.id;

    // Fetch user wallet
    let wallet = await getRow<any>(
      `SELECT available_balance, escrow_balance, pending_withdrawal_balance, currency FROM wallets WHERE user_id = $1`,
      [userId]
    );

    if (!wallet) {
      // Create wallet if missing
      const walletId = 'wal_' + Date.now();
      await runQuery(
        `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
         VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)`,
        [walletId, userId, new Date().toISOString()]
      );
      wallet = {
        available_balance: 0,
        escrow_balance: 0,
        pending_withdrawal_balance: 0,
        currency: 'NGN',
      };
    }

    // Parse PostgreSQL NUMERIC to JavaScript numbers
    const availableBalance = parseFloat(wallet.available_balance || 0);
    const escrowBalance = parseFloat(wallet.escrow_balance || 0);
    const pendingWithdrawalBalance = parseFloat(wallet.pending_withdrawal_balance || 0);

    // Fetch recent 5 transactions
    const rawTxs = await getAllRows<any>(
      `SELECT id, type, amount, status, reference, description, created_at
       FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    const recentTransactions = rawTxs.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount || 0),
      status: tx.status,
      reference: tx.reference,
      description: tx.description,
      createdAt: tx.created_at,
    }));

    // Fetch active escrows where user is participant
    const userEmail = req.user.email.toLowerCase().trim();
    const rawEscrows = await getAllRows<any>(
      `SELECT id, title, description, amount, currency, status, buyer_id, seller_id, buyer_email, seller_email, user_role, counterparty_name, inspection_period_days, terms, created_at, deadline
       FROM escrows 
       WHERE (buyer_id = $1 OR seller_id = $1 OR LOWER(seller_email) = $2 OR LOWER(buyer_email) = $2)
       ORDER BY created_at DESC`,
      [userId, userEmail]
    );

    const activeEscrows = rawEscrows.map(esc => {
      const isBuyer = esc.buyer_id === userId || (esc.buyer_email && esc.buyer_email.toLowerCase() === userEmail);
      return {
        id: esc.id,
        title: esc.title,
        description: esc.description,
        amount: parseFloat(esc.amount || 0),
        currency: esc.currency || 'NGN',
        status: esc.status,
        userRole: isBuyer ? 'buyer' : 'seller',
        counterpartyName: esc.counterparty_name || (isBuyer ? esc.seller_email?.split('@')[0] : esc.buyer_email?.split('@')[0]) || 'Counterparty',
        counterpartyEmail: isBuyer ? esc.seller_email : esc.buyer_email,
        inspectionPeriodDays: esc.inspection_period_days,
        terms: esc.terms,
        createdAt: esc.created_at,
        deadline: esc.deadline,
      };
    });

    res.json({
      success: true,
      data: {
        isGuest: false,
        user: {
          id: req.user.id,
          name: req.user.fullName,
          email: req.user.email,
          kycStatus: req.user.kycStatus,
          kycTier: req.user.kycTier,
        },
        wallet: {
          availableBalance,
          escrowBalance,
          pendingWithdrawalBalance,
          currency: wallet.currency || 'NGN',
        },
        escrow: {
          protectedFunds: escrowBalance,
          currency: wallet.currency || 'NGN',
        },
        recentTransactions,
        activeEscrows,
      },
    });
  } catch (err: any) {
    console.error('Dashboard endpoint error:', err);
    res.status(500).json({ success: false, error: err.message || 'Error fetching dashboard data' });
  }
}
