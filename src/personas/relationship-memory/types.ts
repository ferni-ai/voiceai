/**
 * Relationship Memory Engine Types
 *
 * @deprecated These types have been rebuilt in src/intelligence/relationship/types.ts.
 *
 * The new types are cleaner and aligned with the wired implementation:
 * - Import from 'src/intelligence/relationship/index.js' instead
 * - Types: RelationshipMemory, SharedMoment, CallbackAttempt, etc.
 *
 * This file is kept for reference but should NOT be used for new code.
 *
 * > "Your best friend forgets. We don't."
 *
 * This module defines the schema for tracking the evolving relationship
 * between Ferni and each user. Not just what they said, but what matters.
 *
 * Human relationships are built on shared history, inside jokes, breakthrough
 * moments, and the feeling that someone truly knows you. This system captures
 * that - making Ferni "Better than Human" at remembering what matters.
 */

// ============================================================================
// RELATIONSHIP STAGE (How deep is the bond?)
// ============================================================================

/**
 * Relationship stages mirror real human relationship development.
 * Each stage unlocks different content, vulnerability levels, and interaction styles.
 */
export type RelationshipStage =
  | 'stranger' // First few conversations
  | 'acquaintance' // Getting to know each other
  | 'friend' // Real rapport established
  | 'trusted_advisor' // Deep trust, can be direct
  | 'inner_circle'; // Rare - like family

export interface RelationshipStageConfig {
  stage: RelationshipStage;
  /** Minimum sessions to reach this stage */
  minSessions: number;
  /** Minimum trust score (0-1) */
  minTrustScore: number;
  /** Milestones that can accelerate reaching this stage */
  accelerators: RelationshipMilestoneType[];
  /** Content unlocked at this stage */
  unlockedContent: {
    storyDepth: 'surface' | 'personal' | 'vulnerable' | 'deep_secrets';
    directnessAllowed: number; // 0-1, how blunt can we be
    vulnerabilitySharing: boolean; // Can persona share their own struggles
    insideJokesEnabled: boolean;
    protectiveResponses: boolean; // Can we push back on negative self-talk
    metaRelationshipComments: boolean; // Can we comment on our relationship
  };
}

// ============================================================================
// SHARED MOMENTS (The building blocks of connection)
// ============================================================================

/**
 * Types of memorable moments that deepen relationships
 */
export type SharedMomentType =
  | 'first_vulnerability' // First time they opened up
  | 'breakthrough' // Major insight or progress
  | 'celebration' // Shared joy
  | 'crisis_support' // We were there when it mattered
  | 'laughter' // Genuine shared laughter
  | 'disagreement_resolved' // Worked through conflict
  | 'trust_demonstration' // They trusted us with something big
  | 'growth_recognition' // We noticed their growth
  | 'callback_resonance' // A reference to past really landed
  | 'emotional_mirror' // We accurately reflected their feelings
  | 'protective_moment' // We defended them to themselves
  | 'silence_held' // We sat with them in meaningful silence
  | 'pattern_insight'; // We noticed something they hadn't seen

/**
 * A single shared moment in the relationship
 */
export interface SharedMoment {
  id: string;
  type: SharedMomentType;
  /** When this happened */
  timestamp: Date;
  /** Session number when this occurred */
  sessionNumber: number;
  /** Brief summary of the moment */
  summary: string;
  /** Topic/context */
  topic?: string;
  /** User's words that captured the moment (for callbacks) */
  userPhrase?: string;
  /** Our response that landed well */
  ourResponse?: string;
  /** Emotional significance (0-1) */
  significance: number;
  /** How many times we've referenced this */
  callbackCount: number;
  /** Last time we referenced this */
  lastCallback?: Date;
  /** Tags for easier retrieval */
  tags: string[];
}

// ============================================================================
// INSIDE JOKES (The "Our Things" that make relationships special)
// ============================================================================

/**
 * Inside jokes are the fingerprint of a relationship.
 * They emerge naturally and become "our things."
 */
export interface InsideJoke {
  id: string;
  /** The phrase or reference that triggers this */
  trigger: string;
  /** How to reference it */
  reference: string;
  /** The story behind it */
  origin: string;
  /** When it was established */
  createdAt: Date;
  /** Session when it emerged */
  originSession: number;
  /** How many times we've used it */
  usageCount: number;
  /** How well it lands (updated based on user response) */
  resonanceScore: number; // 0-1
  /** Last time we used it */
  lastUsed?: Date;
  /** User's typical response when we reference it */
  typicalResponse?: 'laugh' | 'engage' | 'neutral' | 'ignore';
  /** Is this still active or has it gone stale? */
  status: 'emerging' | 'established' | 'legacy' | 'retired';
}

