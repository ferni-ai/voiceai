/**
 * Voice Liveness Detection
 *
 * Detects if audio is from a live speaker vs recording playback.
 * Prevents replay attacks where an attacker plays back recorded audio.
 *
 * DETECTION METHODS:
 * 1. Challenge-Response: Ask user to say a random phrase
 * 2. Audio Artifacts: Check for recording compression artifacts
 * 3. Timing Analysis: Natural speech has variable timing
 * 4. Background Analysis: Real environments have ambient noise
 * 5. Breath Detection: Live speech contains breathing patterns
 *
 * @module VoiceLiveness
 */

import pino from 'pino';

const log = pino({ name: 'voice-liveness' });

// ============================================================================
// TYPES
// ============================================================================

export interface LivenessResult {
  isLive: boolean;
  confidence: number; // 0-1, higher = more confident it's live
  method: 'challenge' | 'audio_analysis' | 'combined';
  checks: {
    challengeResponse: LivenessCheck;
    audioArtifacts: LivenessCheck;
    timingAnalysis: LivenessCheck;
    backgroundNoise: LivenessCheck;
    breathDetection: LivenessCheck;
  };
  warnings: string[];
}

interface LivenessCheck {
  passed: boolean;
  confidence: number;
  details?: string;
}

export interface ChallengeResult {
  challengeId: string;
  phrase: string;
  expiresAt: Date;
}

