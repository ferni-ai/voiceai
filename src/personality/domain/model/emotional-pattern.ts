/**
 * EmotionalPattern Entity
 *
 * Represents a detected pattern in the user's emotional life.
 * SUPERHUMAN: We notice patterns they don't notice themselves.
 *
 * "I've noticed you seem more stressed when work comes up lately"
 * "Every Sunday evening you seem to get anxious"
 *
 * @module personality/domain/model/emotional-pattern
 */

import type { PrimaryEmotion, GranularEmotion } from './value-objects/emotional-state.js';

/**
 * Types of patterns we detect
 */
export type PatternType =
  | 'topic_emotion' // Topic X → Emotion Y
  | 'temporal' // Time-based (Sunday anxiety)
  | 'cyclical' // Recurring cycles (monthly, etc.)
  | 'trajectory' // Overall emotional direction
  | 'trigger_response' // Specific trigger → response
  | 'person_related' // Emotion when person X comes up
  | 'context_dependent'; // Environment-based

/**
 * When to surface this pattern
 */
export type PatternDeliveryTiming =
  | 'immediate' // Surface now, important
  | 'when_relevant' // Wait for natural moment
  | 'proactive' // Bring up proactively
  | 'never'; // Pattern is for internal use only

/**
 * Evidence for a pattern
 */
export interface PatternEvidence {
  /** When this evidence was recorded */
  timestamp: Date;
  /** The context/message that showed this pattern */
  context: string;
  /** The emotion detected */
  emotion: PrimaryEmotion;
  /** Granular emotion if available */
  granular?: GranularEmotion;
  /** Intensity (0-1) */
  intensity: number;
  /** Topics involved */
  topics?: string[];
}

/**
 * Configuration for pattern detection
 */
const PATTERN_CONFIG = {
  /** Minimum occurrences to confirm a pattern */
  minOccurrences: 3,
  /** Confidence threshold for surfacing */
  surfaceThreshold: 0.6,
  /** High confidence threshold */
  highConfidenceThreshold: 0.8,
  /** Days between allowed surfacing of same pattern */
  cooldownDays: 7,
} as const;

/**
 * EmotionalPattern Entity
 *
 * Tracks a specific emotional pattern we've detected.
 * Has identity (id) and lifecycle (created, updated, surfaced).
 *
 * @example
 * ```typescript
 * const pattern = EmotionalPattern.create({
 *   userId: 'user_123',
 *   patternType: 'topic_emotion',
 *   description: 'work → stress',
 *   triggers: ['work', 'job', 'boss'],
 *   resultingEmotion: 'fear',
 *   resultingGranular: 'anxious',
 * });
 *
 * pattern.addEvidence({
 *   timestamp: new Date(),
 *   context: 'User mentioned upcoming deadline',
 *   emotion: 'fear',
 *   granular: 'anxious',
 *   intensity: 0.7,
 *   topics: ['work', 'deadline'],
 * });
 *
 * if (pattern.isReady ToSurface) {
 *   // Gently share this insight
 * }
 * ```
 */
export class EmotionalPattern {
  private constructor(
    /** Unique pattern ID */
    public readonly id: string,
    /** User this pattern belongs to */
    public readonly userId: string,
    /** Type of pattern */
    public readonly patternType: PatternType,
    /** Human-readable description */
    public readonly description: string,
    /** Triggers (topics, times, people, etc.) */
    public readonly triggers: string[],
    /** Resulting emotion */
    public readonly resultingEmotion: PrimaryEmotion,
    /** Granular emotion */
    public readonly resultingGranular: GranularEmotion | null,
    /** Evidence supporting this pattern */
    private _evidence: PatternEvidence[],
    /** Pattern confidence (0-1) */
    private _confidence: number,
    /** When to surface */
    public readonly deliveryTiming: PatternDeliveryTiming,
    /** Insight to share with user */
    public readonly insightToShare: string,
    /** Has this been surfaced to the user? */
    private _surfaced: boolean,
    /** When it was last surfaced */
    private _lastSurfacedAt: Date | null,
    /** How many times surfaced */
    private _surfaceCount: number,
    /** Created timestamp */
    public readonly createdAt: Date,
    /** Last updated timestamp */
    private _updatedAt: Date
  ) {}

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new pattern
   */
  static create(params: {
    userId: string;
    patternType: PatternType;
    description: string;
    triggers: string[];
    resultingEmotion: PrimaryEmotion;
    resultingGranular?: GranularEmotion;
    insightToShare?: string;
    deliveryTiming?: PatternDeliveryTiming;
  }): EmotionalPattern {
    const id = `pattern_${params.userId}_${params.patternType}_${Date.now()}`;
    const now = new Date();

    const insightToShare =
      params.insightToShare ??
      EmotionalPattern.generateDefaultInsight(
        params.patternType,
        params.triggers,
        params.resultingEmotion
      );

    return new EmotionalPattern(
      id,
      params.userId,
      params.patternType,
      params.description,
      params.triggers,
      params.resultingEmotion,
      params.resultingGranular ?? null,
      [],
      0,
      params.deliveryTiming ?? 'when_relevant',
      insightToShare,
      false,
      null,
      0,
      now,
      now
    );
  }