/**
 * Seeds for potential inside jokes (things that COULD become inside jokes)
 */
export interface InsideJokeSeed {
  phrase: string;
  context: string;
  sessionNumber: number;
  timestamp: Date;
  potentialScore: number; // How likely to become a real inside joke
  userEngagement: 'high' | 'medium' | 'low';
}

// ============================================================================
// RELATIONSHIP MILESTONES (Significant markers in the relationship)
// ============================================================================

export type RelationshipMilestoneType =
  // Quantity milestones
  | 'session_10'
  | 'session_25'
  | 'session_50'
  | 'session_100'
  | 'session_365' // Daily for a year
  // Depth milestones
  | 'first_vulnerability_shared'
  | 'first_real_laugh'
  | 'first_disagreement'
  | 'first_breakthrough'
  | 'first_crisis_together'
  | 'first_callback_landed'
  | 'first_inside_joke'
  // Trust milestones
  | 'trust_level_friend'
  | 'trust_level_advisor'
  | 'trust_level_inner_circle'
  // Content milestones
  | 'unlocked_personal_stories'
  | 'unlocked_vulnerable_stories'
  | 'unlocked_deep_secrets'
  // Anniversary milestones
  | 'one_month_anniversary'
  | 'three_month_anniversary'
  | 'six_month_anniversary'
  | 'one_year_anniversary';

export interface RelationshipMilestone {
  type: RelationshipMilestoneType;
  reached: boolean;
  reachedAt?: Date;
  acknowledged: boolean; // Have we mentioned this to the user?
  acknowledgedAt?: Date;
}

// ============================================================================
// CALLBACK TRACKING (Learning what references land)
// ============================================================================

/**
 * Track how well our callbacks/references land
 */
export interface CallbackAttempt {
  /** What we referenced */
  reference: string;
  /** Type of reference */
  type: 'moment' | 'topic' | 'joke' | 'goal' | 'person' | 'story';
  /** When we made the reference */
  timestamp: Date;
  /** How the user responded */
  userResponse: 'positive' | 'engaged' | 'neutral' | 'confused' | 'ignored';
  /** Did they continue the thread? */
  threadContinued: boolean;
  /** Context where we used it */
  context: string;
}

/**
 * Aggregated callback effectiveness for a topic/reference
 */
export interface CallbackEffectiveness {
  reference: string;
  totalAttempts: number;
  positiveResponses: number;
  successRate: number; // 0-1
  lastAttempt: Date;
  /** Should we keep using this or retire it? */
  recommendation: 'use_more' | 'use_occasionally' | 'use_sparingly' | 'retire';
}

// ============================================================================
// TEMPORAL PATTERNS (When and how they connect)
// ============================================================================

/**
 * Patterns in when/how the user connects with us
 */
export interface TemporalPattern {
  /** Day of week patterns */
  dayOfWeekFrequency: Record<
    'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
    number
  >;
  /** Time of day patterns */
  timeOfDayFrequency: Record<
    'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night',
    number
  >;
  /** Common topics by time */
  topicsByTime: Record<string, string[]>;
  /** Mood patterns */
  moodByDayOfWeek: Record<string, 'positive' | 'neutral' | 'struggling'>;
  /** Average session length */
  averageSessionLength: number;
  /** Conversation frequency (sessions per week) */
  sessionsPerWeek: number;
  /** Gap patterns (do they disappear sometimes?) */
  typicalGapDays: number;
  longestGap: number;
}

// ============================================================================
// EMOTIONAL TRAJECTORY (How are they doing over time?)
// ============================================================================

export interface EmotionalTrajectory {
  /** Recent sessions (sliding window) */
  recentSessions: Array<{
    sessionNumber: number;
    date: Date;
    overallMood: 'positive' | 'neutral' | 'struggling' | 'crisis';
    energyLevel: 'high' | 'medium' | 'low';
    topics: string[];
  }>;
  /** Trend direction */
  trendDirection: 'improving' | 'stable' | 'declining' | 'variable';
  /** Confidence in trend assessment */
  trendConfidence: number; // 0-1
  /** Concerns we've noticed */
  concerns: Array<{
    concern: string;
    firstNoticed: Date;
    severity: 'low' | 'medium' | 'high';
    addressed: boolean;
  }>;
  /** Growth areas we've seen */
  growthAreas: Array<{
    area: string;
    firstNoticed: Date;
    progressLevel: 'emerging' | 'developing' | 'strong';
  }>;
}

