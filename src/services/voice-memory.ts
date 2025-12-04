/**
 * Voice Memory Service
 *
 * Lightweight voice recognition that creates "voice sketches" from audio
 * characteristics. Not full biometrics, but enough to recognize returning
 * users across devices with reasonable confidence.
 *
 * Features extracted:
 * - Pitch (fundamental frequency) - voice "height"
 * - Speaking rate - how fast they talk
 * - Spectral characteristics - voice "color/timbre"
 * - Pause patterns - rhythm of speech
 *
 * This is designed for UX enhancement, not security. The agent can say
 * "Your voice sounds familiar - is this Seth?" rather than requiring login.
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voice sketch - a compact representation of someone's voice characteristics
 */
export interface VoiceSketch {
  // Pitch characteristics (in Hz)
  pitchMean: number; // Average fundamental frequency
  pitchMin: number; // Lowest pitch observed
  pitchMax: number; // Highest pitch observed
  pitchStdDev: number; // How much pitch varies

  // Timing characteristics
  speakingRateMean: number; // Average syllables per second (estimated)
  pauseFrequency: number; // How often they pause (pauses per minute)
  avgPauseDuration: number; // Average pause length (ms)

  // Spectral characteristics (voice "color")
  spectralCentroidMean: number; // Brightness of voice
  spectralCentroidStdDev: number;
  spectralRolloffMean: number; // High frequency content

  // Energy characteristics
  energyMean: number; // Average loudness
  energyStdDev: number; // Dynamic range

  // Metadata
  samplesAnalyzed: number; // How many audio chunks contributed
  totalDurationMs: number; // Total speech analyzed
  confidence: number; // 0-1, how reliable is this sketch
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Result of comparing two voice sketches
 */
export interface VoiceSimilarityResult {
  similarity: number; // 0-1, how similar the voices are
  confidence: number; // 0-1, how confident we are in the comparison
  matchingFeatures: string[]; // Which features matched well
  divergentFeatures: string[]; // Which features didn't match
}

/**
 * Result of searching for a voice match
 */
export interface VoiceSearchResult {
  userId: string;
  similarity: number;
  confidence: number;
  profile?: {
    name?: string;
    lastSeen?: Date;
  };
}

// ============================================================================
// AUDIO FEATURE EXTRACTION
// ============================================================================

/**
 * Extract pitch (fundamental frequency) using autocorrelation
 * Returns pitch in Hz, or null if no clear pitch detected
 */
function extractPitch(samples: Float32Array, sampleRate: number): number | null {
  // Simple autocorrelation-based pitch detection
  const minPeriod = Math.floor(sampleRate / 500); // Max 500 Hz (high voice)
  const maxPeriod = Math.floor(sampleRate / 50); // Min 50 Hz (low voice)

  if (samples.length < maxPeriod * 2) {
    return null; // Not enough samples
  }

  let bestPeriod = 0;
  let bestCorrelation = -1;

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < samples.length - period; i++) {
      correlation += samples[i] * samples[i + period];
      norm1 += samples[i] * samples[i];
      norm2 += samples[i + period] * samples[i + period];
    }

    // Normalized correlation
    const normalizedCorr = correlation / Math.sqrt(norm1 * norm2 + 1e-10);

    if (normalizedCorr > bestCorrelation) {
      bestCorrelation = normalizedCorr;
      bestPeriod = period;
    }
  }

  // Only return pitch if correlation is strong enough
  if (bestCorrelation > 0.5 && bestPeriod > 0) {
    return sampleRate / bestPeriod;
  }

  return null;
}

/**
 * Calculate spectral centroid (brightness of sound)
 * Higher values = brighter/sharper voice
 */
function calculateSpectralCentroid(magnitudes: Float32Array, sampleRate: number): number {
  let weightedSum = 0;
  let sum = 0;
  const binWidth = sampleRate / (magnitudes.length * 2);

  for (let i = 0; i < magnitudes.length; i++) {
    const frequency = i * binWidth;
    weightedSum += frequency * magnitudes[i];
    sum += magnitudes[i];
  }

  return sum > 0 ? weightedSum / sum : 0;
}

/**
 * Calculate spectral rolloff (frequency below which X% of energy is contained)
 */
