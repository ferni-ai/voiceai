/**
 * Ambient Sound Awareness
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects ambient environment characteristics from user audio:
 * - Background noise level (quiet room vs coffee shop vs outdoors)
 * - Environmental context clues (typing, TV, traffic)
 * - Acoustic conditions that affect speech clarity
 *
 * This enables Ferni to:
 * 1. Adjust response clarity for noisy environments
 * 2. Acknowledge environmental context ("sounds like you're somewhere busy")
 * 3. Offer appropriate responses ("should we continue this later?")
 *
 * @module AmbientAwareness
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'AmbientAwareness' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Detected environment type
 */
export type EnvironmentType =
  | 'quiet_room'      // Low background noise, clear audio
  | 'office'          // Moderate ambient, occasional typing/talking
  | 'coffee_shop'     // High ambient, conversations, music
  | 'outdoors'        // Wind, traffic, variable noise
  | 'car'             // Road noise, engine, consistent hum
  | 'public_transit'  // Announcements, engine, crowd
  | 'noisy'           // Generic high noise
  | 'unknown';

/**
 * Environmental awareness result
 */
export interface AmbientAnalysisResult {
  /** Detected environment type */
  environment: EnvironmentType;
  /** Confidence in detection (0-1) */
  confidence: number;
  
  /** Background noise level (0-1, where 0 = silent, 1 = very noisy) */
  noiseLevel: number;
  /** Signal-to-noise ratio estimate (higher = clearer speech) */
  snrEstimate: number;
  
  /** Detected background elements */
  backgroundElements: BackgroundElement[];
  
  /** Recommendations for agent behavior */
  recommendations: AmbientRecommendations;
}

/**
 * Detected background sound element
 */
export interface BackgroundElement {
  type: 'music' | 'conversation' | 'traffic' | 'typing' | 'tv' | 'wind' | 'rain' | 'baby_crying' | 'unknown';
  confidence: number;
  /** Is this element persistent or intermittent? */
  persistent: boolean;
}

/**
 * Recommendations based on ambient analysis
 */
export interface AmbientRecommendations {
  /** Speak slower/clearer for noisy environments */
  speakClearer: boolean;
  /** Offer to pause/continue later */
  offerToPause: boolean;
  /** Increase volume slightly */
  increaseVolume: boolean;
  /** Add more pauses for clarity */
  addPauses: boolean;
  /** Suggested acknowledgment phrase */
  acknowledgment: string | null;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const AMBIENT_CONFIG = {
  /** Minimum frames needed for reliable analysis */
  MIN_FRAMES_FOR_ANALYSIS: 50,
  /** Rolling window size for noise estimation */
  NOISE_WINDOW_SIZE: 100,
  /** Threshold for "quiet" environment (RMS energy) */
  QUIET_THRESHOLD: 0.015,
  /** Threshold for "noisy" environment */
  NOISY_THRESHOLD: 0.08,
  /** Minimum SNR for clear speech */
  GOOD_SNR_THRESHOLD: 15, // dB
  /** Analysis update interval (ms) */
  UPDATE_INTERVAL_MS: 2000,
} as const;

// ============================================================================
// AMBIENT AWARENESS SERVICE
// ============================================================================

export class AmbientAwarenessService {
  private energyHistory: number[] = [];
  private speechEnergyHistory: number[] = [];
  private silenceEnergyHistory: number[] = [];
  private lastAnalysis: AmbientAnalysisResult | null = null;
  private lastAnalysisTime = 0;
  private frameCount = 0;

  // Spectral analysis buffers
  private spectralHistory: Array<{
    lowBand: number;   // 0-500 Hz (bass, rumble)
    midBand: number;   // 500-2000 Hz (speech fundamentals)
    highBand: number;  // 2000-8000 Hz (sibilants, consonants)
  }> = [];

