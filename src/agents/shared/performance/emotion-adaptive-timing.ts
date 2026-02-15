/**
 * Emotion-Adaptive Timing
 *
 * Adjusts response timing and filler strategy based on detected voice emotion.
 * When a user is distressed, we respond faster with warmer fillers.
 * When they're contemplative, we slow down and respect the silence.
 *
 * Maps VoiceEmotionResult → TimingAdjustment so the adaptive-timing system
 * can modulate its latency targets per-emotion.
 *
 * @module agents/shared/performance/emotion-adaptive-timing
 */

import type { VoiceEmotionResult } from '../../../speech/audio-prosody.js';
import type { VoiceEmotion } from '../../../speech/audio-prosody/types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'EmotionAdaptiveTiming' });

// ============================================================================
// TYPES
// ============================================================================

export interface TimingAdjustment {
  /** Multiplier for response delay (< 1 = faster, > 1 = slower) */
  responseDelayMultiplier: number;

  /** Style of filler to use (warm, energetic, gentle, calm, none) */
  fillerStyle: 'warm' | 'energetic' | 'gentle' | 'calm' | 'none' | 'neutral';

  /** Urgency level for filler injection (higher = inject sooner) */
  fillerUrgency: 'high' | 'normal' | 'low';

  /** Maximum silence allowed before injecting a filler (ms) */
  maxSilenceMs: number;
}

// ============================================================================
// EMOTION → TIMING MAPPINGS
// ============================================================================

type EmotionCategory =
  | 'distressed'
  | 'happy'
  | 'sad'
  | 'contemplative'
  | 'angry'
  | 'neutral';

const EMOTION_TO_CATEGORY: Record<VoiceEmotion, EmotionCategory> = {
  anxious: 'distressed',
  fearful: 'distressed',
  happy: 'happy',
  excited: 'happy',
  surprised: 'happy',
  sad: 'sad',
  bored: 'contemplative',
  confused: 'contemplative',
  angry: 'angry',
  contempt: 'angry',
  disgusted: 'angry',
  neutral: 'neutral',
};

const CATEGORY_TIMING: Record<EmotionCategory, TimingAdjustment> = {
  distressed: {
    responseDelayMultiplier: 0.7,
    fillerStyle: 'warm',
    fillerUrgency: 'high',
    maxSilenceMs: 400,
  },
  happy: {
    responseDelayMultiplier: 0.85,
    fillerStyle: 'energetic',
    fillerUrgency: 'normal',
    maxSilenceMs: 600,
  },
  sad: {
    responseDelayMultiplier: 1.0,
    fillerStyle: 'gentle',
    fillerUrgency: 'low',
    maxSilenceMs: 900,
  },
  contemplative: {
    responseDelayMultiplier: 1.3,
    fillerStyle: 'none',
    fillerUrgency: 'low',
    maxSilenceMs: 1200,
  },
  angry: {
    responseDelayMultiplier: 0.75,
    fillerStyle: 'calm',
    fillerUrgency: 'high',
    maxSilenceMs: 350,
  },
  neutral: {
    responseDelayMultiplier: 1.0,
    fillerStyle: 'neutral',
    fillerUrgency: 'normal',
    maxSilenceMs: 600,
  },
};

// ============================================================================
// FILLER PHRASES
// ============================================================================

const FILLER_PHRASES: Record<EmotionCategory, string[]> = {
  distressed: ["I hear you", "I'm right here", "Take your time", "I'm listening"],
  happy: ["Yes!", "Love that", "That's great", "Amazing"],
  sad: ["Mm", "I understand", "I'm here", "Take your time"],
  contemplative: [], // Respect the silence
  angry: ["I understand", "Let me help", "I hear you", "Okay"],
  neutral: ["Mm-hmm", "Yeah", "Got it", "Sure"],
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get timing adjustment based on detected voice emotion.
 *
 * Uses the discrete emotion category to select base timing, then
 * fine-tunes with stress level for distressed states.
 */
export function getEmotionAdjustedTiming(
  emotion: VoiceEmotionResult | undefined
): TimingAdjustment {
  if (!emotion) {
    return CATEGORY_TIMING.neutral;
  }

  const category = EMOTION_TO_CATEGORY[emotion.primary] ?? 'neutral';
  const base = { ...CATEGORY_TIMING[category] };

  // Fine-tune: high stress makes response even faster
  if (emotion.stressLevel > 0.7 && base.responseDelayMultiplier >= 0.7) {
    base.responseDelayMultiplier = Math.max(0.5, base.responseDelayMultiplier - 0.15);
    base.fillerUrgency = 'high';
    base.maxSilenceMs = Math.min(base.maxSilenceMs, 350);
  }

  log.debug(
    {
      primary: emotion.primary,
      category,
      multiplier: base.responseDelayMultiplier,
      fillerStyle: base.fillerStyle,
    },
    'Emotion timing adjustment computed'
  );

  return base;
}

/**
 * Get persona-appropriate filler phrases for an emotion category.
 */
export function getEmotionFillerPhrases(emotionPrimary: string): string[] {
  const category = EMOTION_TO_CATEGORY[emotionPrimary as VoiceEmotion] ?? 'neutral';
  return FILLER_PHRASES[category];
}

/**
 * Apply emotion-based timing adjustment to a raw delay value.
 * Returns the adjusted delay in milliseconds.
 */
export function applyEmotionTiming(
  baseDelayMs: number,
  emotion: VoiceEmotionResult | undefined
): number {
  const adjustment = getEmotionAdjustedTiming(emotion);
  return Math.round(baseDelayMs * adjustment.responseDelayMultiplier);
}
