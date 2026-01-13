/**
 * Traffic → Productivity Cross-Domain Connection
 *
 * "Better Than Human" feature: Turns commute time into productive
 * or enjoyable time with personalized suggestions.
 *
 * Examples:
 * - "Long commute ahead! Want to listen to that podcast episode?"
 * - "Traffic is heavy. Perfect time for a quick meditation."
 * - "You've got extra time - want a pep talk before your meeting?"
 */
import { llm } from '@livekit/agents';
import type { CrossDomainInsight, TrafficProductivityContext, CommuteSuggestion } from './types.js';
/**
 * Generate commute suggestions based on traffic and context
 */
export declare function generateCommuteSuggestions(commuteTime: number, trafficSeverity: TrafficProductivityContext['trafficSeverity'], hasUpcomingMeeting?: boolean): CommuteSuggestion[];
/**
 * Analyze traffic situation and generate productivity insights
 */
export declare function getTrafficProductivityInsights(commuteTime: number, trafficSeverity: TrafficProductivityContext['trafficSeverity'], hasUpcomingMeeting?: boolean): Promise<CrossDomainInsight[]>;
/**
 * Format commute suggestions as a friendly message
 */
export declare function formatCommuteSuggestions(suggestions: CommuteSuggestion[]): string;
export declare function createTrafficProductivityTools(): {
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
};
//# sourceMappingURL=traffic-productivity.d.ts.map