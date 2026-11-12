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
 * import { initializeSpanner, getImportantPeople } from './spanner-graph';
 *
 * // At startup
 * await initializeSpanner();
 *
 * // The people who matter most to the caller
 * const people = await getImportantPeople(userId);
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
  type GraphRelationship,
  type EntityWithFacts,
  // Memory continuity types
  type MemoryThread,
  type MemoryAnchor,
  type MemoryAnchorType,
} from './schema.js';

// Client operations
export {
  initializeSpanner,
  isSpannerReady,
  linkFactToEntity,
  // Memory thread operations
  getMemoryThreadsByUser,
  // Memory anchor operations
  getMemoryAnchorsByUser,
  markAnchorRecalled,
} from './client.js';

// Graph queries
export {
  findEntitiesWithFactPattern,
  getImportantPeople,
  // Domain classification
  classifyFactDomain,
} from './queries.js';

// Graph expansion (Standard Edition compatible)
export {
  // Factory and convenience functions
  getGraphExpander,
  expandGraph,
  getDirectConnections,
  getExtendedNetwork as getExtendedNetworkExpanded,
  // Classes
  RelationalGraphExpander,
  GQLGraphExpander,
  // Types
  type GraphExpander,
  type ExpandedEntity,
  type GraphExpansionOptions,
  type GraphExpansionResult,
} from './graph-expansion.js';

// Path finding
export {
  // Factory and convenience functions
  getPathFinder,
  findPaths,
  findShortestPath,
  areConnected,
  getConnectingEntities,
  // Class
  PathFinder,
  // Types
  type PathStep,
  type EntityPath,
  type PathFindOptions,
  type PathFindResult,
} from './path-finder.js';
