/**
 * Graph Expansion for Spanner (Standard Edition Compatible)
 *
 * Implements graph traversal using optimized relational queries (JOINs and CTEs)
 * instead of GQL, making it compatible with Spanner Standard Edition.
 *
 * Architecture:
 * - Uses recursive CTEs for multi-hop traversal
 * - Optimized JOINs for 1-hop relationships
 * - Interface designed for easy upgrade to GQL when Enterprise is available
 *
 * Query Strategy:
 * 1. 1-hop: Simple JOINs (fastest)
 * 2. 2-hop: Recursive CTE with depth limit
 * 3. N-hop: Recursive CTE with configurable max depth
 *
 * @module memory/spanner-graph/graph-expansion
 */

import { Spanner } from '@google-cloud/spanner';
import { createLogger } from '../../utils/safe-logger.js';
import { SPANNER_CONFIG, type GraphEntity, type GraphRelationship } from './schema.js';
import { isSpannerReady } from './client.js';

const log = createLogger({ module: 'SpannerGraphExpansion' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Expanded entity with distance from seed
 */
export interface ExpandedEntity {
  entity: GraphEntity;
  /** Distance from seed entity (0 = seed itself) */
  depth: number;
  /** Path of entity IDs from seed to this entity */
  path: string[];
  /** Relationship type that led to this entity */
  relationshipType?: string;
  /** Relationship strength */
  relationshipStrength?: number;
}

/**
 * Graph expansion options
 */
export interface GraphExpansionOptions {
  /** Maximum hops from seed (default: 2, max: 3) */
  maxHops?: number;
  /** Maximum entities to return (default: 50) */
  maxEntities?: number;
  /** Filter by entity types */
  entityTypes?: string[];
  /** Filter by relationship types */
  relationshipTypes?: string[];
  /** Minimum relationship strength (0-1) */
  minStrength?: number;
  /** Include seed entity in results */
  includeSeed?: boolean;
  /** Sort by importance (default: true) */
  sortByImportance?: boolean;
}

/**
 * Graph expansion result
 */
export interface GraphExpansionResult {
  /** Seed entity */
  seed: GraphEntity | null;
  /** Expanded entities at each depth */
  entities: ExpandedEntity[];
  /** Metrics */
  metrics: {
    totalEntities: number;
    maxDepthReached: number;
    queryTimeMs: number;
  };
}

// ============================================================================
// GRAPH EXPANDER INTERFACE (Enterprise-Ready)
// ============================================================================

/**
 * Abstract interface for graph expansion.
 * Allows swapping between relational (Standard) and GQL (Enterprise) implementations.
 */
export interface GraphExpander {
  /** Expand from a seed entity */
  expand(
    userId: string,
    seedEntityId: string,
    options?: GraphExpansionOptions
  ): Promise<GraphExpansionResult>;

  /** Check if the expander is available */
  isAvailable(): boolean;

  /** Get expander type */
  getType(): 'relational' | 'gql';
}

// ============================================================================
// RELATIONAL GRAPH EXPANDER (Standard Edition)
// ============================================================================

/**
 * Graph expander using relational queries (JOINs and recursive CTEs)
 * Compatible with Spanner Standard Edition
 */
export class RelationalGraphExpander implements GraphExpander {
  private spanner: Spanner;

  constructor() {
    this.spanner = new Spanner({ projectId: SPANNER_CONFIG.projectId });
  }

  getType(): 'relational' {
    return 'relational';
  }

  isAvailable(): boolean {
    return isSpannerReady();
  }

  private getDatabase() {
    const instance = this.spanner.instance(SPANNER_CONFIG.instanceId);
    return instance.database(SPANNER_CONFIG.databaseId);
  }

  /**
   * Expand from a seed entity using relational queries
   */
  async expand(
    userId: string,
    seedEntityId: string,
    options: GraphExpansionOptions = {}
  ): Promise<GraphExpansionResult> {
    const startTime = Date.now();
    const {
      maxHops = 2,
      maxEntities = 50,
      entityTypes,
      relationshipTypes,
      minStrength = 0,
      includeSeed = false,
      sortByImportance = true,
    } = options;

    // Safety limit
    const safeMaxHops = Math.min(maxHops, 3);

    if (!this.isAvailable()) {
      return {
        seed: null,
        entities: [],
        metrics: {
          totalEntities: 0,
          maxDepthReached: 0,
          queryTimeMs: Date.now() - startTime,
        },
      };
    }

    const db = this.getDatabase();

    try {
      // Get seed entity
      const seed = await this.getEntity(db, userId, seedEntityId);
      if (!seed) {
        return {
          seed: null,
          entities: [],
          metrics: {
            totalEntities: 0,
            maxDepthReached: 0,
            queryTimeMs: Date.now() - startTime,
          },
        };
      }

      // Build and execute expansion query
      const entities = await this.executeExpansion(
        db,
        userId,
        seedEntityId,
        safeMaxHops,
        maxEntities,
        entityTypes,
        relationshipTypes,
        minStrength,
        sortByImportance
      );

      // Optionally include seed
      const results: ExpandedEntity[] = [];
      if (includeSeed) {
        results.push({
          entity: seed,
          depth: 0,
          path: [seedEntityId],
        });
      }
      results.push(...entities);

      const maxDepthReached = entities.length > 0 ? Math.max(...entities.map((e) => e.depth)) : 0;

      return {
        seed,
        entities: results,
        metrics: {
          totalEntities: results.length,
          maxDepthReached,
          queryTimeMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      log.warn({ error: String(error), userId, seedEntityId }, 'Graph expansion failed');
      return {
        seed: null,
        entities: [],
        metrics: {
          totalEntities: 0,
          maxDepthReached: 0,
          queryTimeMs: Date.now() - startTime,
        },
      };
    } finally {
      await db.close();
    }
  }

  /**
   * Get a single entity
   */
  private async getEntity(
    db: ReturnType<typeof this.getDatabase>,
    userId: string,
    entityId: string
  ): Promise<GraphEntity | null> {
    const [rows] = await db.run({
      sql: `
        SELECT entity_id, user_id, name, entity_type, attributes, importance,
               first_mentioned, last_mentioned, mention_count, created_at, updated_at
        FROM entities
        WHERE user_id = @userId AND entity_id = @entityId
        LIMIT 1
      `,
      params: { userId, entityId },
    });

    if (rows.length === 0) return null;

    return this.rowToEntity(rows[0]);
  }

  /**
   * Execute the main expansion query using recursive CTE
   */
  private async executeExpansion(
    db: ReturnType<typeof this.getDatabase>,
    userId: string,
    seedEntityId: string,
    maxHops: number,
    maxEntities: number,
    entityTypes?: string[],
    relationshipTypes?: string[],
    minStrength: number = 0,
    sortByImportance: boolean = true
  ): Promise<ExpandedEntity[]> {
    // Build the recursive CTE query
    // This traverses the relationship graph up to maxHops

    const sql = `
      WITH RECURSIVE graph_traversal AS (
        -- Base case: direct relationships from seed
        SELECT 
          e.entity_id,
          e.user_id,
          e.name,
          e.entity_type,
          e.attributes,
          e.importance,
          e.first_mentioned,
          e.last_mentioned,
          e.mention_count,
          e.created_at,
          e.updated_at,
          r.relationship_type,
          r.strength,
          1 AS depth,
          ARRAY[r.source_entity_id, e.entity_id] AS path
        FROM relationships r
        JOIN entities e ON (
          (r.target_entity_id = e.entity_id AND r.source_entity_id = @seedEntityId)
          OR (r.source_entity_id = e.entity_id AND r.target_entity_id = @seedEntityId AND r.bidirectional = TRUE)
        )
        WHERE r.user_id = @userId
          AND e.user_id = @userId
          AND e.entity_id != @seedEntityId
          AND r.strength >= @minStrength
        
        UNION ALL
        
        -- Recursive case: expand from previously found entities
        SELECT 
          e.entity_id,
          e.user_id,
          e.name,
          e.entity_type,
          e.attributes,
          e.importance,
          e.first_mentioned,
          e.last_mentioned,
          e.mention_count,
          e.created_at,
          e.updated_at,
          r.relationship_type,
          r.strength,
          gt.depth + 1 AS depth,
          ARRAY_CONCAT(gt.path, [e.entity_id]) AS path
        FROM graph_traversal gt
        JOIN relationships r ON (
          (r.source_entity_id = gt.entity_id)
          OR (r.target_entity_id = gt.entity_id AND r.bidirectional = TRUE)
        )
        JOIN entities e ON (
          (r.target_entity_id = e.entity_id AND r.source_entity_id = gt.entity_id)
          OR (r.source_entity_id = e.entity_id AND r.target_entity_id = gt.entity_id AND r.bidirectional = TRUE)
        )
        WHERE r.user_id = @userId
          AND e.user_id = @userId
          AND e.entity_id NOT IN UNNEST(gt.path)
          AND gt.depth < @maxHops
          AND r.strength >= @minStrength
      )
      SELECT DISTINCT ON (entity_id)
        entity_id,
        user_id,
        name,
        entity_type,
        attributes,
        importance,
        first_mentioned,
        last_mentioned,
        mention_count,
        created_at,
        updated_at,
        relationship_type,
        strength,
        depth,
        path
      FROM graph_traversal
      ${entityTypes && entityTypes.length > 0 ? 'WHERE entity_type IN UNNEST(@entityTypes)' : ''}
      ${relationshipTypes && relationshipTypes.length > 0 ? (entityTypes && entityTypes.length > 0 ? 'AND' : 'WHERE') + ' relationship_type IN UNNEST(@relationshipTypes)' : ''}
      ORDER BY ${sortByImportance ? 'importance DESC,' : ''} depth ASC, strength DESC
      LIMIT @maxEntities
    `;

    const params: Record<string, unknown> = {
      userId,
      seedEntityId,
      maxHops,
      maxEntities,
      minStrength,
    };

    if (entityTypes && entityTypes.length > 0) {
      params.entityTypes = entityTypes;
    }
    if (relationshipTypes && relationshipTypes.length > 0) {
      params.relationshipTypes = relationshipTypes;
    }

    try {
      const [rows] = await db.run({ sql, params });

      return rows.map((row) => {
        const json = this.rowToJson(row);
        return {
          entity: this.jsonToEntity(json),
          depth: json.depth as number,
          path: (json.path as string[]) || [],
          relationshipType: json.relationship_type as string | undefined,
          relationshipStrength: json.strength as number | undefined,
        };
      });
    } catch (error) {
      // If recursive CTE fails (e.g., on older Spanner), fall back to iterative approach
      log.debug({ error: String(error) }, 'Recursive CTE failed, using iterative expansion');
      return this.executeIterativeExpansion(
        db,
        userId,
        seedEntityId,
        maxHops,
        maxEntities,
        entityTypes,
        relationshipTypes,
        minStrength,
        sortByImportance
      );
    }
  }

  /**
   * Fallback: Iterative expansion for Spanner versions without recursive CTE
   */
  private async executeIterativeExpansion(
    db: ReturnType<typeof this.getDatabase>,
    userId: string,
    seedEntityId: string,
    maxHops: number,
    maxEntities: number,
    entityTypes?: string[],
    relationshipTypes?: string[],
    minStrength: number = 0,
    sortByImportance: boolean = true
  ): Promise<ExpandedEntity[]> {
    const visited = new Set<string>([seedEntityId]);
    const results: ExpandedEntity[] = [];
    let currentFrontier = [seedEntityId];
    let currentDepth = 0;

    while (currentDepth < maxHops && currentFrontier.length > 0 && results.length < maxEntities) {
      currentDepth++;
      const nextFrontier: string[] = [];

      // Get all entities connected to current frontier
      for (const frontierEntityId of currentFrontier) {
        if (results.length >= maxEntities) break;

        const neighbors = await this.getNeighbors(
          db,
          userId,
          frontierEntityId,
          entityTypes,
          relationshipTypes,
          minStrength
        );

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.entity.entityId) && results.length < maxEntities) {
            visited.add(neighbor.entity.entityId);
            results.push({
              entity: neighbor.entity,
              depth: currentDepth,
              path: [...neighbor.path, neighbor.entity.entityId],
              relationshipType: neighbor.relationshipType,
              relationshipStrength: neighbor.relationshipStrength,
            });
            nextFrontier.push(neighbor.entity.entityId);
          }
        }
      }

      currentFrontier = nextFrontier;
    }

    // Sort results
    if (sortByImportance) {
      results.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return (b.entity.importance || 0) - (a.entity.importance || 0);
      });
    }

    return results.slice(0, maxEntities);
  }

  /**
   * Get direct neighbors of an entity (1-hop)
   */
  private async getNeighbors(
    db: ReturnType<typeof this.getDatabase>,
    userId: string,
    entityId: string,
    entityTypes?: string[],
    relationshipTypes?: string[],
    minStrength: number = 0
  ): Promise<
    Array<{
      entity: GraphEntity;
      path: string[];
      relationshipType: string;
      relationshipStrength: number;
    }>
  > {
    let sql = `
      SELECT 
        e.entity_id,
        e.user_id,
        e.name,
        e.entity_type,
        e.attributes,
        e.importance,
        e.first_mentioned,
        e.last_mentioned,
        e.mention_count,
        e.created_at,
        e.updated_at,
        r.relationship_type,
        r.strength
      FROM relationships r
      JOIN entities e ON (
        (r.target_entity_id = e.entity_id AND r.source_entity_id = @entityId)
        OR (r.source_entity_id = e.entity_id AND r.target_entity_id = @entityId AND r.bidirectional = TRUE)
      )
      WHERE r.user_id = @userId
        AND e.user_id = @userId
        AND e.entity_id != @entityId
        AND r.strength >= @minStrength
    `;

    const params: Record<string, unknown> = {
      userId,
      entityId,
      minStrength,
    };

    if (entityTypes && entityTypes.length > 0) {
      sql += ` AND e.entity_type IN UNNEST(@entityTypes)`;
      params.entityTypes = entityTypes;
    }

    if (relationshipTypes && relationshipTypes.length > 0) {
      sql += ` AND r.relationship_type IN UNNEST(@relationshipTypes)`;
      params.relationshipTypes = relationshipTypes;
    }

    sql += ` ORDER BY r.strength DESC, e.importance DESC LIMIT 20`;

    const [rows] = await db.run({ sql, params });

    return rows.map((row) => {
      const json = this.rowToJson(row);
      return {
        entity: this.jsonToEntity(json),
        path: [entityId],
        relationshipType: json.relationship_type as string,
        relationshipStrength: json.strength as number,
      };
    });
  }

  /**
   * Convert Spanner row to JSON
   */
  private rowToJson(row: unknown): Record<string, unknown> {
    if (typeof row === 'object' && row !== null && 'toJSON' in row) {
      return (row as { toJSON: () => Record<string, unknown> }).toJSON();
    }
    return row as Record<string, unknown>;
  }

  /**
   * Convert Spanner row to GraphEntity
   */
  private rowToEntity(row: unknown): GraphEntity {
    const json = this.rowToJson(row);
    return this.jsonToEntity(json);
  }

  /**
   * Convert JSON to GraphEntity
   */
  private jsonToEntity(json: Record<string, unknown>): GraphEntity {
    return {
      entityId: json.entity_id as string,
      userId: json.user_id as string,
      name: json.name as string,
      entityType: json.entity_type as GraphEntity['entityType'],
      attributes:
        typeof json.attributes === 'string'
          ? JSON.parse(json.attributes)
          : (json.attributes as Record<string, unknown>) || {},
      importance: json.importance as number,
      firstMentioned: json.first_mentioned ? new Date(json.first_mentioned as string) : new Date(),
      lastMentioned: json.last_mentioned ? new Date(json.last_mentioned as string) : new Date(),
      mentionCount: json.mention_count as number,
      createdAt: json.created_at ? new Date(json.created_at as string) : new Date(),
      updatedAt: json.updated_at ? new Date(json.updated_at as string) : new Date(),
    };
  }
}

