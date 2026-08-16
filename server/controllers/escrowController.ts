import { Response } from 'express';
import { runQuery, getRow, getAllRows, withTransaction } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

/**
 * GET /api/escrow
 * Retrieves escrows where the authenticated user is buyer, seller, or admin.
 */
export async function getEscrows(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const statusFilter = req.query.status ? String(req.query.status).trim() : null;
    const userEmail = req.user.email.toLowerCase().trim();
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';

    let query = `
      SELECT id, title, description, amount, currency, status, buyer_id, seller_id, buyer_email, seller_email, 
             user_role, counterparty_name, inspection_period_days, terms, payment_status, created_at, updated_at, deadline,
             delivered_at, completed_at, cancelled_at, refunded_at
      FROM escrows 
    `;
    const params: any[] = [];

    if (!isAdmin) {
      query += ` WHERE (buyer_id = $1 OR seller_id = $1 OR LOWER(seller_email) = $2 OR LOWER(buyer_email) = $2)`;
      params.push(userId, userEmail);
    }

    if (statusFilter) {
      query += params.length > 0 ? ` AND status = $${params.length + 1}` : ` WHERE status = $1`;
      params.push(statusFilter);
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const rawEscrows = await getAllRows<any>(query, params);

    const escrows = rawEscrows.map((esc) => {
      const isBuyer = esc.buyer_id === userId || (esc.buyer_email && esc.buyer_email.toLowerCase() === userEmail);
      return {
        id: esc.id,
        title: esc.title,
        description: esc.description,
        amount: parseFloat(esc.amount || 0),
        currency: esc.currency || 'NGN',
        status: esc.status,
        paymentStatus: esc.payment_status || 'unpaid',
        userRole: isBuyer ? 'buyer' : 'seller',
        buyerEmail: esc.buyer_email,
        sellerEmail: esc.seller_email,
        buyerId: esc.buyer_id,
        sellerId: esc.seller_id,
        counterpartyName: esc.counterparty_name || (isBuyer ? esc.seller_email?.split('@')[0] : esc.buyer_email?.split('@')[0]) || 'Counterparty',
        counterpartyEmail: isBuyer ? esc.seller_email : esc.buyer_email,
        inspectionPeriodDays: Number(esc.inspection_period_days) || 3,
        terms: esc.terms || '',
        createdAt: esc.created_at,
        updatedAt: esc.updated_at,
        deadline: esc.deadline,
        deliveredAt: esc.delivered_at,
        completedAt: esc.completed_at,
        cancelledAt: esc.cancelled_at,
        refundedAt: esc.refunded_at,
      };
    });

    res.json({ success: true, data: escrows });
  } catch (err: any) {
    console.error('getEscrows error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve escrow deals.' });
  }
}

/**
 * GET /api/escrow/:id
 * Retrieves a single escrow deal by ID with strict IDOR participant authorization check.
 */
export async function getEscrowById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email.toLowerCase().trim();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';

    let sql = `SELECT * FROM escrows WHERE id = $1`;
    let params: any[] = [escrowId];

    if (!isAdmin) {
      sql += ` AND (buyer_id = $2 OR seller_id = $2 OR LOWER(seller_email) = $3 OR LOWER(buyer_email) = $3)`;
      params.push(userId, userEmail);
    }

    const esc = await getRow<any>(sql, params);

    if (!esc) {
      res.status(404).json({ success: false, error: 'Escrow deal not found or access denied.' });
      return;
    }

    const isBuyer = esc.buyer_id === userId || (esc.buyer_email && esc.buyer_email.toLowerCase() === userEmail);

    res.json({
      success: true,
      data: {
        id: esc.id,
        title: esc.title,
        description: esc.description,
        amount: parseFloat(esc.amount || 0),
        currency: esc.currency || 'NGN',
        status: esc.status,
        paymentStatus: esc.payment_status || 'unpaid',
        userRole: isBuyer ? 'buyer' : 'seller',
        buyerEmail: esc.buyer_email,
        sellerEmail: esc.seller_email,
        buyerId: esc.buyer_id,
        sellerId: esc.seller_id,
        counterpartyName: esc.counterparty_name || (isBuyer ? esc.seller_email?.split('@')[0] : esc.buyer_email?.split('@')[0]) || 'Counterparty',
        counterpartyEmail: isBuyer ? esc.seller_email : esc.buyer_email,
        inspectionPeriodDays: Number(esc.inspection_period_days) || 3,
        terms: esc.terms || '',
        createdAt: esc.created_at,
        updatedAt: esc.updated_at,
        deadline: esc.deadline,
        deliveredAt: esc.delivered_at,
        completedAt: esc.completed_at,
        cancelledAt: esc.cancelled_at,
        refundedAt: esc.refunded_at,
      },
    });
  } catch (err: any) {
    console.error('getEscrowById error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve escrow deal details.' });
  }
}

/**
 * POST /api/escrow
 * Creates a new escrow deal in an unpaid/unfunded initial state ('awaiting_payment').
 * Buyer ID is strictly derived from the authenticated JWT token.
 * Does NOT deduct funds upon creation.
 */
