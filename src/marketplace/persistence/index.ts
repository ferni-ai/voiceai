/**
 * Marketplace Persistence
 *
 * Exports the storage abstraction for marketplace data.
 *
 * Module Structure:
 * - firestore.ts: Firestore implementation + factory
 * - in-memory.ts: In-memory implementation for dev/testing
 */

export {
  createInMemoryStore,
  getMarketplaceStore,
  resetMarketplaceStore,
  type MarketplaceStore,
} from './firestore.js';

export { InMemoryMarketplaceStore } from './in-memory.js';
