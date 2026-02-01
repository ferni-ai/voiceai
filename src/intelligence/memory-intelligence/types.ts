/**
 * Memory Intelligence Types
 *
 * Type definitions for the Memory Intelligence layer that coordinates
 * when, what, and how to surface memories during conversations.
 *
 * Philosophy: Memory intelligence isn't about having perfect recall.
 * It's about knowing when a friend would naturally bring something up
 * and how they'd phrase it warmly.
 *
 * @module intelligence/memory-intelligence/types
 */

import type { StoredMemory, MemoryType, RecallResult } from '../../memory/unified-store/types.js';

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * The main Memory Intelligence interface
 *
 * Single entry point for all memory-related decisions during conversation.
 */
export interface MemoryIntelligence {
  /**
   * Prepare memory context for a conversation turn
   * This is the main entry point called by the turn processor
   */
  prepareForTurn(context: TurnContext): Promise<MemoryPreparedContext>;

  /**
   * Decide if a specific memory should be surfaced
   */
  shouldSurfaceMemory(
    memory: StoredMemory,
    context: ConversationContext,
    userState: UserState
  ): Promise<TimingDecision>;

  /**
   * Generate natural phrasing for referencing a memory
   */
  generateNaturalReference(
    memory: StoredMemory,
    style: PhrasingStyle,
    persona: PersonaId
  ): Promise<string>;

  /**
   * Record how user responded to a surfaced memory
   */
  recordUserResponse(
    memoryIds: string[],
    response: UserResponseSignal
  ): Promise<void>;

  /**
   * Get user's memory profile (learned preferences)
   */
  getUserProfile(userId: string): Promise<UserMemoryProfile>;

  /**
   * Initialize for a session
   */
  initSession(userId: string): Promise<void>;

  /**
   * Cleanup after session
   */
  endSession(userId: string): Promise<void>;
}

// ============================================================================
// TURN CONTEXT
// ============================================================================

/**
 * Context provided for each conversation turn
 */
export interface TurnContext {
  /** User ID */
  userId: string;

  /** Current user message */
  userText: string;

  /** Current conversation context */
  conversationContext: ConversationContext;

  /** User's emotional state */
  emotionalState: EmotionalState;

  /** Current turn number in conversation */
  turnCount: number;

  /** Active persona */
  persona: PersonaId;

  /** Session ID */
  sessionId?: string;

  /** Topics detected in current message */
  detectedTopics?: string[];

  /** People mentioned in current message */
  peopleMentioned?: string[];

  /** Is this a crisis situation? */
  crisisDetected?: boolean;
}

/**
 * Conversation context from the session
 */
export interface ConversationContext {
  /** Recent messages (last 5-10) */
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;

  /** Main topics discussed so far */
  topicsDiscussed: string[];

  /** Current conversation theme/direction */
  currentTheme?: string;

  /** Trust level established */
  trustLevel: TrustLevel;

  /** Turns since last memory was surfaced */
  turnsSinceLastMemory: number;

  /** Memories already surfaced this session */
  memoriesSurfacedThisSession: string[];

  /** Session start time */
  sessionStartTime: Date;
}

/**
 * User's current emotional state
 */
export interface EmotionalState {
  /** Primary emotion detected */
  primary: string;

  /** Emotional intensity (0-1) */
  intensity: number;

  /** Emotional valence (-1 to 1, negative to positive) */
  valence: number;

  /** Is user in a vulnerable state? */
  isVulnerable: boolean;

  /** Emotional trajectory (improving, declining, stable) */
  trajectory: 'improving' | 'declining' | 'stable';
}

/**
 * User's current state/capacity
 */
export interface UserState {
  /** Energy level (0-1) */
  energy: number;

  /** Cognitive load (0-1, how much they're processing) */
  cognitiveLoad: number;

  /** Time of day context */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late_night';

  /** Day of week */
  dayOfWeek: number;

  /** Is user in a hurry? */
  isRushed: boolean;

  /** User's apparent mood */
  mood: 'positive' | 'neutral' | 'negative' | 'mixed';
}

// ============================================================================
// TIMING
// ============================================================================

/**
 * Decision about whether to surface a memory
 */
export interface TimingDecision {
  /** Should we surface this memory? */
  shouldSurface: boolean;

  /** Confidence in this decision (0-1) */
  confidence: number;

  /** Why we made this decision */
  reason: string;

  /** What triggered this decision */
  triggerType?: SurfacingTrigger;

  /** Recommended priority if surfacing */
  priority?: 'immediate' | 'soon' | 'when_natural' | 'hold';

  /** Any blocking conditions that prevented surfacing */
  blockingConditions?: string[];

  /** Recommended phrasing style */
  recommendedStyle?: PhrasingStyle;
}

