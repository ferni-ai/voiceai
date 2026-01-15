/**
 * EmotionalState Value Object
 *
 * Captures the current emotional state with SUPERHUMAN nuance.
 * We track not just the emotion, but intensity, confidence, trajectory,
 * and whether there are contradictions (both/and emotions).
 *
 * @module personality/domain/model/value-objects/emotional-state
 */

/**
 * Primary emotion categories
 */
export type PrimaryEmotion =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation'
  | 'neutral';

/**
 * More granular emotion labels
 */
export type GranularEmotion =
  // Joy spectrum
  | 'ecstatic'
  | 'happy'
  | 'content'
  | 'hopeful'
  | 'relieved'
  | 'proud'
  | 'grateful'
  // Sadness spectrum
  | 'devastated'
  | 'sad'
  | 'melancholy'
  | 'disappointed'
  | 'lonely'
  | 'grief'
  // Anger spectrum
  | 'furious'
  | 'angry'
  | 'frustrated'
  | 'irritated'
  | 'resentful'
  // Fear spectrum
  | 'terrified'
  | 'anxious'
  | 'worried'
  | 'nervous'
  | 'overwhelmed'
  | 'vulnerable'
  // Surprise spectrum
  | 'shocked'
  | 'amazed'
  | 'confused'
  // Other
  | 'calm'
  | 'exhausted'
  | 'bored'
  | 'curious'
  | 'nostalgic'
  | 'ambivalent';

/**
 * Emotional trajectory (is it getting better or worse?)
 */
export type EmotionalTrajectory = 'improving' | 'stable' | 'declining' | 'volatile';

/**
 * Signal source for the emotional detection
 */
export type EmotionSource = 'text' | 'voice' | 'behavior' | 'pattern' | 'inferred';

/**
 * EmotionalState value object
 *
 * SUPERHUMAN: We capture nuance that humans often miss:
 * - Contradicting emotions (excited AND scared)
 * - Trajectory (getting better or worse)
 * - Confidence in our detection
 * - Multiple sources of signal
 *
 * @example
 * ```typescript
 * const state = EmotionalState.create({
 *   primary: 'fear',
 *   granular: 'anxious',
 *   intensity: 0.7,
 *   confidence: 0.85,
 * });
 *
 * const withContradiction = state.withContradictingEmotion('joy', 'excited');
 * // Now represents: "anxious but also excited" - both/and, not either/or
 * ```
 */
export class EmotionalState {
  private constructor(
    /** Primary emotion category */
    public readonly primary: PrimaryEmotion,
    /** More specific emotion label */
    public readonly granular: GranularEmotion | null,
    /** Intensity of the emotion (0-1) */
    public readonly intensity: number,
    /** Confidence in our detection (0-1) */
    public readonly confidence: number,
    /** Current trajectory */
    public readonly trajectory: EmotionalTrajectory,
    /** Sources of this detection */
    public readonly sources: EmotionSource[],
    /** Contradicting emotion (if any) - SUPERHUMAN: holding both/and */
    public readonly contradictingEmotion?: {
      primary: PrimaryEmotion;
      granular: GranularEmotion | null;
      intensity: number;
    },
    /** Context that triggered this emotion */
    public readonly triggerContext?: string,
    /** Topics associated with this emotion */
    public readonly associatedTopics: string[] = [],
    /** Timestamp */
    public readonly detectedAt: Date = new Date()
  ) {}

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new emotional state
   */
  static create(params: {
    primary: PrimaryEmotion;
    granular?: GranularEmotion;
    intensity: number;
    confidence?: number;
    trajectory?: EmotionalTrajectory;
    sources?: EmotionSource[];
    triggerContext?: string;
    associatedTopics?: string[];
  }): EmotionalState {
    return new EmotionalState(
      params.primary,
      params.granular ?? null,
      Math.max(0, Math.min(1, params.intensity)),
      Math.max(0, Math.min(1, params.confidence ?? 0.7)),
      params.trajectory ?? 'stable',
      params.sources ?? ['inferred'],
      undefined,
      params.triggerContext,
      params.associatedTopics ?? []
    );
  }

  /**
   * Create a neutral state
   */
  static neutral(): EmotionalState {
    return new EmotionalState('neutral', 'calm', 0.3, 0.9, 'stable', ['inferred']);
  }

  /**
   * Create from text analysis
   */
  static fromTextAnalysis(
    primary: PrimaryEmotion,
    granular: GranularEmotion | null,
    intensity: number,
    confidence: number
  ): EmotionalState {
    return new EmotionalState(primary, granular, intensity, confidence, 'stable', ['text']);
  }