  /**
   * Process an audio frame for ambient analysis
   * Call this with each audio frame (can be same stream as STT)
   */
  processFrame(
    data: Int16Array | Float32Array,
    sampleRate: number,
    isSpeech: boolean
  ): void {
    this.frameCount++;

    // Calculate energy
    const energy = this.calculateEnergy(data);
    this.energyHistory.push(energy);

    // Track speech vs non-speech energy separately
    if (isSpeech) {
      this.speechEnergyHistory.push(energy);
    } else {
      this.silenceEnergyHistory.push(energy);
    }

    // Keep windows bounded
    if (this.energyHistory.length > AMBIENT_CONFIG.NOISE_WINDOW_SIZE) {
      this.energyHistory.shift();
    }
    if (this.speechEnergyHistory.length > AMBIENT_CONFIG.NOISE_WINDOW_SIZE) {
      this.speechEnergyHistory.shift();
    }
    if (this.silenceEnergyHistory.length > AMBIENT_CONFIG.NOISE_WINDOW_SIZE) {
      this.silenceEnergyHistory.shift();
    }

    // Simple spectral analysis (approximation without FFT)
    const spectral = this.estimateSpectralBands(data, sampleRate);
    this.spectralHistory.push(spectral);
    if (this.spectralHistory.length > 50) {
      this.spectralHistory.shift();
    }
  }

  /**
   * Get ambient analysis (cached, updates periodically)
   */
  getAnalysis(): AmbientAnalysisResult {
    const now = Date.now();

    // Return cached if recent
    if (
      this.lastAnalysis &&
      now - this.lastAnalysisTime < AMBIENT_CONFIG.UPDATE_INTERVAL_MS
    ) {
      return this.lastAnalysis;
    }

    // Perform new analysis
    this.lastAnalysis = this.analyze();
    this.lastAnalysisTime = now;

    return this.lastAnalysis;
  }

  /**
   * Perform ambient environment analysis
   */
  private analyze(): AmbientAnalysisResult {
    // Default result for insufficient data
    if (this.energyHistory.length < AMBIENT_CONFIG.MIN_FRAMES_FOR_ANALYSIS) {
      return {
        environment: 'unknown',
        confidence: 0,
        noiseLevel: 0,
        snrEstimate: 20, // Assume good until proven otherwise
        backgroundElements: [],
        recommendations: {
          speakClearer: false,
          offerToPause: false,
          increaseVolume: false,
          addPauses: false,
          acknowledgment: null,
        },
      };
    }

    // Calculate noise floor (from non-speech frames)
    const noiseFloor =
      this.silenceEnergyHistory.length > 10
        ? this.percentile(this.silenceEnergyHistory, 0.3)
        : this.percentile(this.energyHistory, 0.1);

    // Calculate speech level (from speech frames)
    const speechLevel =
      this.speechEnergyHistory.length > 10
        ? this.percentile(this.speechEnergyHistory, 0.7)
        : this.percentile(this.energyHistory, 0.9);

    // Calculate SNR
    const snrLinear = speechLevel / Math.max(noiseFloor, 0.001);
    const snrEstimate = 20 * Math.log10(snrLinear);

    // Normalize noise level
    const noiseLevel = Math.min(1, noiseFloor / AMBIENT_CONFIG.NOISY_THRESHOLD);

    // Detect environment type
    const { environment, confidence } = this.classifyEnvironment(
      noiseFloor,
      snrEstimate
    );

    // Detect background elements
    const backgroundElements = this.detectBackgroundElements();

    // Build recommendations
    const recommendations = this.buildRecommendations(
      environment,
      noiseLevel,
      snrEstimate,
      backgroundElements
    );

    const result: AmbientAnalysisResult = {
      environment,
      confidence,
      noiseLevel,
      snrEstimate,
      backgroundElements,
      recommendations,
    };

    // Log significant changes
    if (
      !this.lastAnalysis ||
      this.lastAnalysis.environment !== environment ||
      Math.abs(this.lastAnalysis.noiseLevel - noiseLevel) > 0.2
    ) {
      log.debug(
        {
          environment,
          confidence: confidence.toFixed(2),
          noiseLevel: noiseLevel.toFixed(2),
          snrEstimate: snrEstimate.toFixed(1),
        },
        '🔊 Ambient environment analyzed'
      );
    }

    return result;
  }