/**
 * What triggered the surfacing decision
 */
export type SurfacingTrigger =
  | 'topic_connection'      // Strong topic match
  | 'commitment_followup'   // Time to check on commitment
  | 'emotional_callback'    // Similar emotional context
  | 'person_mentioned'      // Person from memory mentioned
  | 'time_based'            // Temporal trigger (anniversary, etc.)
  | 'narrative_continuation' // Continuing a life story
  | 'proactive_insight'     // Superhuman pattern detection
  | 'user_requested';       // User explicitly asked

/**
 * Blocking conditions that prevent surfacing
 */
export type BlockingCondition =
  | 'crisis_active'
  | 'emotional_intensity_high'
  | 'user_energy_low'
  | 'recently_surfaced'
  | 'conversation_shallow'
  | 'trust_insufficient'
  | 'user_deflected_before'
  | 'topic_sensitive';

/**
 * Timing rule definition
 */
export interface TimingRule {
  /** Rule name */
  name: string;

  /** Rule type */
  type: 'blocking' | 'triggering';

  /** Condition function */
  condition: (ctx: TimingRuleContext) => boolean;

  /** Why this rule exists */
  reason: string;

  /** Priority for triggering rules */
  priority?: 'high' | 'medium' | 'low';

  /** Minimum trust level required */
  minTrustLevel?: TrustLevel;
}

/**
 * Context for timing rule evaluation
 */
export interface TimingRuleContext {
  /** From TurnContext */
  turnCount: number;
  crisisDetected: boolean;
  turnsSinceLastMemory: number;

  /** From EmotionalState */
  emotionalIntensity: number;
  emotionalValence: number;
  isVulnerable: boolean;

  /** From UserState */
  userEnergy: number;
  cognitiveLoad: number;
  timeOfDay: string;
  isRushed: boolean;

  /** Memory-specific */
  topicRelevance: number;
  emotionalSimilarity: number;
  hasOutstandingCommitment: boolean;
  daysSinceCommitment?: number;
  personMentioned: boolean;
  hasPersonHistory: boolean;

  /** Trust */
  trustLevel: TrustLevel;

  /** User history */
  hasDeflectedTopic: boolean;
  topicSensitivity: number;
}

// ============================================================================
// PHRASING
// ============================================================================

/**
 * Style for phrasing memory references
 */
export type PhrasingStyle =
  | 'warm_recall'       // "I remember you mentioning..."
  | 'gentle_callback'   // "That reminds me of when you shared..."
  | 'curious_connection' // "Isn't that connected to...?"
  | 'supportive_reference' // "You've been through this before..."
  | 'celebratory'       // "This is just like when you..."
  | 'analytical'        // "Looking at the pattern..."
  | 'matter_of_fact'    // Direct reference without framing
  | 'questioning';      // "Didn't you mention...?"

/**
 * Persona identifiers
 */
export type PersonaId = 'ferni' | 'peter' | 'maya' | 'jordan' | 'alex' | 'nayan';

/**
 * Trust levels
 */
export type TrustLevel = 'new' | 'developing' | 'established' | 'deep';

/**
 * Phrasing template
 */
export interface PhrasingTemplate {
  /** Template ID */
  id: string;

  /** Style this template implements */
  style: PhrasingStyle;

  /** Personas this template works for */
  personas: PersonaId[];

  /** Template string with placeholders */
  template: string;

  /** When to use this template */
  useWhen: {
    emotionalContext?: string[];
    memoryTypes?: MemoryType[];
    trustLevels?: TrustLevel[];
  };

  /** Example output */
  example: string;
}

/**
 * Generated phrasing result
 */
export interface PhrasingResult {
  /** The generated phrase */
  phrase: string;

  /** Style used */
  style: PhrasingStyle;

  /** Template used */
  templateId: string;

  /** Confidence in appropriateness (0-1) */
  confidence: number;

  /** Alternative phrasings */
  alternatives?: string[];
}

// ============================================================================
// LEARNING
// ============================================================================

/**
 * Signal about how user responded to surfaced memory
 */
export interface UserResponseSignal {
  /** Response type */
  type: UserResponseType;

  /** Intensity of response (0-1) */
  intensity: number;

  /** Topics involved */
  topics?: string[];

  /** Additional context */
  context?: string;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Types of user responses to surfaced memories
 */
export type UserResponseType =
  | 'engaged'           // User expanded on the memory
  | 'acknowledged'      // User briefly acknowledged
  | 'deflected'         // User changed topic
  | 'emotional_positive' // Positive emotional reaction
  | 'emotional_negative' // Negative emotional reaction
  | 'corrected'         // User corrected the memory
  | 'ignored'           // User didn't acknowledge
  | 'requested_more';   // User wanted more details

/**
 * User's learned memory preferences
 */
export interface UserMemoryProfile {
  /** User ID */
  userId: string;

