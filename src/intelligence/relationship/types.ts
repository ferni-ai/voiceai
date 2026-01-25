/**
 * Relationship Memory Types
 *
 * > "Your best friend forgets. We don't."
 *
 * Core types for tracking the evolving relationship between Ferni and each user.
 * Implements Core Principle #2: Relationship Over Transaction
 *
 * @module intelligence/relationship
 */

// ============================================================================
// RELATIONSHIP STAGE
// ============================================================================

/**
 * Relationship stages mirror real human relationship development.
 * Each stage unlocks different interaction styles and depths.
 *
 * Aligned with Core Principle #2: "Track relationship depth and adjust approach accordingly"
 */
export type RelationshipStage =
  | 'stranger' // Sessions 1-2: Getting to know each other
  | 'acquaintance' // Sessions 3-10: Building familiarity
  | 'friend' // Sessions 11-30: Genuine rapport
  | 'trusted' // Sessions 31-50: Deep trust, vulnerability welcome
  | 'confidant'; // 50+ sessions OR significant shared moments

/**
 * Stage configuration - what's unlocked at each level
 */
export interface StageConfig {
  readonly stage: RelationshipStage;
  readonly minSessions: number;
  readonly minTrustScore: number;
  readonly unlockedContent: {
    readonly storyDepth: 'surface' | 'personal' | 'vulnerable' | 'deep';
    readonly directnessAllowed: number; // 0-1
    readonly vulnerabilitySharing: boolean;
    readonly insideJokesEnabled: boolean;
    readonly protectiveResponses: boolean;
  };
}

/**
 * Default stage configurations
 */
export const STAGE_CONFIGS: Record<RelationshipStage, StageConfig> = {
  stranger: {
    stage: 'stranger',
    minSessions: 0,
    minTrustScore: 0,
    unlockedContent: {
      storyDepth: 'surface',
      directnessAllowed: 0.3,
      vulnerabilitySharing: false,
      insideJokesEnabled: false,
      protectiveResponses: false,
    },
  },
  acquaintance: {
    stage: 'acquaintance',
    minSessions: 3,
    minTrustScore: 0.2,
    unlockedContent: {
      storyDepth: 'surface',
      directnessAllowed: 0.4,
      vulnerabilitySharing: false,
      insideJokesEnabled: false,
      protectiveResponses: false,
    },
  },
  friend: {
    stage: 'friend',
    minSessions: 11,
    minTrustScore: 0.5,
    unlockedContent: {
      storyDepth: 'personal',
      directnessAllowed: 0.6,
      vulnerabilitySharing: true,
      insideJokesEnabled: true,
      protectiveResponses: true,
    },
  },
  trusted: {
    stage: 'trusted',
    minSessions: 31,
    minTrustScore: 0.75,
    unlockedContent: {
      storyDepth: 'vulnerable',
      directnessAllowed: 0.8,
      vulnerabilitySharing: true,
      insideJokesEnabled: true,
      protectiveResponses: true,
    },
  },
  confidant: {
    stage: 'confidant',
    minSessions: 50,
    minTrustScore: 0.9,
    unlockedContent: {
      storyDepth: 'deep',
      directnessAllowed: 0.95,
      vulnerabilitySharing: true,
      insideJokesEnabled: true,
      protectiveResponses: true,
    },
  },
};

// ============================================================================
// SHARED MOMENTS
// ============================================================================

/**
 * Types of memorable moments that deepen relationships
 */
export type SharedMomentType =
  | 'breakthrough' // Aha moment, realization
  | 'vulnerability' // User opened up about struggles
  | 'first_vulnerability' // Special case: first time opening up
  | 'trust_demonstration' // User showed explicit trust in Ferni
  | 'growth_recognition' // User acknowledged personal growth
  | 'celebration' // Achievement, win
  | 'crisis_support' // We helped during hard time
  | 'laughter' // Genuine shared humor
  | 'deep_conversation' // Meaningful exchange
  | 'disagreement_resolved' // Conflict worked through together
  | 'callback_resonance' // Memory callback that resonated
  | 'emotional_mirror' // Ferni reflected user's emotion accurately
  | 'protective_moment' // Ferni showed protective care
  | 'silence_held' // Meaningful silence was held
  | 'pattern_insight'; // Pattern surfaced that resonated

/**
 * A single shared moment in the relationship
 */
export interface SharedMoment {
  readonly id: string;
  readonly type: SharedMomentType;
  readonly summary: string;
  readonly sessionNumber: number;
  readonly timestamp: Date;
  readonly userPhrase?: string; // Their exact words (for callbacks)
  readonly significance: number; // 0-1
  readonly topic?: string;
  callbackCount: number;
  lastCallback?: Date;
}

// ============================================================================
// INSIDE JOKES
// ============================================================================

/**
 * Inside jokes are the fingerprint of a relationship.
 * They emerge naturally and become "our things."
 */
export interface InsideJoke {
  readonly id: string;
  readonly trigger: string; // What triggers this reference
  readonly reference: string; // How to reference it
  readonly origin: string; // The story behind it
  readonly createdAt: Date;
  readonly originSession: number;
  usageCount: number;
  resonanceScore: number; // 0-1, how well it lands
  lastUsed?: Date;
  status: 'emerging' | 'established' | 'legacy' | 'retired';
}

