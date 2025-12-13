/**
 * Speech Rhythm Variation
 *
 * Prevents monotonous delivery by varying speed within a response.
 * Different content types benefit from different speeds for natural delivery.
 *
 * @module advanced-humanization/rhythm
 */

import type { RhythmVariation } from './types.js';

// ============================================================================
// RHYTHM ANALYSIS
// ============================================================================

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
export function analyzeRhythm(text: string): RhythmVariation[] {
  const segments: RhythmVariation[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    // Important/emphasis content → slower
    if (/\b(important|key|crucial|remember|note that)\b/i.test(sentence)) {
      segments.push({ speedRatio: 0.92, content: sentence });
      continue;
    }

    // Questions → slightly slower, thoughtful
    if (/\?$/.test(sentence)) {
      segments.push({ speedRatio: 0.95, content: sentence });
      continue;
    }

    // Emotional content → slower
    if (/\b(feel|feeling|emotion|heart|love|care|worry|concern)\b/i.test(sentence)) {
      segments.push({ speedRatio: 0.9, content: sentence });
      continue;
    }

    // Lists/examples → slightly faster
    if (/\b(for example|such as|like|first|second|third)\b/i.test(sentence)) {
      segments.push({ speedRatio: 1.05, content: sentence });
      continue;
    }

    // Conclusions → slower, more weight
    if (/\b(so|therefore|in conclusion|ultimately|the point is)\b/i.test(sentence)) {
      segments.push({ speedRatio: 0.93, content: sentence });
      continue;
    }

    // Default: normal speed
    segments.push({ speedRatio: 1.0, content: sentence });
  }

  return segments;
}

/**
 * Apply rhythm variations as SSML speed tags
 *
 * @param variations - Array of rhythm variations to apply
 * @returns SSML text with speed tags applied
 */
export function applyRhythmVariations(variations: RhythmVariation[]): string {
  return variations
    .map((v) => {
      if (v.speedRatio === 1.0) {
        return v.content;
      }
      return `<speed ratio="${v.speedRatio.toFixed(2)}"/>${v.content}`;
    })
    .join(' <break time="200ms"/> ');
}

/**
 * Check if variations have meaningful speed changes
 *
 * @param variations - Rhythm variations to check
 * @returns True if there are speed changes worth applying
 */
export function hasSignificantVariation(variations: RhythmVariation[]): boolean {
  return variations.some((v) => v.speedRatio !== 1.0);
}

