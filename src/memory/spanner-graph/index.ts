/**
 * Spanner Graph Module
 *
 * L3 Long-Term Memory storage using Google Cloud Spanner's native graph capabilities.
 *
 * Architecture:
 * - Relational tables as source of truth
 * - Property graph (FerniMemory) for relationship traversal
 * - GQL queries for complex graph patterns
 *
 * Usage:
 * ```typescript
 * import { initializeSpanner, getEntityWithFacts, getEntityRelationships } from './spanner-graph';
 *
 * // At startup
 * await initializeSpanner();
 *
 * // Query entity with all facts
 * const mike = await getEntityWithFacts(userId, 'Mike');
 *
 * // Get Mike's relationship network
 * const relationships = await getEntityRelationships(userId, 'Mike');
 * ```
 *
 * @see docs/architecture/DYNAMIC-MEMORY-ARCHITECTURE.md
 * @module memory/spanner-graph
 */

// Schema and types
export {
  SPANNER_CONFIG,
  TABLE_DDL,
  GRAPH_DDL,
  type GraphEntity,
  type GraphFact,
  type GraphRelationship,
  type EntityWithFacts,
  type RelationshipResult,
} from './schema.js';

// Client operations
export {
  initializeSpanner,
  isSpannerReady,
  upsertEntity,
  insertFact,
  insertRelationship,
  linkFactToEntity,
  getEntitiesByUser,
  getEntityByName,
  closeSpanner,
} from './client.js';

// Graph queries
export {
  getEntityWithFacts,
  getEntityRelationships,
  getExtendedNetwork,
  findEntitiesWithFactPattern,
  getImportantPeople,
} from './queries.js';
