/**
 * Financial Journey Tracker
 *
 * Tracks a user's long-term financial progress and creates narrative context.
 * Jack can say: "When we first met, you had no emergency fund and $15k in
 * credit card debt. Look how far you've come!"
 *
 * Features:
 * - Starting point snapshot
 * - Milestone tracking
 * - Progress narrative generation
 * - Trend analysis
 * - Celebration moments
 */
import type { UserProfile } from '../../types/user-profile.js';
/**
 * Snapshot of financial state at a point in time
 */
export interface FinancialSnapshot {
    id: string;
    date: Date;
    type: 'starting_point' | 'milestone' | 'check_in' | 'year_end';
    emergencyFundStatus: 'none' | 'partial' | 'adequate' | 'strong';
    emergencyFundMonths?: number;
    hasDebt: boolean;
    debtAmount?: number;
    debtTypes?: string[];
    hasInvestments: boolean;
    investmentExperience: 'beginner' | 'intermediate' | 'experienced' | 'unknown';
    retirementAccountTypes?: string[];
    activeGoalCount: number;
    goalsAchieved: number;
    financialConfidence: 'low' | 'growing' | 'moderate' | 'high';
    primaryConcern?: string;
    jackNotes?: string;
}
/**
 * A milestone in the financial journey
 */
export interface JourneyMilestone {
    id: string;
    date: Date;
    type: 'started_investing' | 'debt_free' | 'emergency_fund_complete' | 'first_goal_achieved' | 'major_contribution' | 'mindset_shift' | 'knowledge_breakthrough' | 'habit_formed' | 'anniversary';
    title: string;
    description: string;
    emotionalSignificance: 'minor' | 'moderate' | 'major';
    celebrationGiven: boolean;
    snapshotAtMilestone?: FinancialSnapshot;
}
/**
 * Progress trend over time
 */
export interface ProgressTrend {
    metric: string;
    direction: 'improving' | 'stable' | 'declining';
    confidence: number;
    dataPoints: number;
    summary: string;
}
/**
 * The complete financial journey
 */
export interface FinancialJourney {
    userId: string;
    startedAt: Date;
    startingPoint: FinancialSnapshot;
    currentState: FinancialSnapshot;
    snapshots: FinancialSnapshot[];
    milestones: JourneyMilestone[];
    trends: ProgressTrend[];
    progressNarrative: string;
    journeySummary: string;
    daysOnJourney: number;
    goalsAchieved: number;
    milestoneCount: number;
}
export declare class FinancialJourneyTracker {
    private userId;
    private snapshots;
    private milestones;
    constructor(userId: string, existingSnapshots?: FinancialSnapshot[], existingMilestones?: JourneyMilestone[]);
    /**
     * Create a snapshot from user profile
     */
    createSnapshot(profile: UserProfile, type: FinancialSnapshot['type'], jackNotes?: string): FinancialSnapshot;
    /**
     * Get the starting point snapshot
     */
    getStartingPoint(): FinancialSnapshot | null;
    /**
     * Get the most recent snapshot
     */
    getCurrentState(): FinancialSnapshot | null;
    /**
     * Check for new milestones based on profile changes
     */
    detectMilestones(profile: UserProfile, previousSnapshot?: FinancialSnapshot): JourneyMilestone[];
    /**
     * Create a milestone record
     */
    private createMilestone;
    /**
     * Analyze trends in financial progress
     */
    analyzeTrends(): ProgressTrend[];
    /**
     * Calculate simple trend direction from values
     */
    private calculateTrend;
    /**
     * Generate a progress narrative for the user
     */
    generateProgressNarrative(profile: UserProfile): string;
    /**
     * Generate a journey summary for context
     */
    generateJourneySummary(profile: UserProfile): string;
    /**
     * Get the complete financial journey
     */
    getJourney(profile: UserProfile): FinancialJourney;
    /**
     * Get journey context for prompt injection
     */
    getJourneyContext(profile: UserProfile): string;
    /**
     * Mark a milestone as celebrated
     */
    markMilestoneCelebrated(milestoneId: string): void;
    /**
     * Get uncelebrated milestones
     */
    getUncelebratedMilestones(): JourneyMilestone[];
    /**
     * Get all data for persistence
     */
    getAllData(): {
        snapshots: FinancialSnapshot[];
        milestones: JourneyMilestone[];
    };
}
export declare function getFinancialJourneyTracker(userId: string, existingSnapshots?: FinancialSnapshot[], existingMilestones?: JourneyMilestone[]): FinancialJourneyTracker;
export declare function removeFinancialJourneyTracker(userId: string): void;
export default FinancialJourneyTracker;
//# sourceMappingURL=financial-journey.d.ts.map