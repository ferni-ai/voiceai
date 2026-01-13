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
export declare function applyAudioSmoothing(text: string, options?: AudioSmoothingOptions): string;
/**
 * Check if text already has audio smoothing applied
 */
export declare function hasAudioSmoothing(text: string): boolean;
/**
 * Remove any existing audio smoothing (for reprocessing)
 */
export declare function removeAudioSmoothing(text: string): string;
//# sourceMappingURL=audio-smoothing.d.ts.map