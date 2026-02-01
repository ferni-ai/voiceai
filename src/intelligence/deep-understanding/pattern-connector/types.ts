/**
 * Pattern Connector Types
 *
 * Connect dots humans miss. Track topic co-occurrence, emotional patterns,
 * and generate insights like "Every time you mention Sarah, your energy drops."
 *
 * @module @ferni/intelligence/deep-understanding/pattern-connector/types
 */

// ============================================================================
// CO-OCCURRENCE TYPES
// ============================================================================

/**
 * Tracks how often two topics appear together
 */
export interface TopicCoOccurrence {
  /** First topic */
  topic1: string;

  /** Second topic */
  topic2: string;

  /** Number of times they co-occurred */
  count: number;

  /** Average emotion when both present */
  avgEmotion: string;

  /** Average valence when both present */
  avgValence: number;

  /** Sessions where they co-occurred */
  sessions: string[];

  /** Last updated */
  updatedAt: Date;
}

/**
 * Emotional pattern tied to a topic or entity
 */
export interface EmotionalPattern {
  /** Topic or entity */
  subject: string;

  /** Type: topic, person, place, etc. */
  subjectType: 'topic' | 'person' | 'place' | 'event' | 'other';

  /** Typical emotion when this subject comes up */
  typicalEmotion: string;

  /** Typical valence (-1 to 1) */
  typicalValence: number;

  /** Variance in valence (how consistent) */
  valenceVariance: number;

  /** Sample size */
  sampleSize: number;

  /** Trend */
  trend: 'improving' | 'stable' | 'declining';

  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// INSIGHT TYPES
// ============================================================================

/**
 * A generated insight about patterns
 */
export interface PatternInsight {
  /** Unique ID */
  id: string;

  /** Type of insight */
  type: 'emotional-association' | 'co-occurrence' | 'trend' | 'anomaly';

  /** Human-readable insight */
  insight: string;

  /** Subjects involved */
  subjects: string[];

  /** Confidence in insight (0-1) */
  confidence: number;

  /** Strength of pattern (0-1) */
  strength: number;

  /** When generated */
  generatedAt: Date;

  /** Has this been surfaced to user? */
  surfaced: boolean;

  /** User reaction if surfaced */
  userReaction?: 'helpful' | 'neutral' | 'unhelpful';
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Pattern Connector
 */
export interface IPatternConnector {
  /**
   * Record topic-emotion observation
   */
  recordObservation(
    userId: string,
    observation: {
      topics: string[];
      emotion: string;
      valence: number;
      sessionId: string;
    }
  ): Promise<void>;

  /**
   * Get emotional pattern for a subject
   */
  getEmotionalPattern(userId: string, subject: string): Promise<EmotionalPattern | null>;

  /**
   * Get co-occurrences for a topic
   */
  getCoOccurrences(userId: string, topic: string): Promise<TopicCoOccurrence[]>;

  /**
   * Generate insights based on accumulated patterns
   */
  generateInsights(userId: string): Promise<PatternInsight[]>;

  /**
   * Get unsurfaced insights
   */
  getUnsurfacedInsights(userId: string): Promise<PatternInsight[]>;

  /**
   * Mark insight as surfaced
   */
  surfaceInsight(
    userId: string,
    insightId: string,
    reaction?: 'helpful' | 'neutral' | 'unhelpful'
  ): Promise<void>;

  /**
   * Build context injection for LLM
   */
  buildContextInjection(userId: string, currentTopics: string[]): Promise<string>;

  /**
   * Reset
   */
  reset(): void;
}

// ============================================================================
// DI TOKEN
// ============================================================================

/**
 * DI token for Pattern Connector
 */
export const PatternConnectorToken = Symbol('PatternConnector');
