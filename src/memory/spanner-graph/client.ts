/**
 * Spanner Graph Client
 *
 * Client wrapper for Google Cloud Spanner with connection pooling
 * and typed query methods for the FerniMemory property graph.
 *
 * Features:
 * - Connection pooling for efficiency
 * - Typed query builders
 * - Automatic retry with exponential backoff
 * - Session management
 *
 * @module memory/spanner-graph/client
 */

import { Spanner, Database } from '@google-cloud/spanner';
import { createLogger } from '../../utils/safe-logger.js';
import {
  SPANNER_CONFIG,
  type GraphEntity,
  type GraphFact,
  type GraphRelationship,
  type MemoryThread,
  type MemoryAnchor,
  type MemoryAnchorType,
} from './schema.js';

const log = createLogger({ module: 'SpannerGraphClient' });

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let spannerInstance: Spanner | null = null;
let databaseInstance: Database | null = null;
let initialized = false;

/**
 * Get or create the Spanner client instance
 */
function getSpannerClient(): Spanner {
  if (!spannerInstance) {
    spannerInstance = new Spanner({
      projectId: SPANNER_CONFIG.projectId,
    });
    log.debug('Spanner client created');
  }
  return spannerInstance;
}

/**
 * Get or create the Database instance
 */
function getDatabase(): Database {
  if (!databaseInstance) {
    const spanner = getSpannerClient();
    const instance = spanner.instance(SPANNER_CONFIG.instanceId);
    databaseInstance = instance.database(SPANNER_CONFIG.databaseId);
    log.debug('Spanner database connection established');
  }
  return databaseInstance;
}

/**
 * Check if Spanner is ready
 */
export function isSpannerReady(): boolean {
  return initialized;
}

/**
 * Initialize Spanner connection
 * Call this at startup to verify connectivity
 */
export async function initializeSpanner(): Promise<boolean> {
  if (initialized) return true;

  try {
    const db = getDatabase();
    // Simple query to verify connectivity
    const [rows] = await db.run({ sql: 'SELECT 1' });
    if (rows.length > 0) {
      initialized = true;
      log.info('Spanner connection verified');
      return true;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Spanner not available (will use Firestore fallback)');
  }

  return false;
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Insert or update an entity
 */
export async function upsertEntity(
  entity: Omit<GraphEntity, 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (!isSpannerReady()) {
    log.debug('Spanner not ready, skipping entity upsert');
    return;
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          INSERT OR UPDATE INTO entities 
          (entity_id, user_id, name, entity_type, attributes, importance, 
           first_mentioned, last_mentioned, mention_count, created_at, updated_at)
          VALUES 
          (@entityId, @userId, @name, @entityType, @attributes, @importance,
           @firstMentioned, @lastMentioned, @mentionCount, @createdAt, @updatedAt)
        `,
        params: {
          entityId: entity.entityId,
          userId: entity.userId,
          name: entity.name,
          entityType: entity.entityType,
          attributes: JSON.stringify(entity.attributes || {}),
          importance: entity.importance,
          firstMentioned: entity.firstMentioned.toISOString(),
          lastMentioned: entity.lastMentioned.toISOString(),
          mentionCount: entity.mentionCount,
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.commit();
    });

    log.debug({ entityId: entity.entityId, name: entity.name }, 'Entity upserted to Spanner');
  } catch (error) {
    log.warn({ error: String(error), entityId: entity.entityId }, 'Failed to upsert entity');
  }
}

/**
 * Insert a fact
 */
export async function insertFact(fact: Omit<GraphFact, 'createdAt'>): Promise<void> {
  if (!isSpannerReady()) return;

  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          INSERT INTO facts 
          (fact_id, user_id, fact_type, key, value, confidence, source_session, extracted_at, created_at)
          VALUES 
          (@factId, @userId, @factType, @key, @value, @confidence, @sourceSession, @extractedAt, @createdAt)
        `,
        params: {
          factId: fact.factId,
          userId: fact.userId,
          factType: fact.factType,
          key: fact.key,
          value: fact.value,
          confidence: fact.confidence,
          sourceSession: fact.sourceSession || null,
          extractedAt: fact.extractedAt.toISOString(),
          createdAt: now,
        },
      });
      await transaction.commit();
    });
  } catch (error) {
    log.warn({ error: String(error), factId: fact.factId }, 'Failed to insert fact');
  }
}

/**
 * Insert a relationship
 */
