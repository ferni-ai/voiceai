/**
 * Cognitive Intelligence Types
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Type definitions for cognitive distortion detection, tracking,
 * and restructuring systems.
 *
 * Based on evidence-based CBT frameworks, these types support:
 * - Real-time distortion detection
 * - Automatic Negative Thought (ANT) tracking
 * - Socratic questioning
 * - Thought record keeping
 * - Progress measurement
 *
 * @module CognitiveIntelligence/Types
 */

// ============================================================================
// COGNITIVE DISTORTION TYPES
// ============================================================================

/**
 * The 15 most common cognitive distortions identified in CBT literature.
 *
 * These are patterns of thinking that can reinforce negative thought cycles
 * and emotional distress. Detecting them enables gentle intervention.
 */
export type CognitiveDistortion =
  | 'catastrophizing' // Expecting the worst possible outcome
  | 'mind_reading' // Assuming you know what others think
  | 'all_or_nothing' // Black and white thinking, no middle ground
  | 'fortune_telling' // Predicting negative futures with certainty
  | 'personalization' // Taking responsibility for things outside your control
  | 'overgeneralization' // "Always" and "never" from single instances
  | 'mental_filtering' // Focusing only on negatives, ignoring positives
  | 'disqualifying_positive' // Dismissing positive experiences as not counting
  | 'should_statements' // Rigid rules about how things "should" be
  | 'emotional_reasoning' // Believing feelings are facts
  | 'labeling' // Attaching global negative labels to self/others
  | 'magnification' // Blowing things out of proportion
  | 'minimization' // Downplaying achievements or positive traits
  | 'jumping_to_conclusions' // Reaching conclusions without evidence
  | 'blame'; // Holding others entirely responsible

/**
 * Metadata about each cognitive distortion for detection and response.
 */
export interface DistortionMetadata {
  type: CognitiveDistortion;
  name: string;
  description: string;

  /** Common phrases that indicate this distortion */
  indicatorPhrases: string[];

  /** Regex patterns for more complex detection */
  patterns: RegExp[];

  /** How to gently name this when detected */
  gentleLabel: string;

  /** Topics that make this distortion more likely */
  contextTriggers: string[];

  /** Emotions commonly associated with this distortion */
  associatedEmotions: string[];
}

// ============================================================================
// DETECTION RESULT TYPES
// ============================================================================

/**
 * Result of detecting a cognitive distortion in user input.
 */
export interface DistortionDetection {
  /** The type of distortion detected */
  type: CognitiveDistortion;

  /** Confidence score 0-1 */
  confidence: number;

  /** The specific phrase that triggered detection */
  triggerPhrase: string;

  /** The full user message */
  userMessage: string;

  /** Timestamp of detection */
  detectedAt: Date;

  // -------------------------
  // THERAPEUTIC RESPONSE
  // -------------------------

  /** A gentle Socratic question to explore the thought */
  gentleChallenge: string;

  /** An alternative perspective to consider */
  reframe: string;

  /** Validation of the underlying feeling */
  validation: string;

  // -------------------------
  // CONTEXT
  // -------------------------

  /** Current conversation topic if known */
  topic?: string;

  /** Detected emotion if available */
  emotion?: string;

  /** Emotion intensity 0-1 */
  emotionIntensity?: number;

  // -------------------------
  // LEARNING
  // -------------------------

  /** How many times this distortion has been detected for this user */
  patternCount: number;

  /** Other distortions often seen with this one */
  relatedDistortions: CognitiveDistortion[];

  /** Whether this is a recurring pattern vs one-off */
  isRecurring: boolean;
}

/**
 * Approach recommendation for responding to detected distortions.
 */
export type ResponseApproach =
  | 'socratic' // Ask questions to guide discovery
  | 'validate' // Just acknowledge the feeling
  | 'gentle_name' // Gently name the pattern
  | 'reframe' // Offer alternative perspective
  | 'wait'; // Not the right time to address

/**
 * Recommendation for how to respond to a detected distortion.
 */
export interface DistortionResponse {
  approach: ResponseApproach;
  reason: string;

  /** Suggested response if approach !== 'wait' */
  suggestion?: string;

  /** Whether to use the detection in context */
  injectIntoContext: boolean;

