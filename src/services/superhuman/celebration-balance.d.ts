/**
 * Celebration Balance Tracker
 *
 * "Are you celebrating enough? Too much? Humans can't track this objectively."
 *
 * This service tracks the balance of celebration in a user's life:
 * - Celebration density (too sparse? too dense?)
 * - Celebration focus (always for others, never for self?)
 * - Celebration fatigue signals
 * - Joy gaps (too long since last celebration)
 *
 * Better Than Human: We objectively track celebration patterns and notice
 * when someone needs more joy or more rest.
 *
 * @module services/superhuman/celebration-balance
 */
export type CelebrationType = 'personal_achievement' | 'personal_milestone' | 'for_others' | 'community' | 'holiday' | 'spontaneous' | 'quiet' | 'recovery';
export type CelebrationSize = 'micro' | 'small' | 'medium' | 'large' | 'major';
export interface RecordedCelebration {
    /** Unique ID */
    id: string;
    /** What was celebrated */
    description: string;
    /** Type of celebration */
    type: CelebrationType;
    /** Size/scope of celebration */
    size: CelebrationSize;
    /** Who was being celebrated */
    honoree: 'self' | 'others' | 'both';
    /** Date of celebration */
    date: string;
    /** Energy cost (1-10, how draining was it?) */
    energyCost: number;
    /** Joy received (1-10, how much joy did it bring?) */
    joyReceived: number;
    /** Notes */
    notes?: string;
    /** When recorded */
    recordedAt: string;
}
export interface CelebrationBalance {
    /** Celebrations in current period */
    recentCelebrations: number;
    /** Days since last celebration */
    daysSinceLastCelebration: number;
    /** Average celebrations per month */
    avgCelebrationsPerMonth: number;
    /** Balance metrics */
    selfVsOthersRatio: number;
    largeVsSmallRatio: number;
    energyBalance: number;
    /** Current state assessment */
    state: 'balanced' | 'celebration_drought' | 'celebration_fatigue' | 'others_focused' | 'self_focused';
    /** Recommendations */
    recommendations: string[];
}
export interface CelebrationBalanceProfile {
    userId: string;
    /** All recorded celebrations */
    celebrations: RecordedCelebration[];
    /** User's celebration preferences */
    preferences: {
        preferredSize: CelebrationSize;
        energyCapacity: 'low' | 'medium' | 'high';
        soloVsSocial: 'solo' | 'social' | 'mixed';
    };
    /** Detected patterns */
    patterns: {
        bestMonthsForCelebration: number[];
        avoidMonths: number[];
        preferredDayOfWeek: number[];
    };
    lastUpdated: string;
}
declare function loadCelebrationProfile(userId: string): Promise<CelebrationBalanceProfile | null>;
/**
 * Record a celebration
 */
export declare function recordCelebration(userId: string, description: string, type: CelebrationType, size: CelebrationSize, honoree: 'self' | 'others' | 'both', options?: {
    date?: string;
    energyCost?: number;
    joyReceived?: number;
    notes?: string;
}): Promise<RecordedCelebration>;
/**
 * Get celebration balance assessment
 */
export declare function getCelebrationBalance(userId: string): Promise<CelebrationBalance>;
/**
 * Get celebration suggestions based on current balance
 */
export declare function getCelebrationSuggestions(userId: string): Promise<{
    needsJoy: boolean;
    needsRest: boolean;
    suggestions: string[];
}>;
/**
 * Check if user needs celebration prompting
 */
export declare function shouldPromptForCelebration(userId: string): Promise<{
    shouldPrompt: boolean;
    reason?: string;
    suggestion?: string;
}>;
/**
 * Build context string for LLM injection
 */
export declare function buildCelebrationBalanceContext(userId: string): Promise<string>;
export declare const celebrationBalance: {
    recordCelebration: typeof recordCelebration;
    getCelebrationBalance: typeof getCelebrationBalance;
    getCelebrationSuggestions: typeof getCelebrationSuggestions;
    shouldPromptForCelebration: typeof shouldPromptForCelebration;
    buildCelebrationBalanceContext: typeof buildCelebrationBalanceContext;
    loadCelebrationProfile: typeof loadCelebrationProfile;
};
export default celebrationBalance;
//# sourceMappingURL=celebration-balance.d.ts.map