  /**
   * Create from voice analysis
   */
  static fromVoiceAnalysis(
    primary: PrimaryEmotion,
    granular: GranularEmotion | null,
    intensity: number,
    confidence: number
  ): EmotionalState {
    return new EmotionalState(primary, granular, intensity, confidence, 'stable', ['voice']);
  }

  /**
   * Reconstitute from persistence
   */
  static fromPersistence(data: {
    primary: PrimaryEmotion;
    granular?: GranularEmotion | null;
    intensity: number;
    confidence: number;
    trajectory: EmotionalTrajectory;
    sources: EmotionSource[];
    contradictingEmotion?: {
      primary: PrimaryEmotion;
      granular: GranularEmotion | null;
      intensity: number;
    };
    triggerContext?: string;
    associatedTopics?: string[];
    detectedAt: string;
  }): EmotionalState {
    return new EmotionalState(
      data.primary,
      data.granular ?? null,
      data.intensity,
      data.confidence,
      data.trajectory,
      data.sources,
      data.contradictingEmotion,
      data.triggerContext,
      data.associatedTopics ?? [],
      new Date(data.detectedAt)
    );
  }

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /**
   * Is this a negative emotional state?
   */
  get isNegative(): boolean {
    return ['sadness', 'anger', 'fear', 'disgust'].includes(this.primary);
  }

  /**
   * Is this a positive emotional state?
   */
  get isPositive(): boolean {
    return ['joy', 'trust', 'anticipation'].includes(this.primary);
  }

  /**
   * Are there contradicting emotions? (SUPERHUMAN: both/and)
   */
  get hasContradiction(): boolean {
    return this.contradictingEmotion !== undefined;
  }

  /**
   * Is this a high-intensity state?
   */
  get isHighIntensity(): boolean {
    return this.intensity >= 0.7;
  }

  /**
   * Is this a crisis-level state?
   */
  get isCrisisLevel(): boolean {
    return (
      this.isNegative &&
      this.intensity >= 0.8 &&
      ['devastated', 'terrified', 'furious', 'overwhelmed'].includes(this.granular ?? '')
    );
  }

  /**
   * Should we hold space (not respond immediately)?
   */
  get shouldHoldSpace(): boolean {
    return (
      this.granular === 'vulnerable' ||
      this.granular === 'grief' ||
      (this.isNegative && this.intensity >= 0.8) ||
      this.trajectory === 'volatile'
    );
  }

  /**
   * Get a human-readable description
   */
  get description(): string {
    const intensityWord =
      this.intensity >= 0.8 ? 'very' : this.intensity >= 0.5 ? 'somewhat' : 'slightly';

    let base = this.granular ?? this.primary;

    if (this.hasContradiction) {
      const contraGranular = this.contradictingEmotion?.granular ?? this.contradictingEmotion?.primary;
      return `${intensityWord} ${base}, but also ${contraGranular}`;
    }

    return `${intensityWord} ${base}`;
  }

  // ============================================================================
  // BEHAVIOR METHODS
  // ============================================================================

  /**
   * Merge with another emotional signal (e.g., combining text + voice)
   *
   * SUPERHUMAN: We can combine multiple signal sources for higher confidence
   */
  mergeWith(other: EmotionalState): EmotionalState {
    // If emotions match, boost confidence
    if (this.primary === other.primary) {
      const combinedConfidence = Math.min(0.95, this.confidence + other.confidence * 0.3);
      const avgIntensity = (this.intensity + other.intensity) / 2;
      const combinedSources = [...new Set([...this.sources, ...other.sources])];

      return new EmotionalState(
        this.primary,
        this.granular ?? other.granular,
        avgIntensity,
        combinedConfidence,
        this.trajectory,
        combinedSources,
        this.contradictingEmotion,
        this.triggerContext ?? other.triggerContext,
        [...new Set([...this.associatedTopics, ...other.associatedTopics])]
      );
    }

    // If emotions conflict, this might be a contradiction (both/and)
    if (this.isPositive !== other.isPositive) {
      // They're feeling both - SUPERHUMAN: we validate this
      return this.withContradictingEmotion(other.primary, other.granular, other.intensity);
    }

    // Otherwise, take the higher intensity one
    return this.intensity >= other.intensity ? this : other;
  }

  /**
   * Check if this emotion is appropriate for sharing a particular depth
   */
  isAppropriateForSharing(depth: 'surface' | 'medium' | 'deep' | 'sacred'): boolean {
    // Don't share deep content when they're in crisis
    if (depth === 'deep' || depth === 'sacred') {
      if (this.isCrisisLevel) return false;
      if (this.shouldHoldSpace) return false;
    }

    // Don't share anything if they're overwhelmed
    if (this.granular === 'overwhelmed' && this.intensity >= 0.8) {
      return false;
    }

    return true;
  }

