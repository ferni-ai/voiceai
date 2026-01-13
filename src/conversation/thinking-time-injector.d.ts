/**
 * Dynamic Thinking Time Injector
 *
 * Calculates contextually-appropriate thinking pauses to inject into responses.
 * Makes AI feel like it's actually processing, not just pattern-matching.
 *
 * The Problem: Instant responses feel robotic. But random pauses feel fake.
 * The Solution: Pauses that correlate with ACTUAL complexity/emotion/weight.
 *
 * Pause Factors:
 * 1. Question Complexity - Deep questions deserve consideration
 * 2. Emotional Weight - Heavy topics need space
 * 3. Conversation Momentum - Match user's pace
 * 4. Turn Count - Early = more thinking, later = rapport built
 * 5. Self-Correction - "Actually..." moments need setup
 * 6. Persona Style - Some personas are more contemplative
 *
 * COORDINATION: Uses ThinkingPhraseCoordinator to prevent duplicate
 * "good question" phrases from multiple systems.
 *
 * NOTE: This module injects pauses INTO the AI's RESPONSE text.
 * For filling dead air BEFORE the response (LLM processing delays),
 * use ProcessingIntelligence instead.
 *
 * @see src/intelligence/processing-intelligence.ts for dead air/processing delays
 * @module conversation/thinking-time-injector
 */
export interface ThinkingContext {
    /** User's message text */
    userText: string;
    /** Detected emotional intensity 0-1 */
    emotionalIntensity?: number;
    /** Current turn count */
    turnCount: number;
    /** Session ID for momentum tracking */
    sessionId: string;
    /** Persona ID for style customization */
    personaId?: string;
    /** Whether response contains self-correction */
    hasSelfCorrection?: boolean;
    /** Whether this is a complex/multi-part question */
    isComplexQuestion?: boolean;
    /** User's response latency (how long they took to respond) */
    userResponseLatencyMs?: number;
}
export interface ThinkingInjection {
    /** SSML pause duration at start */
    openingPauseMs: number;
    /** Thinking sound to use (if any) */
    thinkingSound?: string;
    /** Mid-response pause points */
    midPauses: Array<{
        afterWord: number;
        durationMs: number;
        type: 'consideration' | 'emphasis' | 'transition' | 'breath';
    }>;
    /** Whether to slow overall speech rate */
    slowSpeechRate: boolean;
    /** Rate multiplier (1.0 = normal, 0.9 = slower) */
    speechRateMultiplier: number;
    /** Debug info about why these pauses were chosen */
    reasoning: string[];
}
declare const COMPLEX_QUESTION_PATTERNS: RegExp[];
declare const HEAVY_TOPIC_PATTERNS: RegExp[];
declare function detectQuestionComplexity(text: string): {
    isComplex: boolean;
    weight: number;
};
/**
 * Calculate dynamic thinking time parameters for a response
 */
export declare function calculateThinkingTime(ctx: ThinkingContext, responseWordCount?: number): ThinkingInjection;
/**
 * Apply thinking time as SSML to response text
 */
export declare function applyThinkingTimeSSML(text: string, injection: ThinkingInjection): string;
export { detectQuestionComplexity, COMPLEX_QUESTION_PATTERNS, HEAVY_TOPIC_PATTERNS };
//# sourceMappingURL=thinking-time-injector.d.ts.map