export async function createEscrow(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const { title, description, amount, role, counterpartyEmail, inspectionPeriodDays, terms } = req.body;

    const parsedAmount = Number(amount);
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ success: false, error: 'A valid transaction title is required.' });
      return;
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ success: false, error: 'Escrow deal amount must be greater than ₦0.00' });
      return;
    }

    const days = Math.max(1, Math.min(30, Number(inspectionPeriodDays) || 3));

    const cleanCounterpartyEmail = (counterpartyEmail || '').toLowerCase().trim();
    if (cleanCounterpartyEmail && cleanCounterpartyEmail === req.user.email.toLowerCase().trim()) {
      res.status(400).json({ success: false, error: 'Counterparty email cannot be your own email address.' });
      return;
    }

    // Look up seller_id if counterparty is already registered
    let sellerId: string | null = null;
    if (cleanCounterpartyEmail) {
      const sellerRow = await getRow<any>(`SELECT id FROM users WHERE LOWER(email) = $1`, [cleanCounterpartyEmail]);
      if (sellerRow) {
        sellerId = sellerRow.id;
      }
    }

    const id = 'esc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + (days + 4) * 86400000).toISOString();
    const counterpartyName = cleanCounterpartyEmail ? cleanCounterpartyEmail.split('@')[0] : 'Counterparty';

    const buyerId = req.user.id;
    const buyerEmail = req.user.email.toLowerCase().trim();

    await runQuery(
      `INSERT INTO escrows (
        id, title, description, amount, currency, status, buyer_id, seller_id, seller_email, buyer_email, 
        user_role, counterparty_name, inspection_period_days, terms, payment_status, created_at, updated_at, deadline
       )
       VALUES ($1, $2, $3, $4, 'NGN', 'awaiting_payment', $5, $6, $7, $8, $9, $10, $11, $12, 'unpaid', $13, $14, $15)`,
      [
        id,
        title.trim(),
        description ? description.trim() : '',
        parsedAmount,
        buyerId,
        sellerId,
        cleanCounterpartyEmail,
        buyerEmail,
        role || 'buyer',
        counterpartyName,
        days,
        terms ? terms.trim() : '',
        now,
        now,
        deadline,
      ]
    );

    await runQuery(
      `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
       VALUES ($1, $2, 'Escrow Deal Created', $3, 'escrow', $4)`,
      ['act_' + Date.now(), buyerId, `Created escrow deal "${title.trim()}" for ₦${parsedAmount.toLocaleString()}`, now]
    );

    // Create notifications for buyer and seller
    await createNotification({
      userId: buyerId,
      type: 'escrow',
      title: 'Escrow Deal Created',
      message: `You created escrow deal "${title.trim()}" for ₦${parsedAmount.toLocaleString()}.`,
      referenceId: id,
      referenceType: 'escrow',
    });

    let targetSellerId = sellerId;
    if (!targetSellerId && cleanCounterpartyEmail) {
      const sellerUser = await getRow<any>(`SELECT id FROM users WHERE LOWER(email) = $1`, [cleanCounterpartyEmail]);
      if (sellerUser) {
        targetSellerId = sellerUser.id;
      }
    }

    if (targetSellerId && targetSellerId !== buyerId) {
      await createNotification({
        userId: targetSellerId,
        type: 'escrow',
        title: 'New Escrow Deal Invited',
        message: `You were added as seller to escrow deal "${title.trim()}" for ₦${parsedAmount.toLocaleString()}.`,
        referenceId: id,
        referenceType: 'escrow',
      });
    }

    const newEscrow = {
      id,
      title: title.trim(),
      description: description ? description.trim() : '',
      amount: parsedAmount,
      currency: 'NGN',
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
      userRole: role || 'buyer',
      buyerId,
      sellerId,
      counterpartyName,
      counterpartyEmail: cleanCounterpartyEmail,
      inspectionPeriodDays: days,
      terms: terms ? terms.trim() : '',
      createdAt: now,
      updatedAt: now,
      deadline,
    };

    res.status(201).json({ success: true, data: newEscrow, message: 'Escrow deal created successfully.' });
  } catch (err: any) {
    console.error('createEscrow error:', err);
    res.status(500).json({ success: false, error: 'Failed to create escrow deal.' });
  }
}

/**
 * POST /api/escrow/:id/fund
 * Locks funds from buyer's available_balance into escrow_balance.
 * Executes atomically in a PostgreSQL database transaction.
 * Idempotency & row-level locking prevent double funding.
 */
export async function fundEscrow(req: AuthenticatedRequest, res: Response): Promise<void> {
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email.toLowerCase().trim();
    const now = new Date().toISOString();

    await withTransaction(async (txQuery) => {
      // 1. Lock escrow row and verify buyer ownership & status
      const escrowRes = await txQuery(
        `SELECT id, title, amount, status, buyer_id, buyer_email FROM escrows WHERE id = $1 FOR UPDATE`,
        [escrowId]
      );

      const escrow = escrowRes.rows[0];
      if (!escrow) {
        errorCode = 'NOT_FOUND';
        errorMessage = 'Escrow deal not found.';
        throw new Error('NOT_FOUND');
      }

      const isBuyer = escrow.buyer_id === userId || (escrow.buyer_email && escrow.buyer_email.toLowerCase() === userEmail);
      if (!isBuyer) {
        errorCode = 'FORBIDDEN';
        errorMessage = 'Only the buyer of this escrow deal can fund it.';
        throw new Error('FORBIDDEN');
      }

      if (escrow.status !== 'awaiting_payment') {
        errorCode = 'INVALID_STATE';
        errorMessage = `Escrow deal cannot be funded because it is currently in '${escrow.status}' status.`;
        throw new Error('INVALID_STATE');
      }

      const escrowAmount = parseFloat(escrow.amount || 0);

      // 2. Lock buyer wallet row
      const walletRes = await txQuery(
        `SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      const availableBalance = walletRes.rows[0] ? parseFloat(walletRes.rows[0].available_balance || 0) : 0;
      if (availableBalance < escrowAmount) {
        errorCode = 'INSUFFICIENT_FUNDS';
        errorMessage = `Insufficient available wallet balance (Available: ₦${availableBalance.toLocaleString()}, Required: ₦${escrowAmount.toLocaleString()}).`;
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // 3. Deduct available_balance, increase escrow_balance
      const walletUpdate = await txQuery(
        `UPDATE wallets 
         SET available_balance = available_balance - $1, 
             escrow_balance = escrow_balance + $1, 
             updated_at = $2 
         WHERE user_id = $3 AND available_balance >= $1`,
        [escrowAmount, now, userId]
      );

      if (walletUpdate.rowCount === 0) {
        errorCode = 'INSUFFICIENT_FUNDS';
        errorMessage = 'Insufficient available wallet balance.';
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // 4. Update escrow status to 'funded' / 'in_escrow'
      const escrowUpdate = await txQuery(
        `UPDATE escrows 
         SET status = 'funded', payment_status = 'paid', updated_at = $1 
         WHERE id = $2 AND status = 'awaiting_payment'`,
        [now, escrowId]
      );

      if (escrowUpdate.rowCount === 0) {
        errorCode = 'STATE_CHANGED';
        errorMessage = 'Escrow status was modified concurrently by another request.';
        throw new Error('STATE_CHANGED');
      }

      // 5. Create wallet_transactions record
      const reference = 'LCK-' + Math.floor(100000 + Math.random() * 900000);
      await txQuery(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
         VALUES ($1, $2, 'escrow_lock', $3, 'completed', $4, $5, $6)`,
        [
          'tx_' + Date.now(),
          userId,
          escrowAmount,
          reference,
          `Funded Escrow Protection: ${escrow.title}`,
          now,
        ]
      );

      // 6. Create activity_logs record
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Escrow Funded', $3, 'escrow', $4)`,
        ['act_' + Date.now(), userId, `Locked ₦${escrowAmount.toLocaleString()} for escrow "${escrow.title}"`, now]
      );

      // Create notifications for buyer and seller
      await createNotification({
        userId,
        type: 'escrow',
        title: 'Escrow Deal Funded',
        message: `Locked ₦${escrowAmount.toLocaleString()} for escrow deal "${escrow.title}".`,
        referenceId: escrowId,
        referenceType: 'escrow',
        txQuery,
      });

      let sellerUserId = escrow.seller_id;
      if (!sellerUserId && escrow.seller_email) {
        const sRow = (await txQuery(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [escrow.seller_email])).rows[0];
        if (sRow) sellerUserId = sRow.id;
      }

      if (sellerUserId && sellerUserId !== userId) {
        await createNotification({
          userId: sellerUserId,
          type: 'escrow',
          title: 'Escrow Deal Funded',
          message: `The buyer funded ₦${escrowAmount.toLocaleString()} for escrow deal "${escrow.title}". You may proceed with delivery.`,
          referenceId: escrowId,
          referenceType: 'escrow',
          txQuery,
        });
      }
    });

    res.json({
      success: true,
      message: 'Escrow deal funded successfully and money locked under escrow protection.',
    });
  } catch (err: any) {
    if (errorCode === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: errorMessage });
    } else if (errorCode === 'FORBIDDEN') {
      res.status(403).json({ success: false, error: errorMessage });
    } else if (errorCode === 'INSUFFICIENT_FUNDS' || errorCode === 'INVALID_STATE' || errorCode === 'STATE_CHANGED') {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      console.error('fundEscrow error:', err);
      res.status(500).json({ success: false, error: 'Escrow funding failed. Transaction was safely rolled back.' });
    }
  }
}

