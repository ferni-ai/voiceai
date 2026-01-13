/**
 * AnticipationEngine Domain Service
 *
 * SUPERHUMAN CORE: Predicts emotions BEFORE they're fully expressed.
 *
 * "They understand me before I finish"
 *
 * This is pure domain logic - no I/O, no infrastructure dependencies.
 *
 * @module personality/domain/services/anticipation-engine
 */
import type { EmotionalPattern } from '../model/emotional-pattern.js';
import type { EmotionalState, PrimaryEmotion } from '../model/value-objects/emotional-state.js';
import { AnticipatedEmotion } from '../model/value-objects/anticipated-emotion.js';
/**
 * Input context for anticipation
 */
export interface AnticipationContext {
    /** Partial transcript (they haven't finished speaking) */
    partialTranscript?: string;
    /** Voice tone detected */
    voiceTone?: 'rising' | 'falling' | 'flat' | 'breaking';
    /** Speaking pace */
    pace?: 'rapid' | 'normal' | 'slow' | 'hesitant';
    /** Breath pattern */
    breathPattern?: 'normal' | 'shallow' | 'sighing' | 'held';
    /** Current topics */
    topics?: string[];
    /** Current time (for temporal patterns) */
    currentTime?: Date;
    /** Mentioned people */
    mentionedPeople?: string[];
}
/**
 * AnticipationEngine - Pure Domain Service
 *
 * Analyzes partial input to predict emotions before fully expressed.
 * No I/O dependencies - takes data in, returns predictions.
 *
 * @example
 * ```typescript
 * const engine = new AnticipationEngine();
 *
 * const anticipated = engine.anticipateFromContext({
 *   partialTranscript: "I've been thinking about...",
 *   voiceTone: 'falling',
 * }, historicalPatterns);
 *
 * if (anticipated?.shouldPrepareEmpathy) {
 *   // Start showing contemplative micro-expression
 * }
 * ```
 */
export declare class AnticipationEngine {
    /**
     * Anticipate emotion from partial context
     */
    anticipateFromContext(context: AnticipationContext, historicalPatterns: EmotionalPattern[]): AnticipatedEmotion | null;
    /**
     * Anticipate from speech patterns
     */
    anticipateFromSpeechPattern(partialTranscript: string): AnticipatedEmotion | null;
    /**
     * Anticipate from voice tone
     */
    anticipateFromVoiceTone(tone: NonNullable<AnticipationContext['voiceTone']>): AnticipatedEmotion | null;
    /**
     * Anticipate from breath pattern
     */
    anticipateFromBreathPattern(pattern: NonNullable<AnticipationContext['breathPattern']>): AnticipatedEmotion | null;
    /**
     * Anticipate from historical patterns
     */
    anticipateFromHistoricalPatterns(context: AnticipationContext, patterns: EmotionalPattern[]): AnticipatedEmotion | null;
    /**
     * Combine multiple anticipations into one
     */
    private combineAnticipations;
    /**
     * Forecast emotional trajectory over coming days
     *
     * SUPERHUMAN: Predict emotions days in advance based on patterns
     */
    forecastEmotionalTrajectory(patterns: EmotionalPattern[], upcomingEvents: Array<{
        date: Date;
        description: string;
        topics: string[];
    }>, currentState: EmotionalState): Array<{
        date: Date;
        event: string;
        predictedEmotion: PrimaryEmotion;
        confidence: number;
        reasoning: string;
    }>;
    /**
     * Calculate optimal time to surface an insight
     *
     * SUPERHUMAN: Know when they're most receptive
     */
    calculateOptimalSurfacingTime(insight: {
        topics: string[];
        emotionalWeight: number;
    }, patterns: EmotionalPattern[], currentState: EmotionalState): {
        shouldSurfaceNow: boolean;
        reason: string;
    };
}
//# sourceMappingURL=anticipation-engine.d.ts.map