/**
 * Recovery Protection Service
 *
 * Proactively protects user time and suggests recovery blocks.
 * This is "better than human" because no assistant consistently:
 * - Notices 3+ hours of back-to-back meetings
 * - Auto-suggests blocking recovery time
 * - Tracks patterns that lead to burnout
 *
 * @module calendar/recovery-protection
 */
import { type CalendarEvent, type TimeSlot, type CreateEventInput } from './calendar-service.js';
export type RecoveryType = 'block_time' | 'decline_meeting' | 'delegate' | 'reschedule' | 'shorten' | 'add_break';
export interface RecoveryRecommendation {
    type: RecoveryType;
    reason: string;
    urgency: 'immediate' | 'today' | 'this_week';
    suggestedAction: {
        description: string;
        eventToCreate?: Partial<CreateEventInput>;
        eventToModify?: string;
        suggestedDuration?: number;
    };
    confidence: number;
}
export interface RecoverySettings {
    enabled: boolean;
    autoBlockAfterMinutes: number;
    minRecoveryMinutes: number;
    preferredRecoveryTimes: string[];
    maxMeetingHoursPerDay: number;
}
/**
 * Detect recovery needs and generate recommendations
 */
export declare function detectRecoveryNeeds(userId: string, settings?: Partial<RecoverySettings>): Promise<RecoveryRecommendation[]>;
/**
 * Auto-block recovery time after a meeting streak
 *
 * This is the proactive "better than human" feature.
 */
export declare function autoBlockRecoveryTime(userId: string, afterMeetingStreak: number, // minutes of consecutive meetings
settings?: Partial<RecoverySettings>): Promise<CalendarEvent | null>;
/**
 * Find optimal slots for focus/recovery time this week
 */
export declare function findRecoveryOpportunities(userId: string, minDurationMinutes?: number): Promise<Array<{
    slot: TimeSlot;
    day: string;
    quality: 'excellent' | 'good' | 'fair';
}>>;
/**
 * Generate recovery suggestions for display to user
 */
export declare function getRecoverySuggestions(userId: string): Promise<string[]>;
/**
 * Build context string for LLM injection
 */
export declare function buildRecoveryContext(userId: string): Promise<string>;
export declare const recoveryProtection: {
    detectNeeds: typeof detectRecoveryNeeds;
    autoBlock: typeof autoBlockRecoveryTime;
    findOpportunities: typeof findRecoveryOpportunities;
    getSuggestions: typeof getRecoverySuggestions;
    buildContext: typeof buildRecoveryContext;
};
export default recoveryProtection;
//# sourceMappingURL=recovery-protection.d.ts.map