// ============================================================================
// CALLBACK TRACKING
// ============================================================================

/**
 * How the user responded to a callback
 */
export type CallbackResponse = 'positive' | 'engaged' | 'neutral' | 'confused' | 'ignored';

/**
 * Track how well our callbacks/references land
 */
export interface CallbackAttempt {
  readonly reference: string;
  readonly type: 'moment' | 'topic' | 'joke' | 'goal' | 'person';
  readonly timestamp: Date;
  readonly userResponse: CallbackResponse;
  readonly threadContinued: boolean;
}

/**
 * Aggregated callback effectiveness
 */
export interface CallbackEffectiveness {
  reference: string;
  totalAttempts: number;
  positiveResponses: number;
  successRate: number; // 0-1
  lastAttempt: Date;
  recommendation: 'use_more' | 'use_occasionally' | 'use_sparingly' | 'retire';
}

// ============================================================================
// EMOTIONAL TRAJECTORY
// ============================================================================

/**
 * Mood tracking for trajectory analysis
 */
export type SessionMood = 'positive' | 'neutral' | 'struggling' | 'crisis';

/**
 * Track emotional patterns over time
 */
export interface EmotionalTrajectory {
  recentSessions: Array<{
    sessionNumber: number;
    date: Date;
    mood: SessionMood;
    topics: string[];
  }>;
  trendDirection: 'improving' | 'stable' | 'declining' | 'variable';
  trendConfidence: number; // 0-1
  concerns: Array<{
    concern: string;
    firstNoticed: Date;
    severity: 'low' | 'medium' | 'high';
    addressed: boolean;
  }>;
  growthAreas: Array<{
    area: string;
    firstNoticed: Date;
    progressLevel: 'emerging' | 'developing' | 'strong';
  }>;
}

// ============================================================================
// MILESTONES
// ============================================================================

/**
 * Types of relationship milestones
 */
export type MilestoneType =
  // Session count milestones
  | 'session_10'
  | 'session_25'
  | 'session_50'
  | 'session_100'
  // Depth milestones
  | 'first_vulnerability'
  | 'first_laugh'
  | 'first_breakthrough'
  | 'first_crisis_support'
  | 'first_callback_landed'
  | 'first_inside_joke'
  // Stage milestones
  | 'reached_friend'
  | 'reached_trusted'
  | 'reached_confidant'
  // Anniversary milestones
  | 'one_month'
  | 'three_months'
  | 'six_months'
  | 'one_year';

/**
 * A relationship milestone
 */
export interface Milestone {
  type: MilestoneType;
  reached: boolean;
  reachedAt?: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
}

// ============================================================================
// RELATIONSHIP MEMORY (The complete picture)
// ============================================================================

/**
 * The complete relationship memory for a user-persona pair
 */
export interface RelationshipMemory {
  readonly userId: string;
  readonly personaId: string;

  // Stage & Trust
  stage: RelationshipStage;
  trustScore: number; // 0-1

  // Session tracking
  totalSessions: number;
  firstSessionAt: Date;
  lastSessionAt: Date;

  // Shared history
  sharedMoments: SharedMoment[];
  insideJokes: InsideJoke[];

  // Callback intelligence
  callbackAttempts: CallbackAttempt[];

  // Emotional tracking
  emotionalTrajectory: EmotionalTrajectory;

  // Milestones
  milestones: Milestone[];

  // Meta
  updatedAt: Date;
}

// ============================================================================
// CONTEXT TYPES (For prompt injection)
// ============================================================================

/**
 * Context for relationship-aware LLM prompts
 */
export interface RelationshipContext {
  stage: RelationshipStage;
  trustScore: number;
  totalSessions: number;
  daysSinceLastSession: number;

  // What to reference
  recentMoments: SharedMoment[];
  activeInsideJokes: InsideJoke[];
  pendingMilestones: Milestone[];
  effectiveCallbacks: CallbackEffectiveness[];

  // Trajectory
  trajectoryDirection: EmotionalTrajectory['trendDirection'];
  activeConcerns: EmotionalTrajectory['concerns'];

  // Unlocked capabilities
  unlockedContent: StageConfig['unlockedContent'];
}

/**
 * A callback opportunity to surface
 */
export interface CallbackOpportunity {
  type: 'moment' | 'joke' | 'topic';
  reference: string;
  summary: string;
  confidence: number; // 0-1
  shouldSurface: boolean;
  suggestedPhrase?: string;
}

// ============================================================================
// SESSION RESULT TYPES
// ============================================================================

/**
 * Result from starting a session
 */
export interface SessionStartResult {
  isReturningUser: boolean;
  daysSinceLastSession: number;
  milestone?: {
    type: MilestoneType;
    message: string;
  };
  stageAdvanced: boolean;
  previousStage?: RelationshipStage;
  currentStage: RelationshipStage;
}

/**
 * Details for recording a moment
 */
export interface MomentDetails {
  userPhrase?: string;
  significance?: number;
  topic?: string;
}