/**
 * POST /api/escrow/:id/deliver
 * Marks an escrow deal as delivered by the authorized seller.
 */
export async function deliverEscrow(req: AuthenticatedRequest, res: Response): Promise<void> {
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email.toLowerCase().trim();
    const now = new Date().toISOString();

    await withTransaction(async (txQuery) => {
      const escrowRes = await txQuery(
        `SELECT id, title, status, buyer_id, seller_id, seller_email, buyer_email FROM escrows WHERE id = $1 FOR UPDATE`,
        [escrowId]
      );

      const escrow = escrowRes.rows[0];
      if (!escrow) {
        errorCode = 'NOT_FOUND';
        errorMessage = 'Escrow deal not found.';
        throw new Error('NOT_FOUND');
      }

      // Authorization Check: Must be seller (or explicitly assigned counterparty) and NOT strictly the buyer
      const isSeller =
        (escrow.seller_id && escrow.seller_id === userId) ||
        (escrow.seller_email && escrow.seller_email.toLowerCase() === userEmail) ||
        (escrow.buyer_id !== userId && !escrow.seller_id);

      if (!isSeller || escrow.buyer_id === userId) {
        errorCode = 'FORBIDDEN';
        errorMessage = 'Only the assigned seller/counterparty can mark this escrow as delivered.';
        throw new Error('FORBIDDEN');
      }

      if (escrow.status !== 'funded' && escrow.status !== 'in_escrow' && escrow.status !== 'in_progress') {
        errorCode = 'INVALID_STATE';
        errorMessage = `Escrow deal cannot be marked as delivered because it is currently in '${escrow.status}' status.`;
        throw new Error('INVALID_STATE');
      }

      // Update escrow status to 'delivered' and populate seller_id if needed
      await txQuery(
        `UPDATE escrows SET status = 'delivered', seller_id = COALESCE($1, seller_id), delivered_at = $2, updated_at = $2 WHERE id = $3 AND status IN ('funded', 'in_escrow', 'in_progress')`,
        [userId, now, escrowId]
      );

      // Record activity log for seller
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Escrow Marked Delivered', $3, 'escrow', $4)`,
        ['act_' + Date.now(), userId, `Marked order/item for "${escrow.title}" as delivered`, now]
      );

      // Record activity log for buyer
      if (escrow.buyer_id) {
        await txQuery(
          `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
           VALUES ($1, $2, 'Item Delivered by Seller', $3, 'escrow', $4)`,
          ['act_' + (Date.now() + 1), escrow.buyer_id, `Seller marked "${escrow.title}" as delivered. Inspection period started.`, now]
        );
      }

      // Create notifications for seller and buyer
      await createNotification({
        userId,
        type: 'escrow',
        title: 'Delivery Marked',
        message: `You marked escrow deal "${escrow.title}" as delivered.`,
        referenceId: escrowId,
        referenceType: 'escrow',
        txQuery,
      });

      if (escrow.buyer_id) {
        await createNotification({
          userId: escrow.buyer_id,
          type: 'escrow',
          title: 'Delivery Marked - Action Required',
          message: `The seller marked deal "${escrow.title}" as delivered. Please inspect and confirm completion.`,
          referenceId: escrowId,
          referenceType: 'escrow',
          txQuery,
        });
      }
    });

    res.json({ success: true, message: 'Escrow deal marked as delivered successfully.' });
  } catch (err: any) {
    if (errorCode === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: errorMessage });
    } else if (errorCode === 'FORBIDDEN') {
      res.status(403).json({ success: false, error: errorMessage });
    } else if (errorCode === 'INVALID_STATE') {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      console.error('deliverEscrow error:', err);
      res.status(500).json({ success: false, error: 'Failed to mark escrow as delivered.' });
    }
  }
}

/**
 * POST /api/escrow/:id/confirm
 * Buyer confirms delivery and releases escrow funds directly to the seller's wallet.
 * Atomically deducts buyer's escrow_balance and credits seller's available_balance in PostgreSQL.
 * Prevents double release via state lock.
 */
