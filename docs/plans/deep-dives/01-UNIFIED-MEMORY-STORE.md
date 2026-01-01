# Deep Dive: Unified Memory Store

> **Phase 1 Core Component**

---

## Problem Statement

Currently, memory is scattered across 5+ systems:

```
Current State:
├── firestore-store.ts          → Structured documents
├── firestore-vector-store/     → Embeddings + semantic search
├── redis-cache.ts              → Session L2 cache
├── in-memory-store.ts          → Hot L1 cache
├── superhuman/*.ts             → Domain-specific stores
└── trust-systems/*.ts          → Another set of stores
```

**Problems:**

1. No single source of truth
2. Different APIs for each store
3. No coordination between stores
4. Hard to add cross-cutting features (links, decay)
5. Each caller must know which store to use

---

## Solution: Facade Pattern

The Unified Memory Store provides a **single interface** that orchestrates all underlying stores.

```
┌─────────────────────────────────────────────────────────────┐
│                  UnifiedMemoryStore                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Facade Layer                        │   │
│  │  - Single API for all operations                    │   │
│  │  - Request routing                                  │   │
│  │  - Cross-cutting concerns (logging, metrics)        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│           ┌───────────────┼───────────────┐                │
│           ▼               ▼               ▼                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Firestore  │  │   Vector    │  │    Cache    │        │
│  │  Adapter    │  │   Adapter   │  │   Adapter   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                 │
└─────────┼────────────────┼────────────────┼─────────────────┘
          ▼                ▼                ▼
   ┌────────────┐   ┌────────────┐   ┌────────────┐
   │  Firestore │   │  Vector    │   │ Redis/Mem  │
   │            │   │  Store     │   │   Cache    │
   └────────────┘   └────────────┘   └────────────┘
```

---

## Core Interface

