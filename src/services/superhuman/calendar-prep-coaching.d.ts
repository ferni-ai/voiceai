/**
 * Calendar Prep Coaching - Better Than Human Event Preparation
 *
 * Proactively coaches before difficult calendar events:
 * - Identifies challenging upcoming events
 * - Recalls past experiences with similar events
 * - Offers preparation support before the event
 * - Follows up after
 *
 * WHY IT'S SUPERHUMAN: No friend knows your calendar AND your history
 * with specific types of events to offer timely, relevant prep coaching.
 *
 * @module services/superhuman/calendar-prep-coaching
 */
export type EventDifficulty = 'high' | 'medium' | 'low' | 'unknown';
export type EventType = 'performance_review' | 'difficult_conversation' | 'presentation' | 'interview' | 'meeting_with_authority' | 'conflict_resolution' | 'negotiation' | 'social_obligation' | 'medical' | 'legal' | 'family_gathering' | 'first_meeting' | 'deadline' | 'other';
export interface CalendarEvent {
    id: string;
    title: string;
    startTime: number;
    endTime: number;
    attendees?: string[];
    location?: string;
    description?: string;
}
export interface EventHistory {
    userId: string;
    eventType: EventType;
    /** Keywords in event titles that match this type */
    matchingKeywords: string[];
    /** People involved */
    involvedPeople: string[];
    /** How they felt before */
    preEventFeelings: string[];
    /** How it went */
    outcomes: Array<{
        date: number;
        outcome: 'positive' | 'neutral' | 'negative';
        reflection?: string;
    }>;
    /** What helped them prepare */
    helpfulPrep: string[];
    /** What they wish they'd done differently */
    wouldDoDifferently: string[];
    /** Average anxiety level 0-1 */
    averageAnxiety: number;
}
export interface PrepCoachingSession {
    eventId: string;
    userId: string;
    eventType: EventType;
    eventTitle: string;
    eventTime: number;
    /** When we offered prep */
    prepOfferedAt?: number;
    /** Whether they engaged with prep */
    prepEngaged: boolean;
    /** Follow-up scheduled */
    followUpScheduled?: number;
    /** Post-event reflection captured */
    reflectionCaptured: boolean;
}
export interface PrepRecommendation {
    eventType: EventType;
    difficulty: EventDifficulty;
    /** Hours before event to offer prep */
    prepWindowHours: number;
    /** Specific prep suggestions */
    suggestions: string[];
    /** Questions to consider */
    reflectionQuestions: string[];
    /** Historical context for this person */
    historicalContext?: string;
}
/**
 * Classify a calendar event by type and difficulty.
 */
export declare function classifyEvent(event: CalendarEvent, eventHistory?: EventHistory[]): {
    type: EventType;
    difficulty: EventDifficulty;
};
/**
 * Load event history for a user.
 */
export declare function loadEventHistory(userId: string): Promise<EventHistory[]>;
/**
 * Record an event outcome for learning.
 */
export declare function recordEventOutcome(userId: string, eventType: EventType, outcome: 'positive' | 'neutral' | 'negative', reflection?: string, helpfulPrep?: string[], wouldDoDifferently?: string[]): Promise<void>;
/**
 * Generate prep recommendations for an event.
 */
export declare function getPrepRecommendations(userId: string, event: CalendarEvent): Promise<PrepRecommendation>;
/**
 * Build context for LLM injection based on upcoming events.
 */
export declare function buildCalendarPrepContext(userId: string, upcomingEvents?: CalendarEvent[]): Promise<string>;
export declare const calendarPrepCoaching: {
    classify: typeof classifyEvent;
    loadHistory: typeof loadEventHistory;
    recordOutcome: typeof recordEventOutcome;
    getRecommendations: typeof getPrepRecommendations;
    buildContext: typeof buildCalendarPrepContext;
};
//# sourceMappingURL=calendar-prep-coaching.d.ts.map