  /**
   * Calculate emotional distance from another state
   *
   * SUPERHUMAN: Useful for tracking emotional journey
   */
  distanceFrom(other: EmotionalState): number {
    // Map emotions to a simplified valence-arousal space
    const valenceMap: Record<PrimaryEmotion, number> = {
      joy: 0.8,
      trust: 0.6,
      anticipation: 0.4,
      neutral: 0,
      surprise: 0,
      fear: -0.4,
      sadness: -0.6,
      anger: -0.3,
      disgust: -0.5,
    };

    const arousalMap: Record<PrimaryEmotion, number> = {
      joy: 0.6,
      anger: 0.8,
      fear: 0.7,
      surprise: 0.8,
      anticipation: 0.5,
      trust: 0.3,
      neutral: 0,
      sadness: 0.2,
      disgust: 0.4,
    };

    const thisValence = valenceMap[this.primary] * this.intensity;
    const thisArousal = arousalMap[this.primary] * this.intensity;
    const otherValence = valenceMap[other.primary] * other.intensity;
    const otherArousal = arousalMap[other.primary] * other.intensity;

    return Math.sqrt(
      Math.pow(thisValence - otherValence, 2) + Math.pow(thisArousal - otherArousal, 2)
    );
  }

  // ============================================================================
  // MUTATION METHODS (Return new instances)
  // ============================================================================

  /**
   * Add a contradicting emotion (SUPERHUMAN: both/and)
   */
  withContradictingEmotion(
    primary: PrimaryEmotion,
    granular: GranularEmotion | null,
    intensity?: number
  ): EmotionalState {
    return new EmotionalState(
      this.primary,
      this.granular,
      this.intensity,
      this.confidence,
      this.trajectory,
      this.sources,
      {
        primary,
        granular,
        intensity: intensity ?? this.intensity * 0.7,
      },
      this.triggerContext,
      this.associatedTopics,
      this.detectedAt
    );
  }

  /**
   * Update trajectory
   */
  withTrajectory(trajectory: EmotionalTrajectory): EmotionalState {
    return new EmotionalState(
      this.primary,
      this.granular,
      this.intensity,
      this.confidence,
      trajectory,
      this.sources,
      this.contradictingEmotion,
      this.triggerContext,
      this.associatedTopics,
      this.detectedAt
    );
  }

  /**
   * Add associated topics
   */
  withTopics(topics: string[]): EmotionalState {
    return new EmotionalState(
      this.primary,
      this.granular,
      this.intensity,
      this.confidence,
      this.trajectory,
      this.sources,
      this.contradictingEmotion,
      this.triggerContext,
      [...new Set([...this.associatedTopics, ...topics])],
      this.detectedAt
    );
  }

  /**
   * Add trigger context
   */
  withTriggerContext(context: string): EmotionalState {
    return new EmotionalState(
      this.primary,
      this.granular,
      this.intensity,
      this.confidence,
      this.trajectory,
      this.sources,
      this.contradictingEmotion,
      context,
      this.associatedTopics,
      this.detectedAt
    );
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object for persistence
   */
  toPersistence(): {
    primary: PrimaryEmotion;
    granular: GranularEmotion | null;
    intensity: number;
    confidence: number;
    trajectory: EmotionalTrajectory;
    sources: EmotionSource[];
    contradictingEmotion?: {
      primary: PrimaryEmotion;
      granular: GranularEmotion | null;
      intensity: number;
    };
    triggerContext?: string;
    associatedTopics: string[];
    detectedAt: string;
    isNegative: boolean;
    isPositive: boolean;
    hasContradiction: boolean;
    description: string;
  } {
    return {
      primary: this.primary,
      granular: this.granular,
      intensity: this.intensity,
      confidence: this.confidence,
      trajectory: this.trajectory,
      sources: this.sources,
      contradictingEmotion: this.contradictingEmotion,
      triggerContext: this.triggerContext,
      associatedTopics: this.associatedTopics,
      detectedAt: this.detectedAt.toISOString(),
      // Computed fields for convenience
      isNegative: this.isNegative,
      isPositive: this.isPositive,
      hasContradiction: this.hasContradiction,
      description: this.description,
    };
  }

  /**
   * Equality check
   */
  equals(other: EmotionalState): boolean {
    return (
      this.primary === other.primary &&
      this.granular === other.granular &&
      Math.abs(this.intensity - other.intensity) < 0.05
    );
  }
}