function calculateSpectralRolloff(
  magnitudes: Float32Array,
  sampleRate: number,
  percentage: number = 0.85
): number {
  let totalEnergy = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    totalEnergy += magnitudes[i] * magnitudes[i];
  }

  const threshold = totalEnergy * percentage;
  let cumulativeEnergy = 0;
  const binWidth = sampleRate / (magnitudes.length * 2);

  for (let i = 0; i < magnitudes.length; i++) {
    cumulativeEnergy += magnitudes[i] * magnitudes[i];
    if (cumulativeEnergy >= threshold) {
      return i * binWidth;
    }
  }

  return sampleRate / 2; // Nyquist frequency
}

/**
 * Calculate RMS energy of a signal
 */
function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Simple FFT magnitude calculation (uses real-only DFT for simplicity)
 * For production, you'd want a proper FFT library
 */
function calculateMagnitudeSpectrum(samples: Float32Array): Float32Array {
  const n = samples.length;
  const magnitudes = new Float32Array(Math.floor(n / 2));

  for (let k = 0; k < magnitudes.length; k++) {
    let real = 0;
    let imag = 0;

    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      real += samples[t] * Math.cos(angle);
      imag -= samples[t] * Math.sin(angle);
    }

    magnitudes[k] = Math.sqrt(real * real + imag * imag) / n;
  }

  return magnitudes;
}

/**
 * Detect if a frame contains speech (vs silence)
 */
function isSpeechFrame(samples: Float32Array, threshold: number = 0.01): boolean {
  const rms = calculateRMS(samples);
  return rms > threshold;
}

// ============================================================================
// VOICE SKETCH BUILDER
// ============================================================================

/**
 * Accumulator for building voice sketches incrementally
 */
export class VoiceSketchBuilder {
  private pitchSamples: number[] = [];
  private spectralCentroids: number[] = [];
  private spectralRolloffs: number[] = [];
  private energySamples: number[] = [];
  private pauseDurations: number[] = [];

  private totalDurationMs: number = 0;
  private lastSpeechTimestamp: number = 0;
  private inPause: boolean = false;
  private pauseStartTime: number = 0;

  private readonly sampleRate: number;
  private readonly frameSize: number;

  constructor(sampleRate: number = 16000, frameSizeMs: number = 25) {
    this.sampleRate = sampleRate;
    this.frameSize = Math.floor((sampleRate * frameSizeMs) / 1000);
  }

  /**
   * Process an audio chunk and extract features
   */
  processAudioChunk(samples: Float32Array, timestampMs: number): void {
    // Process in frames
    for (let start = 0; start + this.frameSize <= samples.length; start += this.frameSize) {
      const frame = samples.slice(start, start + this.frameSize);
      this.processFrame(frame, timestampMs + (start / this.sampleRate) * 1000);
    }

    this.totalDurationMs = timestampMs + (samples.length / this.sampleRate) * 1000;
  }

  private processFrame(frame: Float32Array, timestampMs: number): void {
    const isSpeech = isSpeechFrame(frame);

    if (isSpeech) {
      // End pause tracking
      if (this.inPause) {
        const pauseDuration = timestampMs - this.pauseStartTime;
        if (pauseDuration > 100 && pauseDuration < 3000) {
          // Reasonable pause
          this.pauseDurations.push(pauseDuration);
        }
        this.inPause = false;
      }
      this.lastSpeechTimestamp = timestampMs;

      // Extract pitch
      const pitch = extractPitch(frame, this.sampleRate);
      if (pitch !== null && pitch > 50 && pitch < 500) {
        this.pitchSamples.push(pitch);
      }

      // Extract spectral features
      const magnitudes = calculateMagnitudeSpectrum(frame);
      const centroid = calculateSpectralCentroid(magnitudes, this.sampleRate);
      const rolloff = calculateSpectralRolloff(magnitudes, this.sampleRate);

      if (centroid > 0) {
        this.spectralCentroids.push(centroid);
        this.spectralRolloffs.push(rolloff);
      }

      // Extract energy
      const energy = calculateRMS(frame);
      this.energySamples.push(energy);
    } else {
      // Start pause tracking
      if (!this.inPause && this.lastSpeechTimestamp > 0) {
        this.inPause = true;
        this.pauseStartTime = timestampMs;
      }
    }
  }

