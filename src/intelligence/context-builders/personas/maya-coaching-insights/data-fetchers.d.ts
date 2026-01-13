/**
 * Data fetching functions for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/data-fetchers
 */
import type { HabitHealthSummary, MoodIntelligence, MemoryInsights } from './types.js';
export declare function analyzeHabitHealth(userId: string): HabitHealthSummary;
export declare function analyzeMoodIntelligence(userId: string): Promise<MoodIntelligence>;
export declare function getPeterPatternInsights(userId: string): Promise<string[]>;
export declare function getJordanGoalInsights(userId: string): string[];
export declare function getMemoryInsights(userId: string): MemoryInsights;
//# sourceMappingURL=data-fetchers.d.ts.map