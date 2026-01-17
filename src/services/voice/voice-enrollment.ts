/**
 * Voice Enrollment Service
 *
 * Handles speaker enrollment, verification, and identification
 * for real-time voice authentication.
 *
 * Features:
 * - Multi-sample enrollment for robust profiles
 * - Adaptive thresholds per user
 * - Continuous authentication during sessions
 * - Speaker change detection
 * - Cross-session voice memory
 *
 * @module VoiceEnrollment
 */

import { getLogger } from '../../utils/safe-logger.js';
import { extractSpeakerEmbedding } from '../voice-memory-enhanced.js';
// Centralized cosine similarity - SIMD-ready implementation
import { cosineSimilarity } from '../../memory/rust-accelerator.js';

const log = getLogger().child({ module: 'VoiceEnrollment' });

// ============================================================================
// Types
// ============================================================================

/**
 * Voice profile stored for each enrolled user.
 */
export interface VoiceProfile {
  /** User ID */
  userId: string;

  /** Display name for the profile */
  displayName?: string;

  /** Individual enrollment embeddings */
  embeddings: EnrollmentSample[];

  /** Centroid (average) embedding for fast comparison */
  centroid: number[];

  /** Per-user verification threshold (adaptive) */
  threshold: number;

  /** Quality score of the enrollment (0-1) */
  qualityScore: number;

  /** Number of successful verifications */
  verificationCount: number;

  /** Timestamps */
  enrolledAt: Date;
  updatedAt: Date;
  lastVerifiedAt?: Date;

  /** Metadata */
  metadata: {
    deviceTypes: string[];
    enrollmentDurationMs: number;
    sampleCount: number;
  };
}

/**
 * Individual enrollment sample.
 */
export interface EnrollmentSample {
  /** Embedding vector */
  embedding: number[];

  /** When this sample was collected */
  collectedAt: Date;

  /** Duration of audio in ms */
  durationMs: number;

  /** Quality indicators */
  quality: {
    snr?: number; // Signal-to-noise ratio
    clarity?: number; // Speech clarity score
    confidence: number; // Embedding confidence
  };

  /** Device/environment info */
  context?: {
    deviceType?: string;
    environment?: string;
  };
}

/**
 * Enrollment session for collecting samples.
 */
export interface EnrollmentSession {
  userId: string;
  samples: EnrollmentSample[];
  startedAt: Date;
  status: 'collecting' | 'processing' | 'complete' | 'failed';
  requiredSamples: number;
  currentQuality: number;
}

/**
 * Verification result.
 */
export interface VerificationResult {
  /** Whether the user is verified */
  verified: boolean;

  /** Confidence score (0-1) */
  confidence: number;

  /** User ID if verified */
  userId?: string;

  /** Reason for failure */
  reason?: string;

  /** Processing time in ms */
  processingTimeMs: number;

  /** Additional details */
  details?: {
    threshold: number;
    similarity: number;
    method: 'neural' | 'dsp';
  };
}

/**
 * Identification result (who is speaking).
 */
export interface IdentificationResult {
  /** Whether a match was found */
  identified: boolean;

  /** Matched user ID */
  userId?: string;

  /** Confidence score */
  confidence: number;

  /** All candidates above minimum threshold */
  candidates: Array<{
    userId: string;
    similarity: number;
  }>;

  /** Processing time */
  processingTimeMs: number;
}

/**
 * Continuous authentication status.
 */
