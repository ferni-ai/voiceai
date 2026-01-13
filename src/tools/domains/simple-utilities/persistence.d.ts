/**
 * Firestore Persistence for Simple Utilities
 *
 * Cross-session memory for utility patterns and preferences.
 * Ferni remembers your usual timer, tip percentage, and tracked countdowns
 * even after you close the app.
 *
 * STORAGE STRUCTURE:
 * bogle_users/{userId}/utility_preferences/patterns
 * bogle_users/{userId}/utility_preferences/countdowns
 * bogle_users/{userId}/utility_preferences/history
 */
export interface PersistedUtilityPreferences {
    timers: {
        usual: Array<{
            minutes: number;
            label: string;
            timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
            count: number;
        }>;
        defaultDuration?: number;
    };
    tips: {
        defaultPercent: number;
        averagePercent: number;
        totalCalculations: number;
    };
    timezones: {
        frequentCities: Array<{
            city: string;
            count: number;
            lastChecked: string;
        }>;
        homeTimezone?: string;
    };
    decisions: {
        coinFlipsTotal: number;
        commonDecisionTopics: string[];
    };
    conversions: {
        frequentPairs: Array<{
            from: string;
            to: string;
            count: number;
        }>;
        preferMetric: boolean;
    };
    countdowns: Array<{
        event: string;
        targetDate: string;
        checksCount: number;
        notifyMilestones: boolean;
        created: string;
    }>;
    lastUpdated: string;
    version: number;
}
/**
 * Load user's utility preferences from Firestore
 */
export declare function loadUtilityPreferences(userId: string): Promise<PersistedUtilityPreferences>;
/**
 * Save user's utility preferences to Firestore
 */
export declare function saveUtilityPreferences(userId: string, preferences: Partial<PersistedUtilityPreferences>): Promise<void>;
/**
 * Update specific timer preferences
 */
export declare function updateTimerPreferences(userId: string, timerData: {
    minutes: number;
    label?: string;
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}): Promise<void>;
/**
 * Update tip preferences
 */
export declare function updateTipPreferences(userId: string, tipPercent: number): Promise<void>;
/**
 * Update timezone preferences
 */
export declare function updateTimezonePreferences(userId: string, city: string): Promise<void>;
/**
 * Add or update a tracked countdown
 */
export declare function trackCountdown(userId: string, event: string, targetDate: Date, notifyMilestones?: boolean): Promise<void>;
/**
 * Get countdowns that have upcoming milestones
 */
export declare function getUpcomingMilestones(userId: string): Promise<Array<{
    event: string;
    daysRemaining: number;
    targetDate: Date;
}>>;
/**
 * Increment decision counter
 */
export declare function incrementDecisionCount(userId: string, type: 'coinFlip' | 'dice' | 'random', topics?: string[]): Promise<number>;
import type { UserUtilityPatterns } from './pattern-intelligence.js';
/**
 * Sync in-memory patterns to Firestore
 */
export declare function syncPatternsToFirestore(userId: string, patterns: UserUtilityPatterns): Promise<void>;
/**
 * Load Firestore preferences into in-memory patterns
 */
export declare function loadPatternsFromFirestore(userId: string): Promise<Partial<UserUtilityPatterns['patterns']> & {
    preferences: Partial<UserUtilityPatterns['preferences']>;
}>;
declare const _default: {
    loadUtilityPreferences: typeof loadUtilityPreferences;
    saveUtilityPreferences: typeof saveUtilityPreferences;
    updateTimerPreferences: typeof updateTimerPreferences;
    updateTipPreferences: typeof updateTipPreferences;
    updateTimezonePreferences: typeof updateTimezonePreferences;
    trackCountdown: typeof trackCountdown;
    getUpcomingMilestones: typeof getUpcomingMilestones;
    incrementDecisionCount: typeof incrementDecisionCount;
    syncPatternsToFirestore: typeof syncPatternsToFirestore;
    loadPatternsFromFirestore: typeof loadPatternsFromFirestore;
};
export default _default;
//# sourceMappingURL=persistence.d.ts.map