/**
 * Store Interfaces for Dependency Injection
 *
 * ARCHITECTURE NOTE:
 * Only interfaces that have verified implementations are defined here.
 * Internal stores (ProductivityStore, LifeDataStore, etc.) use concrete
 * classes directly since they don't need abstraction for testing or swapping.
 *
 * For stores not listed here, import the concrete class directly:
 *   import { ProductivityStore } from '../stores/productivity-store.js';
 *
 * @module services/di/store-interfaces
 */

import type {
  UserProfile,
  ConversationSummary,
  KeyMoment,
  FinancialGoal,
} from '../../types/user-profile.js';

// Re-export VectorStoreContract as our IVectorStore
export type { VectorStoreContract as IVectorStore } from '../../memory/vector-store-interface.js';

// ============================================================================
// COMMON TYPES
// ============================================================================

/**
 * Query options for list/search operations
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search result with relevance score
 */
export interface SearchResult<T> {
  item: T;
  score: number;
  highlights?: string[];
}

// ============================================================================
// IMEMORYSTORE - Core user profile and conversation storage
// ============================================================================

/**
 * Memory store interface for user profiles and conversations.
 *
 * This interface matches the abstract MemoryStore class in memory/store.ts.
 *
 * Implementations:
 * - InMemoryStore (development/testing)
 * - FirestoreStore (production)
 * - PostgresStore (alternative production)
 */
export interface IMemoryStore {
  /** Check if store is initialized */
  readonly isInitialized: boolean;

  /** Initialize the store connection */
  initialize(): Promise<void>;

  /** Close connections and cleanup */
  close(): Promise<void>;

  // User Profile Operations
  getProfile(userId: string): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
  deleteProfile(userId: string): Promise<boolean>;
  hasProfile(userId: string): Promise<boolean>;
  listProfiles(options?: QueryOptions): Promise<UserProfile[]>;
  getOrCreateProfile(userId: string, name?: string): Promise<UserProfile>;

  // Conversation Summary Operations
  saveSummary(userId: string, summary: ConversationSummary): Promise<void>;
  getSummaries(userId: string, options?: QueryOptions): Promise<ConversationSummary[]>;
  getLatestSummary(userId: string): Promise<ConversationSummary | null>;

  // Key Moment Operations
  addKeyMoment(userId: string, moment: KeyMoment): Promise<void>;
  getKeyMoments(userId: string, options?: QueryOptions): Promise<KeyMoment[]>;
  getPendingFollowUps(userId: string): Promise<KeyMoment[]>;

  // Goal Operations
  saveGoal(userId: string, goal: FinancialGoal): Promise<void>;
  getGoals(userId: string): Promise<FinancialGoal[]>;
  deleteGoal(userId: string, goalId: string): Promise<boolean>;

  // Search Operations
  searchSummaries(
    userId: string,
    query: string,
    options?: QueryOptions
  ): Promise<Array<SearchResult<ConversationSummary>>>;

  // Bulk Operations
  exportUserData(userId: string): Promise<{
    profile: UserProfile | null;
    summaries: ConversationSummary[];
    keyMoments: KeyMoment[];
  }>;
  importUserData(
    userId: string,
    data: {
      profile?: UserProfile;
      summaries?: ConversationSummary[];
      keyMoments?: KeyMoment[];
    }
  ): Promise<void>;
}

// ============================================================================
// IREDISCACHE - Redis caching layer
// ============================================================================

/**
 * Redis cache interface for session and ephemeral data.
 *
 * NOTE: The implementation in memory/redis-cache.ts has many more methods
 * than this minimal interface. This interface captures the core contract
 * that most consumers need. For advanced features, use the concrete class.
 */
export interface IRedisCache {
  /** Initialize connection */
  initialize(): Promise<void>;

  /** Check if connected (NOTE: implementation is a method, not property) */
  isConnected(): boolean;

  // Generic cache operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;

  // Session operations
  setSession(sessionId: string, data: Record<string, unknown>, ttlSeconds?: number): Promise<void>;
  getSession(sessionId: string): Promise<Record<string, unknown> | null>;
  deleteSession(sessionId: string): Promise<boolean>;

  // Lifecycle
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for IMemoryStore
 */
export function isMemoryStore(obj: unknown): obj is IMemoryStore {
  if (!obj || typeof obj !== 'object') return false;
  const store = obj as Record<string, unknown>;
  return (
    typeof store.initialize === 'function' &&
    typeof store.getProfile === 'function' &&
    typeof store.saveProfile === 'function'
  );
}

/**
 * Type guard for IRedisCache
 */
export function isRedisCache(obj: unknown): obj is IRedisCache {
  if (!obj || typeof obj !== 'object') return false;
  const cache = obj as Record<string, unknown>;
  return (
    typeof cache.initialize === 'function' &&
    typeof cache.get === 'function' &&
    typeof cache.set === 'function' &&
    typeof cache.ping === 'function'
  );
}

// ============================================================================
// NOTES ON OTHER STORES
// ============================================================================
/*
 * The following stores do NOT have interfaces defined here because:
 * 1. They are internal implementation details, not external contracts
 * 2. Their APIs are complex and still evolving
 * 3. Tests can mock them directly using the concrete class types
 *
 * To use these stores:
 *   import { getProductivityStore } from '../stores/productivity-store.js';
 *   import { getLifeDataStore } from '../stores/life-data-store.js';
 *   import { getEngagementStore } from '../engagement/engagement-store.js';
 *
 * For DI, register factories that return the concrete types:
 *   container.registerSingleton(Tokens.ProductivityStore, async () => {
 *     const { initializeProductivityStore } = await import('../stores/productivity-store.js');
 *     return initializeProductivityStore();
 *   });
 */
