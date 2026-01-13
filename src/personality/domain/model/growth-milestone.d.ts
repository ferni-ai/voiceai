/**
 * GrowthMilestone Entity
 *
 * Represents a growth milestone in the user's journey.
 * SUPERHUMAN: We remember where they started and celebrate their progress.
 *
 * "Remember a few months ago when you couldn't even talk about this?
 *  Look at you now. That's real growth."
 *
 * @module personality/domain/model/growth-milestone
 */
/**
 * Areas of growth we track
 */
export type GrowthArea = 'emotional_regulation' | 'self_awareness' | 'relationship_skills' | 'boundary_setting' | 'anxiety_management' | 'confidence' | 'communication' | 'habit_formation' | 'career_development' | 'health_wellness' | 'creativity' | 'resilience' | 'vulnerability' | 'self_compassion' | 'other';
/**
 * Significance level of the milestone
 */
export type MilestoneSignificance = 'notable' | 'significant' | 'breakthrough';
/**
 * Evidence for growth
 */
export interface GrowthEvidence {
    /** When this evidence was observed */
    timestamp: Date;
    /** Description of what we observed */
    observation: string;
    /** Is this "before" or "after" evidence? */
    type: 'baseline' | 'progress' | 'achievement';
    /** Confidence in this observation (0-1) */
    confidence: number;
}
/**
 * GrowthMilestone Entity
 *
 * Tracks growth from a starting point (baseline) to current progress.
 * We can celebrate when there's meaningful distance traveled.
 *
 * @example
 * ```typescript
 * const milestone = GrowthMilestone.create({
 *   userId: 'user_123',
 *   area: 'anxiety_management',
 *   baselineEvidence: {
 *     timestamp: new Date('2024-01-15'),
 *     observation: 'Couldn\'t discuss work without panic',
 *     type: 'baseline',
 *     confidence: 0.9,
 *   },
 * });
 *
 * milestone.addProgressEvidence({
 *   timestamp: new Date(),
 *   observation: 'Discussed upcoming deadline calmly',
 *   type: 'progress',
 *   confidence: 0.85,
 * });
 *
 * if (milestone.isReadyToCelebrate) {
 *   console.log(milestone.celebrationMessage);
 * }
 * ```
 */
export declare class GrowthMilestone {
    /** Unique ID */
    readonly id: string;
    /** User ID */
    readonly userId: string;
    /** Area of growth */
    readonly area: GrowthArea;
    /** Custom label for this milestone */
    readonly label: string | null;
    /** Baseline evidence (where they started) */
    readonly baselineEvidence: GrowthEvidence;
    /** Progress evidence (observations along the way) */
    private _progressEvidence;
    /** Current significance */
    private _significance;
    /** Generated celebration message */
    private _celebrationMessage;
    /** Has been celebrated */
    private _celebrated;
    /** When celebrated */
    private _celebratedAt;
    /** Created timestamp */
    readonly createdAt: Date;
    /** Last updated */
    private _updatedAt;
    private constructor();
    /**
     * Create a new growth milestone
     */
    static create(params: {
        userId: string;
        area: GrowthArea;
        label?: string;
        baselineEvidence: GrowthEvidence;
    }): GrowthMilestone;
    /**
     * Reconstitute from persistence
     */
    static fromPersistence(data: {
        id: string;
        userId: string;
        area: GrowthArea;
        label: string | null;
        baselineEvidence: {
            timestamp: string;
            observation: string;
            type: 'baseline' | 'progress' | 'achievement';
            confidence: number;
        };
        progressEvidence: Array<{
            timestamp: string;
            observation: string;
            type: 'baseline' | 'progress' | 'achievement';
            confidence: number;
        }>;
        significance: MilestoneSignificance;
        celebrationMessage: string;
        celebrated: boolean;
        celebratedAt: string | null;
        createdAt: string;
        updatedAt: string;
    }): GrowthMilestone;
    /** Progress evidence */
    get progressEvidence(): readonly GrowthEvidence[];
    /** Current significance */
    get significance(): MilestoneSignificance;
    /** Celebration message */
    get celebrationMessage(): string;
    /** Has been celebrated */
    get celebrated(): boolean;
    /** When celebrated */
    get celebratedAt(): Date | null;
    /** Last updated */
    get updatedAt(): Date;
    /**
     * Most recent progress evidence
     */
    get latestProgress(): GrowthEvidence | null;
    /**
     * Days since baseline
     */
    get daysSinceBaseline(): number;
    /**
     * Days since last celebration
     */
    get daysSinceCelebration(): number;
    /**
     * Is there enough progress to celebrate?
     */
    get hasProgress(): boolean;
    /**
     * Is this ready to be celebrated?
     */
    get isReadyToCelebrate(): boolean;
    /**
     * Is this a breakthrough milestone?
     */
    get isBreakthrough(): boolean;
    /**
     * Add progress evidence
     */
    addProgressEvidence(evidence: GrowthEvidence): void;
    /**
     * Mark as celebrated
     */
    markCelebrated(): void;
    /**
     * Recalculate significance based on evidence
     */
    private recalculateSignificance;
    /**
     * Generate celebration message
     */
    private generateCelebrationMessage;
    /**
     * Get human-readable area label
     */
    private get areaLabel();
    /**
     * Convert to plain object for persistence
     */
    toPersistence(): {
        id: string;
        userId: string;
        area: GrowthArea;
        label: string | null;
        baselineEvidence: {
            timestamp: string;
            observation: string;
            type: 'baseline' | 'progress' | 'achievement';
            confidence: number;
        };
        progressEvidence: Array<{
            timestamp: string;
            observation: string;
            type: 'baseline' | 'progress' | 'achievement';
            confidence: number;
        }>;
        significance: MilestoneSignificance;
        celebrationMessage: string;
        celebrated: boolean;
        celebratedAt: string | null;
        createdAt: string;
        updatedAt: string;
        hasProgress: boolean;
        isReadyToCelebrate: boolean;
        daysSinceBaseline: number;
    };
    /**
     * Format for LLM prompt injection
     */
    formatForPrompt(): string;
}
//# sourceMappingURL=growth-milestone.d.ts.map