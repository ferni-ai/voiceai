/**
 * Life Event Detection & Tracking
 *
 * Detects and remembers important dates and life events mentioned
 * in conversations, enabling proactive, thoughtful check-ins.
 *
 * Philosophy: A good friend remembers what's coming up in your life
 * and checks in at the right moments.
 *
 * Event Types:
 * - Deadlines (work projects, applications)
 * - Appointments (doctor, interviews)
 * - Milestones (birthdays, anniversaries)
 * - Events (travel, presentations, parties)
 * - Recurring (weekly meetings, monthly reviews)
 *
 * @module LifeEvents
 */
export type EventType = 'deadline' | 'appointment' | 'milestone' | 'event' | 'recurring' | 'travel' | 'health' | 'work' | 'personal' | 'interview';
export type EventSentiment = 'excited' | 'nervous' | 'dreading' | 'neutral' | 'hopeful' | 'uncertain';
export interface LifeEvent {
    id: string;
    userId: string;
    description: string;
    date: Date;
    endDate?: Date;
    type: EventType;
    sentiment?: EventSentiment;
    importance: 'high' | 'medium' | 'low';
    recurring?: {
        frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
        nextOccurrence?: Date;
    };
    context: {
        mentionedAt: Date;
        originalText: string;
        topic?: string;
    };
    followUp: {
        beforeReminder: boolean;
        afterCheckIn: boolean;
        reminderSent?: Date;
        checkInSent?: Date;
        outcome?: 'positive' | 'negative' | 'neutral' | 'unknown';
    };
    relatedPeople?: string[];
    tags: string[];
}
export interface EventDetectionResult {
    detected: boolean;
    event?: Partial<LifeEvent>;
    confidence: number;
    signals: string[];
}
export interface UpcomingEventSummary {
    today: LifeEvent[];
    thisWeek: LifeEvent[];
    nextWeek: LifeEvent[];
    thisMonth: LifeEvent[];
}
/**
 * Detect life events mentioned in user text
 */
export declare function detectLifeEvents(userId: string, text: string, context?: {
    topic?: string;
    emotion?: string;
}): EventDetectionResult[];
/**
 * Save a detected event
 */
export declare function saveEvent(event: LifeEvent): void;
/**
 * Get upcoming events for a user
 */
export declare function getUpcomingEvents(userId: string): UpcomingEventSummary;
/**
 * Get events needing reminders
 */
export declare function getEventsNeedingReminders(userId: string): LifeEvent[];
/**
 * Get events needing follow-up
 */
export declare function getEventsNeedingFollowUp(userId: string): LifeEvent[];
/**
 * Record event outcome
 */
export declare function recordEventOutcome(userId: string, eventId: string, outcome: 'positive' | 'negative' | 'neutral' | 'unknown'): void;
/**
 * Mark reminder sent
 */
export declare function markReminderSent(userId: string, eventId: string): void;
/**
 * Mark check-in sent
 */
export declare function markCheckInSent(userId: string, eventId: string): void;
/**
 * Generate reminder message for an event
 */
export declare function generateReminderMessage(event: LifeEvent): string;
/**
 * Generate follow-up message for an event
 */
export declare function generateFollowUpMessage(event: LifeEvent): string;
declare const _default: {
    detectLifeEvents: typeof detectLifeEvents;
    saveEvent: typeof saveEvent;
    getUpcomingEvents: typeof getUpcomingEvents;
    getEventsNeedingReminders: typeof getEventsNeedingReminders;
    getEventsNeedingFollowUp: typeof getEventsNeedingFollowUp;
    recordEventOutcome: typeof recordEventOutcome;
    markReminderSent: typeof markReminderSent;
    markCheckInSent: typeof markCheckInSent;
    generateReminderMessage: typeof generateReminderMessage;
    generateFollowUpMessage: typeof generateFollowUpMessage;
};
export default _default;
//# sourceMappingURL=life-events.d.ts.map