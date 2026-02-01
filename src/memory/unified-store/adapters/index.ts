/**
 * Unified Memory Store Adapters
 *
 * Re-exports all adapter implementations for the unified memory store.
 *
 * @module memory/unified-store/adapters
 */

export {
  FirestoreAdapter,
  getFirestoreAdapter,
  resetFirestoreAdapter,
} from './firestore-adapter.js';

export {
  VectorAdapter,
  getVectorAdapter,
  resetVectorAdapter,
} from './vector-adapter.js';

export {
  RedisAdapter,
  getRedisAdapter,
  resetRedisAdapter,
} from './redis-adapter.js';

export {
  MemoryAdapter,
  getMemoryAdapter,
  resetMemoryAdapter,
} from './memory-adapter.js';

export {
  SpannerAdapter,
  getSpannerAdapter,
  resetSpannerAdapter,
  type SpannerAdapterConfig,
  type GraphQuery,
  type GraphMemoryResult,
} from './spanner-adapter.js';
