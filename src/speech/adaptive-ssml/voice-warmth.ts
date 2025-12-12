/**
 * Voice Warmth Modulation
 *
 * Automatically adjusts voice warmth (speed, volume) based on user's emotional state.
 * Makes the AI feel more emotionally responsive and human.
 *
 * - Distressed user → slower, softer voice (comforting)
 * - Excited user → match their energy (celebrating with them)
 * - Sad user → more pauses, gentler tone (empathetic)
 * - Neutral → standard settings
 *
 * @module speech/adaptive-ssml/voice-warmth
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceWarmthContext {
  /** User's primary emotion (from voice analysis) */
  userEmotion?: string;
  /** Emotional intensity 0-1 */
  emotionIntensity?: number;
  /** User's arousal level (energy) */
  arousal?: number;
  /** User's valence (positive/negative) */
  valence?: number;
}

export interface VoiceWarmthOptions {
  /** Maximum speed adjustment (default 0.15 = ±15%) */
  maxSpeedAdjust?: number;
  /** Maximum volume adjustment (default 0.15 = ±15%) */
  maxVolumeAdjust?: number;
  /** Skip if text already has speed/volume tags */
  skipIfHasTags?: boolean;
}

export interface VoiceWarmthResult {
  text: string;
  adjustments: {
    speedRatio: number;
    volumeRatio: number;
    reason: string;
  };
}

// ============================================================================
// EMOTION PROFILES
// ============================================================================

interface EmotionProfile {
  speedAdjust: number; // -0.15 to +0.15
  volumeAdjust: number; // -0.15 to +0.15
  description: string;
}

const EMOTION_PROFILES: Record<string, EmotionProfile> = {
  // Distressed emotions → slower, softer (comfort)
  sad: { speedAdjust: -0.12, volumeAdjust: -0.1, description: 'gentle comfort' },
  grief: { speedAdjust: -0.15, volumeAdjust: -0.12, description: 'deep empathy' },
  anxious: { speedAdjust: -0.1, volumeAdjust: -0.08, description: 'calming presence' },
  fear: { speedAdjust: -0.12, volumeAdjust: -0.1, description: 'reassuring calm' },
  stressed: { speedAdjust: -0.08, volumeAdjust: -0.05, description: 'soothing' },
  overwhelmed: { speedAdjust: -0.12, volumeAdjust: -0.08, description: 'grounding' },
  frustrated: { speedAdjust: -0.05, volumeAdjust: 0, description: 'steady validation' },
  angry: { speedAdjust: -0.05, volumeAdjust: 0, description: 'calm acknowledgment' },

  // Positive emotions → match energy (celebrate with them)
  excited: { speedAdjust: 0.1, volumeAdjust: 0.05, description: 'matching excitement' },
  happy: { speedAdjust: 0.08, volumeAdjust: 0.03, description: 'sharing joy' },
  joyful: { speedAdjust: 0.1, volumeAdjust: 0.05, description: 'celebrating' },
  enthusiastic: { speedAdjust: 0.12, volumeAdjust: 0.05, description: 'energetic match' },
  proud: { speedAdjust: 0.05, volumeAdjust: 0.03, description: 'warm celebration' },

  // Thoughtful emotions → slightly slower (space for reflection)
  contemplative: { speedAdjust: -0.05, volumeAdjust: -0.03, description: 'reflective pace' },
  curious: { speedAdjust: 0, volumeAdjust: 0, description: 'engaged neutral' },
  confused: { speedAdjust: -0.05, volumeAdjust: 0, description: 'clear and patient' },

  // Neutral/unknown → no adjustment
  neutral: { speedAdjust: 0, volumeAdjust: 0, description: 'standard' },
};

// ============================================================================
// CORE FUNCTION
// ============================================================================

/**
 * Apply voice warmth modulation based on user's emotional state.
 *
 * @param text - The text to wrap with speed/volume adjustments
 * @param context - User's emotional context
 * @param options - Configuration options
 * @returns Text with SSML speed/volume tags and adjustment info
 */
export function applyVoiceWarmth(
  text: string,
  context: VoiceWarmthContext,
  options: VoiceWarmthOptions = {}
): VoiceWarmthResult {
  const { maxSpeedAdjust = 0.15, maxVolumeAdjust = 0.15, skipIfHasTags = true } = options;

  // Skip if already has speed/volume tags
  if (skipIfHasTags && (text.includes('<speed') || text.includes('<volume'))) {
    return {
      text,
      adjustments: { speedRatio: 1.0, volumeRatio: 1.0, reason: 'skipped - existing tags' },
    };
  }

  // Get emotion profile
  const emotion = context.userEmotion?.toLowerCase() || 'neutral';
  const profile = EMOTION_PROFILES[emotion] || EMOTION_PROFILES.neutral;

  // Scale by intensity (if provided)
  const intensity = context.emotionIntensity ?? 0.7; // Default to moderate intensity
  let speedAdjust = profile.speedAdjust * intensity;
  let volumeAdjust = profile.volumeAdjust * intensity;

  // Apply arousal/valence modifiers if available
  if (context.arousal !== undefined) {
    // High arousal (>0.6) → slight speed increase; low arousal (<0.4) → slight decrease
    const arousalModifier = (context.arousal - 0.5) * 0.1;
    speedAdjust += arousalModifier;
  }

  if (context.valence !== undefined) {
    // Very negative valence (<0.3) → softer voice
    if (context.valence < 0.3) {
      volumeAdjust -= 0.05;
    }
  }

  // Clamp to max adjustments
  speedAdjust = Math.max(-maxSpeedAdjust, Math.min(maxSpeedAdjust, speedAdjust));
  volumeAdjust = Math.max(-maxVolumeAdjust, Math.min(maxVolumeAdjust, volumeAdjust));

  // Convert to ratios (1.0 = no change)
  const speedRatio = 1.0 + speedAdjust;
  const volumeRatio = 1.0 + volumeAdjust;

  // Only apply if there's meaningful adjustment
  const hasSpeedChange = Math.abs(speedAdjust) >= 0.03;
  const hasVolumeChange = Math.abs(volumeAdjust) >= 0.03;

  if (!hasSpeedChange && !hasVolumeChange) {
    return {
      text,
      adjustments: {
        speedRatio: 1.0,
        volumeRatio: 1.0,
        reason: 'no significant adjustment needed',
      },
    };
  }

  // Build SSML prefix
  let prefix = '';
  if (hasSpeedChange) {
    prefix += `<speed ratio="${speedRatio.toFixed(2)}"/>`;
  }
  if (hasVolumeChange) {
    prefix += `<volume ratio="${volumeRatio.toFixed(2)}"/>`;
  }

  return {
    text: prefix + text,
    adjustments: {
      speedRatio,
      volumeRatio,
      reason: profile.description,
    },
  };
}

/**
 * Check if text already has voice warmth applied
 */
export function hasVoiceWarmth(text: string): boolean {
  // Check for speed or volume tags at the start
  return /^<(speed|volume)\s+ratio=/.test(text);
}
