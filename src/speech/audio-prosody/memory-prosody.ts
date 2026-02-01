/**
 * Memory Prosody
 *
 * Extracts prosody features specifically for memory emotional weighting.
 * This module provides specialized prosody analysis optimized for
 * "Better Than Human" memory capture.
 *
 * Key Features:
 * - Emotional intensity detection for memory weighting
 * - Voice strain detection (stress signals)
 * - Authenticity scoring (voice-content alignment)
 * - SSML adaptation for memory recall delivery
 *
 * @module speech/audio-prosody/memory-prosody
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ProsodyFeatures } from './types.js';

const log = createLogger({ module: 'MemoryProsody' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Memory-specific prosody analysis result
 */
export interface MemoryProsodyResult {
  /** Emotional intensity (0-1, higher = more emotionally charged) */
  emotionalIntensity: number;
  /** Whether voice strain was detected */
  voiceStrain: boolean;
  /** Voice-content authenticity score (0-1, higher = more aligned) */
  authenticityScore: number;
  /** Detected emotional state */
  detectedEmotion?: string;
  /** Arousal level (0-1) */
  arousal: number;
  /** Valence (-1 to 1, negative to positive) */
  valence: number;
  /** Recommended memory weight multiplier (0.5-1.5) */
  memoryWeightMultiplier: number;
  /** Analysis confidence (0-1) */
  confidence: number;
  /** Factors contributing to analysis */
  factors: string[];
}

/**
 * Input for memory prosody analysis
 */
export interface MemoryProsodyInput {
  /** Prosody features from audio analysis */
  prosody?: ProsodyFeatures;
  /** Transcript text for content analysis */
  transcript?: string;
  /** External emotion detection result */
  detectedEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };
}

// ============================================================================
// EMOTION KEYWORD PATTERNS
// ============================================================================

const POSITIVE_KEYWORDS = [
  'happy',
  'excited',
  'grateful',
  'proud',
  'love',
  'wonderful',
  'amazing',
  'great',
  'fantastic',
  'beautiful',
  'blessed',
  'thankful',
];

const NEGATIVE_KEYWORDS = [
  'sad',
  'angry',
  'frustrated',
  'worried',
  'anxious',
  'scared',
  'hurt',
  'disappointed',
  'upset',
  'stressed',
  'overwhelmed',
  'afraid',
];

const HIGH_INTENSITY_KEYWORDS = [
  'really',
  'so',
  'very',
  'extremely',
  'incredibly',
  'absolutely',
  'completely',
  'totally',
  'deeply',
  'profoundly',
];

// ============================================================================
// PROSODY THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  /** Jitter threshold for voice strain */
  jitter: 0.02,
  /** Shimmer threshold for voice strain */
  shimmer: 0.15,
  /** High pitch variance indicating emotion */
  pitchVariance: 50,
  /** Low speech rate indicating deliberation */
  slowSpeechRate: 100,
  /** High speech rate indicating excitement */
  fastSpeechRate: 180,
  /** High energy threshold */
  highEnergy: 0.7,
  /** Low energy threshold */
  lowEnergy: 0.3,
};

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze prosody for memory weighting.
 *
 * This is the main function that produces a comprehensive prosody
 * analysis specifically optimized for memory emotional weighting.
 */
