/**
 * Ambient Calendar Awareness
 *
 * Provides real-time awareness of calendar context during conversations.
 * This enables "better than human" presence - knowing when:
 * - A meeting is coming up (so conversations can wrap up naturally)
 * - A meeting just ended (so we can ask how it went)
 * - The user is currently in a meeting (rare but possible)
 *
 * No human friend tracks your calendar this closely. Ferni does.
 *
 * @module calendar/ambient-calendar-awareness
 */
import { type CalendarEvent } from './calendar-service.js';
export interface AmbientCalendarContext {
    isCalendarConnected: boolean;
    nextMeeting: {
        event: CalendarEvent | null;
        minutesUntil: number | null;
        shouldWarnUser: boolean;
        wrapUpSuggestion: string | null;
    };
    justEndedMeeting: {
        event: CalendarEvent | null;
        minutesSince: number | null;
        followUpPrompt: string | null;
    };
    currentlyInMeeting: boolean;
    currentMeeting: CalendarEvent | null;
    remainingMeetingsToday: number;
    nextBreakDuration: number | null;
    totalRemainingMeetingMinutes: number;
}
/**
 * Get ambient calendar context for the current moment
 *
 * Called at the start of each conversation turn to inject
 * calendar awareness into the agent's context.
 */
export declare function getAmbientCalendarContext(userId: string): Promise<AmbientCalendarContext>;
/**
 * Generate context injection string for the LLM
 *
 * Returns null if there's nothing noteworthy to inject.
 */
export declare function generateAmbientContextInjection(context: AmbientCalendarContext): string | null;
/**
 * Generate a human-readable summary for the user
 */
export declare function generateAmbientSummaryForUser(context: AmbientCalendarContext): string | null;
/**
 * Check if we should interrupt/notify about calendar
 */
export declare function shouldInterruptForCalendar(context: AmbientCalendarContext): boolean;
export declare const ambientCalendarAwareness: {
    getContext: typeof getAmbientCalendarContext;
    generateInjection: typeof generateAmbientContextInjection;
    generateSummary: typeof generateAmbientSummaryForUser;
    shouldInterrupt: typeof shouldInterruptForCalendar;
};
export default ambientCalendarAwareness;
//# sourceMappingURL=ambient-calendar-awareness.d.ts.map