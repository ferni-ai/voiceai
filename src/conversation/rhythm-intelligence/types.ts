/**
 * Rhythm Intelligence Types
 *
 * Learn each user's conversational rhythm. Some need quick exchanges,
 * others prefer depth. Adapt response length, pause timing, and pacing.
 *
 * @module @ferni/conversation/rhythm-intelligence/types
 */

// ============================================================================
// RHYTHM PROFILES
// ============================================================================

/**
 * User's conversational rhythm profile
 */
export interface ConversationalRhythm {
  /** User ID */
  userId: string;

  /** Preferred response length */
  preferredResponseLength: 'brief' | 'moderate' | 'detailed';

  /** Preferred conversation pace */
  preferredPace: 'quick' | 'moderate' | 'leisurely';

  /** Average words per user turn */
  avgWordsPerTurn: number;

  /** Average response length that worked well (words) */
  optimalResponseLength: number;

  /** Preferred pause between turns (ms) */
  preferredPauseMs: number;

  /** Time of day patterns */
  timePatterns: {
    morning: RhythmPreference;
    afternoon: RhythmPreference;
    evening: RhythmPreference;
    lateNight: RhythmPreference;
  };

  /** Topic-specific preferences */
  topicPreferences: TopicRhythmPreference[];

  /** How many turns analyzed */
  turnsAnalyzed: number;

  /** Last updated */
  updatedAt: Date;
}

/**
 * Rhythm preference for a specific context
 */
export interface RhythmPreference {
  /** Preferred length */
  length: 'brief' | 'moderate' | 'detailed';

  /** Energy level */
  energy: 'low' | 'moderate' | 'high';

  /** Sample size */
  sampleSize: number;
}

/**
 * Topic-specific rhythm preference
 */
export interface TopicRhythmPreference {
  /** Topic name */
  topic: string;

  /** Preferred response length for this topic */
  preferredLength: 'brief' | 'moderate' | 'detailed';

  /** Preferred depth level */
  preferredDepth: 'surface' | 'moderate' | 'deep';

  /** Sample size */
  sampleSize: number;
}

// ============================================================================
// RHYTHM GUIDANCE
// ============================================================================

/**
 * Guidance for response rhythm
 */
export interface RhythmGuidance {
  /** Target word count range */
  wordRange: { min: number; max: number };

  /** Suggested pause before response (ms) */
  pauseBeforeMs: number;

  /** Should use shorter sentences? */
  useShorterSentences: boolean;

  /** Energy level for response */
  energy: 'low' | 'moderate' | 'high';

  /** Reasoning for guidance */
  reason: string;

  /** Confidence in guidance (0-1) */
  confidence: number;
}

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

/**
 * Turn analysis for rhythm learning
 */
export interface TurnAnalysis {
  /** Word count */
  wordCount: number;

  /** Sentence count */
  sentenceCount: number;

  /** Average words per sentence */
  avgWordsPerSentence: number;

  /** Energy indicator */
  energy: 'low' | 'moderate' | 'high';

  /** Topic */
  topic?: string;

  /** Time of day */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'lateNight';

  /** Was this turn well-received? */
  wasSuccessful?: boolean;
}

/**
 * Context for rhythm guidance
 */
export interface RhythmContext {
  /** User ID */
  userId: string;

  /** Current topic */
  topic?: string;

  /** Emotional state */
  emotionalState?: string;

  /** User's last turn word count */
  userTurnWordCount: number;

  /** Turn number in session */
  turnNumber: number;

  /** Current time of day */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'lateNight';
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Rhythm Intelligence
 */
export interface IRhythmIntelligence {
  /**
   * Get rhythm guidance for current context
   *
   * @param context - Current context
   * @returns Rhythm guidance for response
   */
  getGuidance(context: RhythmContext): Promise<RhythmGuidance>;

  /**
   * Record turn outcome for learning
   *
   * @param userId - User ID
   * @param analysis - Turn analysis
   * @param wasSuccessful - Whether the turn was well-received
   */
  recordTurn(userId: string, analysis: TurnAnalysis, wasSuccessful: boolean): Promise<void>;

  /**
   * Get user's rhythm profile
   *
   * @param userId - User ID
   * @returns Rhythm profile or null
   */
  getProfile(userId: string): Promise<ConversationalRhythm | null>;

  /**
   * Analyze a turn
   *
   * @param message - Message text
   * @param options - Additional options
   * @returns Turn analysis
   */
  analyzeTurn(message: string, options?: { topic?: string }): TurnAnalysis;

  /**
   * Build context injection for LLM
   *
   * @param guidance - Rhythm guidance
   * @returns Context string for injection
   */
  buildContextInjection(guidance: RhythmGuidance): string;

  /**
   * Reset session state
   */
  reset(): void;
}

// ============================================================================
// DI TOKEN
// ============================================================================

/**
 * DI token for Rhythm Intelligence
 */
export const RhythmIntelligenceToken = Symbol('RhythmIntelligence');
