/**
 * Store Services
 *
 * Data store services for various domain entities.
 *
 * Architecture:
 * - Domain stores (productivity, financial, life-data) provide structured CRUD
 * - Unified data layer (../data-layer/) bridges stores with semantic memory
 *
 * See: src/services/data-layer/CLAUDE.md for the unified architecture
 */

export * from './conversation-history.js';
export * from './financial-store.js';
export * from './session-cache.js';

// Export types from type files (source of truth)
export * from './life-data-types.js';
export * from './productivity-types.js';

// Export only functions from store files (NOT types - they're already exported above)
export { getLifeDataStore } from './life-data-store.js';
export {
  getProductivityStore,
  initializeProductivityStore,
  shutdownProductivityStore,
} from './productivity-store.js';

// Re-export unified data layer for convenience
export {
  getUnifiedDataLayer,
  getUnifiedContext,
  searchUserContext,
  indexUserData,
  buildLLMContext,
  warmCache,
  invalidateCache,
} from '../data-layer/index.js';

export {
  onHabitChange,
  onSavingsGoalChange,
  onMilestoneChange,
  onBudgetChange,
  onTaskChange,
  onSubscriptionChange,
  onSpendingTriggerChange,
  onRoutineChange,
  onLifeGoalChange,
  flushPendingChanges,
  getIndexingMetrics,
} from '../data-layer/store-hooks.js';

export {
  onSessionStart,
  onSessionEnd,
  getSessionMetrics,
  flushAllSessions,
  registerShutdownHandler,
} from '../data-layer/session-integration.js';

export { getDataLayerHealth, isHealthy, getDiagnostics } from '../data-layer/health.js';

export { routeQuery, executeRoutedQuery } from '../data-layer/query-router.js';
