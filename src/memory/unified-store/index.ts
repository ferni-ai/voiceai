/**
 * Unified Memory Store
 *
 * Single interface for all memory operations across Firestore, Vector, Redis,
 * and In-Memory stores. Part of the Superhuman Memory implementation.
 *
 * @example
 * ```typescript
 * import { getUnifiedStore } from './memory/unified-store';
 *
 * const store = getUnifiedStore();
 * await store.initialize();
 *
 * // Store a memory
 * const memory = await store.store({
 *   userId: 'user123',
 *   type: 'entity',
 *   content: 'User mentioned loving hiking',
 * });
 *
 * // Recall memories
 * const result = await store.recall({
 *   userId: 'user123',
 *   query: 'outdoor activities',
 * });
 * ```
 *
 * @module memory/unified-store
 */

// Main exports
export { getUnifiedStore, resetUnifiedStore, UnifiedMemoryStoreFacade } from './facade.js';

// Types
export type {
  // Core types
  UnifiedMemoryStore,
  UnifiedStoreConfig,
  UnifiedStoreHealth,
  StoredMemory,
  MemoryInput,
  MemoryType,

  // Query types
  RecallQuery,
  RecallResult,
  SearchParams,
  SearchResult,
  ScoredMemory,

  // Graph types
  MemoryLink,
  MemoryLinkInput,
  MemoryLinkType,

  // Lifecycle types
  ConsolidationReport,
  DecayReport,

  // Health types
  StoreHealth,

  // Adapter types
  MemoryStoreAdapter,
  VectorStoreAdapter,
  CacheStoreAdapter,
} from './types.js';

// Config
export { DEFAULT_CONFIG } from './types.js';

// Adapters (for advanced use cases)
export {
  FirestoreAdapter,
  getFirestoreAdapter,
  VectorAdapter,
  getVectorAdapter,
  RedisAdapter,
  getRedisAdapter,
  MemoryAdapter,
  getMemoryAdapter,
} from './adapters/index.js';
