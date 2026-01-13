/**
 * PersonalityProfile Aggregate Root
 *
 * The central domain entity that represents Ferni's understanding of a user.
 * This is the AGGREGATE ROOT - all personality operations go through here.
 *
 * SUPERHUMAN capabilities are embedded in behavior methods:
 * - Anticipating emotions before expressed
 * - Knowing when to share vs. listen
 * - Tracking vulnerability with nuance
 * - Celebrating growth they don't notice
 *
 * @module personality/domain/model/personality-profile
 */
import { EmotionalPattern, type PatternType, type PatternEvidence } from './emotional-pattern.js';
import { GrowthMilestone, type GrowthArea, type GrowthEvidence } from './growth-milestone.js';
import { VulnerabilityDeposit, type VulnerabilityLevel, type VulnerabilityCategory, type FirstTimeMarker } from './vulnerability-deposit.js';
import { RelationshipDepth, type ShareDepth, type RelationshipStage } from './value-objects/relationship-depth.js';
import { EmotionalState, type EmotionalTrajectory } from './value-objects/emotional-state.js';
import { AnticipatedEmotion } from './value-objects/anticipated-emotion.js';
/**
 * Personal moment that can be shared
 */
export interface PersonalMoment {
    id: string;
    personaId: string;
    topic: string;
    content: string;
    transitions: string[];
    depth: ShareDepth;
    triggers: {
        keywords: string[];
        emotions?: string[];
        topics?: string[];
    };
}
/**
 * Context for decision-making
 */
export interface ConversationContext {
    /** Current user message */
    message?: string;
    /** Partial transcript (for anticipation) */
    partialTranscript?: string;
    /** Detected topics */
    topics?: string[];
    /** Current time */
    currentTime?: Date;
    /** Mentioned people */
    mentionedPeople?: string[];
    /** Voice tone (if available) */
    voiceTone?: 'rising' | 'falling' | 'flat' | 'breaking';
    /** Silence duration (if applicable) */
    silenceDurationMs?: number;
    /** Session turn count */
    turnCount?: number;
    /** Time since last interaction */
    timeSinceLastInteraction?: number;
}
/**
 * Sharing decision result
 */
export interface SharingDecision {
    shouldShare: boolean;
    reason: string;
    moment?: PersonalMoment;
    suggestedTransition?: string;
    cautionLevel: number;
}
/**
 * Domain events emitted by the profile
 */
export type PersonalityDomainEvent = {
    type: 'vulnerability_recorded';
    deposit: VulnerabilityDeposit;
} | {
    type: 'pattern_detected';
    pattern: EmotionalPattern;
} | {
    type: 'growth_milestone_ready';
    milestone: GrowthMilestone;
} | {
    type: 'trust_declined';
    previousStage: RelationshipStage;
    newStage: RelationshipStage;
} | {
    type: 'first_time_vulnerability';
    deposit: VulnerabilityDeposit;
} | {
    type: 'emotional_trajectory_changed';
    from: EmotionalTrajectory;
    to: EmotionalTrajectory;
};
/**
 * PersonalityProfile - The Aggregate Root
 *
 * Encapsulates all personality intelligence for a user.
 * All modifications go through this entity to maintain invariants.
 *
 * @example
 * ```typescript
 * const profile = PersonalityProfile.create('user_123', 'ferni');
 *
 * // Record vulnerability
 * profile.recordVulnerability({
 *   level: 'vulnerable',
 *   category: 'personal_struggle',
 *   summary: 'Shared about anxiety',
 *   content: 'I have panic attacks...',
 *   isFirstTime: true,
 * });
 *
 * // Check if we can share deep content
 * if (profile.canShareAtDepth('deep')) {
 *   const decision = profile.decideSharingMoment(moment, context);
 * }
 *
 * // Get anticipated emotion
 * const anticipated = profile.anticipateEmotion(context);
 * ```
 */