export function analyzeMemoryProsody(input: MemoryProsodyInput): MemoryProsodyResult {
  const factors: string[] = [];
  let confidence = 0.5;

  // Initialize with defaults
  let emotionalIntensity = 0.5;
  let voiceStrain = false;
  let authenticityScore = 0.5;
  let arousal = 0.5;
  let valence = 0;
  let detectedEmotion: string | undefined;

  // 1. Analyze prosody features if available
  if (input.prosody) {
    const prosodyResult = analyzeProsodyFeatures(input.prosody);
    emotionalIntensity = Math.max(emotionalIntensity, prosodyResult.intensity);
    voiceStrain = prosodyResult.strain;
    arousal = prosodyResult.arousal;

    factors.push(...prosodyResult.factors);
    confidence += 0.2;
  }

  // 2. Analyze transcript for emotional content
  if (input.transcript) {
    const textResult = analyzeTextEmotion(input.transcript);
    emotionalIntensity = Math.max(emotionalIntensity, textResult.intensity);
    valence = textResult.valence;
    factors.push(...textResult.factors);
    confidence += 0.1;
  }

  // 3. Use external emotion detection if available
  if (input.detectedEmotion) {
    detectedEmotion = input.detectedEmotion.primary;
    arousal = input.detectedEmotion.arousal ?? arousal;
    valence = input.detectedEmotion.valence ?? valence;
    confidence = Math.max(confidence, input.detectedEmotion.confidence);
    factors.push('external_emotion');
  }

  // 4. Calculate authenticity (voice-content alignment)
  if (input.prosody && input.transcript) {
    authenticityScore = calculateAuthenticity(input.prosody, input.transcript);
    if (authenticityScore > 0.7) {
      factors.push('high_authenticity');
    }
  }

  // 5. Calculate memory weight multiplier
  const memoryWeightMultiplier = calculateMemoryWeight(
    emotionalIntensity,
    voiceStrain,
    authenticityScore,
    arousal
  );

  // Cap confidence
  confidence = Math.min(1.0, confidence);

  log.debug(
    {
      emotionalIntensity,
      voiceStrain,
      authenticityScore,
      memoryWeightMultiplier,
      factors,
      confidence,
    },
    '🎵 Memory prosody analysis complete'
  );

  return {
    emotionalIntensity,
    voiceStrain,
    authenticityScore,
    detectedEmotion,
    arousal,
    valence,
    memoryWeightMultiplier,
    confidence,
    factors,
  };
}

// ============================================================================
// PROSODY FEATURE ANALYSIS
// ============================================================================

/**
 * Analyze raw prosody features
 */
function analyzeProsodyFeatures(prosody: ProsodyFeatures): {
  intensity: number;
  strain: boolean;
  arousal: number;
  factors: string[];
} {
  const factors: string[] = [];
  let intensity = 0.5;
  let arousal = 0.5;

  // Check for voice strain
  const jitterHigh = (prosody.jitter || 0) > THRESHOLDS.jitter;
  const shimmerHigh = (prosody.shimmer || 0) > THRESHOLDS.shimmer;
  const strainedQuality =
    prosody.voiceQuality === 'strained' || prosody.voiceQuality === 'trembling';
  const strain = (jitterHigh && shimmerHigh) || strainedQuality;

  if (strain) {
    intensity += 0.2;
    arousal += 0.2;
    factors.push('voice_strain');
  }

  // Check pitch variance (emotional expression)
  if (prosody.pitchVariance && prosody.pitchVariance > THRESHOLDS.pitchVariance) {
    intensity += 0.15;
    arousal += 0.1;
    factors.push('high_pitch_variance');
  }

  // Check speech rate
  if (prosody.speechRate) {
    if (prosody.speechRate < THRESHOLDS.slowSpeechRate) {
      // Slow, deliberate speech
      intensity += 0.1;
      factors.push('slow_deliberate');
    } else if (prosody.speechRate > THRESHOLDS.fastSpeechRate) {
      // Fast, excited speech
      intensity += 0.15;
      arousal += 0.2;
      factors.push('fast_excited');
    }
  }

  // Check energy levels (using energyMean)
  if (prosody.energyMean !== undefined) {
    // Normalize energy to 0-1 range (assuming dB scale -60 to 0)
    const normalizedEnergy = Math.min(1, Math.max(0, (prosody.energyMean + 60) / 60));
    if (normalizedEnergy > THRESHOLDS.highEnergy) {
      intensity += 0.1;
      arousal += 0.15;
      factors.push('high_energy');
    } else if (normalizedEnergy < THRESHOLDS.lowEnergy) {
      factors.push('low_energy');
    }
  }

  // Cap values
  intensity = Math.min(1.0, intensity);
  arousal = Math.min(1.0, arousal);

  return { intensity, strain, arousal, factors };
}

// ============================================================================
// TEXT EMOTION ANALYSIS
// ============================================================================

/**
 * Analyze text for emotional content
 */