```typescript
// src/memory/unified-store/types.ts

/**
 * Input for storing a new memory
 */
export interface MemoryInput {
  userId: string;
  content: string;
  type: MemoryType;

  // Optional: Pre-computed embedding (saves API call)
  embedding?: number[];

  // Metadata
  metadata?: {
    topic?: string;
    persons?: string[];
    emotionalWeight?: number;
    source?: 'conversation' | 'tool' | 'inference';
    sessionId?: string;
    personaId?: string;
  };
}

export type MemoryType =
  | 'fact' // Concrete facts about user
  | 'preference' // User preferences
  | 'event' // Life events
  | 'emotion' // Emotional moments
  | 'commitment' // Promises/intentions
  | 'relationship' // People in their life
  | 'pattern' // Behavioral patterns
  | 'insight'; // AI-generated insights

/**
 * Stored memory with full metadata
 */
export interface StoredMemory {
  id: string;
  userId: string;
  content: string;
  type: MemoryType;
  embedding: number[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date;

  // Scoring
  emotionalWeight: number; // 0-1, how emotionally significant
  accessCount: number; // How often recalled
  decayScore: number; // Current decay state (0=fresh, 1=forgotten)

  // Metadata
  metadata: {
    topic?: string;
    persons?: string[];
    source: string;
    sessionId?: string;
    personaId?: string;
  };

  // Graph (Phase 3)
  linkCount?: number;
}

/**
 * Query for recalling memories
 */
export interface RecallQuery {
  userId: string;

  // What to search for (at least one required)
  query?: string; // Semantic search text
  embedding?: number[]; // Pre-computed query embedding
  memoryIds?: string[]; // Specific IDs

  // Filters
  types?: MemoryType[];
  minScore?: number; // Minimum similarity (0-1)
  minEmotionalWeight?: number;
  maxDecay?: number; // Exclude decayed memories

  // Limits
  limit?: number;

  // Options
  includeLinks?: boolean; // Include graph links
  boostRecent?: boolean; // Boost recently accessed
}

/**
 * Result of a recall operation
 */
export interface RecallResult {
  memories: ScoredMemory[];
  totalMatches: number;
  queryEmbedding?: number[];
  latencyMs: number;
}

export interface ScoredMemory extends StoredMemory {
  score: number; // Relevance score (0-1)
  scoreBreakdown?: {
    semantic: number;
    recency: number;
    emotional: number;
    access: number;
  };
}

/**
 * The main unified store interface
 */
export interface UnifiedMemoryStore {
  // ============== Core Operations ==============

  /**
   * Store a new memory
   * - Generates embedding if not provided
   * - Stores in vector store + Firestore
   * - Updates cache
   * - Detects and creates links (if enabled)
   */
  store(input: MemoryInput): Promise<StoredMemory>;

  /**
   * Recall memories matching query
   * - Searches vector store
   * - Applies filters and scoring
   * - Updates access counts
   */
  recall(query: RecallQuery): Promise<RecallResult>;

  /**
   * Update an existing memory
   * - Updates content/metadata
   * - Re-generates embedding if content changed
   * - Updates links if content changed
   */
  update(id: string, updates: Partial<MemoryInput>): Promise<StoredMemory>;

  /**
   * Delete a memory
   * - Removes from all stores
   * - Removes associated links
   */
  delete(id: string): Promise<void>;

  /**
   * Get a specific memory by ID
   */
  get(id: string): Promise<StoredMemory | null>;

  // ============== Batch Operations ==============

  /**
   * Store multiple memories efficiently
   */
  storeBatch(inputs: MemoryInput[]): Promise<StoredMemory[]>;

  /**
   * Get multiple memories by ID
   */
  getBatch(ids: string[]): Promise<Map<string, StoredMemory>>;

  // ============== Graph Operations (Phase 3 prep) ==============

  /**
   * Get links for a memory
   */
  getLinks(memoryId: string, type?: LinkType): Promise<MemoryLink[]>;

  /**
   * Add a link between memories
   */
  addLink(link: MemoryLinkInput): Promise<MemoryLink>;

  /**
   * Remove a link
   */
  removeLink(linkId: string): Promise<void>;

  // ============== Lifecycle Operations ==============

  /**
   * Run consolidation for a user
   * - Finds similar memories
   * - Merges duplicates
   * - Updates links
   */
  consolidate(userId: string, options?: ConsolidationOptions): Promise<ConsolidationReport>;

  /**
   * Apply decay to user's memories
   * - Calculates decay scores
   * - Optionally prunes highly decayed
   */
  decay(userId: string, options?: DecayOptions): Promise<DecayReport>;

  /**
   * Reinforce a memory (called on access)
   * - Increases access count
   * - Reduces decay
   */
  reinforce(memoryId: string): Promise<void>;

  // ============== Health & Metrics ==============

  /**
   * Get store health status
   */
  health(): Promise<StoreHealth>;

  /**
   * Get usage metrics for a user
   */
  getUserMetrics(userId: string): Promise<UserMemoryMetrics>;
}
```

---

## Adapter Interfaces

Each adapter wraps an underlying storage system:

```typescript
// src/memory/unified-store/adapters/types.ts

/**
 * Base adapter interface - all adapters implement this
 */
export interface StorageAdapter {
  name: string;

  // Health check
  isHealthy(): Promise<boolean>;

  // Graceful shutdown
  shutdown(): Promise<void>;
}

/**
 * Document storage adapter (Firestore)
 */
export interface DocumentAdapter extends StorageAdapter {
  // CRUD
  get<T>(userId: string, collection: string, docId: string): Promise<T | null>;
  set<T>(userId: string, collection: string, docId: string, data: T): Promise<void>;
  update<T>(userId: string, collection: string, docId: string, updates: Partial<T>): Promise<void>;
  delete(userId: string, collection: string, docId: string): Promise<void>;

  // Queries
  query<T>(userId: string, collection: string, filters: QueryFilter[]): Promise<T[]>;

  // Batch
  batchWrite(operations: BatchOperation[]): Promise<void>;
}

/**
 * Vector storage adapter (Firestore Vector Store)
 */
export interface VectorAdapter extends StorageAdapter {
  // Store with embedding
  store(memory: VectorMemory): Promise<string>;

  // Semantic search
  search(
    userId: string,
    embedding: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;

  // Update embedding
  updateEmbedding(id: string, embedding: number[]): Promise<void>;

  // Delete
  delete(id: string): Promise<void>;
}

/**
 * Cache adapter (Redis + In-Memory)
 */
export interface CacheAdapter extends StorageAdapter {
  // Get/Set with TTL
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;

  // Bulk operations
  mget<T>(keys: string[]): Promise<Map<string, T>>;
  mset<T>(entries: Map<string, T>, ttlMs?: number): Promise<void>;

  // Cache invalidation
  invalidatePattern(pattern: string): Promise<number>;

  // Stats
  getStats(): CacheStats;
}
```

