/**
 * Shared Domain Utilities
 *
 * Common utilities used across domain tools.
 */
// Data Persistence
export { persistInsight, persistKeyMoment, persistTrackedItem, addToSessionContext, queryPastKnowledge, } from './persistence.js';
// Analytics
export { trackToolUsage, trackToolSuccess, trackToolError, getToolMetrics, getDomainMetrics, getAllDomainMetrics, getMostUsedTools, getProblematicTools, getRecentErrors, hasHighErrorRate, hasCrisisToolErrors, getCrisisToolHealth, clearAnalytics, getEventCount, exportEvents, } from './analytics.js';
// Feature Flags (re-exports from central system)
export { isLifeCoachDomainEnabled, getEnabledLifeCoachDomains, isLifeCoachAnalyticsEnabled, emergencyDisableLifeCoachDomain, getFeatureFlags, isFeatureEnabled, reloadFeatureFlags, } from './feature-flags.js';
//# sourceMappingURL=index.js.map