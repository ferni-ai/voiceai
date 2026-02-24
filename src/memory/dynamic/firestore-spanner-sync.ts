/**
 * Firestore → Spanner Background Sync Service
 *
 * Periodically syncs data from Firestore (L2) to Spanner (L3)
 * for long-term relationship graph storage.
 *
 * Benefits of L3:
 * - Graph traversal queries (e.g., "Who knows Sarah?")
 * - Cross-user relationship mapping
 * - Historical entity evolution tracking
 * - Enterprise-ready scalability
 *
 * Note: Full graph queries require Spanner Enterprise Edition.
 * Currently using relational queries with fallback patterns.
 *
 * @module memory/dynamic/firestore-spanner-sync
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, toSafeDate } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'FirestoreSpannerSync' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface SyncConfig {
  /** Minimum age before syncing to Spanner (ms) - default 24h */
  minAgeMs: number;
  /** Minimum importance score to sync */
  minImportanceScore: number;
  /** Batch size for sync operations */
  batchSize: number;
  /** Interval between sync runs (ms) */
  syncIntervalMs: number;
  /** Whether sync is enabled */
  enabled: boolean;
}

const DEFAULT_CONFIG: SyncConfig = {
  minAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  minImportanceScore: 0.5,
  batchSize: 50,
  syncIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
  enabled: true,
};

let config = { ...DEFAULT_CONFIG };
let syncInterval: NodeJS.Timeout | null = null;

/**
 * Configure sync behavior
 */
export function configureSyncService(newConfig: Partial<SyncConfig>): void {
  config = { ...config, ...newConfig };
}

// ============================================================================
// SYNC TYPES
// ============================================================================

interface SyncableEntity {
  id: string;
  userId: string;
  name: string;
  type: string;
  importance: number;
  mentionCount: number;
  extractedAt: string;
  lastContext?: string;
}

interface SyncableFact {
  id: string;
  userId: string;
  entityName: string;
  factType: string;
  key: string;
  value: string;
  confidence: number;
  extractedAt: string;
}

interface SyncableRelationship {
  id: string;
  userId: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  extractedAt: string;
}

interface SyncResult {
  entitiesSynced: number;
  factsSynced: number;
  relationshipsSynced: number;
  errors: string[];
  durationMs: number;
}

interface SyncStats {
  lastSyncAt: Date | null;
  totalEntitiesSynced: number;
  totalFactsSynced: number;
  totalRelationshipsSynced: number;
  totalSyncRuns: number;
  failedSyncs: number;
  avgSyncDurationMs: number;
}

// ============================================================================
// SYNC STATE
// ============================================================================

const syncStats: SyncStats = {
  lastSyncAt: null,
  totalEntitiesSynced: 0,
  totalFactsSynced: 0,
  totalRelationshipsSynced: 0,
  totalSyncRuns: 0,
  failedSyncs: 0,
  avgSyncDurationMs: 0,
};

// ============================================================================
// SPANNER OPERATIONS
// ============================================================================

async function isSpannerAvailable(): Promise<boolean> {
  try {
    const { isSpannerReady } = await import('../spanner-graph/client.js');
    return isSpannerReady();
  } catch {
    return false;
  }
}

async function syncEntityToSpanner(entity: SyncableEntity): Promise<boolean> {
  try {
    const { upsertEntity } = await import('../spanner-graph/client.js');
    const now = new Date();
    const extractedDate = new Date(entity.extractedAt);
    await upsertEntity({
      entityId: `entity_${entity.userId}_${entity.id}`,
      userId: entity.userId,
      name: entity.name,
      entityType: entity.type as
        | 'person'
        | 'place'
        | 'organization'
        | 'event'
        | 'concept'
        | 'thing',
      attributes: {},
      importance: entity.importance,
      firstMentioned: extractedDate,
      lastMentioned: now,
      mentionCount: entity.mentionCount,
    });
    return true;
  } catch (error) {
    log.warn({ error: String(error), entityId: entity.id }, 'Failed to sync entity to Spanner');
    return false;
  }
}