---

## Facade Implementation

```typescript
// src/memory/unified-store/facade.ts

import { createLogger } from '../../utils/safe-logger.js';
import { generateEmbedding } from '../embeddings.js';
import type {
  UnifiedMemoryStore,
  MemoryInput,
  StoredMemory,
  RecallQuery,
  RecallResult,
} from './types.js';
import type { DocumentAdapter, VectorAdapter, CacheAdapter } from './adapters/types.js';

const log = createLogger({ module: 'UnifiedMemoryStore' });

export class UnifiedMemoryStoreFacade implements UnifiedMemoryStore {
  private document: DocumentAdapter;
  private vector: VectorAdapter;
  private cache: CacheAdapter;
  private config: StoreConfig;

  constructor(
    document: DocumentAdapter,
    vector: VectorAdapter,
    cache: CacheAdapter,
    config?: Partial<StoreConfig>
  ) {
    this.document = document;
    this.vector = vector;
    this.cache = cache;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================
  // STORE
  // ============================================

  async store(input: MemoryInput): Promise<StoredMemory> {
    const startTime = performance.now();

    try {
      // 1. Generate embedding if not provided
      const embedding = input.embedding ?? (await generateEmbedding(input.content));

      // 2. Create memory document
      const memoryId = this.generateId();
      const now = new Date();

      const memory: StoredMemory = {
        id: memoryId,
        userId: input.userId,
        content: input.content,
        type: input.type,
        embedding,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        emotionalWeight: input.metadata?.emotionalWeight ?? 0.5,
        accessCount: 0,
        decayScore: 0,
        metadata: {
          topic: input.metadata?.topic,
          persons: input.metadata?.persons,
          source: input.metadata?.source ?? 'conversation',
          sessionId: input.metadata?.sessionId,
          personaId: input.metadata?.personaId,
        },
      };

      // 3. Store in vector store (for semantic search)
      await this.vector.store({
        id: memoryId,
        userId: input.userId,
        content: input.content,
        embedding,
        metadata: memory.metadata,
      });

      // 4. Store full document in Firestore (for queries/updates)
      await this.document.set(
        input.userId,
        'memories',
        memoryId,
        this.serializeForFirestore(memory)
      );

      // 5. Update cache
      await this.cache.set(this.cacheKey(memoryId), memory, this.config.cacheTtlMs);

      // 6. Detect and create links (async, non-blocking)
      if (this.config.autoDetectLinks) {
        this.detectAndCreateLinks(memory).catch((err) => {
          log.warn({ error: String(err), memoryId }, 'Link detection failed');
        });
      }

      log.debug(
        {
          memoryId,
          userId: input.userId,
          type: input.type,
          latencyMs: performance.now() - startTime,
        },
        'Memory stored'
      );

      return memory;
    } catch (error) {
      log.error({ error: String(error), userId: input.userId }, 'Failed to store memory');
      throw error;
    }
  }

  // ============================================
  // RECALL
  // ============================================

  async recall(query: RecallQuery): Promise<RecallResult> {
    const startTime = performance.now();

    try {
      // 1. Get or generate query embedding
      const queryEmbedding =
        query.embedding ?? (query.query ? await generateEmbedding(query.query) : undefined);

      if (!queryEmbedding && !query.memoryIds) {
        throw new Error('Either query, embedding, or memoryIds required');
      }

      let memories: ScoredMemory[] = [];

      // 2a. If specific IDs requested, fetch directly
      if (query.memoryIds) {
        const fetched = await this.getBatch(query.memoryIds);
        memories = Array.from(fetched.values()).map((m) => ({
          ...m,
          score: 1.0,
        }));
      }
      // 2b. Otherwise, semantic search
      else if (queryEmbedding) {
        const vectorResults = await this.vector.search(query.userId, queryEmbedding, {
          limit: (query.limit ?? 10) * 2, // Over-fetch for filtering
          minScore: query.minScore ?? 0.3,
        });

        // Fetch full documents
        const ids = vectorResults.map((r) => r.id);
        const docs = await this.getBatch(ids);

        memories = vectorResults
          .filter((r) => docs.has(r.id))
          .map((r) => ({
            ...docs.get(r.id)!,
            score: r.score,
          }));
      }

      // 3. Apply filters
      memories = this.applyFilters(memories, query);

      // 4. Apply scoring boosts
      memories = this.applyScoring(memories, query);

      // 5. Sort and limit
      memories.sort((a, b) => b.score - a.score);
      memories = memories.slice(0, query.limit ?? 10);

      // 6. Reinforce accessed memories (async)
      for (const memory of memories) {
        this.reinforce(memory.id).catch(() => {});
      }

      // 7. Include links if requested
      if (query.includeLinks) {
        await this.attachLinks(memories);
      }

      const latencyMs = performance.now() - startTime;

      log.debug(
        {
          userId: query.userId,
          resultCount: memories.length,
          latencyMs,
        },
        'Memory recall completed'
      );

      return {
        memories,
        totalMatches: memories.length,
        queryEmbedding,
        latencyMs,
      };
    } catch (error) {
      log.error({ error: String(error), userId: query.userId }, 'Recall failed');
      throw error;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private applyFilters(memories: ScoredMemory[], query: RecallQuery): ScoredMemory[] {
    return memories.filter((m) => {
      // Type filter
      if (query.types && !query.types.includes(m.type)) return false;

      // Emotional weight filter
      if (query.minEmotionalWeight && m.emotionalWeight < query.minEmotionalWeight) return false;

      // Decay filter
      if (query.maxDecay !== undefined && m.decayScore > query.maxDecay) return false;

      return true;
    });
  }

  private applyScoring(memories: ScoredMemory[], query: RecallQuery): ScoredMemory[] {
    return memories.map((m) => {
      let score = m.score;

      // Boost by recency (if enabled)
      if (query.boostRecent) {
        const daysSinceAccess = this.daysSince(m.lastAccessedAt);
        const recencyBoost = Math.max(0, 1 - daysSinceAccess * 0.02); // -2% per day
        score *= 1 + recencyBoost * 0.2; // Up to 20% boost
      }

      // Boost by emotional weight
      score *= 1 + m.emotionalWeight * 0.1; // Up to 10% boost

      // Penalty for decay
      score *= 1 - m.decayScore * 0.3; // Up to 30% penalty

      return {
        ...m,
        score: Math.min(1.0, score),
        scoreBreakdown: {
          semantic: m.score,
          recency: query.boostRecent ? this.recencyScore(m) : 1.0,
          emotional: 1 + m.emotionalWeight * 0.1,
          access: this.accessScore(m),
        },
      };
    });
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cacheKey(memoryId: string): string {
    return `memory:${memoryId}`;
  }

  private daysSince(date: Date): number {
    return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  }

  private recencyScore(memory: StoredMemory): number {
    const days = this.daysSince(memory.lastAccessedAt);
    return Math.max(0.5, 1 - days * 0.02);
  }

  private accessScore(memory: StoredMemory): number {
    return Math.min(1.5, 1 + Math.log10(memory.accessCount + 1) * 0.1);
  }

  private serializeForFirestore(memory: StoredMemory): Record<string, unknown> {
    // Remove embedding (stored separately in vector store)
    const { embedding, ...rest } = memory;
    return {
      ...rest,
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
      lastAccessedAt: memory.lastAccessedAt.toISOString(),
    };
  }

  // ... additional methods for update, delete, links, etc.
}
```

