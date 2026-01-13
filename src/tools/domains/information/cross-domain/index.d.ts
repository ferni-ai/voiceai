/**
 * Cross-Domain Connections Index
 *
 * Aggregates all cross-domain connection tools for "Better Than Human" features.
 *
 * These tools connect information from different domains to provide
 * proactive, contextually aware insights that anticipate user needs.
 */
import { llm } from '@livekit/agents';
import type { ToolDefinition } from '../../../registry/types.js';
export declare function createCrossDomainTools(): {
    getCommuteSuggestions: llm.FunctionTool<{
        commuteTime: number;
        trafficSeverity: "moderate" | "light" | "heavy" | "severe";
        hasUpcomingMeeting?: boolean | undefined;
    }, unknown, string>;
    getTrafficProductivityInsights: llm.FunctionTool<{
        commuteTime: number;
        trafficSeverity: "moderate" | "light" | "heavy" | "severe";
        hasUpcomingMeeting?: boolean | undefined;
    }, unknown, string>;
    suggestPreMeetingPepTalk: llm.FunctionTool<{
        meetingType?: string | undefined;
        minutesUntilMeeting?: number | undefined;
    }, unknown, string>;
    analyzeNewsMoodImpact: llm.FunctionTool<{
        newsHeadlines: string[];
        userMoodState?: "calm" | "neutral" | "excited" | "anxious" | "happy" | "sad" | "frustrated" | "stressed" | "tired" | undefined;
    }, unknown, string>;
    getPositiveNewsOnly: llm.FunctionTool<{
        newsHeadlines: string[];
    }, unknown, string>;
    shouldSkipNews: llm.FunctionTool<{
        newsHeadlines: string[];
        userMoodState: "calm" | "neutral" | "excited" | "anxious" | "happy" | "sad" | "frustrated" | "stressed" | "tired";
    }, unknown, string>;
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
/**
 * Get tool definitions for cross-domain connection tools
 */
export declare function getCrossDomainToolDefinitions(): ToolDefinition[];
export { createWeatherHabitsTools } from './weather-habits.js';
export { createNewsMoodTools } from './news-mood.js';
export { createTrafficProductivityTools } from './traffic-productivity.js';
export type { CrossDomainInsight, DomainType, ConnectionType, MoodContext, MoodState, HabitRecommendationContext, NewsMoodAnalysis, TrafficProductivityContext, CommuteSuggestion, WeatherHabitMapping, GrayDayPattern, } from './types.js';
export { getWeatherHabitInsights, getHabitRecommendation } from './weather-habits.js';
export { analyzeNewsMoodImpact, generateNewsMoodIntro, getNewsMoodInsights, filterPositiveNews, generateUpliftingNewsSummary, } from './news-mood.js';
export { generateCommuteSuggestions, getTrafficProductivityInsights, formatCommuteSuggestions, } from './traffic-productivity.js';
//# sourceMappingURL=index.d.ts.map