/**
 * Speed Variation Within Sentences
 *
 * Creates natural pacing like human speech:
 * - Slow down for emphasis
 * - Speed up for asides and parentheticals
 *
 * @module speech/adaptive-ssml/alive-voice/speed-variation
 */
import type { AliveVoiceContext, SpeedVariationPattern } from './types.js';
/**
 * Patterns for speed variation.
 * Slow down for emphasis, speed up for asides and parentheticals.
 */
export declare const SPEED_VARIATION_PATTERNS: SpeedVariationPattern[];
/**
 * Apply speed variations within sentences.
 * Creates natural pacing like human speech.
 */
export declare function applySpeedVariation(text: string, context: AliveVoiceContext): string;
//# sourceMappingURL=speed-variation.d.ts.map