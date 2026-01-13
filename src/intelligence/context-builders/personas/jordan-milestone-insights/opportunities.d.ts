/**
 * Jordan Milestone Insights - Opportunities & Discoveries
 *
 * Celebration opportunities, proactive discoveries, and timeline alerts.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/opportunities
 */
import type { GoalsOverview, PeterFinancialInsights, MemoryInsights, PlanningMetrics, JordanInsightBriefing } from './types.js';
export declare function detectCelebrationOpportunities(goalsOverview: GoalsOverview, planningMetrics: PlanningMetrics, memoryInsights: MemoryInsights): string[];
export declare function generateProactiveDiscoveries(briefing: Omit<JordanInsightBriefing, 'proactiveDiscoveries'>): string[];
export declare function generateTimelineAlerts(goalsOverview: GoalsOverview, peterInsights: PeterFinancialInsights): string[];
//# sourceMappingURL=opportunities.d.ts.map