/**
 * Voice Print Learning
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Learn each user's unique vocal characteristics to detect subtle changes
 * they might not notice themselves. This enables truly personalized
 * emotional awareness—detecting when someone sounds "off" compared to
 * their personal baseline.
 *
 * **What we learn:**
 * - Baseline pitch, tempo, energy
 * - Emotional signatures (how their voice changes with emotions)
 * - Temporal patterns (morning voice vs evening)
 * - Speaking cadence and rhythm
 *
 * **What we detect:**
 * - Deviations from baseline (tired, stressed, excited)
 * - Session-to-session changes
 * - Gradual trends over time
 *
 * @module @ferni/humanization/voice-print
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'VoicePrint' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceBaseline {
  /** Average pitch in Hz */
  avgPitchHz: number;
  /** Pitch range [min, max] in Hz */
  pitchRangeHz: [number, number];
  /** Pitch variability (standard deviation) */
  pitchVariability: number;

  /** Average words per minute */
  avgWordsPerMinute: number;
  /** Pause frequency (pauses per minute) */
  pauseFrequency: number;
  /** Average pause duration in ms */
  avgPauseDuration: number;

  /** Average energy level (0-1) */
  avgEnergy: number;
  /** Energy variability */
  energyVariability: number;

  /** Voice quality metrics */
  breathiness: number;
  roughness: number;
  strain: number;
}

export interface VoiceDeviation {
  /** Hz change from baseline */
  pitchShift: number;
  /** WPM change */
  tempoChange: number;
  /** Energy change */
  energyChange: number;
  /** Quality changes */
  qualityChanges: {
    breathiness?: number;
    roughness?: number;
    strain?: number;
  };
  /** Confidence in this deviation measurement */
  confidence: number;
}

export interface EmotionalSignature {
  emotion: string;
  deviation: VoiceDeviation;
  sampleCount: number;
  confidence: number;
}

export interface VoicePrint {
  userId: string;

  /** Baseline characteristics */
  baseline: VoiceBaseline;

  /** Emotional signatures */
  emotionalSignatures: Map<string, EmotionalSignature>;

  /** Temporal patterns */
  temporalPatterns: {
    morningVoice?: Partial<VoiceBaseline>;
    eveningVoice?: Partial<VoiceBaseline>;
    weekdayVoice?: Partial<VoiceBaseline>;
    weekendVoice?: Partial<VoiceBaseline>;
  };

  /** Learning metadata */
  sampleCount: number;
  confidenceLevel: number;
  lastUpdated: Date;
  createdAt: Date;
}

export interface VoiceSnapshot {
  /** Pitch metrics */
  pitchMean: number;
  pitchMin: number;
  pitchMax: number;
  pitchVariance: number;

  /** Tempo metrics */
  speechRate: number; // words per minute
  pauseRate: number; // pauses per minute
  avgPauseDuration: number;

  /** Energy metrics */
  energyMean: number;
  energyVariance: number;

  /** Quality metrics */
  breathiness: number;
  roughness: number;
  strain: number;

  /** Derived */
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
  timestamp: Date;
}

export interface VoiceStateDetection {
  /** Current emotional state assessment */
  currentState: {
    emotion: string;
    confidence: number;
    deviationFromBaseline: number;
  };

  /** Comparisons */
  vsBaseline: {
    pitchDeviation: number;
    tempoDeviation: number;
    energyDeviation: number;
  };

  /** Insights */
  insights: string[];

  /** Suggested acknowledgments */
  suggestedAcknowledgments: string[];
}

// ============================================================================
// DEFAULT BASELINE
// ============================================================================

const DEFAULT_BASELINE: VoiceBaseline = {
  avgPitchHz: 150, // Will be calibrated per user
  pitchRangeHz: [80, 300],
  pitchVariability: 30,
  avgWordsPerMinute: 150,
  pauseFrequency: 8,
  avgPauseDuration: 400,
  avgEnergy: 0.5,
  energyVariability: 0.15,
  breathiness: 0.3,
  roughness: 0.2,
  strain: 0.1,
};

// ============================================================================
// EMOTIONAL SIGNATURE TEMPLATES
// ============================================================================

