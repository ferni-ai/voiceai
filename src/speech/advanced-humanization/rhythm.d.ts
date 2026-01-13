/**
 * Speech Rhythm Variation
 *
 * Prevents monotonous delivery by varying speed within a response.
 * Different content types benefit from different speeds for natural delivery.
 *
 * @module advanced-humanization/rhythm
 */
import type { RhythmVariation } from './types.js';
/**
 * Analyze text and suggest speed variations for natural rhythm
 *
 * Different content types benefit from different speeds:
 * - Important points: slightly slower
 * - Examples/lists: slightly faster
 * - Emotional content: slower
 * - Conclusions: slower, more deliberate
 *
 * @param text - The text to analyze
 * @returns Array of text segments with speed ratios
 */
export declare function analyzeRhythm(text: string): RhythmVariation[];
/**
 * Apply rhythm variations as SSML speed tags
 *
 * @param variations - Array of rhythm variations to apply
 * @returns SSML text with speed tags applied
 */
export declare function applyRhythmVariations(variations: RhythmVariation[]): string;
/**
 * Check if variations have meaningful speed changes
 *
 * @param variations - Rhythm variations to check
 * @returns True if there are speed changes worth applying
 */
export declare function hasSignificantVariation(variations: RhythmVariation[]): boolean;
//# sourceMappingURL=rhythm.d.ts.map