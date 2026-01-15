/**
 * Path Finder for Spanner Graph
 *
 * Finds shortest paths and connections between entities using
 * optimized relational queries (Standard Edition compatible).
 *
 * Use cases:
 * - "How are Mike and Sarah connected?"
 * - "Find the path from work to personal life"
 * - "Who can introduce me to X?"
 *
 * @module memory/spanner-graph/path-finder
 */

import { Spanner } from '@google-cloud/spanner';
import { createLogger } from '../../utils/safe-logger.js';
import { SPANNER_CONFIG, type GraphEntity, type GraphRelationship } from './schema.js';
import { isSpannerReady } from './client.js';

const log = createLogger({ module: 'SpannerPathFinder' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A step in a path between entities
 */
export interface PathStep {
  /** Entity at this step */
  entity: GraphEntity;
  /** Relationship type that led here (null for start) */
  relationshipType: string | null;
  /** Relationship strength */
  relationshipStrength: number;
  /** Direction: 'outgoing' if we followed source->target, 'incoming' if target->source */
  direction: 'outgoing' | 'incoming' | null;
}

/**
 * A complete path between two entities
 */
export interface EntityPath {
  /** Starting entity */
  source: GraphEntity;
  /** Ending entity */
  target: GraphEntity;
  /** Steps in the path (including source and target) */
  steps: PathStep[];
  /** Total path length (number of hops) */
  length: number;
  /** Path strength (product of relationship strengths) */
  pathStrength: number;
  /** Human-readable path description */
  description: string;
}

/**
 * Path finding options
 */
export interface PathFindOptions {
  /** Maximum path length to search (default: 4) */
  maxLength?: number;
  /** Maximum number of paths to return (default: 5) */
  maxPaths?: number;
  /** Filter by relationship types to traverse */
  relationshipTypes?: string[];
  /** Minimum relationship strength to traverse */
  minStrength?: number;
  /** Whether to find all paths or just shortest (default: 'shortest') */
  mode?: 'shortest' | 'all';
}

/**
 * Path finding result
 */
export interface PathFindResult {
  /** Found paths (shortest first) */
  paths: EntityPath[];
  /** Whether source and target are connected */
  connected: boolean;
  /** Metrics */
  metrics: {
    pathsFound: number;
    shortestLength: number | null;
    queryTimeMs: number;
  };
}

// ============================================================================
// PATH FINDER IMPLEMENTATION
// ============================================================================

/**
 * Path finder using bidirectional BFS
 * Optimized for Standard Edition Spanner
 */
export class PathFinder {
  private spanner: Spanner;

  constructor() {
    this.spanner = new Spanner({ projectId: SPANNER_CONFIG.projectId });
  }

  private getDatabase() {
    const instance = this.spanner.instance(SPANNER_CONFIG.instanceId);
    return instance.database(SPANNER_CONFIG.databaseId);
  }

  /**
   * Find paths between two entities
   */
  async findPaths(
    userId: string,
    sourceEntityId: string,
    targetEntityId: string,
    options: PathFindOptions = {}
  ): Promise<PathFindResult> {
    const startTime = Date.now();
    const {
      maxLength = 4,
      maxPaths = 5,
      relationshipTypes,
      minStrength = 0,
      mode = 'shortest',
    } = options;

    if (!isSpannerReady()) {
      return {
        paths: [],
        connected: false,
        metrics: {
          pathsFound: 0,
          shortestLength: null,
          queryTimeMs: Date.now() - startTime,
        },
      };
    }

    // Same entity
    if (sourceEntityId === targetEntityId) {
      const entity = await this.getEntity(userId, sourceEntityId);
      if (entity) {
        return {
          paths: [{
            source: entity,
            target: entity,
            steps: [{ entity, relationshipType: null, relationshipStrength: 1, direction: null }],
            length: 0,
            pathStrength: 1,
            description: `${entity.name} (same entity)`,
          }],
          connected: true,
          metrics: {
            pathsFound: 1,
            shortestLength: 0,
            queryTimeMs: Date.now() - startTime,
          },
        };
      }
    }

    try {
      // Use bidirectional BFS for efficiency
      const paths = await this.bidirectionalBFS(
        userId,
        sourceEntityId,
        targetEntityId,
        maxLength,
        maxPaths,
        relationshipTypes,
        minStrength,
        mode
      );

      const shortestLength = paths.length > 0
        ? Math.min(...paths.map(p => p.length))
        : null;

      return {
        paths,
        connected: paths.length > 0,
        metrics: {
          pathsFound: paths.length,
          shortestLength,
          queryTimeMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      log.warn(
        { error: String(error), userId, sourceEntityId, targetEntityId },
        'Path finding failed'
      );
      return {
        paths: [],
        connected: false,
        metrics: {
          pathsFound: 0,
          shortestLength: null,
          queryTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Bidirectional BFS for path finding
   * Searches from both source and target simultaneously
   */
  private async bidirectionalBFS(
    userId: string,
    sourceEntityId: string,
    targetEntityId: string,
    maxLength: number,
    maxPaths: number,
    relationshipTypes?: string[],
    minStrength: number = 0,
    mode: 'shortest' | 'all' = 'shortest'
  ): Promise<EntityPath[]> {
    const db = this.getDatabase();

    try {
      // Get source and target entities
      const [source, target] = await Promise.all([
        this.getEntity(userId, sourceEntityId),
        this.getEntity(userId, targetEntityId),
      ]);

      if (!source || !target) {
        return [];
      }

      // BFS from both ends
      const forwardVisited = new Map<string, { path: PathStep[]; depth: number }>();
      const backwardVisited = new Map<string, { path: PathStep[]; depth: number }>();

      // Initialize
      forwardVisited.set(sourceEntityId, {
        path: [{ entity: source, relationshipType: null, relationshipStrength: 1, direction: null }],
        depth: 0,
      });
      backwardVisited.set(targetEntityId, {
        path: [{ entity: target, relationshipType: null, relationshipStrength: 1, direction: null }],
        depth: 0,
      });

      let forwardFrontier = [sourceEntityId];
      let backwardFrontier = [targetEntityId];
      const foundPaths: EntityPath[] = [];
      let currentDepth = 0;

      while (
        currentDepth < maxLength &&
        foundPaths.length < maxPaths &&
        (forwardFrontier.length > 0 || backwardFrontier.length > 0)
      ) {
        currentDepth++;

        // Expand forward
        if (forwardFrontier.length > 0) {
          const newForwardFrontier: string[] = [];

          for (const entityId of forwardFrontier) {
            const neighbors = await this.getNeighbors(
              db,
              userId,
              entityId,
              relationshipTypes,
              minStrength
            );

            for (const neighbor of neighbors) {
              const neighborId = neighbor.entity.entityId;
              
              // Check if we've found a path (backward search reached this node)
              if (backwardVisited.has(neighborId)) {
                const forwardPath = forwardVisited.get(entityId)!;
                const backwardPath = backwardVisited.get(neighborId)!;
                
                const path = this.constructPath(
                  source,
                  target,
                  forwardPath.path,
                  backwardPath.path,
                  neighbor
                );
                
                if (path) {
                  foundPaths.push(path);
                  if (mode === 'shortest' || foundPaths.length >= maxPaths) {
                    return foundPaths;
                  }
                }
              }

              // Continue searching if not visited
              if (!forwardVisited.has(neighborId)) {
                const currentPath = forwardVisited.get(entityId)!;
                forwardVisited.set(neighborId, {
                  path: [...currentPath.path, {
                    entity: neighbor.entity,
                    relationshipType: neighbor.relationshipType,
                    relationshipStrength: neighbor.relationshipStrength,
                    direction: neighbor.direction,
                  }],
                  depth: currentDepth,
                });
                newForwardFrontier.push(neighborId);
              }
            }
          }

          forwardFrontier = newForwardFrontier;
        }

        // Expand backward (similar logic)
        if (backwardFrontier.length > 0 && foundPaths.length < maxPaths) {
          const newBackwardFrontier: string[] = [];

          for (const entityId of backwardFrontier) {
            const neighbors = await this.getNeighbors(
              db,
              userId,
              entityId,
              relationshipTypes,
              minStrength
            );

            for (const neighbor of neighbors) {
              const neighborId = neighbor.entity.entityId;

              // Check if forward search reached this node
              if (forwardVisited.has(neighborId)) {
                const forwardPath = forwardVisited.get(neighborId)!;
                const backwardPath = backwardVisited.get(entityId)!;
                
                const reversedDirection: 'outgoing' | 'incoming' = neighbor.direction === 'outgoing' ? 'incoming' : 'outgoing';
                const extendedBackwardPath: PathStep[] = [
                  ...backwardPath.path,
                  {
                    entity: neighbor.entity,
                    relationshipType: neighbor.relationshipType,
                    relationshipStrength: neighbor.relationshipStrength,
                    direction: reversedDirection,
                  },
                ];
                const path = this.constructPath(
                  source,
                  target,
                  forwardPath.path,
                  extendedBackwardPath.reverse(),
                  null
                );
                
                if (path && !this.pathExists(foundPaths, path)) {
                  foundPaths.push(path);
                  if (mode === 'shortest' || foundPaths.length >= maxPaths) {
                    return foundPaths;
                  }
                }
              }

              // Continue searching if not visited
              if (!backwardVisited.has(neighborId)) {
                const currentPath = backwardVisited.get(entityId)!;
                backwardVisited.set(neighborId, {
                  path: [...currentPath.path, {
                    entity: neighbor.entity,
                    relationshipType: neighbor.relationshipType,
                    relationshipStrength: neighbor.relationshipStrength,
                    direction: neighbor.direction,
                  }],
                  depth: currentDepth,
                });
                newBackwardFrontier.push(neighborId);
              }
            }
          }

          backwardFrontier = newBackwardFrontier;
        }
      }

      return foundPaths;
    } finally {
      await db.close();
    }
  }

  /**
   * Get neighbors of an entity
   */
  private async getNeighbors(
    db: ReturnType<typeof this.getDatabase>,
    userId: string,
    entityId: string,
    relationshipTypes?: string[],
    minStrength: number = 0
  ): Promise<Array<{
    entity: GraphEntity;
    relationshipType: string;
    relationshipStrength: number;
    direction: 'outgoing' | 'incoming';
  }>> {
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
        r.strength,
        CASE 
          WHEN r.source_entity_id = @entityId THEN 'outgoing'
          ELSE 'incoming'
        END as direction
      FROM relationships r
      JOIN entities e ON (
        (r.target_entity_id = e.entity_id AND r.source_entity_id = @entityId)
        OR (r.source_entity_id = e.entity_id AND r.target_entity_id = @entityId)
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

    if (relationshipTypes && relationshipTypes.length > 0) {
      sql += ` AND r.relationship_type IN UNNEST(@relationshipTypes)`;
      params.relationshipTypes = relationshipTypes;
    }

    sql += ` ORDER BY r.strength DESC LIMIT 20`;

    const [rows] = await db.run({ sql, params });

    return rows.map(row => {
      const json = this.rowToJson(row);
      return {
        entity: this.jsonToEntity(json),
        relationshipType: json.relationship_type as string,
        relationshipStrength: json.strength as number,
        direction: json.direction as 'outgoing' | 'incoming',
      };
    });
  }

  /**
   * Get a single entity
   */
  private async getEntity(userId: string, entityId: string): Promise<GraphEntity | null> {
    const db = this.getDatabase();

    try {
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

      return this.jsonToEntity(this.rowToJson(rows[0]));
    } finally {
      await db.close();
    }
  }

  /**
   * Construct a complete path from forward and backward search results
   */
  private constructPath(
    source: GraphEntity,
    target: GraphEntity,
    forwardPath: PathStep[],
    backwardPath: PathStep[],
    connection: { entity: GraphEntity; relationshipType: string; relationshipStrength: number; direction: 'outgoing' | 'incoming' } | null
  ): EntityPath | null {
    const steps: PathStep[] = [...forwardPath];

    if (connection) {
      steps.push({
        entity: connection.entity,
        relationshipType: connection.relationshipType,
        relationshipStrength: connection.relationshipStrength,
        direction: connection.direction,
      });
    }

    // Add backward path (reversed, excluding first element which is the meeting point)
    const reversedBackward = [...backwardPath].reverse().slice(1);
    for (const step of reversedBackward) {
      steps.push({
        ...step,
        direction: step.direction === 'outgoing' ? 'incoming' : 'outgoing',
      });
    }

    // Calculate path strength (product of all relationship strengths)
    const pathStrength = steps.reduce(
      (acc, step) => acc * (step.relationshipStrength || 1),
      1
    );

    // Build description
    const description = steps.map(s => s.entity.name).join(' → ');

    return {
      source,
      target,
      steps,
      length: steps.length - 1,
      pathStrength,
      description,
    };
  }

  /**
   * Check if a path already exists in the found paths
   */
  private pathExists(paths: EntityPath[], newPath: EntityPath): boolean {
    const newPathIds = newPath.steps.map(s => s.entity.entityId).join(',');
    return paths.some(p => p.steps.map(s => s.entity.entityId).join(',') === newPathIds);
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
   * Convert JSON to GraphEntity
   */
  private jsonToEntity(json: Record<string, unknown>): GraphEntity {
    return {
      entityId: json.entity_id as string,
      userId: json.user_id as string,
      name: json.name as string,
      entityType: json.entity_type as GraphEntity['entityType'],
      attributes: typeof json.attributes === 'string'
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
// SINGLETON & EXPORTS
// ============================================================================

let pathFinderInstance: PathFinder | null = null;

/**
 * Get the path finder singleton
 */
export function getPathFinder(): PathFinder {
  if (!pathFinderInstance) {
    pathFinderInstance = new PathFinder();
  }
  return pathFinderInstance;
}

/**
 * Convenience function to find paths
 */
export async function findPaths(
  userId: string,
  sourceEntityId: string,
  targetEntityId: string,
  options?: PathFindOptions
): Promise<PathFindResult> {
  const finder = getPathFinder();
  return finder.findPaths(userId, sourceEntityId, targetEntityId, options);
}

/**
 * Find the shortest path between two entities
 */
export async function findShortestPath(
  userId: string,
  sourceEntityId: string,
  targetEntityId: string
): Promise<EntityPath | null> {
  const result = await findPaths(userId, sourceEntityId, targetEntityId, {
    maxPaths: 1,
    mode: 'shortest',
  });
  return result.paths[0] || null;
}

/**
 * Check if two entities are connected (within maxLength hops)
 */
export async function areConnected(
  userId: string,
  entityId1: string,
  entityId2: string,
  maxLength: number = 3
): Promise<boolean> {
  const result = await findPaths(userId, entityId1, entityId2, {
    maxPaths: 1,
    maxLength,
    mode: 'shortest',
  });
  return result.connected;
}

/**
 * Get entities that connect two other entities (mutual friends)
 */
export async function getConnectingEntities(
  userId: string,
  entityId1: string,
  entityId2: string
): Promise<GraphEntity[]> {
  const result = await findPaths(userId, entityId1, entityId2, {
    maxPaths: 5,
    maxLength: 2, // Only look for mutual connections
    mode: 'all',
  });

  // Extract intermediate entities from length-2 paths
  const connectingEntities: GraphEntity[] = [];
  const seen = new Set<string>();

  for (const path of result.paths) {
    if (path.length === 2 && path.steps.length === 3) {
      const middleEntity = path.steps[1].entity;
      if (!seen.has(middleEntity.entityId)) {
        seen.add(middleEntity.entityId);
        connectingEntities.push(middleEntity);
      }
    }
  }

  return connectingEntities;
}