const EMOTION_DEVIATION_TEMPLATES: Record<string, Partial<VoiceDeviation>> = {
  happy: {
    pitchShift: 15, // Higher pitch
    tempoChange: 0.1, // Slightly faster
    energyChange: 0.15, // More energy
  },
  excited: {
    pitchShift: 25,
    tempoChange: 0.2,
    energyChange: 0.25,
  },
  sad: {
    pitchShift: -10, // Lower pitch
    tempoChange: -0.15, // Slower
    energyChange: -0.2, // Less energy
  },
  tired: {
    pitchShift: -5,
    tempoChange: -0.1,
    energyChange: -0.15,
    qualityChanges: { breathiness: 0.1 },
  },
  anxious: {
    pitchShift: 20,
    tempoChange: 0.15,
    energyChange: 0.1,
    qualityChanges: { strain: 0.15 },
  },
  stressed: {
    pitchShift: 10,
    tempoChange: 0.05,
    energyChange: 0.05,
    qualityChanges: { strain: 0.2, roughness: 0.1 },
  },
  calm: {
    pitchShift: -5,
    tempoChange: -0.05,
    energyChange: -0.1,
    qualityChanges: { breathiness: -0.05 },
  },
  frustrated: {
    pitchShift: 15,
    tempoChange: 0.1,
    energyChange: 0.2,
    qualityChanges: { roughness: 0.15 },
  },
};

// ============================================================================
// ACKNOWLEDGMENT TEMPLATES
// ============================================================================

const VOICE_ACKNOWLEDGMENTS: Record<string, string[]> = {
  tired: [
    'You sound a bit tired today. Want to keep this light?',
    'Your voice is softer than usual. Long day?',
    "I'm picking up some tiredness in your voice. Everything okay?",
  ],
  excited: [
    "There's something in your voice—you sound energized!",
    "I can hear you're excited about this.",
    "Your energy is coming through! What's got you so animated?",
  ],
  anxious: [
    "I notice you're speaking a bit faster. Everything okay?",
    "Take a breath if you need. I'm here.",
    "There's some tension I'm picking up. Want to talk about it?",
  ],
  stressed: [
    "There's some tension in your voice. Want to talk about it?",
    "You sound like you're carrying something heavy.",
    "I can hear the stress. What's weighing on you?",
  ],
  sad: [
    "Your voice sounds heavier today. What's going on?",
    "I'm hearing something different in your voice. How are you really doing?",
    "There's a quietness to you today. Want to share what's on your mind?",
  ],
  happy: ["There's a lightness in your voice today!", 'You sound good! Something nice happening?'],
  more_relaxed: [
    'You sound more relaxed than last time we talked.',
    "There's a calmness in your voice today.",
  ],
  more_energized: [
    'You sound more energized than last time we talked!',
    "There's more spark in your voice today.",
  ],
};

// ============================================================================
// VOICE PRINT ENGINE
// ============================================================================

export class VoicePrintEngine {
  private voicePrint: VoicePrint;
  private sessionSnapshots: VoiceSnapshot[] = [];
  private sessionStartSnapshot: VoiceSnapshot | null = null;

  constructor(userId: string, existingPrint?: VoicePrint) {
    if (existingPrint) {
      this.voicePrint = existingPrint;
    } else {
      this.voicePrint = this.createInitialPrint(userId);
    }
    logger.debug({ userId, isNew: !existingPrint }, 'VoicePrintEngine initialized');
  }

  /**
   * Record a voice snapshot and update the print
   */
  recordSnapshot(snapshot: VoiceSnapshot): void {
    this.sessionSnapshots.push(snapshot);

    // Record session start
    if (!this.sessionStartSnapshot) {
      this.sessionStartSnapshot = snapshot;
    }

    // Update baseline with exponential moving average
    this.updateBaseline(snapshot);

    // Try to learn emotional signature
    this.learnEmotionalSignature(snapshot);

    this.voicePrint.sampleCount++;
    this.voicePrint.lastUpdated = new Date();

    // Update confidence
    this.updateConfidence();

    logger.debug(
      {
        sampleCount: this.voicePrint.sampleCount,
        confidence: this.voicePrint.confidenceLevel.toFixed(2),
      },
      '🎤 Voice snapshot recorded'
    );
  }

