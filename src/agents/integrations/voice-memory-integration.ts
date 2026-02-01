/**
 * Voice-Memory Integration
 *
 * Bridges the voice pipeline with the memory system for "Better Than Human"
 * voice-aware memory capture and retrieval.
 *
 * Architecture:
 * ```
 * Audio Stream → Prosody Analysis → Voice Context
 *                                       │
 *                    ┌──────────────────┼──────────────────┐
 *                    │                  │                  │
 *                    ▼                  ▼                  ▼
 *              Memory Capture    Memory Retrieval    Memory Weighting
 *              (with emotion)    (emotion boost)    (prosody signals)
 * ```
 *
 * Key Features:
 * - Captures prosody signals with memories for emotional context
 * - Boosts memory retrieval for similar emotional states
 * - Enables SSML-aware natural delivery of recalled memories
 *
 * @module agents/integrations/voice-memory-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ProsodyFeatures } from '../../speech/audio-prosody/types.js';
import {
  voiceCaptureEnhanced,
  type VoiceCaptureInput,
} from '../../memory/dynamic/voice-context-capture.js';

const log = createLogger({ module: 'VoiceMemoryIntegration' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voice context captured during a turn
 */
export interface VoiceContext {
  /** Session ID for correlation */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Turn number */
  turnNumber: number;
  /** Prosody features from audio analysis */
  prosody?: ProsodyFeatures;
  /** Detected emotion from voice */
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };
  /** Text emotion (for comparison/fusion) */
  textEmotion?: {
    primary: string;
    intensity: number;
  };
  /** Timestamp */
  timestamp: Date;
}

/**
 * Emotional memory weight based on voice signals
 */
export interface EmotionalMemoryWeight {
  /** Base weight from content (0-1) */
  baseWeight: number;
  /** Voice-derived weight modifier (0.5-1.5) */
  voiceModifier: number;
  /** Combined final weight */
  finalWeight: number;
  /** Factors that contributed to weighting */
  factors: string[];
}

/**
 * Voice-aware memory retrieval boost
 */