export declare class PersonalityProfile {
    /** User ID */
    readonly userId: string;
    /** Primary persona ID */
    readonly personaId: string;
    /** Relationship depth tracking */
    private _relationshipDepth;
    /** Current emotional state */
    private _currentEmotionalState;
    /** Emotional history (recent) */
    private _emotionalHistory;
    /** Detected emotional patterns */
    private _emotionalPatterns;
    /** Vulnerability deposits */
    private _vulnerabilityDeposits;
    /** Growth milestones */
    private _growthMilestones;
    /** Shared moments (what we've shared with them) */
    private _sharedMomentIds;
    /** Created timestamp */
    readonly createdAt: Date;
    /** Last updated */
    private _updatedAt;
    /** Last interaction */
    private _lastInteractionAt;
    /** Pending domain events to be published */
    private _domainEvents;
    private constructor();
    /**
     * Create a new personality profile
     */
    static create(userId: string, personaId: string): PersonalityProfile;
    /**
     * Reconstitute from persistence
     */
    static fromPersistence(data: {
        userId: string;
        personaId: string;
        relationshipDepth: ReturnType<RelationshipDepth['toPersistence']>;
        currentEmotionalState: ReturnType<EmotionalState['toPersistence']>;
        emotionalHistory: Array<ReturnType<EmotionalState['toPersistence']>>;
        emotionalPatterns: Array<ReturnType<EmotionalPattern['toPersistence']>>;
        vulnerabilityDeposits: Array<ReturnType<VulnerabilityDeposit['toPersistence']>>;
        growthMilestones: Array<ReturnType<GrowthMilestone['toPersistence']>>;
        sharedMomentIds: string[];
        createdAt: string;
        updatedAt: string;
        lastInteractionAt: string;
    }): PersonalityProfile;
    /** Current relationship depth */
    get relationshipDepth(): RelationshipDepth;
    /** Current emotional state */
    get currentEmotionalState(): EmotionalState;
    /** Recent emotional history */
    get emotionalHistory(): readonly EmotionalState[];
    /** All patterns */
    get emotionalPatterns(): readonly EmotionalPattern[];
    /** All vulnerability deposits */
    get vulnerabilityDeposits(): readonly VulnerabilityDeposit[];
    /** All growth milestones */
    get growthMilestones(): readonly GrowthMilestone[];
    /** Last updated */
    get updatedAt(): Date;
    /** Last interaction */
    get lastInteractionAt(): Date;
    /** Current relationship stage */
    get relationshipStage(): RelationshipStage;
    /** Pending domain events */
    get domainEvents(): readonly PersonalityDomainEvent[];
    /**
     * Get open vulnerabilities needing follow-up
     */
    get openVulnerabilities(): readonly VulnerabilityDeposit[];
    /**
     * Get urgent vulnerabilities
     */
    get urgentVulnerabilities(): readonly VulnerabilityDeposit[];
    /**
     * Get patterns ready to surface
     */
    get surfaceablePatterns(): readonly EmotionalPattern[];
    /**
     * Get milestones ready to celebrate
     */
    get celebratableMilestones(): readonly GrowthMilestone[];
    /**
     * Is user currently in a crisis state?
     */
    get isInCrisis(): boolean;
    /**
     * Should we hold space (be silent)?
     */
    get shouldHoldSpace(): boolean;
    /**
     * SUPERHUMAN: Anticipate emotion from partial input
     *
     * This is the core "Better Than Human" capability - understanding
     * what they're feeling BEFORE they finish expressing it.
     */
    anticipateEmotion(context: ConversationContext): AnticipatedEmotion | null;
    /**
     * Can we share content at this depth?
     */
    canShareAtDepth(depth: ShareDepth): boolean;
    /**
     * Decide whether to share a personal moment
     */
    decideSharingMoment(moment: PersonalMoment, context: ConversationContext): SharingDecision;
    /**
     * Check if a moment is relevant to context
     */
    private checkMomentRelevance;
    /**
     * Record a vulnerability deposit
     */
    recordVulnerability(params: {
        level: VulnerabilityLevel;
        category: VulnerabilityCategory;
        summary: string;
        content: string;
        keywords?: string[];
        isFirstTime?: boolean;
        firstTimeMarkers?: FirstTimeMarker[];
        acknowledgment?: string;
    }): void;
    /**
     * Update current emotional state
     */
    updateEmotionalState(state: EmotionalState): void;
    /**
     * Record pattern evidence
     */
    recordPatternEvidence(patternType: PatternType, description: string, triggers: string[], evidence: PatternEvidence): void;
    /**
     * Record growth evidence
     */
    recordGrowthEvidence(area: GrowthArea, evidence: GrowthEvidence): void;
    /**
     * Mark a vulnerability as followed up
     */
    markVulnerabilityFollowedUp(depositId: string, response: 'positive' | 'neutral' | 'negative'): void;
    /**
     * Mark a pattern as surfaced
     */
    markPatternSurfaced(patternId: string): void;
    /**
     * Mark a milestone as celebrated
     */
    markMilestoneCelebrated(milestoneId: string): void;
    /**
     * Record that we shared a moment
     */
    recordSharedMoment(momentId: string): void;
    /**
     * Record a trust signal
     */
    recordTrustSignal(delta: number): void;
    /**
     * Apply time decay
     */
    applyTimeDecay(): void;
    /**
     * Mark interaction
     */
    markInteraction(): void;
    /**
     * Clear domain events (after publishing)
     */
    clearDomainEvents(): void;
    /**
     * Touch updated timestamp
     */
    private touch;
    /**
     * Convert to plain object for persistence
     */
    toPersistence(): {
        userId: string;
        personaId: string;
        relationshipDepth: ReturnType<RelationshipDepth['toPersistence']>;
        currentEmotionalState: ReturnType<EmotionalState['toPersistence']>;
        emotionalHistory: Array<ReturnType<EmotionalState['toPersistence']>>;
        emotionalPatterns: Array<ReturnType<EmotionalPattern['toPersistence']>>;
        vulnerabilityDeposits: Array<ReturnType<VulnerabilityDeposit['toPersistence']>>;
        growthMilestones: Array<ReturnType<GrowthMilestone['toPersistence']>>;
        sharedMomentIds: string[];
        createdAt: string;
        updatedAt: string;
        lastInteractionAt: string;
        relationshipStage: RelationshipStage;
        isInCrisis: boolean;
        openVulnerabilityCount: number;
        surfaceablePatternCount: number;
        celebratableMilestoneCount: number;
    };
}
//# sourceMappingURL=personality-profile.d.ts.map