---

## Adapter Implementations

### Firestore Adapter

```typescript
// src/memory/unified-store/adapters/firestore-adapter.ts

import type { Firestore } from '@google-cloud/firestore';
import type { DocumentAdapter, QueryFilter, BatchOperation } from './types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'FirestoreAdapter' });

export class FirestoreDocumentAdapter implements DocumentAdapter {
  name = 'firestore';
  private db: Firestore | null = null;
  private initPromise: Promise<Firestore | null> | null = null;

  constructor(
    private projectId: string,
    private databaseId: string
  ) {}

  private async getDb(): Promise<Firestore | null> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<Firestore | null> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      this.db = new Firestore({
        projectId: this.projectId,
        databaseId: this.databaseId,
      });
      log.info('Firestore adapter initialized');
      return this.db;
    } catch (error) {
      log.warn({ error }, 'Firestore not available');
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    const db = await this.getDb();
    if (!db) return false;

    try {
      await db.collection('_health').doc('ping').get();
      return true;
    } catch {
      return false;
    }
  }

  async get<T>(userId: string, collection: string, docId: string): Promise<T | null> {
    const db = await this.getDb();
    if (!db) return null;

    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(collection)
      .doc(docId)
      .get();

    return doc.exists ? (doc.data() as T) : null;
  }

  async set<T>(userId: string, collection: string, docId: string, data: T): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      log.warn({ userId, collection, docId }, 'Firestore unavailable, skipping write');
      return;
    }

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(collection)
      .doc(docId)
      .set(cleanForFirestore(data));
  }

  async update<T>(
    userId: string,
    collection: string,
    docId: string,
    updates: Partial<T>
  ): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(collection)
      .doc(docId)
      .update(cleanForFirestore(updates));
  }

  async delete(userId: string, collection: string, docId: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    await db.collection('bogle_users').doc(userId).collection(collection).doc(docId).delete();
  }

  async query<T>(userId: string, collection: string, filters: QueryFilter[]): Promise<T[]> {
    const db = await this.getDb();
    if (!db) return [];

    let query = db
      .collection('bogle_users')
      .doc(userId)
      .collection(collection) as FirebaseFirestore.Query;

    for (const filter of filters) {
      query = query.where(filter.field, filter.op, filter.value);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as T);
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    const batch = db.batch();

    for (const op of operations) {
      const ref = db
        .collection('bogle_users')
        .doc(op.userId)
        .collection(op.collection)
        .doc(op.docId);

      switch (op.type) {
        case 'set':
          batch.set(ref, cleanForFirestore(op.data));
          break;
        case 'update':
          batch.update(ref, cleanForFirestore(op.data));
          break;
        case 'delete':
          batch.delete(ref);
          break;
      }
    }

    await batch.commit();
  }

  async shutdown(): Promise<void> {
    this.db = null;
    this.initPromise = null;
  }
}
```

