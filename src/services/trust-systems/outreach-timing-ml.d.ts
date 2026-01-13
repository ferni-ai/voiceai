/**
 * Machine Learning for Optimal Outreach Timing
 *
 * Phase 4: Learn the best times to reach out to each user
 *
 * This uses a lightweight ML approach suitable for real-time personalization:
 * - Thompson Sampling for exploration/exploitation balance
 * - Time-bucketed response rate tracking
 * - Contextual factors (day of week, time since last contact, mood patterns)
 * - Continuous learning from engagement signals
 *
 * NO EXTERNAL ML DEPENDENCIES - Pure TypeScript implementation
 */
export interface TimingSignal {
    timestamp: Date;
    dayOfWeek: number;
    hourOfDay: number;
    responseType: 'engaged' | 'dismissed' | 'ignored' | 'delayed';
    responseTimeMs: number | null;
    outreachType: string;
    sentiment: 'positive' | 'neutral' | 'negative' | null;
}
export interface TimingPrediction {
    recommendedHour: number;
    confidence: number;
    alternativeHours: number[];
    reasoning: string;
    factors: {
        timeOfDay: number;
        dayOfWeek: number;
        recency: number;
        pattern: number;
    };
}
export interface UserTimingProfile {
    userId: string;
    hourlyBetas: Array<{
        alpha: number;
        beta: number;
    }>;
    dailyBetas: Array<{
        alpha: number;
        beta: number;
    }>;
    gapPreference: {
        min: number;
        max: number;
        optimal: number;
    };
    avgResponseTimeMs: number;
    totalOutreach: number;
    totalEngaged: number;
    lastUpdated: Date;
    patterns: {
        morningPerson: number;
        weekendActive: number;
        quickResponder: number;
        prefersBrevity: number;
    };
}
export declare function getTimingProfile(userId: string): UserTimingProfile | null;
/**
 * Record an outreach timing signal for learning
 */
export declare function recordTimingSignal(userId: string, signal: TimingSignal): void;
/**
 * Predict the optimal time to send outreach
 */
export declare function predictOptimalTiming(userId: string): TimingPrediction;
/**
 * Learn optimal gap between outreach messages
 */
export declare function recordOutreachGap(userId: string, gapHours: number, wasEngaged: boolean): void;
/**
 * Get recommended gap before next outreach
 */
export declare function getRecommendedGap(userId: string): {
    minHours: number;
    maxHours: number;
    optimalHours: number;
};
/**
 * Determine if now is a good time to reach out
 */
export declare function shouldReachOutNow(userId: string, lastOutreachTime: Date | null): {
    should: boolean;
    confidence: number;
    reason: string;
    suggestedWait?: number;
};
/**
 * Export profile for Firestore storage
 */
export declare function exportProfile(userId: string): Record<string, unknown> | null;
/**
 * Import profile from Firestore
 */
export declare function importProfile(userId: string, data: Record<string, unknown>): void;
export declare const outreachTimingML: {
    recordSignal: typeof recordTimingSignal;
    predict: typeof predictOptimalTiming;
    shouldReachOut: typeof shouldReachOutNow;
    recordGap: typeof recordOutreachGap;
    getGap: typeof getRecommendedGap;
    getProfile: typeof getTimingProfile;
    exportProfile: typeof exportProfile;
    importProfile: typeof importProfile;
};
//# sourceMappingURL=outreach-timing-ml.d.ts.map