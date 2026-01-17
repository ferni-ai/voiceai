/**
 * Finance Facade
 *
 * Re-exports finance-related functions from the finance domain
 * for use by context builders and other layers.
 */

// Re-export Plaid account check
export { hasLinkedAccounts } from '../domains/finance/plaid-store.js';

// Re-export Plaid API functions
export {
  createLinkToken,
  exchangePublicToken,
  getAccountBalances,
  getTransactions,
  analyzeSpending,
  formatBalancesForSpeech,
  formatSpendingForSpeech,
} from '../domains/finance/plaid.js';