// ============================================================================
// GQL GRAPH EXPANDER (Enterprise Edition - Future)
// ============================================================================

/**
 * Graph expander using GQL (requires Spanner Enterprise)
 * This is a placeholder for future implementation
 */
export class GQLGraphExpander implements GraphExpander {
  getType(): 'gql' {
    return 'gql';
  }

  isAvailable(): boolean {
    // TODO: Check if Spanner Enterprise is available
    return false;
  }

  async expand(
    userId: string,
    seedEntityId: string,
    options?: GraphExpansionOptions
  ): Promise<GraphExpansionResult> {
    // TODO: Implement GQL-based expansion when Enterprise is available
    throw new Error('GQL expander not yet implemented');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let expanderInstance: GraphExpander | null = null;

/**
 * Get the appropriate graph expander based on available Spanner features
 */
export function getGraphExpander(): GraphExpander {
  if (!expanderInstance) {
    // Try GQL first (Enterprise), fall back to relational (Standard)
    const gqlExpander = new GQLGraphExpander();
    if (gqlExpander.isAvailable()) {
      expanderInstance = gqlExpander;
      log.info('Using GQL graph expander (Enterprise)');
    } else {
      expanderInstance = new RelationalGraphExpander();
      log.info('Using relational graph expander (Standard)');
    }
  }
  return expanderInstance;
}

/**
 * Convenience function for graph expansion
 */
export async function expandGraph(
  userId: string,
  seedEntityId: string,
  options?: GraphExpansionOptions
): Promise<GraphExpansionResult> {
  const expander = getGraphExpander();
  return expander.expand(userId, seedEntityId, options);
}

/**
 * Quick 1-hop expansion (optimized for common case)
 */
export async function getDirectConnections(
  userId: string,
  entityId: string,
  options?: Omit<GraphExpansionOptions, 'maxHops'>
): Promise<ExpandedEntity[]> {
  const result = await expandGraph(userId, entityId, {
    ...options,
    maxHops: 1,
  });
  return result.entities;
}

/**
 * Get 2-hop network (friends of friends)
 */
export async function getExtendedNetwork(
  userId: string,
  entityId: string,
  options?: Omit<GraphExpansionOptions, 'maxHops'>
): Promise<ExpandedEntity[]> {
  const result = await expandGraph(userId, entityId, {
    ...options,
    maxHops: 2,
    sortByImportance: true,
  });
  return result.entities;
}

// ============================================================================
// EXPORTS (classes exported inline above)
// ============================================================================
