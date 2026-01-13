/**
 * Temporal Context Types
 *
 * Types for life rhythm and temporal awareness.
 *
 * @module @ferni/conversation/temporal-context/types
 */
export type TimeOfDay = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'late_night';
export type DayType = 'monday' | 'weekday' | 'friday' | 'saturday' | 'sunday';
export type TemporalMood = 'fresh_start' | 'grinding' | 'anticipation' | 'freedom' | 'winding_down' | 'reflective' | 'transition';
export interface UpcomingEvent {
    /** What the event is */
    description: string;
    /** When it happens */
    date: Date;
    /** Category */
    category: 'work' | 'personal' | 'social' | 'health' | 'milestone' | 'other';
    /** User's sentiment about it */
    sentiment: 'positive' | 'neutral' | 'anxious' | 'dreading';
    /** Has it been followed up on? */
    followedUp: boolean;
    /** Turn when mentioned */
    mentionedTurn: number;
}
export interface TemporalState {
    /** Current time */
    now: Date;
    /** Time of day */
    timeOfDay: TimeOfDay;
    /** Day type */
    dayType: DayType;
    /** Temporal mood */
    mood: TemporalMood;
    /** Is it late? */
    isLate: boolean;
    /** Days until weekend */
    daysUntilWeekend: number;
    /** Any special context */
    specialContext: string | null;
    /** Upcoming events */
    upcomingEvents: UpcomingEvent[];
}
export interface TemporalGuidance {
    /** Greeting appropriate for time */
    greeting: string | null;
    /** Closing appropriate for time */
    closing: string | null;
    /** Time-aware check-in */
    checkIn: string | null;
    /** Proactive event follow-up */
    eventFollowUp: string | null;
    /** Tone adjustment */
    toneAdjustment: string;
    /** Energy expectation */
    expectedEnergy: 'lower' | 'normal' | 'higher';
}
//# sourceMappingURL=types.d.ts.map