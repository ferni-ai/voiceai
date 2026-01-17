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
import { getFirestoreDb } from '../../utils/firestore-utils.js';

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
      entityType: entity.type as 'person' | 'place' | 'organization' | 'event' | 'concept' | 'thing',
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
    const sourceEntity = entities.find(
      (e) => e.name.toLowerCase() === rel.source.toLowerCase()
    );
    const targetEntity = entities.find(
      (e) => e.name.toLowerCase() === rel.target.toLowerCase()
    );

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
    log.debug({ error: String(error) }, 'Collection group query failed, entities may need manual sync');
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
    log.debug({ error: String(error) }, 'Collection group query failed for facts');
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
    log.debug({ error: String(error) }, 'Collection group query failed for relationships');
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
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(collection)
      .doc(docId)
      .update({
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
  const spannerAvailable = await isSpannerAvailable();
  if (!spannerAvailable) {
    log.debug('Spanner not available, skipping sync');
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
// EXPORTS
// ============================================================================

export type { SyncConfig, SyncResult, SyncStats, SyncableEntity, SyncableFact, SyncableRelationship };