  /**
   * Build the voice sketch from accumulated features
   */
  build(): VoiceSketch | null {
    // Need enough samples for reliable sketch
    if (this.pitchSamples.length < 10 || this.totalDurationMs < 5000) {
      getLogger().debug(
        {
          pitchSamples: this.pitchSamples.length,
          durationMs: this.totalDurationMs,
        },
        'Not enough data for voice sketch'
      );
      return null;
    }

    // Calculate statistics
    const pitchStats = this.calculateStats(this.pitchSamples);
    const centroidStats = this.calculateStats(this.spectralCentroids);
    const rolloffStats = this.calculateStats(this.spectralRolloffs);
    const energyStats = this.calculateStats(this.energySamples);
    const pauseStats = this.calculateStats(this.pauseDurations);

    // Estimate speaking rate from pitch measurements
    // More pitch samples per second = faster speech
    const speechDurationSec = this.totalDurationMs / 1000;
    const estimatedSyllablesPerSecond = this.pitchSamples.length / (speechDurationSec * 10);

    // Calculate confidence based on sample size
    const confidence = Math.min(
      1.0,
      Math.sqrt(this.pitchSamples.length / 100) * Math.sqrt(this.totalDurationMs / 30000)
    );

    return {
      pitchMean: pitchStats.mean,
      pitchMin: pitchStats.min,
      pitchMax: pitchStats.max,
      pitchStdDev: pitchStats.stdDev,

      speakingRateMean: estimatedSyllablesPerSecond,
      pauseFrequency: (this.pauseDurations.length / speechDurationSec) * 60,
      avgPauseDuration: pauseStats.mean || 300,

      spectralCentroidMean: centroidStats.mean,
      spectralCentroidStdDev: centroidStats.stdDev,
      spectralRolloffMean: rolloffStats.mean,

      energyMean: energyStats.mean,
      energyStdDev: energyStats.stdDev,

      samplesAnalyzed: this.pitchSamples.length,
      totalDurationMs: this.totalDurationMs,
      confidence,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private calculateStats(values: number[]): {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
  } {
    if (values.length === 0) {
      return { mean: 0, stdDev: 0, min: 0, max: 0 };
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

    return {
      mean,
      stdDev: Math.sqrt(variance),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  /**
   * Get current sample counts (for progress tracking)
   */
  getProgress(): { samplesCollected: number; durationMs: number; isReady: boolean } {
    return {
      samplesCollected: this.pitchSamples.length,
      durationMs: this.totalDurationMs,
      isReady: this.pitchSamples.length >= 10 && this.totalDurationMs >= 5000,
    };
  }

  /**
   * Reset the builder for a new user
   */
  reset(): void {
    this.pitchSamples = [];
    this.spectralCentroids = [];
    this.spectralRolloffs = [];
    this.energySamples = [];
    this.pauseDurations = [];
    this.totalDurationMs = 0;
    this.lastSpeechTimestamp = 0;
    this.inPause = false;
    this.pauseStartTime = 0;
  }
}

// ============================================================================
// VOICE SIMILARITY COMPARISON
// ============================================================================

/**
 * Compare two voice sketches and return similarity score
 */
export function compareVoiceSketches(
  sketch1: VoiceSketch,
  sketch2: VoiceSketch
): VoiceSimilarityResult {
  const matchingFeatures: string[] = [];
  const divergentFeatures: string[] = [];

  // Weight each feature by importance
  const features = [
    {
      name: 'pitch',
      weight: 0.25,
      sim: gaussianSimilarity(sketch1.pitchMean, sketch2.pitchMean, 30),
    },
    {
      name: 'pitchRange',
      weight: 0.1,
      sim: gaussianSimilarity(sketch1.pitchStdDev, sketch2.pitchStdDev, 20),
    },
    {
      name: 'spectralCentroid',
      weight: 0.2,
      sim: gaussianSimilarity(sketch1.spectralCentroidMean, sketch2.spectralCentroidMean, 200),
    },
    {
      name: 'spectralRolloff',
      weight: 0.15,
      sim: gaussianSimilarity(sketch1.spectralRolloffMean, sketch2.spectralRolloffMean, 500),
    },
    {
      name: 'speakingRate',
      weight: 0.15,
      sim: gaussianSimilarity(sketch1.speakingRateMean, sketch2.speakingRateMean, 1.0),
    },
    {
      name: 'pausePattern',
      weight: 0.1,
      sim: gaussianSimilarity(sketch1.avgPauseDuration, sketch2.avgPauseDuration, 200),
    },
    {
      name: 'energy',
      weight: 0.05,
      sim: gaussianSimilarity(sketch1.energyMean, sketch2.energyMean, 0.1),
    },
  ];

  let totalSimilarity = 0;
  let totalWeight = 0;

  for (const feature of features) {
    totalSimilarity += feature.sim * feature.weight;
    totalWeight += feature.weight;

    if (feature.sim > 0.7) {
      matchingFeatures.push(feature.name);
    } else if (feature.sim < 0.3) {
      divergentFeatures.push(feature.name);
    }
  }

  const similarity = totalSimilarity / totalWeight;

  // Confidence based on both sketches' quality
  const confidence = Math.sqrt(sketch1.confidence * sketch2.confidence);

  return {
    similarity,
    confidence,
    matchingFeatures,
    divergentFeatures,
  };
}

/**
 * Gaussian similarity function - returns 1.0 for identical values,
 * decreasing as difference increases
 */
function gaussianSimilarity(a: number, b: number, sigma: number): number {
  const diff = a - b;
  return Math.exp(-(diff * diff) / (2 * sigma * sigma));
}

// ============================================================================
// VOICE MEMORY SERVICE
// ============================================================================

/**
 * Voice Memory Service - manages voice sketches and matching
 */
export class VoiceMemoryService {
  private sketchBuilders: Map<string, VoiceSketchBuilder> = new Map();

  constructor() {
    getLogger().info('VoiceMemoryService initialized');
  }

  /**
   * Get or create a sketch builder for a session
   */
  getBuilder(sessionId: string, sampleRate: number = 16000): VoiceSketchBuilder {
    let builder = this.sketchBuilders.get(sessionId);
    if (!builder) {
      builder = new VoiceSketchBuilder(sampleRate);
      this.sketchBuilders.set(sessionId, builder);
    }
    return builder;
  }

  /**
   * Process audio from a session
   */
  processAudio(
    sessionId: string,
    samples: Float32Array,
    timestampMs: number,
    sampleRate: number = 16000
  ): void {
    const builder = this.getBuilder(sessionId, sampleRate);
    builder.processAudioChunk(samples, timestampMs);
  }

  /**
   * Build voice sketch for a session
   */
  buildSketch(sessionId: string): VoiceSketch | null {
    const builder = this.sketchBuilders.get(sessionId);
    if (!builder) return null;
    return builder.build();
  }

  /**
   * Get progress for a session
   */
  getProgress(
    sessionId: string
  ): { samplesCollected: number; durationMs: number; isReady: boolean } | null {
    const builder = this.sketchBuilders.get(sessionId);
    if (!builder) return null;
    return builder.getProgress();
  }

  /**
   * Clean up a session's builder
   */
  cleanupSession(sessionId: string): void {
    this.sketchBuilders.delete(sessionId);
  }

  /**
   * Find best matching voice from a list of candidates
   */
  findBestMatch(
    currentSketch: VoiceSketch,
    candidates: Array<{ userId: string; sketch: VoiceSketch; name?: string }>
  ): VoiceSearchResult | null {
    if (candidates.length === 0) return null;

    let bestMatch: VoiceSearchResult | null = null;

    for (const candidate of candidates) {
      const result = compareVoiceSketches(currentSketch, candidate.sketch);

      if (!bestMatch || result.similarity > bestMatch.similarity) {
        bestMatch = {
          userId: candidate.userId,
          similarity: result.similarity,
          confidence: result.confidence,
          profile: candidate.name ? { name: candidate.name } : undefined,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Search all stored voice sketches for matches
   * This is the main entry point for voice identification
   */
  async searchVoices(
    currentSketch: VoiceSketch,
    store: {
      listProfiles: () => Promise<Array<{ id: string; name?: string; voiceSketch?: VoiceSketch }>>;
    }
  ): Promise<VoiceSearchResult[]> {
    const profiles = await store.listProfiles();
    const results: VoiceSearchResult[] = [];

    for (const profile of profiles) {
      if (!profile.voiceSketch) continue;

      const comparison = compareVoiceSketches(currentSketch, profile.voiceSketch);

      results.push({
        userId: profile.id,
        similarity: comparison.similarity,
        confidence: comparison.confidence,
        profile: profile.name ? { name: profile.name } : undefined,
      });
    }

    // Sort by similarity (highest first)
    results.sort((a, b) => b.similarity - a.similarity);

    return results;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let voiceMemoryInstance: VoiceMemoryService | null = null;

export function getVoiceMemory(): VoiceMemoryService {
  if (!voiceMemoryInstance) {
    voiceMemoryInstance = new VoiceMemoryService();
  }
  return voiceMemoryInstance;
}

export function resetVoiceMemory(): void {
  voiceMemoryInstance = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  VoiceSketchBuilder,
  VoiceMemoryService,
  compareVoiceSketches,
  getVoiceMemory,
  resetVoiceMemory,
};
