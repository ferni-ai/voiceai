/**
 * Memory-Informed Baseline Tonality
 *
 * Baseline adjustments based on what we know about the user.
 * If we know they're going through something, adjust from the start.
 *
 * @module speech/adaptive-ssml/superhuman-voice/memory-baseline
 */
import type { SuperhumanVoiceContext } from './types.js';
/**
 * Baseline adjustments based on what we know about the user.
 * If we know they're going through something, adjust from the start.
 */
export declare const MEMORY_INFORMED_ADJUSTMENTS: Record<NonNullable<SuperhumanVoiceContext['knownUserContext']>, {
    baseSpeedAdjust: number;
    baseVolumeAdjust: number;
    basePauseMultiplier: number;
    defaultEmotion: string;
    openingStyle: 'warm' | 'gentle' | 'energetic' | 'supportive';
}>;
/**
 * Get baseline adjustments from known user context.
 */
export declare function getMemoryInformedBaseline(knownContext: SuperhumanVoiceContext['knownUserContext']): (typeof MEMORY_INFORMED_ADJUSTMENTS)[NonNullable<SuperhumanVoiceContext['knownUserContext']>] | null;
//# sourceMappingURL=memory-baseline.d.ts.map