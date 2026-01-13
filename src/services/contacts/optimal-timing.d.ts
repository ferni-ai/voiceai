/**
 * Optimal Timing ML Service
 *
 * "Better Than Human" learning of the best times to reach each contact.
 * Uses Thompson Sampling (multi-armed bandit) to balance exploration/exploitation.
 *
 * Learns from:
 * - Response rates by time of day
 * - Response rates by day of week
 * - Message open rates (email)
 * - Reply speed
 * - Engagement quality
 *
 * @module services/contacts/optimal-timing
 */
export type TimeSlot = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
/**
 * Beta distribution parameters for Thompson Sampling
 * Higher alpha = more successes, higher beta = more failures
 */
interface BetaParams {
    alpha: number;
    beta: number;
}
/**
 * Complete timing profile for a contact
 */
interface ContactTimingProfile {
    contactId: string;
    userId: string;
    timeSlots: Record<TimeSlot, BetaParams>;
    dayPreferences: Record<DayOfWeek, BetaParams>;
    bestTimeSlot?: TimeSlot;
    bestDay?: DayOfWeek;
    userSpecifiedBestTime?: string;
    totalAttempts: number;
    totalResponses: number;
    lastUpdated: Date;
}
export interface TimingRecommendation {
    contactId: string;
    contactName: string;
    recommendedTimeSlot: TimeSlot;
    recommendedDay: DayOfWeek;
    recommendedTimeLabel: string;
    confidenceLevel: 'high' | 'medium' | 'low' | 'learning';
    confidenceReason: string;
    suggestedSendTime: Date;
    expectedResponseRate: number;
    dataPoints: number;
}
export interface OutreachOutcome {
    contactId: string;
    sentAt: Date;
    channel: 'email' | 'sms' | 'voice';
    gotResponse: boolean;
    responseTime?: number;
    engagementQuality?: 'high' | 'medium' | 'low';
    wasOpened?: boolean;
    wasClicked?: boolean;
}
/**
 * Load timing profile for a contact
 */
export declare function getTimingProfile(userId: string, contactId: string): Promise<ContactTimingProfile>;
/**
 * Record the outcome of an outreach attempt and update the model
 */
export declare function recordOutcome(userId: string, outcome: OutreachOutcome): Promise<void>;
/**
 * Mark a contact as having responded - corrects the ML model
 *
 * When we initially send a message, we record gotResponse: false (beta +1).
 * When they respond, we need to correct this:
 * - Decrement beta (undo the failure)
 * - Increment alpha (add the success)
 *
 * @param userId - The user ID
 * @param contactId - The contact who responded
 * @param responseTime - Time when response was received (optional, defaults to now)
 */
export declare function markContactResponded(userId: string, contactId: string, responseTime?: Date): Promise<{
    updated: boolean;
    reason: string;
}>;
/**
 * Look up a contact by their phone number
 * Returns userId and contactId if found
 */
export declare function findContactByPhone(phone: string): Promise<{
    userId: string;
    contactId: string;
    contactName: string;
} | null>;
/**
 * Get optimal timing recommendation for reaching a contact
 */
export declare function getTimingRecommendation(userId: string, contactId: string, contactName: string): Promise<TimingRecommendation>;
/**
 * Get optimal send times for a batch of contacts
 */
export declare function getBatchTimingRecommendations(userId: string, contacts: Array<{
    id: string;
    name: string;
}>): Promise<TimingRecommendation[]>;
/**
 * Group contacts by optimal send time for batch scheduling
 */
export declare function groupByOptimalTime(userId: string, contacts: Array<{
    id: string;
    name: string;
}>): Promise<Map<string, Array<{
    id: string;
    name: string;
    recommendation: TimingRecommendation;
}>>>;
export declare const optimalTiming: {
    getProfile: typeof getTimingProfile;
    recordOutcome: typeof recordOutcome;
    markContactResponded: typeof markContactResponded;
    findContactByPhone: typeof findContactByPhone;
    getRecommendation: typeof getTimingRecommendation;
    getBatchRecommendations: typeof getBatchTimingRecommendations;
    groupByOptimalTime: typeof groupByOptimalTime;
    TIME_SLOT_HOURS: Record<TimeSlot, {
        start: number;
        end: number;
        label: string;
    }>;
    DAYS_OF_WEEK: DayOfWeek[];
};
export default optimalTiming;
//# sourceMappingURL=optimal-timing.d.ts.map