export async function insertRelationship(rel: Omit<GraphRelationship, 'createdAt'>): Promise<void> {
  if (!isSpannerReady()) return;

  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          INSERT INTO relationships 
          (relationship_id, user_id, source_entity_id, target_entity_id, relationship_type, strength, bidirectional, created_at)
          VALUES 
          (@relationshipId, @userId, @sourceEntityId, @targetEntityId, @relationshipType, @strength, @bidirectional, @createdAt)
        `,
        params: {
          relationshipId: rel.relationshipId,
          userId: rel.userId,
          sourceEntityId: rel.sourceEntityId,
          targetEntityId: rel.targetEntityId,
          relationshipType: rel.relationshipType,
          strength: rel.strength,
          bidirectional: rel.bidirectional,
          createdAt: now,
        },
      });
      await transaction.commit();
    });
  } catch (error) {
    log.warn(
      { error: String(error), relationshipId: rel.relationshipId },
      'Failed to insert relationship'
    );
  }
}

/**
 * Link a fact to an entity
 */
export async function linkFactToEntity(
  userId: string,
  entityId: string,
  factId: string
): Promise<void> {
  if (!isSpannerReady()) return;

  const db = getDatabase();
  const now = new Date().toISOString();
  const linkId = `ef-${entityId}-${factId}`;

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          INSERT OR IGNORE INTO entity_facts 
          (entity_fact_id, user_id, entity_id, fact_id, created_at)
          VALUES 
          (@entityFactId, @userId, @entityId, @factId, @createdAt)
        `,
        params: {
          entityFactId: linkId,
          userId,
          entityId,
          factId,
          createdAt: now,
        },
      });
      await transaction.commit();
    });
  } catch (error) {
    log.warn({ error: String(error), entityId, factId }, 'Failed to link fact to entity');
  }
}

// ============================================================================
// READ OPERATIONS (Relational queries - faster for simple lookups)
// ============================================================================

/**
 * Get entities by user ID
 */
