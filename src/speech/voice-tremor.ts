/**
 * Voice Tremor / Strain Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects voice tremor and strain that indicate:
 * - Held-back tears
 * - Suppressed emotion
 * - Nervousness or anxiety
 * - Physical or emotional strain
 *
 * When someone's voice wavers, cracks, or strains, it reveals
 * emotion that words alone don't convey. Real humans notice this.
 * This module gives Ferni that sensitivity.
 *
 * @module VoiceTremor
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'VoiceTremor' });

// ============================================================================
// TYPES
// ============================================================================

export type TremorType =
  | 'tremor' // Regular wavering
  | 'strain' // Vocal strain/tightness
  | 'crack' // Voice cracking
  | 'quiver' // Emotional quiver
  | 'wobble' // Unstable pitch
  | 'none';

export type TremorIntensity = 'subtle' | 'noticeable' | 'pronounced';

export interface TremorEvent {
  /** Type of tremor */
  type: TremorType;

  /** Intensity */
  intensity: TremorIntensity;

  /** Position in audio (0-1) */
  position: number;

  /** Duration (ms) */
  durationMs: number;

  /** Frequency of tremor (Hz, for tremor/wobble types) */
  tremorFrequency?: number;

  /** Confidence (0-1) */
  confidence: number;
}

export interface VoiceTremorResult {
  /** Was tremor/strain detected? */
  detected: boolean;

  /** Primary type detected */
  primaryType: TremorType;

  /** Intensity level */
  intensity: TremorIntensity;

  /** All tremor events */
  events: TremorEvent[];

  /** What this likely indicates */
  emotionalIndicator: string;

  /** Is user possibly holding back tears? */
  possibleTears: boolean;

  /** Is user possibly anxious? */
  possibleAnxiety: boolean;

  /** Suggested response approach */
  suggestedResponse: string;

  /** Overall confidence (0-1) */
  confidence: number;
}

export interface VoiceStabilityProfile {
  /** Pitch stability (0-1, higher = more stable) */
  pitchStability: number;

  /** Volume stability (0-1) */
  volumeStability: number;

  /** Overall stability */
  overallStability: 'stable' | 'slightly_unstable' | 'unstable' | 'very_unstable';

  /** Trending direction */
  stabilityTrend: 'improving' | 'declining' | 'stable';
}

// ============================================================================
// TREMOR DETECTION THRESHOLDS
// ============================================================================

const TREMOR_THRESHOLDS = {
  /** Minimum pitch variance (Hz) to consider tremor */
  MIN_PITCH_VARIANCE: 8,

  /** Tremor frequency range (4-8 Hz is typical emotional tremor) */
  TREMOR_FREQ_MIN: 4,
  TREMOR_FREQ_MAX: 10,

  /** Minimum instances to confirm pattern */
  MIN_INSTANCES: 2,

  /** Voice crack detection - sudden pitch jump threshold (semitones) */
  CRACK_PITCH_JUMP: 5,

  /** Strain detection - high pitch with low energy */
  STRAIN_PITCH_THRESHOLD: 250,
  STRAIN_ENERGY_RATIO: 0.7,
};

// ============================================================================
// VOICE TREMOR DETECTOR
// ============================================================================

export class VoiceTremorDetector {
  private history: TremorEvent[] = [];
  private stabilityHistory: number[] = [];
  private readonly maxHistory = 20;

  constructor() {
    log.debug('VoiceTremorDetector initialized');
  }