// ============================================================================
// RELATIONSHIP MEMORY (The complete picture)
// ============================================================================

/**
 * The complete relationship memory for a user
 */
export interface RelationshipMemory {
  /** User identifier */
  userId: string;
  /** Persona this memory is for (could be Ferni-specific or team-wide) */
  personaId: string;

  // === STAGE & TRUST ===
  /** Current relationship stage */
  stage: RelationshipStage;
  /** Trust score (0-1) */
  trustScore: number;
  /** How trust score was calculated */
  trustFactors: {
    sessionCount: number;
    vulnerabilityShared: number;
    callbacksLanded: number;
    crisesTogether: number;
    consistencyScore: number;
  };

  // === SHARED HISTORY ===
  /** Memorable moments in our relationship */
  sharedMoments: SharedMoment[];
  /** Inside jokes that have developed */
  insideJokes: InsideJoke[];
  /** Seeds for potential inside jokes */
  insideJokeSeeds: InsideJokeSeed[];
  /** Relationship milestones */
  milestones: RelationshipMilestone[];

  // === CALLBACK INTELLIGENCE ===
  /** Track what references work */
  callbackAttempts: CallbackAttempt[];
  /** Aggregated effectiveness */
  callbackEffectiveness: CallbackEffectiveness[];

  // === TEMPORAL PATTERNS ===
  /** When/how they connect */
  temporalPatterns: TemporalPattern;

  // === EMOTIONAL TRACKING ===
  /** How they're doing over time */
  emotionalTrajectory: EmotionalTrajectory;

  // === META ===
  /** First conversation */
  firstConversation: Date;
  /** Most recent conversation */
  lastConversation: Date;
  /** Total session count */
  totalSessions: number;
  /** Total conversation turns */
  totalTurns: number;
  /** Memory last updated */
  updatedAt: Date;

  // === CONVERSATION HISTORY ===
  /** Recent conversation summaries for context */
  conversationHistory?: Array<{
    sessionId: string;
    timestamp: Date;
    summary: string;
    topics: string[];
    mood: string;
  }>;
}

// ============================================================================
// ENGINE INTERFACES (How to interact with the system)
// ============================================================================

/**
 * Context for generating relationship-aware responses
 */
export interface RelationshipContext {
  stage: RelationshipStage;
  trustScore: number;
  /** Recent shared moments we could reference */
  recentMoments: SharedMoment[];
  /** Active inside jokes we could use */
  activeInsideJokes: InsideJoke[];
  /** Pending milestones to acknowledge */
  pendingMilestones: RelationshipMilestone[];
  /** Effective callbacks to use */
  effectiveCallbacks: CallbackEffectiveness[];
  /** Current emotional trajectory */
  trajectory: EmotionalTrajectory['trendDirection'];
  /** Time context */
  timeContext: {
    dayOfWeek: string;
    timeOfDay: string;
    isTypicalTime: boolean;
    daysSinceLastConversation: number;
  };
  /** Suggested content unlocks */
  unlockedContent: RelationshipStageConfig['unlockedContent'];
}

/**
 * Result from processing a conversation for relationship insights
 */
export interface RelationshipUpdateResult {
  /** New moments detected */
  newMoments: SharedMoment[];
  /** Inside joke seeds detected */
  newSeeds: InsideJokeSeed[];
  /** Seeds that graduated to real jokes */
  graduatedJokes: InsideJoke[];
  /** Callbacks that landed */
  successfulCallbacks: CallbackAttempt[];
  /** Stage changes */
  stageChange?: {
    from: RelationshipStage;
    to: RelationshipStage;
  };
  /** Milestones reached */
  newMilestones: RelationshipMilestoneType[];
  /** Trajectory update */
  trajectoryUpdate: {
    direction: EmotionalTrajectory['trendDirection'];
    concernsAdded: string[];
    growthNoticed: string[];
  };
}

/**
 * Prompt injection for relationship-aware responses
 */
export interface RelationshipPromptInjection {
  /** Preamble about our relationship history */
  relationshipPreamble: string;
  /** Specific moments we could reference */
  callbackSuggestions: string[];
  /** Inside jokes available */
  insideJokeOptions: string[];
  /** Trajectory observations */
  trajectoryNotes: string;
  /** Stage-appropriate guidance */
  stageGuidance: string;
  /** Milestone acknowledgments pending */
  pendingAcknowledgments: string[];
}
