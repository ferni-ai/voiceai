/**
 * Energy Fade Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects when voice energy trails off at the end of sentences.
 * This often signals:
 * - Losing confidence in what they're saying
 * - Realizing something painful mid-thought
 * - Wanting to stop but feeling obligated to continue
 * - Uncertainty about how the listener will react
 *
 * Real humans notice when someone's voice "deflates" at the end of a thought.
 * This module gives Ferni that awareness.
 *
 * @module EnergyDynamics
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'EnergyDynamics' });

// ============================================================================
// TYPES
// ============================================================================

export type EnergyTrajectory = 'steady' | 'fading' | 'building' | 'fluctuating';

export type EnergyFadeReason =
  | 'fatigue' // General tiredness
  | 'discouragement' // Giving up on the point
  | 'realization' // Realizing something difficult
  | 'discomfort' // Uncomfortable with topic
  | 'uncertainty' // Unsure if should continue
  | 'sadness' // Emotional weight
  | 'unknown';

export interface EnergySegment {
  /** Relative position in utterance (0-1) */
  position: number;
  /** Energy level (normalized 0-1) */
  energy: number;
  /** Speech rate in this segment */
  speechRate: number;
}

export interface EnergyFadeEvent {
  timestamp: number;
  /** How much energy dropped (0-1) */
  dropMagnitude: number;
  /** Position where fade began (0-1 through utterance) */
  fadeStartPosition: number;
  /** Text at fade point (if available) */
  textAtFade?: string;
  /** Likely reason for fade */
  likelyReason: EnergyFadeReason;
}

export interface EnergyDynamicsResult {
  /** Energy trajectory within this utterance */
  withinUtterance: EnergyTrajectory;

  /** Energy trajectory across session */
  acrossSession: 'increasing' | 'decreasing' | 'stable';

  /** Segments within the utterance */
  segments: EnergySegment[];

  /** Energy at start vs end */
  startEnergy: number;
  endEnergy: number;

  /** Did a fade occur? */
  fadeDetected: boolean;

  /** Fade details if detected */
  fadeEvent?: EnergyFadeEvent;

  /** What the fade might indicate */
  fadeIndicates: EnergyFadeReason;

  /** Interpretation */
  interpretation: string;

  /** Agent guidance */
  guidance: string;

  /** Confidence (0-1) */
  confidence: number;
}

// ============================================================================
// ENERGY DYNAMICS TRACKER
// ============================================================================

export class EnergyDynamicsTracker {
  private sessionHistory: Array<{ timestamp: number; avgEnergy: number }> = [];
  private fadeHistory: EnergyFadeEvent[] = [];
  private readonly maxHistory = 30;

  constructor() {
    log.debug('EnergyDynamicsTracker initialized');
  }

  /**
   * Analyze energy dynamics from audio segments
   */
  analyzeFromSegments(segments: EnergySegment[], text?: string): EnergyDynamicsResult {
    if (segments.length < 2) {
      return this.getDefaultResult();
    }

    // Calculate start and end energy
    const firstQuarter = segments.slice(0, Math.ceil(segments.length / 4));
    const lastQuarter = segments.slice(-Math.ceil(segments.length / 4));

    const startEnergy = firstQuarter.reduce((sum, s) => sum + s.energy, 0) / firstQuarter.length;
    const endEnergy = lastQuarter.reduce((sum, s) => sum + s.energy, 0) / lastQuarter.length;

    // Determine trajectory
    const withinUtterance = this.determineTrajectory(segments, startEnergy, endEnergy);

    // Detect fade
    const fadeResult = this.detectFade(segments, text);

    // Update session history
    const avgEnergy = segments.reduce((sum, s) => sum + s.energy, 0) / segments.length;
    this.sessionHistory.push({ timestamp: Date.now(), avgEnergy });
    if (this.sessionHistory.length > this.maxHistory) {
      this.sessionHistory.shift();
    }

    // Across session trajectory
    const acrossSession = this.computeSessionTrend();

    // Store fade event
    if (fadeResult.detected && fadeResult.event) {
      this.fadeHistory.push(fadeResult.event);
      if (this.fadeHistory.length > 20) {
        this.fadeHistory.shift();
      }
    }

    // Generate interpretation
    const interpretation = this.generateInterpretation(withinUtterance, fadeResult, acrossSession);

    // Generate guidance
    const guidance = this.generateGuidance(withinUtterance, fadeResult.detected, acrossSession);

    const result: EnergyDynamicsResult = {
      withinUtterance,
      acrossSession,
      segments,
      startEnergy,
      endEnergy,
      fadeDetected: fadeResult.detected,
      fadeEvent: fadeResult.event,
      fadeIndicates: fadeResult.reason,
      interpretation,
      guidance,
      confidence: Math.min(1, segments.length / 5),
    };

    if (fadeResult.detected) {
      log.debug(
        {
          drop: fadeResult.event?.dropMagnitude.toFixed(2),
          reason: fadeResult.reason,
        },
        '📉 Energy fade detected'
      );
    }

    return result;
  }