  /**
   * Analyze audio for voice tremor/strain
   */
  analyzeAudio(samples: Float32Array, sampleRate: number): VoiceTremorResult {
    const events = this.detectTremorEvents(samples, sampleRate);

    // Update history
    this.history.push(...events);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    // Determine primary type and intensity
    const { primaryType, intensity } = this.aggregateEvents(events);

    // Detect specific emotional indicators
    const possibleTears = this.detectPossibleTears(events);
    const possibleAnxiety = this.detectPossibleAnxiety(events);

    // Generate interpretation and response
    const emotionalIndicator = this.interpretEmotionalState(
      primaryType,
      intensity,
      possibleTears,
      possibleAnxiety
    );
    const suggestedResponse = this.generateResponse(primaryType, possibleTears, possibleAnxiety);

    // Confidence
    const confidence =
      events.length > 0 ? events.reduce((sum, e) => sum + e.confidence, 0) / events.length : 0.3;

    const result: VoiceTremorResult = {
      detected: events.length > 0 && primaryType !== 'none',
      primaryType,
      intensity,
      events,
      emotionalIndicator,
      possibleTears,
      possibleAnxiety,
      suggestedResponse,
      confidence,
    };

    if (result.detected) {
      log.debug(
        {
          type: primaryType,
          intensity,
          possibleTears,
          possibleAnxiety,
        },
        '🎭 Voice tremor/strain detected'
      );
    }

    return result;
  }

  /**
   * Get voice stability profile
   */
  getStabilityProfile(): VoiceStabilityProfile {
    if (this.stabilityHistory.length < 3) {
      return {
        pitchStability: 0.8,
        volumeStability: 0.8,
        overallStability: 'stable',
        stabilityTrend: 'stable',
      };
    }

    const recent = this.stabilityHistory.slice(-5);
    const avgStability = recent.reduce((a, b) => a + b, 0) / recent.length;

    // Determine overall stability category
    let overallStability: VoiceStabilityProfile['overallStability'];
    if (avgStability > 0.8) overallStability = 'stable';
    else if (avgStability > 0.6) overallStability = 'slightly_unstable';
    else if (avgStability > 0.4) overallStability = 'unstable';
    else overallStability = 'very_unstable';

    // Determine trend
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    let stabilityTrend: VoiceStabilityProfile['stabilityTrend'];
    if (secondAvg > firstAvg + 0.1) stabilityTrend = 'improving';
    else if (secondAvg < firstAvg - 0.1) stabilityTrend = 'declining';
    else stabilityTrend = 'stable';

    return {
      pitchStability: avgStability,
      volumeStability: avgStability * 0.95, // Approximation
      overallStability,
      stabilityTrend,
    };
  }

