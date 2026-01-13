/**
 * Proactive Milestone Detector
 *
 * "Your best friend doesn't track that you're approaching 5 years at your job."
 *
 * This service proactively detects celebrations humans forget to plan:
 * - Relationship anniversaries (dating, wedding, friendships)
 * - Career milestones (years at job, promotions)
 * - Life stage transitions (empty nest, retirement approaching)
 * - Quiet wins (sobriety streaks, habit streaks, financial milestones)
 * - "Second chance" milestones (first day of new chapter after divorce, etc.)
 *
 * Better Than Human: We see milestones coming and suggest celebrations before they're forgotten.
 *
 * @module services/superhuman/proactive-milestone-detector
 */
export type MilestoneType = 'anniversary' | 'career' | 'friendship' | 'health' | 'financial' | 'habit' | 'life_stage' | 'second_chance' | 'quiet_win' | 'custom';
export type MilestoneSignificance = 'minor' | 'notable' | 'significant' | 'major' | 'life_changing';
export interface TrackedDate {
    /** Unique ID */
    id: string;
    /** What this date represents */
    label: string;
    /** The date itself */
    date: string;
    /** Type of milestone */
    type: MilestoneType;
    /** Is this recurring annually? */
    recurring: boolean;
    /** Person or entity associated (optional) */
    associatedWith?: string;
    /** Additional context */
    context?: string;
    /** When was this added */
    createdAt: string;
}
export interface DetectedMilestone {
    /** What milestone is approaching/arrived */
    label: string;
    /** Type of milestone */
    type: MilestoneType;
    /** How significant is this */
    significance: MilestoneSignificance;
    /** The date of the milestone */
    date: string;
    /** Days until/since (negative = past) */
    daysAway: number;
    /** Anniversary number if applicable */
    anniversaryNumber?: number;
    /** Why this matters */
    context: string;
    /** Suggested way to celebrate/acknowledge */
    celebrationSuggestion: string;
    /** Whether user has been notified */
    notified: boolean;
}
export interface LifeStageSignal {
    /** What life stage transition is detected */
    transition: string;
    /** Confidence level 0-1 */
    confidence: number;
    /** Evidence/signals that suggest this */
    signals: string[];
    /** Suggested milestones to plan */
    suggestedMilestones: string[];
    /** When detected */
    detectedAt: string;
}
export interface MilestoneDetectorProfile {
    userId: string;
    /** Dates being tracked */
    trackedDates: TrackedDate[];
    /** Detected upcoming milestones */
    upcomingMilestones: DetectedMilestone[];
    /** Life stage signals detected */
    lifeStageSignals: LifeStageSignal[];
    /** Quiet wins being tracked (e.g., "days sober", "days exercising") */
    quietWins: Array<{
        label: string;
        startDate: string;
        currentStreak: number;
        longestStreak: number;
        lastUpdated: string;
    }>;
    /** Milestones already celebrated/acknowledged (to avoid repeats) */
    acknowledgedMilestones: Array<{
        label: string;
        date: string;
        acknowledgedAt: string;
    }>;
    lastUpdated: string;
}
declare function loadMilestoneProfile(userId: string): Promise<MilestoneDetectorProfile | null>;
/**
 * Track a significant date for milestone detection
 */
export declare function trackDate(userId: string, label: string, date: Date | string, type: MilestoneType, options?: {
    recurring?: boolean;
    associatedWith?: string;
    context?: string;
}): Promise<TrackedDate>;
/**
 * Track a "quiet win" streak (sobriety, exercise, meditation, etc.)
 */
export declare function trackQuietWin(userId: string, label: string, startDate: Date | string): Promise<void>;
/**
 * Reset a quiet win streak (e.g., streak broken)
 */
export declare function resetQuietWin(userId: string, label: string): Promise<void>;
/**
 * Record a life stage signal (from conversation analysis)
 */
export declare function recordLifeStageSignal(userId: string, transition: string, signals: string[], confidence: number): Promise<void>;
/**
 * Detect all upcoming milestones for a user
 */
export declare function detectUpcomingMilestones(userId: string, lookaheadDays?: number): Promise<DetectedMilestone[]>;
/**
 * Get milestones worth celebrating now
 */
export declare function getMilestonesToCelebrate(userId: string): Promise<DetectedMilestone[]>;
/**
 * Acknowledge a milestone (so we don't keep suggesting it)
 */
export declare function acknowledgeMilestone(userId: string, label: string, date: string): Promise<void>;
/**
 * Get life stage transitions worth discussing
 */
export declare function getLifeStageInsights(userId: string, minConfidence?: number): Promise<LifeStageSignal[]>;
/**
 * Build context string for LLM injection
 */
export declare function buildMilestoneDetectorContext(userId: string): Promise<string>;
export declare const proactiveMilestoneDetector: {
    trackDate: typeof trackDate;
    trackQuietWin: typeof trackQuietWin;
    resetQuietWin: typeof resetQuietWin;
    recordLifeStageSignal: typeof recordLifeStageSignal;
    detectUpcomingMilestones: typeof detectUpcomingMilestones;
    getMilestonesToCelebrate: typeof getMilestonesToCelebrate;
    acknowledgeMilestone: typeof acknowledgeMilestone;
    getLifeStageInsights: typeof getLifeStageInsights;
    buildMilestoneDetectorContext: typeof buildMilestoneDetectorContext;
    loadMilestoneProfile: typeof loadMilestoneProfile;
};
export default proactiveMilestoneDetector;
//# sourceMappingURL=proactive-milestone-detector.d.ts.map