/**
 * Temporal Pattern Detector
 *
 * Phase 3: Temporal Intelligence
 *
 * Analyzes historical trigger firings to detect patterns:
 * - Sunday night anxiety
 * - Late night existential mode
 * - Anniversary approach behavior
 * - Seasonal variations
 *
 * "A good friend knows you get anxious on Sunday nights before big weeks.
 * Ferni should know that too."
 *
 * @module TemporalPatternDetector
 */
import type { DayOfWeek, TimeOfDayBucket, TriggerFiringEvent, DayOfWeekPattern, TimeOfDayPattern, RecurringDatePattern, SignificantDate, UserTriggerProfile } from './user-trigger-profile.types.js';
export interface TemporalPatternConfig {
    /** Minimum observations before detecting a pattern */
    minObservations: number;
    /** Confidence threshold for including a pattern (0-1) */
    confidenceThreshold: number;
    /** How many days of firing events to keep */
    retentionDays: number;
    /** Minimum multiplier difference to consider a pattern significant */
    minMultiplierDifference: number;
    /** How many days before a date to start detecting approach patterns */
    dateApproachWindowDays: number;
    /** How many days after a date to detect trail patterns */
    dateTrailWindowDays: number;
}
export declare const DEFAULT_TEMPORAL_CONFIG: TemporalPatternConfig;
/**
 * Get day of week from a date
 */
export declare function getDayOfWeek(date: Date): DayOfWeek;
/**
 * Get time of day bucket from hour
 */
export declare function getTimeOfDayBucket(hour: number): TimeOfDayBucket;
/**
 * Calculate days until a recurring date (handles year wrap)
 */
export declare function daysUntilRecurringDate(date: SignificantDate, fromDate?: Date): number;
/**
 * Calculate days since a recurring date last occurred
 */
export declare function daysSinceRecurringDate(date: SignificantDate, fromDate?: Date): number;
/**
 * Create a trigger firing event from current context
 */
export declare function createTriggerFiringEvent(triggerName: string, triggerCategory: string, outcome?: 'engaged' | 'deflected' | 'neutral' | 'unknown', sessionId?: string, significantDates?: SignificantDate[]): TriggerFiringEvent;
/**
 * Add a firing event to the profile and prune old events
 */
export declare function recordFiringEvent(profile: UserTriggerProfile, event: TriggerFiringEvent, config?: TemporalPatternConfig): UserTriggerProfile;
/**
 * Analyze day-of-week patterns from firing events
 */
export declare function analyzeDayOfWeekPatterns(events: TriggerFiringEvent[], config?: TemporalPatternConfig): DayOfWeekPattern[];
/**
 * Analyze time-of-day patterns from firing events
 */
export declare function analyzeTimeOfDayPatterns(events: TriggerFiringEvent[], config?: TemporalPatternConfig): TimeOfDayPattern[];
/**
 * Analyze recurring date patterns (anniversaries, etc.)
 */
export declare function analyzeRecurringDatePatterns(events: TriggerFiringEvent[], significantDates: SignificantDate[], config?: TemporalPatternConfig): RecurringDatePattern[];
/**
 * Analyze all temporal patterns and update the profile
 */
export declare function analyzeTemporalPatterns(profile: UserTriggerProfile, config?: TemporalPatternConfig): UserTriggerProfile;
/**
 * Result of calculating temporal boost
 */
export interface TemporalBoostResult {
    /** Overall multiplier to apply to trigger confidence */
    overallMultiplier: number;
    /** Category-specific boosts */
    categoryBoosts: Record<string, number>;
    /** Specific trigger boosts/suppressions */
    triggerAdjustments: Array<{
        triggerName: string;
        adjustment: number;
        reason: string;
    }>;
    /** Contextual notes for the agent */
    contextNotes: string[];
    /** Whether we're in a significant date window */
    nearSignificantDate?: {
        dateId: string;
        dateType: string;
        daysAway: number;
        description: string;
    };
}
/**
 * Calculate temporal boost based on current time and user's patterns
 */
export declare function calculateTemporalBoost(profile: UserTriggerProfile, currentTime?: Date): TemporalBoostResult;
/**
 * Analytics for temporal pattern detection
 */
export interface TemporalAnalytics {
    /** Total number of temporal boosts calculated */
    totalBoostCalculations: number;
    /** Number of boosts near significant dates */
    nearSignificantDateBoosts: number;
    /** Average overall multiplier */
    averageMultiplier: number;
    /** Count by day of week */
    byDayOfWeek: Record<DayOfWeek, number>;
    /** Count by time of day */
    byTimeOfDay: Record<TimeOfDayBucket, number>;
    /** Total trigger firing events recorded */
    totalFiringEvents: number;
    /** Firing event outcomes distribution */
    outcomeDistribution: Record<'engaged' | 'deflected' | 'neutral' | 'unknown', number>;
    /** Average processing time for boost calculation */
    averageProcessingMs: number;
}
/**
 * Record temporal boost calculation for analytics
 */
export declare function recordTemporalBoost(result: TemporalBoostResult, dayOfWeek: DayOfWeek, timeOfDay: TimeOfDayBucket, processingMs: number): void;
/**
 * Record trigger firing event for analytics
 */
export declare function recordFiringEventAnalytics(event: TriggerFiringEvent): void;
/**
 * Get temporal analytics summary
 */
export declare function getTemporalAnalytics(): TemporalAnalytics & {
    byDayOfWeekArray: Array<{
        day: DayOfWeek;
        count: number;
    }>;
    byTimeOfDayArray: Array<{
        bucket: TimeOfDayBucket;
        count: number;
    }>;
};
/**
 * Reset temporal analytics (for testing)
 */
export declare function resetTemporalAnalytics(): void;
declare const _default: {
    DEFAULT_TEMPORAL_CONFIG: TemporalPatternConfig;
    getDayOfWeek: typeof getDayOfWeek;
    getTimeOfDayBucket: typeof getTimeOfDayBucket;
    daysUntilRecurringDate: typeof daysUntilRecurringDate;
    daysSinceRecurringDate: typeof daysSinceRecurringDate;
    createTriggerFiringEvent: typeof createTriggerFiringEvent;
    recordFiringEvent: typeof recordFiringEvent;
    analyzeDayOfWeekPatterns: typeof analyzeDayOfWeekPatterns;
    analyzeTimeOfDayPatterns: typeof analyzeTimeOfDayPatterns;
    analyzeRecurringDatePatterns: typeof analyzeRecurringDatePatterns;
    analyzeTemporalPatterns: typeof analyzeTemporalPatterns;
    calculateTemporalBoost: typeof calculateTemporalBoost;
    recordTemporalBoost: typeof recordTemporalBoost;
    recordFiringEventAnalytics: typeof recordFiringEventAnalytics;
    getTemporalAnalytics: typeof getTemporalAnalytics;
    resetTemporalAnalytics: typeof resetTemporalAnalytics;
};
export default _default;
//# sourceMappingURL=temporal-pattern-detector.d.ts.map