/**
 * Memory System Initialization (Clean Architecture)
 *
 * Handles all memory system initialization, health checks, and shutdown.
 * Extracted from index.ts for cleaner separation of concerns.
 *
 * Usage:
 * ```typescript
 * import {
 *   initializeMemory,
 *   getHealth,
 *   shutdown,
 * } from './memory/init/index.js';
 *
 * // At startup
 * const system = await initializeMemory({ enableRedis: true });
 *
 * // Health check
 * const health = await getHealth();
 *
 * // At shutdown
 * await shutdown();
 * ```
 *
 * @module memory/init
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryInit' });

// ============================================================================
// TYPES
// ============================================================================

export interface InitConfig {
  /** Enable Redis cache (default: true if available) */
  enableRedis?: boolean;
  /** Force a specific store type */
  storeType?: 'firestore' | 'postgres' | 'memory';
  /** Use persistent vector storage (default: true for production) */
  usePersistentVectors?: boolean;
  /** Skip blocking initialization for lazy loading */
  lazyInit?: boolean;
  /** Index persona content on startup */
  indexPersona?: boolean;
}

export type StoreType = 'firestore' | 'postgres' | 'memory';

export interface MemorySystem {
  store: import('../store.js').MemoryStore;
  vectorStore: unknown;
  redisCache: unknown;
  storeType: StoreType;
  usePersistentVectors: boolean;
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  initialized: boolean;
  stores: {
    primary: { healthy: boolean; type: StoreType; details?: string };
    vector: { healthy: boolean; usingFallback: boolean; cacheSize: number; details?: string };
    redis: { enabled: boolean; healthy: boolean; details?: string };
  };
  embedding: {
    provider: string;
    dimensions: number;
    dimensionMatch: boolean;
  };
}

// ============================================================================
// STATE
// ============================================================================

let cachedSystem: MemorySystem | null = null;
let initPromise: Promise<MemorySystem> | null = null;
let redisEnabled = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the memory system.
 *
 * This is idempotent - calling multiple times returns the cached system.
 * Use `shutdown()` to reset and re-initialize.
 */
export async function initializeMemory(config?: InitConfig): Promise<MemorySystem> {
  // Return cached system if already initialized
  if (cachedSystem) {
    return cachedSystem;
  }

  // Wait for in-progress initialization
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = doInitialize(config);

  try {
    cachedSystem = await initPromise;
    return cachedSystem;
  } finally {
    initPromise = null;
  }
}

async function doInitialize(config?: InitConfig): Promise<MemorySystem> {
  log.info('Initializing memory system...');

  // Delegate to existing initialization logic in index.ts
  const { initializeMemorySystem } = await import('../index.js');
  const result = await initializeMemorySystem(config);

  redisEnabled = !!result.redisCache;

  log.info(
    {
      storeType: result.storeType,
      vectors: result.usePersistentVectors ? 'persistent' : 'ephemeral',
      redis: redisEnabled,
    },
    'Memory system initialized'
  );

  return result;
}

/**
 * Check if memory system is initialized
 */
export function isInitialized(): boolean {
  return cachedSystem !== null;
}

/**
 * Get the current memory system (throws if not initialized)
 */
export function getSystem(): MemorySystem {
  if (!cachedSystem) {
    throw new Error('Memory system not initialized. Call initializeMemory() first.');
  }
  return cachedSystem;
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Get unified health status of all memory components
 */
export async function getHealth(): Promise<HealthStatus> {
  const { getMemorySystemHealth } = await import('../index.js');
  return getMemorySystemHealth();
}

/**
 * Quick health check (returns true if healthy or degraded)
 */
export async function isHealthy(): Promise<boolean> {
  const health = await getHealth();
  return health.overall !== 'unhealthy';
}

/**
 * Get store health
 */
export async function getStoreHealth(): Promise<{
  type: StoreType;
  healthy: boolean;
}> {
  const health = await getHealth();
  return {
    type: health.stores.primary.type,
    healthy: health.stores.primary.healthy,
  };
}

/**
 * Get vector store health
 */
export async function getVectorHealth(): Promise<{
  healthy: boolean;
  usingFallback: boolean;
  cacheSize: number;
}> {
  const health = await getHealth();
  return {
    healthy: health.stores.vector.healthy,
    usingFallback: health.stores.vector.usingFallback,
    cacheSize: health.stores.vector.cacheSize,
  };
}

/**
 * Get Redis cache health
 */
export function getRedisHealth(): { enabled: boolean; healthy: boolean } {
  return {
    enabled: redisEnabled,
    healthy: redisEnabled, // Assume healthy if enabled
  };
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Gracefully shutdown the memory system.
 *
 * Closes all connections and clears cached state.
 * After shutdown, `initializeMemory()` must be called again.
 */
export async function shutdown(): Promise<void> {
  if (!cachedSystem) {
    log.debug('Memory system not initialized, nothing to shutdown');
    return;
  }

  log.info('Shutting down memory system...');

  const { shutdownMemorySystem } = await import('../index.js');
  await shutdownMemorySystem();

  cachedSystem = null;
  initPromise = null;
  redisEnabled = false;

  log.info('Memory system shut down');
}

// ============================================================================
// STORE TYPE DETECTION
// ============================================================================

/**
 * Detect which store type should be used based on environment
 */
export function detectStoreType(): StoreType {
  // Check environment variables
  if (process.env.USE_FIRESTORE === 'true' || process.env.GOOGLE_CLOUD_PROJECT) {
    return 'firestore';
  }
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    return 'postgres';
  }
  return 'memory';
}

/**
 * Check if Redis should be used
 */
export function shouldUseRedis(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Check if persistent vectors should be used
 */
export function shouldUsePersistentVectors(): boolean {
  // Use persistent vectors in production or when explicitly enabled
  const env = process.env.NODE_ENV;
  return env === 'production' || process.env.USE_PERSISTENT_VECTORS === 'true';
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export type { MemoryStore } from '../store.js';