export async function confirmEscrow(req: AuthenticatedRequest, res: Response): Promise<void> {
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const buyerId = req.user.id;
    const buyerEmail = req.user.email.toLowerCase().trim();
    const now = new Date().toISOString();

    await withTransaction(async (txQuery) => {
      // 1. Lock escrow row
      const escrowRes = await txQuery(
        `SELECT id, title, amount, status, buyer_id, seller_id, seller_email, buyer_email FROM escrows WHERE id = $1 FOR UPDATE`,
        [escrowId]
      );

      const escrow = escrowRes.rows[0];
      if (!escrow) {
        errorCode = 'NOT_FOUND';
        errorMessage = 'Escrow deal not found.';
        throw new Error('NOT_FOUND');
      }

      const isBuyer = escrow.buyer_id === buyerId || (escrow.buyer_email && escrow.buyer_email.toLowerCase() === buyerEmail);
      if (!isBuyer) {
        errorCode = 'FORBIDDEN';
        errorMessage = 'Only the buyer can confirm and release escrow funds.';
        throw new Error('FORBIDDEN');
      }

      if (escrow.status === 'completed') {
        errorCode = 'ALREADY_COMPLETED';
        errorMessage = 'Escrow deal has already been completed or released.';
        throw new Error('ALREADY_COMPLETED');
      }

      if (escrow.status !== 'delivered' && escrow.status !== 'funded' && escrow.status !== 'in_escrow' && escrow.status !== 'in_progress') {
        errorCode = 'INVALID_STATE';
        errorMessage = `Escrow deal cannot be released because it is currently in '${escrow.status}' status.`;
        throw new Error('INVALID_STATE');
      }

      const escrowAmount = parseFloat(escrow.amount || 0);

      // 2. Lock buyer's wallet row and verify escrow_balance
      const buyerWalletRes = await txQuery(
        `SELECT escrow_balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [buyerId]
      );

      const buyerEscrowBal = buyerWalletRes.rows[0] ? parseFloat(buyerWalletRes.rows[0].escrow_balance || 0) : 0;
      if (buyerEscrowBal < escrowAmount) {
        errorCode = 'INSUFFICIENT_ESCROW_BAL';
        errorMessage = 'Insufficient escrow balance to execute release.';
        throw new Error('INSUFFICIENT_ESCROW_BAL');
      }

      // 3. Deduct buyer's escrow_balance
      const buyerWalletUpdate = await txQuery(
        `UPDATE wallets 
         SET escrow_balance = GREATEST(0, escrow_balance - $1), updated_at = $2 
         WHERE user_id = $3 AND escrow_balance >= $1`,
        [escrowAmount, now, buyerId]
      );

      if (buyerWalletUpdate.rowCount === 0) {
        errorCode = 'INSUFFICIENT_ESCROW_BAL';
        errorMessage = 'Insufficient escrow balance.';
        throw new Error('INSUFFICIENT_ESCROW_BAL');
      }

      // 4. Determine seller user ID & credit seller wallet
      let targetSellerId = escrow.seller_id;
      if (!targetSellerId && escrow.seller_email) {
        const sellerUser = await txQuery(`SELECT id FROM users WHERE LOWER(email) = $1`, [escrow.seller_email.toLowerCase().trim()]);
        if (sellerUser.rows[0]) {
          targetSellerId = sellerUser.rows[0].id;
        }
      }

      if (targetSellerId) {
        // Ensure seller wallet exists and lock row
        await txQuery(
          `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
           VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)
           ON CONFLICT (user_id) DO NOTHING`,
          ['wal_' + Date.now(), targetSellerId, now]
        );

        await txQuery(
          `UPDATE wallets SET available_balance = available_balance + $1, updated_at = $2 WHERE user_id = $3`,
          [escrowAmount, now, targetSellerId]
        );

        // Record payout transaction for seller
        await txQuery(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
           VALUES ($1, $2, 'escrow_payout', $3, 'completed', $4, $5, $6)`,
          [
            'tx_' + (Date.now() + 1),
            targetSellerId,
            escrowAmount,
            'PAY-' + Math.floor(100000 + Math.random() * 900000),
            `Escrow Payout Received for: ${escrow.title}`,
            now,
          ]
        );

        // Record activity log for seller
        await txQuery(
          `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
           VALUES ($1, $2, 'Escrow Payment Received', $3, 'escrow', $4)`,
          ['act_' + (Date.now() + 1), targetSellerId, `Received ₦${escrowAmount.toLocaleString()} for completed deal "${escrow.title}"`, now]
        );
      }

      // 5. Update escrow status to 'completed' / 'released'
      const escrowUpdate = await txQuery(
        `UPDATE escrows 
         SET status = 'completed', payment_status = 'released', seller_id = COALESCE($1, seller_id), completed_at = $2, updated_at = $2 
         WHERE id = $3 AND status IN ('funded', 'in_escrow', 'in_progress', 'delivered')`,
        [targetSellerId, now, escrowId]
      );

      if (escrowUpdate.rowCount === 0) {
        errorCode = 'DOUBLE_RELEASE';
        errorMessage = 'Escrow deal has already been released or completed.';
        throw new Error('DOUBLE_RELEASE');
      }

      // 6. Record release transaction for buyer
      await txQuery(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
         VALUES ($1, $2, 'escrow_release', $3, 'completed', $4, $5, $6)`,
        [
          'tx_' + Date.now(),
          buyerId,
          escrowAmount,
          'REL-' + Math.floor(100000 + Math.random() * 900000),
          `Released Escrow Funds for: ${escrow.title}`,
          now,
        ]
      );

      // 7. Record activity log for buyer
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Escrow Released', $3, 'escrow', $4)`,
        ['act_' + Date.now(), buyerId, `Confirmed order and released ₦${escrowAmount.toLocaleString()} to seller`, now]
      );

      // Create notifications for buyer and seller
      await createNotification({
        userId: buyerId,
        type: 'escrow',
        title: 'Escrow Deal Completed',
        message: `You confirmed deal "${escrow.title}". Funds of ₦${escrowAmount.toLocaleString()} released to seller.`,
        referenceId: escrowId,
        referenceType: 'escrow',
        txQuery,
      });

      if (targetSellerId && targetSellerId !== buyerId) {
        await createNotification({
          userId: targetSellerId,
          type: 'escrow',
          title: 'Funds Released to Wallet',
          message: `₦${escrowAmount.toLocaleString()} has been credited to your wallet for completed deal "${escrow.title}".`,
          referenceId: escrowId,
          referenceType: 'escrow',
          txQuery,
        });
      }
    });

    res.json({ success: true, message: 'Escrow deal confirmed and funds successfully released to seller.' });
  } catch (err: any) {
    if (errorCode === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: errorMessage });
    } else if (errorCode === 'FORBIDDEN') {
      res.status(403).json({ success: false, error: errorMessage });
    } else if (errorCode === 'ALREADY_COMPLETED' || errorCode === 'INVALID_STATE' || errorCode === 'INSUFFICIENT_ESCROW_BAL' || errorCode === 'DOUBLE_RELEASE') {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      console.error('confirmEscrow error:', err);
      res.status(500).json({ success: false, error: 'Release failed. Transaction was safely rolled back.' });
    }
  }
}

/**
 * POST /api/escrow/:id/cancel
 * Cancels an escrow deal.
 * Unpaid escrows transition to 'cancelled'.
 * Funded escrows refund locked funds back to buyer's available_balance atomically.
 */
