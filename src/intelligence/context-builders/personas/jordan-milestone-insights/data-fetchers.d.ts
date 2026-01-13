/**
 * Jordan Milestone Insights - Data Fetchers
 *
 * Functions to fetch data from various stores (cross-team integration).
 *
 * @module intelligence/context-builders/jordan-milestone-insights/data-fetchers
 */
import type { GoalsOverview, PeterFinancialInsights, HabitInsights, MoodInsights, MemoryInsights } from './types.js';
export declare function analyzeGoalsOverview(userId: string): Promise<GoalsOverview>;
export declare function getPeterFinancialInsights(userId: string): Promise<PeterFinancialInsights>;
export declare function getMayaHabitInsights(userId: string): Promise<HabitInsights>;
export declare function getMoodPatterns(userId: string): Promise<MoodInsights>;
export declare function getMemoryOrchestratorInsights(userId: string): Promise<MemoryInsights>;
//# sourceMappingURL=data-fetchers.d.ts.map