  /**
   * Analyze from raw audio samples
   */
  analyzeFromAudio(samples: Float32Array, sampleRate: number, text?: string): EnergyDynamicsResult {
    const segments = this.extractSegments(samples, sampleRate);
    return this.analyzeFromSegments(segments, text);
  }

  /**
   * Get recent fade patterns
   */
  getFadePatterns(): {
    frequency: 'rare' | 'occasional' | 'frequent';
    avgMagnitude: number;
    commonReasons: EnergyFadeReason[];
  } {
    if (this.fadeHistory.length < 3) {
      return { frequency: 'rare', avgMagnitude: 0, commonReasons: [] };
    }

    // Frequency relative to session history
    const ratio = this.fadeHistory.length / Math.max(1, this.sessionHistory.length);
    let frequency: 'rare' | 'occasional' | 'frequent';
    if (ratio < 0.2) frequency = 'rare';
    else if (ratio < 0.5) frequency = 'occasional';
    else frequency = 'frequent';

    // Average magnitude
    const avgMagnitude =
      this.fadeHistory.reduce((sum, f) => sum + f.dropMagnitude, 0) / this.fadeHistory.length;

    // Common reasons
    const reasonCounts = new Map<EnergyFadeReason, number>();
    for (const f of this.fadeHistory) {
      reasonCounts.set(f.likelyReason, (reasonCounts.get(f.likelyReason) || 0) + 1);
    }
    const commonReasons = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([reason]) => reason);

    return { frequency, avgMagnitude, commonReasons };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.sessionHistory = [];
    this.fadeHistory = [];
    log.debug('EnergyDynamicsTracker reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private extractSegments(samples: Float32Array, sampleRate: number): EnergySegment[] {
    const segmentDurationMs = 200; // 200ms segments
    const samplesPerSegment = Math.floor((sampleRate * segmentDurationMs) / 1000);
    const numSegments = Math.floor(samples.length / samplesPerSegment);

    if (numSegments < 2) return [];

    const segments: EnergySegment[] = [];

    for (let i = 0; i < numSegments; i++) {
      const start = i * samplesPerSegment;
      const end = start + samplesPerSegment;
      const segment = samples.slice(start, end);

      // Calculate RMS energy
      let sum = 0;
      for (const sample of segment) {
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / segment.length);

      // Estimate speech rate from zero crossings
      let zeroCrossings = 0;
      for (let j = 1; j < segment.length; j++) {
        if (Math.sign(segment[j]) !== Math.sign(segment[j - 1])) {
          zeroCrossings++;
        }
      }
      const speechRate = (zeroCrossings / segment.length) * sampleRate;

      segments.push({
        position: i / numSegments,
        energy: Math.min(1, rms * 10), // Normalize
        speechRate,
      });
    }

    return segments;
  }

  private determineTrajectory(
    segments: EnergySegment[],
    startEnergy: number,
    endEnergy: number
  ): EnergyTrajectory {
    const diff = endEnergy - startEnergy;

    // Calculate variance to detect fluctuation
    const avg = segments.reduce((sum, s) => sum + s.energy, 0) / segments.length;
    const variance = segments.reduce((sum, s) => sum + (s.energy - avg) ** 2, 0) / segments.length;

    if (variance > 0.05) {
      return 'fluctuating';
    }

    if (diff < -0.15) {
      return 'fading';
    }

    if (diff > 0.15) {
      return 'building';
    }

    return 'steady';
  }

  private detectFade(
    segments: EnergySegment[],
    text?: string
  ): { detected: boolean; event?: EnergyFadeEvent; reason: EnergyFadeReason } {
    if (segments.length < 3) {
      return { detected: false, reason: 'unknown' };
    }

    // Look for significant drop in the latter portion
    const midpoint = Math.floor(segments.length / 2);
    const latterHalf = segments.slice(midpoint);

    // Find the steepest drop
    let maxDrop = 0;
    let dropStartIdx = 0;

    for (let i = 0; i < latterHalf.length - 1; i++) {
      const drop = latterHalf[i].energy - latterHalf[i + 1].energy;
      if (drop > maxDrop) {
        maxDrop = drop;
        dropStartIdx = midpoint + i;
      }
    }

    // Check if the ending is significantly lower than peak
    const peakEnergy = Math.max(...segments.map((s) => s.energy));
    const endEnergy = segments[segments.length - 1].energy;
    const dropFromPeak = peakEnergy - endEnergy;

    // Significant fade = drop of 20%+ from peak
    const fadeDetected = dropFromPeak > 0.2;

    if (!fadeDetected) {
      return { detected: false, reason: 'unknown' };
    }

    // Infer reason based on text patterns and fade characteristics
    const reason = this.inferFadeReason(text, dropFromPeak, dropStartIdx / segments.length);

    // Extract text at fade point
    let textAtFade: string | undefined;
    if (text) {
      const words = text.split(/\s+/);
      const fadeWordIdx = Math.floor((dropStartIdx / segments.length) * words.length);
      textAtFade = words.slice(Math.max(0, fadeWordIdx - 2), fadeWordIdx + 3).join(' ');
    }

    const event: EnergyFadeEvent = {
      timestamp: Date.now(),
      dropMagnitude: dropFromPeak,
      fadeStartPosition: dropStartIdx / segments.length,
      textAtFade,
      likelyReason: reason,
    };

    return { detected: true, event, reason };
  }