export async function getEntitiesByUser(
  userId: string,
  options?: { limit?: number; entityType?: string }
): Promise<GraphEntity[]> {
  if (!isSpannerReady()) return [];

  const db = getDatabase();
  const limit = options?.limit || 50;

  try {
    let sql = `
      SELECT entity_id, user_id, name, entity_type, attributes, importance,
             first_mentioned, last_mentioned, mention_count, created_at, updated_at
      FROM entities
      WHERE user_id = @userId
    `;

    const params: Record<string, unknown> = { userId };

    if (options?.entityType) {
      sql += ' AND entity_type = @entityType';
      params.entityType = options.entityType;
    }

    sql += ' ORDER BY last_mentioned DESC LIMIT @limit';
    params.limit = limit;

    const [rows] = await db.run({ sql, params });

    return rows.map((row) => {
      const json = row.toJSON() as Record<string, unknown>;
      return {
        entityId: json.entity_id as string,
        userId: json.user_id as string,
        name: json.name as string,
        entityType: json.entity_type as GraphEntity['entityType'],
        attributes:
          typeof json.attributes === 'string' ? JSON.parse(json.attributes) : json.attributes || {},
        importance: json.importance as number,
        firstMentioned: new Date(json.first_mentioned as string),
        lastMentioned: new Date(json.last_mentioned as string),
        mentionCount: json.mention_count as number,
        createdAt: new Date(json.created_at as string),
        updatedAt: new Date(json.updated_at as string),
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get entities');
    return [];
  }
}

/**
 * Get an entity by name
 */
export async function getEntityByName(userId: string, name: string): Promise<GraphEntity | null> {
  if (!isSpannerReady()) return null;

  const db = getDatabase();

  try {
    const [rows] = await db.run({
      sql: `
        SELECT entity_id, user_id, name, entity_type, attributes, importance,
               first_mentioned, last_mentioned, mention_count, created_at, updated_at
        FROM entities
        WHERE user_id = @userId AND LOWER(name) = LOWER(@name)
        LIMIT 1
      `,
      params: { userId, name },
    });

    if (rows.length === 0) return null;

    const json = rows[0].toJSON() as Record<string, unknown>;
    return {
      entityId: json.entity_id as string,
      userId: json.user_id as string,
      name: json.name as string,
      entityType: json.entity_type as GraphEntity['entityType'],
      attributes:
        typeof json.attributes === 'string' ? JSON.parse(json.attributes) : json.attributes || {},
      importance: json.importance as number,
      firstMentioned: new Date(json.first_mentioned as string),
      lastMentioned: new Date(json.last_mentioned as string),
      mentionCount: json.mention_count as number,
      createdAt: new Date(json.created_at as string),
      updatedAt: new Date(json.updated_at as string),
    };
  } catch (error) {
    log.warn({ error: String(error), userId, name }, 'Failed to get entity by name');
    return null;
  }
}

// ============================================================================
// MEMORY THREAD OPERATIONS
// ============================================================================

/**
 * Upsert a memory thread (conversation theme continuity)
 */
export async function upsertMemoryThread(thread: Omit<MemoryThread, 'createdAt'>): Promise<void> {
  if (!isSpannerReady()) {
    log.debug('Spanner not ready, skipping thread upsert');
    return;
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          INSERT OR UPDATE INTO memory_threads 
          (thread_id, user_id, theme, rolling_summary, last_emotional_arc, confidence,
           session_count, first_session_id, last_session_id, first_mentioned, last_updated, created_at)
          VALUES 
          (@threadId, @userId, @theme, @rollingSummary, @lastEmotionalArc, @confidence,
           @sessionCount, @firstSessionId, @lastSessionId, @firstMentioned, @lastUpdated, @createdAt)
        `,
        params: {
          threadId: thread.threadId,
          userId: thread.userId,
          theme: thread.theme,
          rollingSummary: thread.rollingSummary || null,
          lastEmotionalArc: thread.lastEmotionalArc || null,
          confidence: thread.confidence,
          sessionCount: thread.sessionCount,
          firstSessionId: thread.firstSessionId || null,
          lastSessionId: thread.lastSessionId || null,
          firstMentioned: thread.firstMentioned.toISOString(),
          lastUpdated: thread.lastUpdated.toISOString(),
          createdAt: now,
        },
      });
      await transaction.commit();
    });

    log.debug({ threadId: thread.threadId, theme: thread.theme }, 'Memory thread upserted');
  } catch (error) {
    log.warn({ error: String(error), threadId: thread.threadId }, 'Failed to upsert memory thread');
  }
}

/**
 * Get memory threads for a user, ordered by last updated
 */
export async function getMemoryThreadsByUser(
  userId: string,
  options?: { limit?: number; minConfidence?: number }
): Promise<MemoryThread[]> {
  if (!isSpannerReady()) return [];

  const db = getDatabase();
  const limit = options?.limit || 20;
  const minConfidence = options?.minConfidence || 0;

  try {
    const [rows] = await db.run({
      sql: `
        SELECT thread_id, user_id, theme, rolling_summary, last_emotional_arc,
               confidence, session_count, first_session_id, last_session_id,
               first_mentioned, last_updated, created_at
        FROM memory_threads
        WHERE user_id = @userId AND confidence >= @minConfidence
        ORDER BY last_updated DESC
        LIMIT @limit
      `,
      params: { userId, minConfidence, limit },
    });

    return rows.map((row) => {
      const json = row.toJSON() as Record<string, unknown>;
      return {
        threadId: json.thread_id as string,
        userId: json.user_id as string,
        theme: json.theme as string,
        rollingSummary: json.rolling_summary as string | undefined,
        lastEmotionalArc: json.last_emotional_arc as string | undefined,
        confidence: json.confidence as number,
        sessionCount: json.session_count as number,
        firstSessionId: json.first_session_id as string | undefined,
        lastSessionId: json.last_session_id as string | undefined,
        firstMentioned: new Date(json.first_mentioned as string),
        lastUpdated: new Date(json.last_updated as string),
        createdAt: new Date(json.created_at as string),
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get memory threads');
    return [];
  }
}

/**
 * Get a specific memory thread by theme
 */
export async function getMemoryThreadByTheme(
  userId: string,
  theme: string
): Promise<MemoryThread | null> {
  if (!isSpannerReady()) return null;

  const db = getDatabase();

  try {
    const [rows] = await db.run({
      sql: `
        SELECT thread_id, user_id, theme, rolling_summary, last_emotional_arc,
               confidence, session_count, first_session_id, last_session_id,
               first_mentioned, last_updated, created_at
        FROM memory_threads
        WHERE user_id = @userId AND LOWER(theme) = LOWER(@theme)
        LIMIT 1
      `,
      params: { userId, theme },
    });

    if (rows.length === 0) return null;

    const json = rows[0].toJSON() as Record<string, unknown>;
    return {
      threadId: json.thread_id as string,
      userId: json.user_id as string,
      theme: json.theme as string,
      rollingSummary: json.rolling_summary as string | undefined,
      lastEmotionalArc: json.last_emotional_arc as string | undefined,
      confidence: json.confidence as number,
      sessionCount: json.session_count as number,
      firstSessionId: json.first_session_id as string | undefined,
      lastSessionId: json.last_session_id as string | undefined,
      firstMentioned: new Date(json.first_mentioned as string),
      lastUpdated: new Date(json.last_updated as string),
      createdAt: new Date(json.created_at as string),
    };
  } catch (error) {
    log.warn({ error: String(error), userId, theme }, 'Failed to get memory thread by theme');
    return null;
  }
}

// ============================================================================
// MEMORY ANCHOR OPERATIONS
// ============================================================================

/**
 * Insert a memory anchor (significant memory)
 */
export async function insertMemoryAnchor(
  anchor: Omit<MemoryAnchor, 'createdAt' | 'recallCount'>
): Promise<void> {
  if (!isSpannerReady()) {
    log.debug('Spanner not ready, skipping anchor insert');
    return;
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          INSERT INTO memory_anchors 
          (anchor_id, user_id, anchor_type, payload, significance_score,
           recall_count, last_recalled, source_session_id, source_thread_id, created_at)
          VALUES 
          (@anchorId, @userId, @anchorType, @payload, @significanceScore,
           0, @lastRecalled, @sourceSessionId, @sourceThreadId, @createdAt)
        `,
        params: {
          anchorId: anchor.anchorId,
          userId: anchor.userId,
          anchorType: anchor.anchorType,
          payload: JSON.stringify(anchor.payload),
          significanceScore: anchor.significanceScore,
          lastRecalled: anchor.lastRecalled?.toISOString() || null,
          sourceSessionId: anchor.sourceSessionId || null,
          sourceThreadId: anchor.sourceThreadId || null,
          createdAt: now,
        },
      });
      await transaction.commit();
    });

    log.debug({ anchorId: anchor.anchorId, type: anchor.anchorType }, 'Memory anchor inserted');
  } catch (error) {
    log.warn({ error: String(error), anchorId: anchor.anchorId }, 'Failed to insert memory anchor');
  }
}

