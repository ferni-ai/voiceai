/**
 * Humanization Effect Type Definitions
 *
 * Defines the composable effect pattern for humanization.
 * Each effect is a self-contained unit that can decide whether to apply
 * and generate its content.
 *
 * @module @ferni/conversation/effects/types
 */

import type { ConversationMood } from '../deep-humanization.js';

// ============================================================================
// CORE EFFECT TYPES
// ============================================================================

/**
 * Core capability categories for humanization
 */
export type HumanizationCapability =
  | 'presence' // Making the agent feel alive
  | 'attunement' // Reading the user
  | 'naturalness' // Speech imperfections
  | 'reactions' // Responding to user input
  | 'memory' // Relationship continuity
  | 'questions' // Follow-up engagement
  | 'silence'; // Meaningful pauses

/**
 * Where the effect content should be placed in the response
 */
export type EffectPlacement =
  | 'prefix' // Before the main response
  | 'suffix' // After the main response
  | 'inline' // Embedded within the response
  | 'interrupt' // Interrupts with emphasis (prefix + break)
  | 'standalone'; // Replaces the response entirely (rare)

/**
 * Configuration for a single effect
 */
export interface EffectConfig {
  /** Probability of firing (0-1) */
  probability: number;
  /** Minimum turns between activations */
  cooldownTurns: number;
  /** Maximum times per session */
  maxPerSession: number;
}

/**
 * Context provided to effects for decision-making
 */
export interface EffectContext {
  // Session info
  personaId: string;
  sessionId: string;
  userId?: string;

  // Turn info
  turnNumber: number;
  sessionMinutes: number;

  // Content
  userMessage: string;
  rawResponse: string;

  // Detected signals
  userEmotion?: string;
  topic?: string;
  wasPersonalSharing?: boolean;
  isSeriousContext?: boolean;

  // Mood state
  mood: ConversationMood;

  // Analysis results
  signals: DetectedSignals;

  // Relationship
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  // Cross-session data
  sessionData?: SessionData;
}

/**
 * Signals detected from user message analysis
 */
export interface DetectedSignals {
  hasEvidence: boolean;
  isBreakthrough: boolean;
  hasHesitation: boolean;
  isDisengaged: boolean;
  isHighlyEngaged: boolean;
  isEmotional: boolean;
  isHeavy: boolean;
  isFirstTurn: boolean;
  userTriggeredSurprise?: boolean;
  userSharedVulnerability?: boolean;
}

/**
 * Cross-session data for memory effects
 */
export interface SessionData {
  /** Topics from previous sessions */
  previousTopics?: string[];
  /** Items to follow up on */
  pendingItems?: Array<{ type: string; content: string; timestamp: Date }>;
  /** Detected patterns/traits */
  patterns?: Array<{ trait: string; count: number }>;
  /** Memorable user quotes */
  memorableQuotes?: string[];
  /** User's stated goals */
  goals?: string[];
  /** People user mentioned */
  peopleMentioned?: string[];
  /** Number of sessions with this user */
  sessionCount?: number;
}

/**
 * Result of effect generation
 */
export interface EffectResult {
  /** The content to inject */
  content: string;
  /** SSML version (if different from content) */
  ssml?: string;
  /** Additional metadata for logging/debugging */
  metadata?: Record<string, unknown>;
}

/**
 * A humanization effect - self-contained unit of humanization logic
 */
export interface HumanizationEffect {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Which capability category this belongs to */
  capability: HumanizationCapability;

  /** Where to place the generated content */
  placement: EffectPlacement;

  /** Configuration (from centralized tuning) */
  config: EffectConfig;

  /**
   * Determine if this effect should be considered for this context
   * This is called BEFORE probability check
   */
  isApplicable(context: EffectContext): boolean;

  /**
   * Generate the effect content
   * Return null if generation fails or isn't appropriate
   */
  generate(context: EffectContext): Promise<EffectResult | null> | EffectResult | null;
}

// ============================================================================
// EFFECT TRACKING
// ============================================================================

/**
 * Tracks effect usage within a session to enforce cooldowns and limits
 */
export interface EffectTracker {
  /** Record that an effect was used */
  recordUsage(effectId: string, turnNumber: number): void;

  /** Check if effect can fire (respects cooldown and maxPerSession) */
  canFire(effectId: string, turnNumber: number, config: EffectConfig): boolean;

  /** Get usage count for an effect */
  getUsageCount(effectId: string): number;

  /** Get last turn an effect was used */
  getLastUsedTurn(effectId: string): number | null;

  /** Reset tracking (for new session) */
  reset(): void;
}

// ============================================================================
// EFFECT COORDINATOR
// ============================================================================

/**
 * Applied effect record
 */
export interface AppliedEffect {
  effectId: string;
  effectName: string;
  capability: HumanizationCapability;
  placement: EffectPlacement;
  content: string;
  ssml?: string;
}

/**
 * Skipped effect record (for debugging)
 */
export interface SkippedEffect {
  effectId: string;
  reason: 'not_applicable' | 'cooldown' | 'max_reached' | 'probability' | 'generation_failed';
}

/**
 * Result of applying effects to a response
 */
export interface EffectApplicationResult {
  /** Modified text */
  text: string;
  /** Modified SSML */
  ssml: string;
  /** Effects that were applied */
  applied: AppliedEffect[];
  /** Effects that were skipped */
  skipped: SkippedEffect[];
}

/**
 * Coordinates effect selection and application
 */
export interface EffectCoordinator {
  /** Register an effect */
  registerEffect(effect: HumanizationEffect): void;

  /** Get all registered effects */
  getEffects(): HumanizationEffect[];

  /** Get applicable effects for a context (checks isApplicable, cooldowns, limits) */
  getApplicableEffects(context: EffectContext): HumanizationEffect[];

  /** Apply effects to a response */
  applyEffects(
    text: string,
    ssml: string,
    effects: HumanizationEffect[],
    context: EffectContext
  ): Promise<EffectApplicationResult>;

  /** Get skipped effects from last application */
  getSkippedEffects(): SkippedEffect[];

  /** Reset for new session */
  reset(): void;
}

// ============================================================================
// FACTORY TYPES
// ============================================================================

/**
 * Factory for creating effects with persona-specific tuning
 */
export type EffectFactory = (personaId: string) => HumanizationEffect;

/**
 * Registry of effect factories
 */
export interface EffectRegistry {
  register(id: string, factory: EffectFactory): void;
  create(id: string, personaId: string): HumanizationEffect | null;
  createAll(personaId: string): HumanizationEffect[];
}

