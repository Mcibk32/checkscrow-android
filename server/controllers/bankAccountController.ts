import { Response } from 'express';
import { runQuery, getRow, getAllRows, withTransaction } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { paymentService } from '../services/paymentService';

export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber || accountNumber.length < 4) return '******';
  return '******' + accountNumber.slice(-4);
}

export async function getBankAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const rows = await getAllRows<any>(
      `SELECT id, user_id, account_number, account_name, bank_code, bank_name, is_verified, is_default, created_at, updated_at
       FROM bank_accounts WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );

    const bankAccounts = rows.map(acc => ({
      id: acc.id,
      accountNumber: acc.account_number,
      maskedAccountNumber: maskAccountNumber(acc.account_number),
      accountName: acc.account_name,
      bankCode: acc.bank_code,
      bankName: acc.bank_name,
      isVerified: Boolean(acc.is_verified),
      isDefault: Boolean(acc.is_default),
      createdAt: acc.created_at,
      updatedAt: acc.updated_at,
    }));

    res.json({
      success: true,
      data: bankAccounts,
    });
  } catch (err: any) {
    console.error('getBankAccounts error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve bank accounts.' });
  }
}

export async function createBankAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const { accountNumber, bankCode, bankName, accountName, isDefault } = req.body;

    const cleanedAccountNum = String(accountNumber || '').trim();
    const cleanedBankCode = String(bankCode || '').trim();
    const cleanedBankName = String(bankName || '').trim();
    let cleanedAccountName = String(accountName || '').trim();

    if (!cleanedAccountNum || cleanedAccountNum.length !== 10 || !/^\d+$/.test(cleanedAccountNum)) {
      res.status(400).json({ success: false, error: 'Nigerian bank account number must be exactly 10 digits.' });
      return;
    }

    if (!cleanedBankCode || !cleanedBankName) {
      res.status(400).json({ success: false, error: 'Bank code and bank name are required.' });
      return;
    }

    const userId = req.user.id;

    // Check if account already exists for this user
    const existing = await getRow<any>(
      `SELECT id FROM bank_accounts WHERE user_id = $1 AND account_number = $2 AND bank_code = $3`,
      [userId, cleanedAccountNum, cleanedBankCode]
    );

    if (existing) {
      res.status(400).json({ success: false, error: 'This bank account is already registered.' });
      return;
    }

    // Perform real bank account name resolution via Paystack
    let isVerified = false;
    const resolveRes = await paymentService.resolveBankAccount(cleanedAccountNum, cleanedBankCode);

    if (resolveRes.verified && resolveRes.accountName) {
      isVerified = true;
      cleanedAccountName = resolveRes.accountName;
    } else {
      isVerified = false;
      if (!cleanedAccountName) {
        cleanedAccountName = 'UNVERIFIED ACCOUNT HOLDER';
      }
    }

    const now = new Date().toISOString();
    const accountId = 'bnk_' + Date.now();

    // Check existing bank count
    const existingCountRes = await getRow<any>(
      `SELECT COUNT(*)::int as count FROM bank_accounts WHERE user_id = $1`,
      [userId]
    );
    const count = existingCountRes ? existingCountRes.count : 0;
    const makeDefault = count === 0 || Boolean(isDefault);

    await withTransaction(async (txQuery) => {
      if (makeDefault) {
        await txQuery(`UPDATE bank_accounts SET is_default = false WHERE user_id = $1`, [userId]);
      }

      await txQuery(
        `INSERT INTO bank_accounts (id, user_id, account_number, account_name, bank_code, bank_name, is_verified, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
        [accountId, userId, cleanedAccountNum, cleanedAccountName, cleanedBankCode, cleanedBankName, isVerified, makeDefault, now]
      );
    });

    res.status(201).json({
      success: true,
      data: {
        id: accountId,
        accountNumber: cleanedAccountNum,
        maskedAccountNumber: maskAccountNumber(cleanedAccountNum),
        accountName: cleanedAccountName,
        bankCode: cleanedBankCode,
        bankName: cleanedBankName,
        isVerified,
        isDefault: makeDefault,
        createdAt: now,
      },
      message: isVerified
        ? 'Bank account verified and added successfully.'
        : 'Bank account saved (unverified).',
    });
  } catch (err: any) {
    console.error('createBankAccount error:', err);
    res.status(500).json({ success: false, error: 'Failed to add bank account.' });
  }
}

export async function updateBankAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const accountId = req.params.id;
    const { isDefault } = req.body;
    const userId = req.user.id;

    // Verify ownership
    const account = await getRow<any>(
      `SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, userId]
    );

    if (!account) {
      res.status(404).json({ success: false, error: 'Bank account not found or access denied.' });
      return;
    }

    const now = new Date().toISOString();

    if (isDefault) {
      await withTransaction(async (txQuery) => {
        await txQuery(`UPDATE bank_accounts SET is_default = false WHERE user_id = $1`, [userId]);
        await txQuery(`UPDATE bank_accounts SET is_default = true, updated_at = $1 WHERE id = $2 AND user_id = $3`, [now, accountId, userId]);
      });
    }

    res.json({
      success: true,
      message: 'Bank account updated successfully.',
    });
  } catch (err: any) {
    console.error('updateBankAccount error:', err);
    res.status(500).json({ success: false, error: 'Failed to update bank account.' });
  }
}

export async function deleteBankAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const accountId = req.params.id;
    const userId = req.user.id;

    // Verify ownership
    const account = await getRow<any>(
      `SELECT id, is_default FROM bank_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, userId]
    );

    if (!account) {
      res.status(404).json({ success: false, error: 'Bank account not found or access denied.' });
      return;
    }

    await withTransaction(async (txQuery) => {
      await txQuery(`DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);

      // If deleted account was default, set next available account as default
      if (account.is_default) {
        const nextAccount = await txQuery(
          `SELECT id FROM bank_accounts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [userId]
        );
        if (nextAccount.rows.length > 0) {
          await txQuery(`UPDATE bank_accounts SET is_default = true WHERE id = $1`, [nextAccount.rows[0].id]);
        }
      }
    });

    res.json({
      success: true,
      message: 'Bank account removed successfully.',
    });
  } catch (err: any) {
    console.error('deleteBankAccount error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete bank account.' });
  }
}

export async function resolveAccountName(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const accountNumber = String(req.body.accountNumber || req.query.accountNumber || '').trim();
    const bankCode = String(req.body.bankCode || req.query.bankCode || '').trim();

    if (!accountNumber || accountNumber.length !== 10 || !/^\d+$/.test(accountNumber)) {
      res.status(400).json({ success: false, error: 'Account number must be 10 digits.' });
      return;
    }

    if (!bankCode) {
      res.status(400).json({ success: false, error: 'Bank code is required.' });
      return;
    }

    const resolveRes = await paymentService.resolveBankAccount(accountNumber, bankCode);

    if (resolveRes.verified) {
      res.json({
        success: true,
        data: {
          accountNumber: resolveRes.accountNumber,
          accountName: resolveRes.accountName,
          verified: true,
        },
      });
    } else {
      res.status(422).json({
        success: false,
        error: resolveRes.errorMessage || 'Bank account verification failed.',
        data: {
          verified: false,
        },
      });
    }
  } catch (err: any) {
    console.error('resolveAccountName error:', err);
    res.status(500).json({ success: false, error: 'Failed to verify bank account details.' });
  }
}
