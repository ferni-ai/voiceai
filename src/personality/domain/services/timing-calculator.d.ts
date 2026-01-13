/**
 * TimingCalculator Domain Service
 *
 * SUPERHUMAN: Knows when to share and when to just listen.
 *
 * "Human limitation: People share stories about themselves when YOU need to be heard."
 * "Superhuman: We know the perfect moment for everything."
 *
 * Pure domain logic - no I/O dependencies.
 *
 * @module personality/domain/services/timing-calculator
 */
import type { EmotionalState } from '../model/value-objects/emotional-state.js';
import type { RelationshipDepth } from '../model/value-objects/relationship-depth.js';
/**
 * User intent classification
 */
export type UserIntent = 'needs_to_be_heard' | 'seeking_perspective' | 'open_to_connection' | 'just_venting' | 'seeking_advice' | 'sharing_good_news' | 'processing_aloud' | 'small_talk' | 'vulnerable_share' | 'checking_in';
/**
 * Suggested response type
 */
export type SuggestedResponse = 'deep_listening' | 'validation' | 'reflection' | 'share_story' | 'ask_more' | 'celebrate' | 'hold_space' | 'gentle_guidance' | 'light_engagement';
/**
 * Timing analysis result
 */
export interface TimingAnalysis {
    /** Detected user intent */
    intent: UserIntent;
    /** Confidence in intent detection */
    confidence: number;
    /** Suggested response type */
    suggestedResponse: SuggestedResponse;
    /** Is it appropriate to share a personal moment? */
    personalMomentAppropriate: boolean;
    /** Is it appropriate to bring up a callback? */
    callbackAppropriate: boolean;
    /** Is it appropriate to share a pattern insight? */
    patternInsightAppropriate: boolean;
    /** Human-readable reasoning */
    reasoningNotes: string;
}
/**
 * Message metadata for analysis
 */
export interface MessageMetadata {
    /** Word count */
    wordCount?: number;
    /** Sentence count */
    sentenceCount?: number;
    /** Has a question */
    hasQuestion?: boolean;
    /** Emotional intensity (0-1) */
    emotionalIntensity?: number;
    /** Topics discussed */
    topics?: string[];
    /** Was the previous turn a question? */
    previousTurnWasQuestion?: boolean;
    /** Silence before this message (ms) */
    silenceBeforeMs?: number;
}
/**
 * TimingCalculator - Pure Domain Service
 *
 * Analyzes messages to determine optimal timing for different response types.
 * No I/O dependencies - pure logic.
 *
 * @example
 * ```typescript
 * const calculator = new TimingCalculator();
 *
 * const analysis = calculator.analyzeMessageTiming("I've been feeling really overwhelmed lately");
 *
 * if (!analysis.personalMomentAppropriate) {
 *   // Just listen, don't share personal stories
 * }
 * ```
 */
export declare class TimingCalculator {
    /**
     * Analyze a message to determine timing/response strategy
     */
    analyzeMessageTiming(message: string, metadata?: MessageMetadata): TimingAnalysis;
    /**
     * Should we share a personal moment right now?
     */
    shouldSharePersonalMoment(message: string, momentRelevance: number, emotionalState: EmotionalState, relationshipDepth: RelationshipDepth, metadata?: MessageMetadata): {
        should: boolean;
        reason: string;
    };
    /**
     * Should we bring up a callback (follow-up on something they shared)?
     */
    shouldBringUpCallback(message: string, callbackUrgency: 'low' | 'medium' | 'high', emotionalState: EmotionalState, metadata?: MessageMetadata): {
        should: boolean;
        reason: string;
    };
    /**
     * Should we surface a pattern insight?
     */
    shouldSurfacePatternInsight(message: string, patternConfidence: number, emotionalState: EmotionalState, relationshipDepth: RelationshipDepth, metadata?: MessageMetadata): {
        should: boolean;
        reason: string;
    };
    /**
     * Format timing guidance for LLM prompt injection
     */
    formatTimingGuidance(analysis: TimingAnalysis): string;
}
//# sourceMappingURL=timing-calculator.d.ts.map