  /**
   * Reset detector
   */
  reset(): void {
    this.history = [];
    this.stabilityHistory = [];
    log.debug('VoiceTremorDetector reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private detectTremorEvents(samples: Float32Array, sampleRate: number): TremorEvent[] {
    const events: TremorEvent[] = [];
    const frameSize = Math.floor(sampleRate * 0.03); // 30ms frames
    const hopSize = Math.floor(frameSize / 2);

    // Extract pitch for each frame using autocorrelation
    const pitches: number[] = [];
    const energies: number[] = [];

    for (let i = 0; i < samples.length - frameSize; i += hopSize) {
      const frame = samples.slice(i, i + frameSize);

      // Simple autocorrelation pitch detection
      let maxCorr = 0;
      let bestLag = 0;
      for (let lag = 20; lag < frameSize / 2; lag++) {
        let corr = 0;
        for (let j = 0; j < frameSize - lag; j++) {
          corr += frame[j] * frame[j + lag];
        }
        if (corr > maxCorr) {
          maxCorr = corr;
          bestLag = lag;
        }
      }
      const pitch = bestLag > 0 ? sampleRate / bestLag : 0;
      pitches.push(pitch);

      // Energy
      let energy = 0;
      for (const sample of frame) {
        energy += sample * sample;
      }
      energies.push(Math.sqrt(energy / frame.length));
    }

    if (pitches.length < 10) return events;

    // Analyze pitch stability
    let totalStability = 0;
    let stabilityCount = 0;

    // Look for tremor patterns
    for (let i = 3; i < pitches.length - 3; i++) {
      const window = pitches.slice(i - 3, i + 4);
      const validPitches = window.filter((p) => p > 50 && p < 500);

      if (validPitches.length < 4) continue;

      // Calculate variance
      const mean = validPitches.reduce((a, b) => a + b, 0) / validPitches.length;
      const variance =
        validPitches.reduce((sum, p) => sum + (p - mean) ** 2, 0) / validPitches.length;
      const stdDev = Math.sqrt(variance);

      // Track stability
      const frameStability = Math.max(0, 1 - stdDev / 50);
      totalStability += frameStability;
      stabilityCount++;

      // Detect tremor (regular pitch oscillation)
      if (stdDev > TREMOR_THRESHOLDS.MIN_PITCH_VARIANCE) {
        // Check for oscillation pattern
        const oscillations = this.countOscillations(validPitches);
        const tremorFreq = (oscillations / (window.length / (sampleRate / hopSize))) * 1000;

        if (
          tremorFreq >= TREMOR_THRESHOLDS.TREMOR_FREQ_MIN &&
          tremorFreq <= TREMOR_THRESHOLDS.TREMOR_FREQ_MAX
        ) {
          events.push({
            type: 'tremor',
            intensity: stdDev > 20 ? 'pronounced' : stdDev > 12 ? 'noticeable' : 'subtle',
            position: i / pitches.length,
            durationMs: ((window.length * hopSize) / sampleRate) * 1000,
            tremorFrequency: tremorFreq,
            confidence: Math.min(0.9, 0.5 + oscillations * 0.1),
          });
          i += 3; // Skip ahead
          continue;
        }

        // Check for quiver (irregular pitch variation)
        if (stdDev > 15) {
          events.push({
            type: 'quiver',
            intensity: stdDev > 25 ? 'pronounced' : stdDev > 18 ? 'noticeable' : 'subtle',
            position: i / pitches.length,
            durationMs: ((window.length * hopSize) / sampleRate) * 1000,
            confidence: 0.6,
          });
          i += 3;
          continue;
        }
      }

      // Detect voice crack (sudden pitch jump)
      const prevPitch = pitches[i - 1];
      const currPitch = pitches[i];
      if (prevPitch > 0 && currPitch > 0) {
        const semitones = 12 * Math.log2(currPitch / prevPitch);
        if (Math.abs(semitones) > TREMOR_THRESHOLDS.CRACK_PITCH_JUMP) {
          events.push({
            type: 'crack',
            intensity: Math.abs(semitones) > 8 ? 'pronounced' : 'noticeable',
            position: i / pitches.length,
            durationMs: (hopSize / sampleRate) * 1000,
            confidence: 0.7,
          });
          continue;
        }
      }

      // Detect strain (high pitch with relatively low energy)
      const avgEnergy = energies.slice(i - 2, i + 3).reduce((a, b) => a + b, 0) / 5;
      const maxEnergy = Math.max(...energies);
      const energyRatio = avgEnergy / (maxEnergy || 1);

      if (
        mean > TREMOR_THRESHOLDS.STRAIN_PITCH_THRESHOLD &&
        energyRatio < TREMOR_THRESHOLDS.STRAIN_ENERGY_RATIO
      ) {
        events.push({
          type: 'strain',
          intensity: energyRatio < 0.5 ? 'pronounced' : 'noticeable',
          position: i / pitches.length,
          durationMs: ((3 * hopSize) / sampleRate) * 1000,
          confidence: 0.55,
        });
        i += 2;
      }
    }

    // Update stability history
    if (stabilityCount > 0) {
      this.stabilityHistory.push(totalStability / stabilityCount);
      if (this.stabilityHistory.length > this.maxHistory) {
        this.stabilityHistory.shift();
      }
    }

    return events;
  }

  private countOscillations(pitches: number[]): number {
    let oscillations = 0;
    let direction = 0; // 1 = up, -1 = down, 0 = flat

    for (let i = 1; i < pitches.length; i++) {
      const diff = pitches[i] - pitches[i - 1];
      const newDirection = diff > 2 ? 1 : diff < -2 ? -1 : 0;

      if (newDirection !== 0 && newDirection !== direction) {
        oscillations++;
        direction = newDirection;
      }
    }

    return oscillations;
  }

  private aggregateEvents(events: TremorEvent[]): {
    primaryType: TremorType;
    intensity: TremorIntensity;
  } {
    if (events.length === 0) {
      return { primaryType: 'none', intensity: 'subtle' };
    }

    // Count by type
    const typeCounts = new Map<TremorType, number>();
    const intensityCounts = new Map<TremorIntensity, number>();

    for (const e of events) {
      typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
      intensityCounts.set(e.intensity, (intensityCounts.get(e.intensity) || 0) + 1);
    }

    // Get dominant type
    let primaryType: TremorType = 'none';
    let maxCount = 0;
    typeCounts.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        primaryType = type;
      }
    });

    // Get dominant intensity (or highest if tie)
    let intensity: TremorIntensity = 'subtle';
    if (intensityCounts.get('pronounced')! >= 1) intensity = 'pronounced';
    else if (intensityCounts.get('noticeable')! >= 2) intensity = 'noticeable';
    else if (intensityCounts.get('noticeable')! >= 1) intensity = 'noticeable';

    return { primaryType, intensity };
  }

  private detectPossibleTears(events: TremorEvent[]): boolean {
    // Indicators: quiver, tremor, crack patterns
    const quivers = events.filter((e) => e.type === 'quiver').length;
    const cracks = events.filter((e) => e.type === 'crack').length;
    const tremors = events.filter((e) => e.type === 'tremor' && e.intensity !== 'subtle').length;

    return quivers >= 2 || (cracks >= 1 && (quivers >= 1 || tremors >= 1));
  }

  private detectPossibleAnxiety(events: TremorEvent[]): boolean {
    // Indicators: high-frequency tremor, strain
    const highFreqTremors = events.filter(
      (e) => e.type === 'tremor' && e.tremorFrequency && e.tremorFrequency > 6
    ).length;
    const strains = events.filter((e) => e.type === 'strain').length;

    return highFreqTremors >= 2 || strains >= 2 || (highFreqTremors >= 1 && strains >= 1);
  }

  private interpretEmotionalState(
    type: TremorType,
    intensity: TremorIntensity,
    tears: boolean,
    anxiety: boolean
  ): string {
    if (tears) {
      return 'Voice shows signs of held-back tears or strong emotion being suppressed.';
    }

    if (anxiety) {
      return 'Voice shows signs of nervousness or anxiety.';
    }

    const interpretations: Record<TremorType, string> = {
      tremor: 'Voice wavering detected - possible nervousness or emotional content.',
      strain: 'Vocal strain detected - user may be struggling to maintain composure.',
      crack: 'Voice cracked - strong emotion breaking through.',
      quiver: 'Voice quiver detected - emotional content being processed.',
      wobble: 'Pitch instability detected - possible uncertainty or distress.',
      none: 'Voice sounds stable.',
    };

    let base = interpretations[type];
    if (intensity === 'pronounced') {
      base += ' (pronounced)';
    }

    return base;
  }

  private generateResponse(type: TremorType, tears: boolean, anxiety: boolean): string {
    if (tears) {
      return "Voice suggests held-back emotion. Be gentle, slow down, and validate: 'I hear this is hard.'";
    }

    if (anxiety) {
      return 'Voice suggests nervousness. Be calm, reassuring, and give them space to breathe.';
    }

    const responses: Record<TremorType, string> = {
      tremor: "Voice is wavering - acknowledge what they're sharing and be present.",
      strain: 'Voice sounds strained - slow down and give them space.',
      crack: "Voice cracked - pause, acknowledge: 'Take your time, I'm here.'",
      quiver: 'Voice is unsteady - be gentle and validate their feelings.',
      wobble: 'Voice seems uncertain - provide reassurance and patience.',
      none: 'Continue conversing naturally.',
    };

    return responses[type];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const instances = new Map<string, VoiceTremorDetector>();

export function getVoiceTremorDetector(sessionId: string): VoiceTremorDetector {
  if (!instances.has(sessionId)) {
    instances.set(sessionId, new VoiceTremorDetector());
  }
  return instances.get(sessionId)!;
}

export function resetVoiceTremorDetector(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.reset();
    instances.delete(sessionId);
  }
}

export function resetAllVoiceTremorDetectors(): void {
  instances.clear();
}

export default VoiceTremorDetector;
