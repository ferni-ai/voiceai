/**
 * Banking Service (Plaid Integration)
 *
 * Manages secure banking connections via Plaid:
 * - Account linking via Plaid Link
 * - Transaction fetching
 * - Balance monitoring
 * - Financial insights for Peter (The Quant)
 *
 * Philosophy: Give Ferni "superhuman financial awareness" to help
 * users understand their spending patterns and financial health.
 *
 * PRIVACY: All data stays on-device or in user's encrypted storage.
 * Ferni never shares financial data externally.
 */

import { createLogger } from '../utils/logger.js';
import { apiDelete, apiGet, apiPost } from '../utils/api.js';

const log = createLogger('BankingService');

/** Backend routes live in src/api/v1/integrations/handler.ts */
const BANKING_API = '/api/v1/integrations/banking';

// ============================================================================
// TYPES
// ============================================================================

export interface BankingStatus {
  connected: boolean;
  institution: string | null;
  institutionLogo: string | null;
  lastSync: string | null;
  accountCount: number;
  error?: string;
}

export interface BankAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'other';
  mask: string; // Last 4 digits
  currentBalance: number;
  availableBalance?: number;
  currency: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  date: string;
  name: string;
  merchantName?: string;
  category: string[];
  pending: boolean;
}

export interface SpendingInsights {
  totalSpending: number;
  topCategories: Array<{
    category: string;
    amount: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  /** Not computed by the backend yet */
  savingsRate: number | null;
  unusualActivity: Array<{
    description: string;
    amount: number;
    type: 'large_purchase' | 'recurring_change' | 'new_merchant';
  }>;
}

// ============================================================================
// PLAID LINK CONFIGURATION
// ============================================================================

interface PlaidLinkOptions {
  token: string;
  onSuccess: (publicToken: string, metadata: unknown) => void;
  onExit: (err: unknown, metadata: unknown) => void;
  onEvent?: (eventName: string, metadata: unknown) => void;
}

interface PlaidLinkHandler {
  open: () => void;
  exit: (options?: { force?: boolean }) => void;
  destroy: () => void;
}

// Declare Plaid global
declare global {
  interface Window {
    Plaid?: {
      create: (options: PlaidLinkOptions) => PlaidLinkHandler;
    };
  }
}

// ============================================================================
// STATE
// ============================================================================

let currentStatus: BankingStatus = {
  connected: false,
  institution: null,
  institutionLogo: null,
  lastSync: null,
  accountCount: 0,
};

let plaidLinkHandler: PlaidLinkHandler | null = null;
let plaidScriptLoaded = false;

const statusListeners: Set<(status: BankingStatus) => void> = new Set();

// ============================================================================
// PLAID SCRIPT LOADING
// ============================================================================

/**
 * Load Plaid Link SDK
 */
async function loadPlaidScript(): Promise<void> {
  if (plaidScriptLoaded) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    script.onload = () => {
      plaidScriptLoaded = true;
      log.info('Plaid Link SDK loaded');
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Plaid SDK'));
    };
    document.head.appendChild(script);
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize banking service and check current connection status
 */
export async function initBanking(): Promise<BankingStatus> {
  try {
    const response = await apiGet<{
      connected: boolean;
      institution: string | null;
      linkedAt: string | null;
    }>(`${BANKING_API}/status`);
    if (response.ok && response.data) {
      currentStatus = {
        ...currentStatus,
        connected: response.data.connected,
        institution: response.data.institution,
        lastSync: response.data.linkedAt,
      };
      notifyListeners();
    }
  } catch (error) {
    log.debug('Failed to fetch banking status:', String(error));
  }

  return currentStatus;
}

/**
 * Get current banking connection status
 */
export function getBankingStatus(): BankingStatus {
  return { ...currentStatus };
}

/**
 * Connect to bank via Plaid Link
 */
export async function connectBanking(userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Load Plaid SDK if needed
    await loadPlaidScript();

    if (!window.Plaid) {
      return { success: false, error: 'Plaid SDK not available' };
    }

    // Get link token from backend
    // Backend derives the user from the verified auth token
    log.debug('Requesting Plaid link token', { userId });
    const tokenResponse = await apiPost<{ linkToken: string }>(`${BANKING_API}/link-token`, {});

    if (!tokenResponse.ok || !tokenResponse.data) {
      return { success: false, error: 'Failed to get link token' };
    }

    // Open Plaid Link
    return new Promise((resolve) => {
      plaidLinkHandler = window.Plaid!.create({
        token: tokenResponse.data!.linkToken,
        onSuccess: async (publicToken, metadata) => {
          log.info('Plaid Link success', { metadata });

          // Exchange public token for access token
          const meta = (metadata ?? {}) as {
            institution?: { institution_id?: string; name?: string } | null;
            accounts?: unknown[];
          };
          const exchangeResponse = await apiPost<{
            success: boolean;
            institution: string;
          }>(`${BANKING_API}/exchange-token`, {
            publicToken,
            institution: meta.institution ?? undefined,
          });

          if (exchangeResponse.ok && exchangeResponse.data?.success) {
            currentStatus = {
              connected: true,
              institution: exchangeResponse.data.institution,
              institutionLogo: null, // Would come from Plaid
              lastSync: new Date().toISOString(),
              accountCount: meta.accounts?.length ?? 0,
            };
            notifyListeners();
            resolve({ success: true });
          } else {
            resolve({ success: false, error: 'Failed to exchange token' });
          }
        },
        onExit: (err, metadata) => {
          log.info('Plaid Link exit', { err, metadata });
          if (err) {
            resolve({ success: false, error: 'Connection cancelled' });
          } else {
            resolve({ success: false, error: 'User cancelled' });
          }
        },
        onEvent: (eventName, metadata) => {
          log.debug('Plaid Link event', { eventName, metadata });
        },
      });

      plaidLinkHandler.open();
    });
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Disconnect from banking
 */
export async function disconnectBanking(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const response = await apiDelete<{ success: boolean }>(`${BANKING_API}/disconnect`);

    if (response.ok && response.data?.success) {
      currentStatus = {
        connected: false,
        institution: null,
        institutionLogo: null,
        lastSync: null,
        accountCount: 0,
      };
      notifyListeners();
      return { success: true };
    }

    return { success: false, error: 'Failed to disconnect' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get linked bank accounts
 */
export async function getAccounts(): Promise<BankAccount[]> {
  if (!currentStatus.connected) {
    return [];
  }

  try {
    const response = await apiGet<{
      accounts: Array<{
        accountId: string;
        name: string;
        type: string;
        subtype?: string | null;
        mask: string | null;
        balances: {
          current: number | null;
          available: number | null;
          iso_currency_code?: string | null;
        };
      }>;
    }>(`${BANKING_API}/balances`);
    if (response.ok && response.data) {
      const knownTypes: BankAccount['type'][] = ['checking', 'savings', 'credit', 'investment'];
      return response.data.accounts.map((a) => ({
        id: a.accountId,
        name: a.name,
        // Plaid reports checking/savings as type 'depository' with a subtype
        type: [a.subtype, a.type].find((t): t is BankAccount['type'] =>
          knownTypes.includes(t as BankAccount['type'])
        ) ?? 'other',
        mask: a.mask ?? '',
        currentBalance: a.balances.current ?? 0,
        availableBalance: a.balances.available ?? undefined,
        currency: a.balances.iso_currency_code ?? 'USD',
      }));
    }
  } catch (error) {
    log.error('Failed to fetch accounts:', String(error));
  }

  return [];
}

/**
 * Get recent transactions
 */
export async function getTransactions(options?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<Transaction[]> {
  if (!currentStatus.connected) {
    return [];
  }

  try {
    // Backend supports a lookback window in days (ending today) plus a limit
    const params: Record<string, string> = {};
    if (options?.startDate) {
      const days = Math.ceil((Date.now() - new Date(options.startDate).getTime()) / 86_400_000);
      if (Number.isFinite(days) && days > 0) params.days = String(days);
    }
    if (options?.limit) params.limit = String(options.limit);

    const response = await apiGet<{
      transactions: Array<{
        id: string;
        date: string;
        name: string;
        merchantName?: string | null;
        amount: number;
        category?: string[] | null;
        pending: boolean;
      }>;
    }>(`${BANKING_API}/transactions`, params);
    if (response.ok && response.data) {
      return response.data.transactions
        .filter((t) => !options?.endDate || t.date <= options.endDate)
        .map((t) => ({
          id: t.id,
          accountId: '', // Not returned by the backend
          amount: t.amount,
          currency: 'USD',
          date: t.date,
          name: t.name,
          merchantName: t.merchantName ?? undefined,
          category: t.category ?? [],
          pending: t.pending,
        }));
    }
  } catch (error) {
    log.error('Failed to fetch transactions:', String(error));
  }

  return [];
}

/**
 * Get spending insights
 */
export async function getSpendingInsights(options?: {
  period?: 'week' | 'month' | 'quarter';
}): Promise<SpendingInsights | null> {
  if (!currentStatus.connected) {
    return null;
  }

  try {
    const response = await apiGet<{
      totalSpending: number;
      byCategory: Record<string, { total: number; count: number }>;
    }>(`${BANKING_API}/spending-analysis`, { period: options?.period ?? 'month' });
    if (response.ok && response.data) {
      const { totalSpending, byCategory } = response.data;
      const topCategories = Object.entries(byCategory ?? {})
        .map(([category, c]) => ({
          category,
          amount: c.total,
          percentage: totalSpending > 0 ? Math.round((c.total / totalSpending) * 100) : 0,
          // Backend doesn't compare periods yet, so no trend is claimed
          trend: 'stable' as const,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      return { totalSpending, topCategories, savingsRate: null, unusualActivity: [] };
    }
  } catch (error) {
    log.error('Failed to fetch spending insights:', String(error));
  }

  return null;
}

/**
 * Refresh banking status.
 *
 * The backend has no explicit sync endpoint: transactions and balances are
 * fetched live from Plaid on every request, so "sync" just refreshes status.
 */
export async function syncBanking(): Promise<{
  success: boolean;
  newTransactions?: number;
  error?: string;
}> {
  if (!currentStatus.connected) {
    return { success: false, error: 'Not connected' };
  }

  const status = await initBanking();
  return status.connected ? { success: true } : { success: false, error: 'Not connected' };
}

/**
 * Subscribe to banking status changes
 */
export function onBankingStatusChange(
  callback: (status: BankingStatus) => void
): () => void {
  statusListeners.add(callback);
  return () => statusListeners.delete(callback);
}

// ============================================================================
// HELPERS
// ============================================================================

function notifyListeners(): void {
  for (const listener of statusListeners) {
    try {
      listener({ ...currentStatus });
    } catch (error) {
      log.error('Status listener error:', String(error));
    }
  }
}

/**
 * Cleanup Plaid Link handler
 */
export function cleanup(): void {
  if (plaidLinkHandler) {
    plaidLinkHandler.destroy();
    plaidLinkHandler = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const bankingService = {
  init: initBanking,
  getStatus: getBankingStatus,
  connect: connectBanking,
  disconnect: disconnectBanking,
  getAccounts,
  getTransactions,
  getInsights: getSpendingInsights,
  sync: syncBanking,
  onStatusChange: onBankingStatusChange,
  cleanup,
};

export default bankingService;
