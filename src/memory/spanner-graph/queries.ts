/**
 * Spanner Graph Queries
 *
 * Pre-built GQL queries for common graph traversal patterns.
 * Uses Spanner's native graph query capabilities.
 *
 * Query patterns:
 * - Entity with all facts
 * - Relationship traversal (1-hop, 2-hop)
 * - Network discovery
 * - Pattern matching
 *
 * @see https://cloud.google.com/spanner/docs/graph/queries
 * @module memory/spanner-graph/queries
 */

import { Spanner } from '@google-cloud/spanner';
import { createLogger } from '../../utils/safe-logger.js';
import { SPANNER_CONFIG, type GraphEntity, type GraphFact, type EntityWithFacts, type RelationshipResult } from './schema.js';
import { isSpannerReady } from './client.js';

const log = createLogger({ module: 'SpannerGraphQueries' });

// ============================================================================
// GRAPH QUERY HELPERS
// ============================================================================

/**
 * Get database instance for graph queries
 */
function getGraphDatabase() {
  const spanner = new Spanner({ projectId: SPANNER_CONFIG.projectId });
  const instance = spanner.instance(SPANNER_CONFIG.instanceId);
  return instance.database(SPANNER_CONFIG.databaseId);
}

/**
 * Helper to convert a Spanner row to a plain object
 */
function rowToObject(row: unknown): Record<string, unknown> {
  if (typeof row === 'object' && row !== null && 'toJSON' in row) {
    return (row as { toJSON: () => Record<string, unknown> }).toJSON();
  }
  return row as Record<string, unknown>;
}

// ============================================================================
// ENTITY QUERIES
// ============================================================================

/**
 * Get an entity with all its facts using graph traversal
 *
 * @example
 * const mike = await getEntityWithFacts(userId, 'Mike');
 * // { name: 'Mike', entityType: 'person', facts: [...] }
 */
export async function getEntityWithFacts(
  userId: string,
  entityName: string
): Promise<EntityWithFacts | null> {
  if (!isSpannerReady()) {
    log.debug('Spanner not ready, returning null');
    return null;
  }

  const db = getGraphDatabase();

  try {
    // Graph query to get entity and all connected facts
    const [rows] = await db.run({
      sql: `
        GRAPH FerniMemory
        MATCH (e:Entity WHERE e.name = @name AND e.user_id = @userId)-[ef:EntityFact]->(f:Fact)
        RETURN e.entity_id, e.name, e.entity_type, e.attributes, e.importance,
               e.first_mentioned, e.last_mentioned, e.mention_count,
               f.fact_id, f.fact_type, f.key, f.value, f.confidence, f.extracted_at
        ORDER BY f.confidence DESC
      `,
      params: { userId, name: entityName },
    });

    if (rows.length === 0) {
      // Try to get entity without facts
      const [entityRows] = await db.run({
        sql: `
          SELECT entity_id, name, entity_type, attributes, importance,
                 first_mentioned, last_mentioned, mention_count, created_at, updated_at
          FROM entities
          WHERE user_id = @userId AND LOWER(name) = LOWER(@name)
          LIMIT 1
        `,
        params: { userId, name: entityName },
      });

      if (entityRows.length === 0) return null;

      const json = entityRows[0].toJSON() as Record<string, unknown>;
      return {
        entityId: json.entity_id as string,
        userId,
        name: json.name as string,
        entityType: json.entity_type as GraphEntity['entityType'],
        attributes: typeof json.attributes === 'string' ? JSON.parse(json.attributes) : (json.attributes || {}),
        importance: json.importance as number,
        firstMentioned: new Date(json.first_mentioned as string),
        lastMentioned: new Date(json.last_mentioned as string),
        mentionCount: json.mention_count as number,
        createdAt: new Date(json.created_at as string),
        updatedAt: new Date(json.updated_at as string),
        facts: [],
      };
    }

    // Parse first row for entity data
    const firstJson = rows[0].toJSON() as Record<string, unknown>;
    const entity: EntityWithFacts = {
      entityId: firstJson.entity_id as string,
      userId,
      name: firstJson.name as string,
      entityType: firstJson.entity_type as GraphEntity['entityType'],
      attributes: typeof firstJson.attributes === 'string' ? JSON.parse(firstJson.attributes) : (firstJson.attributes || {}),
      importance: firstJson.importance as number,
      firstMentioned: new Date(firstJson.first_mentioned as string),
      lastMentioned: new Date(firstJson.last_mentioned as string),
      mentionCount: firstJson.mention_count as number,
      createdAt: new Date(),
      updatedAt: new Date(),
      facts: [],
    };

    // Collect all facts
    for (const row of rows) {
      const json = row.toJSON() as Record<string, unknown>;
      if (json.fact_id) { // Has fact_id
        entity.facts.push({
          factId: json.fact_id as string,
          userId,
          factType: json.fact_type as GraphFact['factType'],
          key: json.key as string,
          value: json.value as string,
          confidence: json.confidence as number,
          extractedAt: new Date(json.extracted_at as string),
          createdAt: new Date(),
        });
      }
    }

    return entity;
  } catch (error) {
    log.warn({ error: String(error), userId, entityName }, 'Failed to get entity with facts');
    return null;
  } finally {
    await db.close();
  }
}