  /** When profile was last updated */
  lastUpdated: Date;

  /** Receptivity patterns */
  receptivityPatterns: {
    /** Receptivity by hour (0-23) */
    byTimeOfDay: Map<number, number>;
    /** Receptivity by conversation depth (turn count buckets) */
    byConversationDepth: Map<string, number>;
    /** Receptivity by emotional state */
    byEmotionalState: Map<string, number>;
  };

  /** Response patterns */
  responsePatterns: {
    /** Topics user welcomes callbacks about */
    topicsWelcomed: string[];
    /** Topics user deflects from */
    topicsDeflected: string[];
    /** Preferred phrasing style */
    preferredPhrasingStyle: PhrasingStyle;
    /** Average engagement level (0-1) */
    averageEngagement: number;
  };

  /** Sensitive topics to avoid or handle carefully */
  sensitiveTopics: Set<string>;

  /** Ideal number of memory recalls per session */
  idealRecallFrequency: number;

  /** Trust level with the system */
  trustLevel: TrustLevel;

  /** Total memories surfaced */
  totalMemoriesSurfaced: number;

  /** Engagement rate (engaged / total) */
  engagementRate: number;
}

// ============================================================================
// PREPARED CONTEXT
// ============================================================================

/**
 * Result of prepareForTurn - the memory context ready for injection
 */
export interface MemoryPreparedContext {
  /** Should we inject memory context this turn? */
  shouldInject: boolean;

  /** Formatted content for injection */
  formattedContent: string;

  /** Priority of this injection */
  priority: 'critical' | 'high' | 'normal' | 'low';

  /** Memories that were selected for potential surfacing */
  selectedMemories: ScoredMemoryForTurn[];

  /** IDs of memories being surfaced (for tracking responses) */
  surfacedMemoryIds: string[];

  /** Why we made these selections */
  selectionReason: string;

  /** Timing decision details */
  timingDecision: TimingDecision;

  /** User's memory profile */
  userProfile: UserMemoryProfile;

  /** Debug information */
  debug?: {
    memoriesConsidered: number;
    memoriesFiltered: number;
    recallTimeMs: number;
    timingTimeMs: number;
    phrasingTimeMs: number;
  };
}

/**
 * Memory scored for this specific turn
 */
export interface ScoredMemoryForTurn {
  /** The memory */
  memory: StoredMemory;

  /** Overall relevance score for this turn (0-1) */
  relevanceScore: number;

  /** Score breakdown */
  scoreBreakdown: {
    semantic: number;
    topical: number;
    emotional: number;
    temporal: number;
    relationship: number;
  };

  /** Timing decision for this memory */
  timingDecision: TimingDecision;

  /** Generated phrasing if selected */
  phrasing?: PhrasingResult;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for memory intelligence
 */
export interface MemoryIntelligenceConfig {
  /** Maximum memories to consider per turn */
  maxMemoriesToConsider: number;

  /** Minimum relevance score to consider (0-1) */
  minRelevanceScore: number;

  /** Maximum memories to surface per turn */
  maxMemoriesPerTurn: number;

  /** Minimum turns between memory surfacing */
  minTurnsBetweenSurfacing: number;

  /** Default phrasing style */
  defaultPhrasingStyle: PhrasingStyle;

  /** Enable learning from responses */
  enableLearning: boolean;

  /** Enable proactive insights */
  enableProactiveInsights: boolean;

  /** Timing rule overrides */
  timingOverrides?: Partial<Record<BlockingCondition, boolean>>;
}

/**
 * Default configuration
 */
export const DEFAULT_MEMORY_INTELLIGENCE_CONFIG: MemoryIntelligenceConfig = {
  maxMemoriesToConsider: 20,
  minRelevanceScore: 0.3,
  maxMemoriesPerTurn: 2,
  minTurnsBetweenSurfacing: 3,
  defaultPhrasingStyle: 'warm_recall',
  enableLearning: true,
  enableProactiveInsights: true,
};

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Event emitted when memory is surfaced
 */
export interface MemorySurfacedEvent {
  userId: string;
  sessionId: string;
  memoryId: string;
  memoryType: MemoryType;
  trigger: SurfacingTrigger;
  style: PhrasingStyle;
  persona: PersonaId;
  timestamp: Date;
}

/**
 * Event emitted when user responds to memory
 */
export interface MemoryResponseEvent {
  userId: string;
  sessionId: string;
  memoryId: string;
  responseType: UserResponseType;
  responseIntensity: number;
  timestamp: Date;
}
