/**
 * Marketplace Persistence
 *
 * Exports the storage abstraction for marketplace data.
 */

export {
  getMarketplaceStore,
  resetMarketplaceStore,
  createInMemoryStore,
  type MarketplaceStore,
} from './firestore.js';
