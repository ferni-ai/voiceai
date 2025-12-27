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
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('BankingService');

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
  savingsRate: number;
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
    const response = await apiGet<{ status: BankingStatus }>('/api/banking/status');
    if (response.ok && response.data) {
      currentStatus = response.data.status;
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
    const tokenResponse = await apiPost<{ linkToken: string }>(
      '/api/banking/create-link-token',
      { userId }
    );

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
          const exchangeResponse = await apiPost<{
            success: boolean;
            institution: string;
            accountCount: number;
          }>('/api/banking/exchange-token', {
            publicToken,
            userId,
          });

          if (exchangeResponse.ok && exchangeResponse.data?.success) {
            currentStatus = {
              connected: true,
              institution: exchangeResponse.data.institution,
              institutionLogo: null, // Would come from Plaid
              lastSync: new Date().toISOString(),
              accountCount: exchangeResponse.data.accountCount,
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
    const response = await apiPost<{ success: boolean }>(
      '/api/banking/disconnect',
      {}
    );

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
    const response = await apiGet<{ accounts: BankAccount[] }>(
      '/api/banking/accounts'
    );
    if (response.ok && response.data) {
      return response.data.accounts;
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
  accountId?: string;
  limit?: number;
}): Promise<Transaction[]> {
  if (!currentStatus.connected) {
    return [];
  }

  try {
    const params = new URLSearchParams();
    if (options?.startDate) params.set('startDate', options.startDate);
    if (options?.endDate) params.set('endDate', options.endDate);
    if (options?.accountId) params.set('accountId', options.accountId);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await apiGet<{ transactions: Transaction[] }>(
      `/api/banking/transactions?${params}`
    );
    if (response.ok && response.data) {
      return response.data.transactions;
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
  startDate?: string;
  endDate?: string;
}): Promise<SpendingInsights | null> {
  if (!currentStatus.connected) {
    return null;
  }

  try {
    const params = new URLSearchParams();
    if (options?.startDate) params.set('startDate', options.startDate);
    if (options?.endDate) params.set('endDate', options.endDate);

    const response = await apiGet<{ insights: SpendingInsights }>(
      `/api/banking/insights?${params}`
    );
    if (response.ok && response.data) {
      return response.data.insights;
    }
  } catch (error) {
    log.error('Failed to fetch spending insights:', String(error));
  }

  return null;
}

/**
 * Sync latest transactions from bank
 */
export async function syncBanking(): Promise<{
  success: boolean;
  newTransactions?: number;
  error?: string;
}> {
  if (!currentStatus.connected) {
    return { success: false, error: 'Not connected' };
  }

  try {
    const response = await apiPost<{
      success: boolean;
      newTransactions: number;
      lastSync: string;
    }>('/api/banking/sync', {});

    if (response.ok && response.data?.success) {
      currentStatus.lastSync = response.data.lastSync;
      notifyListeners();
      return {
        success: true,
        newTransactions: response.data.newTransactions,
      };
    }

    return { success: false, error: 'Sync failed' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
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