async function syncFactToSpanner(fact: SyncableFact): Promise<boolean> {
  try {
    const { insertFact } = await import('../spanner-graph/client.js');

    await insertFact({
      factId: `fact_${fact.userId}_${fact.id}`,
      userId: fact.userId,
      factType: fact.factType as 'attribute' | 'event' | 'relationship' | 'state' | 'preference',
      key: fact.key,
      value: fact.value,
      domain: 'general', // Default domain for synced facts
      confidence: fact.confidence,
      sourceSession: undefined,
      extractedAt: new Date(fact.extractedAt),
    });
    return true;
  } catch (error) {
    log.warn({ error: String(error), factId: fact.id }, 'Failed to sync fact to Spanner');
    return false;
  }
}

async function syncRelationshipToSpanner(rel: SyncableRelationship): Promise<boolean> {
  try {
    const { insertRelationship, getEntitiesByUser } = await import('../spanner-graph/client.js');

    // Find source and target entities
    const entities = await getEntitiesByUser(rel.userId);
    const sourceEntity = entities.find((e) => e.name.toLowerCase() === rel.source.toLowerCase());
    const targetEntity = entities.find((e) => e.name.toLowerCase() === rel.target.toLowerCase());

    if (!sourceEntity || !targetEntity) {
      log.debug(
        { relId: rel.id, source: rel.source, target: rel.target },
        'Source or target entity not found for relationship, skipping'
      );
      return false;
    }

    await insertRelationship({
      relationshipId: `rel_${rel.userId}_${rel.id}`,
      userId: rel.userId,
      sourceEntityId: sourceEntity.entityId,
      targetEntityId: targetEntity.entityId,
      relationshipType: rel.type,
      strength: rel.strength,
      bidirectional: false,
    });
    return true;
  } catch (error) {
    log.warn({ error: String(error), relId: rel.id }, 'Failed to sync relationship to Spanner');
    return false;
  }
}

// ============================================================================
// FIRESTORE QUERIES
// ============================================================================

async function getUnsyncedEntities(limit: number): Promise<SyncableEntity[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const cutoffTime = new Date(Date.now() - config.minAgeMs).toISOString();
  const entities: SyncableEntity[] = [];

  try {
    // Query all users' dynamic_entities collection group
    const snapshot = await db
      .collectionGroup('dynamic_entities')
      .where('extractedAt', '<', cutoffTime)
      .where('syncedToSpanner', '==', false)
      .orderBy('extractedAt', 'asc')
      .limit(limit)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Extract userId from path: bogle_users/{userId}/dynamic_entities/{docId}
      const pathParts = doc.ref.path.split('/');
      const userId = pathParts[1];

      entities.push({
        id: doc.id,
        userId,
        name: data.name || '',
        type: data.type || 'person',
        importance: data.importance || 0.5,
        mentionCount: data.mentionCount || 1,
        extractedAt: data.extractedAt,
        lastContext: data.lastContext,
      });
    }
  } catch (error) {
    // If index doesn't exist or other query error, fallback to no filter
    // NOTE: This is often caused by missing composite index for extractedAt + syncedToSpanner
    log.warn(
      { error: String(error) },
      'Collection group query failed - check Firestore composite index exists for dynamic_entities'
    );
  }

  return entities;
}

async function getUnsyncedFacts(limit: number): Promise<SyncableFact[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const cutoffTime = new Date(Date.now() - config.minAgeMs).toISOString();
  const facts: SyncableFact[] = [];

  try {
    const snapshot = await db
      .collectionGroup('dynamic_facts')
      .where('extractedAt', '<', cutoffTime)
      .where('syncedToSpanner', '==', false)
      .orderBy('extractedAt', 'asc')
      .limit(limit)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const pathParts = doc.ref.path.split('/');
      const userId = pathParts[1];

      facts.push({
        id: doc.id,
        userId,
        entityName: data.entityName || '',
        factType: data.factType || 'attribute',
        key: data.key || '',
        value: data.value || '',
        confidence: data.confidence || 0.5,
        extractedAt: data.extractedAt,
      });
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Collection group query failed for facts - check Firestore composite index');
  }

  return facts;
}