export async function cancelEscrow(req: AuthenticatedRequest, res: Response): Promise<void> {
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email.toLowerCase().trim();
    const now = new Date().toISOString();

    await withTransaction(async (txQuery) => {
      const escrowRes = await txQuery(
        `SELECT id, title, amount, status, buyer_id, seller_id, buyer_email, seller_email FROM escrows WHERE id = $1 FOR UPDATE`,
        [escrowId]
      );

      const escrow = escrowRes.rows[0];
      if (!escrow) {
        errorCode = 'NOT_FOUND';
        errorMessage = 'Escrow deal not found.';
        throw new Error('NOT_FOUND');
      }

      const isParticipant =
        escrow.buyer_id === userId ||
        (escrow.seller_id && escrow.seller_id === userId) ||
        (escrow.seller_email && escrow.seller_email.toLowerCase() === userEmail) ||
        (escrow.buyer_email && escrow.buyer_email.toLowerCase() === userEmail);

      if (!isParticipant) {
        errorCode = 'NOT_FOUND';
        errorMessage = 'Escrow deal not found or access denied.';
        throw new Error('NOT_FOUND');
      }

      if (escrow.status === 'completed' || escrow.status === 'cancelled' || escrow.status === 'refunded') {
        errorCode = 'INVALID_STATE';
        errorMessage = `Cannot cancel escrow deal in '${escrow.status}' status.`;
        throw new Error('INVALID_STATE');
      }

      const escrowAmount = parseFloat(escrow.amount || 0);

      // Scenario A: Unpaid / Awaiting Payment
      if (escrow.status === 'awaiting_payment') {
        await txQuery(
          `UPDATE escrows SET status = 'cancelled', cancelled_at = $1, updated_at = $1 WHERE id = $2 AND status = 'awaiting_payment'`,
          [now, escrowId]
        );

        await txQuery(
          `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
           VALUES ($1, $2, 'Escrow Cancelled', $3, 'escrow', $4)`,
          ['act_' + Date.now(), userId, `Cancelled unpaid escrow deal "${escrow.title}"`, now]
        );

        await createNotification({
          userId,
          type: 'escrow',
          title: 'Escrow Deal Cancelled',
          message: `Unpaid escrow deal "${escrow.title}" was cancelled.`,
          referenceId: escrowId,
          referenceType: 'escrow',
          txQuery,
        });

        return;
      }

      // Scenario B: Funded / In Escrow / In Progress (Refund required)
      if (escrow.status === 'funded' || escrow.status === 'in_escrow' || escrow.status === 'in_progress') {
        const buyerId = escrow.buyer_id;

        // Lock buyer wallet
        const walletRes = await txQuery(
          `SELECT escrow_balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [buyerId]
        );

        const escrowBal = walletRes.rows[0] ? parseFloat(walletRes.rows[0].escrow_balance || 0) : 0;
        if (escrowBal < escrowAmount) {
          errorCode = 'INSUFFICIENT_ESCROW_BAL';
          errorMessage = 'Insufficient escrow balance to process refund.';
          throw new Error('INSUFFICIENT_ESCROW_BAL');
        }

        // Deduct escrow_balance, credit available_balance
        await txQuery(
          `UPDATE wallets 
           SET escrow_balance = GREATEST(0, escrow_balance - $1), 
               available_balance = available_balance + $1, 
               updated_at = $2 
           WHERE user_id = $3 AND escrow_balance >= $1`,
          [escrowAmount, now, buyerId]
        );

        // Update escrow status
        await txQuery(
          `UPDATE escrows SET status = 'refunded', payment_status = 'refunded', refunded_at = $1, updated_at = $1 WHERE id = $2 AND status IN ('funded', 'in_escrow', 'in_progress')`,
          [now, escrowId]
        );

        // Record wallet refund transaction
        await txQuery(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
           VALUES ($1, $2, 'escrow_refund', $3, 'completed', $4, $5, $6)`,
          [
            'tx_' + Date.now(),
            buyerId,
            escrowAmount,
            'RFD-' + Math.floor(100000 + Math.random() * 900000),
            `Escrow Refunded: ${escrow.title}`,
            now,
          ]
        );

        // Record activity log
        await txQuery(
          `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
           VALUES ($1, $2, 'Escrow Refunded', $3, 'escrow', $4)`,
          ['act_' + Date.now(), buyerId, `Refunded ₦${escrowAmount.toLocaleString()} from cancelled deal "${escrow.title}"`, now]
        );

        // Create notification for buyer
        await createNotification({
          userId: buyerId,
          type: 'escrow',
          title: 'Escrow Refunded',
          message: `Escrow deal "${escrow.title}" was cancelled and ₦${escrowAmount.toLocaleString()} refunded to your wallet.`,
          referenceId: escrowId,
          referenceType: 'escrow',
          txQuery,
        });

        return;
      }

      // If in 'delivered' or 'disputed', normal cancellation requires dispute resolution
      errorCode = 'INVALID_STATE';
      errorMessage = `Escrow in '${escrow.status}' status cannot be directly cancelled without dispute resolution.`;
      throw new Error('INVALID_STATE');
    });

    res.json({ success: true, message: 'Escrow deal cancelled successfully.' });
  } catch (err: any) {
    if (errorCode === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: errorMessage });
    } else if (errorCode === 'INVALID_STATE' || errorCode === 'INSUFFICIENT_ESCROW_BAL') {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      console.error('cancelEscrow error:', err);
      res.status(500).json({ success: false, error: 'Escrow cancellation failed.' });
    }
  }
}

/**
 * POST /api/escrow/:id/dispute
 * Raises a dispute on an active or delivered escrow deal.
 * Prevents further automatic releases or modifications.
 */