function analyzeTextEmotion(transcript: string): {
  intensity: number;
  valence: number;
  factors: string[];
} {
  const factors: string[] = [];
  const lower = transcript.toLowerCase();
  let intensity = 0.5;
  let valence = 0;

  // Check for positive keywords
  const positiveCount = POSITIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (positiveCount > 0) {
    valence += 0.2 * Math.min(positiveCount, 3);
    intensity += 0.05 * positiveCount;
    factors.push('positive_language');
  }

  // Check for negative keywords
  const negativeCount = NEGATIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (negativeCount > 0) {
    valence -= 0.2 * Math.min(negativeCount, 3);
    intensity += 0.08 * negativeCount; // Negative emotions often more intense
    factors.push('negative_language');
  }

  // Check for intensity modifiers
  const intensifierCount = HIGH_INTENSITY_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (intensifierCount > 0) {
    intensity += 0.1 * Math.min(intensifierCount, 2);
    factors.push('intensity_modifiers');
  }

  // Check for exclamation marks
  const exclamations = (transcript.match(/!/g) || []).length;
  if (exclamations > 0) {
    intensity += 0.05 * Math.min(exclamations, 3);
    factors.push('exclamations');
  }

  // Cap values
  intensity = Math.min(1.0, intensity);
  valence = Math.max(-1.0, Math.min(1.0, valence));

  return { intensity, valence, factors };
}

// ============================================================================
// AUTHENTICITY CALCULATION
// ============================================================================

/**
 * Calculate voice-content authenticity score.
 *
 * High authenticity = voice prosody matches content emotion.
 * Low authenticity = voice doesn't match words (potential masking).
 */
function calculateAuthenticity(prosody: ProsodyFeatures, transcript: string): number {
  const textAnalysis = analyzeTextEmotion(transcript);

  // Normalize energy to 0-1 range (assuming dB scale -60 to 0)
  const normalizedEnergy = Math.min(1, Math.max(0, (prosody.energyMean + 60) / 60));

  // Voice indicators
  const voiceExcited =
    normalizedEnergy > 0.6 || (prosody.speechRate || 0) > 150 || (prosody.pitchVariance || 0) > 40;

  const voiceSubdued =
    normalizedEnergy < 0.4 || (prosody.speechRate || 0) < 120 || prosody.voiceQuality === 'breathy';

  // Text indicators
  const textPositive = textAnalysis.valence > 0.2;
  const textNegative = textAnalysis.valence < -0.2;
  const textNeutral = !textPositive && !textNegative;

  // Calculate alignment
  let authenticity = 0.5;

  if (voiceExcited && textPositive) {
    // Excited voice + positive words = authentic excitement
    authenticity = 0.9;
  } else if (voiceSubdued && textNegative) {
    // Subdued voice + negative words = authentic sadness
    authenticity = 0.85;
  } else if (voiceExcited && textNegative) {
    // Excited voice + negative words = possible anxiety or anger
    authenticity = 0.7;
  } else if (voiceSubdued && textPositive) {
    // Subdued voice + positive words = possible masking (still meaningful)
    authenticity = 0.6;
  } else if (textNeutral) {
    // Neutral text, authenticity depends on voice
    authenticity = 0.7;
  }

  return authenticity;
}

// ============================================================================
// MEMORY WEIGHT CALCULATION
// ============================================================================

/**
 * Calculate memory weight multiplier based on prosody analysis
 */
function calculateMemoryWeight(
  emotionalIntensity: number,
  voiceStrain: boolean,
  authenticityScore: number,
  arousal: number
): number {
  let multiplier = 1.0;

  // High emotional intensity = higher weight
  if (emotionalIntensity > 0.7) {
    multiplier += 0.2;
  } else if (emotionalIntensity > 0.5) {
    multiplier += 0.1;
  }

  // Voice strain indicates stress/importance
  if (voiceStrain) {
    multiplier += 0.15;
  }

  // High authenticity = more memorable
  if (authenticityScore > 0.8) {
    multiplier += 0.1;
  }

  // High arousal = more memorable
  if (arousal > 0.7) {
    multiplier += 0.1;
  }

  // Cap at reasonable bounds
  return Math.min(1.5, Math.max(0.5, multiplier));
}

// ============================================================================
// SSML ADAPTATION
// ============================================================================

