/**
 * Trigger Embedding Cache
 *
 * Persistent cache for trigger embeddings using Firestore.
 * Reduces API calls and startup time by caching embeddings
 * that rarely change.
 *
 * Philosophy: Triggers are defined in persona behavior JSONs and
 * change infrequently. Cache aggressively with long TTLs.
 *
 * @module TriggerEmbeddingCache
 */

import { createHash } from 'crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  CachedTriggerEmbedding,
  TriggerEmbeddingCacheConfig,
  EmbeddedTrigger,
} from './types.js';

const log = createLogger({ module: 'TriggerEmbeddingCache' });

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: TriggerEmbeddingCacheConfig = {
  maxSize: 1000,
  ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  persistToFirestore: true,
  firestoreCollection: 'trigger_embeddings',
};

// ============================================================================
// TRIGGER EMBEDDING CACHE
// ============================================================================

/**
 * Cache for trigger embeddings with Firestore persistence
 */
export class TriggerEmbeddingCache {
  private memoryCache = new Map<string, CachedTriggerEmbedding>();
  private config: TriggerEmbeddingCacheConfig;
  private firestoreDb: FirebaseFirestore.Firestore | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private stats = {
    memoryHits: 0,
    memoryMisses: 0,
    firestoreHits: 0,
    firestoreMisses: 0,
    evictions: 0,
  };

