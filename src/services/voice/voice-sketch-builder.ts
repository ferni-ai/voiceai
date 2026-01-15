/**
 * Voice Sketch Builder
 *
 * Converts voice prosody learning data into a compact VoiceSketch
 * that gets stored on UserProfile for cross-device recognition.
 *
 * "Your voice sounds familiar" - enables recognition across devices.
 *
 * @module voice/voice-sketch-builder
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VoiceSketch } from '../../types/user-profile.js';
import { getDefaultStore } from '../../memory/in-memory-store.js';

const log = createLogger({ module: 'VoiceSketchBuilder' });

// ============================================================================
// TYPES
// ============================================================================

interface VoiceCharacteristicsInput {
  // From prosody learning
  pitchMean?: number;
  pitchRange?: number;
  pitchVariability?: number;
  energyMean?: number;
  energyRange?: number;
  energyVariability?: number;
  speakingRate?: number;
  pauseFrequency?: number;
  pauseDuration?: number;
}

interface BuildVoiceSketchOptions {
  userId: string;
  sessionId: string;
  characteristics?: VoiceCharacteristicsInput;
  durationMs?: number;
  sampleCount?: number;
}

// ============================================================================
// VOICE SKETCH BUILDER
// ============================================================================

/**
 * Build a VoiceSketch from session voice data
 *
 * This creates a compact fingerprint that can be used for
 * "Your voice sounds familiar" cross-device recognition.
 */
export function buildVoiceSketch(options: BuildVoiceSketchOptions): VoiceSketch | null {
  const { userId, characteristics, durationMs = 0, sampleCount = 0 } = options;

  // Need minimum data to create a useful sketch
  if (!characteristics || sampleCount < 3) {
    log.debug({ userId, sampleCount }, 'Not enough data for voice sketch');
    return null;
  }

  const now = new Date();

  // Calculate pitch stats (with sensible defaults)
  const pitchMean = characteristics.pitchMean ?? 150; // Hz
  const pitchRange = characteristics.pitchRange ?? 50;
  const pitchStdDev = characteristics.pitchVariability
    ? (characteristics.pitchVariability * pitchRange) / 2
    : 25;

  // Calculate energy stats
  const energyMean = characteristics.energyMean ?? -20; // dB
  const energyRange = characteristics.energyRange ?? 15;
  const energyStdDev = characteristics.energyVariability
    ? (characteristics.energyVariability * energyRange) / 2
    : 5;

  // Speaking characteristics
  const speakingRateMean = characteristics.speakingRate
    ? characteristics.speakingRate / 60 // Convert WPM to syllables/sec (rough)
    : 3.5;
  const pauseFrequency = characteristics.pauseFrequency ?? 10;
  const avgPauseDuration = characteristics.pauseDuration ?? 300;

  // Spectral characteristics (estimated from energy/pitch relationship)
  const spectralCentroidMean = pitchMean * 2.5; // Rough approximation
  const spectralCentroidStdDev = pitchStdDev * 2;
  const spectralRolloffMean = spectralCentroidMean * 2;

  // Calculate confidence based on sample count
  const confidence = Math.min(0.9, sampleCount / 20); // Max 0.9, increases with samples

  const sketch: VoiceSketch = {
    // Pitch
    pitchMean,
    pitchMin: pitchMean - pitchRange / 2,
    pitchMax: pitchMean + pitchRange / 2,
    pitchStdDev,

    // Timing
    speakingRateMean,
    pauseFrequency,
    avgPauseDuration,

    // Spectral (derived)
    spectralCentroidMean,
    spectralCentroidStdDev,
    spectralRolloffMean,

    // Energy
    energyMean,
    energyStdDev,

    // Metadata
    samplesAnalyzed: sampleCount,
    totalDurationMs: durationMs,
    confidence,
    createdAt: now,
    updatedAt: now,
  };

  log.debug(
    {
      userId,
      pitchMean: sketch.pitchMean.toFixed(0),
      confidence: sketch.confidence.toFixed(2),
      samples: sketch.samplesAnalyzed,
    },
    '📊 Voice sketch built'
  );

  return sketch;
}

