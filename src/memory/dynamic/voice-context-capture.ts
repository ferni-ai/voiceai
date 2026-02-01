/**
 * Voice Context Capture
 *
 * Captures voice context (prosody, emotion) alongside memory capture
 * for "Better Than Human" emotionally-aware memories.
 *
 * Architecture:
 * ```
 * User Speech
 *      │
 *      ├─────────────────┬─────────────────┐
 *      │                 │                 │
 *      ▼                 ▼                 ▼
 * Transcript        Prosody          Voice Emotion
 *      │                 │                 │
 *      └────────┬────────┴─────────────────┘
 *               │
 *               ▼
 *    voiceCaptureEnhanced() → Firestore
 *               │
 *               ▼
 *    Memory with emotional weight
 * ```
 *
 * @module memory/dynamic/voice-context-capture
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'VoiceContextCapture' });

// ============================================================================
// LOCAL TYPE DEFINITIONS
// ============================================================================

/**
 * Prosodic features - local definition to avoid layer violation
 * (memory L30 cannot import from speech L70)
 *
 * This mirrors the relevant subset of src/speech/audio-prosody/types.ts
 */
interface ProsodyFeatures {
  // Pitch features
  pitchMean: number;
  pitchVariance: number;
  pitchRange: number;
  pitchContour: 'rising' | 'falling' | 'flat' | 'dynamic';

  // Energy/Volume features
  energyMean: number;
  energyVariance: number;
  energyPeaks: number;

  // Rhythm/Rate features
  speechRate: number;
  pauseDuration: number;
  pauseFrequency: number;

  // Voice quality
  jitter: number;
  shimmer: number;
  breathiness: number;
  voiceQuality?: 'clear' | 'breathy' | 'strained' | 'trembling';

  // Timing
  utteranceDuration: number;
  speakingRatio: number;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voice-enhanced capture input
 */
export interface VoiceCaptureInput {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Turn number */
  turnNumber: number;
  /** Transcript text */
  transcript: string;
  /** Prosody features from audio analysis */
  prosody?: ProsodyFeatures;
  /** Voice emotion detection result */
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };
  /** Text-based emotion analysis */
  textEmotion?: {
    primary: string;
    intensity: number;
  };
  /** Persona ID for attribution */
  personaId?: string;
}

/**
 * Voice context stored with memory
 */
export interface VoiceContextData {
  /** Primary emotion from voice */
  voiceEmotion?: string;
  /** Emotion confidence (0-1) */
  voiceConfidence?: number;
  /** Arousal level (0-1) */
  arousal?: number;
  /** Valence (-1 to 1) */
  valence?: number;
  /** Speech rate (words per minute) */
  speechRate?: number;
  /** Voice quality indicator */
  voiceQuality?: string;
  /** Whether voice strain was detected */
  voiceStrain?: boolean;
  /** Whether emotional peak was detected */
  emotionalPeak?: boolean;
  /** Text emotion (for comparison) */
  textEmotion?: string;
  /** Text emotion intensity */
  textIntensity?: number;
}

/**
 * Result from voice-enhanced capture
 */