  private inferFadeReason(
    text: string | undefined,
    dropMagnitude: number,
    fadePosition: number
  ): EnergyFadeReason {
    if (!text) {
      return dropMagnitude > 0.4 ? 'discouragement' : 'unknown';
    }

    const lower = text.toLowerCase();

    // Sadness indicators
    if (/\b(sad|miss|lost|gone|never|anymore|died|death)\b/.test(lower)) {
      return 'sadness';
    }

    // Discomfort indicators
    if (/\b(uncomfortable|awkward|embarrass|ashamed|weird)\b/.test(lower)) {
      return 'discomfort';
    }

    // Uncertainty indicators
    if (/\b(maybe|I guess|I don't know|not sure|probably)\b/.test(lower)) {
      return 'uncertainty';
    }

    // Realization indicators (often mid-sentence fade)
    if (fadePosition < 0.7 && /\b(realize|just hit me|oh|wait)\b/.test(lower)) {
      return 'realization';
    }

    // Discouragement (late fade, giving up on point)
    if (fadePosition > 0.7) {
      return 'discouragement';
    }

    // Fatigue (gradual fade)
    if (dropMagnitude < 0.3 && fadePosition > 0.5) {
      return 'fatigue';
    }

    return 'unknown';
  }

  private computeSessionTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.sessionHistory.length < 3) {
      return 'stable';
    }

    const recent = this.sessionHistory.slice(-Math.min(10, this.sessionHistory.length));
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));

    const firstAvg = firstHalf.reduce((sum, h) => sum + h.avgEnergy, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, h) => sum + h.avgEnergy, 0) / secondHalf.length;

    if (secondAvg > firstAvg + 0.1) return 'increasing';
    if (secondAvg < firstAvg - 0.1) return 'decreasing';
    return 'stable';
  }

  private generateInterpretation(
    trajectory: EnergyTrajectory,
    fadeResult: { detected: boolean; reason: EnergyFadeReason },
    sessionTrend: string
  ): string {
    if (fadeResult.detected) {
      const reasonDescriptions: Record<EnergyFadeReason, string> = {
        fatigue: 'Voice trailing off - may be tired or running out of steam.',
        discouragement:
          'Energy dropped at the end - may be giving up on the point or feeling unheard.',
        realization: 'Voice dropped suddenly - may be realizing something difficult.',
        discomfort: 'Voice got quieter - approaching uncomfortable territory.',
        uncertainty: 'Voice fading - uncertain about continuing or how this will be received.',
        sadness: 'Voice becoming softer - emotional weight coming through.',
        unknown: 'Voice energy fading at the end of thought.',
      };
      return reasonDescriptions[fadeResult.reason];
    }

    if (trajectory === 'fading' && sessionTrend === 'decreasing') {
      return 'Overall energy declining through conversation - may need a shift.';
    }

    if (trajectory === 'building') {
      return 'Energy increasing - becoming more passionate or animated about this topic.';
    }

    return 'Energy dynamics within normal range.';
  }

  private generateGuidance(
    trajectory: EnergyTrajectory,
    fadeDetected: boolean,
    sessionTrend: string
  ): string {
    if (fadeDetected) {
      return 'Voice is fading - acknowledge what they said and give space. Consider reflecting back what you heard.';
    }

    if (trajectory === 'fading' && sessionTrend === 'decreasing') {
      return 'Energy declining - may need engagement, change of topic, or acknowledgment that this is hard.';
    }

    if (trajectory === 'building') {
      return 'Match their building energy - this is something they care about.';
    }

    return 'Continue conversing naturally.';
  }

  private getDefaultResult(): EnergyDynamicsResult {
    return {
      withinUtterance: 'steady',
      acrossSession: 'stable',
      segments: [],
      startEnergy: 0.5,
      endEnergy: 0.5,
      fadeDetected: false,
      fadeIndicates: 'unknown',
      interpretation: 'Insufficient audio data for energy analysis.',
      guidance: 'Continue normally.',
      confidence: 0,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const instances = new Map<string, EnergyDynamicsTracker>();

export function getEnergyDynamicsTracker(sessionId: string): EnergyDynamicsTracker {
  if (!instances.has(sessionId)) {
    instances.set(sessionId, new EnergyDynamicsTracker());
  }
  return instances.get(sessionId)!;
}

export function resetEnergyDynamicsTracker(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.reset();
    instances.delete(sessionId);
  }
}

export function resetAllEnergyDynamicsTrackers(): void {
  instances.clear();
}

export default EnergyDynamicsTracker;
