/**
 * Banking/Plaid Integration API Routes
 *
 * OAuth flows and financial prediction endpoints.
 * Supports: Plaid Link for bank account connections.
 *
 * "Better than Human" - anticipate money stress before it happens.
 *
 * @module api/v1/integrations/banking
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createLinkToken,
  exchangePublicToken,
  hasLinkedAccounts,
  getTokenData,
  removeAccessToken,
  getAccountBalances,
  getTransactions,
  analyzeSpending,
} from '../../../tools/domains/finance/plaid.js';
import {
  detectBills,
  detectIncome,
  predictCashFlow,
  detectAnomalies,
  detectSubscriptionCreep,
  createSavingsGoal,
  updateGoalProgress,
  generateFinancialInsight,
} from '../../../services/finance/prediction.js';

const log = createLogger({ module: 'api:banking' });
const router = Router();

// ============================================================================
// GET /api/v1/integrations/banking/status
// Check if user has bank account connected
// ============================================================================
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const connected = hasLinkedAccounts(userId);
    const tokenData = connected ? getTokenData(userId) : null;

    return res.json({
      connected,
      institution: tokenData?.institution?.name || null,
      linkedAt: tokenData?.linked_at || null,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get banking status');
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

// ============================================================================
// POST /api/v1/integrations/banking/link-token
// Create a Plaid Link token for account linking
// ============================================================================
router.post('/link-token', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body as { userId: string };

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const linkToken = await createLinkToken(userId);

    if (linkToken.startsWith("I'd love to")) {
      // Error message from service - credentials not configured
      return res.status(503).json({
        error: 'Plaid service not configured',
        message: linkToken,
      });
    }

    log.info({ userId }, 'Plaid link token created');
    return res.json({ linkToken });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create link token');
    return res.status(500).json({ error: 'Failed to create link token' });
  }
});

// ============================================================================
// POST /api/v1/integrations/banking/exchange-token
// Exchange public token for access token after Plaid Link success
// ============================================================================
router.post('/exchange-token', async (req: Request, res: Response) => {
  try {
    const { userId, publicToken, institution } = req.body as {
      userId: string;
      publicToken: string;
      institution?: { institution_id?: string; name?: string };
    };

    if (!userId || !publicToken) {
      return res.status(400).json({ error: 'userId and publicToken are required' });
    }

    const accessToken = await exchangePublicToken(publicToken);

    if (!accessToken) {
      return res.status(400).json({ error: 'Failed to exchange token' });
    }

    // Store the token
    const { storeAccessToken } = await import('../../../tools/domains/finance/plaid.js');
    storeAccessToken(userId, accessToken, undefined, institution);

    // Trigger initial financial analysis in background
    void (async () => {
      try {
        await Promise.all([detectBills(userId), detectIncome(userId), detectAnomalies(userId)]);
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Initial financial analysis failed');
      }
    })();

    log.info({ userId, institution: institution?.name }, 'Bank account linked');
    return res.json({
      success: true,
      institution: institution?.name || 'Unknown',
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to exchange token');
    return res.status(500).json({ error: 'Failed to link account' });
  }
});

// ============================================================================
// DELETE /api/v1/integrations/banking/disconnect
// Disconnect bank account
// ============================================================================
router.delete('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const removed = removeAccessToken(userId);

    if (removed) {
      log.info({ userId }, 'Bank account disconnected');
      return res.json({ success: true });
    } else {
      return res.status(404).json({ error: 'No linked account found' });
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to disconnect banking');
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/balances
// Get current account balances
// ============================================================================
router.get('/balances', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const tokenData = getTokenData(userId);
    if (!tokenData) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const accounts = await getAccountBalances(tokenData.access_token);

    return res.json({
      accounts: accounts.map((a) => ({
        accountId: a.account_id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
        balances: a.balances,
      })),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get balances');
    return res.status(500).json({ error: 'Failed to get balances' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/transactions
// Get recent transactions
// ============================================================================
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const tokenData = getTokenData(userId);
    if (!tokenData) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const transactions = await getTransactions(
      tokenData.access_token,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      limit
    );

    return res.json({
      transactions: transactions.map((t) => ({
        id: t.transaction_id,
        date: t.date,
        name: t.name,
        merchantName: t.merchant_name,
        amount: t.amount,
        category: t.category,
        pending: t.pending,
        paymentChannel: t.payment_channel,
      })),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get transactions');
    return res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/spending-analysis
// Get spending analysis by category
// ============================================================================
router.get('/spending-analysis', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const period = (req.query.period as string) || 'month';

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const tokenData = getTokenData(userId);
    if (!tokenData) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    const transactions = await getTransactions(
      tokenData.access_token,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      250
    );

    const analysis = analyzeSpending(transactions);

    return res.json({
      period,
      ...analysis,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to analyze spending');
    return res.status(500).json({ error: 'Failed to analyze spending' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/cash-flow
// Get cash flow forecast
// ============================================================================
router.get('/cash-flow', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const daysOut = parseInt(req.query.daysOut as string) || 14;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!hasLinkedAccounts(userId)) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const forecast = await predictCashFlow(userId, daysOut);

    if (!forecast) {
      return res.status(500).json({ error: 'Failed to generate forecast' });
    }

    return res.json(forecast);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get cash flow');
    return res.status(500).json({ error: 'Failed to get cash flow' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/bills
// Get detected recurring bills
// ============================================================================
router.get('/bills', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!hasLinkedAccounts(userId)) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const bills = await detectBills(userId);

    return res.json({ bills });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get bills');
    return res.status(500).json({ error: 'Failed to get bills' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/income
// Get detected income sources
// ============================================================================
router.get('/income', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!hasLinkedAccounts(userId)) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const income = await detectIncome(userId);

    return res.json({ income });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get income');
    return res.status(500).json({ error: 'Failed to get income' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/anomalies
// Get spending anomalies
// ============================================================================
router.get('/anomalies', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!hasLinkedAccounts(userId)) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const anomalies = await detectAnomalies(userId);

    return res.json({ anomalies });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get anomalies');
    return res.status(500).json({ error: 'Failed to get anomalies' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/subscriptions
// Get subscription analysis
// ============================================================================
router.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!hasLinkedAccounts(userId)) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const subscriptions = await detectSubscriptionCreep(userId);

    if (!subscriptions) {
      return res.status(500).json({ error: 'Failed to analyze subscriptions' });
    }

    return res.json(subscriptions);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get subscriptions');
    return res.status(500).json({ error: 'Failed to get subscriptions' });
  }
});

// ============================================================================
// POST /api/v1/integrations/banking/goals
// Create a savings goal
// ============================================================================
router.post('/goals', async (req: Request, res: Response) => {
  try {
    const { userId, name, targetAmount, targetDate, currentAmount } = req.body as {
      userId: string;
      name: string;
      targetAmount: number;
      targetDate: string;
      currentAmount?: number;
    };

    if (!userId || !name || !targetAmount || !targetDate) {
      return res.status(400).json({
        error: 'userId, name, targetAmount, and targetDate are required',
      });
    }

    const goal = createSavingsGoal(
      userId,
      name,
      targetAmount,
      new Date(targetDate),
      currentAmount || 0
    );

    log.info({ userId, goalId: goal.id, name }, 'Savings goal created');
    return res.json({ goal });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create goal');
    return res.status(500).json({ error: 'Failed to create goal' });
  }
});

// ============================================================================
// PATCH /api/v1/integrations/banking/goals/:goalId
// Update savings goal progress
// ============================================================================
router.patch('/goals/:goalId', async (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const { userId, currentAmount } = req.body as {
      userId: string;
      currentAmount: number;
    };

    if (!userId || currentAmount === undefined) {
      return res.status(400).json({ error: 'userId and currentAmount are required' });
    }

    const progress = updateGoalProgress(userId, goalId, currentAmount);

    if (!progress) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    log.info({ userId, goalId, currentAmount }, 'Goal progress updated');
    return res.json({ progress });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update goal');
    return res.status(500).json({ error: 'Failed to update goal' });
  }
});

// ============================================================================
// GET /api/v1/integrations/banking/insights
// Get proactive financial insights
// ============================================================================
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!hasLinkedAccounts(userId)) {
      return res.status(400).json({ error: 'No linked bank account' });
    }

    const insight = await generateFinancialInsight(userId);

    return res.json({
      hasInsight: !!insight,
      insight,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get insights');
    return res.status(500).json({ error: 'Failed to get insights' });
  }
});

export default router;