export async function disputeEscrow(req: AuthenticatedRequest, res: Response): Promise<void> {
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email.toLowerCase().trim();
    const { reason, description } = req.body;
    const now = new Date().toISOString();

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'A valid reason for opening a dispute is required.' });
      return;
    }

    await withTransaction(async (txQuery) => {
      const escrowRes = await txQuery(
        `SELECT id, title, status, buyer_id, seller_id, seller_email, buyer_email FROM escrows WHERE id = $1 FOR UPDATE`,
        [escrowId]
      );

      const escrow = escrowRes.rows[0];
      if (!escrow) {
        errorCode = 'NOT_FOUND';
        errorMessage = 'Escrow deal not found.';
        throw new Error('NOT_FOUND');
      }

      const isParticipant =
        escrow.buyer_id === userId ||
        (escrow.seller_id && escrow.seller_id === userId) ||
        (escrow.seller_email && escrow.seller_email.toLowerCase() === userEmail) ||
        (escrow.buyer_email && escrow.buyer_email.toLowerCase() === userEmail);

      if (!isParticipant) {
        errorCode = 'NOT_FOUND';
        errorMessage = 'Escrow deal not found or access denied.';
        throw new Error('NOT_FOUND');
      }

      if (escrow.status !== 'funded' && escrow.status !== 'in_escrow' && escrow.status !== 'in_progress' && escrow.status !== 'delivered') {
        errorCode = 'INVALID_STATE';
        errorMessage = `Cannot dispute escrow deal in '${escrow.status}' state.`;
        throw new Error('INVALID_STATE');
      }

      // Check if an active dispute already exists
      const existingDispute = await txQuery(
        `SELECT id FROM escrow_disputes WHERE escrow_id = $1 AND status IN ('pending', 'open', 'under_review')`,
        [escrowId]
      );

      if (existingDispute.rows.length > 0) {
        errorCode = 'DUPLICATE_DISPUTE';
        errorMessage = 'An active dispute is already open for this escrow deal.';
        throw new Error('DUPLICATE_DISPUTE');
      }

      // Update escrow status to 'disputed'
      await txQuery(
        `UPDATE escrows SET status = 'disputed', updated_at = $1 WHERE id = $2 AND status IN ('funded', 'in_escrow', 'in_progress', 'delivered')`,
        [now, escrowId]
      );

      // Record dispute entry
      await txQuery(
        `INSERT INTO escrow_disputes (id, escrow_id, raised_by_id, reason, description, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [
          'dsp_' + Date.now(),
          escrowId,
          userId,
          reason.trim(),
          description ? String(description).trim() : '',
          now,
        ]
      );

      // Record activity log
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Escrow Disputed', $3, 'dispute', $4)`,
        ['act_' + Date.now(), userId, `Raised dispute on escrow deal "${escrow.title}": ${reason.trim()}`, now]
      );

      // Create dispute notifications
      await createNotification({
        userId,
        type: 'escrow',
        title: 'Dispute Submitted',
        message: `You submitted a dispute for deal "${escrow.title}". Escrow funds are frozen under arbitration.`,
        referenceId: escrowId,
        referenceType: 'escrow',
        txQuery,
      });

      const counterpartyId = escrow.buyer_id === userId ? escrow.seller_id : escrow.buyer_id;
      if (counterpartyId && counterpartyId !== userId) {
        await createNotification({
          userId: counterpartyId,
          type: 'escrow',
          title: 'Dispute Opened',
          message: `A dispute was opened on escrow deal "${escrow.title}". Admin resolution is pending.`,
          referenceId: escrowId,
          referenceType: 'escrow',
          txQuery,
        });
      }
    });

    res.json({ success: true, message: 'Dispute submitted successfully. Escrow funds are frozen under dispute arbitration.' });
  } catch (err: any) {
    if (errorCode === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: errorMessage });
    } else if (errorCode === 'FORBIDDEN') {
      res.status(403).json({ success: false, error: errorMessage });
    } else if (errorCode === 'INVALID_STATE' || errorCode === 'DUPLICATE_DISPUTE') {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      console.error('disputeEscrow error:', err);
      res.status(500).json({ success: false, error: 'Failed to submit dispute.' });
    }
  }
}

/**
 * GET /api/escrow/:id/dispute
 * Fetches dispute details for an escrow.
 */
export async function getDisputeDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email.toLowerCase().trim();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';

    // Participant verification
    const escrow = await getRow<any>(
      `SELECT id FROM escrows WHERE id = $1 ${isAdmin ? '' : 'AND (buyer_id = $2 OR seller_id = $2 OR LOWER(seller_email) = $3 OR LOWER(buyer_email) = $3)'}`,
      isAdmin ? [escrowId] : [escrowId, userId, userEmail]
    );

    if (!escrow) {
      res.status(404).json({ success: false, error: 'Escrow deal not found or access denied.' });
      return;
    }

    const dispute = await getRow<any>(
      `SELECT d.*, u.full_name as raised_by_name, u.email as raised_by_email 
       FROM escrow_disputes d
       JOIN users u ON d.raised_by_id = u.id
       WHERE d.escrow_id = $1
       ORDER BY d.created_at DESC LIMIT 1`,
      [escrowId]
    );

    if (!dispute) {
      res.status(404).json({ success: false, error: 'No dispute found for this escrow deal.' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: dispute.id,
        escrowId: dispute.escrow_id,
        raisedById: dispute.raised_by_id,
        raisedByName: dispute.raised_by_name,
        raisedByEmail: dispute.raised_by_email,
        reason: dispute.reason,
        description: dispute.description,
        status: dispute.status,
        resolution: dispute.resolution,
        resolutionDetails: dispute.resolution_details,
        buyerSplitAmount: dispute.buyer_split_amount ? parseFloat(dispute.buyer_split_amount) : null,
        sellerSplitAmount: dispute.seller_split_amount ? parseFloat(dispute.seller_split_amount) : null,
        createdAt: dispute.created_at,
        resolvedAt: dispute.resolved_at,
      },
    });
  } catch (err: any) {
    console.error('getDisputeDetails error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve dispute details.' });
  }
}

/**
 * POST /api/escrow/:id/dispute/resolve
 * Moderator / Admin endpoint to resolve a disputed escrow deal.
 * Supported resolutions:
 *  - 'refund_buyer' / 'resolve_buyer': Refunds 100% of escrow_balance back to buyer's available_balance
 *  - 'release_to_seller' / 'resolve_seller': Releases 100% of escrow_balance to seller's available_balance
 *  - 'split': Splits escrow_balance between buyer and seller (buyerAmount + sellerAmount must EQUAL total escrow amount)
 */