  constructor(config?: Partial<TriggerEmbeddingCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize Firestore connection
   */
  private async initFirestore(): Promise<void> {
    if (this.initialized || this.initPromise) {
      return this.initPromise || Promise.resolve();
    }

    this.initPromise = (async () => {
      if (!this.config.persistToFirestore) {
        this.initialized = true;
        return;
      }

      try {
        // Dynamic import to avoid circular dependencies
        const { getFirestore } = await import('firebase-admin/firestore');
        this.firestoreDb = getFirestore();
        this.initialized = true;
        log.info('Trigger embedding cache initialized with Firestore');
      } catch (error) {
        log.warn({ error: String(error) }, 'Firestore not available, using memory-only cache');
        this.initialized = true;
      }
    })();

    return this.initPromise;
  }

  /**
   * Generate a unique ID for a trigger
   */
  private generateTriggerId(personaId: string, triggerName: string): string {
    return `${personaId}:${triggerName}`;
  }

  /**
   * Generate content hash for cache validation
   */
  private hashTriggerText(triggerText: string): string {
    return createHash('sha256').update(triggerText).digest('hex').slice(0, 16);
  }

  /**
   * Check if a cached entry is expired
   */
  private isExpired(cached: CachedTriggerEmbedding): boolean {
    return Date.now() - cached.createdAt.getTime() > this.config.ttlMs;
  }

  /**
   * Get a cached trigger embedding
   */
  async get(
    personaId: string,
    triggerName: string,
    triggerText: string
  ): Promise<CachedTriggerEmbedding | null> {
    await this.initFirestore();

    const triggerId = this.generateTriggerId(personaId, triggerName);
    const textHash = this.hashTriggerText(triggerText);

    // Check memory cache first
    const memoryCached = this.memoryCache.get(triggerId);
    if (memoryCached) {
      // Validate text hasn't changed
      if (
        this.hashTriggerText(memoryCached.triggerText) === textHash &&
        !this.isExpired(memoryCached)
      ) {
        this.stats.memoryHits++;
        memoryCached.accessedAt = new Date();
        memoryCached.accessCount++;
        log.debug({ triggerId }, 'Trigger embedding cache hit (memory)');
        return memoryCached;
      }
      // Text changed or expired, remove from cache
      this.memoryCache.delete(triggerId);
    }

    this.stats.memoryMisses++;

    // Check Firestore
    if (this.firestoreDb) {
      try {
        const docRef = this.firestoreDb.collection(this.config.firestoreCollection).doc(triggerId);

        const doc = await docRef.get();
        if (doc.exists) {
          const data = doc.data() as CachedTriggerEmbedding;

          // Validate text hasn't changed
          if (this.hashTriggerText(data.triggerText) === textHash) {
            // Convert Firestore timestamps
            const cached: CachedTriggerEmbedding = {
              ...data,
              createdAt: (data.createdAt as unknown as FirebaseFirestore.Timestamp).toDate(),
              accessedAt: new Date(),
              accessCount: (data.accessCount || 0) + 1,
            };

            if (!this.isExpired(cached)) {
              this.stats.firestoreHits++;

              // Promote to memory cache
              this.setInMemory(triggerId, cached);

              // Update access time in Firestore (non-blocking)
              docRef
                .update(
                  cleanForFirestore({
                    accessedAt: new Date(),
                    accessCount: cached.accessCount,
                  })
                )
                .catch((err) => {
                  log.debug({ error: String(err) }, 'Failed to update Firestore access time');
                });

              log.debug({ triggerId }, 'Trigger embedding cache hit (Firestore)');
              return cached;
            }
          }
        }

        this.stats.firestoreMisses++;
      } catch (error) {
        log.warn({ error: String(error), triggerId }, 'Firestore cache lookup failed');
      }
    }

    log.debug({ triggerId }, 'Trigger embedding cache miss');
    return null;
  }

  /**
   * Store a trigger embedding in cache
   */
  async set(
    personaId: string,
    triggerName: string,
    triggerText: string,
    embedding: number[],
    model: string
  ): Promise<void> {
    await this.initFirestore();

    const triggerId = this.generateTriggerId(personaId, triggerName);

    const cached: CachedTriggerEmbedding = {
      triggerId,
      embedding,
      triggerText,
      personaId,
      model,
      createdAt: new Date(),
      accessedAt: new Date(),
      accessCount: 1,
    };

    // Store in memory
    this.setInMemory(triggerId, cached);

    // Store in Firestore (non-blocking)
    if (this.firestoreDb) {
      this.setInFirestore(triggerId, cached).catch((error) => {
        log.warn(
          { error: String(error), triggerId },
          'Failed to persist trigger embedding to Firestore'
        );
      });
    }

    log.debug({ triggerId, model }, 'Trigger embedding cached');
  }

  /**
   * Set in memory cache with LRU eviction
   */
  private setInMemory(triggerId: string, cached: CachedTriggerEmbedding): void {
    // Evict if at capacity
    if (this.memoryCache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.memoryCache.set(triggerId, cached);
  }

  /**
   * Set in Firestore
   */
  private async setInFirestore(triggerId: string, cached: CachedTriggerEmbedding): Promise<void> {
    if (!this.firestoreDb) return;

    try {
      await this.firestoreDb
        .collection(this.config.firestoreCollection)
        .doc(triggerId)
        .set(cleanForFirestore(cached));
    } catch (error) {
      log.error({ error: String(error), triggerId }, 'Firestore set failed');
      throw error;
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldest: { id: string; accessedAt: Date } | null = null;

    for (const [id, cached] of this.memoryCache.entries()) {
      if (!oldest || cached.accessedAt < oldest.accessedAt) {
        oldest = { id, accessedAt: cached.accessedAt };
      }
    }

    if (oldest) {
      this.memoryCache.delete(oldest.id);
      this.stats.evictions++;
      log.debug({ triggerId: oldest.id }, 'Evicted LRU trigger embedding');
    }
  }

  /**
   * Bulk load embeddings for a persona from Firestore
   */
  async loadForPersona(personaId: string): Promise<CachedTriggerEmbedding[]> {
    await this.initFirestore();

    if (!this.firestoreDb) {
      return [];
    }

    try {
      const snapshot = await this.firestoreDb
        .collection(this.config.firestoreCollection)
        .where('personaId', '==', personaId)
        .get();

      const results: CachedTriggerEmbedding[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data() as CachedTriggerEmbedding;
        const cached: CachedTriggerEmbedding = {
          ...data,
          createdAt: (data.createdAt as unknown as FirebaseFirestore.Timestamp).toDate(),
          accessedAt: (data.accessedAt as unknown as FirebaseFirestore.Timestamp).toDate(),
        };

        if (!this.isExpired(cached)) {
          results.push(cached);
          this.setInMemory(cached.triggerId, cached);
        }
      }

      log.info({ personaId, loaded: results.length }, 'Loaded trigger embeddings from Firestore');
      return results;
    } catch (error) {
      log.warn(
        { error: String(error), personaId },
        'Failed to load trigger embeddings from Firestore'
      );
      return [];
    }
  }

  /**
   * Bulk save embeddings to Firestore
   */
  async bulkSave(embeddings: EmbeddedTrigger[], model: string): Promise<number> {
    await this.initFirestore();

    if (!this.firestoreDb) {
      // Just store in memory
      for (const emb of embeddings) {
        const triggerId = this.generateTriggerId(emb.personaId, emb.name);
        this.setInMemory(triggerId, {
          triggerId,
          embedding: emb.embedding,
          triggerText: emb.trigger,
          personaId: emb.personaId,
          model,
          createdAt: new Date(),
          accessedAt: new Date(),
          accessCount: 1,
        });
      }
      return embeddings.length;
    }

    try {
      const batch = this.firestoreDb.batch();
      let count = 0;

      for (const emb of embeddings) {
        const triggerId = this.generateTriggerId(emb.personaId, emb.name);
        const cached: CachedTriggerEmbedding = {
          triggerId,
          embedding: emb.embedding,
          triggerText: emb.trigger,
          personaId: emb.personaId,
          model,
          createdAt: new Date(),
          accessedAt: new Date(),
          accessCount: 1,
        };

        const docRef = this.firestoreDb.collection(this.config.firestoreCollection).doc(triggerId);

        batch.set(docRef, cleanForFirestore(cached));
        this.setInMemory(triggerId, cached);
        count++;

        // Firestore batch limit is 500
        if (count % 500 === 0) {
          await batch.commit();
        }
      }

      // Commit remaining
      if (count % 500 !== 0) {
        await batch.commit();
      }

      log.info({ saved: count }, 'Bulk saved trigger embeddings to Firestore');
      return count;
    } catch (error) {
      log.error({ error: String(error) }, 'Bulk save failed');
      throw error;
    }
  }

  /**
   * Invalidate a specific trigger's cache
   */
  async invalidate(personaId: string, triggerName: string): Promise<void> {
    const triggerId = this.generateTriggerId(personaId, triggerName);

    this.memoryCache.delete(triggerId);

    if (this.firestoreDb) {
      try {
        await this.firestoreDb.collection(this.config.firestoreCollection).doc(triggerId).delete();
      } catch (error) {
        log.debug({ error: String(error), triggerId }, 'Failed to delete from Firestore');
      }
    }

    log.debug({ triggerId }, 'Invalidated trigger embedding cache');
  }

  /**
   * Invalidate all triggers for a persona
   */
  async invalidatePersona(personaId: string): Promise<number> {
    let count = 0;

    // Remove from memory
    for (const [id, cached] of this.memoryCache.entries()) {
      if (cached.personaId === personaId) {
        this.memoryCache.delete(id);
        count++;
      }
    }

    // Remove from Firestore
    if (this.firestoreDb) {
      try {
        const snapshot = await this.firestoreDb
          .collection(this.config.firestoreCollection)
          .where('personaId', '==', personaId)
          .get();

        const batch = this.firestoreDb.batch();
        for (const doc of snapshot.docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();
        count = snapshot.docs.length;
      } catch (error) {
        log.warn(
          { error: String(error), personaId },
          'Failed to invalidate persona from Firestore'
        );
      }
    }

    log.info({ personaId, invalidated: count }, 'Invalidated persona trigger embeddings');
    return count;
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    // Don't clear Firestore - that's expensive and usually not needed
    log.info('Trigger embedding memory cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memorySize: number;
    maxSize: number;
    memoryHits: number;
    memoryMisses: number;
    firestoreHits: number;
    firestoreMisses: number;
    evictions: number;
    hitRate: number;
    firestoreEnabled: boolean;
  } {
    const totalMemoryAccesses = this.stats.memoryHits + this.stats.memoryMisses;
    const totalAccesses =
      totalMemoryAccesses + this.stats.firestoreHits + this.stats.firestoreMisses;

    return {
      memorySize: this.memoryCache.size,
      maxSize: this.config.maxSize,
      memoryHits: this.stats.memoryHits,
      memoryMisses: this.stats.memoryMisses,
      firestoreHits: this.stats.firestoreHits,
      firestoreMisses: this.stats.firestoreMisses,
      evictions: this.stats.evictions,
      hitRate:
        totalAccesses > 0 ? (this.stats.memoryHits + this.stats.firestoreHits) / totalAccesses : 0,
      firestoreEnabled: !!this.firestoreDb,
    };
  }

  /**
   * Prune expired entries from memory
   */
  pruneExpired(): number {
    let pruned = 0;
    for (const [id, cached] of this.memoryCache.entries()) {
      if (this.isExpired(cached)) {
        this.memoryCache.delete(id);
        pruned++;
      }
    }
    if (pruned > 0) {
      log.info({ pruned }, 'Pruned expired trigger embeddings');
    }
    return pruned;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultCache: TriggerEmbeddingCache | null = null;

/**
 * Get the singleton trigger embedding cache
 */
export function getTriggerEmbeddingCache(
  config?: Partial<TriggerEmbeddingCacheConfig>
): TriggerEmbeddingCache {
  if (!defaultCache) {
    defaultCache = new TriggerEmbeddingCache(config);
  }
  return defaultCache;
}

/**
 * Reset the singleton (for testing)
 */
export function resetTriggerEmbeddingCache(): void {
  if (defaultCache) {
    defaultCache.clear().catch(() => {
      // Ignore errors during reset
    });
    defaultCache = null;
  }
}

export default {
  TriggerEmbeddingCache,
  getTriggerEmbeddingCache,
  resetTriggerEmbeddingCache,
};
