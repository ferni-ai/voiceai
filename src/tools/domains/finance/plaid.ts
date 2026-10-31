/**
 * Plaid Integration Tools
 *
 * Domain: Bank account linking, transactions, balances, spending analysis
 *
 * Plaid provides:
 * - Link token creation for account linking flow
 * - Account balances (checking, savings, credit cards)
 * - Transaction history with categorization
 * - Spending insights and patterns
 * - Institution info and account verification
 *
 * Jack uses this to help users understand their financial picture
 * and provide personalized advice based on real spending data.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getRateLimiter } from '../../rate-limiter.js';
import { getCallUserPort } from '../proactive/outreach/call-user-port.js';
import {
  callerTokenData,
  plaidCaller,
  isoDay as day,
  PLAID_LINES,
  readCallerBank,
  type PlaidRead,
} from './plaid-caller.js';
// Plaid API configuration
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox'; // sandbox, development, production

const PLAID_BASE_URL =
  {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
  }[PLAID_ENV] || 'https://sandbox.plaid.com';

// ============================================================================
// PLAID API TYPES
// ============================================================================

interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string;
  type: 'depository' | 'credit' | 'loan' | 'investment' | 'other';
  subtype?: string;
  balances: {
    available?: number;
    current?: number;
    limit?: number;
    iso_currency_code?: string;
  };
  mask?: string; // Last 4 digits
}

interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string;
  category?: string[];
  pending: boolean;
  payment_channel: 'online' | 'in store' | 'other';
  location?: {
    city?: string;
    region?: string;
  };
}

interface PlaidInstitution {
  institution_id: string;
  name: string;
  logo?: string;
}

interface PlaidLinkTokenResponse {
  link_token: string;
  expiration: string;
  request_id: string;
}

interface PlaidAccountsResponse {
  accounts: PlaidAccount[];
  item: {
    item_id: string;
    institution_id?: string;
  };
  request_id: string;
}

interface PlaidTransactionsResponse {
  accounts: PlaidAccount[];
  transactions: PlaidTransaction[];
  total_transactions: number;
  request_id: string;
}

interface PlaidBalanceResponse {
  accounts: PlaidAccount[];
  request_id: string;
}

// ============================================================================
// RETRY UTILITY
// ============================================================================

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Execute a function with exponential backoff retry logic
 */
async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const isRetryable =
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('timeout'));

      if (!isRetryable && attempt === opts.maxRetries - 1) {
        throw lastError;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 100,
        opts.maxDelayMs
      );

      getLogger().warn(
        {
          attempt: attempt + 1,
          maxRetries: opts.maxRetries,
          delayMs: delay,
          error: lastError.message,
        },
        'Retrying after error'
      );

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  throw lastError;
}

// ============================================================================
// PLAID API HELPERS
// ============================================================================

/**
 * Make authenticated Plaid API request with retry logic. Never null: the bank
 * asking for a fresh login is needs_reauth; anything else that failed (5xx,
 * timeout, network, missing credentials, rate limit) is unreachable.
 */