export interface LivenessConfig {
  enableChallengeResponse: boolean;
  enableAudioAnalysis: boolean;
  minConfidence: number; // 0-1, default 0.7
  challengeExpiryMs: number; // default 30000 (30 seconds)
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: LivenessConfig = {
  enableChallengeResponse: true,
  enableAudioAnalysis: true,
  minConfidence: 0.7,
  challengeExpiryMs: 30000,
};

// Challenge phrases - random, unpredictable, hard to pre-record
const CHALLENGE_PHRASES = [
  "The weather is nice today",
  "I enjoy morning coffee",
  "Music makes me happy",
  "The sky is beautiful",
  "I love reading books",
  "Walking is good exercise",
  "Cooking is an art",
  "Friends are important",
  "Nature is peaceful",
  "Learning never stops",
];

// Audio characteristics of recorded vs live audio
const ANALYSIS_THRESHOLDS = {
  // Recorded audio often has clipped silence
  silenceRatioMax: 0.4,
  // Recorded audio has less dynamic range
  dynamicRangeMin: 20, // dB
  // Recorded audio often has compression artifacts
  spectralFlatnessMax: 0.8,
  // Live audio has more high-frequency content from breathing
  highFreqEnergyMin: 0.1,
  // Background noise is present in live recordings
  noiseFloorVarianceMin: 0.001,
};

// ============================================================================
// CHALLENGE MANAGEMENT
// ============================================================================

// In-memory challenge store (should be Redis/Firestore in production)
const activeChallenges = new Map<string, {
  phrase: string;
  expiresAt: Date;
  userId: string;
}>();

/**
 * Generate a challenge for the user to speak.
 * The challenge is a random phrase that the user must repeat.
 */
export function generateChallenge(userId: string, config = DEFAULT_CONFIG): ChallengeResult {
  // Generate unique challenge ID
  const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  // Select random phrase
  const phrase = CHALLENGE_PHRASES[Math.floor(Math.random() * CHALLENGE_PHRASES.length)];
  
  // Calculate expiry
  const expiresAt = new Date(Date.now() + config.challengeExpiryMs);
  
  // Store challenge
  activeChallenges.set(challengeId, {
    phrase,
    expiresAt,
    userId,
  });
  
  // Clean up expired challenges
  cleanupExpiredChallenges();
  
  log.info({ challengeId, userId }, 'Generated liveness challenge');
  
  return {
    challengeId,
    phrase,
    expiresAt,
  };
}

/**
 * Verify a challenge response.
 */
export function verifyChallenge(
  challengeId: string,
  spokenText: string,
  userId: string
): LivenessCheck {
  const challenge = activeChallenges.get(challengeId);
  
  if (!challenge) {
    return {
      passed: false,
      confidence: 0,
      details: 'Challenge not found or expired',
    };
  }
  
  if (challenge.userId !== userId) {
    return {
      passed: false,
      confidence: 0,
      details: 'Challenge user mismatch',
    };
  }
  
  if (new Date() > challenge.expiresAt) {
    activeChallenges.delete(challengeId);
    return {
      passed: false,
      confidence: 0,
      details: 'Challenge expired',
    };
  }
  
  // Compare spoken text to expected phrase (fuzzy matching)
  const similarity = computeTextSimilarity(
    spokenText.toLowerCase().trim(),
    challenge.phrase.toLowerCase().trim()
  );
  
  // Remove used challenge
  activeChallenges.delete(challengeId);
  
  const passed = similarity > 0.7;
  
  log.info({ challengeId, similarity, passed }, 'Challenge verification result');
  
  return {
    passed,
    confidence: similarity,
    details: passed ? 'Challenge matched' : 'Challenge phrase mismatch',
  };
}

/**
 * Clean up expired challenges.
 */
function cleanupExpiredChallenges(): void {
  const now = new Date();
  for (const [id, challenge] of activeChallenges) {
    if (now > challenge.expiresAt) {
      activeChallenges.delete(id);
    }
  }
}

// ============================================================================
// AUDIO ANALYSIS
// ============================================================================

/**
 * Analyze audio for liveness indicators.
 * Checks for signs of recorded/replayed audio vs live speech.
 */
export function analyzeAudioLiveness(
  samples: Float32Array,
  sampleRate: number
): Omit<LivenessResult['checks'], 'challengeResponse'> {
  // 1. Check for audio artifacts (compression, clipping)
  const audioArtifacts = checkAudioArtifacts(samples);
  
  // 2. Analyze timing patterns
  const timingAnalysis = analyzeTimingPatterns(samples, sampleRate);
  
  // 3. Check background noise characteristics
  const backgroundNoise = analyzeBackgroundNoise(samples);
  
  // 4. Detect breathing patterns
  const breathDetection = detectBreathingPatterns(samples, sampleRate);
  
  return {
    audioArtifacts,
    timingAnalysis,
    backgroundNoise,
    breathDetection,
  };
}

/**
 * Check for audio compression/recording artifacts.
 */
function checkAudioArtifacts(samples: Float32Array): LivenessCheck {
  // Calculate dynamic range
  let min = Infinity;
  let max = -Infinity;
  let silentSamples = 0;
  const silenceThreshold = 0.001;
  
  for (const sample of samples) {
    const abs = Math.abs(sample);
    if (abs < min) min = abs;
    if (abs > max) max = abs;
    if (abs < silenceThreshold) silentSamples++;
  }
  
  const dynamicRange = max > 0 ? 20 * Math.log10(max / (min + 0.0001)) : 0;
  const silenceRatio = silentSamples / samples.length;
  
  // Recorded audio often has clipped silence and reduced dynamic range
  const hasGoodDynamicRange = dynamicRange > ANALYSIS_THRESHOLDS.dynamicRangeMin;
  const hasNaturalSilence = silenceRatio < ANALYSIS_THRESHOLDS.silenceRatioMax;
  
  const passed = hasGoodDynamicRange && hasNaturalSilence;
  const confidence = (
    (hasGoodDynamicRange ? 0.5 : 0) +
    (hasNaturalSilence ? 0.5 : 0)
  );
  
  return {
    passed,
    confidence,
    details: `Dynamic range: ${dynamicRange.toFixed(1)}dB, Silence: ${(silenceRatio * 100).toFixed(1)}%`,
  };
}

/**
 * Analyze timing patterns in speech.
 * Live speech has natural timing variations.
 */
function analyzeTimingPatterns(samples: Float32Array, sampleRate: number): LivenessCheck {
  // Find speech segments (above threshold)
  const threshold = 0.01;
  const segmentLengths: number[] = [];
  const pauseLengths: number[] = [];
  
  let inSegment = false;
  let segmentStart = 0;
  let pauseStart = 0;
  
  for (let i = 0; i < samples.length; i++) {
    const isActive = Math.abs(samples[i]) > threshold;
    
    if (isActive && !inSegment) {
      // Start of speech segment
      inSegment = true;
      if (i > 0) {
        pauseLengths.push((i - pauseStart) / sampleRate);
      }
      segmentStart = i;
    } else if (!isActive && inSegment) {
      // End of speech segment
      inSegment = false;
      segmentLengths.push((i - segmentStart) / sampleRate);
      pauseStart = i;
    }
  }
  
  // Calculate variance in segment lengths
  const segmentVariance = calculateVariance(segmentLengths);
  const pauseVariance = calculateVariance(pauseLengths);
  
  // Live speech has natural timing variations
  const hasTimingVariation = segmentVariance > 0.01 || pauseVariance > 0.005;
  
  return {
    passed: hasTimingVariation,
    confidence: Math.min(1, (segmentVariance + pauseVariance) * 10),
    details: `Segment variance: ${segmentVariance.toFixed(4)}, Pause variance: ${pauseVariance.toFixed(4)}`,
  };
}

/**
 * Analyze background noise characteristics.
 * Live recordings have consistent ambient noise.
 */
function analyzeBackgroundNoise(samples: Float32Array): LivenessCheck {
  // Find the quietest parts of the audio (background noise)
  const windowSize = 1000;
  const windowEnergies: number[] = [];
  
  for (let i = 0; i < samples.length - windowSize; i += windowSize / 2) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += samples[i + j] * samples[i + j];
    }
    windowEnergies.push(energy / windowSize);
  }
  
  // Sort to find quietest windows (background noise level)
  windowEnergies.sort((a, b) => a - b);
  const noiseFloorSamples = windowEnergies.slice(0, Math.floor(windowEnergies.length * 0.2));
  
  // Calculate variance in noise floor
  const noiseVariance = calculateVariance(noiseFloorSamples);
  
  // Live recordings have consistent but slightly varying background noise
  const hasNaturalNoise = noiseVariance > ANALYSIS_THRESHOLDS.noiseFloorVarianceMin;
  
  return {
    passed: hasNaturalNoise,
    confidence: Math.min(1, noiseVariance * 100),
    details: `Noise floor variance: ${noiseVariance.toFixed(6)}`,
  };
}