export interface AuthStatus {
  status: 'verified' | 'suspicious' | 'speaker_changed' | 'unknown';
  confidence: number;
  currentUserId?: string;
  anomalyCount: number;
  message?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum samples required for enrollment */
const MIN_ENROLLMENT_SAMPLES = 3;

/** Recommended samples for good enrollment */
const RECOMMENDED_ENROLLMENT_SAMPLES = 5;

/** Maximum samples to store per user */
const MAX_ENROLLMENT_SAMPLES = 10;

/** Default verification threshold */
const DEFAULT_THRESHOLD = 0.7;

/** Minimum threshold (very permissive) */
const MIN_THRESHOLD = 0.5;

/** Maximum threshold (very strict) */
const MAX_THRESHOLD = 0.9;

/** Minimum audio duration for enrollment (ms) */
const MIN_AUDIO_DURATION_MS = 1000;

/** Anomaly count before triggering speaker change */
const SPEAKER_CHANGE_THRESHOLD = 3;

// ============================================================================
// Enrollment Functions
// ============================================================================

/**
 * Start a new enrollment session.
 */
export function startEnrollmentSession(
  userId: string,
  options?: { requiredSamples?: number }
): EnrollmentSession {
  log.info({ userId }, 'Starting enrollment session');

  return {
    userId,
    samples: [],
    startedAt: new Date(),
    status: 'collecting',
    requiredSamples: options?.requiredSamples ?? RECOMMENDED_ENROLLMENT_SAMPLES,
    currentQuality: 0,
  };
}

/**
 * Add an audio sample to the enrollment session.
 */
export async function addEnrollmentSample(
  session: EnrollmentSession,
  audio: Float32Array,
  context?: { deviceType?: string; environment?: string }
): Promise<{
  success: boolean;
  session: EnrollmentSession;
  feedback?: string;
}> {
  if (session.status !== 'collecting') {
    return {
      success: false,
      session,
      feedback: 'Enrollment session is not in collecting state',
    };
  }

  // Check audio duration
  const durationMs = (audio.length / 16000) * 1000;
  if (durationMs < MIN_AUDIO_DURATION_MS) {
    return {
      success: false,
      session,
      feedback: `Audio too short. Need at least ${MIN_AUDIO_DURATION_MS}ms, got ${durationMs.toFixed(0)}ms`,
    };
  }

  try {
    // Extract embedding
    const embedding = await extractSpeakerEmbedding(audio);
    if (!embedding) {
      return {
        success: false,
        session,
        feedback: 'Failed to extract voice embedding. Please try again.',
      };
    }

    // Create sample
    const sample: EnrollmentSample = {
      embedding: Array.from(embedding.vector),
      collectedAt: new Date(),
      durationMs,
      quality: {
        confidence: embedding.confidence,
      },
      context,
    };

    // Check consistency with existing samples
    if (session.samples.length > 0) {
      const consistency = await checkSampleConsistency(session.samples, sample);
      if (consistency < 0.6) {
        return {
          success: false,
          session,
          feedback: 'Voice sample seems inconsistent. Please speak naturally as before.',
        };
      }
    }

    // Add sample
    session.samples.push(sample);

    // Update quality score
    session.currentQuality = calculateEnrollmentQuality(session.samples);

    // Check if we have enough samples
    if (session.samples.length >= session.requiredSamples) {
      session.status = 'processing';
    }

    log.info(
      {
        userId: session.userId,
        sampleCount: session.samples.length,
        quality: session.currentQuality,
      },
      'Added enrollment sample'
    );

    return {
      success: true,
      session,
      feedback:
        session.samples.length >= session.requiredSamples
          ? 'Enrollment complete! Processing...'
          : `Sample ${session.samples.length}/${session.requiredSamples} collected. ${getQualityFeedback(session.currentQuality)}`,
    };
  } catch (error) {
    log.error({ error, userId: session.userId }, 'Failed to add enrollment sample');
    return {
      success: false,
      session,
      feedback: 'Error processing audio. Please try again.',
    };
  }
}

/**
 * Complete enrollment and create voice profile.
 */
export async function completeEnrollment(session: EnrollmentSession): Promise<{
  success: boolean;
  profile?: VoiceProfile;
  error?: string;
}> {
  if (session.samples.length < MIN_ENROLLMENT_SAMPLES) {
    return {
      success: false,
      error: `Not enough samples. Need at least ${MIN_ENROLLMENT_SAMPLES}, have ${session.samples.length}`,
    };
  }

  try {
    session.status = 'processing';

    // Compute centroid
    const centroid = computeCentroid(session.samples.map((s) => s.embedding));

    // Compute adaptive threshold
    const threshold = computeAdaptiveThreshold(
      session.samples.map((s) => s.embedding),
      centroid
    );

    // Calculate quality score
    const qualityScore = calculateEnrollmentQuality(session.samples);

    // Collect device types
    const deviceTypes = Array.from(
      new Set(session.samples.map((s) => s.context?.deviceType).filter(Boolean) as string[])
    );

    const profile: VoiceProfile = {
      userId: session.userId,
      embeddings: session.samples,
      centroid,
      threshold,
      qualityScore,
      verificationCount: 0,
      enrolledAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        deviceTypes,
        enrollmentDurationMs: Date.now() - session.startedAt.getTime(),
        sampleCount: session.samples.length,
      },
    };

    session.status = 'complete';

    log.info(
      {
        userId: session.userId,
        threshold,
        qualityScore,
        sampleCount: session.samples.length,
      },
      'Enrollment completed'
    );

    return { success: true, profile };
  } catch (error) {
    session.status = 'failed';
    log.error({ error, userId: session.userId }, 'Enrollment failed');
    return {
      success: false,
      error: 'Failed to process enrollment',
    };
  }
}