async function getUnsyncedRelationships(limit: number): Promise<SyncableRelationship[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const cutoffTime = new Date(Date.now() - config.minAgeMs).toISOString();
  const relationships: SyncableRelationship[] = [];

  try {
    const snapshot = await db
      .collectionGroup('dynamic_relationships')
      .where('extractedAt', '<', cutoffTime)
      .where('syncedToSpanner', '==', false)
      .orderBy('extractedAt', 'asc')
      .limit(limit)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const pathParts = doc.ref.path.split('/');
      const userId = pathParts[1];

      relationships.push({
        id: doc.id,
        userId,
        source: data.source || '',
        target: data.target || '',
        type: data.type || 'knows',
        strength: data.strength || 0.5,
        extractedAt: data.extractedAt,
      });
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Collection group query failed for relationships - check Firestore composite index');
  }

  return relationships;
}

async function markAsSynced(
  collection: 'dynamic_entities' | 'dynamic_facts' | 'dynamic_relationships',
  userId: string,
  docId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db.collection('bogle_users').doc(userId).collection(collection).doc(docId).update({
      syncedToSpanner: true,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    log.warn({ error: String(error), docId }, 'Failed to mark document as synced');
  }
}

// ============================================================================
// MAIN SYNC LOGIC
// ============================================================================

/**
 * Run a single sync cycle from Firestore to Spanner
 */
export async function runSyncCycle(): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    entitiesSynced: 0,
    factsSynced: 0,
    relationshipsSynced: 0,
    errors: [],
    durationMs: 0,
  };

  if (!config.enabled) {
    log.debug('Sync disabled, skipping');
    return result;
  }

  // Check if Spanner is available
  // Note: Spanner is only available in production (GCE). Local dev uses Firestore-only mode.
  const spannerAvailable = await isSpannerAvailable();
  if (!spannerAvailable) {
    // Use info level only on first run to avoid log spam, debug level after
    const isLocalDev = process.env.NODE_ENV === 'development' || !process.env.GOOGLE_CLOUD_PROJECT;
    if (isLocalDev) {
      log.debug('Spanner not available (expected in local dev), skipping L3 sync');
    } else {
      log.info('Spanner not available, skipping sync to L3');
    }
    result.errors.push('Spanner not available');
    return result;
  }

  try {
    // 1. Sync entities
    const entities = await getUnsyncedEntities(config.batchSize);
    for (const entity of entities) {
      if (entity.importance >= config.minImportanceScore) {
        const success = await syncEntityToSpanner(entity);
        if (success) {
          await markAsSynced('dynamic_entities', entity.userId, entity.id);
          result.entitiesSynced++;
        }
      }
    }

    // 2. Sync facts
    const facts = await getUnsyncedFacts(config.batchSize);
    for (const fact of facts) {
      const success = await syncFactToSpanner(fact);
      if (success) {
        await markAsSynced('dynamic_facts', fact.userId, fact.id);
        result.factsSynced++;
      }
    }

    // 3. Sync relationships
    const relationships = await getUnsyncedRelationships(config.batchSize);
    for (const rel of relationships) {
      const success = await syncRelationshipToSpanner(rel);
      if (success) {
        await markAsSynced('dynamic_relationships', rel.userId, rel.id);
        result.relationshipsSynced++;
      }
    }

    // Update stats
    result.durationMs = Date.now() - startTime;
    syncStats.lastSyncAt = new Date();
    syncStats.totalEntitiesSynced += result.entitiesSynced;
    syncStats.totalFactsSynced += result.factsSynced;
    syncStats.totalRelationshipsSynced += result.relationshipsSynced;
    syncStats.totalSyncRuns++;
    syncStats.avgSyncDurationMs =
      (syncStats.avgSyncDurationMs * (syncStats.totalSyncRuns - 1) + result.durationMs) /
      syncStats.totalSyncRuns;

    log.info(
      {
        entitiesSynced: result.entitiesSynced,
        factsSynced: result.factsSynced,
        relationshipsSynced: result.relationshipsSynced,
        durationMs: result.durationMs,
      },
      '🔄 Firestore → Spanner sync cycle complete'
    );
  } catch (error) {
    syncStats.failedSyncs++;
    result.errors.push(String(error));
    log.error({ error: String(error) }, 'Sync cycle failed');
  }

  return result;
}