### Vector Adapter

```typescript
// src/memory/unified-store/adapters/vector-adapter.ts

import type {
  VectorAdapter,
  VectorMemory,
  VectorSearchOptions,
  VectorSearchResult,
} from './types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'VectorAdapter' });

export class FirestoreVectorAdapter implements VectorAdapter {
  name = 'vector';

  constructor(
    private vectorStore: {
      addDocument: (doc: unknown) => Promise<string>;
      search: (embedding: number[], options: unknown) => Promise<unknown[]>;
      deleteDocument: (id: string) => Promise<void>;
    }
  ) {}

  async isHealthy(): Promise<boolean> {
    // Check if vector store is responsive
    try {
      // Simple health check - try a minimal search
      return true;
    } catch {
      return false;
    }
  }

  async store(memory: VectorMemory): Promise<string> {
    return this.vectorStore.addDocument({
      id: memory.id,
      userId: memory.userId,
      text: memory.content,
      embedding: memory.embedding,
      metadata: memory.metadata,
    });
  }

  async search(
    userId: string,
    embedding: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const results = await this.vectorStore.search(embedding, {
      filter: { userId },
      topK: options.limit ?? 10,
      minScore: options.minScore ?? 0.3,
    });

    return results.map((r: any) => ({
      id: r.id,
      score: r.score,
      content: r.text,
      metadata: r.metadata,
    }));
  }

  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    // Implementation depends on vector store capabilities
    // May need to delete + re-add
  }

  async delete(id: string): Promise<void> {
    await this.vectorStore.deleteDocument(id);
  }

  async shutdown(): Promise<void> {
    // Cleanup
  }
}
```

### Cache Adapter