  /**
   * Detect current voice state compared to baseline
   */
  detectState(currentSnapshot: VoiceSnapshot): VoiceStateDetection {
    const baseline = this.voicePrint.baseline;

    // Calculate deviations
    const pitchDeviation = (currentSnapshot.pitchMean - baseline.avgPitchHz) / baseline.avgPitchHz;
    const tempoDeviation =
      (currentSnapshot.speechRate - baseline.avgWordsPerMinute) / baseline.avgWordsPerMinute;
    const energyDeviation = (currentSnapshot.energyMean - baseline.avgEnergy) / baseline.avgEnergy;

    // Find best matching emotion
    const emotionMatch = this.matchEmotionalSignature({
      pitchShift: currentSnapshot.pitchMean - baseline.avgPitchHz,
      tempoChange: tempoDeviation,
      energyChange: energyDeviation,
      qualityChanges: {
        breathiness: currentSnapshot.breathiness - baseline.breathiness,
        roughness: currentSnapshot.roughness - baseline.roughness,
        strain: currentSnapshot.strain - baseline.strain,
      },
      confidence: this.voicePrint.confidenceLevel,
    });

    // Generate insights
    const insights = this.generateInsights(pitchDeviation, tempoDeviation, energyDeviation);

    // Generate acknowledgments
    const suggestedAcknowledgments = this.generateAcknowledgments(
      emotionMatch.emotion,
      insights,
      emotionMatch.confidence
    );

    return {
      currentState: {
        emotion: emotionMatch.emotion,
        confidence: emotionMatch.confidence,
        deviationFromBaseline: Math.max(
          Math.abs(pitchDeviation),
          Math.abs(tempoDeviation),
          Math.abs(energyDeviation)
        ),
      },
      vsBaseline: { pitchDeviation, tempoDeviation, energyDeviation },
      insights,
      suggestedAcknowledgments,
    };
  }

  /**
   * Compare current voice to session start
   */
  compareToSessionStart(currentSnapshot: VoiceSnapshot): {
    energyChange: number;
    moodChange: number;
    insight: string | null;
  } {
    if (!this.sessionStartSnapshot) {
      return { energyChange: 0, moodChange: 0, insight: null };
    }

    const energyChange = currentSnapshot.energyMean - this.sessionStartSnapshot.energyMean;
    const moodChange = currentSnapshot.valence - this.sessionStartSnapshot.valence;

    let insight: string | null = null;

    if (energyChange > 0.15) {
      insight = "You've gotten more energized as we've talked.";
    } else if (energyChange < -0.15) {
      insight = "I notice you're winding down a bit.";
    }

    if (moodChange > 0.2) {
      insight = 'Your voice has lightened up since we started talking.';
    } else if (moodChange < -0.2) {
      insight = 'Something shifted since we started. Want to talk about it?';
    }

    return { energyChange, moodChange, insight };
  }

  /**
   * Get the voice print for persistence
   */
  getVoicePrint(): VoicePrint {
    return {
      ...this.voicePrint,
      emotionalSignatures: new Map(this.voicePrint.emotionalSignatures),
    };
  }

  /**
   * Check if we have enough data for reliable detection
   */
  isCalibrated(): boolean {
    return this.voicePrint.sampleCount >= 10 && this.voicePrint.confidenceLevel >= 0.5;
  }

  /**
   * Get calibration progress
   */
  getCalibrationProgress(): number {
    return Math.min(1, this.voicePrint.sampleCount / 20);
  }

  /**
   * Reset session data (keep voice print)
   */
  resetSession(): void {
    this.sessionSnapshots = [];
    this.sessionStartSnapshot = null;
    logger.debug('VoicePrintEngine session reset');
  }

  /**
   * Get serializable version for storage
   */
  serialize(): string {
    const print = this.getVoicePrint();
    return JSON.stringify({
      ...print,
      emotionalSignatures: Array.from(print.emotionalSignatures.entries()),
    });
  }

