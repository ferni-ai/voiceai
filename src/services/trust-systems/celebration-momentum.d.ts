/**
 * Celebration Momentum Tracker
 *
 * Tracks patterns of wins and effort over time, recognizing
 * streaks, themes, and building positive momentum.
 *
 * Philosophy: Progress isn't linear, but patterns emerge.
 * Recognizing momentum reinforces positive change.
 *
 * Features:
 * - Win streaks (consecutive wins)
 * - Win themes (patterns in win types)
 * - Momentum score (recent positive activity)
 * - Effort recognition (consistency over time)
 * - Comeback detection (recovery after struggles)
 *
 * PERSISTENCE: Momentum profiles are persisted to Firestore.
 *
 * @module CelebrationMomentum
 */
export type WinType = 'followed_through' | 'courage_moment' | 'self_care' | 'boundary_held' | 'hard_conversation' | 'showed_up' | 'tried_new_thing' | 'asked_for_help' | 'effort_made' | 'consistency' | 'breakthrough';
export interface TrackedWin {
    id: string;
    type: WinType;
    description: string;
    detectedAt: Date;
    celebrated: boolean;
    difficulty?: 'easy' | 'medium' | 'hard';
    context?: string;
    tags: string[];
}
export interface WinStreak {
    id: string;
    type: 'daily' | 'weekly' | 'type_specific';
    count: number;
    startDate: Date;
    lastWinDate: Date;
    winType?: WinType;
    active: boolean;
    celebrated: boolean;
}
export interface WinTheme {
    type: WinType;
    count: number;
    percentage: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    lastSeen: Date;
}
export interface MomentumProfile {
    userId: string;
    wins: TrackedWin[];
    streaks: WinStreak[];
    themes: WinTheme[];
    momentumScore: number;
    momentumTrend: 'building' | 'stable' | 'declining';
    consistencyScore: number;
    totalWins: number;
    winsThisWeek: number;
    winsThisMonth: number;
    comebackDetected: boolean;
    breakthroughMoment: boolean;
    lastUpdated: Date;
}
export interface CelebrationSuggestion {
    type: 'streak' | 'milestone' | 'theme' | 'momentum' | 'comeback' | 'breakthrough';
    message: string;
    intensity: 'subtle' | 'warm' | 'enthusiastic';
    ssml: string;
}
/**
 * Flush persistence
 */
export declare function flushCelebrationMomentumPersistence(): Promise<void>;
/**
 * Shutdown celebration momentum service
 */
export declare function shutdownCelebrationMomentum(): Promise<void>;
/**
 * Record a new win
 */
export declare function recordWin(userId: string, win: Omit<TrackedWin, 'id' | 'detectedAt' | 'celebrated'>): TrackedWin;
/**
 * Generate celebration suggestions
 */
export declare function generateCelebrations(userId: string): CelebrationSuggestion[];
/**
 * Get momentum profile
 */
export declare function getMomentumProfile(userId: string): MomentumProfile | null;
/**
 * Get active streaks
 */
export declare function getActiveStreaks(userId: string): WinStreak[];
/**
 * Get momentum summary for context
 */
export declare function getMomentumSummary(userId: string): string | null;
/**
 * Mark celebration as shown
 */
export declare function markCelebrationShown(userId: string, streakId?: string): void;
declare const _default: {
    recordWin: typeof recordWin;
    getMomentumProfile: typeof getMomentumProfile;
    getActiveStreaks: typeof getActiveStreaks;
    generateCelebrations: typeof generateCelebrations;
    getMomentumSummary: typeof getMomentumSummary;
    markCelebrationShown: typeof markCelebrationShown;
};
export default _default;
//# sourceMappingURL=celebration-momentum.d.ts.map