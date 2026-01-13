/**
 * EmotionalState Value Object
 *
 * Captures the current emotional state with SUPERHUMAN nuance.
 * We track not just the emotion, but intensity, confidence, trajectory,
 * and whether there are contradictions (both/and emotions).
 *
 * @module personality/domain/model/value-objects/emotional-state
 */
/**
 * Primary emotion categories
 */
export type PrimaryEmotion = 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust' | 'trust' | 'anticipation' | 'neutral';
/**
 * More granular emotion labels
 */
export type GranularEmotion = 'ecstatic' | 'happy' | 'content' | 'hopeful' | 'relieved' | 'proud' | 'grateful' | 'devastated' | 'sad' | 'melancholy' | 'disappointed' | 'lonely' | 'grief' | 'furious' | 'angry' | 'frustrated' | 'irritated' | 'resentful' | 'terrified' | 'anxious' | 'worried' | 'nervous' | 'overwhelmed' | 'vulnerable' | 'shocked' | 'amazed' | 'confused' | 'calm' | 'exhausted' | 'bored' | 'curious' | 'nostalgic' | 'ambivalent';
/**
 * Emotional trajectory (is it getting better or worse?)
 */
export type EmotionalTrajectory = 'improving' | 'stable' | 'declining' | 'volatile';
/**
 * Signal source for the emotional detection
 */
export type EmotionSource = 'text' | 'voice' | 'behavior' | 'pattern' | 'inferred';
/**
 * EmotionalState value object
 *
 * SUPERHUMAN: We capture nuance that humans often miss:
 * - Contradicting emotions (excited AND scared)
 * - Trajectory (getting better or worse)
 * - Confidence in our detection
 * - Multiple sources of signal
 *
 * @example
 * ```typescript
 * const state = EmotionalState.create({
 *   primary: 'fear',
 *   granular: 'anxious',
 *   intensity: 0.7,
 *   confidence: 0.85,
 * });
 *
 * const withContradiction = state.withContradictingEmotion('joy', 'excited');
 * // Now represents: "anxious but also excited" - both/and, not either/or
 * ```
 */
export declare class EmotionalState {
    /** Primary emotion category */
    readonly primary: PrimaryEmotion;
    /** More specific emotion label */
    readonly granular: GranularEmotion | null;
    /** Intensity of the emotion (0-1) */
    readonly intensity: number;
    /** Confidence in our detection (0-1) */
    readonly confidence: number;
    /** Current trajectory */
    readonly trajectory: EmotionalTrajectory;
    /** Sources of this detection */
    readonly sources: EmotionSource[];
    /** Contradicting emotion (if any) - SUPERHUMAN: holding both/and */
    readonly contradictingEmotion?: {
        primary: PrimaryEmotion;
        granular: GranularEmotion | null;
        intensity: number;
    } | undefined;
    /** Context that triggered this emotion */
    readonly triggerContext?: string | undefined;
    /** Topics associated with this emotion */
    readonly associatedTopics: string[];
    /** Timestamp */
    readonly detectedAt: Date;
    private constructor();
    /**
     * Create a new emotional state
     */
    static create(params: {
        primary: PrimaryEmotion;
        granular?: GranularEmotion;
        intensity: number;
        confidence?: number;
        trajectory?: EmotionalTrajectory;
        sources?: EmotionSource[];
        triggerContext?: string;
        associatedTopics?: string[];
    }): EmotionalState;
    /**
     * Create a neutral state
     */
    static neutral(): EmotionalState;
    /**
     * Create from text analysis
     */
    static fromTextAnalysis(primary: PrimaryEmotion, granular: GranularEmotion | null, intensity: number, confidence: number): EmotionalState;
    /**
     * Create from voice analysis
     */
    static fromVoiceAnalysis(primary: PrimaryEmotion, granular: GranularEmotion | null, intensity: number, confidence: number): EmotionalState;
    /**
     * Reconstitute from persistence
     */
    static fromPersistence(data: {
        primary: PrimaryEmotion;
        granular?: GranularEmotion | null;
        intensity: number;
        confidence: number;
        trajectory: EmotionalTrajectory;
        sources: EmotionSource[];
        contradictingEmotion?: {
            primary: PrimaryEmotion;
            granular: GranularEmotion | null;
            intensity: number;
        };
        triggerContext?: string;
        associatedTopics?: string[];
        detectedAt: string;
    }): EmotionalState;
    /**
     * Is this a negative emotional state?
     */
    get isNegative(): boolean;
    /**
     * Is this a positive emotional state?
     */
    get isPositive(): boolean;
    /**
     * Are there contradicting emotions? (SUPERHUMAN: both/and)
     */
    get hasContradiction(): boolean;
    /**
     * Is this a high-intensity state?
     */
    get isHighIntensity(): boolean;
    /**
     * Is this a crisis-level state?
     */
    get isCrisisLevel(): boolean;
    /**
     * Should we hold space (not respond immediately)?
     */
    get shouldHoldSpace(): boolean;
    /**
     * Get a human-readable description
     */
    get description(): string;
    /**
     * Merge with another emotional signal (e.g., combining text + voice)
     *
     * SUPERHUMAN: We can combine multiple signal sources for higher confidence
     */
    mergeWith(other: EmotionalState): EmotionalState;
    /**
     * Check if this emotion is appropriate for sharing a particular depth
     */
    isAppropriateForSharing(depth: 'surface' | 'medium' | 'deep' | 'sacred'): boolean;
    /**
     * Calculate emotional distance from another state
     *
     * SUPERHUMAN: Useful for tracking emotional journey
     */
    distanceFrom(other: EmotionalState): number;
    /**
     * Add a contradicting emotion (SUPERHUMAN: both/and)
     */
    withContradictingEmotion(primary: PrimaryEmotion, granular: GranularEmotion | null, intensity?: number): EmotionalState;
    /**
     * Update trajectory
     */
    withTrajectory(trajectory: EmotionalTrajectory): EmotionalState;
    /**
     * Add associated topics
     */
    withTopics(topics: string[]): EmotionalState;
    /**
     * Add trigger context
     */
    withTriggerContext(context: string): EmotionalState;
    /**
     * Convert to plain object for persistence
     */
    toPersistence(): {
        primary: PrimaryEmotion;
        granular: GranularEmotion | null;
        intensity: number;
        confidence: number;
        trajectory: EmotionalTrajectory;
        sources: EmotionSource[];
        contradictingEmotion?: {
            primary: PrimaryEmotion;
            granular: GranularEmotion | null;
            intensity: number;
        };
        triggerContext?: string;
        associatedTopics: string[];
        detectedAt: string;
        isNegative: boolean;
        isPositive: boolean;
        hasContradiction: boolean;
        description: string;
    };
    /**
     * Equality check
     */
    equals(other: EmotionalState): boolean;
}
//# sourceMappingURL=emotional-state.d.ts.map