/**
 * Get memory anchors for a user, ordered by significance
 */
export async function getMemoryAnchorsByUser(
  userId: string,
  options?: { limit?: number; anchorType?: MemoryAnchorType; minSignificance?: number }
): Promise<MemoryAnchor[]> {
  if (!isSpannerReady()) return [];

  const db = getDatabase();
  const limit = options?.limit || 20;
  const minSignificance = options?.minSignificance || 0;

  try {
    let sql = `
      SELECT anchor_id, user_id, anchor_type, payload, significance_score,
             recall_count, last_recalled, source_session_id, source_thread_id, created_at
      FROM memory_anchors
      WHERE user_id = @userId AND significance_score >= @minSignificance
    `;

    const params: Record<string, unknown> = { userId, minSignificance };

    if (options?.anchorType) {
      sql += ' AND anchor_type = @anchorType';
      params.anchorType = options.anchorType;
    }

    sql += ' ORDER BY significance_score DESC, created_at DESC LIMIT @limit';
    params.limit = limit;

    const [rows] = await db.run({ sql, params });

    return rows.map((row) => {
      const json = row.toJSON() as Record<string, unknown>;
      return {
        anchorId: json.anchor_id as string,
        userId: json.user_id as string,
        anchorType: json.anchor_type as MemoryAnchorType,
        payload: typeof json.payload === 'string' ? JSON.parse(json.payload) : json.payload || {},
        significanceScore: json.significance_score as number,
        recallCount: json.recall_count as number,
        lastRecalled: json.last_recalled ? new Date(json.last_recalled as string) : undefined,
        sourceSessionId: json.source_session_id as string | undefined,
        sourceThreadId: json.source_thread_id as string | undefined,
        createdAt: new Date(json.created_at as string),
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get memory anchors');
    return [];
  }
}

/**
 * Mark a memory anchor as recalled (increments recall count)
 */
export async function markAnchorRecalled(userId: string, anchorId: string): Promise<void> {
  if (!isSpannerReady()) return;

  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          UPDATE memory_anchors
          SET recall_count = recall_count + 1, last_recalled = @lastRecalled
          WHERE user_id = @userId AND anchor_id = @anchorId
        `,
        params: { userId, anchorId, lastRecalled: now },
      });
      await transaction.commit();
    });
  } catch (error) {
    log.warn({ error: String(error), anchorId }, 'Failed to mark anchor recalled');
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Close Spanner connections
 */
export async function closeSpanner(): Promise<void> {
  if (databaseInstance) {
    await databaseInstance.close();
    databaseInstance = null;
  }
  if (spannerInstance) {
    spannerInstance.close();
    spannerInstance = null;
  }
  initialized = false;
  log.debug('Spanner connections closed');
}