  /**
   * Load from serialized data
   */
  static deserialize(data: string): VoicePrint {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      emotionalSignatures: new Map(parsed.emotionalSignatures),
      lastUpdated: new Date(parsed.lastUpdated),
      createdAt: new Date(parsed.createdAt),
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createInitialPrint(userId: string): VoicePrint {
    return {
      userId,
      baseline: { ...DEFAULT_BASELINE },
      emotionalSignatures: new Map(),
      temporalPatterns: {},
      sampleCount: 0,
      confidenceLevel: 0,
      lastUpdated: new Date(),
      createdAt: new Date(),
    };
  }

  private updateBaseline(snapshot: VoiceSnapshot): void {
    const alpha = 0.1; // Learning rate for exponential moving average
    const baseline = this.voicePrint.baseline;

    baseline.avgPitchHz = baseline.avgPitchHz * (1 - alpha) + snapshot.pitchMean * alpha;
    baseline.pitchVariability =
      baseline.pitchVariability * (1 - alpha) + snapshot.pitchVariance * alpha;
    baseline.avgWordsPerMinute =
      baseline.avgWordsPerMinute * (1 - alpha) + snapshot.speechRate * alpha;
    baseline.avgPauseDuration =
      baseline.avgPauseDuration * (1 - alpha) + snapshot.avgPauseDuration * alpha;
    baseline.avgEnergy = baseline.avgEnergy * (1 - alpha) + snapshot.energyMean * alpha;
    baseline.energyVariability =
      baseline.energyVariability * (1 - alpha) + snapshot.energyVariance * alpha;
    baseline.breathiness = baseline.breathiness * (1 - alpha) + snapshot.breathiness * alpha;
    baseline.roughness = baseline.roughness * (1 - alpha) + snapshot.roughness * alpha;
    baseline.strain = baseline.strain * (1 - alpha) + snapshot.strain * alpha;

    // Update pitch range
    if (snapshot.pitchMin < baseline.pitchRangeHz[0]) {
      baseline.pitchRangeHz[0] = snapshot.pitchMin;
    }
    if (snapshot.pitchMax > baseline.pitchRangeHz[1]) {
      baseline.pitchRangeHz[1] = snapshot.pitchMax;
    }
  }

  private learnEmotionalSignature(snapshot: VoiceSnapshot): void {
    // If we have explicit emotion labels (from context), learn from them
    // For now, we use the snapshot's derived valence/arousal to categorize

    const emotion = this.deriveEmotionFromSnapshot(snapshot);
    if (!emotion) return;

    const existing = this.voicePrint.emotionalSignatures.get(emotion);
    const deviation: VoiceDeviation = {
      pitchShift: snapshot.pitchMean - this.voicePrint.baseline.avgPitchHz,
      tempoChange:
        (snapshot.speechRate - this.voicePrint.baseline.avgWordsPerMinute) /
        this.voicePrint.baseline.avgWordsPerMinute,
      energyChange:
        (snapshot.energyMean - this.voicePrint.baseline.avgEnergy) /
        this.voicePrint.baseline.avgEnergy,
      qualityChanges: {
        breathiness: snapshot.breathiness - this.voicePrint.baseline.breathiness,
        roughness: snapshot.roughness - this.voicePrint.baseline.roughness,
        strain: snapshot.strain - this.voicePrint.baseline.strain,
      },
      confidence: 0.5,
    };

    if (existing) {
      // Update with moving average
      const alpha = 0.2;
      existing.deviation.pitchShift =
        existing.deviation.pitchShift * (1 - alpha) + deviation.pitchShift * alpha;
      existing.deviation.tempoChange =
        existing.deviation.tempoChange * (1 - alpha) + deviation.tempoChange * alpha;
      existing.deviation.energyChange =
        existing.deviation.energyChange * (1 - alpha) + deviation.energyChange * alpha;
      existing.sampleCount++;
      existing.confidence = Math.min(1, existing.sampleCount / 10);
    } else {
      this.voicePrint.emotionalSignatures.set(emotion, {
        emotion,
        deviation,
        sampleCount: 1,
        confidence: 0.3,
      });
    }
  }

  private deriveEmotionFromSnapshot(snapshot: VoiceSnapshot): string | null {
    // Simple emotion derivation from valence and arousal
    const { valence, arousal } = snapshot;

    if (arousal > 0.7 && valence > 0.3) return 'excited';
    if (arousal > 0.6 && valence > 0.2) return 'happy';
    if (arousal > 0.6 && valence < -0.2) return 'anxious';
    if (arousal > 0.5 && valence < -0.3) return 'frustrated';
    if (arousal < 0.4 && valence < -0.2) return 'sad';
    if (arousal < 0.3) return 'tired';
    if (valence < -0.1 && snapshot.strain > 0.3) return 'stressed';
    if (arousal < 0.5 && valence > 0) return 'calm';

    return null;
  }

  private matchEmotionalSignature(deviation: VoiceDeviation): {
    emotion: string;
    confidence: number;
  } {
    let bestMatch = { emotion: 'neutral', confidence: 0.5 };
    let bestScore = 0;

    // Check learned signatures first
    for (const [emotion, signature] of this.voicePrint.emotionalSignatures) {
      const score = this.calculateSignatureMatch(deviation, signature.deviation);
      if (score > bestScore && signature.confidence > 0.3) {
        bestScore = score;
        bestMatch = { emotion, confidence: score * signature.confidence };
      }
    }

    // Fall back to templates
    for (const [emotion, template] of Object.entries(EMOTION_DEVIATION_TEMPLATES)) {
      const templateDeviation: VoiceDeviation = {
        pitchShift: template.pitchShift || 0,
        tempoChange: template.tempoChange || 0,
        energyChange: template.energyChange || 0,
        qualityChanges: template.qualityChanges || {},
        confidence: 0.6,
      };
      const score = this.calculateSignatureMatch(deviation, templateDeviation);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { emotion, confidence: score * 0.6 };
      }
    }

    return bestMatch;
  }