  /**
   * Classify environment type based on audio characteristics
   */
  private classifyEnvironment(
    noiseFloor: number,
    snr: number
  ): { environment: EnvironmentType; confidence: number } {
    // Quiet room: very low noise, high SNR
    if (noiseFloor < AMBIENT_CONFIG.QUIET_THRESHOLD && snr > 20) {
      return { environment: 'quiet_room', confidence: 0.85 };
    }

    // Office: moderate noise, good SNR
    if (noiseFloor < 0.04 && snr > 12) {
      return { environment: 'office', confidence: 0.7 };
    }

    // Noisy: high noise floor
    if (noiseFloor > AMBIENT_CONFIG.NOISY_THRESHOLD) {
      // Check spectral characteristics for more specific classification
      const avgSpectral = this.averageSpectral();

      // Traffic: high low-band (bass)
      if (avgSpectral.lowBand > avgSpectral.midBand * 1.5) {
        return { environment: 'car', confidence: 0.6 };
      }

      // Coffee shop: high mid-band (voices)
      if (avgSpectral.midBand > avgSpectral.lowBand * 1.3) {
        return { environment: 'coffee_shop', confidence: 0.6 };
      }

      return { environment: 'noisy', confidence: 0.5 };
    }

    // Default to unknown
    return { environment: 'unknown', confidence: 0.3 };
  }

  /**
   * Detect specific background elements
   */
  private detectBackgroundElements(): BackgroundElement[] {
    const elements: BackgroundElement[] = [];
    const avgSpectral = this.averageSpectral();

    // High low-frequency = rumble/traffic
    if (avgSpectral.lowBand > 0.03) {
      elements.push({
        type: 'traffic',
        confidence: Math.min(0.7, avgSpectral.lowBand / 0.05),
        persistent: true,
      });
    }

    // High mid-frequency during silence = background music or TV
    if (avgSpectral.midBand > 0.02 && this.silenceEnergyHistory.length > 20) {
      const silenceEnergy = this.average(this.silenceEnergyHistory);
      if (silenceEnergy > 0.015) {
        elements.push({
          type: 'music',
          confidence: 0.5,
          persistent: true,
        });
      }
    }

    return elements;
  }

  /**
   * Build recommendations based on analysis
   */
  private buildRecommendations(
    environment: EnvironmentType,
    noiseLevel: number,
    snr: number,
    elements: BackgroundElement[]
  ): AmbientRecommendations {
    const recommendations: AmbientRecommendations = {
      speakClearer: false,
      offerToPause: false,
      increaseVolume: false,
      addPauses: false,
      acknowledgment: null,
    };

    // Noisy environments need clearer speech
    if (noiseLevel > 0.5 || snr < 10) {
      recommendations.speakClearer = true;
      recommendations.addPauses = true;
    }

    // Very noisy - offer to pause
    if (noiseLevel > 0.7 || snr < 6) {
      recommendations.offerToPause = true;
      recommendations.acknowledgment =
        "It sounds pretty busy there. Want to continue this later when it's quieter?";
    }

    // Moderate noise - just increase volume
    if (noiseLevel > 0.3 && noiseLevel <= 0.5) {
      recommendations.increaseVolume = true;
    }

    // Environment-specific acknowledgments (used sparingly)
    if (environment === 'car' && !recommendations.acknowledgment) {
      recommendations.acknowledgment =
        "Sounds like you're on the road. I'll keep it brief.";
    }

    // Background music detected
    const musicElement = elements.find((e) => e.type === 'music');
    if (musicElement && musicElement.confidence > 0.6 && !recommendations.acknowledgment) {
      recommendations.acknowledgment = null; // Don't comment on background music
    }

    return recommendations;
  }

