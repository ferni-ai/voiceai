/**
 * Jordan Milestone Insights - Metrics & Analysis
 *
 * Computed planning metrics and analysis functions.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/metrics
 */
import type { GoalsOverview, PeterFinancialInsights, HabitInsights, MoodInsights, MemoryInsights, PlanningMetrics, LifeStageContext, SeasonalContext } from './types.js';
export declare function computePlanningMetrics(goalsOverview: GoalsOverview, peterInsights: PeterFinancialInsights, mayaInsights: HabitInsights, moodPatterns: MoodInsights): PlanningMetrics;
export declare function analyzeLifeStageContext(goalsOverview: GoalsOverview, memoryInsights: MemoryInsights): LifeStageContext;
export declare function analyzeSeasonalContext(): SeasonalContext;
//# sourceMappingURL=metrics.d.ts.map