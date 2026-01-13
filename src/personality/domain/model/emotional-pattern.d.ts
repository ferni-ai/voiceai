/**
 * EmotionalPattern Entity
 *
 * Represents a detected pattern in the user's emotional life.
 * SUPERHUMAN: We notice patterns they don't notice themselves.
 *
 * "I've noticed you seem more stressed when work comes up lately"
 * "Every Sunday evening you seem to get anxious"
 *
 * @module personality/domain/model/emotional-pattern
 */
import type { PrimaryEmotion, GranularEmotion } from './value-objects/emotional-state.js';
/**
 * Types of patterns we detect
 */
export type PatternType = 'topic_emotion' | 'temporal' | 'cyclical' | 'trajectory' | 'trigger_response' | 'person_related' | 'context_dependent';
/**
 * When to surface this pattern
 */
export type PatternDeliveryTiming = 'immediate' | 'when_relevant' | 'proactive' | 'never';
/**
 * Evidence for a pattern
 */
export interface PatternEvidence {
    /** When this evidence was recorded */
    timestamp: Date;
    /** The context/message that showed this pattern */
    context: string;
    /** The emotion detected */
    emotion: PrimaryEmotion;
    /** Granular emotion if available */
    granular?: GranularEmotion;
    /** Intensity (0-1) */
    intensity: number;
    /** Topics involved */
    topics?: string[];
}
/**
 * EmotionalPattern Entity
 *
 * Tracks a specific emotional pattern we've detected.
 * Has identity (id) and lifecycle (created, updated, surfaced).
 *
 * @example
 * ```typescript
 * const pattern = EmotionalPattern.create({
 *   userId: 'user_123',
 *   patternType: 'topic_emotion',
 *   description: 'work → stress',
 *   triggers: ['work', 'job', 'boss'],
 *   resultingEmotion: 'fear',
 *   resultingGranular: 'anxious',
 * });
 *
 * pattern.addEvidence({
 *   timestamp: new Date(),
 *   context: 'User mentioned upcoming deadline',
 *   emotion: 'fear',
 *   granular: 'anxious',
 *   intensity: 0.7,
 *   topics: ['work', 'deadline'],
 * });
 *
 * if (pattern.isReady ToSurface) {
 *   // Gently share this insight
 * }
 * ```
 */
export declare class EmotionalPattern {
    /** Unique pattern ID */
    readonly id: string;
    /** User this pattern belongs to */
    readonly userId: string;
    /** Type of pattern */
    readonly patternType: PatternType;
    /** Human-readable description */
    readonly description: string;
    /** Triggers (topics, times, people, etc.) */
    readonly triggers: string[];
    /** Resulting emotion */
    readonly resultingEmotion: PrimaryEmotion;
    /** Granular emotion */
    readonly resultingGranular: GranularEmotion | null;
    /** Evidence supporting this pattern */
    private _evidence;
    /** Pattern confidence (0-1) */
    private _confidence;
    /** When to surface */
    readonly deliveryTiming: PatternDeliveryTiming;
    /** Insight to share with user */
    readonly insightToShare: string;
    /** Has this been surfaced to the user? */
    private _surfaced;
    /** When it was last surfaced */
    private _lastSurfacedAt;
    /** How many times surfaced */
    private _surfaceCount;
    /** Created timestamp */
    readonly createdAt: Date;
    /** Last updated timestamp */
    private _updatedAt;
    private constructor();
    /**
     * Create a new pattern
     */
    static create(params: {
        userId: string;
        patternType: PatternType;
        description: string;
        triggers: string[];
        resultingEmotion: PrimaryEmotion;
        resultingGranular?: GranularEmotion;
        insightToShare?: string;
        deliveryTiming?: PatternDeliveryTiming;
    }): EmotionalPattern;
    /**
     * Generate default insight based on pattern type
     */
    private static generateDefaultInsight;
    /**
     * Reconstitute from persistence
     */
    static fromPersistence(data: {
        id: string;
        userId: string;
        patternType: PatternType;
        description: string;
        triggers: string[];
        resultingEmotion: PrimaryEmotion;
        resultingGranular?: GranularEmotion | null;
        evidence: Array<{
            timestamp: string;
            context: string;
            emotion: PrimaryEmotion;
            granular?: GranularEmotion;
            intensity: number;
            topics?: string[];
        }>;
        confidence: number;
        deliveryTiming: PatternDeliveryTiming;
        insightToShare: string;
        surfaced: boolean;
        lastSurfacedAt?: string | null;
        surfaceCount: number;
        createdAt: string;
        updatedAt: string;
    }): EmotionalPattern;
    /** Current confidence score */
    get confidence(): number;
    /** Get evidence array (immutable copy) */
    get evidence(): readonly PatternEvidence[];
    /** Evidence count */
    get evidenceCount(): number;
    /** Has been surfaced */
    get surfaced(): boolean;
    /** Last surfaced timestamp */
    get lastSurfacedAt(): Date | null;
    /** Surface count */
    get surfaceCount(): number;
    /** Last updated */
    get updatedAt(): Date;
    /**
     * Is this pattern confirmed (enough evidence)?
     */
    get isConfirmed(): boolean;
    /**
     * Is this pattern ready to surface to the user?
     */
    get isReadyToSurface(): boolean;
    /**
     * Is this a high-confidence pattern?
     */
    get isHighConfidence(): boolean;
    /**
     * Should this be surfaced immediately?
     */
    get shouldSurfaceImmediately(): boolean;
    /**
     * Get average intensity from evidence
     */
    get averageIntensity(): number;
    /**
     * Get most recent evidence
     */
    get mostRecentEvidence(): PatternEvidence | null;
    /**
     * Add evidence for this pattern
     */
    addEvidence(evidence: PatternEvidence): void;
    /**
     * Mark as surfaced to user
     */
    markSurfaced(): void;
    /**
     * Check if triggers match current context
     */
    matchesTriggers(context: {
        topics?: string[];
        currentTime?: Date;
        mentionedPeople?: string[];
    }): boolean;
    /**
     * Recalculate confidence based on evidence
     */
    private recalculateConfidence;
    /**
     * Convert to plain object for persistence
     */
    toPersistence(): {
        id: string;
        userId: string;
        patternType: PatternType;
        description: string;
        triggers: string[];
        resultingEmotion: PrimaryEmotion;
        resultingGranular: GranularEmotion | null;
        evidence: Array<{
            timestamp: string;
            context: string;
            emotion: PrimaryEmotion;
            granular?: GranularEmotion;
            intensity: number;
            topics?: string[];
        }>;
        confidence: number;
        deliveryTiming: PatternDeliveryTiming;
        insightToShare: string;
        surfaced: boolean;
        lastSurfacedAt: string | null;
        surfaceCount: number;
        createdAt: string;
        updatedAt: string;
        isConfirmed: boolean;
        isReadyToSurface: boolean;
        averageIntensity: number;
    };
    /**
     * Format for LLM prompt injection
     */
    formatForPrompt(): string;
}
//# sourceMappingURL=emotional-pattern.d.ts.map