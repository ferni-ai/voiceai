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
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from './utils/tool-descriptions.js';
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
 * Make authenticated Plaid API request with retry logic
 */
async function plaidRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    getLogger().warn('Plaid credentials not configured');
    return null;
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
          const error = (await response.json()) as { error_message?: string; error_code?: string };

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
          return null;
        }

        return (await response.json()) as T;
      },
      { maxRetries: 3, baseDelayMs: 500 }
    );
  } catch (error) {
    getLogger().error({ endpoint, error }, 'Plaid request failed after retries');
    return null;
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

  if (!result) {
    return "I'd love to help you link your bank account, but my connection service isn't set up yet. Ask the team to configure Plaid!";
  }

  return result.link_token;
}

/**
 * Exchange public token for access token after user links account
 * The public token comes from Plaid Link UI callback
 */
export async function exchangePublicToken(publicToken: string): Promise<string | null> {
  const result = await plaidRequest<{ access_token: string; item_id: string }>(
    '/item/public_token/exchange',
    {
      public_token: publicToken,
    }
  );

  return result?.access_token || null;
}

/**
 * Get account balances
 */
export async function getAccountBalances(accessToken: string): Promise<PlaidAccount[]> {
  const result = await plaidRequest<PlaidBalanceResponse>('/accounts/balance/get', {
    access_token: accessToken,
  });

  return result?.accounts || [];
}

/**
 * Get transactions for a date range
 */
