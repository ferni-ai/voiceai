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
import { SPANNER_CONFIG, type GraphEntity, type GraphFact, type GraphRelationship } from './schema.js';

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
export async function upsertEntity(entity: Omit<GraphEntity, 'createdAt' | 'updatedAt'>): Promise<void> {
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
    log.warn({ error: String(error), relationshipId: rel.relationshipId }, 'Failed to insert relationship');
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
        attributes: typeof json.attributes === 'string' ? JSON.parse(json.attributes) : (json.attributes || {}),
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
      attributes: typeof json.attributes === 'string' ? JSON.parse(json.attributes) : (json.attributes || {}),
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