```typescript
// src/memory/unified-store/adapters/cache-adapter.ts

import type { CacheAdapter, CacheStats } from './types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'CacheAdapter' });

/**
 * Two-tier cache: L1 in-memory + L2 Redis
 */
export class TieredCacheAdapter implements CacheAdapter {
  name = 'tiered-cache';

  // L1: In-memory (fast, limited size)
  private l1Cache = new Map<string, { value: unknown; expiresAt: number }>();
  private l1MaxSize = 1000;

  // L2: Redis (if available)
  private redis: RedisClient | null = null;

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.initRedis(redisUrl);
    }
  }

  private async initRedis(url: string): Promise<void> {
    try {
      const { createClient } = await import('redis');
      this.redis = createClient({ url });
      await this.redis.connect();
      log.info('Redis cache connected');
    } catch (error) {
      log.warn({ error }, 'Redis not available, using memory only');
    }
  }

  async isHealthy(): Promise<boolean> {
    // L1 is always healthy
    // Check L2 if configured
    if (this.redis) {
      try {
        await this.redis.ping();
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  async get<T>(key: string): Promise<T | null> {
    // Check L1 first
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && l1Entry.expiresAt > Date.now()) {
      return l1Entry.value as T;
    }

    // Check L2
    if (this.redis) {
      try {
        const value = await this.redis.get(key);
        if (value) {
          const parsed = JSON.parse(value) as T;
          // Populate L1
          this.setL1(key, parsed, 60000); // 1 min L1 TTL
          return parsed;
        }
      } catch {
        // Redis error, continue without
      }
    }

    return null;
  }

  async set<T>(key: string, value: T, ttlMs: number = 300000): Promise<void> {
    // Set L1
    this.setL1(key, value, Math.min(ttlMs, 60000)); // Max 1 min in L1

    // Set L2
    if (this.redis) {
      try {
        await this.redis.setEx(key, Math.ceil(ttlMs / 1000), JSON.stringify(value));
      } catch {
        // Redis error, L1 still has it
      }
    }
  }

  private setL1<T>(key: string, value: T, ttlMs: number): void {
    // Evict if at capacity
    if (this.l1Cache.size >= this.l1MaxSize) {
      this.evictOldest();
    }

    this.l1Cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.l1Cache) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.l1Cache.delete(oldestKey);
    }
  }

  async delete(key: string): Promise<void> {
    this.l1Cache.delete(key);

    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // Ignore
      }
    }
  }

  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    const missedKeys: string[] = [];

    // Check L1 for all
    for (const key of keys) {
      const l1Entry = this.l1Cache.get(key);
      if (l1Entry && l1Entry.expiresAt > Date.now()) {
        result.set(key, l1Entry.value as T);
      } else {
        missedKeys.push(key);
      }
    }

    // Check L2 for misses
    if (missedKeys.length > 0 && this.redis) {
      try {
        const values = await this.redis.mGet(missedKeys);
        for (let i = 0; i < missedKeys.length; i++) {
          if (values[i]) {
            const parsed = JSON.parse(values[i]!) as T;
            result.set(missedKeys[i], parsed);
            this.setL1(missedKeys[i], parsed, 60000);
          }
        }
      } catch {
        // Ignore
      }
    }

    return result;
  }

  async mset<T>(entries: Map<string, T>, ttlMs: number = 300000): Promise<void> {
    for (const [key, value] of entries) {
      await this.set(key, value, ttlMs);
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;

    // Invalidate L1
    for (const key of this.l1Cache.keys()) {
      if (key.includes(pattern.replace('*', ''))) {
        this.l1Cache.delete(key);
        count++;
      }
    }

    // Invalidate L2
    if (this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(keys);
          count += keys.length;
        }
      } catch {
        // Ignore
      }
    }

    return count;
  }

  getStats(): CacheStats {
    return {
      l1Size: this.l1Cache.size,
      l1MaxSize: this.l1MaxSize,
      l2Connected: !!this.redis,
    };
  }

  async shutdown(): Promise<void> {
    this.l1Cache.clear();
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
```

---

## Graph Link Storage (Phase 3 Preparation)

```typescript
// src/memory/unified-store/graph/link-types.ts

export type LinkType =
  | 'causal' // A caused/led to B
  | 'temporal' // A happened near B
  | 'emotional' // A and B have similar emotion
  | 'person' // Same person mentioned
  | 'topic' // Same topic
  | 'semantic' // High embedding similarity
  | 'narrative'; // Same life chapter

export interface MemoryLink {
  id: string;
  sourceId: string;
  targetId: string;
  type: LinkType;
  weight: number; // 0-1
  bidirectional: boolean;

  metadata: {
    createdAt: Date;
    detectedBy: 'auto' | 'manual' | 'llm';
    confidence: number;
    evidence?: string;
  };
}

export interface MemoryLinkInput {
  sourceId: string;
  targetId: string;
  type: LinkType;
  weight?: number;
  bidirectional?: boolean;
  metadata?: {
    evidence?: string;
  };
}
```