export interface VoiceCaptureResult {
  /** Whether capture succeeded */
  success: boolean;
  /** Voice context that was captured */
  voiceContext: VoiceContextData;
  /** Emotional weight applied to memory */
  emotionalWeight: number;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Whether this was flagged as high-importance */
  isHighImportance: boolean;
  /** Factors that contributed to importance */
  importanceFactors: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface VoiceCaptureConfig {
  /** Enable voice context capture */
  enabled: boolean;
  /** Minimum voice confidence to capture */
  minVoiceConfidence: number;
  /** Arousal threshold for high importance */
  highArousalThreshold: number;
  /** Strain detection threshold */
  strainJitterThreshold: number;
  strainShimmerThreshold: number;
}

const DEFAULT_CONFIG: VoiceCaptureConfig = {
  enabled: true,
  minVoiceConfidence: 0.4,
  highArousalThreshold: 0.7,
  strainJitterThreshold: 0.02,
  strainShimmerThreshold: 0.15,
};

let config: VoiceCaptureConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setVoiceCaptureConfig(newConfig: Partial<VoiceCaptureConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getVoiceCaptureConfig(): VoiceCaptureConfig {
  return { ...config };
}

// ============================================================================
// VOICE CONTEXT EXTRACTION
// ============================================================================

/**
 * Extract voice context data from prosody and emotion signals
 */
export function extractVoiceContext(input: VoiceCaptureInput): VoiceContextData {
  const context: VoiceContextData = {};

  // Extract voice emotion data
  if (input.voiceEmotion && input.voiceEmotion.confidence >= config.minVoiceConfidence) {
    context.voiceEmotion = input.voiceEmotion.primary;
    context.voiceConfidence = input.voiceEmotion.confidence;
    context.arousal = input.voiceEmotion.arousal;
    context.valence = input.voiceEmotion.valence;
  }

  // Extract prosody features
  if (input.prosody) {
    context.speechRate = input.prosody.speechRate;
    context.voiceQuality = input.prosody.voiceQuality;

    // Detect voice strain
    const hasStrain = detectStrain(input.prosody);
    if (hasStrain) {
      context.voiceStrain = true;
    }
  }

  // Detect emotional peak
  if (input.voiceEmotion?.arousal && input.voiceEmotion.arousal > config.highArousalThreshold) {
    context.emotionalPeak = true;
  }

  // Include text emotion for comparison
  if (input.textEmotion) {
    context.textEmotion = input.textEmotion.primary;
    context.textIntensity = input.textEmotion.intensity;
  }

  return context;
}

/**
 * Detect voice strain from prosody
 */
function detectStrain(prosody: ProsodyFeatures): boolean {
  const jitterHigh = (prosody.jitter || 0) > config.strainJitterThreshold;
  const shimmerHigh = (prosody.shimmer || 0) > config.strainShimmerThreshold;
  const strainedQuality =
    prosody.voiceQuality === 'strained' || prosody.voiceQuality === 'trembling';

  return (jitterHigh && shimmerHigh) || strainedQuality;
}

// ============================================================================
// EMOTIONAL WEIGHT CALCULATION
// ============================================================================

/**
 * Calculate emotional weight for a memory based on voice context
 */
export function calculateVoiceWeight(context: VoiceContextData): {
  weight: number;
  factors: string[];
} {
  let weight = 0.5; // Base weight
  const factors: string[] = [];

  // Boost for emotional peak
  if (context.emotionalPeak) {
    weight += 0.2;
    factors.push('emotional_peak');
  }

  // Boost for voice strain (indicates stress/importance)
  if (context.voiceStrain) {
    weight += 0.15;
    factors.push('voice_strain');
  }

  // Boost for high arousal
  if (context.arousal && context.arousal > 0.7) {
    weight += 0.1;
    factors.push('high_arousal');
  }

  // Boost for voice-text alignment (authentic expression)
  if (context.voiceEmotion && context.textEmotion) {
    const aligned = areSameValence(context.voiceEmotion, context.textEmotion);
    if (aligned) {
      weight += 0.1;
      factors.push('voice_text_aligned');
    } else {
      // Misalignment can also be significant (masking emotions)
      weight += 0.05;
      factors.push('voice_text_mismatch');
    }
  }

  // Cap at 1.0
  weight = Math.min(1.0, weight);

  return { weight, factors };
}

/**
 * Check if two emotions have the same valence
 */
function areSameValence(emotion1: string, emotion2: string): boolean {
  const positivePatterns = ['happy', 'excited', 'joyful', 'grateful', 'hopeful', 'proud'];
  const negativePatterns = ['sad', 'angry', 'anxious', 'frustrated', 'worried', 'fearful'];

  const e1Lower = emotion1.toLowerCase();
  const e2Lower = emotion2.toLowerCase();

  const e1Positive = positivePatterns.some((p) => e1Lower.includes(p));
  const e2Positive = positivePatterns.some((p) => e2Lower.includes(p));
  const e1Negative = negativePatterns.some((p) => e1Lower.includes(p));
  const e2Negative = negativePatterns.some((p) => e2Lower.includes(p));

  return (e1Positive && e2Positive) || (e1Negative && e2Negative);
}

// ============================================================================
// MAIN CAPTURE FUNCTION
// ============================================================================

/**
 * Capture voice context with memory.
 *
 * This function enhances memory capture by adding voice-derived
 * emotional context and importance weighting.
 */
export async function voiceCaptureEnhanced(input: VoiceCaptureInput): Promise<VoiceCaptureResult> {
  const startTime = Date.now();

  if (!config.enabled) {
    return {
      success: false,
      voiceContext: {},
      emotionalWeight: 0.5,
      processingTimeMs: 0,
      isHighImportance: false,
      importanceFactors: ['disabled'],
    };
  }

  try {
    // 1. Extract voice context
    const voiceContext = extractVoiceContext(input);

    // 2. Calculate emotional weight
    const { weight, factors } = calculateVoiceWeight(voiceContext);

    // 3. Determine high importance
    const isHighImportance =
      weight > 0.7 || voiceContext.voiceStrain === true || voiceContext.emotionalPeak === true;

    // 4. Store voice context with memory (if high importance)
    if (isHighImportance) {
      await storeVoiceContext(input.userId, input.sessionId, input.turnNumber, voiceContext);
    }

    const processingTimeMs = Date.now() - startTime;

    log.debug(
      {
        userId: input.userId,
        turnNumber: input.turnNumber,
        voiceEmotion: voiceContext.voiceEmotion,
        emotionalWeight: weight,
        isHighImportance,
        factors,
        processingTimeMs,
      },
      '🎤 Voice context captured'
    );

    return {
      success: true,
      voiceContext,
      emotionalWeight: weight,
      processingTimeMs,
      isHighImportance,
      importanceFactors: factors,
    };
  } catch (error) {
    log.warn({ error: String(error), userId: input.userId }, 'Voice context capture failed');

    return {
      success: false,
      voiceContext: {},
      emotionalWeight: 0.5,
      processingTimeMs: Date.now() - startTime,
      isHighImportance: false,
      importanceFactors: ['error'],
    };
  }
}

/**
 * Store voice context in Firestore for retrieval
 */
async function storeVoiceContext(
  userId: string,
  sessionId: string,
  turnNumber: number,
  context: VoiceContextData
): Promise<void> {
  try {
    const { getFirestore } = await import('../firestore-factory.js');
    const db = getFirestore();

    if (!db) {
      log.debug('Firestore not available, skipping voice context storage');
      return;
    }

    const docRef = db
      .collection('users')
      .doc(userId)
      .collection('voice_contexts')
      .doc(`${sessionId}_${turnNumber}`);

    await docRef.set({
      ...context,
      sessionId,
      turnNumber,
      capturedAt: new Date(),
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to store voice context');
  }
}

// ============================================================================
// RETRIEVAL HELPERS
// ============================================================================

/**
 * Get voice context for a specific turn
 */
export async function getVoiceContextForTurn(
  userId: string,
  sessionId: string,
  turnNumber: number
): Promise<VoiceContextData | null> {
  try {
    const { getFirestore } = await import('../firestore-factory.js');
    const db = getFirestore();

    if (!db) return null;

    const doc = await db
      .collection('users')
      .doc(userId)
      .collection('voice_contexts')
      .doc(`${sessionId}_${turnNumber}`)
      .get();

    if (!doc.exists) return null;

    return doc.data() as VoiceContextData;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get voice context');
    return null;
  }
}

/**
 * Get recent voice contexts for a session
 */
export async function getRecentVoiceContexts(
  userId: string,
  sessionId: string,
  limit: number = 10
): Promise<VoiceContextData[]> {
  try {
    const { getFirestore } = await import('../firestore-factory.js');
    const db = getFirestore();

    if (!db) return [];

    const snapshot = await db
      .collection('users')
      .doc(userId)
      .collection('voice_contexts')
      .where('sessionId', '==', sessionId)
      .orderBy('turnNumber', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(
      (doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as VoiceContextData
    );
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get recent voice contexts');
    return [];
  }
}