export interface VoiceRetrievalBoost {
  /** Boost multiplier for memories with similar emotional context */
  emotionalSimilarityBoost: number;
  /** Boost for memories captured during high arousal */
  arousalBoost: number;
  /** Penalty for memories captured in opposite emotional state */
  oppositeEmotionPenalty: number;
  /** Whether to apply voice-aware boosting */
  enabled: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface VoiceMemoryConfig {
  /** Enable voice-aware memory capture */
  enableVoiceCapture: boolean;
  /** Enable voice-aware retrieval boosting */
  enableRetrievalBoosting: boolean;
  /** Minimum prosody confidence to use */
  minProsodyConfidence: number;
  /** Weight factor for emotional peaks */
  emotionalPeakWeight: number;
  /** Weight factor for voice strain detection */
  voiceStrainWeight: number;
}

const DEFAULT_CONFIG: VoiceMemoryConfig = {
  enableVoiceCapture: true,
  enableRetrievalBoosting: true,
  minProsodyConfidence: 0.5,
  emotionalPeakWeight: 1.3,
  voiceStrainWeight: 1.2,
};

let config: VoiceMemoryConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setVoiceMemoryConfig(newConfig: Partial<VoiceMemoryConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getVoiceMemoryConfig(): VoiceMemoryConfig {
  return { ...config };
}

// ============================================================================
// VOICE CONTEXT TRACKING
// ============================================================================

/** Active voice contexts by session */
const voiceContexts = new Map<string, VoiceContext>();

/**
 * Record voice context for a turn.
 *
 * In addition to storing in-memory, this now persists high-importance
 * voice contexts to Firestore for "Better Than Human" emotional memory.
 */
export function recordVoiceContext(context: VoiceContext): void {
  voiceContexts.set(context.sessionId, context);

  // Persist to Firestore for "Better Than Human" emotional memory
  // Only persist when we have meaningful voice data (emotion or prosody)
  if (context.voiceEmotion || context.prosody) {
    const captureInput: VoiceCaptureInput = {
      userId: context.userId,
      sessionId: context.sessionId,
      turnNumber: context.turnNumber,
      transcript: '', // Not available here, but prosody/emotion is the key data
      prosody: context.prosody,
      voiceEmotion: context.voiceEmotion,
      textEmotion: context.textEmotion,
    };

    // Fire and forget - don't block the turn
    void voiceCaptureEnhanced(captureInput).catch((err) => {
      log.debug({ error: String(err) }, 'Voice context persistence failed (non-critical)');
    });
  }

  log.debug(
    {
      sessionId: context.sessionId,
      turnNumber: context.turnNumber,
      hasProsody: !!context.prosody,
      voiceEmotion: context.voiceEmotion?.primary,
      textEmotion: context.textEmotion?.primary,
    },
    '🎤 Voice context recorded'
  );
}

/**
 * Get voice context for a session
 */
export function getVoiceContext(sessionId: string): VoiceContext | undefined {
  return voiceContexts.get(sessionId);
}

/**
 * Clear voice context for a session
 */
export function clearVoiceContext(sessionId: string): void {
  voiceContexts.delete(sessionId);
}

// ============================================================================
// EMOTIONAL MEMORY WEIGHTING
// ============================================================================

/**
 * Calculate emotional weight for memory capture based on voice signals.
 *
 * High-weight captures happen when:
 * - Voice shows emotional peaks (high intensity)
 * - Voice strain detected (stress signals)
 * - Voice-text emotion alignment (authentic expression)
 */
export function calculateEmotionalWeight(
  voiceContext: VoiceContext | undefined,
  baseWeight: number = 0.5
): EmotionalMemoryWeight {
  const factors: string[] = [];
  let voiceModifier = 1.0;

  if (!voiceContext || !config.enableVoiceCapture) {
    return {
      baseWeight,
      voiceModifier: 1.0,
      finalWeight: baseWeight,
      factors: ['no_voice_context'],
    };
  }

  const { prosody, voiceEmotion, textEmotion } = voiceContext;

  // 1. Check for emotional peaks
  if (voiceEmotion && voiceEmotion.confidence > config.minProsodyConfidence) {
    const arousal = voiceEmotion.arousal ?? 0.5;

    if (arousal > 0.7) {
      voiceModifier *= config.emotionalPeakWeight;
      factors.push('emotional_peak');
    }

    // Check voice-text alignment (authentic expression)
    if (textEmotion) {
      const aligned = isEmotionAligned(voiceEmotion.primary, textEmotion.primary);
      if (aligned) {
        voiceModifier *= 1.1;
        factors.push('voice_text_aligned');
      } else {
        // Misalignment might indicate masking (still important to capture)
        voiceModifier *= 1.05;
        factors.push('voice_text_mismatch');
      }
    }
  }

  // 2. Check for voice strain (stress signals)
  if (prosody) {
    const hasStrain = detectVoiceStrain(prosody);
    if (hasStrain) {
      voiceModifier *= config.voiceStrainWeight;
      factors.push('voice_strain');
    }

    // High pitch variance often indicates emotional content
    if (prosody.pitchVariance && prosody.pitchVariance > 50) {
      voiceModifier *= 1.1;
      factors.push('high_pitch_variance');
    }
  }

  // Cap modifier at reasonable bounds
  voiceModifier = Math.min(1.5, Math.max(0.7, voiceModifier));

  const finalWeight = Math.min(1.0, baseWeight * voiceModifier);

  return {
    baseWeight,
    voiceModifier,
    finalWeight,
    factors,
  };
}

/**
 * Detect voice strain from prosody features
 */
function detectVoiceStrain(prosody: ProsodyFeatures): boolean {
  // High jitter + shimmer indicates vocal strain
  const jitterHigh = (prosody.jitter || 0) > 0.02;
  const shimmerHigh = (prosody.shimmer || 0) > 0.15;

  // Strained voice quality
  const strainedQuality =
    prosody.voiceQuality === 'strained' || prosody.voiceQuality === 'trembling';

  return (jitterHigh && shimmerHigh) || strainedQuality;
}

/**
 * Check if two emotions are aligned (same valence)
 */
function isEmotionAligned(voiceEmotion: string, textEmotion: string): boolean {
  const positiveEmotions = ['happy', 'excited', 'joyful', 'grateful', 'hopeful', 'content'];
  const negativeEmotions = [
    'sad',
    'angry',
    'frustrated',
    'anxious',
    'worried',
    'fearful',
    'depressed',
  ];

  const voiceLower = voiceEmotion.toLowerCase();
  const textLower = textEmotion.toLowerCase();

  const voicePositive = positiveEmotions.some((e) => voiceLower.includes(e));
  const textPositive = positiveEmotions.some((e) => textLower.includes(e));
  const voiceNegative = negativeEmotions.some((e) => voiceLower.includes(e));
  const textNegative = negativeEmotions.some((e) => textLower.includes(e));

  // Same valence = aligned
  return (voicePositive && textPositive) || (voiceNegative && textNegative);
}

// ============================================================================
// VOICE-AWARE RETRIEVAL BOOSTING
// ============================================================================

/**
 * Calculate retrieval boost based on current voice context.
 *
 * Memories captured in similar emotional states get boosted.
 */
export function calculateRetrievalBoost(
  currentVoiceContext: VoiceContext | undefined,
  memoryEmotionalContext?: { emotion?: string; intensity?: number }
): VoiceRetrievalBoost {
  const result: VoiceRetrievalBoost = {
    emotionalSimilarityBoost: 1.0,
    arousalBoost: 1.0,
    oppositeEmotionPenalty: 1.0,
    enabled: config.enableRetrievalBoosting,
  };

  if (!currentVoiceContext || !config.enableRetrievalBoosting) {
    return result;
  }

  const currentEmotion =
    currentVoiceContext.voiceEmotion?.primary || currentVoiceContext.textEmotion?.primary;

  if (!currentEmotion || !memoryEmotionalContext?.emotion) {
    return result;
  }

  // Check emotional similarity
  if (isEmotionAligned(currentEmotion, memoryEmotionalContext.emotion)) {
    // Same valence - boost retrieval
    result.emotionalSimilarityBoost = 1.2;
  } else {
    // Opposite valence - slight penalty (unless joy amplification)
    // We want to surface positive memories when user is struggling
    const currentNegative = ['sad', 'anxious', 'stressed', 'overwhelmed'].some((e) =>
      currentEmotion.toLowerCase().includes(e)
    );
    const memoryPositive = ['happy', 'proud', 'excited', 'grateful'].some((e) =>
      (memoryEmotionalContext.emotion || '').toLowerCase().includes(e)
    );

    if (currentNegative && memoryPositive) {
      // Joy amplification: boost positive memories when struggling
      result.emotionalSimilarityBoost = 1.3;
    } else {
      result.oppositeEmotionPenalty = 0.9;
    }
  }

  // High arousal memories are more memorable
  if (currentVoiceContext.voiceEmotion?.arousal && currentVoiceContext.voiceEmotion.arousal > 0.7) {
    result.arousalBoost = 1.1;
  }

  return result;
}

/**
 * Apply retrieval boost to a memory score
 */
export function applyRetrievalBoost(baseScore: number, boost: VoiceRetrievalBoost): number {
  if (!boost.enabled) return baseScore;

  let score = baseScore;
  score *= boost.emotionalSimilarityBoost;
  score *= boost.arousalBoost;
  score *= boost.oppositeEmotionPenalty;

  return Math.min(1.0, score);
}

// ============================================================================
// SSML DELIVERY ADAPTATION
// ============================================================================

/**
 * Adapt SSML for memory delivery based on emotional context.
 *
 * When surfacing memories, we want the delivery to match the
 * emotional weight and current conversation state.
 */
export function adaptMemoryDelivery(
  memoryText: string,
  voiceContext: VoiceContext | undefined
): string {
  if (!voiceContext) return memoryText;

  let adapted = memoryText;
  const currentEmotion = voiceContext.voiceEmotion?.primary || voiceContext.textEmotion?.primary;

  // Add thoughtful pause before memory (reflecting)
  adapted = `<break time="300ms"/>${adapted}`;

  // Adjust delivery based on emotional context
  if (currentEmotion) {
    const emotionLower = currentEmotion.toLowerCase();

    if (['sad', 'grief', 'down'].some((e) => emotionLower.includes(e))) {
      // Gentle, slower delivery for sad moments
      adapted = `<prosody rate="slow">${adapted}</prosody>`;
    } else if (['anxious', 'worried', 'stressed'].some((e) => emotionLower.includes(e))) {
      // Calm, steady delivery for anxious moments
      adapted = `<prosody rate="medium" pitch="-5%">${adapted}</prosody>`;
    } else if (['happy', 'excited'].some((e) => emotionLower.includes(e))) {
      // Warm, upbeat delivery for positive moments
      adapted = `<prosody rate="medium" pitch="+3%">${adapted}</prosody>`;
    }
  }

  return adapted;
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Clean up voice memory integration for a session
 */
export function cleanupVoiceMemorySession(sessionId: string): void {
  clearVoiceContext(sessionId);
}

/**
 * Get integration stats for observability
 */
export function getVoiceMemoryStats(): {
  activeContexts: number;
  config: VoiceMemoryConfig;
} {
  return {
    activeContexts: voiceContexts.size,
    config: { ...config },
  };
}