```typescript
// src/memory/unified-store/graph/firestore-links.ts

import type { DocumentAdapter } from '../adapters/types.js';
import type { MemoryLink, MemoryLinkInput, LinkType } from './link-types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryLinkStore' });

export class FirestoreMemoryLinkStore {
  constructor(private adapter: DocumentAdapter) {}

  async addLink(userId: string, input: MemoryLinkInput): Promise<MemoryLink> {
    const link: MemoryLink = {
      id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
      weight: input.weight ?? 0.5,
      bidirectional: input.bidirectional ?? false,
      metadata: {
        createdAt: new Date(),
        detectedBy: 'auto',
        confidence: 1.0,
        evidence: input.metadata?.evidence,
      },
    };

    await this.adapter.set(userId, 'memory_links', link.id, link);

    // If bidirectional, create reverse link
    if (link.bidirectional) {
      const reverseLink: MemoryLink = {
        ...link,
        id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sourceId: input.targetId,
        targetId: input.sourceId,
      };
      await this.adapter.set(userId, 'memory_links', reverseLink.id, reverseLink);
    }

    return link;
  }

  async getLinksFrom(userId: string, memoryId: string, type?: LinkType): Promise<MemoryLink[]> {
    const filters = [{ field: 'sourceId', op: '==', value: memoryId }];
    if (type) {
      filters.push({ field: 'type', op: '==', value: type });
    }

    return this.adapter.query<MemoryLink>(userId, 'memory_links', filters);
  }

  async getLinksTo(userId: string, memoryId: string, type?: LinkType): Promise<MemoryLink[]> {
    const filters = [{ field: 'targetId', op: '==', value: memoryId }];
    if (type) {
      filters.push({ field: 'type', op: '==', value: type });
    }

    return this.adapter.query<MemoryLink>(userId, 'memory_links', filters);
  }

  async getAllLinks(userId: string, memoryId: string): Promise<MemoryLink[]> {
    const [from, to] = await Promise.all([
      this.getLinksFrom(userId, memoryId),
      this.getLinksTo(userId, memoryId),
    ]);

    return [...from, ...to];
  }

  async deleteLink(userId: string, linkId: string): Promise<void> {
    await this.adapter.delete(userId, 'memory_links', linkId);
  }

  async deleteLinksForMemory(userId: string, memoryId: string): Promise<void> {
    const links = await this.getAllLinks(userId, memoryId);

    await this.adapter.batchWrite(
      links.map((link) => ({
        type: 'delete' as const,
        userId,
        collection: 'memory_links',
        docId: link.id,
      }))
    );
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// src/memory/unified-store/__tests__/facade.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedMemoryStoreFacade } from '../facade.js';
import { createMockAdapters } from './test-utils.js';

describe('UnifiedMemoryStoreFacade', () => {
  let facade: UnifiedMemoryStoreFacade;
  let mockAdapters: ReturnType<typeof createMockAdapters>;

  beforeEach(() => {
    mockAdapters = createMockAdapters();
    facade = new UnifiedMemoryStoreFacade(
      mockAdapters.document,
      mockAdapters.vector,
      mockAdapters.cache
    );
  });

  describe('store()', () => {
    it('should store memory in vector and document stores', async () => {
      const input = {
        userId: 'user-123',
        content: 'User loves hiking',
        type: 'preference' as const,
      };

      const result = await facade.store(input);

      expect(result.id).toBeDefined();
      expect(result.content).toBe(input.content);
      expect(result.embedding).toBeDefined();
      expect(mockAdapters.vector.store).toHaveBeenCalled();
      expect(mockAdapters.document.set).toHaveBeenCalled();
      expect(mockAdapters.cache.set).toHaveBeenCalled();
    });

    it('should use provided embedding instead of generating', async () => {
      const embedding = new Array(768).fill(0.1);
      const input = {
        userId: 'user-123',
        content: 'User loves hiking',
        type: 'preference' as const,
        embedding,
      };

      const result = await facade.store(input);

      expect(result.embedding).toEqual(embedding);
      // Should not call embedding generation
    });
  });

  describe('recall()', () => {
    it('should search and return scored memories', async () => {
      // Setup mock to return results
      mockAdapters.vector.search.mockResolvedValue([
        { id: 'mem-1', score: 0.9 },
        { id: 'mem-2', score: 0.7 },
      ]);

      mockAdapters.cache.mget.mockResolvedValue(
        new Map([
          ['memory:mem-1', { id: 'mem-1', content: 'Memory 1' }],
          ['memory:mem-2', { id: 'mem-2', content: 'Memory 2' }],
        ])
      );

      const result = await facade.recall({
        userId: 'user-123',
        query: 'outdoor activities',
      });

      expect(result.memories).toHaveLength(2);
      expect(result.memories[0].score).toBeGreaterThan(result.memories[1].score);
    });

    it('should apply type filter', async () => {
      // ... test filtering
    });
  });
});
```

