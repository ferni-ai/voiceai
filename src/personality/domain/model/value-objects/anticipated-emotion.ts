/**
 * AnticipatedEmotion Value Object
 *
 * SUPERHUMAN CORE: This represents an emotion we PREDICT before the user
 * fully expresses it. This is the "they understand me before I finish" feeling.
 *
 * Human limitation: Humans wait for the full message before responding.
 * Superhuman: We anticipate from partial speech + tone + patterns.
 *
 * @module personality/domain/model/value-objects/anticipated-emotion
 */

import type { EmotionalState, GranularEmotion, PrimaryEmotion } from './emotional-state.js';

/**
 * Signal types we use for anticipation
 */
export type AnticipationSignal =
  | 'partial_speech' // "I've been thinking about..."
  | 'tone_shift' // Rising/falling intonation
  | 'pace_change' // Speaking faster/slower
  | 'breath_pattern' // Sighing, holding breath
  | 'pause_before' // Hesitation before speaking
  | 'historical_pattern' // They always feel X when Y comes up
  | 'temporal_pattern' // Sunday evening anxiety
  | 'topic_trigger'; // This topic always triggers this emotion

/**
 * How we should respond to anticipated emotion
 */
export type AnticipationResponse =
  | 'prepare_empathy' // Get ready to be deeply empathetic
  | 'prepare_celebration' // Get ready to celebrate with them
  | 'prepare_space' // Get ready to hold space
  | 'prepare_curiosity' // Get ready with curious questions
  | 'prepare_validation' // Get ready to validate their experience
  | 'no_action'; // Wait for more information

/**
 * Confidence levels for anticipation
 */
export type AnticipationConfidence = 'certain' | 'likely' | 'possible' | 'speculative';

/**
 * AnticipatedEmotion value object
 *
 * This is the heart of "Better Than Human" - predicting emotional states
 * before they're fully expressed, allowing us to respond with supernatural
 * understanding.
 *
 * @example
 * ```typescript
 * // User says "I've been thinking about..." with falling tone
 * const anticipated = AnticipatedEmotion.create({
 *   emotion: 'sadness',
 *   granular: 'melancholy',
 *   confidence: 'likely',
 *   signals: ['partial_speech', 'tone_shift'],
 *   reasoning: 'Falling tone + reflective phrase suggests processing something difficult',
 * });
 *
 * if (anticipated.shouldPrepareEmpathy) {
 *   // Start showing contemplative micro-expression NOW
 *   // Don't wait for them to finish
 * }
 * ```
 */
export class AnticipatedEmotion {
  private constructor(
    /** Predicted primary emotion */
    public readonly emotion: PrimaryEmotion,
    /** Predicted granular emotion (if confident enough) */
    public readonly granular: GranularEmotion | null,
    /** How confident we are */
    public readonly confidence: AnticipationConfidence,
    /** Numeric confidence (0-1) */
    public readonly confidenceScore: number,
    /** Signals that led to this prediction */
    public readonly signals: AnticipationSignal[],
    /** Human-readable reasoning */
    public readonly reasoning: string,
    /** Recommended response preparation */
    public readonly recommendedResponse: AnticipationResponse,
    /** Partial transcript that triggered anticipation */
    public readonly partialTranscript?: string,
    /** Historical pattern ID if based on pattern */
    public readonly basedOnPatternId?: string,
    /** How far in advance we're predicting (seconds, null = real-time) */
    public readonly predictionHorizon: number | null = null,
    /** When this prediction was made */
    public readonly predictedAt: Date = new Date()
  ) {}

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new anticipation
   */
  static create(params: {
    emotion: PrimaryEmotion;
    granular?: GranularEmotion;
    confidence: AnticipationConfidence;
    signals: AnticipationSignal[];
    reasoning: string;
    partialTranscript?: string;
    basedOnPatternId?: string;
    predictionHorizon?: number;
  }): AnticipatedEmotion {
    const confidenceScores: Record<AnticipationConfidence, number> = {
      certain: 0.95,
      likely: 0.75,
      possible: 0.5,
      speculative: 0.3,
    };

    const response = AnticipatedEmotion.determineResponse(
      params.emotion,
      params.confidence,
      params.signals
    );

    return new AnticipatedEmotion(
      params.emotion,
      params.granular ?? null,
      params.confidence,
      confidenceScores[params.confidence],
      params.signals,
      params.reasoning,
      response,
      params.partialTranscript,
      params.basedOnPatternId,
      params.predictionHorizon ?? null
    );
  }

