/**
 * Pattern-Based Proactive Outreach Integration
 *
 * "Better Than Human" - We notice patterns and reach out at the right moment
 *
 * Connects the pattern detection from live-superhuman-injections.ts to the
 * proactive outreach system. When patterns are detected during conversation,
 * this module schedules appropriate follow-up outreach.
 *
 * Examples:
 * - Sunday evening anxiety pattern → Schedule Monday morning check-in
 * - Work stress detected → Schedule evening support call
 * - Relationship tension mentioned → Schedule thoughtful check-in next day
 *
 * @module services/outreach/pattern-outreach-integration
 */
import { type OutreachTriggerPayload } from './trigger-publisher.js';
export interface PatternTrigger {
    pattern: string;
    patternDescription: string;
    tendency: string;
    suggestedOutreach: string;
    actionable: string;
}
export interface PatternOutreachContext {
    userId: string;
    sessionId: string;
    personaId?: string;
    currentEmotion?: string;
    emotionIntensity?: number;
    topics?: string[];
}
interface OutreachSchedule {
    triggerType: OutreachTriggerPayload['type'];
    priority: OutreachTriggerPayload['priority'];
    delayMinutes: number;
    suggestedTime?: {
        hour: number;
        dayOffset: number;
    };
}
/**
 * Map pattern types to outreach strategies
 */
declare const PATTERN_OUTREACH_MAP: Record<string, OutreachSchedule>;
/**
 * Schedule proactive outreach based on detected pattern
 *
 * This is the main entry point - called from live-superhuman-injections
 * when a pattern is detected during conversation.
 */
export declare function schedulePatternOutreach(pattern: PatternTrigger, ctx: PatternOutreachContext): Promise<void>;
/**
 * Fire-and-forget version for use in hot paths
 */
export declare function schedulePatternOutreachAsync(pattern: PatternTrigger, ctx: PatternOutreachContext): void;
/**
 * Calculate when outreach should happen based on schedule
 */
declare function calculateScheduledTime(schedule: OutreachSchedule): Date;
/**
 * Schedule Sunday evening anxiety follow-up
 * Called when user shows pre-Monday anxiety on Sunday
 */
export declare function scheduleSundayAnxietyFollowUp(userId: string, sessionId: string, anxietyLevel: number): Promise<void>;
/**
 * Schedule work stress evening check-in
 * Called when user is stressed about work during the day
 */
export declare function scheduleWorkStressFollowUp(userId: string, sessionId: string, stressTopics: string[]): Promise<void>;
/**
 * Schedule relationship tension gentle check-in
 * Called when user mentions relationship stress
 */
export declare function scheduleRelationshipCheckIn(userId: string, sessionId: string, relationshipType: string): Promise<void>;
/**
 * Get next occurrence of a specific weekday at a specific hour
 */
declare function getNextWeekdayAt(targetDay: number, hour: number): Date;
/**
 * Get next occurrence of a specific hour (today or tomorrow)
 */
declare function getNextTimeAt(hour: number): Date;
export { PATTERN_OUTREACH_MAP, calculateScheduledTime, getNextWeekdayAt, getNextTimeAt };
//# sourceMappingURL=pattern-outreach-integration.d.ts.map