export async function getTransactions(
  accessToken: string,
  startDate: string,
  endDate: string,
  count = 100
): Promise<PlaidTransaction[]> {
  const result = await plaidRequest<PlaidTransactionsResponse>('/transactions/get', {
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
    options: {
      count,
      offset: 0,
    },
  });

  return result?.transactions || [];
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
// Uses file-based storage shared between server and agent
// ============================================================================

import {
  storeAccessToken,
  getStoredAccessToken,
  hasLinkedAccounts,
  getTokenData,
  removeAccessToken,
} from './plaid-store.js';

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

export function createPlaidTools() {
  return {
    checkBankLinkStatus: llm.tool({
      description: getToolDescription('checkBankLinkStatus'),
      parameters: z.object({
        userId: z.string().describe('Unique identifier for the user'),
      }),
      execute: async ({ userId }) => {
        const hasAccounts = hasLinkedAccounts(userId);
        const tokenData = getTokenData(userId);
        getLogger().info(
          { userId, hasAccounts, institution: tokenData?.institution?.name },
          'Checking bank link status'
        );

        if (hasAccounts && tokenData) {
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
        userId: z.string().describe('Unique identifier for the user'),
        confirm: z.boolean().describe('User has confirmed they want to unlink'),
      }),
      execute: async ({ userId, confirm }) => {
        if (!confirm) {
          return 'Just to confirm - you want me to disconnect your bank account? This will remove my access to your balances and transactions. Say yes to confirm.';
        }

        const tokenData = getTokenData(userId);
        if (!tokenData) {
          return "You don't have a bank account linked, so there's nothing to disconnect.";
        }

        const institutionName = tokenData.institution?.name || 'your bank';
        const removed = removeAccessToken(userId);

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
        userId: z.string().describe('Unique identifier for the user'),
        deliveryMethod: z.enum(['sms', 'email']).describe('How to send the secure link'),
        contact: z.string().describe('Phone number (for SMS) or email address'),
      }),
      execute: async ({ userId, deliveryMethod, contact }) => {
        const startTime = Date.now();
        getLogger().info({ userId, deliveryMethod }, '>>> TOOL: linkBankAccount STARTED');

        if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
          return "I'd love to help you link your bank account, but my account linking service isn't configured yet. For now, I can help with general financial guidance based on what you tell me!";
        }

        const linkToken = await createLinkToken(userId);

        if (linkToken.startsWith("I'd love to")) {
          return linkToken; // Error message
        }

        // Generate the secure link URL (configured via PLAID_LINK_BASE_URL in .env)
        const PLAID_LINK_BASE_URL = process.env.PLAID_LINK_BASE_URL || '';
        const secureLink = `${PLAID_LINK_BASE_URL}?token=${linkToken}&user=${userId}`;

        // Send via chosen method
        let sendResult: string;
        if (deliveryMethod === 'sms') {
          // Import would happen at top - using inline fetch for SMS here
          const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
          const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
          const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

          if (!TWILIO_ACCOUNT_SID) {
            return "I'd send you the link via text, but my SMS service isn't set up. Could you give me an email address instead?";
          }

          const formattedTo = contact.startsWith('+') ? contact : `+1${contact.replace(/\D/g, '')}`;

          try {
            const response = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${Buffer.from(
                    `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
                  ).toString('base64')}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  To: formattedTo,
                  From: TWILIO_PHONE_NUMBER,
                  Body: `Jack here! Tap this secure link to connect your bank account: ${secureLink}\n\nThis uses Plaid - the same security used by major financial apps. Your bank login is never shared with me.`,
                }),
                signal: AbortSignal.timeout(10000),
              }
            );
            sendResult = response.ok ? 'sent' : 'failed';
          } catch (error) {
            getLogger().error({ error }, 'Failed to send Twilio SMS notification');
            sendResult = 'failed';
          }
        } else {
          // Email via SendGrid
          const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';

          if (!SENDGRID_API_KEY) {
            return "I'd send you the link via email, but my email service isn't set up. Could you give me a phone number for a text instead?";
          }

          try {
            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                personalizations: [{ to: [{ email: contact }] }],
                from: {
                  email: process.env.SENDGRID_FROM_EMAIL || '',
                  name: process.env.SENDGRID_FROM_NAME || 'Ferni',
                },
                subject: '🔐 Securely Link Your Bank Account',
                content: [
                  {
                    type: 'text/html',
                    value: `
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
                    </div>
                  `,
                  },
                ],
              }),
              signal: AbortSignal.timeout(10000),
            });
            sendResult = response.ok || response.status === 202 ? 'sent' : 'failed';
          } catch (error) {
            getLogger().error({ error }, 'Failed to send SendGrid email notification');
            sendResult = 'failed';
          }
        }

        const elapsed = Date.now() - startTime;
        getLogger().info(
          { userId, deliveryMethod, sendResult, elapsed },
          '<<< TOOL: linkBankAccount COMPLETED'
        );

        if (sendResult === 'sent') {
          const contactDesc = deliveryMethod === 'sms' ? `your phone at ${contact}` : contact;
          return `Done! I've sent a secure link to ${contactDesc}. Just tap it to connect your bank - takes about 30 seconds. Once you're done, let me know and I can show you your balances and help analyze your spending. The link uses Plaid, the same security service used by Venmo, Acorns, and thousands of other apps - your bank password is never shared with me.`;
        } else {
          return `I had trouble sending that ${deliveryMethod === 'sms' ? 'text' : 'email'}. Could you double-check that ${contact} is correct?`;
        }
      },
    }),

    getAccountBalances: llm.tool({
      description: getToolDescription('getAccountBalances'),
      parameters: z.object({
        userId: z.string().describe('Unique identifier for the user'),
      }),
      execute: async ({ userId }) => {
        const startTime = Date.now();
        getLogger().info({ userId }, '>>> TOOL: getAccountBalances STARTED');

        const accessToken = getStoredAccessToken(userId);
        if (!accessToken) {
          return "You haven't linked a bank account yet. Would you like to connect one? It only takes a minute, and it'll let me give you much more personalized advice based on your actual financial picture.";
        }

        const accounts = await getAccountBalances(accessToken);

        if (accounts.length === 0) {
          return "I couldn't retrieve your account balances right now. This sometimes happens if the connection needs to be refreshed. Want me to help you reconnect your account?";
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
        userId: z.string().describe('Unique identifier for the user'),
        period: z
          .enum(['week', 'month', 'quarter'])
          .optional()
          .describe('Time period to analyze (default: month)'),
      }),
      execute: async ({ userId, period = 'month' }) => {
        const startTime = Date.now();
        getLogger().info({ userId, period }, '>>> TOOL: getSpendingAnalysis STARTED');

        const accessToken = getStoredAccessToken(userId);
        if (!accessToken) {
          return "You haven't linked a bank account yet. Once you do, I can show you exactly where your money is going and help you find ways to save. Want to link an account?";
        }

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        if (period === 'week') {
          startDate.setDate(startDate.getDate() - 7);
        } else if (period === 'month') {
          startDate.setMonth(startDate.getMonth() - 1);
        } else {
          startDate.setMonth(startDate.getMonth() - 3);
        }

        const transactions = await getTransactions(
          accessToken,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          250
        );

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
        userId: z.string().describe('Unique identifier for the user'),
        merchantFilter: z.string().optional().describe('Filter by merchant name'),
        categoryFilter: z.string().optional().describe('Filter by category'),
        limit: z.number().optional().describe('Number of transactions to show (default: 10)'),
      }),
      execute: async ({ userId, merchantFilter, categoryFilter, limit = 10 }) => {
        const startTime = Date.now();
        getLogger().info(
          { userId, merchantFilter, categoryFilter, limit },
          '>>> TOOL: getRecentTransactions STARTED'
        );

        const accessToken = getStoredAccessToken(userId);
        if (!accessToken) {
          return "You'll need to link a bank account first to see your transactions. Want to set that up?";
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);

        let transactions = await getTransactions(
          accessToken,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          100
        );

        // Apply filters
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
      parameters: z.object({
        userId: z.string().describe('Unique identifier for the user'),
      }),
      execute: async ({ userId }) => {
        const startTime = Date.now();
        getLogger().info({ userId }, '>>> TOOL: checkFinancialHealth STARTED');

        const accessToken = getStoredAccessToken(userId);
        if (!accessToken) {
          return "To give you a real financial health checkup, I'd need to see your accounts. Want to link your bank? It's secure and takes just a minute.";
        }

        // Get balances
        const accounts = await getAccountBalances(accessToken);

        // Get recent transactions for spending analysis
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);

        const transactions = await getTransactions(
          accessToken,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          250
        );

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

        const spending = analyzeSpending(transactions);
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

        // Monthly spending
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
