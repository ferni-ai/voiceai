/**
 * Self-Correction System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Humans don't speak in perfect sentences. They restart, correct themselves,
 * and refine thoughts mid-speech. This module adds natural self-correction
 * patterns that make responses feel genuinely human.
 *
 * **When to use:**
 * - Complex explanations (>50 words)
 * - Emotional topics (shows careful thought)
 * - When giving advice (shows consideration)
 * - After thinking pauses (shows processing)
 *
 * **When NOT to use:**
 * - Simple responses
 * - Crisis situations (need clarity)
 * - Very early in conversation
 * - Too frequently (becomes annoying)
 *
 * @module @ferni/humanization/self-correction
 */
import type { HumanizationContext, HumanizationDecision, HumanizationInjection } from './types.js';
export type SelfCorrectionType = 'restart' | 'mid_sentence' | 'refinement';
export interface SelfCorrectionConfig {
    /** Base probability of triggering */
    baseProbability: number;
    /** Multiplier for complex content */
    complexityMultiplier: number;
    /** Multiplier for emotional content */
    emotionalMultiplier: number;
    /** Max per session */
    maxPerSession: number;
    /** Cooldown between uses */
    cooldownTurns: number;
    /** Minimum turn to start */
    minTurn: number;
    /** Minimum word count to consider */
    minWordCount: number;
}
export interface SelfCorrectionState {
    usageCount: number;
    lastUsageTurn: number;
}
export interface SelfCorrectionResult extends HumanizationInjection {
    type: 'self_correction';
    correctionType: SelfCorrectionType;
}
export declare class SelfCorrectionEngine {
    private state;
    private config;
    constructor(config?: Partial<SelfCorrectionConfig>);
    /**
     * Decide if self-correction should be applied
     */
    shouldApply(context: HumanizationContext): HumanizationDecision;
    /**
     * Generate self-correction injection
     */
    generate(context: HumanizationContext): SelfCorrectionResult | null;
    /**
     * Apply self-correction to response text
     */
    apply(response: string, correction: SelfCorrectionResult): {
        text: string;
        ssml: string;
    };
    /**
     * Reset state for new session
     */
    reset(): void;
    /**
     * Get current state
     */
    getState(): SelfCorrectionState;
    private chooseCorrectionType;
    private getPatternsForPersona;
    private determinePlacement;
    private generateSsml;
    private findMidSentencePoint;
    private findSentenceBoundary;
    private findKeyPointMarker;
}
export declare function getSelfCorrectionEngine(sessionId: string): SelfCorrectionEngine;
export declare function resetSelfCorrectionEngine(sessionId: string): void;
export declare function resetAllSelfCorrectionEngines(): void;
export default SelfCorrectionEngine;
//# sourceMappingURL=self-correction.d.ts.map