  private calculateSignatureMatch(actual: VoiceDeviation, expected: VoiceDeviation): number {
    // Calculate similarity between two deviations
    const pitchDiff = Math.abs(actual.pitchShift - expected.pitchShift) / 30;
    const tempoDiff = Math.abs(actual.tempoChange - expected.tempoChange) / 0.3;
    const energyDiff = Math.abs(actual.energyChange - expected.energyChange) / 0.3;

    // Lower difference = higher score
    const avgDiff = (pitchDiff + tempoDiff + energyDiff) / 3;
    return Math.max(0, 1 - avgDiff);
  }

  private generateInsights(
    pitchDeviation: number,
    tempoDeviation: number,
    energyDeviation: number
  ): string[] {
    const insights: string[] = [];

    if (Math.abs(pitchDeviation) > 0.1) {
      insights.push(
        pitchDeviation > 0
          ? `Voice pitch is ${Math.round(pitchDeviation * 100)}% higher than usual`
          : `Voice pitch is ${Math.round(Math.abs(pitchDeviation) * 100)}% lower than usual`
      );
    }

    if (Math.abs(tempoDeviation) > 0.15) {
      insights.push(
        tempoDeviation > 0
          ? `Speaking ${Math.round(tempoDeviation * 100)}% faster than baseline`
          : `Speaking ${Math.round(Math.abs(tempoDeviation) * 100)}% slower than baseline`
      );
    }

    if (Math.abs(energyDeviation) > 0.15) {
      insights.push(
        energyDeviation > 0
          ? `Voice energy is ${Math.round(energyDeviation * 100)}% higher than usual`
          : `Voice energy is ${Math.round(Math.abs(energyDeviation) * 100)}% lower than usual`
      );
    }

    return insights;
  }

  private generateAcknowledgments(
    emotion: string,
    insights: string[],
    confidence: number
  ): string[] {
    if (confidence < 0.5) return []; // Not confident enough

    const acknowledgments: string[] = [];

    // Emotion-based acknowledgments
    const emotionAcks = VOICE_ACKNOWLEDGMENTS[emotion];
    if (emotionAcks) {
      acknowledgments.push(...emotionAcks);
    }

    // Comparative acknowledgments
    if (insights.some((i) => i.includes('slower'))) {
      acknowledgments.push(...(VOICE_ACKNOWLEDGMENTS['more_relaxed'] || []));
    }
    if (insights.some((i) => i.includes('faster') && i.includes('higher'))) {
      acknowledgments.push(...(VOICE_ACKNOWLEDGMENTS['more_energized'] || []));
    }

    return acknowledgments;
  }

  private updateConfidence(): void {
    // Confidence based on sample count and consistency
    const sampleConfidence = Math.min(1, this.voicePrint.sampleCount / 30);

    // Check consistency of recent samples
    let consistencyScore = 0.5;
    if (this.sessionSnapshots.length >= 3) {
      const recent = this.sessionSnapshots.slice(-5);
      const pitchVariance = this.calculateVariance(recent.map((s) => s.pitchMean));
      const energyVariance = this.calculateVariance(recent.map((s) => s.energyMean));
      // Lower variance = more consistent = higher confidence
      consistencyScore = Math.max(0.3, 1 - (pitchVariance / 50 + energyVariance / 0.3) / 2);
    }

    this.voicePrint.confidenceLevel = sampleConfidence * 0.6 + consistencyScore * 0.4;
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, VoicePrintEngine>();

export function getVoicePrintEngine(userId: string, existingPrint?: VoicePrint): VoicePrintEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new VoicePrintEngine(userId, existingPrint));
  }
  return engines.get(userId)!;
}

export function resetVoicePrintEngine(userId: string): void {
  const engine = engines.get(userId);
  if (engine) {
    engine.resetSession();
    engines.delete(userId);
  }
}

export function resetAllVoicePrintEngines(): void {
  engines.clear();
}

export default VoicePrintEngine;