/**
 * Start the background sync service
 */
export function startSyncService(): void {
  if (syncInterval) {
    log.warn('Sync service already running');
    return;
  }

  if (!config.enabled) {
    log.info('Sync service disabled');
    return;
  }

  log.info(
    { intervalMs: config.syncIntervalMs, minAgeMs: config.minAgeMs },
    '🔄 Starting Firestore → Spanner sync service'
  );

  // Run initial sync after a delay
  setTimeout(() => {
    runSyncCycle().catch((err) => {
      log.error({ error: String(err) }, 'Initial sync cycle failed');
    });
  }, 30000); // 30 second delay before first sync

  // Schedule periodic syncs
  syncInterval = setInterval(() => {
    runSyncCycle().catch((err) => {
      log.error({ error: String(err) }, 'Scheduled sync cycle failed');
    });
  }, config.syncIntervalMs);
  syncInterval.unref();
}

/**
 * Stop the background sync service
 */
export function stopSyncService(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    log.info('Sync service stopped');
  }
}

/**
 * Get sync statistics
 */
export function getSyncStats(): SyncStats {
  return { ...syncStats };
}

/**
 * Check if sync service is running
 */
export function isSyncServiceRunning(): boolean {
  return syncInterval !== null;
}

// ============================================================================
// REAL-TIME SYNC FOR HIGH-IMPORTANCE MEMORIES
// ============================================================================

/**
 * Threshold for high-importance immediate sync
 */
const HIGH_IMPORTANCE_THRESHOLD = 0.75;

/**
 * Threshold for medium-importance priority sync
 */
const MEDIUM_IMPORTANCE_THRESHOLD = 0.5;

/**
 * Sync a single memory to Spanner immediately
 *
 * Use this for high-importance memories that should be available
 * in graph queries right away instead of waiting for batch sync.
 *
 * @param memory The memory to sync
 * @returns true if sync was successful
 */
export async function syncMemoryImmediately(memory: {
  id: string;
  userId: string;
  content: string;
  type: string;
  emotionalWeight?: number;
  strength?: number;
  peopleMentioned?: string[];
  topics?: string[];
  createdAt: Date;
}): Promise<boolean> {
  if (!(await isSpannerAvailable())) {
    log.debug('Spanner not available for immediate sync');
    return false;
  }

  try {
    const importance = memory.emotionalWeight || memory.strength || 0.5;
    log.debug(
      { memoryId: memory.id, importance },
      'Syncing memory to Spanner immediately'
    );

    // Sync entities from people mentioned
    for (const person of memory.peopleMentioned || []) {
      await syncEntityToSpanner({
        id: `${memory.id}_${person}`,
        userId: memory.userId,
        name: person,
        type: 'person',
        importance,
        mentionCount: 1,
        extractedAt: memory.createdAt.toISOString(),
        lastContext: memory.content.substring(0, 200),
      });
    }

    // Sync as fact if it has topics
    for (const topic of memory.topics || []) {
      await syncFactToSpanner({
        id: `${memory.id}_${topic}`,
        userId: memory.userId,
        entityName: topic,
        factType: memory.type === 'fact' ? 'attribute' : 'state',
        key: topic,
        value: memory.content.substring(0, 500),
        confidence: importance,
        extractedAt: memory.createdAt.toISOString(),
      });
    }

    log.info({ memoryId: memory.id }, 'Immediate sync to Spanner completed');
    return true;
  } catch (error) {
    log.warn({ error: String(error), memoryId: memory.id }, 'Immediate sync to Spanner failed');
    return false;
  }
}