  /** Priority relative to other context injections */
  priority: number;
}

// ============================================================================
// ANT (AUTOMATIC NEGATIVE THOUGHT) TRACKING
// ============================================================================

/**
 * A recorded automatic negative thought instance.
 */
export interface ANTInstance {
  id: string;
  userId: string;
  timestamp: Date;

  /** The thought/statement */
  thought: string;

  /** Detected distortion type(s) */
  distortions: CognitiveDistortion[];

  /** Confidence in detection */
  confidence: number;

  /** Context */
  topic?: string;
  emotion?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6

  /** Outcome */
  wasAddressed: boolean;
  reframeAttempted?: string;
  userResponse?: 'receptive' | 'resistant' | 'neutral' | 'breakthrough';
}

/**
 * Aggregated patterns of automatic negative thoughts for a user.
 */
export interface ANTProfile {
  userId: string;

  // -------------------------
  // FREQUENCY DATA
  // -------------------------

  /** Total ANTs detected */
  totalDetected: number;

  /** Count by distortion type */
  byDistortion: Map<CognitiveDistortion, number>;

  /** Top 3 most common distortions */
  topDistortions: CognitiveDistortion[];

  // -------------------------
  // TEMPORAL PATTERNS
  // -------------------------

  /** Distortions by time of day */
  byTimeOfDay: Map<string, CognitiveDistortion[]>;

  /** Distortions by day of week */
  byDayOfWeek: Map<number, CognitiveDistortion[]>;

  // -------------------------
  // TRIGGER PATTERNS
  // -------------------------

  /** Topics that trigger distortions */
  topicTriggers: Map<string, CognitiveDistortion[]>;

  /** Emotions that accompany distortions */
  emotionCorrelations: Map<string, CognitiveDistortion[]>;

  // -------------------------
  // PROGRESS
  // -------------------------

  /** Overall trend in distortion frequency */
  trend: 'improving' | 'stable' | 'declining';

  /** How often reframes are successful */
  reframeSuccessRate: number;

  /** Last updated */
  lastUpdated: Date;
}

// ============================================================================
// SOCRATIC QUESTIONING
// ============================================================================

/**
 * A sequence of Socratic questions for a specific distortion.
 */
export interface SocraticSequence {
  distortion: CognitiveDistortion;

  /** Questions to find evidence FOR the thought */
  evidenceFor: string[];

  /** Questions to find evidence AGAINST the thought */
  evidenceAgainst: string[];

  /** Questions to explore alternative perspectives */
  alternativeViews: string[];

  /** Questions to reality-test assumptions */
  realityTest: string[];

  /** Questions to decatastrophize worst-case thinking */
  decatastrophize: string[];

  // -------------------------
  // PERSONA ADAPTATIONS
  // -------------------------

  /** How Ferni would introduce this */
  ferniIntro: string;

  /** How Peter would approach this (analytical) */
  peterApproach?: string;

  /** How Maya would approach this (behavioral) */
  mayaApproach?: string;
}

/**
 * Context for selecting which Socratic question to ask.
 */
export interface SocraticContext {
  userId: string;
  distortion: CognitiveDistortion;
  triggerThought: string;

  /** Questions already asked in this conversation */
  questionsAsked: string[];

  /** User's emotional state */
  emotionalState?: string;
  emotionalIntensity?: number;

  /** Relationship depth with Ferni */
  relationshipStage: 'new' | 'building' | 'established' | 'deep';

  /** Whether user seems receptive */
  receptivity: 'high' | 'medium' | 'low' | 'unknown';
}

// ============================================================================
// THOUGHT RECORDS
// ============================================================================

/**
 * A CBT thought record - the gold standard for cognitive restructuring.
 */
export interface ThoughtRecord {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;

  // -------------------------
  // THE SITUATION
  // -------------------------

  situation: {
    what: string; // What happened?
    when: Date; // When did it happen?
    where?: string; // Where were you?
    who?: string[]; // Who was involved?
  };

  // -------------------------
  // AUTOMATIC THOUGHTS
  // -------------------------

  automaticThoughts: Array<{
    thought: string;
    beliefStrength: number; // 0-100: How much do you believe this?
    distortions: CognitiveDistortion[];
  }>;

