/**
 * Volume Dynamics Tracking
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks volume changes within and across utterances.
 * Getting quieter on vulnerable topics is deeply human.
 * Getting louder often indicates passion, frustration, or emphasis.
 *
 * Humans naturally notice these volume shifts and adjust their own
 * energy accordingly. This module gives Ferni that awareness.
 *
 * @module VolumeDynamics
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'VolumeDynamics' });

// ============================================================================
// TYPES
// ============================================================================

export type VolumeTrend = 'getting_quieter' | 'getting_louder' | 'stable' | 'fluctuating';

export type VolumeLevel = 'whisper' | 'soft' | 'normal' | 'loud' | 'very_loud';

export interface VolumeObservation {
  timestamp: number;
  /** Average volume level (dB, typically -60 to 0) */
  averageDb: number;
  /** Peak volume level */
  peakDb: number;
  /** Volume at start of utterance */
  startDb: number;
  /** Volume at end of utterance */
  endDb: number;
  /** Variance in volume */
  variance: number;
  /** Associated text (for context) */
  textSnippet?: string;
}

export interface VolumeDynamicsState {
  /** User's baseline volume (learned) */
  baseline: number;

  /** Current volume relative to baseline (ratio) */
  currentRelativeVolume: number;

  /** Current volume level category */
  currentLevel: VolumeLevel;

  /** Trend within current utterance */
  withinUtteranceTrend: VolumeTrend;

  /** Trend across recent utterances */
  acrossUtterancesTrend: VolumeTrend;

  /** Is user on a sensitive topic (based on volume drop)? */
  onSensitiveTopic: boolean;

  /** Is user becoming more passionate/frustrated? */
  intensityIncreasing: boolean;

  /** Interpretation of current dynamics */
  interpretation: string;

  /** Suggested agent volume adjustment */
  suggestedAgentVolume: 'softer' | 'match' | 'normal';

  /** Confidence in assessment (0-1) */
  confidence: number;
}

export interface VolumePattern {
  /** Pattern type */
  type: 'vulnerability_drop' | 'passion_rise' | 'fade_out' | 'attention_seeking' | 'normal';
  /** How strongly this pattern is present */
  strength: number;
  /** What to notice */
  observation: string;
}

// ============================================================================
// VOLUME DYNAMICS TRACKER
// ============================================================================

export class VolumeDynamicsTracker {
  private observations: VolumeObservation[] = [];
  private readonly maxObservations = 20;
  private baseline: number | null = null;
  private calibrationSamples = 0;

  constructor() {
    log.debug('VolumeDynamicsTracker initialized');
  }

  /**
   * Record a volume observation from audio analysis
   */
  recordObservation(observation: Omit<VolumeObservation, 'timestamp'>): VolumeDynamicsState {
    const obs: VolumeObservation = {
      ...observation,
      timestamp: Date.now(),
    };

    this.observations.push(obs);

    // Keep only recent observations
    if (this.observations.length > this.maxObservations) {
      this.observations.shift();
    }

    // Update baseline during calibration
    this.updateBaseline(obs);

    return this.computeState();
  }

  /**
   * Record observation from raw audio samples
   */
  recordFromAudioSamples(
    samples: Float32Array,
    sampleRate: number,
    textSnippet?: string
  ): VolumeDynamicsState {
    const analysis = this.analyzeAudioSamples(samples, sampleRate);
    return this.recordObservation({
      ...analysis,
      textSnippet,
    });
  }

  /**
   * Get current state without new observation
   */
  getCurrentState(): VolumeDynamicsState {
    return this.computeState();
  }