/**
 * Determine if a memory should be synced immediately
 */
export function shouldSyncImmediately(memory: {
  emotionalWeight?: number;
  strength?: number;
  peopleMentioned?: string[];
  type?: string;
}): boolean {
  // Check importance threshold
  const importance = memory.emotionalWeight || memory.strength || 0;
  if (importance >= HIGH_IMPORTANCE_THRESHOLD) {
    return true;
  }

  // Check if it mentions important people (3+ is significant network)
  if ((memory.peopleMentioned?.length || 0) >= 3) {
    return true;
  }

  // Check for specific types that benefit from graph queries
  const graphBenefitTypes = ['relationship', 'milestone', 'commitment', 'breakthrough'];
  if (memory.type && graphBenefitTypes.includes(memory.type)) {
    return true;
  }

  return false;
}

/**
 * Queue a memory for priority sync (not immediate, but faster than 6h)
 * These get synced on next batch or within 30 minutes
 */
const MAX_PRIORITY_QUEUE_SIZE = 5000;
const prioritySyncQueue: Map<string, Date> = new Map();

export function queueForPrioritySync(memoryId: string): void {
  // Evict oldest entries when queue is full
  if (prioritySyncQueue.size >= MAX_PRIORITY_QUEUE_SIZE) {
    const oldestKey = prioritySyncQueue.keys().next().value;
    if (oldestKey) {
      prioritySyncQueue.delete(oldestKey);
      log.warn(
        { evictedId: oldestKey, queueSize: MAX_PRIORITY_QUEUE_SIZE },
        'Priority sync queue full, evicting oldest entry'
      );
    }
  }

  prioritySyncQueue.set(memoryId, new Date());
  log.debug({ memoryId, queueSize: prioritySyncQueue.size }, 'Queued for priority sync');
}

export function getPrioritySyncQueue(): Map<string, Date> {
  return new Map(prioritySyncQueue);
}

export function clearPrioritySyncQueue(): void {
  prioritySyncQueue.clear();
}

/**
 * Process priority sync queue (call this more frequently than batch sync)
 */
export async function processPrioritySyncQueue(): Promise<number> {
  if (prioritySyncQueue.size === 0) return 0;

  if (!(await isSpannerAvailable())) {
    log.debug('Spanner not available for priority sync');
    return 0;
  }

  const startTime = Date.now();
  const memoryIds = Array.from(prioritySyncQueue.keys());
  let synced = 0;

  // Load and sync memories from Firestore
  try {
    const db = getFirestoreDb();
    if (!db) {
      log.warn('Firestore not available for priority sync');
      return 0;
    }
    
    for (const memoryId of memoryIds.slice(0, 50)) { // Process up to 50 at a time
      try {
        // Query the memory from the unified memories collection
        const memorySnapshot = await db
          .collectionGroup('unified_memories')
          .where('id', '==', memoryId)
          .limit(1)
          .get();

        if (!memorySnapshot.empty) {
          const memoryDoc = memorySnapshot.docs[0];
          const data = memoryDoc.data();
          
          const syncSuccess = await syncMemoryImmediately({
            id: data.id,
            userId: data.userId,
            content: data.content,
            type: data.type,
            emotionalWeight: data.emotionalWeight,
            strength: data.strength,
            peopleMentioned: data.peopleMentioned,
            topics: data.topics,
            createdAt: toSafeDate(data.createdAt),
          });

          if (syncSuccess) {
            synced++;
            prioritySyncQueue.delete(memoryId);
          }
        } else {
          // Memory not found, remove from queue
          prioritySyncQueue.delete(memoryId);
        }
      } catch (error) {
        log.warn({ error: String(error), memoryId }, 'Failed to process priority sync');
      }
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to process priority sync queue');
  }

  log.info(
    { synced, remaining: prioritySyncQueue.size, durationMs: Date.now() - startTime },
    'Processed priority sync queue'
  );

  return synced;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  SyncConfig,
  SyncResult,
  SyncStats,
  SyncableEntity,
  SyncableFact,
  SyncableRelationship,
};