async function plaidRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<PlaidRead<T>> {
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    getLogger().warn('Plaid credentials not configured');
    return { outcome: 'unreachable' };
  }

  // Rate limiting to prevent API abuse
  const rateLimiter = getRateLimiter('plaid');
  if (!rateLimiter.tryAcquire()) {
    getLogger().warn({ endpoint }, 'Plaid API rate limited');
    return { outcome: 'unreachable' };
  }

  try {
    return await withRetry(
      async () => {
        const response = await fetch(`${PLAID_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            ...body,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          const error = (await response.json().catch(() => ({}))) as {
            error_message?: string;
            error_code?: string;
          };

          // Check if this is a retryable error
          const retryableStatuses = [408, 429, 500, 502, 503, 504];
          if (retryableStatuses.includes(response.status)) {
            throw new Error(`Retryable error: ${response.status} - ${error.error_message}`);
          }

          getLogger().error(
            {
              endpoint,
              status: response.status,
              error_code: error.error_code,
              error_message: error.error_message,
            },
            'Plaid API error (non-retryable)'
          );
          const reauth = error.error_code === 'ITEM_LOGIN_REQUIRED';
          return { outcome: reauth ? 'needs_reauth' : 'unreachable' } as const;
        }

        return { outcome: 'data', data: (await response.json()) as T } as const;
      },
      { maxRetries: 3, baseDelayMs: 500 }
    );
  } catch (error) {
    getLogger().error({ endpoint, error }, 'Plaid request failed after retries');
    return { outcome: 'unreachable' };
  }
}

// ============================================================================
// PLAID FUNCTIONS
// ============================================================================

/**
 * Create a Link token for account linking
 * This is the first step - user gets a token to open Plaid Link UI
 */
export async function createLinkToken(userId: string): Promise<string> {
  const result = await plaidRequest<PlaidLinkTokenResponse>('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'Ferni Financial Team',
    products: ['transactions', 'auth'],
    country_codes: ['US'],
    language: 'en',
    // Optional: webhook for real-time updates
    // webhook: 'https://your-webhook-url.com/plaid',
  });

  if (result.outcome !== 'data') {
    return "I'd love to help you link your bank account, but my connection service isn't set up yet. Ask the team to configure Plaid!";
  }

  return result.data.link_token;
}

/**
 * Exchange public token for access token after user links account
 * The public token comes from Plaid Link UI callback
 */
export async function exchangePublicToken(
  publicToken: string
): Promise<{ access_token: string; item_id: string } | null> {
  const result = await plaidRequest<{ access_token: string; item_id: string }>(
    '/item/public_token/exchange',
    { public_token: publicToken }
  );
  return result.outcome === 'data' ? result.data : null;
}

/** Account balances as an outcome: an empty list is data, a failure is not. */
async function fetchAccountBalances(accessToken: string): Promise<PlaidRead<PlaidAccount[]>> {
  const result = await plaidRequest<PlaidBalanceResponse>('/accounts/balance/get', {
    access_token: accessToken,
  });
  return result.outcome === 'data' ? { outcome: 'data', data: result.data.accounts ?? [] } : result;
}

/** Account balances; [] on failure too (context builders). Tools use fetchAccountBalances. */
export async function getAccountBalances(accessToken: string): Promise<PlaidAccount[]> {
  const result = await fetchAccountBalances(accessToken);
  return result.outcome === 'data' ? result.data : [];
}

/** Transactions for a date range as an outcome: an empty list is data, a failure is not. */
export async function fetchTransactions(
  accessToken: string,
  startDate: string,
  endDate: string,
  count = 100
): Promise<PlaidRead<PlaidTransaction[]>> {
  const result = await plaidRequest<PlaidTransactionsResponse>('/transactions/get', {
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
    options: {
      count,
      offset: 0,
    },
  });
  return result.outcome === 'data'
    ? { outcome: 'data', data: result.data.transactions ?? [] }
    : result;
}

/**
 * A health check's reads: balances it can't do without, and the month's
 * transactions as their own outcome, so a failed spending read leaves an honest
 * balances-only answer instead of no answer or a $0 month.
 */
async function balancesAndSpending(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<PlaidRead<{ accounts: PlaidAccount[]; transactions: PlaidRead<PlaidTransaction[]> }>> {
  const [balances, transactions] = await Promise.all([
    fetchAccountBalances(accessToken),
    fetchTransactions(accessToken, startDate, endDate, 250),
  ]);
  return balances.outcome === 'data'
    ? { outcome: 'data', data: { accounts: balances.data, transactions } }
    : balances;
}

const NO_SPENDING_YET =
  "I couldn't get your recent transactions just now, so I can't say anything about your spending or emergency fund yet. Want me to try again in a bit?";

/** Transactions; [] on failure too (context builders). Tools use fetchTransactions. */
export async function getTransactions(
  accessToken: string,
  startDate: string,
  endDate: string,
  count = 100
): Promise<PlaidTransaction[]> {
  const result = await fetchTransactions(accessToken, startDate, endDate, count);
  return result.outcome === 'data' ? result.data : [];
}

/**
 * Analyze spending by category
 */
export function analyzeSpending(transactions: PlaidTransaction[]): {
  byCategory: Record<string, { total: number; count: number; transactions: string[] }>;
  totalSpending: number;
  largestExpenses: Array<{ name: string; amount: number; date: string }>;
  averageTransactionSize: number;
  recurringExpenses: Array<{ name: string; amount: number; frequency: string }>;
} {
  const byCategory: Record<string, { total: number; count: number; transactions: string[] }> = {};
  let totalSpending = 0;

  // Filter to spending only (positive amounts = money out in Plaid)
  const spendingTxns = transactions.filter((t) => t.amount > 0 && !t.pending);

  for (const txn of spendingTxns) {
    const category = txn.category?.[0] || 'Uncategorized';
    totalSpending += txn.amount;

    if (!byCategory[category]) {
      byCategory[category] = { total: 0, count: 0, transactions: [] };
    }
    byCategory[category].total += txn.amount;
    byCategory[category].count++;
    if (byCategory[category].transactions.length < 3) {
      byCategory[category].transactions.push(txn.merchant_name || txn.name);
    }
  }

  // Find largest expenses
  const largestExpenses = [...spendingTxns]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((t) => ({
      name: t.merchant_name || t.name,
      amount: t.amount,
      date: t.date,
    }));

  // Detect recurring expenses (same merchant, similar amounts)
  const merchantCounts: Record<string, { amounts: number[]; dates: string[] }> = {};
  for (const txn of spendingTxns) {
    const key = (txn.merchant_name || txn.name).toLowerCase();
    if (!merchantCounts[key]) {
      merchantCounts[key] = { amounts: [], dates: [] };
    }
    merchantCounts[key].amounts.push(txn.amount);
    merchantCounts[key].dates.push(txn.date);
  }

  const recurringExpenses = Object.entries(merchantCounts)
    .filter(([_, data]) => data.amounts.length >= 2)
    .map(([name, data]) => {
      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const frequency =
        data.amounts.length >= 4 ? 'weekly' : data.amounts.length >= 2 ? 'monthly' : 'occasional';
      return { name, amount: Math.round(avgAmount * 100) / 100, frequency };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return {
    byCategory,
    totalSpending: Math.round(totalSpending * 100) / 100,
    largestExpenses,
    averageTransactionSize:
      spendingTxns.length > 0 ? Math.round((totalSpending / spendingTxns.length) * 100) / 100 : 0,
    recurringExpenses,
  };
}

/**
 * Format account balances for natural speech
 */
export function formatBalancesForSpeech(accounts: PlaidAccount[]): string {
  if (accounts.length === 0) {
    return "I don't see any linked accounts yet.";
  }

  const lines: string[] = [];
  let totalChecking = 0;
  let totalSavings = 0;
  let totalCredit = 0;
  let totalCreditLimit = 0;

  for (const account of accounts) {
    const balance = account.balances.current || account.balances.available || 0;
    const { name } = account;
    const lastFour = account.mask ? ` (***${account.mask})` : '';

    if (account.type === 'depository') {
      if (account.subtype === 'checking') {
        totalChecking += balance;
        lines.push(`• ${name}${lastFour}: $${balance.toLocaleString()} checking`);
      } else if (account.subtype === 'savings') {
        totalSavings += balance;
        lines.push(`• ${name}${lastFour}: $${balance.toLocaleString()} savings`);
      } else {
        lines.push(`• ${name}${lastFour}: $${balance.toLocaleString()}`);
      }
    } else if (account.type === 'credit') {
      totalCredit += balance;
      if (account.balances.limit) {
        totalCreditLimit += account.balances.limit;
        const utilization = Math.round((balance / account.balances.limit) * 100);
        lines.push(
          `• ${name}${lastFour}: $${balance.toLocaleString()} balance (${utilization}% of $${account.balances.limit.toLocaleString()} limit)`
        );
      } else {
        lines.push(`• ${name}${lastFour}: $${balance.toLocaleString()} balance`);
      }
    }
  }

  const summary: string[] = [];
  if (totalChecking > 0 || totalSavings > 0) {
    const totalCash = totalChecking + totalSavings;
    summary.push(`Total cash: $${totalCash.toLocaleString()}`);
  }
  if (totalCredit > 0) {
    const overallUtilization =
      totalCreditLimit > 0
        ? ` (${Math.round((totalCredit / totalCreditLimit) * 100)}% utilization)`
        : '';
    summary.push(`Credit card debt: $${totalCredit.toLocaleString()}${overallUtilization}`);
  }

  return `${lines.join('\n')}\n\n${summary.join(' | ')}`;
}

/**
 * Format spending analysis for natural speech
 */
export function formatSpendingForSpeech(
  analysis: ReturnType<typeof analyzeSpending>,
  period: string
): string {
  const { byCategory, totalSpending, largestExpenses, recurringExpenses } = analysis;

  const lines: string[] = [];
  lines.push(`📊 Your spending for ${period}: $${totalSpending.toLocaleString()}`);
  lines.push('');

  // Top categories
  const sortedCategories = Object.entries(byCategory)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  if (sortedCategories.length > 0) {
    lines.push('**By Category:**');
    for (const [category, data] of sortedCategories) {
      const pct = Math.round((data.total / totalSpending) * 100);
      lines.push(
        `• ${category}: $${data.total.toLocaleString()} (${pct}%) - ${data.count} transactions`
      );
    }
    lines.push('');
  }

  // Largest expenses
  if (largestExpenses.length > 0) {
    lines.push('**Biggest Expenses:**');
    for (const expense of largestExpenses.slice(0, 3)) {
      lines.push(`• ${expense.name}: $${expense.amount.toLocaleString()} on ${expense.date}`);
    }
    lines.push('');
  }

  // Recurring
  if (recurringExpenses.length > 0) {
    lines.push('**Recurring Expenses I Noticed:**');
    for (const recurring of recurringExpenses.slice(0, 5)) {
      lines.push(`• ${recurring.name}: ~$${recurring.amount} ${recurring.frequency}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// SHARED TOKEN STORAGE
// plaid-items.ts: the sealed per-user store with PLAID_UNIFIED_STORE on, the file before
// ============================================================================

import {
  storeAccessToken,
  getStoredAccessToken,
  hasLinkedAccounts,
  getTokenData,
  removeAccessToken,
} from './plaid-items.js';

// Re-export for external use
export {
  storeAccessToken,
  getStoredAccessToken,
  hasLinkedAccounts,
  getTokenData,
  removeAccessToken,
};

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const CANT_CHECK_LINK = "I couldn't check your bank link just now. Want me to try again in a bit?";

/** The bank-link email: the secure Plaid link as one button. */
function bankLinkEmailHtml(secureLink: string): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
      <h2>Connect Your Bank Account</h2>
      <p>Click the secure button below to link your bank account. This uses Plaid - the same security trusted by major financial apps.</p>
      <p style="margin: 30px 0;">
        <a href="${secureLink}" style="background: #1a365d; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 18px;">
          Link My Account
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">Your bank login credentials are never shared with me or stored. Plaid acts as a secure intermediary.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
      <p style="color: #718096; font-size: 14px;">— Ferni</p>
    </div>`;
}

/**
 * The secure link to the caller's own verified phone or email, never the model's: the text is
 * an owner text not asked for now, so STOP, quiet hours and MINOR_CARE_SHARED_HOLD all hold it.
 */
async function sendLinkToOwnContact(
  userId: string,
  deliveryMethod: 'sms' | 'email',
  secureLink: string
): Promise<{ sent: true } | { sent: false; reason: string }> {
  const port = getCallUserPort();
  if (deliveryMethod === 'sms') {
    const text = await port?.textOwner?.(userId, `Jack here! Tap this secure link to connect your bank account: ${secureLink}\n\nThis uses Plaid - the same security used by major financial apps. Your bank login is never shared with me.`, { askedNow: false }); // prettier-ignore
    return text?.sent ? { sent: true } : { sent: false, reason: text?.reason ?? "texting isn't set up here" }; // prettier-ignore
  }
  const email = await port?.verifiedEmail?.(userId);
  if (!email) return { sent: false, reason: "there's no verified email on your account" };
  const { sendAppEmail } = await import('../../../services/communication-service.js');
  const sent = await sendAppEmail({ to: email, fromName: 'Ferni', subject: '🔐 Securely Link Your Bank Account', kind: 'transactional', html: bankLinkEmailHtml(secureLink) }); // prettier-ignore
  if (sent.ok) return { sent: true };
  getLogger().error({ provider: sent.provider, status: sent.status, error: sent.error }, 'Failed to send bank-link email'); // prettier-ignore
  return { sent: false, reason: "the email didn't go through" };
}

/**
 * The Plaid tools, run as the call's own verified caller (plaid-caller.ts): no
 * tool takes a userId or a contact argument, and one sent anyway is ignored.
 */
export function createPlaidTools() {
  return {
    checkBankLinkStatus: llm.tool({
      description: getToolDescription('checkBankLinkStatus'),
      parameters: z.object({}),
      execute: async (_args, opts) => {
        const who = plaidCaller(opts);
        if (who.outcome === 'needs_verification') return PLAID_LINES.needs_verification;
        let tokenData: Awaited<ReturnType<typeof callerTokenData>> = null;
        try {
          if (who.outcome === 'verified') tokenData = await callerTokenData(who.id);
        } catch {
          return CANT_CHECK_LINK;
        }
        getLogger().info(
          { hasAccounts: !!tokenData, institution: tokenData?.institution?.name },
          'Checking bank link status'
        );

        if (tokenData) {
          const institutionName = tokenData.institution?.name || 'your bank';
          return `Yes, you have ${institutionName} linked! I can show you balances, transactions, or analyze your spending.`;
        } else {
          return "You haven't linked a bank account yet. Would you like to? I can send you a secure link via text or email - takes about 30 seconds to complete on your phone.";
        }
      },
    }),

    unlinkBankAccount: llm.tool({
      description: getToolDescription('unlinkBankAccount'),
      parameters: z.object({
        confirm: z.boolean().describe('User has confirmed they want to unlink'),
      }),
      execute: async ({ confirm }, opts) => {
        const who = plaidCaller(opts);
        if (who.outcome === 'needs_verification') return PLAID_LINES.needs_verification;
        if (!confirm) {
          return 'Just to confirm - you want me to disconnect your bank account? This will remove my access to your balances and transactions. Say yes to confirm.';
        }

        let tokenData: Awaited<ReturnType<typeof callerTokenData>> = null;
        try {
          if (who.outcome === 'verified') tokenData = await callerTokenData(who.id);
        } catch {
          return CANT_CHECK_LINK;
        }
        if (who.outcome !== 'verified' || !tokenData) {
          return "You don't have a bank account linked, so there's nothing to disconnect.";
        }

        const userId = who.id;
        const institutionName = tokenData.institution?.name || 'your bank';
        const removed = await removeAccessToken(userId);

        if (removed) {
          getLogger().info({ userId, institution: institutionName }, '🔓 Bank account unlinked');
          return `Done - I've disconnected ${institutionName}. Your financial data has been removed. You can always link an account again later if you'd like.`;
        } else {
          return 'Something went wrong disconnecting the account. Please try again.';
        }
      },
    }),

    linkBankAccount: llm.tool({
      description: getToolDescription('linkBankAccount'),
      parameters: z.object({
        deliveryMethod: z
          .enum(['sms', 'email'])
          .describe('Text it to the phone on their account, or email the address on their account'),
      }),
      execute: async ({ deliveryMethod }, opts) => {
        const who = plaidCaller(opts); // the session's verified caller, never the model's
        if (who.outcome === 'needs_verification') return PLAID_LINES.needs_verification;
        if (who.outcome !== 'verified') return "I can only send the link to the person I'm talking with."; // prettier-ignore
        const userId = who.id;
        const startTime = Date.now();
        getLogger().info({ userId, deliveryMethod }, '>>> TOOL: linkBankAccount STARTED');

        if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
          return "I'd love to help you link your bank account, but my account linking service isn't configured yet. For now, I can help with general financial guidance based on what you tell me!";
        }

        const linkToken = await createLinkToken(userId);

        if (linkToken.startsWith("I'd love to")) {
          return linkToken; // Error message
        }

        const secureLink = `${process.env.PLAID_LINK_BASE_URL || ''}?token=${linkToken}&user=${userId}`;
        const sent = await sendLinkToOwnContact(userId, deliveryMethod, secureLink);

        const elapsed = Date.now() - startTime;
        getLogger().info(
          { userId, deliveryMethod, sent: sent.sent, elapsed },
          '<<< TOOL: linkBankAccount COMPLETED'
        );

        const where = deliveryMethod === 'sms' ? 'the phone on your account' : 'the email on your account'; // prettier-ignore
        if (sent.sent) {
          return `Done! I've sent a secure link to ${where}. Just tap it to connect your bank - takes about 30 seconds. Once you're done, let me know and I can show you your balances and help analyze your spending. The link uses Plaid, the same security service used by Venmo, Acorns, and thousands of other apps - your bank password is never shared with me.`;
        }
        return `I didn't send the link to ${where}: ${sent.reason}.`;
      },
    }),

    getAccountBalances: llm.tool({
      description: getToolDescription('getAccountBalances'),
      parameters: z.object({}),
      execute: async (_args, opts) => {
        const startTime = Date.now();
        const got = await readCallerBank(opts, "You haven't linked a bank account yet. Would you like to connect one? It only takes a minute, and it'll let me give you much more personalized advice based on your actual financial picture.", fetchAccountBalances); // prettier-ignore
        if ('line' in got) return got.line;
        const { caller: userId, data: accounts } = got;
        if (accounts.length === 0) {
          return "Your bank is linked, but it didn't show me any accounts.";
        }

        const formatted = formatBalancesForSpeech(accounts);

        const elapsed = Date.now() - startTime;
        getLogger().info(
          { userId, accountCount: accounts.length, elapsed },
          '<<< TOOL: getAccountBalances COMPLETED'
        );

        return `Here's what I see in your linked accounts:\n\n${formatted}`;
      },
    }),

    getSpendingAnalysis: llm.tool({
      description: getToolDescription('getSpendingAnalysis'),
      parameters: z.object({
        period: z
          .enum(['week', 'month', 'quarter'])
          .optional()
          .describe('Time period to analyze (default: month)'),
      }),
      execute: async ({ period = 'month' }, opts) => {
        const startTime = Date.now();
        const endDate = new Date();
        const startDate = new Date();
        if (period === 'week') {
          startDate.setDate(startDate.getDate() - 7);
        } else if (period === 'month') {
          startDate.setMonth(startDate.getMonth() - 1);
        } else {
          startDate.setMonth(startDate.getMonth() - 3);
        }

        const got = await readCallerBank(opts, "You haven't linked a bank account yet. Once you do, I can show you exactly where your money is going and help you find ways to save. Want to link an account?", (token) => fetchTransactions(token, day(startDate), day(endDate), 250)); // prettier-ignore
        if ('line' in got) return got.line;
        const { caller: userId, data: transactions } = got;

        if (transactions.length === 0) {
          return `I don't see any transactions for the past ${period}. This might mean the account was recently connected and is still syncing, or there genuinely haven't been any transactions.`;
        }

        const analysis = analyzeSpending(transactions);
        const formatted = formatSpendingForSpeech(
          analysis,
          period === 'week'
            ? 'the past week'
            : period === 'month'
              ? 'the past month'
              : 'the past 3 months'
        );

        const elapsed = Date.now() - startTime;
        getLogger().info(
          {
            userId,
            period,
            transactionCount: transactions.length,
            totalSpending: analysis.totalSpending,
            elapsed,
          },
          '<<< TOOL: getSpendingAnalysis COMPLETED'
        );

        // Add Jack's perspective
        const jackComment =
          analysis.totalSpending > 0
            ? `\n\nLooking at this, I'd suggest focusing on your ${Object.entries(analysis.byCategory).sort((a, b) => b[1].total - a[1].total)[0]?.[0] || 'largest category'} spending - that's where small changes can make the biggest difference. Would you like to dig into any particular category?`
            : '';

        return `${formatted}${jackComment}`;
      },
    }),

    getRecentTransactions: llm.tool({
      description: getToolDescription('getRecentTransactions'),
      parameters: z.object({
        merchantFilter: z.string().optional().describe('Filter by merchant name'),
        categoryFilter: z.string().optional().describe('Filter by category'),
        limit: z.number().optional().describe('Number of transactions to show (default: 10)'),
      }),
      execute: async ({ merchantFilter, categoryFilter, limit = 10 }, opts) => {
        const startTime = Date.now();
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);

        const got = await readCallerBank(opts, "You'll need to link a bank account first to see your transactions. Want to set that up?", (token) => fetchTransactions(token, day(startDate), day(endDate), 100)); // prettier-ignore
        if ('line' in got) return got.line;
        const userId = got.caller;
        let transactions = got.data;

        if (merchantFilter) {
          const filter = merchantFilter.toLowerCase();
          transactions = transactions.filter(
            (t) =>
              t.merchant_name?.toLowerCase().includes(filter) ||
              t.name.toLowerCase().includes(filter)
          );
        }

        if (categoryFilter) {
          const filter = categoryFilter.toLowerCase();
          transactions = transactions.filter((t) =>
            t.category?.some((c) => c.toLowerCase().includes(filter))
          );
        }

        // Take top N
        transactions = transactions.slice(0, limit);

        if (transactions.length === 0) {
          const filterDesc = merchantFilter
            ? `at "${merchantFilter}"`
            : categoryFilter
              ? `in "${categoryFilter}"`
              : '';
          return `I don't see any recent transactions ${filterDesc}. Want to try a different search?`;
        }

        const lines = transactions.map((t) => {
          const merchant = t.merchant_name || t.name;
          const amount =
            t.amount > 0 ? `-$${t.amount.toFixed(2)}` : `+$${Math.abs(t.amount).toFixed(2)}`;
          const category = t.category?.[0] || '';
          return `• ${t.date}: ${merchant} ${amount}${category ? ` (${category})` : ''}`;
        });

        const elapsed = Date.now() - startTime;
        getLogger().info(
          { userId, resultCount: transactions.length, elapsed },
          '<<< TOOL: getRecentTransactions COMPLETED'
        );

        const header = merchantFilter
          ? `Transactions at "${merchantFilter}":`
          : categoryFilter
            ? `${categoryFilter} transactions:`
            : 'Recent transactions:';

        return `${header}\n${lines.join('\n')}`;
      },
    }),

    checkFinancialHealth: llm.tool({
      description: getToolDescription('checkFinancialHealth'),
      parameters: z.object({}),
      execute: async (_args, opts) => {
        const startTime = Date.now();
        // Get recent transactions for spending analysis
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);

        const got = await readCallerBank(opts, "To give you a real financial health checkup, I'd need to see your accounts. Want to link your bank? It's secure and takes just a minute.", (token) => balancesAndSpending(token, day(startDate), day(endDate))); // prettier-ignore
        if ('line' in got) return got.line;
        const { caller: userId, data: { accounts, transactions } } = got; // prettier-ignore

        // Calculate metrics
        let totalCash = 0;
        let totalDebt = 0;
        let totalCreditLimit = 0;

        for (const account of accounts) {
          const balance = account.balances.current || account.balances.available || 0;
          if (account.type === 'depository') {
            totalCash += balance;
          } else if (account.type === 'credit') {
            totalDebt += balance;
            if (account.balances.limit) {
              totalCreditLimit += account.balances.limit;
            }
          }
        }

        const netWorth = totalCash - totalDebt;
        const creditUtilization =
          totalCreditLimit > 0 ? Math.round((totalDebt / totalCreditLimit) * 100) : 0;

        // Build health report
        const lines: string[] = [];
        lines.push(`💰 **Your Financial Snapshot**\n`);

        lines.push(`**Net Position:** $${netWorth.toLocaleString()}`);
        lines.push(`• Cash on hand: $${totalCash.toLocaleString()}`);
        if (totalDebt > 0) {
          lines.push(`• Credit card debt: $${totalDebt.toLocaleString()}`);
        }
        lines.push('');

        // Credit utilization assessment
        if (totalCreditLimit > 0) {
          let utilizationAssessment: string;
          if (creditUtilization <= 10) {
            utilizationAssessment = 'Excellent! Under 10% is ideal.';
          } else if (creditUtilization <= 30) {
            utilizationAssessment = "Good - you're keeping it under the 30% threshold.";
          } else if (creditUtilization <= 50) {
            utilizationAssessment =
              'Could be better - try to get below 30% for a better credit score.';
          } else {
            utilizationAssessment = 'This is high - paying this down should be a priority.';
          }
          lines.push(`**Credit Utilization:** ${creditUtilization}%`);
          lines.push(`${utilizationAssessment}`);
          lines.push('');
        }

        if (transactions.outcome !== 'data') {
          // Balances alone are an honest partial answer; spending read as $0 would not be.
          lines.push(NO_SPENDING_YET);
          getLogger().info({ userId, netWorth, creditUtilization, spending: transactions.outcome }, '<<< TOOL: checkFinancialHealth PARTIAL'); // prettier-ignore
          return lines.join('\n');
        }

        // Monthly spending
        const spending = analyzeSpending(transactions.data);
        lines.push(`**Last Month's Spending:** $${spending.totalSpending.toLocaleString()}`);
        if (spending.recurringExpenses.length > 0) {
          const monthlyRecurring = spending.recurringExpenses
            .filter((e) => e.frequency === 'monthly')
            .reduce((sum, e) => sum + e.amount, 0);
          lines.push(`• Recurring expenses: ~$${monthlyRecurring.toLocaleString()}/month`);
        }
        lines.push('');

        // Emergency fund check
        const monthsOfExpenses =
          spending.totalSpending > 0
            ? Math.round((totalCash / spending.totalSpending) * 10) / 10
            : 0;

        let emergencyFundAssessment: string;
        if (monthsOfExpenses >= 6) {
          emergencyFundAssessment = `You have ${monthsOfExpenses} months of expenses in cash - great emergency fund!`;
        } else if (monthsOfExpenses >= 3) {
          emergencyFundAssessment = `You have ${monthsOfExpenses} months of expenses saved. Aim for 6 months if you can.`;
        } else if (monthsOfExpenses >= 1) {
          emergencyFundAssessment = `You have ${monthsOfExpenses} months of expenses saved. Building this up should be a priority.`;
        } else {
          emergencyFundAssessment =
            'Your emergency fund is low. Even saving $1,000 as a starter fund would help.';
        }
        lines.push(`**Emergency Fund:** ${emergencyFundAssessment}`);

        const elapsed = Date.now() - startTime;
        getLogger().info(
          {
            userId,
            netWorth,
            creditUtilization,
            monthsOfExpenses,
            elapsed,
          },
          '<<< TOOL: checkFinancialHealth COMPLETED'
        );

        return lines.join('\n');
      },
    }),
  };
}

export default createPlaidTools;