  /**
   * Calculate RMS energy
   */
  private calculateEnergy(data: Int16Array | Float32Array): number {
    let sumSquares = 0;
    const samples = data.length;

    if (data instanceof Int16Array) {
      for (let i = 0; i < samples; i++) {
        const normalized = data[i] / 32768;
        sumSquares += normalized * normalized;
      }
    } else {
      for (let i = 0; i < samples; i++) {
        sumSquares += data[i] * data[i];
      }
    }

    return Math.sqrt(sumSquares / samples);
  }

  /**
   * Estimate spectral bands (simple approximation without FFT)
   * Uses zero-crossing rate and energy distribution
   */
  private estimateSpectralBands(
    data: Int16Array | Float32Array,
    sampleRate: number
  ): { lowBand: number; midBand: number; highBand: number } {
    // This is a simplified spectral estimation
    // A full implementation would use FFT

    // Zero-crossing rate correlates with high-frequency content
    let zeroCrossings = 0;
    const samples = data.length;
    const normalize = data instanceof Int16Array ? 32768 : 1;

    for (let i = 1; i < samples; i++) {
      const prev = data[i - 1] / normalize;
      const curr = data[i] / normalize;
      if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
        zeroCrossings++;
      }
    }

    const zcrPerSec = (zeroCrossings / samples) * sampleRate;

    // Approximate band energies based on ZCR
    // Low ZCR = low frequency dominant
    // High ZCR = high frequency dominant
    const totalEnergy = this.calculateEnergy(data);

    const highRatio = Math.min(1, zcrPerSec / 3000);
    const lowRatio = 1 - highRatio;

    return {
      lowBand: totalEnergy * lowRatio * 0.7,
      midBand: totalEnergy * 0.5,
      highBand: totalEnergy * highRatio * 0.3,
    };
  }

  /**
   * Get average spectral characteristics
   */
  private averageSpectral(): { lowBand: number; midBand: number; highBand: number } {
    if (this.spectralHistory.length === 0) {
      return { lowBand: 0, midBand: 0, highBand: 0 };
    }

    const sum = this.spectralHistory.reduce(
      (acc, s) => ({
        lowBand: acc.lowBand + s.lowBand,
        midBand: acc.midBand + s.midBand,
        highBand: acc.highBand + s.highBand,
      }),
      { lowBand: 0, midBand: 0, highBand: 0 }
    );

    const n = this.spectralHistory.length;
    return {
      lowBand: sum.lowBand / n,
      midBand: sum.midBand / n,
      highBand: sum.highBand / n,
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * p);
    return sorted[index] || 0;
  }

  /**
   * Calculate average
   */
  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.energyHistory = [];
    this.speechEnergyHistory = [];
    this.silenceEnergyHistory = [];
    this.spectralHistory = [];
    this.lastAnalysis = null;
    this.lastAnalysisTime = 0;
    this.frameCount = 0;
    log.debug('🔊 Ambient awareness reset');
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const sessionInstances = new Map<string, AmbientAwarenessService>();

/**
 * Get or create ambient awareness service for a session
 */
export function getAmbientAwarenessService(sessionId: string): AmbientAwarenessService {
  if (!sessionInstances.has(sessionId)) {
    sessionInstances.set(sessionId, new AmbientAwarenessService());
  }
  return sessionInstances.get(sessionId)!;
}

/**
 * Reset ambient awareness for a session
 */
export function resetAmbientAwareness(sessionId: string): void {
  const instance = sessionInstances.get(sessionId);
  if (instance) {
    instance.reset();
    sessionInstances.delete(sessionId);
  }
}

/**
 * Reset all instances
 */
export function resetAllAmbientAwareness(): void {
  sessionInstances.clear();
}

