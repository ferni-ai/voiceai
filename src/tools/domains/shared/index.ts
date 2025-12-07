/**
 * Shared Domain Utilities
 *
 * Common utilities used across domain tools.
 */

// Data Persistence
export {
  persistInsight,
  persistKeyMoment,
  persistTrackedItem,
  addToSessionContext,
  queryPastKnowledge,
  type ToolCtxWithUserData,
  type InsightData,
  type KeyMomentData,
  type TrackedItemData,
} from './persistence.js';

// Analytics
export {
  trackToolUsage,
  trackToolSuccess,
  trackToolError,
  getToolMetrics,
  getDomainMetrics,
  getAllDomainMetrics,
  getMostUsedTools,
  getProblematicTools,
  getRecentErrors,
  hasHighErrorRate,
  hasCrisisToolErrors,
  getCrisisToolHealth,
  clearAnalytics,
  getEventCount,
  exportEvents,
  type ToolUsageEvent,
  type ToolMetrics,
  type DomainMetrics,
} from './analytics.js';

// Feature Flags (re-exports from central system)
export {
  isLifeCoachDomainEnabled,
  getEnabledLifeCoachDomains,
  isLifeCoachAnalyticsEnabled,
  emergencyDisableLifeCoachDomain,
  getFeatureFlags,
  isFeatureEnabled,
  reloadFeatureFlags,
  type LifeCoachDomain,
} from './feature-flags.js';