  /**
   * Detect specific volume patterns
   */
  detectPatterns(): VolumePattern[] {
    const patterns: VolumePattern[] = [];
    const state = this.computeState();

    // Vulnerability drop: getting significantly quieter
    if (state.acrossUtterancesTrend === 'getting_quieter' && state.currentRelativeVolume < 0.7) {
      patterns.push({
        type: 'vulnerability_drop',
        strength: 1 - state.currentRelativeVolume,
        observation: 'Voice getting quieter - may be approaching vulnerable content',
      });
    }

    // Passion rise: getting significantly louder
    if (state.acrossUtterancesTrend === 'getting_louder' && state.currentRelativeVolume > 1.3) {
      patterns.push({
        type: 'passion_rise',
        strength: state.currentRelativeVolume - 1,
        observation: 'Voice getting louder - increased emotion or passion',
      });
    }

    // Fade out: volume dropping at end of utterances
    if (this.observations.length >= 3) {
      const recent = this.observations.slice(-3);
      const avgFade = recent.reduce((sum, o) => sum + (o.startDb - o.endDb), 0) / recent.length;
      if (avgFade > 5) {
        patterns.push({
          type: 'fade_out',
          strength: Math.min(1, avgFade / 15),
          observation: 'Voice trailing off at end of sentences - possible uncertainty or fatigue',
        });
      }
    }

    // Attention seeking: high variance, fluctuating
    if (state.withinUtteranceTrend === 'fluctuating') {
      const recent = this.observations.slice(-3);
      const avgVariance = recent.reduce((sum, o) => sum + o.variance, 0) / recent.length;
      if (avgVariance > 100) {
        patterns.push({
          type: 'attention_seeking',
          strength: Math.min(1, avgVariance / 200),
          observation: 'Highly dynamic volume - may be emphasizing or seeking attention',
        });
      }
    }

    if (patterns.length === 0) {
      patterns.push({
        type: 'normal',
        strength: 0,
        observation: 'Volume dynamics within normal range',
      });
    }

    return patterns;
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.observations = [];
    this.baseline = null;
    this.calibrationSamples = 0;
    log.debug('VolumeDynamicsTracker reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private analyzeAudioSamples(
    samples: Float32Array,
    sampleRate: number
  ): Omit<VolumeObservation, 'timestamp' | 'textSnippet'> {
    // Calculate RMS for different segments
    const segmentSize = Math.floor(samples.length / 4);

    const calculateRMS = (start: number, length: number): number => {
      let sum = 0;
      const end = Math.min(start + length, samples.length);
      for (let i = start; i < end; i++) {
        sum += samples[i] * samples[i];
      }
      const rms = Math.sqrt(sum / (end - start));
      // Convert to dB (reference: 1.0)
      return rms > 0 ? 20 * Math.log10(rms) : -60;
    };

    const startDb = calculateRMS(0, segmentSize);
    const endDb = calculateRMS(samples.length - segmentSize, segmentSize);
    const averageDb = calculateRMS(0, samples.length);

    // Find peak
    let peak = 0;
    for (const sample of samples) {
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -60;

    // Calculate variance
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((sum, s) => sum + (s - mean) ** 2, 0) / samples.length;

    return {
      averageDb,
      peakDb,
      startDb,
      endDb,
      variance,
    };
  }

  private updateBaseline(obs: VolumeObservation): void {
    // Use first 5 observations for baseline calibration
    if (this.calibrationSamples < 5) {
      if (this.baseline === null) {
        this.baseline = obs.averageDb;
      } else {
        // Exponential moving average
        this.baseline = this.baseline * 0.8 + obs.averageDb * 0.2;
      }
      this.calibrationSamples++;
    }
  }

  private computeState(): VolumeDynamicsState {
    if (this.observations.length === 0) {
      return this.getDefaultState();
    }

    const current = this.observations[this.observations.length - 1];
    const effectiveBaseline = this.baseline ?? current.averageDb;

    // Current relative volume
    const currentRelativeVolume = Math.pow(10, (current.averageDb - effectiveBaseline) / 20);

    // Current level category
    const currentLevel = this.categorizeVolume(current.averageDb);

    // Within utterance trend
    const withinUtteranceTrend = this.determineWithinUtteranceTrend(current);

    // Across utterances trend
    const acrossUtterancesTrend = this.determineAcrossUtterancesTrend();

    // Detect sensitive topic (significant quieting)
    const onSensitiveTopic =
      currentRelativeVolume < 0.7 && acrossUtterancesTrend === 'getting_quieter';

    // Detect intensity increase
    const intensityIncreasing =
      currentRelativeVolume > 1.2 && acrossUtterancesTrend === 'getting_louder';

    // Generate interpretation
    const interpretation = this.generateInterpretation(
      currentLevel,
      acrossUtterancesTrend,
      onSensitiveTopic,
      intensityIncreasing
    );

    // Suggested agent volume
    let suggestedAgentVolume: 'softer' | 'match' | 'normal' = 'normal';
    if (onSensitiveTopic || currentLevel === 'soft' || currentLevel === 'whisper') {
      suggestedAgentVolume = 'softer';
    } else if (currentLevel === 'loud' || currentLevel === 'very_loud') {
      suggestedAgentVolume = 'match';
    }

    // Confidence based on observation count and calibration
    const confidence =
      Math.min(1, this.observations.length / 5) * (this.calibrationSamples >= 5 ? 1 : 0.7);

    const state: VolumeDynamicsState = {
      baseline: effectiveBaseline,
      currentRelativeVolume,
      currentLevel,
      withinUtteranceTrend,
      acrossUtterancesTrend,
      onSensitiveTopic,
      intensityIncreasing,
      interpretation,
      suggestedAgentVolume,
      confidence,
    };

    if (onSensitiveTopic || intensityIncreasing) {
      log.debug(
        {
          level: currentLevel,
          relative: currentRelativeVolume.toFixed(2),
          onSensitiveTopic,
          intensityIncreasing,
        },
        '🔊 Volume dynamics shift detected'
      );
    }

    return state;
  }

  private categorizeVolume(db: number): VolumeLevel {
    if (db < -45) return 'whisper';
    if (db < -35) return 'soft';
    if (db < -20) return 'normal';
    if (db < -10) return 'loud';
    return 'very_loud';
  }

  private determineWithinUtteranceTrend(obs: VolumeObservation): VolumeTrend {
    const diff = obs.endDb - obs.startDb;

    if (Math.abs(diff) < 3) {
      return obs.variance > 100 ? 'fluctuating' : 'stable';
    }
    return diff > 0 ? 'getting_louder' : 'getting_quieter';
  }

  private determineAcrossUtterancesTrend(): VolumeTrend {
    if (this.observations.length < 3) return 'stable';

    const recent = this.observations.slice(-5);
    const volumes = recent.map((o) => o.averageDb);

    // Calculate trend using simple linear regression
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    for (let i = 0; i < volumes.length; i++) {
      sumX += i;
      sumY += volumes[i];
      sumXY += i * volumes[i];
      sumX2 += i * i;
    }
    const n = volumes.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Calculate variance to detect fluctuation
    const mean = sumY / n;
    const variance = volumes.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;

    if (variance > 50) return 'fluctuating';
    if (Math.abs(slope) < 1) return 'stable';
    return slope > 0 ? 'getting_louder' : 'getting_quieter';
  }

  private generateInterpretation(
    level: VolumeLevel,
    trend: VolumeTrend,
    onSensitive: boolean,
    intensityIncreasing: boolean
  ): string {
    if (onSensitive) {
      return 'Voice has gotten notably quieter - may be approaching vulnerable or difficult content.';
    }

    if (intensityIncreasing) {
      return 'Voice volume increasing - heightened emotion, passion, or frustration.';
    }

    if (level === 'whisper' || level === 'soft') {
      return 'User speaking softly - content may be personal or sensitive.';
    }

    if (level === 'loud' || level === 'very_loud') {
      return 'User speaking loudly - may indicate strong feelings or enthusiasm.';
    }

    if (trend === 'fluctuating') {
      return 'Volume varying significantly - user may be emphasizing certain points.';
    }

    return 'Volume dynamics within normal conversational range.';
  }

  private getDefaultState(): VolumeDynamicsState {
    return {
      baseline: -25,
      currentRelativeVolume: 1,
      currentLevel: 'normal',
      withinUtteranceTrend: 'stable',
      acrossUtterancesTrend: 'stable',
      onSensitiveTopic: false,
      intensityIncreasing: false,
      interpretation: 'Insufficient data for volume analysis.',
      suggestedAgentVolume: 'normal',
      confidence: 0,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import {
  createSessionRegistry,
  registerGlobalRegistry,
} from '../utils/session-registry.js';

const volumeDynamicsRegistry = createSessionRegistry(
  (sessionId: string) => new VolumeDynamicsTracker(),
  { name: 'VolumeDynamics', cleanup: (tracker) => tracker.reset(), verbose: false }
);

registerGlobalRegistry(volumeDynamicsRegistry);

export function getVolumeDynamicsTracker(sessionId: string): VolumeDynamicsTracker {
  return volumeDynamicsRegistry.get(sessionId);
}

export function resetVolumeDynamicsTracker(sessionId: string): void {
  volumeDynamicsRegistry.reset(sessionId);
}

export function resetAllVolumeDynamicsTrackers(): void {
  volumeDynamicsRegistry.resetAll();
}

export function getActiveVolumeDynamicsCount(): number {
  return volumeDynamicsRegistry.getActiveCount();
}

export default VolumeDynamicsTracker;
