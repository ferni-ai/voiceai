/**
 * Entity Store - Unified Memory Foundation
 *
 * The single source of truth for all user memory entities.
 * Eliminates fragmentation by storing once, linking everywhere.
 *
 * @module memory/entity-store
 */

// Types
export * from './types.js';

// Store
export { EntityStore, getEntityStore, initializeEntityStore } from './store.js';

// Graph-RAG Retrieval
export { graphRAGRetrieve, GraphRAGRetriever } from './graph-rag.js';

// Proactive Surfacing
export { ProactiveSurfacingEngine, getProactiveSurfacingEngine } from './proactive-surfacing.js';

// Migration
export { migrateUserToEntities, runFullMigration } from './migration.js';

// Integration (for wiring into existing systems)
export {
  initializeEntityStoreIntegration,
  isEntityStoreReady,
  capturePersonEntity,
  captureCommitmentEntity,
  captureEventEntity,
  retrieveMemoriesUnified,
  checkProactiveSurfacing,
} from './integration.js';