  // -------------------------
  // EMOTIONS
  // -------------------------

  emotions: Array<{
    emotion: string;
    intensity: number; // 0-100
  }>;

  // -------------------------
  // BODY SENSATIONS
  // -------------------------

  bodySensations?: string[];

  // -------------------------
  // EVIDENCE (SOCRATIC)
  // -------------------------

  evidenceFor: string[];
  evidenceAgainst: string[];

  // -------------------------
  // BALANCED THOUGHT
  // -------------------------

  balancedThought?: string;
  newBeliefStrength?: number; // 0-100

  // -------------------------
  // OUTCOME
  // -------------------------

  newEmotions?: Array<{
    emotion: string;
    intensity: number;
  }>;

  /** What did you learn? */
  whatLearned?: string;

  // -------------------------
  // METADATA
  // -------------------------

  /** How the record was created */
  source: 'voice_guided' | 'text_guided' | 'user_initiated' | 'ferni_suggested';

  /** Completion status */
  status: 'in_progress' | 'completed' | 'abandoned';

  /** Time spent on this record */
  durationMinutes?: number;
}

// ============================================================================
// RESTRUCTURING PROGRESS
// ============================================================================

/**
 * Progress tracking for cognitive restructuring over time.
 */
export interface RestructuringProgress {
  userId: string;

  // -------------------------
  // CORE METRICS
  // -------------------------

  /** Average distortions detected per conversation */
  avgDistortionsPerConversation: number;

  /** Overall trend */
  overallTrend: 'improving' | 'stable' | 'declining';

  // -------------------------
  // PER-DISTORTION PROGRESS
  // -------------------------

  byDistortion: Map<
    CognitiveDistortion,
    {
      /** How often detected */
      frequency: number;

      /** Trend for this specific distortion */
      trend: 'improving' | 'stable' | 'declining';

      /** Times we successfully reframed */
      successfulReframes: number;

      /** Total reframe attempts */
      totalAttempts: number;

      /** Success rate */
      reframeSuccessRate: number;

      /** Last detected */
      lastDetected?: Date;
    }
  >;

  // -------------------------
  // THOUGHT RECORDS
  // -------------------------

  thoughtRecordsCompleted: number;
  avgEmotionReduction: number; // Average pre-to-post reduction

  // -------------------------
  // SELF-AWARENESS
  // -------------------------

  /** Times user caught their own distortions */
  selfCaughtDistortions: number;

  /** Times user initiated reframe */
  userInitiatedReframes: number;

  // -------------------------
  // MILESTONES
  // -------------------------

  milestones: {
    firstDistortionDetected?: Date;
    firstReframeSuccess?: Date;
    firstSelfCatch?: Date;
    tenReframesCompleted?: Date;
    weekWithImprovement?: Date;
    thoughtRecordCompleted?: Date;
  };

  // -------------------------
  // METADATA
  // -------------------------

  firstRecorded: Date;
  lastUpdated: Date;
}

// ============================================================================
// CONTEXT INJECTION
// ============================================================================

/**
 * Cognitive context to inject into LLM prompts.
 */
export interface CognitiveContextInjection {
  /** Whether any distortion was detected */
  hasDistortion: boolean;

  /** The detection if present */
  detection?: DistortionDetection;

  /** How to respond */
  response: DistortionResponse;

  /** Formatted text for LLM context */
  llmContext: string;

  /** Priority for context builder */
  priority: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for cognitive intelligence systems.
 */
export interface CognitiveIntelligenceConfig {
  /** Minimum confidence to report a detection */
  detectionThreshold: number;

  /** Minimum confidence to inject into context */
  contextInjectionThreshold: number;

  /** How many detections before marking as recurring */
  recurringThreshold: number;

  /** Whether to track ANTs persistently */
  enableANTTracking: boolean;

  /** Whether to enable thought records */
  enableThoughtRecords: boolean;

  /** Whether to enable progress tracking */
  enableProgressTracking: boolean;
}

export const DEFAULT_CONFIG: CognitiveIntelligenceConfig = {
  detectionThreshold: 0.6,
  contextInjectionThreshold: 0.7,
  recurringThreshold: 3,
  enableANTTracking: true,
  enableThoughtRecords: true,
  enableProgressTracking: true,
};
