/**
 * AnticipatedEmotion Value Object
 *
 * SUPERHUMAN CORE: This represents an emotion we PREDICT before the user
 * fully expresses it. This is the "they understand me before I finish" feeling.
 *
 * Human limitation: Humans wait for the full message before responding.
 * Superhuman: We anticipate from partial speech + tone + patterns.
 *
 * @module personality/domain/model/value-objects/anticipated-emotion
 */
import type { EmotionalState, GranularEmotion, PrimaryEmotion } from './emotional-state.js';
/**
 * Signal types we use for anticipation
 */
export type AnticipationSignal = 'partial_speech' | 'tone_shift' | 'pace_change' | 'breath_pattern' | 'pause_before' | 'historical_pattern' | 'temporal_pattern' | 'topic_trigger';
/**
 * How we should respond to anticipated emotion
 */
export type AnticipationResponse = 'prepare_empathy' | 'prepare_celebration' | 'prepare_space' | 'prepare_curiosity' | 'prepare_validation' | 'no_action';
/**
 * Confidence levels for anticipation
 */
export type AnticipationConfidence = 'certain' | 'likely' | 'possible' | 'speculative';
/**
 * AnticipatedEmotion value object
 *
 * This is the heart of "Better Than Human" - predicting emotional states
 * before they're fully expressed, allowing us to respond with supernatural
 * understanding.
 *
 * @example
 * ```typescript
 * // User says "I've been thinking about..." with falling tone
 * const anticipated = AnticipatedEmotion.create({
 *   emotion: 'sadness',
 *   granular: 'melancholy',
 *   confidence: 'likely',
 *   signals: ['partial_speech', 'tone_shift'],
 *   reasoning: 'Falling tone + reflective phrase suggests processing something difficult',
 * });
 *
 * if (anticipated.shouldPrepareEmpathy) {
 *   // Start showing contemplative micro-expression NOW
 *   // Don't wait for them to finish
 * }
 * ```
 */
export declare class AnticipatedEmotion {
    /** Predicted primary emotion */
    readonly emotion: PrimaryEmotion;
    /** Predicted granular emotion (if confident enough) */
    readonly granular: GranularEmotion | null;
    /** How confident we are */
    readonly confidence: AnticipationConfidence;
    /** Numeric confidence (0-1) */
    readonly confidenceScore: number;
    /** Signals that led to this prediction */
    readonly signals: AnticipationSignal[];
    /** Human-readable reasoning */
    readonly reasoning: string;
    /** Recommended response preparation */
    readonly recommendedResponse: AnticipationResponse;
    /** Partial transcript that triggered anticipation */
    readonly partialTranscript?: string | undefined;
    /** Historical pattern ID if based on pattern */
    readonly basedOnPatternId?: string | undefined;
    /** How far in advance we're predicting (seconds, null = real-time) */
    readonly predictionHorizon: number | null;
    /** When this prediction was made */
    readonly predictedAt: Date;
    private constructor();
    /**
     * Create a new anticipation
     */
    static create(params: {
        emotion: PrimaryEmotion;
        granular?: GranularEmotion;
        confidence: AnticipationConfidence;
        signals: AnticipationSignal[];
        reasoning: string;
        partialTranscript?: string;
        basedOnPatternId?: string;
        predictionHorizon?: number;
    }): AnticipatedEmotion;
    /**
     * Create from partial speech analysis
     */
    static fromPartialSpeech(partialTranscript: string, detectedEmotion: PrimaryEmotion, granular: GranularEmotion | null, confidence: number, reasoning: string): AnticipatedEmotion;
    /**
     * Create from historical pattern match
     */
    static fromPattern(patternId: string, predictedEmotion: PrimaryEmotion, granular: GranularEmotion | null, confidence: number, reasoning: string, predictionHorizonSeconds?: number): AnticipatedEmotion;
    /**
     * Create from voice tone analysis
     */
    static fromVoiceTone(toneSignal: 'rising' | 'falling' | 'flat' | 'breaking', inferredEmotion: PrimaryEmotion, confidence: number, granular?: GranularEmotion | null): AnticipatedEmotion;
    /**
     * Should we start showing empathy signals now?
     */
    get shouldPrepareEmpathy(): boolean;
    /**
     * Should we prepare to celebrate?
     */
    get shouldPrepareCelebration(): boolean;
    /**
     * Is this a strong enough prediction to act on?
     */
    get isActionable(): boolean;
    /**
     * Is this predicting negative emotion?
     */
    get isNegativePrediction(): boolean;
    /**
     * Is this a real-time anticipation (vs. future prediction)?
     */
    get isRealTime(): boolean;
    /**
     * Get micro-expression type to display
     */
    get suggestedMicroExpression(): string | null;
    /**
     * Determine appropriate response based on anticipated emotion
     */
    private static determineResponse;
    /**
     * Check if this anticipation was accurate once we know the real emotion
     */
    wasAccurate(actualEmotion: EmotionalState): boolean;
    /**
     * Combine with another anticipation (multiple signals)
     */
    combineWith(other: AnticipatedEmotion): AnticipatedEmotion;
    /**
     * Convert to plain object for persistence/logging
     */
    toPersistence(): {
        emotion: PrimaryEmotion;
        granular: GranularEmotion | null;
        confidence: AnticipationConfidence;
        confidenceScore: number;
        signals: AnticipationSignal[];
        reasoning: string;
        recommendedResponse: AnticipationResponse;
        partialTranscript?: string;
        basedOnPatternId?: string;
        predictionHorizon: number | null;
        predictedAt: string;
        isActionable: boolean;
        suggestedMicroExpression: string | null;
    };
    /**
     * Format for LLM prompt injection
     */
    formatForPrompt(): string;
}
//# sourceMappingURL=anticipated-emotion.d.ts.map