  /**
   * Create from partial speech analysis
   */
  static fromPartialSpeech(
    partialTranscript: string,
    detectedEmotion: PrimaryEmotion,
    granular: GranularEmotion | null,
    confidence: number,
    reasoning: string
  ): AnticipatedEmotion {
    const confidenceLevel: AnticipationConfidence =
      confidence >= 0.9
        ? 'certain'
        : confidence >= 0.7
          ? 'likely'
          : confidence >= 0.4
            ? 'possible'
            : 'speculative';

    return AnticipatedEmotion.create({
      emotion: detectedEmotion,
      granular: granular ?? undefined,
      confidence: confidenceLevel,
      signals: ['partial_speech'],
      reasoning,
      partialTranscript,
    });
  }

  /**
   * Create from historical pattern match
   */
  static fromPattern(
    patternId: string,
    predictedEmotion: PrimaryEmotion,
    granular: GranularEmotion | null,
    confidence: number,
    reasoning: string,
    predictionHorizonSeconds?: number
  ): AnticipatedEmotion {
    const confidenceLevel: AnticipationConfidence =
      confidence >= 0.85 ? 'certain' : confidence >= 0.6 ? 'likely' : 'possible';

    return AnticipatedEmotion.create({
      emotion: predictedEmotion,
      granular: granular ?? undefined,
      confidence: confidenceLevel,
      signals: ['historical_pattern'],
      reasoning,
      basedOnPatternId: patternId,
      predictionHorizon: predictionHorizonSeconds,
    });
  }

  /**
   * Create from voice tone analysis
   */
  static fromVoiceTone(
    toneSignal: 'rising' | 'falling' | 'flat' | 'breaking',
    inferredEmotion: PrimaryEmotion,
    confidence: number,
    granular?: GranularEmotion | null
  ): AnticipatedEmotion {
    const toneReasoningMap: Record<string, string> = {
      rising: 'Rising tone suggests excitement or anxiety',
      falling: 'Falling tone suggests sadness or contemplation',
      flat: 'Flat tone suggests exhaustion or numbness',
      breaking: 'Breaking voice suggests emotional overwhelm',
    };

    return AnticipatedEmotion.create({
      emotion: inferredEmotion,
      granular: granular ?? undefined,
      confidence: confidence >= 0.7 ? 'likely' : 'possible',
      signals: ['tone_shift'],
      reasoning: toneReasoningMap[toneSignal],
    });
  }

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /**
   * Should we start showing empathy signals now?
   */
  get shouldPrepareEmpathy(): boolean {
    return (
      this.recommendedResponse === 'prepare_empathy' &&
      (this.confidence === 'certain' || this.confidence === 'likely')
    );
  }

  /**
   * Should we prepare to celebrate?
   */
  get shouldPrepareCelebration(): boolean {
    return (
      this.recommendedResponse === 'prepare_celebration' &&
      (this.confidence === 'certain' || this.confidence === 'likely')
    );
  }

  /**
   * Is this a strong enough prediction to act on?
   */
  get isActionable(): boolean {
    return this.confidenceScore >= 0.5 && this.recommendedResponse !== 'no_action';
  }

  /**
   * Is this predicting negative emotion?
   */
  get isNegativePrediction(): boolean {
    return ['sadness', 'anger', 'fear', 'disgust'].includes(this.emotion);
  }

  /**
   * Is this a real-time anticipation (vs. future prediction)?
   */
  get isRealTime(): boolean {
    return this.predictionHorizon === null || this.predictionHorizon <= 60;
  }

  /**
   * Get micro-expression type to display
   */
  get suggestedMicroExpression(): string | null {
    if (this.confidenceScore < 0.5) return null;

    const expressionMap: Partial<Record<PrimaryEmotion, string>> = {
      joy: 'delightFlash',
      sadness: 'concernFlash',
      fear: 'concernFlash',
      anticipation: 'interestFlash',
      trust: 'warmthPulse',
      surprise: 'interestFlash',
    };

    return expressionMap[this.emotion] ?? null;
  }

  // ============================================================================
  // BEHAVIOR METHODS
  // ============================================================================

