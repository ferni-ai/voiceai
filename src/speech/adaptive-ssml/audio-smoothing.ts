/**
 * Audio Smoothing Module
 *
 * Fixes common TTS audio quality issues:
 * - Rough/scratchy starts (soft onset)
 * - Abrupt endings (trailing padding)
 * - Click artifacts (micro-pauses)
 *
 * Uses Cartesia-compatible SSML tags to add:
 * - Leading micro-pause for soft attack
 * - Trailing micro-pause to prevent cutoff
 * - Volume smoothing at boundaries
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// AUDIO SMOOTHING CONFIGURATION
// ============================================================================

export interface AudioSmoothingOptions {
  /** Add soft onset at start (default: true) */
  softOnset?: boolean;
  /** Add trailing padding at end (default: true) */
  trailingPadding?: boolean;
  /** Leading pause duration in ms (default: 30) */
  leadingPauseMs?: number;
  /** Trailing pause duration in ms (default: 50) */
  trailingPauseMs?: number;
  /** Use volume ramp for soft attack (default: false - can cause artifacts) */
  volumeRamp?: boolean;
  /** Skip if response already has leading/trailing breaks */
  skipIfHasBreaks?: boolean;
}

const DEFAULT_OPTIONS: Required<AudioSmoothingOptions> = {
  softOnset: true,
  trailingPadding: true,
  leadingPauseMs: 30,
  trailingPauseMs: 50,
  volumeRamp: false, // Disabled by default - can cause its own artifacts
  skipIfHasBreaks: true,
};

// ============================================================================
// AUDIO SMOOTHING FUNCTIONS
// ============================================================================

/**
 * Apply audio smoothing to TTS text.
 *
 * Adds subtle SSML modifications to prevent:
 * - Rough/scratchy starts (adds tiny leading pause)
 * - Abrupt cutoffs (adds trailing silence)
 *
 * @param text - The SSML-tagged text to smooth
 * @param options - Smoothing configuration
 * @returns Text with audio smoothing applied
 */
export function applyAudioSmoothing(text: string, options: AudioSmoothingOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Don't process empty text
  if (!text || text.trim().length === 0) {
    return text;
  }

  let result = text;

  // Check if already has leading/trailing breaks
  const hasLeadingBreak = /^(\s*<[^>]+>\s*)*<break/i.test(result);
  const hasTrailingBreak = /<break[^>]*>\s*$/i.test(result);

  // 1. Soft onset - add tiny leading pause
  if (opts.softOnset && !hasLeadingBreak) {
    // Find the position after any opening tags (speed, volume, emotion)
    const openingTagsMatch = result.match(/^(<[^>]+\/>)*/);
    const insertPos = openingTagsMatch ? openingTagsMatch[0].length : 0;

    // Insert micro-pause for soft attack
    // Using a very small pause (30ms) that's imperceptible but smooths the onset
    const leadingPause = `<break time="${opts.leadingPauseMs}ms"/>`;
    result = result.slice(0, insertPos) + leadingPause + result.slice(insertPos);

    log.debug({ leadingPauseMs: opts.leadingPauseMs }, 'Added soft onset pause');
  }

  // 2. Trailing padding - add silence at end to prevent cutoff
  if (opts.trailingPadding && !hasTrailingBreak) {
    // Add micro-pause at the end
    // This prevents the waveform from being cut off abruptly
    const trailingPause = `<break time="${opts.trailingPauseMs}ms"/>`;
    result = result + trailingPause;

    log.debug({ trailingPauseMs: opts.trailingPauseMs }, 'Added trailing padding');
  }

  // 3. Optional volume ramp (disabled by default)
  // This can actually cause MORE artifacts in some TTS systems
  if (opts.volumeRamp && !hasLeadingBreak) {
    // Start at 95% volume, will naturally reach 100% as TTS stabilizes
    // Note: This is experimental and may not improve quality
    const volumeRamp = `<volume ratio="0.95"/>`;
    result = volumeRamp + result;
    // Reset volume after first word
    result = result.replace(/(<break[^>]*\/>)(\s*)(\S+)/i, '$1$2<volume ratio="1.0"/>$3');
  }

  return result;
}

/**
 * Check if text already has audio smoothing applied
 */
export function hasAudioSmoothing(text: string): boolean {
  // Check for our specific micro-pause patterns
  const hasLeadingMicroPause = /<break time="(2[0-9]|3[0-9]|4[0-9])ms"\/>/i.test(
    text.substring(0, 100)
  );
  const hasTrailingMicroPause = /<break time="(4[0-9]|5[0-9]|6[0-9])ms"\/>\s*$/i.test(text);

  return hasLeadingMicroPause || hasTrailingMicroPause;
}

/**
 * Remove any existing audio smoothing (for reprocessing)
 */
export function removeAudioSmoothing(text: string): string {
  // Remove leading micro-pauses (20-49ms)
  let result = text.replace(/^(<[^>]+\/>)*<break time="(2[0-9]|3[0-9]|4[0-9])ms"\/>/i, '$1');
  // Remove trailing micro-pauses (40-69ms)
  result = result.replace(/<break time="(4[0-9]|5[0-9]|6[0-9])ms"\/>\s*$/i, '');
  return result;
}
