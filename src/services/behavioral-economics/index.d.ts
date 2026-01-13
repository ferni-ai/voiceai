/**
 * Behavioral Economics for Coaching
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Behavioral economics techniques that help people bridge the gap
 * between intention and action. These nudges work with human psychology,
 * not against it.
 *
 * PHILOSOPHY:
 * People know what they should do. The challenge is doing it.
 * Behavioral economics helps by designing choice architecture,
 * reducing friction, and leveraging our natural biases for good.
 *
 * TECHNIQUES:
 * 1. Implementation Intentions - "When X, I will Y"
 * 2. Commitment Devices - Pre-committing to reduce future temptation
 * 3. Loss Framing - Leveraging loss aversion
 * 4. Temptation Bundling - Pairing wants with shoulds
 * 5. Social Proof - "People like you..."
 * 6. Default Design - Making good choices the path of least resistance
 * 7. Friction Reduction - Removing barriers to action
 *
 * @module BehavioralEconomics
 */
export interface ImplementationIntention {
    id: string;
    userId: string;
    /** The cue/trigger */
    when: string;
    /** The planned action */
    then: string;
    /** What goal this serves */
    goal: string;
    /** How specific is the plan? */
    specificity: 'vague' | 'moderate' | 'specific';
    /** Has this been rehearsed? */
    rehearsed: boolean;
    /** Success tracking */
    timesTriggered: number;
    timesCompleted: number;
    createdAt: Date;
}
export interface CommitmentDevice {
    id: string;
    userId: string;
    /** What they're committing to */
    commitment: string;
    /** Type of commitment */
    type: 'stake' | 'social' | 'identity' | 'calendar' | 'accountability';
    /** Who knows about it? */
    witnesses?: string[];
    /** What's at stake? */
    stake?: string;
    /** Deadline */
    deadline?: Date;
    /** Status */
    status: 'active' | 'completed' | 'failed' | 'expired';
    createdAt: Date;
}
export interface TemptationBundle {
    id: string;
    userId: string;
    /** The "should" behavior */
    shouldBehavior: string;
    /** The "want" reward */
    wantReward: string;
    /** Rule: only get want when doing should */
    rule: string;
    /** Is it working? */
    effectiveness?: number;
    createdAt: Date;
}
export interface FrictionAudit {
    goal: string;
    barriers: FrictionBarrier[];
    solutions: string[];
}
export interface FrictionBarrier {
    barrier: string;
    type: 'time' | 'effort' | 'decision' | 'access' | 'emotional' | 'social';
    severity: 'low' | 'medium' | 'high';
    solution?: string;
}
/**
 * Create an implementation intention.
 * "When [situation], I will [behavior] to achieve [goal]"
 */
export declare function createImplementationIntention(userId: string, when: string, then: string, goal: string): ImplementationIntention;
/**
 * Get implementation intentions for a user.
 */
export declare function getImplementationIntentions(userId: string): ImplementationIntention[];
/**
 * Generate prompts to make intentions more specific.
 */
export declare function strengthenIntention(intention: ImplementationIntention): string[];
/**
 * Record intention trigger and outcome.
 */
export declare function recordIntentionOutcome(userId: string, intentionId: string, completed: boolean): void;
/**
 * Create a commitment device.
 */
export declare function createCommitmentDevice(userId: string, commitment: string, type: CommitmentDevice['type'], options?: {
    witnesses?: string[];
    stake?: string;
    deadline?: Date;
}): CommitmentDevice;
/**
 * Get active commitment devices.
 */
export declare function getActiveCommitments(userId: string): CommitmentDevice[];
/**
 * Generate commitment device suggestions based on goal.
 */
export declare function suggestCommitmentDevice(goal: string, userContext?: {
    hasAccountabilityPartner?: boolean;
    valuesIdentity?: string[];
}): CommitmentSuggestion[];
export interface CommitmentSuggestion {
    type: CommitmentDevice['type'];
    suggestion: string;
    strength: 'low' | 'medium' | 'high';
    why: string;
}
/**
 * Reframe a goal in terms of loss rather than gain.
 * Loss aversion: losing $100 feels worse than gaining $100 feels good.
 */
export declare function applyLossFraming(goal: string, currentBenefit?: string): string;
/**
 * Generate loss-framed questions.
 */
export declare function getLossFramedQuestions(topic: string): string[];
/**
 * Create a temptation bundle.
 * "I only get [thing I want] when I'm doing [thing I should do]"
 */
export declare function createTemptationBundle(userId: string, shouldBehavior: string, wantReward: string): TemptationBundle;
/**
 * Suggest temptation bundles based on wants and shoulds.
 */
export declare function suggestTemptationBundles(shoulds: string[], wants: string[]): TemptationBundleSuggestion[];
export interface TemptationBundleSuggestion {
    should: string;
    want: string;
    rule: string;
    effectiveness: 'low' | 'medium' | 'high';
}
/**
 * Get user's temptation bundles.
 */
export declare function getTemptationBundles(userId: string): TemptationBundle[];
/**
 * Audit friction for a goal.
 */
export declare function auditFriction(goal: string, currentBarriers?: string[]): FrictionAudit;
/**
 * Generate friction questions to identify barriers.
 */
export declare function getFrictionQuestions(goal: string): string[];
/**
 * Generate social proof statements.
 */
export declare function generateSocialProof(context: {
    demographic?: string;
    goal?: string;
    behavior?: string;
}): string[];
/**
 * Build behavioral economics context for LLM.
 */
export declare function buildBehavioralEconomicsContext(userId: string, context: {
    goal?: string;
    barrier?: string;
    hasIntention?: boolean;
    hasCommitment?: boolean;
}): string | null;
//# sourceMappingURL=index.d.ts.map