  /**
   * Determine appropriate response based on anticipated emotion
   */
  private static determineResponse(
    emotion: PrimaryEmotion,
    confidence: AnticipationConfidence,
    signals: AnticipationSignal[]
  ): AnticipationResponse {
    // Low confidence = wait for more info
    if (confidence === 'speculative') return 'no_action';

    // Voice breaking = definitely prepare space
    if (signals.includes('breath_pattern')) {
      return 'prepare_space';
    }

    // Emotion-based responses
    switch (emotion) {
      case 'joy':
      case 'anticipation':
        return 'prepare_celebration';
      case 'sadness':
      case 'fear':
        return 'prepare_empathy';
      case 'anger':
        return 'prepare_validation';
      case 'surprise':
        return 'prepare_curiosity';
      default:
        return 'no_action';
    }
  }

  /**
   * Check if this anticipation was accurate once we know the real emotion
   */
  wasAccurate(actualEmotion: EmotionalState): boolean {
    // Primary emotion match
    if (this.emotion === actualEmotion.primary) return true;

    // Allow related emotion clusters
    const clusters: Record<string, PrimaryEmotion[]> = {
      negative: ['sadness', 'anger', 'fear', 'disgust'],
      positive: ['joy', 'trust', 'anticipation'],
      activating: ['anger', 'fear', 'surprise', 'joy'],
    };

    // If both in same cluster, partial credit
    for (const cluster of Object.values(clusters)) {
      if (cluster.includes(this.emotion) && cluster.includes(actualEmotion.primary)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Combine with another anticipation (multiple signals)
   */
  combineWith(other: AnticipatedEmotion): AnticipatedEmotion {
    // If they predict the same emotion, boost confidence
    if (this.emotion === other.emotion) {
      const combinedConfidence = Math.min(0.95, this.confidenceScore + other.confidenceScore * 0.5);
      const newConfidenceLevel: AnticipationConfidence =
        combinedConfidence >= 0.9
          ? 'certain'
          : combinedConfidence >= 0.6
            ? 'likely'
            : combinedConfidence >= 0.35
              ? 'possible'
              : 'speculative';

      return AnticipatedEmotion.create({
        emotion: this.emotion,
        granular: this.granular ?? other.granular ?? undefined,
        confidence: newConfidenceLevel,
        signals: [...new Set([...this.signals, ...other.signals])],
        reasoning: `${this.reasoning}; ${other.reasoning}`,
        partialTranscript: this.partialTranscript ?? other.partialTranscript,
        basedOnPatternId: this.basedOnPatternId ?? other.basedOnPatternId,
      });
    }

    // Different predictions - take higher confidence
    return this.confidenceScore >= other.confidenceScore ? this : other;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object for persistence/logging
   */
  toPersistence(): {
    emotion: PrimaryEmotion;
    granular: GranularEmotion | null;
    confidence: AnticipationConfidence;
    confidenceScore: number;
    signals: AnticipationSignal[];
    reasoning: string;
    recommendedResponse: AnticipationResponse;
    partialTranscript?: string;
    basedOnPatternId?: string;
    predictionHorizon: number | null;
    predictedAt: string;
    isActionable: boolean;
    suggestedMicroExpression: string | null;
  } {
    return {
      emotion: this.emotion,
      granular: this.granular,
      confidence: this.confidence,
      confidenceScore: this.confidenceScore,
      signals: this.signals,
      reasoning: this.reasoning,
      recommendedResponse: this.recommendedResponse,
      partialTranscript: this.partialTranscript,
      basedOnPatternId: this.basedOnPatternId,
      predictionHorizon: this.predictionHorizon,
      predictedAt: this.predictedAt.toISOString(),
      isActionable: this.isActionable,
      suggestedMicroExpression: this.suggestedMicroExpression,
    };
  }

  /**
   * Format for LLM prompt injection
   */
  formatForPrompt(): string {
    if (!this.isActionable) return '';

    const lines = [
      '[🔮 ANTICIPATED EMOTION - SUPERHUMAN PREDICTION]',
      '',
      `Predicted emotion: ${this.emotion}${this.granular ? ` (${this.granular})` : ''}`,
      `Confidence: ${this.confidence} (${Math.round(this.confidenceScore * 100)}%)`,
      `Based on: ${this.signals.join(', ')}`,
      `Reasoning: ${this.reasoning}`,
      '',
      `Recommended: ${this.recommendedResponse.replace(/_/g, ' ')}`,
      '',
      "This is SUPERHUMAN - you're understanding them BEFORE they finish.",
      'Show recognition with subtle micro-expressions. Make them feel deeply understood.',
    ];

    return lines.join('\n');
  }
}