/**
 * Adapt SSML for recalling memories based on emotional context.
 *
 * When surfacing memories, the delivery should match the emotional
 * weight and current conversation state.
 */
export function adaptSSMLForMemoryRecall(
  memoryText: string,
  currentProsody: MemoryProsodyResult,
  memoryProsody?: MemoryProsodyResult
): string {
  let adapted = memoryText;

  // Add thoughtful pause before memory recall
  adapted = `<break time="250ms"/>${adapted}`;

  // Adjust delivery based on current emotional state
  if (currentProsody.arousal > 0.7) {
    // User is highly aroused - match energy slightly
    adapted = `<prosody rate="medium" pitch="+2%">${adapted}</prosody>`;
  } else if (currentProsody.voiceStrain) {
    // User showing stress - calm, steady delivery
    adapted = `<prosody rate="slow" pitch="-3%">${adapted}</prosody>`;
  } else if (currentProsody.valence < -0.3) {
    // User expressing negative emotion - gentle delivery
    adapted = `<prosody rate="slow" volume="soft">${adapted}</prosody>`;
  } else if (currentProsody.valence > 0.3) {
    // User expressing positive emotion - warm delivery
    adapted = `<prosody rate="medium" pitch="+3%">${adapted}</prosody>`;
  }

  // If memory was emotionally intense, mark it subtly
  if (memoryProsody && memoryProsody.emotionalIntensity > 0.7) {
    // Add emphasis to key memory
    adapted = `<emphasis level="moderate">${adapted}</emphasis>`;
  }

  return adapted;
}

// ============================================================================
// BATCH ANALYSIS
// ============================================================================

/**
 * Analyze multiple turns for overall emotional trajectory
 */
export function analyzeEmotionalTrajectory(turns: MemoryProsodyInput[]): {
  overall: MemoryProsodyResult;
  trend: 'improving' | 'declining' | 'stable';
  peakTurn?: number;
} {
  if (turns.length === 0) {
    return {
      overall: {
        emotionalIntensity: 0.5,
        voiceStrain: false,
        authenticityScore: 0.5,
        arousal: 0.5,
        valence: 0,
        memoryWeightMultiplier: 1.0,
        confidence: 0,
        factors: [],
      },
      trend: 'stable',
    };
  }

  // Analyze each turn
  const analyses = turns.map((turn) => analyzeMemoryProsody(turn));

  // Find peak emotional turn
  let peakTurn = 0;
  let peakIntensity = 0;
  analyses.forEach((a, i) => {
    if (a.emotionalIntensity > peakIntensity) {
      peakIntensity = a.emotionalIntensity;
      peakTurn = i;
    }
  });

  // Calculate overall averages
  const avgIntensity = analyses.reduce((sum, a) => sum + a.emotionalIntensity, 0) / analyses.length;
  const avgArousal = analyses.reduce((sum, a) => sum + a.arousal, 0) / analyses.length;
  const avgValence = analyses.reduce((sum, a) => sum + a.valence, 0) / analyses.length;
  const hasStrain = analyses.some((a) => a.voiceStrain);

  // Determine trend (compare first half to second half)
  const midpoint = Math.floor(analyses.length / 2);
  const firstHalf = analyses.slice(0, midpoint);
  const secondHalf = analyses.slice(midpoint);

  const firstValence = firstHalf.reduce((sum, a) => sum + a.valence, 0) / firstHalf.length || 0;
  const secondValence = secondHalf.reduce((sum, a) => sum + a.valence, 0) / secondHalf.length || 0;

  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (secondValence - firstValence > 0.2) {
    trend = 'improving';
  } else if (firstValence - secondValence > 0.2) {
    trend = 'declining';
  }

  return {
    overall: {
      emotionalIntensity: avgIntensity,
      voiceStrain: hasStrain,
      authenticityScore: 0.7, // Average assumption
      arousal: avgArousal,
      valence: avgValence,
      memoryWeightMultiplier: avgIntensity > 0.6 ? 1.2 : 1.0,
      confidence: Math.min(0.9, 0.5 + analyses.length * 0.05),
      factors: ['trajectory_analysis'],
    },
    trend,
    peakTurn,
  };
}
