/**
 * Prosodic Mirroring
 *
 * Mirrors user's speaking pace to build rapport.
 * When user speaks fast, we speed up slightly. When slow, we slow down.
 * This builds subconscious rapport - "Better than human" because we do it perfectly.
 *
 * @module speech/adaptive-ssml/superhuman-voice/prosodic-mirroring
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Prosodic mirroring configuration.
 * Mirrors user's speaking pace to build rapport.
 */
export const PROSODIC_MIRRORING_CONFIG = {
  /** Target WPM for "normal" speaking */
  targetWPM: 150,

  /** Minimum speed multiplier */
  minSpeed: 0.8,

  /** Maximum speed multiplier */
  maxSpeed: 1.15,

  /** How strongly to mirror (0-1) */
  mirrorStrength: 0.35,

  /** WPM thresholds */
  thresholds: {
    verySlow: 100,
    slow: 120,
    normal: 150,
    fast: 180,
    veryFast: 200,
  },
} as const;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Calculate prosodic mirroring speed adjustment.
 * When user speaks fast, we speed up slightly. When slow, we slow down.
 * This builds subconscious rapport.
 */
export function calculateProsodicMirroring(userWPM: number | undefined): {
  speedMultiplier: number;
  reason: string;
} {
  if (!userWPM || userWPM <= 0) {
    return { speedMultiplier: 1.0, reason: 'no WPM data' };
  }

  const { targetWPM, minSpeed, maxSpeed, mirrorStrength, thresholds } = PROSODIC_MIRRORING_CONFIG;

  // Calculate raw mirroring ratio
  const rawRatio = userWPM / targetWPM;

  // Apply mirroring strength (don't fully match, just lean toward)
  const mirroredRatio = 1 + (rawRatio - 1) * mirrorStrength;

  // Clamp to safe range
  const speedMultiplier = Math.max(minSpeed, Math.min(maxSpeed, mirroredRatio));

  // Generate reason
  let reason: string;
  if (userWPM < thresholds.verySlow) {
    reason = 'mirroring very slow pace';
  } else if (userWPM < thresholds.slow) {
    reason = 'mirroring slow pace';
  } else if (userWPM > thresholds.veryFast) {
    reason = 'mirroring energetic pace';
  } else if (userWPM > thresholds.fast) {
    reason = 'mirroring quick pace';
  } else {
    reason = 'natural pace';
  }

  return { speedMultiplier, reason };
}