/**
 * Merge a new voice sketch with an existing one
 *
 * Uses weighted averaging to combine characteristics,
 * giving more weight to newer samples while preserving history.
 */
export function mergeVoiceSketch(
  existing: VoiceSketch | undefined,
  incoming: VoiceSketch
): VoiceSketch {
  if (!existing) {
    return incoming;
  }

  // Weight newer samples more heavily (0.7 for new, 0.3 for old)
  const newWeight = 0.7;
  const oldWeight = 0.3;

  const merge = (oldVal: number, newVal: number): number => oldVal * oldWeight + newVal * newWeight;

  return {
    // Pitch
    pitchMean: merge(existing.pitchMean, incoming.pitchMean),
    pitchMin: Math.min(existing.pitchMin, incoming.pitchMin),
    pitchMax: Math.max(existing.pitchMax, incoming.pitchMax),
    pitchStdDev: merge(existing.pitchStdDev, incoming.pitchStdDev),

    // Timing
    speakingRateMean: merge(existing.speakingRateMean, incoming.speakingRateMean),
    pauseFrequency: merge(existing.pauseFrequency, incoming.pauseFrequency),
    avgPauseDuration: merge(existing.avgPauseDuration, incoming.avgPauseDuration),

    // Spectral
    spectralCentroidMean: merge(existing.spectralCentroidMean, incoming.spectralCentroidMean),
    spectralCentroidStdDev: merge(existing.spectralCentroidStdDev, incoming.spectralCentroidStdDev),
    spectralRolloffMean: merge(existing.spectralRolloffMean, incoming.spectralRolloffMean),

    // Energy
    energyMean: merge(existing.energyMean, incoming.energyMean),
    energyStdDev: merge(existing.energyStdDev, incoming.energyStdDev),

    // Metadata
    samplesAnalyzed: existing.samplesAnalyzed + incoming.samplesAnalyzed,
    totalDurationMs: existing.totalDurationMs + incoming.totalDurationMs,
    confidence: Math.min(0.95, (existing.confidence + incoming.confidence) / 2 + 0.05),
    createdAt: existing.createdAt,
    updatedAt: new Date(),
  };
}

/**
 * Update user's voice sketch on profile from session voice data
 *
 * Called at session end to persist voice characteristics.
 */
export async function updateUserVoiceSketch(
  userId: string,
  sessionId: string,
  characteristics?: VoiceCharacteristicsInput,
  durationMs?: number,
  sampleCount?: number
): Promise<boolean> {
  try {
    // Build new sketch from session data
    const newSketch = buildVoiceSketch({
      userId,
      sessionId,
      characteristics,
      durationMs,
      sampleCount,
    });

    if (!newSketch) {
      log.debug({ userId }, 'No voice sketch to update (insufficient data)');
      return false;
    }

    // Load current profile
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);

    if (!profile) {
      log.warn({ userId }, 'Cannot update voice sketch - no profile');
      return false;
    }

    // Merge with existing sketch
    const mergedSketch = mergeVoiceSketch(profile.voiceSketch, newSketch);

    // Update profile
    profile.voiceSketch = mergedSketch;
    await store.saveProfile(profile);

    log.info(
      {
        userId,
        confidence: mergedSketch.confidence.toFixed(2),
        totalSamples: mergedSketch.samplesAnalyzed,
      },
      '🎤 Voice sketch updated on profile'
    );

    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update voice sketch');
    return false;
  }
}

/**
 * Get voice sketch from user profile
 */
export async function getUserVoiceSketch(userId: string): Promise<VoiceSketch | null> {
  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);
    return profile?.voiceSketch ?? null;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get voice sketch');
    return null;
  }
}