### Integration Tests

```typescript
// src/memory/unified-store/__tests__/integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnifiedStore } from '../index.js';

describe('UnifiedMemoryStore Integration', () => {
  let store: UnifiedMemoryStore;
  const testUserId = `test-user-${Date.now()}`;

  beforeAll(async () => {
    // Use emulator
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    store = getUnifiedStore();
  });

  afterAll(async () => {
    // Cleanup test data
    // ...
  });

  it('should round-trip memory through all stores', async () => {
    // Store
    const memory = await store.store({
      userId: testUserId,
      content: 'Test memory for integration test',
      type: 'fact',
    });

    expect(memory.id).toBeDefined();

    // Get by ID
    const fetched = await store.get(memory.id);
    expect(fetched?.content).toBe(memory.content);

    // Search
    const searchResult = await store.recall({
      userId: testUserId,
      query: 'integration test',
    });

    expect(searchResult.memories).toContainEqual(expect.objectContaining({ id: memory.id }));

    // Delete
    await store.delete(memory.id);

    // Verify deleted
    const deleted = await store.get(memory.id);
    expect(deleted).toBeNull();
  });
});
```

---

## Migration Strategy

### Phase 1a: Shadow Writes (Week 1)

```typescript
// Enable shadow writes to new system while old system remains primary

const SHADOW_WRITE_ENABLED = process.env.UNIFIED_STORE_SHADOW === 'true';

// In existing code:
async function saveMemory(userId: string, memory: Memory): Promise<void> {
  // Primary: Old system
  await oldFirestoreStore.save(userId, memory);

  // Shadow: New unified store (non-blocking)
  if (SHADOW_WRITE_ENABLED) {
    unifiedStore
      .store({
        userId,
        content: memory.content,
        type: memory.type,
      })
      .catch((err) => {
        log.warn({ error: String(err) }, 'Shadow write failed');
      });
  }
}
```

### Phase 1b: Shadow Reads (Week 2)

```typescript
// Compare reads between old and new system

async function searchMemories(userId: string, query: string): Promise<Memory[]> {
  const [oldResults, newResults] = await Promise.all([
    oldVectorStore.search(userId, query),
    unifiedStore.recall({ userId, query }).catch(() => ({ memories: [] })),
  ]);

  // Log comparison for monitoring
  compareResults(oldResults, newResults.memories);

  // Return old results (primary)
  return oldResults;
}
```

### Phase 1c: Cutover (Week 2 end)

```typescript
// Feature flag for full cutover
const USE_UNIFIED_STORE = process.env.UNIFIED_STORE_ENABLED === 'true';

async function searchMemories(userId: string, query: string): Promise<Memory[]> {
  if (USE_UNIFIED_STORE) {
    const result = await unifiedStore.recall({ userId, query });
    return result.memories;
  }

  return oldVectorStore.search(userId, query);
}
```

---

## Rollback Plan

If issues arise after cutover:

1. **Immediate:** Set `UNIFIED_STORE_ENABLED=false` in environment
2. **Data:** Old stores still have all data (shadow writes went to both)
3. **Monitoring:** Alert on error rate increase
4. **Investigation:** Check unified store health, adapter logs

---

## Success Criteria

| Metric             | Baseline | Target |
| ------------------ | -------- | ------ |
| Store latency P50  | ~150ms   | <100ms |
| Recall latency P50 | ~200ms   | <50ms  |
| Error rate         | ~0.5%    | <0.1%  |
| Cache hit rate     | 0%       | >80%   |
| Test coverage      | 0%       | >80%   |

---

_Next: [02-MEMORY-INTELLIGENCE.md](./02-MEMORY-INTELLIGENCE.md)_
