/**
 * Life Events - Tracking and Acknowledging Important Dates
 *
 * Birthdays, anniversaries, milestones, and life events that
 * make users feel truly remembered and cared about.
 */
export interface LifeEvent {
    id: string;
    type: LifeEventType;
    date: Date;
    description?: string;
    personName?: string;
    recurring: boolean;
    lastAcknowledged?: Date;
    context?: string;
}
export type LifeEventType = 'birthday' | 'anniversary' | 'work_anniversary' | 'graduation' | 'wedding' | 'baby' | 'retirement' | 'promotion' | 'new_job' | 'move' | 'home_purchase' | 'health_milestone' | 'memorial' | 'pet' | 'travel' | 'custom';
export declare const EVENT_ACKNOWLEDGMENTS: {
    birthday: {
        user: string[];
        userWithName: string[];
        familyMember: string[];
    };
    anniversary: {
        wedding: string[];
        work: string[];
    };
    milestones: {
        graduation: string[];
        wedding: string[];
        baby: string[];
        retirement: string[];
        promotion: string[];
        newJob: string[];
        homePurchase: string[];
        move: string[];
    };
    memorial: string[];
    pet: {
        birthday: string[];
        gotPet: string[];
    };
};
export declare const UPCOMING_EVENT_MENTIONS: {
    today: string[];
    tomorrow: string[];
    thisWeek: string[];
    nextWeek: string[];
    thisMonth: string[];
};
/**
 * Get days until an event (handles yearly recurring)
 */
export declare function getDaysUntilEvent(event: LifeEvent): number;
/**
 * Check if an event is happening soon
 */
export declare function isEventSoon(event: LifeEvent, withinDays?: number): boolean;
/**
 * Check if an event is today
 */
export declare function isEventToday(event: LifeEvent): boolean;
/**
 * Get the appropriate time bucket for an upcoming event
 */
export declare function getEventTimeBucket(event: LifeEvent): keyof typeof UPCOMING_EVENT_MENTIONS | null;
/**
 * Generate an acknowledgment for a life event
 */
export declare function generateEventAcknowledgment(event: LifeEvent, userName?: string, personName?: string): string | null;
/**
 * Get upcoming event mention prefix
 */
export declare function getUpcomingEventMention(event: LifeEvent): string | null;
/**
 * Find events that should be acknowledged today
 */
export declare function findEventsToAcknowledge(events: LifeEvent[]): LifeEvent[];
/**
 * Create a new life event
 */
export declare function createLifeEvent(type: LifeEventType, date: Date, options?: {
    description?: string;
    personName?: string;
    recurring?: boolean;
    context?: string;
}): LifeEvent;
/**
 * Type from UserProfile (user-profile.ts)
 */
interface UserProfileLifeEvent {
    id: string;
    type: 'wedding' | 'baby' | 'first_home' | 'graduation' | 'retirement_start' | 'milestone_birthday' | 'career_change' | 'relocation' | 'loss' | 'celebration' | 'other';
    title: string;
    description?: string;
    date?: Date;
    status: 'planning' | 'upcoming' | 'in_progress' | 'completed' | 'ongoing';
    emotionalSignificance: 'routine' | 'meaningful' | 'major' | 'life_changing';
    userSentiment?: 'excited' | 'anxious' | 'neutral' | 'mixed' | 'stressed';
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}
/**
 * Convert a UserProfile LifeEvent to shared LifeEvent format
 * Used to bridge types between user profile storage and greeting generation
 */
export declare function convertFromUserProfileEvent(event: UserProfileLifeEvent): LifeEvent;
/**
 * Convert multiple UserProfile LifeEvents to shared LifeEvent format
 */
export declare function convertFromUserProfileEvents(events: UserProfileLifeEvent[]): LifeEvent[];
export {};
//# sourceMappingURL=life-events.d.ts.map