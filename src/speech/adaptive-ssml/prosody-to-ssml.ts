/**
 * Prosody-to-SSML Mapper
 *
 * Maps user prosody features (pitch, speech rate, energy, voice quality)
 * into SSML adaptation parameters for Ferni's response. This creates
 * unconscious prosodic mirroring — matching the user's pace, energy,
 * and emotional tone without being obvious.
 *
 * @module speech/adaptive-ssml/prosody-to-ssml
 */

import type { ProsodyFeatures, VoiceEmotionResult } from '../audio-prosody/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ProsodySSMLAdaptation {
  /** Speed multiplier (0.8–1.2 range) */
  speedMultiplier: number;
  /** Volume multiplier (0.85–1.15 range) */
  volumeMultiplier: number;
  /** Cartesia emotion tag (if applicable) */
  emotion?: string;
  /** Emotion intensity (0–1) */
  emotionIntensity?: number;
  /** Reason string for logging/debugging */
  reason: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Mirroring bounds — keep subtle so it feels unconscious */
const SPEED_MIN = 0.85;
const SPEED_MAX = 1.15;
const VOLUME_MIN = 0.9;
const VOLUME_MAX = 1.1;

/** Speech rate thresholds (syllables/second) */
const SLOW_SPEECH_RATE = 3.0;
const FAST_SPEECH_RATE = 5.0;
const NEUTRAL_SPEECH_RATE = 4.0;

/** Energy thresholds (dB — typical conversational range) */
const LOW_ENERGY_DB = -35;
const HIGH_ENERGY_DB = -25;

// ============================================================================
// EMOTION MAPPING
// ============================================================================

/**
 * Map detected voice emotion to Cartesia emotion tag.
 * Counter-mirrors anger (respond with calm) but mirrors positive/negative.
 */
function mapEmotionToCartesia(
  primary: string
): { emotion: string; intensity: number } | undefined {
  switch (primary) {
    case 'sad':
    case 'sadness':
      return { emotion: 'sadness', intensity: 0.4 };
    case 'happy':
    case 'happiness':
    case 'excited':
      return { emotion: 'positivity', intensity: 0.5 };
    case 'angry':
    case 'anger':
      // Counter-mirror: respond with calm neutrality to de-escalate
      return { emotion: 'neutral', intensity: 0.3 };
    case 'fearful':
    case 'fear':
    case 'anxious':
      return { emotion: 'sadness', intensity: 0.35 };
    case 'surprised':
    case 'surprise':
      return { emotion: 'surprise', intensity: 0.45 };
    case 'curious':
    case 'curiosity':
      return { emotion: 'curiosity', intensity: 0.4 };
    default:
      return undefined;
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Adapt SSML parameters based on user prosody features.
 *
 * The adaptation is intentionally subtle — unconscious mirroring that builds
 * connection without being perceptible. Speed adjustments are ±10–15%,
 * volume ±10%.
 */
export function adaptSSMLFromProsody(
  prosody: ProsodyFeatures,
  emotion?: VoiceEmotionResult
): ProsodySSMLAdaptation {
  const reasons: string[] = [];
  let speedMultiplier = 1.0;
  let volumeMultiplier = 1.0;

  // --- Speed mirroring (from speech rate) ---
  if (prosody.speechRate > 0) {
    if (prosody.speechRate < SLOW_SPEECH_RATE) {
      // User is speaking slowly — slow down response
      const factor = Math.max(SPEED_MIN, 0.9 - (SLOW_SPEECH_RATE - prosody.speechRate) * 0.05);
      speedMultiplier = factor;
      reasons.push(`slow_user(${prosody.speechRate.toFixed(1)}syl/s)`);
    } else if (prosody.speechRate > FAST_SPEECH_RATE) {
      // User is speaking quickly — speed up slightly
      const factor = Math.min(SPEED_MAX, 1.1 + (prosody.speechRate - FAST_SPEECH_RATE) * 0.03);
      speedMultiplier = factor;
      reasons.push(`fast_user(${prosody.speechRate.toFixed(1)}syl/s)`);
    }
  }

  // --- Energy matching (from volume) ---
  if (prosody.energyMean !== 0) {
    if (prosody.energyMean < LOW_ENERGY_DB) {
      volumeMultiplier = Math.max(VOLUME_MIN, 0.92);
      reasons.push('low_energy');
    } else if (prosody.energyMean > HIGH_ENERGY_DB) {
      volumeMultiplier = Math.min(VOLUME_MAX, 1.08);
      reasons.push('high_energy');
    }
  }

  // --- Voice quality awareness ---
  if (prosody.voiceQuality === 'strained' || (emotion && emotion.stressLevel > 0.7)) {
    // User is stressed/strained — softer, calmer response
    speedMultiplier = Math.min(speedMultiplier, 0.95);
    volumeMultiplier = Math.min(volumeMultiplier, 0.95);
    reasons.push('stressed_user');
  }

  // --- Emotional tone mapping ---
  let emotionTag: string | undefined;
  let emotionIntensity: number | undefined;

  if (emotion?.primary) {
    const mapped = mapEmotionToCartesia(String(emotion.primary));
    if (mapped) {
      emotionTag = mapped.emotion;
      emotionIntensity = mapped.intensity;
      reasons.push(`emotion:${String(emotion.primary)}→${mapped.emotion}`);
    }
  }

  // Clamp values
  speedMultiplier = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speedMultiplier));
  volumeMultiplier = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, volumeMultiplier));

  return {
    speedMultiplier,
    volumeMultiplier,
    emotion: emotionTag,
    emotionIntensity,
    reason: reasons.length > 0 ? reasons.join(', ') : 'no_adaptation',
  };
}
