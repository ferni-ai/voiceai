/**
 * Data fetching functions for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/data-fetchers
 */
import type { HabitInsights, MoodInsights, MemoryInsights, CalendarResearchContext } from './types.js';
export declare function analyzeSpendingPatterns(userId: string): Promise<string[]>;
export declare function getMayaHabitInsights(userId: string): Promise<HabitInsights>;
export declare function getMoodPatterns(userId: string): Promise<MoodInsights>;
export declare function getMemoryOrchestratorInsights(userId: string): Promise<MemoryInsights>;
export declare function analyzeGoalTrajectory(userId: string): Promise<string[]>;
export declare function buildCalendarResearchContext(userId: string): Promise<CalendarResearchContext | null>;
//# sourceMappingURL=data-fetchers.d.ts.map