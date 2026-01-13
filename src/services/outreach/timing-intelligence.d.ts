/**
 * Timing Intelligence Service
 *
 * Learns when users are most receptive to outreach and ensures we reach out
 * at optimal times - not just "preferred hours" but understanding life patterns.
 *
 * Key Intelligence:
 * 1. Engagement Patterns - When do they typically respond?
 * 2. Response Rates - Which times get the best response?
 * 3. Life Events - Don't reach out during known busy times
 * 4. Contextual Timing - Morning person vs night owl
 * 5. Channel Timing - Best time for calls vs texts vs email
 *
 * Philosophy: Reach out when they're receptive, not when it's convenient for us.
 */
import type { OutreachPriority } from './decision-engine.js';
import type { OutreachChannel } from './persona-voice-generator.js';
export interface TimingProfile {
    userId: string;
    engagementPatterns: {
        preferredHours: number[];
        preferredDays: number[];
        responseRateByHour: Map<number, number>;
        responseRateByDay: Map<number, number>;
        avgResponseTimeMs: number;
        lastSuccessfulContactTime?: Date;
        totalInteractions: number;
        totalResponses: number;
    };
    preferences: {
        quietHoursStart: string;
        quietHoursEnd: string;
        timezone: string;
        neverDuring: NeverDuringRule[];
        bestTimeFor: Partial<Record<OutreachChannel, TimePeriod>>;
        preferMornings?: boolean;
        preferEvenings?: boolean;
    };
    lifeContext: {
        busyPeriods: BusyPeriod[];
        recurringEvents: RecurringEvent[];
        workSchedule?: WorkSchedule;
        sleepPattern?: SleepPattern;
    };
    channelTiming: {
        call: ChannelTimingData;
        sms: ChannelTimingData;
        email: ChannelTimingData;
        push: ChannelTimingData;
        voice_message: ChannelTimingData;
    };
}
export interface NeverDuringRule {
    description: string;
    startTime?: string;
    endTime?: string;
    days?: number[];
    isRecurring: boolean;
}
export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night' | 'anytime';
export interface BusyPeriod {
    id: string;
    description: string;
    startDate: Date;
    endDate: Date;
    urgentOnly: boolean;
}
export interface RecurringEvent {
    id: string;
    description: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    noOutreach: boolean;
}
export interface WorkSchedule {
    type: 'regular' | 'shift' | 'flexible' | 'unknown';
    workDays: number[];
    workStart?: string;
    workEnd?: string;
}
export interface SleepPattern {
    typicalBedtime: string;
    typicalWakeTime: string;
    isNightOwl: boolean;
    isEarlyBird: boolean;
}
export interface ChannelTimingData {
    bestHours: number[];
    responseRateByHour: Map<number, number>;
    avgResponseTimeMs: number;
    lastSuccessfulTime?: Date;
}
export interface TimingDecision {
    shouldSendNow: boolean;
    optimalTime: Date;
    confidence: number;
    reasoning: string;
    alternativeTimes: Date[];
}
export interface TimingContext {
    trigger: {
        type: string;
        priority: OutreachPriority;
    };
    channel: OutreachChannel;
    isFollowUp?: boolean;
}
/**
 * Get or create timing profile for a user
 */
export declare function getTimingProfile(userId: string): TimingProfile;
/**
 * Update timing preferences for a user
 */
export declare function updateTimingPreferences(userId: string, preferences: Partial<TimingProfile['preferences']>): void;
/**
 * Add a "never during" rule
 */
export declare function addNeverDuringRule(userId: string, rule: NeverDuringRule): void;
/**
 * Add a busy period
 */
export declare function addBusyPeriod(userId: string, period: BusyPeriod): void;
/**
 * Add a recurring event
 */
export declare function addRecurringEvent(userId: string, event: RecurringEvent): void;
/**
 * Set work schedule
 */
export declare function setWorkSchedule(userId: string, schedule: WorkSchedule): void;
/**
 * Set sleep pattern
 */
export declare function setSleepPattern(userId: string, pattern: SleepPattern): void;
/**
 * Record an interaction for learning
 */
export declare function recordInteraction(userId: string, data: {
    channel: OutreachChannel;
    wasOutreach: boolean;
    gotResponse: boolean;
    responseTimeMs?: number;
    timestamp?: Date;
}): void;
/**
 * Calculate the optimal time to reach out
 */
export declare function calculateOptimalTime(userId: string, context: TimingContext): TimingDecision;
/**
 * Check if a specific time is good for outreach
 */
export declare function isGoodTimeForOutreach(userId: string, time: Date, context: TimingContext): {
    isGood: boolean;
    score: number;
    reason: string;
};
/**
 * Check calendar before sending outreach
 *
 * This async function checks the user's live calendar to see if they're busy.
 * Use this as a final gate before actually sending outreach.
 *
 * @example
 * ```typescript
 * const check = await checkCalendarBeforeOutreach(userId, 'high');
 * if (!check.canSend) {
 *   // Reschedule for check.suggestedRetry
 * }
 * ```
 */
export declare function checkCalendarBeforeOutreach(userId: string, priority: OutreachPriority): Promise<{
    canSend: boolean;
    reason?: string;
    busyUntil?: Date;
    suggestedRetry?: Date;
}>;
/**
 * Enhanced optimal time calculation with live calendar awareness
 *
 * Use this when you need a truly optimal time considering live calendar data.
 */
export declare function calculateOptimalTimeWithCalendar(userId: string, context: TimingContext): Promise<TimingDecision & {
    calendarAware: boolean;
}>;
export declare function clearUserTimingData(userId: string): void;
declare const _default: {
    getTimingProfile: typeof getTimingProfile;
    updateTimingPreferences: typeof updateTimingPreferences;
    addNeverDuringRule: typeof addNeverDuringRule;
    addBusyPeriod: typeof addBusyPeriod;
    addRecurringEvent: typeof addRecurringEvent;
    setWorkSchedule: typeof setWorkSchedule;
    setSleepPattern: typeof setSleepPattern;
    recordInteraction: typeof recordInteraction;
    calculateOptimalTime: typeof calculateOptimalTime;
    calculateOptimalTimeWithCalendar: typeof calculateOptimalTimeWithCalendar;
    checkCalendarBeforeOutreach: typeof checkCalendarBeforeOutreach;
    isGoodTimeForOutreach: typeof isGoodTimeForOutreach;
    clearUserTimingData: typeof clearUserTimingData;
};
export default _default;
//# sourceMappingURL=timing-intelligence.d.ts.map