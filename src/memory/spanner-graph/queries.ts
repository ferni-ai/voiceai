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
import {
  SPANNER_CONFIG,
  type GraphEntity,
  type GraphFact,
  type EntityWithFacts,
  type FactDomain,
} from './schema.js';
import { isSpannerReady } from './client.js';

// Re-export FactDomain for use in graph queries
export type { FactDomain };

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
          attributes:
            typeof json.attributes === 'string'
              ? JSON.parse(json.attributes)
              : json.attributes || {},
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
        domain: (json.domain as GraphFact['domain']) || 'general',
        confidence: json.confidence as number,
        extractedAt: new Date(),
        createdAt: new Date(),
      });
    }

    return Array.from(entityMap.values());
  } catch (error) {
    log.warn(
      { error: String(error), userId, factKey },
      'Failed to find entities with fact pattern'
    );
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
    log.warn({ error: String(error), userId }, 'Failed to get important people');
    return [];
  } finally {
    await db.close();
  }
}

// ============================================================================
// ENTITY CONTEXT QUERIES (for "Better than Human" recall)
// ============================================================================

/**
 * Build a natural language summary of an entity for LLM injection
 */
function buildEntitySummary(
  entity: EntityWithFacts,
  relatedEntities: Array<{
    entity: GraphEntity;
    relationshipType: string;
    strength: number;
  }>
): string {
  const lines: string[] = [];

  // Entity header
  lines.push(`**${entity.name}** (${entity.entityType})`);

  // Facts
  if (entity.facts.length > 0) {
    lines.push('');
    lines.push('What you know:');
    for (const fact of entity.facts.slice(0, 10)) {
      lines.push(`- ${fact.key}: ${fact.value}`);
    }
  }

  // Relationships
  if (relatedEntities.length > 0) {
    lines.push('');
    lines.push('Connections:');
    for (const rel of relatedEntities.slice(0, 5)) {
      lines.push(`- ${rel.relationshipType} → ${rel.entity.name}`);
    }
  }

  return lines.join('\n');
}

/**
 * Domain keywords for automatic classification
 */
const DOMAIN_KEYWORDS: Record<FactDomain, string[]> = {
  work: [
    'job',
    'work',
    'career',
    'office',
    'boss',
    'colleague',
    'salary',
    'promotion',
    'meeting',
    'project',
  ],
  health: [
    'health',
    'doctor',
    'exercise',
    'sleep',
    'medication',
    'illness',
    'therapy',
    'stress',
    'anxiety',
  ],
  family: [
    'family',
    'parent',
    'child',
    'sibling',
    'mother',
    'father',
    'brother',
    'sister',
    'son',
    'daughter',
  ],
  finance: [
    'money',
    'budget',
    'savings',
    'debt',
    'investment',
    'expense',
    'income',
    'loan',
    'rent',
  ],
  education: [
    'school',
    'college',
    'university',
    'class',
    'study',
    'degree',
    'course',
    'teacher',
    'student',
  ],
  hobby: ['hobby', 'fun', 'game', 'sport', 'music', 'art', 'reading', 'cooking', 'gardening'],
  travel: ['travel', 'trip', 'vacation', 'flight', 'hotel', 'destination', 'visit', 'abroad'],
  relationship: ['friend', 'partner', 'dating', 'marriage', 'relationship', 'love', 'breakup'],
  general: [],
};

/**
 * Classify a fact into a domain based on its key and value
 *
 * Exported for use by client.ts when inserting facts.
 */
export function classifyFactDomain(key: string, value: string): FactDomain {
  const text = `${key} ${value}`.toLowerCase();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (domain === 'general') continue;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return domain as FactDomain;
      }
    }
  }

  return 'general';
}