// ============================================================================
// Verification Functions
// ============================================================================

/**
 * Verify a speaker against their enrolled profile.
 */
export async function verifyUser(
  audio: Float32Array,
  profile: VoiceProfile
): Promise<VerificationResult> {
  const startTime = Date.now();

  try {
    // Extract embedding
    const embedding = await extractSpeakerEmbedding(audio);
    if (!embedding) {
      return {
        verified: false,
        confidence: 0,
        reason: 'Failed to extract voice embedding',
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Compare to centroid - use centralized SIMD-ready similarity
    const similarity = cosineSimilarity(Array.from(embedding.vector), profile.centroid);

    const verified = similarity >= profile.threshold;

    return {
      verified,
      confidence: similarity,
      userId: verified ? profile.userId : undefined,
      reason: verified ? undefined : 'Voice does not match enrolled profile',
      processingTimeMs: Date.now() - startTime,
      details: {
        threshold: profile.threshold,
        similarity,
        method: embedding.method,
      },
    };
  } catch (error) {
    log.error({ error, userId: profile.userId }, 'Verification failed');
    return {
      verified: false,
      confidence: 0,
      reason: 'Verification error',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Identify a speaker from a list of enrolled profiles.
 */
export async function identifySpeaker(
  audio: Float32Array,
  profiles: VoiceProfile[],
  options?: { minThreshold?: number }
): Promise<IdentificationResult> {
  const startTime = Date.now();
  const minThreshold = options?.minThreshold ?? MIN_THRESHOLD;

  try {
    // Extract embedding
    const embedding = await extractSpeakerEmbedding(audio);
    if (!embedding) {
      return {
        identified: false,
        confidence: 0,
        candidates: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Compare to all profiles
    const candidates: Array<{ userId: string; similarity: number }> = [];

    for (const profile of profiles) {
      const similarity = cosineSimilarity(Array.from(embedding.vector), profile.centroid);

      if (similarity >= minThreshold) {
        candidates.push({
          userId: profile.userId,
          similarity,
        });
      }
    }

    // Sort by similarity
    candidates.sort((a, b) => b.similarity - a.similarity);

    // Check if top candidate exceeds their threshold
    let identified = false;
    let bestMatch: (typeof candidates)[0] | undefined;

    if (candidates.length > 0) {
      bestMatch = candidates[0];
      const matchedProfile = profiles.find((p) => p.userId === bestMatch!.userId);
      if (matchedProfile && bestMatch.similarity >= matchedProfile.threshold) {
        identified = true;
      }
    }

    return {
      identified,
      userId: identified ? bestMatch?.userId : undefined,
      confidence: bestMatch?.similarity ?? 0,
      candidates,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    log.error({ error }, 'Identification failed');
    return {
      identified: false,
      confidence: 0,
      candidates: [],
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Continuous Authentication
// ============================================================================

/**
 * Continuous authenticator for ongoing verification during a session.
 */
export class ContinuousAuthenticator {
  private profile: VoiceProfile;
  private recentEmbeddings: Float32Array[] = [];
  private anomalyCount = 0;
  private lastStatus: AuthStatus;

  constructor(profile: VoiceProfile) {
    this.profile = profile;
    this.lastStatus = {
      status: 'unknown',
      confidence: 0,
      currentUserId: profile.userId,
      anomalyCount: 0,
    };
  }

  /**
   * Process an audio chunk and update authentication status.
   */
  async processAudioChunk(audio: Float32Array): Promise<AuthStatus> {
    try {
      const embedding = await extractSpeakerEmbedding(audio);
      if (!embedding) {
        return this.lastStatus;
      }

      // Compare to enrolled profile - use centralized similarity
      const similarity = cosineSimilarity(Array.from(embedding.vector), this.profile.centroid);

      // Track recent embeddings for consistency
      this.recentEmbeddings.push(embedding.vector);
      if (this.recentEmbeddings.length > 10) {
        this.recentEmbeddings.shift();
      }

      // Detect anomalies
      if (similarity < this.profile.threshold * 0.9) {
        this.anomalyCount++;

        if (this.anomalyCount >= SPEAKER_CHANGE_THRESHOLD) {
          this.lastStatus = {
            status: 'speaker_changed',
            confidence: similarity,
            currentUserId: this.profile.userId,
            anomalyCount: this.anomalyCount,
            message: 'Different speaker detected',
          };
        } else {
          this.lastStatus = {
            status: 'suspicious',
            confidence: similarity,
            currentUserId: this.profile.userId,
            anomalyCount: this.anomalyCount,
            message: 'Voice inconsistency detected',
          };
        }
      } else {
        // Reset anomaly count on good match
        this.anomalyCount = Math.max(0, this.anomalyCount - 1);

        this.lastStatus = {
          status: 'verified',
          confidence: similarity,
          currentUserId: this.profile.userId,
          anomalyCount: this.anomalyCount,
        };
      }

      return this.lastStatus;
    } catch (error) {
      log.error({ error }, 'Continuous auth processing failed');
      return this.lastStatus;
    }
  }

  /**
   * Get current authentication status.
   */
  getStatus(): AuthStatus {
    return this.lastStatus;
  }

  /**
   * Reset the authenticator state.
   */
  reset(): void {
    this.recentEmbeddings = [];
    this.anomalyCount = 0;
    this.lastStatus = {
      status: 'unknown',
      confidence: 0,
      currentUserId: this.profile.userId,
      anomalyCount: 0,
    };
  }
}

// ============================================================================
// Profile Management
// ============================================================================

/**
 * Update a voice profile with new samples.
 */
export async function updateProfile(
  profile: VoiceProfile,
  newSamples: EnrollmentSample[]
): Promise<VoiceProfile> {
  // Add new samples
  const allSamples = [...profile.embeddings, ...newSamples];

  // Keep most recent samples up to max
  const keptSamples = allSamples.slice(-MAX_ENROLLMENT_SAMPLES);

  // Recompute centroid
  const centroid = computeCentroid(keptSamples.map((s) => s.embedding));

  // Recompute threshold
  const threshold = computeAdaptiveThreshold(
    keptSamples.map((s) => s.embedding),
    centroid
  );

  // Update quality
  const qualityScore = calculateEnrollmentQuality(keptSamples);

  return {
    ...profile,
    embeddings: keptSamples,
    centroid,
    threshold,
    qualityScore,
    updatedAt: new Date(),
    metadata: {
      ...profile.metadata,
      sampleCount: keptSamples.length,
    },
  };
}

/**
 * Check if a profile needs re-enrollment.
 */
export function needsReEnrollment(profile: VoiceProfile): {
  needed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check quality score
  if (profile.qualityScore < 0.6) {
    reasons.push('Low quality enrollment');
  }

  // Check sample count
  if (profile.embeddings.length < MIN_ENROLLMENT_SAMPLES) {
    reasons.push('Insufficient samples');
  }

  // Check age (older than 6 months might drift)
  const ageMs = Date.now() - profile.enrolledAt.getTime();
  const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
  if (ageMs > sixMonthsMs && profile.verificationCount < 10) {
    reasons.push('Profile may be stale');
  }

  return {
    needed: reasons.length > 0,
    reasons,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute centroid (average) of embeddings.
 */
function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return [];
  }

  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i];
    }
  }

  // Average
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += centroid[i] * centroid[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      centroid[i] /= norm;
    }
  }

  return centroid;
}

/**
 * Compute adaptive threshold based on embedding variance.
 */
function computeAdaptiveThreshold(embeddings: number[][], centroid: number[]): number {
  if (embeddings.length < 2) {
    return DEFAULT_THRESHOLD;
  }

  // Calculate similarities to centroid - no Float32Array wrappers needed
  const similarities: number[] = [];
  for (const emb of embeddings) {
    const sim = cosineSimilarity(emb, centroid);
    similarities.push(sim);
  }

  // Calculate mean and std
  const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const variance = similarities.reduce((sum, s) => sum + (s - mean) ** 2, 0) / similarities.length;
  const std = Math.sqrt(variance);

  // Threshold = mean - 2*std (covers ~95% of legitimate samples)
  // But clamp to reasonable range
  const threshold = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, mean - 2 * std));

  return threshold;
}

/**
 * Check consistency of a new sample with existing samples.
 */
async function checkSampleConsistency(
  existingSamples: EnrollmentSample[],
  newSample: EnrollmentSample
): Promise<number> {
  if (existingSamples.length === 0) {
    return 1.0;
  }

  // Compare to centroid of existing samples - no wrappers needed
  const centroid = computeCentroid(existingSamples.map((s) => s.embedding));
  return cosineSimilarity(newSample.embedding, centroid);
}

/**
 * Calculate enrollment quality score.
 */
function calculateEnrollmentQuality(samples: EnrollmentSample[]): number {
  if (samples.length === 0) {
    return 0;
  }

  // Factors:
  // 1. Sample count (more is better)
  const countScore = Math.min(1, samples.length / RECOMMENDED_ENROLLMENT_SAMPLES);

  // 2. Consistency (embeddings should be similar to each other)
  const centroid = computeCentroid(samples.map((s) => s.embedding));
  const similarities = samples.map((s) => cosineSimilarity(s.embedding, centroid));
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const consistencyScore = avgSimilarity;

  // 3. Average confidence
  const avgConfidence = samples.reduce((sum, s) => sum + s.quality.confidence, 0) / samples.length;

  // Weighted combination
  return countScore * 0.3 + consistencyScore * 0.5 + avgConfidence * 0.2;
}

/**
 * Get feedback message based on quality score.
 */
function getQualityFeedback(quality: number): string {
  if (quality >= 0.9) {
    return 'Excellent voice quality!';
  } else if (quality >= 0.7) {
    return 'Good voice quality.';
  } else if (quality >= 0.5) {
    return 'Acceptable quality. Try speaking more clearly.';
  } else {
    return 'Please try again in a quieter environment.';
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  DEFAULT_THRESHOLD,
  MAX_ENROLLMENT_SAMPLES,
  MIN_AUDIO_DURATION_MS,
  MIN_ENROLLMENT_SAMPLES,
  RECOMMENDED_ENROLLMENT_SAMPLES,
};
