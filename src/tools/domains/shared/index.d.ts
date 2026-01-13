/**
 * Shared Domain Utilities
 *
 * Common utilities used across domain tools.
 */
export { persistInsight, persistKeyMoment, persistTrackedItem, addToSessionContext, queryPastKnowledge, type ToolCtxWithUserData, type InsightData, type KeyMomentData, type TrackedItemData, } from './persistence.js';
export { trackToolUsage, trackToolSuccess, trackToolError, getToolMetrics, getDomainMetrics, getAllDomainMetrics, getMostUsedTools, getProblematicTools, getRecentErrors, hasHighErrorRate, hasCrisisToolErrors, getCrisisToolHealth, clearAnalytics, getEventCount, exportEvents, type ToolUsageEvent, type ToolMetrics, type DomainMetrics, } from './analytics.js';
export { isLifeCoachDomainEnabled, getEnabledLifeCoachDomains, isLifeCoachAnalyticsEnabled, emergencyDisableLifeCoachDomain, getFeatureFlags, isFeatureEnabled, reloadFeatureFlags, type LifeCoachDomain, } from './feature-flags.js';
//# sourceMappingURL=index.d.ts.map