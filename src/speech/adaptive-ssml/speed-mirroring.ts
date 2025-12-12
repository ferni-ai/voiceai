/**
 * Speed Mirroring
 *
 * Subtly mirrors user's speaking pace to build unconscious rapport.
 * Studies show people naturally sync speech rates when building connection.
 *
 * - Fast speaker → slightly faster response (not too much, feels forced)
 * - Slow speaker → slightly slower response (creates comfort)
 * - Variable → match their current energy
 *
 * @module speech/adaptive-ssml/speed-mirroring
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SpeedMirrorContext {
  /** User's words per minute estimate */
  userWpm?: number;
  /** User's arousal/energy level (0-1) */
  userArousal?: number;
  /** Average user WPM across session */
  sessionAverageWpm?: number;
  /** Is user speaking quickly right now? */
  isRapidSpeech?: boolean;
  /** Is user speaking slowly right now? */
  isSlowSpeech?: boolean;
}

export interface SpeedMirrorOptions {
  /** Maximum speed adjustment (default 0.12 = ±12%) */
  maxAdjustment?: number;
  /** Minimum speed ratio (default 0.85) */
  minRatio?: number;
  /** Maximum speed ratio (default 1.15) */
  maxRatio?: number;
  /** Skip if already has speed tags */
  skipIfHasTags?: boolean;
}

export interface SpeedMirrorResult {
  text: string;
  speedRatio: number;
  reason: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Average speaking rates
const AVERAGE_WPM = 150;
const FAST_WPM_THRESHOLD = 175;
const SLOW_WPM_THRESHOLD = 120;

// ============================================================================
// CORE FUNCTION
// ============================================================================

/**
 * Apply speed mirroring based on user's speaking pace.
 *
 * @param text - The text to wrap with speed adjustment
 * @param context - User's speech characteristics
 * @param options - Configuration options
 * @returns Text with SSML speed tag and result info
 */
export function applySpeedMirroring(
  text: string,
  context: SpeedMirrorContext,
  options: SpeedMirrorOptions = {}
): SpeedMirrorResult {
  const { maxAdjustment = 0.12, minRatio = 0.85, maxRatio = 1.15, skipIfHasTags = true } = options;

  // Skip if already has speed tag
  if (skipIfHasTags && text.includes('<speed')) {
    return { text, speedRatio: 1.0, reason: 'skipped - existing speed tag' };
  }

  let speedRatio = 1.0;
  let reason = 'no adjustment';

  // Method 1: Use explicit fast/slow flags
  if (context.isRapidSpeech) {
    speedRatio = 1.0 + maxAdjustment * 0.7; // 70% of max toward faster
    reason = 'matching rapid speech';
  } else if (context.isSlowSpeech) {
    speedRatio = 1.0 - maxAdjustment * 0.7; // 70% of max toward slower
    reason = 'matching slow speech';
  }
  // Method 2: Use WPM if available
  else if (context.userWpm !== undefined) {
    const wpmDelta = context.userWpm - AVERAGE_WPM;
    // Scale: every 25 WPM difference = ~5% speed change
    const adjustment = (wpmDelta / 25) * 0.05;
    speedRatio = 1.0 + Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));
    reason = `mirroring ${context.userWpm} WPM`;
  }
  // Method 3: Use arousal as proxy for energy
  else if (context.userArousal !== undefined) {
    // Arousal 0.5 = neutral, >0.7 = energetic, <0.3 = low energy
    const arousalDelta = context.userArousal - 0.5;
    const adjustment = arousalDelta * maxAdjustment * 0.8;
    speedRatio = 1.0 + adjustment;
    reason = `mirroring arousal ${context.userArousal.toFixed(2)}`;
  }

  // Clamp to bounds
  speedRatio = Math.max(minRatio, Math.min(maxRatio, speedRatio));
  speedRatio = Math.round(speedRatio * 100) / 100;

  // Only apply if meaningful change
  if (Math.abs(speedRatio - 1.0) < 0.03) {
    return { text, speedRatio: 1.0, reason: 'minimal adjustment skipped' };
  }

  // Apply speed tag
  const prefix = `<speed ratio="${speedRatio.toFixed(2)}"/>`;
  return {
    text: prefix + text,
    speedRatio,
    reason,
  };
}

/**
 * Estimate if user is speaking fast based on available signals
 */
export function estimateUserSpeed(context: SpeedMirrorContext): 'fast' | 'slow' | 'normal' {
  if (context.isRapidSpeech) return 'fast';
  if (context.isSlowSpeech) return 'slow';

  if (context.userWpm !== undefined) {
    if (context.userWpm >= FAST_WPM_THRESHOLD) return 'fast';
    if (context.userWpm <= SLOW_WPM_THRESHOLD) return 'slow';
  }

  if (context.userArousal !== undefined) {
    if (context.userArousal >= 0.7) return 'fast';
    if (context.userArousal <= 0.3) return 'slow';
  }

  return 'normal';
}

/**
 * Check if text already has speed mirroring applied
 */
export function hasSpeedMirroring(text: string): boolean {
  return text.includes('<speed ratio=');
}
