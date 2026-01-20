/**
 * Unified Data Service for CEO CLI
 *
 * Aggregates data from multiple sources (Firestore, existing services, analytics)
 * for CLI commands. Implements caching layer for expensive queries.
 *
 * @module services/ceo/unified-data
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { dataCache } from './cache.js';

// Import all data fetchers
import { getActiveUsers, getCallVolume, getRevenue, getCloudCosts } from './metrics.js';
import { getUserGoals, getUserHabits, getUserJournal, getUserWins } from './user-data.js';
import { getExperiments, getIncidents, getTechDebt } from './business-data.js';

// Re-export types
export type {
  CallMetrics,
  RevenueMetrics,
  CostMetrics,
  Habit,
  JournalEntry,
  Win,
  ExperimentSummary,
  TechDebtItem,
  Period,
  UnifiedDataService,
  CacheStats,
  Goal,
  Incident,
} from './types.js';

const log = createLogger({ module: 'ceo-unified-data' });

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

function clearCache(): void {
  dataCache.clear();
  log.info('Cache cleared');
}

function getCacheStats(): { hits: number; misses: number; size: number } {
  return dataCache.getStats();
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const unifiedDataService = {
  // Metrics
  getActiveUsers,
  getCallVolume,
  getRevenue,
  getCloudCosts,

  // User data
  getUserGoals,
  getUserHabits,
  getUserJournal,
  getUserWins,

  // Business data
  getExperiments,
  getIncidents,
  getTechDebt,

  // Cache management
  clearCache,
  getCacheStats,
};

// Also export individual functions for convenience
export {
  getActiveUsers,
  getCallVolume,
  getRevenue,
  getCloudCosts,
  getUserGoals,
  getUserHabits,
  getUserJournal,
  getUserWins,
  getExperiments,
  getIncidents,
  getTechDebt,
  clearCache,
  getCacheStats,
};
