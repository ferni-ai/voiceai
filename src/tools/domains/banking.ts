/**
 * Banking Domain Tools
 *
 * Barrel export for banking integration (Plaid):
 * - Account linking
 * - Balance checking
 * - Transaction history
 */

export { createPlaidTools } from '../plaid.js';
export {
  storeAccessToken,
  getStoredAccessToken,
  hasLinkedAccounts,
  getTokenData,
  removeAccessToken,
} from '../plaid-store.js';
