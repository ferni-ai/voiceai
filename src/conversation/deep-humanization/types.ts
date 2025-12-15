/**
 * Deep Humanization Types
 *
 * Type definitions for the deep humanization system that makes agents feel ALIVE.
 *
 * @module @ferni/conversation/deep-humanization/types
 */

// ============================================================================
// MOOD TYPES
// ============================================================================

/**
 * Tracks the agent's mood throughout a conversation
 */
export interface ConversationMood {
  /** Current energy level (0-1) */
  energy: number;
  /** Current engagement level (0-1) */
  engagement: number;
  /** Accumulated emotional load */
  emotionalLoad: number;
  /** Number of heavy topics discussed */
  heavyTopicCount: number;
  /** Is this an emotional moment? */
  inEmotionalMoment: boolean;
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Context provided to the deep humanization engine
 */
export interface HumanizationContext {
  personaId: string;
  turnCount: number;
  sessionMinutes: number;
  currentHour: number;
  userMessage: string;
  lastAgentMessage?: string;
  recentTopics: string[];
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  sessionData?: SessionMemory;
}

/**
 * Cross-session memory for personalization
 */
export interface SessionMemory {
  /** Topics discussed in previous sessions */
  previousTopics?: string[];
  /** Pending items to follow up on */
  pendingItems?: Array<{ type: string; content: string; timestamp: Date }>;
  /** Running jokes / patterns observed */
  patterns?: Array<{ trait: string; count: number }>;
  /** Memorable quotes from user */
  memorableQuotes?: string[];
  /** Goals user mentioned */
  goals?: string[];
  /** People user mentioned */
  peopleMentioned?: string[];
  /** Number of sessions */
  sessionCount?: number;
}

// ============================================================================
// INJECTION TYPES
// ============================================================================

/**
 * Types of humanization that can be injected
 */
export type HumanizationType =
  | 'mood_signal'
  | 'spontaneous_thought'
  | 'physical_presence'
  | 'running_joke'
  | 'mind_change'
  | 'engagement_signal'
  | 'excitement_interruption'
  | 'breath_sound'
  | 'anticipation'
  | 'contradiction'
  | 'first_turn_notice'
  | 'playfulness'
  | 'live_reaction'
  | 'none';

/**
 * A humanization to inject into a response
 */
export interface HumanizationInjection {
  type: HumanizationType;
  content: string;
  placement: 'prefix' | 'suffix' | 'standalone' | 'interrupt';
  probability: number;
  cooldownTurns: number;
}

// ============================================================================
// SIGNAL TYPES
// ============================================================================

/**
 * Signals detected from user message for humanization decisions
 */
export interface HumanizationSignals {
  userPresentedEvidence?: boolean;
  isBreakthroughMoment?: boolean;
  isGivingAdvice?: boolean;
  isDisengaged?: boolean;
  isHighlyEngaged?: boolean;
  userTriggeredSurprise?: boolean;
  userSharedVulnerability?: boolean;
}

// ============================================================================
// GENERATOR TYPES
// ============================================================================

/**
 * Configuration for a humanization generator
 */
export interface GeneratorConfig {
  cooldownTurns: number;
  maxPerSession: number;
  baseProbability: number;
}

/**
 * Result from a humanization generator
 */
export type GeneratorResult = HumanizationInjection | null;

/**
 * A humanization generator function
 */
export type HumanizationGenerator = (
  context: HumanizationContext,
  mood: ConversationMood,
  signals: HumanizationSignals
) => Promise<GeneratorResult>;

// ============================================================================
// BEHAVIOR CONTENT TYPES
// ============================================================================

/**
 * Behavior content loaded from JSON files
 */
export type BehaviorContent = Record<string, unknown>;

/**
 * Cache for loaded behavior content
 */
export type BehaviorCache = Map<string, BehaviorContent>;