export async function resolveDispute(req: AuthenticatedRequest, res: Response): Promise<void> {
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';
    if (!isAdmin) {
      res.status(403).json({ success: false, error: 'Only administrators or moderators can resolve disputes.' });
      return;
    }

    const escrowId = req.params.id;
    const { resolution, buyerAmount, sellerAmount, resolutionNotes } = req.body;
    const now = new Date().toISOString();

    if (!resolution || !['refund_buyer', 'resolve_buyer', 'release_to_seller', 'resolve_seller', 'split'].includes(resolution)) {
      res.status(400).json({ success: false, error: 'Invalid resolution option. Must be refund_buyer, release_to_seller, or split.' });
      return;
    }

    await withTransaction(async (txQuery) => {
      // 1. Lock escrow row
      const escrowRes = await txQuery(
        `SELECT id, title, amount, status, buyer_id, seller_id, seller_email FROM escrows WHERE id = $1 FOR UPDATE`,
        [escrowId]
      );

      const escrow = escrowRes.rows[0];
      if (!escrow) {
        errorCode = 'NOT_FOUND';
        errorMessage = 'Escrow deal not found.';
        throw new Error('NOT_FOUND');
      }

      if (escrow.status !== 'disputed') {
        errorCode = 'INVALID_STATE';
        errorMessage = `Escrow is not in disputed state (Current status: ${escrow.status}).`;
        throw new Error('INVALID_STATE');
      }

      // 2. Lock dispute row
      const disputeRes = await txQuery(
        `SELECT id, status FROM escrow_disputes WHERE escrow_id = $1 AND status IN ('pending', 'open', 'under_review') FOR UPDATE`,
        [escrowId]
      );

      const dispute = disputeRes.rows[0];
      if (!dispute) {
        errorCode = 'ALREADY_RESOLVED';
        errorMessage = 'Dispute has already been resolved or does not exist.';
        throw new Error('ALREADY_RESOLVED');
      }

      const escrowAmount = parseFloat(escrow.amount || 0);
      const buyerId = escrow.buyer_id;

      // Lock buyer wallet
      const buyerWalletRes = await txQuery(
        `SELECT escrow_balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [buyerId]
      );

      const buyerEscrowBal = buyerWalletRes.rows[0] ? parseFloat(buyerWalletRes.rows[0].escrow_balance || 0) : 0;
      if (buyerEscrowBal < escrowAmount) {
        errorCode = 'INSUFFICIENT_ESCROW_BAL';
        errorMessage = 'Insufficient escrow balance available to resolve dispute.';
        throw new Error('INSUFFICIENT_ESCROW_BAL');
      }

      // Determine seller ID
      let sellerId = escrow.seller_id;
      if (!sellerId && escrow.seller_email) {
        const sellerUser = await txQuery(`SELECT id FROM users WHERE LOWER(email) = $1`, [escrow.seller_email.toLowerCase().trim()]);
        if (sellerUser.rows[0]) {
          sellerId = sellerUser.rows[0].id;
        }
      }

      if (sellerId) {
        // Ensure seller wallet exists
        await txQuery(
          `INSERT INTO wallets (id, user_id, available_balance, escrow_balance, pending_withdrawal_balance, currency, updated_at)
           VALUES ($1, $2, 0.00, 0.00, 0.00, 'NGN', $3)
           ON CONFLICT (user_id) DO NOTHING`,
          ['wal_' + Date.now(), sellerId, now]
        );
      }

      // Deduct total escrow amount from buyer's escrow_balance
      await txQuery(
        `UPDATE wallets 
         SET escrow_balance = GREATEST(0, escrow_balance - $1), updated_at = $2 
         WHERE user_id = $3 AND escrow_balance >= $1`,
        [escrowAmount, now, buyerId]
      );

      // Execute specific resolution strategy
      if (resolution === 'refund_buyer' || resolution === 'resolve_buyer') {
        // Refund 100% to buyer
        await txQuery(
          `UPDATE wallets SET available_balance = available_balance + $1, updated_at = $2 WHERE user_id = $3`,
          [escrowAmount, now, buyerId]
        );

        await txQuery(
          `UPDATE escrows SET status = 'refunded', payment_status = 'refunded', refunded_at = $1, updated_at = $1 WHERE id = $2`,
          [now, escrowId]
        );

        await txQuery(
          `UPDATE escrow_disputes 
           SET status = 'resolved_buyer', resolution = 'refund_buyer', resolution_details = $1, resolved_by = $2, resolved_at = $3 
           WHERE id = $4`,
          [resolutionNotes || 'Dispute resolved in favor of buyer. Full refund issued.', req.user.id, now, dispute.id]
        );

        await txQuery(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
           VALUES ($1, $2, 'escrow_refund', $3, 'completed', $4, $5, $6)`,
          [
            'tx_' + Date.now(),
            buyerId,
            escrowAmount,
            'RFD-' + Math.floor(100000 + Math.random() * 900000),
            `Dispute Settlement Refund: ${escrow.title}`,
            now,
          ]
        );
      } else if (resolution === 'release_to_seller' || resolution === 'resolve_seller') {
        // Release 100% to seller
        if (!sellerId) {
          errorCode = 'NO_SELLER';
          errorMessage = 'Cannot release to seller because seller account is unlinked.';
          throw new Error('NO_SELLER');
        }

        await txQuery(
          `UPDATE wallets SET available_balance = available_balance + $1, updated_at = $2 WHERE user_id = $3`,
          [escrowAmount, now, sellerId]
        );

        await txQuery(
          `UPDATE escrows SET status = 'completed', payment_status = 'released', completed_at = $1, updated_at = $1 WHERE id = $2`,
          [now, escrowId]
        );

        await txQuery(
          `UPDATE escrow_disputes 
           SET status = 'resolved_seller', resolution = 'release_to_seller', resolution_details = $1, resolved_by = $2, resolved_at = $3 
           WHERE id = $4`,
          [resolutionNotes || 'Dispute resolved in favor of seller. Full payout released.', req.user.id, now, dispute.id]
        );

        await txQuery(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
           VALUES ($1, $2, 'escrow_payout', $3, 'completed', $4, $5, $6)`,
          [
            'tx_' + Date.now(),
            sellerId,
            escrowAmount,
            'PAY-' + Math.floor(100000 + Math.random() * 900000),
            `Dispute Settlement Payout: ${escrow.title}`,
            now,
          ]
        );
      } else if (resolution === 'split') {
        const parsedBuyer = Number(buyerAmount);
        const parsedSeller = Number(sellerAmount);

        if (isNaN(parsedBuyer) || parsedBuyer < 0 || isNaN(parsedSeller) || parsedSeller < 0) {
          errorCode = 'INVALID_SPLIT';
          errorMessage = 'Split amounts must be non-negative numeric values.';
          throw new Error('INVALID_SPLIT');
        }

        if (Math.abs((parsedBuyer + parsedSeller) - escrowAmount) > 0.01) {
          errorCode = 'INVALID_SPLIT_SUM';
          errorMessage = `Split amounts (Buyer: ₦${parsedBuyer}, Seller: ₦${parsedSeller}) must sum exactly to total escrow amount (₦${escrowAmount}).`;
          throw new Error('INVALID_SPLIT_SUM');
        }

        if (parsedBuyer > 0) {
          await txQuery(
            `UPDATE wallets SET available_balance = available_balance + $1, updated_at = $2 WHERE user_id = $3`,
            [parsedBuyer, now, buyerId]
          );

          await txQuery(
            `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
             VALUES ($1, $2, 'escrow_refund', $3, 'completed', $4, $5, $6)`,
            [
              'tx_' + Date.now(),
              buyerId,
              parsedBuyer,
              'RFD-' + Math.floor(100000 + Math.random() * 900000),
              `Dispute Split Refund: ${escrow.title}`,
              now,
            ]
          );
        }

        if (parsedSeller > 0 && sellerId) {
          await txQuery(
            `UPDATE wallets SET available_balance = available_balance + $1, updated_at = $2 WHERE user_id = $3`,
            [parsedSeller, now, sellerId]
          );

          await txQuery(
            `INSERT INTO wallet_transactions (id, user_id, type, amount, status, reference, description, created_at)
             VALUES ($1, $2, 'escrow_payout', $3, 'completed', $4, $5, $6)`,
            [
              'tx_' + (Date.now() + 1),
              sellerId,
              parsedSeller,
              'PAY-' + Math.floor(100000 + Math.random() * 900000),
              `Dispute Split Payout: ${escrow.title}`,
              now,
            ]
          );
        }

        await txQuery(
          `UPDATE escrows SET status = 'completed', payment_status = 'split_released', completed_at = $1, updated_at = $1 WHERE id = $2`,
          [now, escrowId]
        );

        await txQuery(
          `UPDATE escrow_disputes 
           SET status = 'resolved_split', resolution = 'split', buyer_split_amount = $1, seller_split_amount = $2, resolution_details = $3, resolved_by = $4, resolved_at = $5 
           WHERE id = $6`,
          [parsedBuyer, parsedSeller, resolutionNotes || 'Dispute split resolution executed.', req.user.id, now, dispute.id]
        );
      }

      // Log activity
      await txQuery(
        `INSERT INTO activity_logs (id, user_id, title, description, category, timestamp)
         VALUES ($1, $2, 'Dispute Resolved', $3, 'dispute', $4)`,
        ['act_' + Date.now(), req.user.id, `Moderator resolved dispute on "${escrow.title}" (${resolution})`, now]
      );

      // Create notifications for buyer and seller
      await createNotification({
        userId: buyerId,
        type: 'escrow',
        title: 'Dispute Resolved',
        message: `The dispute on escrow deal "${escrow.title}" was resolved by arbitration (${resolution}).`,
        referenceId: escrowId,
        referenceType: 'escrow',
        txQuery,
      });

      if (sellerId && sellerId !== buyerId) {
        await createNotification({
          userId: sellerId,
          type: 'escrow',
          title: 'Dispute Resolved',
          message: `The dispute on escrow deal "${escrow.title}" was resolved by arbitration (${resolution}).`,
          referenceId: escrowId,
          referenceType: 'escrow',
          txQuery,
        });
      }
    });

    res.json({ success: true, message: 'Dispute resolved successfully and funds distributed.' });
  } catch (err: any) {
    if (errorCode === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: errorMessage });
    } else if (errorCode === 'ALREADY_RESOLVED' || errorCode === 'INVALID_STATE' || errorCode === 'INVALID_SPLIT' || errorCode === 'INVALID_SPLIT_SUM' || errorCode === 'NO_SELLER') {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      console.error('resolveDispute error:', err);
      res.status(500).json({ success: false, error: 'Dispute resolution failed.' });
    }
  }
}

/**
 * GET /api/escrow/:id/chat
 * Retrieves deal chat messages for authorized participants.
 */
export async function getChatMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email.toLowerCase().trim();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';

    // Verify participant
    let sql = `SELECT id FROM escrows WHERE id = $1`;
    let params: any[] = [escrowId];

    if (!isAdmin) {
      sql += ` AND (buyer_id = $2 OR seller_id = $2 OR LOWER(seller_email) = $3 OR LOWER(buyer_email) = $3)`;
      params.push(userId, userEmail);
    }

    const escrow = await getRow<any>(sql, params);

    if (!escrow) {
      res.status(404).json({ success: false, error: 'Escrow deal not found or access denied.' });
      return;
    }

    const rawMsgs = await getAllRows<any>(
      `SELECT id, sender_id, sender_name, message, timestamp FROM escrow_chat_messages WHERE escrow_id = $1 ORDER BY timestamp ASC`,
      [escrowId]
    );

    const messages = rawMsgs.map((m) => ({
      id: m.id,
      escrowId,
      senderId: m.sender_id,
      senderName: m.sender_name,
      message: m.message,
      timestamp: m.timestamp,
      createdAt: m.timestamp,
      isCurrentUser: m.sender_id === userId,
    }));

    res.json({ success: true, data: messages });
  } catch (err: any) {
    console.error('getChatMessages error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve chat messages.' });
  }
}

/**
 * POST /api/escrow/:id/chat
 * Sends a chat message inside an active escrow deal.
 * Sender ID is strictly derived from req.user.id.
 */
export async function sendChatMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized access.' });
      return;
    }

    const escrowId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email.toLowerCase().trim();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Message cannot be empty.' });
      return;
    }

    if (message.trim().length > 2000) {
      res.status(400).json({ success: false, error: 'Message exceeds the maximum length of 2,000 characters.' });
      return;
    }

    let sql = `SELECT id FROM escrows WHERE id = $1`;
    let params: any[] = [escrowId];

    if (!isAdmin) {
      sql += ` AND (buyer_id = $2 OR seller_id = $2 OR LOWER(seller_email) = $3 OR LOWER(buyer_email) = $3)`;
      params.push(userId, userEmail);
    }

    const escrow = await getRow<any>(sql, params);

    if (!escrow) {
      res.status(404).json({ success: false, error: 'Escrow deal not found or access denied.' });
      return;
    }

    const msgId = 'msg_' + Date.now();
    const now = new Date().toISOString();
    const senderName = req.user.fullName || userEmail.split('@')[0];

    await runQuery(
      `INSERT INTO escrow_chat_messages (id, escrow_id, sender_id, sender_name, message, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [msgId, escrowId, userId, senderName, message.trim(), now]
    );

    res.status(201).json({
      success: true,
      data: {
        id: msgId,
        escrowId,
        senderId: userId,
        senderName,
        message: message.trim(),
        timestamp: now,
        createdAt: now,
        isCurrentUser: true,
      },
    });
  } catch (err: any) {
    console.error('sendChatMessage error:', err);
    res.status(500).json({ success: false, error: 'Failed to send chat message.' });
  }
}