// ============================================================================
// RELATIONSHIP QUERIES
// ============================================================================

/**
 * Get direct relationships for an entity (1-hop)
 *
 * @example
 * const relationships = await getEntityRelationships(userId, 'Mom');
 * // [{ source: 'Mom', relationship: 'mother_of', target: 'User' }, ...]
 */
export async function getEntityRelationships(
  userId: string,
  entityName: string
): Promise<RelationshipResult[]> {
  if (!isSpannerReady()) return [];

  const db = getGraphDatabase();

  try {
    const [rows] = await db.run({
      sql: `
        GRAPH FerniMemory
        MATCH (source:Entity WHERE source.name = @name AND source.user_id = @userId)-[rel:Relationship]-(target:Entity)
        RETURN source.entity_id AS source_entity_id, source.name AS source_name, 
               source.entity_type AS source_entity_type, source.importance AS source_importance,
               rel.relationship_id AS relationship_id, rel.relationship_type AS relationship_type, 
               rel.strength AS strength, rel.bidirectional AS bidirectional,
               target.entity_id AS target_entity_id, target.name AS target_name, 
               target.entity_type AS target_entity_type, target.importance AS target_importance
        ORDER BY rel.strength DESC
        LIMIT 20
      `,
      params: { userId, name: entityName },
    });

    return rows.map((row) => {
      const json = rowToObject(row);
      return {
        source: {
          entityId: json.source_entity_id as string,
          userId,
          name: json.source_name as string,
          entityType: json.source_entity_type as GraphEntity['entityType'],
          importance: json.source_importance as number,
          attributes: {},
          firstMentioned: new Date(),
          lastMentioned: new Date(),
          mentionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        relationship: {
          relationshipId: json.relationship_id as string,
          userId,
          sourceEntityId: json.source_entity_id as string,
          targetEntityId: json.target_entity_id as string,
          relationshipType: json.relationship_type as string,
          strength: json.strength as number,
          bidirectional: json.bidirectional as boolean,
          createdAt: new Date(),
        },
        target: {
          entityId: json.target_entity_id as string,
          userId,
          name: json.target_name as string,
          entityType: json.target_entity_type as GraphEntity['entityType'],
          importance: json.target_importance as number,
          attributes: {},
          firstMentioned: new Date(),
          lastMentioned: new Date(),
          mentionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId, entityName }, 'Failed to get entity relationships');
    return [];
  } finally {
    await db.close();
  }
}

/**
 * Get extended network (2-hop relationships)
 * Useful for "friends of friends" or "who knows someone who knows X"
 */
export async function getExtendedNetwork(
  userId: string,
  entityName: string,
  maxHops: number = 2
): Promise<{ path: GraphEntity[]; depth: number }[]> {
  if (!isSpannerReady()) return [];
  if (maxHops > 3) maxHops = 3; // Safety limit

  const db = getGraphDatabase();

  try {
    const [rows] = await db.run({
      sql: `
        GRAPH FerniMemory
        MATCH path = (start:Entity WHERE start.name = @name AND start.user_id = @userId)-[:Relationship*1..${maxHops}]-(connected:Entity)
        RETURN DISTINCT connected.entity_id AS entity_id, connected.name AS name, 
               connected.entity_type AS entity_type, LENGTH(path) AS depth
        ORDER BY depth, connected.importance DESC
        LIMIT 50
      `,
      params: { userId, name: entityName },
    });

    return rows.map((row) => {
      const json = rowToObject(row);
      return {
        path: [{
          entityId: json.entity_id as string,
          userId,
          name: json.name as string,
          entityType: json.entity_type as GraphEntity['entityType'],
          importance: 0.5,
          attributes: {},
          firstMentioned: new Date(),
          lastMentioned: new Date(),
          mentionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        depth: json.depth as number,
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId, entityName }, 'Failed to get extended network');
    return [];
  } finally {
    await db.close();
  }
}

// ============================================================================
// PATTERN QUERIES
// ============================================================================

/**
 * Find entities matching a pattern
 * E.g., "people the user is worried about"
 */
export async function findEntitiesWithFactPattern(
  userId: string,
  factKey: string,
  factValuePattern?: string
): Promise<EntityWithFacts[]> {
  if (!isSpannerReady()) return [];

  const db = getGraphDatabase();

  try {
    let sql = `
      GRAPH FerniMemory
      MATCH (e:Entity WHERE e.user_id = @userId)-[:EntityFact]->(f:Fact WHERE f.key = @factKey
    `;

    const params: Record<string, unknown> = { userId, factKey };

    if (factValuePattern) {
      sql += ` AND f.value LIKE @pattern`;
      params.pattern = `%${factValuePattern}%`;
    }

    sql += `)
      RETURN e.entity_id AS entity_id, e.name AS name, e.entity_type AS entity_type, 
             e.attributes AS attributes, e.importance AS importance,
             f.fact_id AS fact_id, f.key AS key, f.value AS value, f.confidence AS confidence
      ORDER BY e.importance DESC, f.confidence DESC
      LIMIT 20
    `;

    const [rows] = await db.run({ sql, params });

    // Group by entity
    const entityMap = new Map<string, EntityWithFacts>();
    
    for (const row of rows) {
      const json = rowToObject(row);
      const entityId = json.entity_id as string;
      
      if (!entityMap.has(entityId)) {
        entityMap.set(entityId, {
          entityId,
          userId,
          name: json.name as string,
          entityType: json.entity_type as GraphEntity['entityType'],
          attributes: typeof json.attributes === 'string' ? JSON.parse(json.attributes) : (json.attributes || {}),
          importance: json.importance as number,
          firstMentioned: new Date(),
          lastMentioned: new Date(),
          mentionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          facts: [],
        });
      }

      entityMap.get(entityId)!.facts.push({
        factId: json.fact_id as string,
        userId,
        factType: 'attribute',
        key: json.key as string,
        value: json.value as string,
        confidence: json.confidence as number,
        extractedAt: new Date(),
        createdAt: new Date(),
      });
    }

    return Array.from(entityMap.values());
  } catch (error) {
    log.warn({ error: String(error), userId, factKey }, 'Failed to find entities with fact pattern');
    return [];
  } finally {
    await db.close();
  }
}

/**
 * Get the most important people in the user's network
 */
export async function getImportantPeople(
  userId: string,
  limit: number = 10
): Promise<GraphEntity[]> {
  if (!isSpannerReady()) return [];

  const db = getGraphDatabase();

  try {
    const [rows] = await db.run({
      sql: `
        SELECT entity_id, name, entity_type, attributes, importance,
               first_mentioned, last_mentioned, mention_count, created_at, updated_at
        FROM entities
        WHERE user_id = @userId AND entity_type = 'person'
        ORDER BY importance DESC, mention_count DESC
        LIMIT @limit
      `,
      params: { userId, limit },
    });

    return rows.map((row) => {
      const json = rowToObject(row);
      return {
        entityId: json.entity_id as string,
        userId,
        name: json.name as string,
        entityType: 'person' as const,
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
    log.warn({ error: String(error), userId }, 'Failed to get important people');
    return [];
  } finally {
    await db.close();
  }
}
