/**
 * Proactive Calendar Intelligence
 *
 * Provides proactive insights and assistance:
 * 1. Pre-meeting briefings (prep before important meetings)
 * 2. Post-meeting follow-ups (capture action items)
 * 3. Conflict detection with suggestions
 * 4. Smart recurring event suggestions
 *
 * Designed to make Alex "superhuman" at calendar management.
 */
import { type CalendarEvent } from './calendar-service.js';
export interface PreMeetingBriefing {
    eventId: string;
    eventTitle: string;
    startsAt: Date;
    minutesUntil: number;
    briefing: {
        summary: string;
        prepTips: string[];
        relevantContext?: string;
        attendeeInfo?: string;
    };
    priority: 'high' | 'medium' | 'low';
}
export interface PostMeetingFollowUp {
    eventId: string;
    eventTitle: string;
    endedAt: Date;
    prompts: string[];
    suggestedActions: string[];
}
export interface ConflictAnalysis {
    hasConflict: boolean;
    conflictingEvents: CalendarEvent[];
    severity: 'hard' | 'soft' | 'warning';
    description: string;
    suggestions: {
        alternativeTime: Date;
        description: string;
    }[];
}
export interface RecurringSuggestion {
    title: string;
    suggestedPattern: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    confidence: number;
    reasoning: string;
    suggestedTime?: {
        hour: number;
        minute: number;
        dayOfWeek?: number;
    };
}
/**
 * Get pre-meeting briefings for upcoming events
 *
 * Returns briefings for events starting within the specified window.
 * Prioritizes high-importance meetings (interviews, presentations, etc.)
 */
export declare function getUpcomingBriefings(userId: string, windowMinutes?: number): Promise<PreMeetingBriefing[]>;
/**
 * Get post-meeting follow-up prompts for recently ended events
 *
 * Returns follow-ups for events that ended within the specified window.
 */
export declare function getPostMeetingFollowUps(userId: string, windowMinutes?: number): Promise<PostMeetingFollowUp[]>;
/**
 * Analyze conflicts for a proposed event
 *
 * Returns detailed conflict analysis with suggestions.
 */
export declare function analyzeConflicts(userId: string, proposedStart: Date, proposedEnd: Date, eventTitle?: string): Promise<ConflictAnalysis>;
/**
 * Suggest recurring events based on calendar patterns
 *
 * Analyzes past events to identify patterns that could become recurring.
 * Note: This is a simplified version that uses the available CalendarPatterns.
 */
export declare function suggestRecurringEvents(userId: string): Promise<RecurringSuggestion[]>;
/**
 * Find the best time for a new event based on preferences and patterns
 *
 * ENHANCED WITH "BETTER THAN HUMAN" ENERGY-AWARE SCHEDULING:
 * - Uses learned meeting patterns for optimal time detection
 * - Considers user's energy peaks and focus time preferences
 * - Avoids times the user typically avoids
 * - Respects clustering preferences (batched vs spread meetings)
 */
export declare function findBestTimeFor(userId: string, duration: number, preferences?: {
    preferMorning?: boolean;
    preferAfternoon?: boolean;
    avoidBackToBack?: boolean;
    minGapMinutes?: number;
    meetingType?: 'oneOnOne' | 'teamMeeting' | 'clientCall' | 'standup' | 'general';
}): Promise<{
    time: Date;
    score: number;
    reasoning: string;
}[]>;
//# sourceMappingURL=proactive-calendar.d.ts.map