/**
 * Detect breathing patterns in audio.
 * Live speech contains subtle breathing sounds.
 */
function detectBreathingPatterns(samples: Float32Array, sampleRate: number): LivenessCheck {
  // Breathing typically occurs in the 100-500 Hz range
  // and appears as subtle energy bursts between speech segments
  
  // Simple approach: look for low-energy segments with specific characteristics
  const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
  const breathCandidates: number[] = [];
  
  for (let i = 0; i < samples.length - windowSize; i += windowSize) {
    let energy = 0;
    let zeroCrossings = 0;
    
    for (let j = 0; j < windowSize; j++) {
      energy += samples[i + j] * samples[i + j];
      if (j > 0 && Math.sign(samples[i + j]) !== Math.sign(samples[i + j - 1])) {
        zeroCrossings++;
      }
    }
    
    energy /= windowSize;
    const zeroCrossingRate = zeroCrossings / windowSize * sampleRate;
    
    // Breathing has low energy and medium zero-crossing rate (100-500 Hz)
    if (energy > 0.0001 && energy < 0.01 && zeroCrossingRate > 100 && zeroCrossingRate < 500) {
      breathCandidates.push(i / sampleRate);
    }
  }
  
  // Expect at least 1 breath per 5 seconds of audio
  const audioDuration = samples.length / sampleRate;
  const expectedBreaths = audioDuration / 5;
  const hasBreathingPatterns = breathCandidates.length >= expectedBreaths * 0.5;
  
  return {
    passed: hasBreathingPatterns,
    confidence: Math.min(1, breathCandidates.length / (expectedBreaths * 2)),
    details: `Detected ${breathCandidates.length} potential breath segments`,
  };
}

// ============================================================================
// MAIN LIVENESS CHECK
// ============================================================================

/**
 * Perform comprehensive liveness check.
 */
export async function checkLiveness(
  audio: Float32Array,
  sampleRate: number,
  options: {
    challengeId?: string;
    spokenText?: string;
    userId?: string;
    config?: Partial<LivenessConfig>;
  } = {}
): Promise<LivenessResult> {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const warnings: string[] = [];
  
  // Initialize checks
  let challengeCheck: LivenessCheck = {
    passed: true,
    confidence: 1,
    details: 'Challenge not required',
  };
  
  // 1. Challenge-response check (if provided)
  if (config.enableChallengeResponse && options.challengeId && options.spokenText && options.userId) {
    challengeCheck = verifyChallenge(options.challengeId, options.spokenText, options.userId);
    if (!challengeCheck.passed) {
      warnings.push('Challenge response did not match');
    }
  } else if (config.enableChallengeResponse) {
    challengeCheck = {
      passed: false,
      confidence: 0,
      details: 'Challenge-response not provided',
    };
    warnings.push('Challenge-response not performed');
  }
  
  // 2. Audio analysis checks
  const audioChecks = analyzeAudioLiveness(audio, sampleRate);
  
  // Collect warnings from failed checks
  if (!audioChecks.audioArtifacts.passed) {
    warnings.push('Unusual audio characteristics detected');
  }
  if (!audioChecks.timingAnalysis.passed) {
    warnings.push('Unnatural timing patterns detected');
  }
  if (!audioChecks.backgroundNoise.passed) {
    warnings.push('Unusual background noise characteristics');
  }
  if (!audioChecks.breathDetection.passed) {
    warnings.push('No breathing patterns detected');
  }
  
  // Calculate overall confidence
  const checks = {
    challengeResponse: challengeCheck,
    ...audioChecks,
  };
  
  const checkResults = Object.values(checks);
  const passedChecks = checkResults.filter((c) => c.passed).length;
  const totalConfidence = checkResults.reduce((sum, c) => sum + c.confidence, 0) / checkResults.length;
  
  // Determine method used
  const method = config.enableChallengeResponse && options.challengeId
    ? 'combined'
    : config.enableAudioAnalysis
    ? 'audio_analysis'
    : 'challenge';
  
  // Final decision
  const isLive = totalConfidence >= config.minConfidence && passedChecks >= 3;
  
  log.info({
    isLive,
    confidence: totalConfidence,
    passedChecks,
    method,
    warningCount: warnings.length,
  }, 'Liveness check complete');
  
  return {
    isLive,
    confidence: totalConfidence,
    method,
    checks,
    warnings,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Compute text similarity using Levenshtein distance.
 */
function computeTextSimilarity(text1: string, text2: string): number {
  const len1 = text1.length;
  const len2 = text2.length;
  
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  // Create distance matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = text1[i - 1] === text2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  // Convert distance to similarity (0-1)
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Calculate variance of an array of numbers.
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) * (v - mean));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateChallenge,
  verifyChallenge,
  analyzeAudioLiveness,
  checkLiveness,
};

