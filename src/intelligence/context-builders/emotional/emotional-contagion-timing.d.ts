/**
 * Emotional Contagion Timing System
 *
 * Humans don't instantly mirror emotions - they "catch" the emotion,
 * process it, then reflect it back. This builder adds that human-like
 * timing to emotional responses.
 *
 * The Absorb → Process → Reflect pattern:
 * - ABSORB: Brief receiving phase (~200-500ms conceptually)
 * - PROCESS: Verbal indicator showing processing ("...yeah.")
 * - REFLECT: Mirror back at 70-90% intensity (never exact match)
 *
 * This makes emotional responses feel genuine rather than algorithmic.
 *
 * @module intelligence/context-builders/emotional/emotional-contagion-timing
 */
import { type ContextBuilder, type ContextBuilderInput } from '../index.js';
type EmotionIntensity = 'low' | 'moderate' | 'high' | 'intense';
interface EmotionalState {
    emotion: string;
    intensity: EmotionIntensity;
    isVulnerable: boolean;
    isCelebration: boolean;
    isDistress: boolean;
}
interface ContagionTiming {
    /** Verbal processing indicator to use */
    processingPhrase: string;
    /** How much to mirror (0.7 = 70% of their intensity) */
    mirrorIntensity: number;
    /** Should we hold space instead of matching? */
    holdSpace: boolean;
    /** Additional guidance */
    reflectionGuidance: string;
}
declare function detectEmotionState(input: ContextBuilderInput): EmotionalState | null;
declare function calculateContagionTiming(state: EmotionalState): ContagionTiming;
export declare function clearContagionSession(sessionId: string): void;
export declare const emotionalContagionTimingBuilder: ContextBuilder;
export { detectEmotionState, calculateContagionTiming, type EmotionalState, type ContagionTiming, };
//# sourceMappingURL=emotional-contagion-timing.d.ts.map