  /**
   * Generate default insight based on pattern type
   */
  private static generateDefaultInsight(
    type: PatternType,
    triggers: string[],
    emotion: PrimaryEmotion
  ): string {
    const triggerStr = triggers.slice(0, 2).join(' or ');

    switch (type) {
      case 'topic_emotion':
        return `I've noticed you seem to feel ${emotion} when ${triggerStr} comes up`;
      case 'temporal':
        return `${triggerStr} seems to be a harder time for you`;
      case 'cyclical':
        return `There seems to be a pattern around ${triggerStr}`;
      case 'person_related':
        return `When ${triggerStr} comes up, I notice a shift in your energy`;
      case 'trajectory':
        return `I've noticed things have been feeling more ${emotion} lately`;
      default:
        return `I've noticed a pattern around ${triggerStr}`;
    }
  }

  /**
   * Reconstitute from persistence
   */
  static fromPersistence(data: {
    id: string;
    userId: string;
    patternType: PatternType;
    description: string;
    triggers: string[];
    resultingEmotion: PrimaryEmotion;
    resultingGranular?: GranularEmotion | null;
    evidence: Array<{
      timestamp: string;
      context: string;
      emotion: PrimaryEmotion;
      granular?: GranularEmotion;
      intensity: number;
      topics?: string[];
    }>;
    confidence: number;
    deliveryTiming: PatternDeliveryTiming;
    insightToShare: string;
    surfaced: boolean;
    lastSurfacedAt?: string | null;
    surfaceCount: number;
    createdAt: string;
    updatedAt: string;
  }): EmotionalPattern {
    return new EmotionalPattern(
      data.id,
      data.userId,
      data.patternType,
      data.description,
      data.triggers,
      data.resultingEmotion,
      data.resultingGranular ?? null,
      data.evidence.map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      })),
      data.confidence,
      data.deliveryTiming,
      data.insightToShare,
      data.surfaced,
      data.lastSurfacedAt ? new Date(data.lastSurfacedAt) : null,
      data.surfaceCount,
      new Date(data.createdAt),
      new Date(data.updatedAt)
    );
  }

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /** Current confidence score */
  get confidence(): number {
    return this._confidence;
  }

  /** Get evidence array (immutable copy) */
  get evidence(): readonly PatternEvidence[] {
    return [...this._evidence];
  }

  /** Evidence count */
  get evidenceCount(): number {
    return this._evidence.length;
  }

  /** Has been surfaced */
  get surfaced(): boolean {
    return this._surfaced;
  }

  /** Last surfaced timestamp */
  get lastSurfacedAt(): Date | null {
    return this._lastSurfacedAt;
  }

  /** Surface count */
  get surfaceCount(): number {
    return this._surfaceCount;
  }

  /** Last updated */
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Is this pattern confirmed (enough evidence)?
   */
  get isConfirmed(): boolean {
    return this._evidence.length >= PATTERN_CONFIG.minOccurrences;
  }

  /**
   * Is this pattern ready to surface to the user?
   */
  get isReadyToSurface(): boolean {
    // Must be confirmed
    if (!this.isConfirmed) return false;

    // Must meet confidence threshold
    if (this._confidence < PATTERN_CONFIG.surfaceThreshold) return false;

    // Check cooldown
    if (this._lastSurfacedAt) {
      const daysSinceSurfaced = Math.floor(
        (Date.now() - this._lastSurfacedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceSurfaced < PATTERN_CONFIG.cooldownDays) return false;
    }

    // Delivery timing check
    if (this.deliveryTiming === 'never') return false;

    return true;
  }

  /**
   * Is this a high-confidence pattern?
   */
  get isHighConfidence(): boolean {
    return this._confidence >= PATTERN_CONFIG.highConfidenceThreshold;
  }

  /**
   * Should this be surfaced immediately?
   */
  get shouldSurfaceImmediately(): boolean {
    return this.deliveryTiming === 'immediate' && this.isReadyToSurface && this.isHighConfidence;
  }

  /**
   * Get average intensity from evidence
   */
  get averageIntensity(): number {
    if (this._evidence.length === 0) return 0;
    return this._evidence.reduce((sum, e) => sum + e.intensity, 0) / this._evidence.length;
  }

  /**
   * Get most recent evidence
   */
  get mostRecentEvidence(): PatternEvidence | null {
    return this._evidence.length > 0 ? this._evidence[this._evidence.length - 1] ?? null : null;
  }

  // ============================================================================
  // BEHAVIOR METHODS
  // ============================================================================

  /**
   * Add evidence for this pattern
   */
  addEvidence(evidence: PatternEvidence): void {
    this._evidence.push(evidence);
    this._updatedAt = new Date();
    this.recalculateConfidence();
  }

  /**
   * Mark as surfaced to user
   */
  markSurfaced(): void {
    this._surfaced = true;
    this._lastSurfacedAt = new Date();
    this._surfaceCount++;
    this._updatedAt = new Date();
  }

  /**
   * Check if triggers match current context
   */
  matchesTriggers(context: {
    topics?: string[];
    currentTime?: Date;
    mentionedPeople?: string[];
  }): boolean {
    if (context.topics) {
      const topicMatch = context.topics.some((topic) =>
        this.triggers.some(
          (trigger) =>
            topic.toLowerCase().includes(trigger.toLowerCase()) ||
            trigger.toLowerCase().includes(topic.toLowerCase())
        )
      );
      if (topicMatch) return true;
    }

    if (context.mentionedPeople && this.patternType === 'person_related') {
      const personMatch = context.mentionedPeople.some((person) =>
        this.triggers.some(
          (trigger) =>
            person.toLowerCase().includes(trigger.toLowerCase()) ||
            trigger.toLowerCase().includes(person.toLowerCase())
        )
      );
      if (personMatch) return true;
    }

    if (context.currentTime && this.patternType === 'temporal') {
      // Check time-based triggers (e.g., "sunday evening")
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = dayNames[context.currentTime.getDay()];
      const currentHour = context.currentTime.getHours();
      const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 18 ? 'afternoon' : 'evening';

      const timeMatch = this.triggers.some(
        (trigger) =>
          trigger.toLowerCase().includes(currentDay ?? '') ||
          trigger.toLowerCase().includes(timeOfDay)
      );
      if (timeMatch) return true;
    }

    return false;
  }

  /**
   * Recalculate confidence based on evidence
   */
  private recalculateConfidence(): void {
    const count = this._evidence.length;

    // Base confidence from count
    let confidence = Math.min(0.9, count / 10);

    // Boost for recency
    const recentEvidence = this._evidence.filter(
      (e) => Date.now() - e.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000 // Last 30 days
    );
    if (recentEvidence.length >= 2) {
      confidence = Math.min(0.95, confidence + 0.1);
    }

    // Boost for consistency (same granular emotion)
    if (this.resultingGranular) {
      const consistentCount = this._evidence.filter(
        (e) => e.granular === this.resultingGranular
      ).length;
      const consistencyRatio = consistentCount / count;
      if (consistencyRatio >= 0.7) {
        confidence = Math.min(0.95, confidence + 0.1);
      }
    }

    this._confidence = confidence;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object for persistence
   */
  toPersistence(): {
    id: string;
    userId: string;
    patternType: PatternType;
    description: string;
    triggers: string[];
    resultingEmotion: PrimaryEmotion;
    resultingGranular: GranularEmotion | null;
    evidence: Array<{
      timestamp: string;
      context: string;
      emotion: PrimaryEmotion;
      granular?: GranularEmotion;
      intensity: number;
      topics?: string[];
    }>;
    confidence: number;
    deliveryTiming: PatternDeliveryTiming;
    insightToShare: string;
    surfaced: boolean;
    lastSurfacedAt: string | null;
    surfaceCount: number;
    createdAt: string;
    updatedAt: string;
    isConfirmed: boolean;
    isReadyToSurface: boolean;
    averageIntensity: number;
  } {
    return {
      id: this.id,
      userId: this.userId,
      patternType: this.patternType,
      description: this.description,
      triggers: this.triggers,
      resultingEmotion: this.resultingEmotion,
      resultingGranular: this.resultingGranular,
      evidence: this._evidence.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
      confidence: this._confidence,
      deliveryTiming: this.deliveryTiming,
      insightToShare: this.insightToShare,
      surfaced: this._surfaced,
      lastSurfacedAt: this._lastSurfacedAt?.toISOString() ?? null,
      surfaceCount: this._surfaceCount,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      // Computed fields for convenience
      isConfirmed: this.isConfirmed,
      isReadyToSurface: this.isReadyToSurface,
      averageIntensity: this.averageIntensity,
    };
  }

  /**
   * Format for LLM prompt injection
   */
  formatForPrompt(): string {
    if (!this.isReadyToSurface) return '';

    const confidenceStr = this.isHighConfidence ? 'high' : 'moderate';

    return [
      '[🔮 PATTERN INSIGHT - SUPERHUMAN OBSERVATION]',
      '',
      `Pattern: ${this.description}`,
      `Evidence: ${this.evidenceCount} occurrences`,
      `Confidence: ${confidenceStr} (${Math.round(this._confidence * 100)}%)`,
      '',
      `Insight to share: "${this.insightToShare}"`,
      '',
      "This is SUPERHUMAN - noticing what they don't notice about themselves.",
      'Deliver gently, as an observation, not a diagnosis.',
      'Frame it as curiosity: "I\'ve noticed..." not "You always..."',
    ].join('\n');
  }
}
