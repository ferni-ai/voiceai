/**
 * Weather → Habits Cross-Domain Connection
 *
 * "Better Than Human" feature: Proactively suggests habit adjustments
 * based on weather and environmental conditions.
 *
 * Examples:
 * - "Rainy day! How about an indoor workout instead of your run?"
 * - "Air quality is poor today. Maybe skip the outdoor jog."
 * - "Beautiful day! Perfect for taking your walk outside."
 */
import { llm } from '@livekit/agents';
import type { CrossDomainInsight } from './types.js';
/**
 * Generate habit insights based on weather and environmental conditions
 *
 * @param location - City name for weather data
 * @param userHabitsOrUserId - Either an array of habit names OR a userId to fetch real habits
 */
export declare function getWeatherHabitInsights(location: string, userHabitsOrUserId?: string[] | string): Promise<CrossDomainInsight[]>;
/**
 * Get a personalized habit recommendation based on current conditions
 */
export declare function getHabitRecommendation(location: string, habitName: string, habitType?: 'outdoor' | 'indoor' | 'any'): Promise<string>;
export declare function createWeatherHabitsTools(): {
    getWeatherHabitInsights: llm.FunctionTool<{
        location: string;
        userId?: string | undefined;
        userHabits?: string[] | undefined;
    }, unknown, string>;
    getHabitRecommendation: llm.FunctionTool<{
        location: string;
        habitName: string;
        habitType?: "any" | "outdoor" | "indoor" | undefined;
    }, unknown, string>;
};
//# sourceMappingURL=weather-habits.d.ts.map