/**
 * Turn Processor Types
 *
 * Shared types for turn processing logic.
 */

import type { llm } from '@livekit/agents';
// Import base type from shared types to avoid circular dependency
// (intelligence/context-builders → ... → agents/processors → intelligence/context-builders)
import type { HumanizingResultBase } from '../../types/humanizing-types.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import type { ConversationAnalysis, SessionServices } from '../../services/index.js';
import type { UserData } from '../shared/types.js';

// Re-export for convenience
export type MessageAnalysis = ConversationAnalysis;

// ============================================================================
// TURN CONTEXT - Input to turn processor
// ============================================================================

/**
 * Context provided to the turn processor for each user turn
 */
export interface TurnContext {
  /** The chat context for injecting messages */
  turnCtx: llm.ChatContext;
  /** The user's message text */
  userText: string;
  /** Current persona configuration */
  persona: PersonaConfig;
  /** Bundle runtime for rich persona behaviors */
  bundleRuntime?: BundleRuntimeEngine;
  /** Session services for analysis, memory, etc. */
  services: SessionServices;
  /** Mutable user data for the session */
  userData: UserData;
  /** Logger instance */
  logger: {
    info: (data: Record<string, unknown>, msg: string) => void;
    debug: (data: Record<string, unknown>, msg: string) => void;
    warn: (data: Record<string, unknown>, msg: string) => void;
  };
}

// ============================================================================
// ANALYSIS RESULT - Output from message analysis
// ============================================================================

/**
 * Result of analyzing the user's message
 */
export interface TurnAnalysisResult {
  /** Raw message analysis from services */
  analysis: MessageAnalysis;
  /** Current topic detected */
  currentTopic: string | undefined;
  /** Previous topic from last turn */
  previousTopic: string | undefined;
  /** Whether topic changed */
  topicChanged: boolean;
}

// ============================================================================
// CONTEXT INJECTIONS - Guidance for LLM
// ============================================================================

/**
 * A single context injection to add to the LLM prompt
 */
export interface ContextInjection {
  /** Category of the injection (for filtering/logging) */
  category: string;
  /** The injection content */
  content: string;
  /** Priority (higher = more important) */
  priority: number;
}

/**
 * Result of building all context injections
 */
export interface ContextBuildResult {
  /** All context injections to add */
  injections: ContextInjection[];
  /** Humanizing result if applicable */
  humanizingResult?: HumanizingResultBase;
  /** Time taken to build context in ms */
  elapsedMs: number;
}

// ============================================================================
// EMOTIONAL STATE - Emotional context for the turn
// ============================================================================

/**
 * Emotional state for the current turn
 */
export interface EmotionalState {
  /** Primary emotion detected */
  primary: string;
  /** Emotion intensity 0-1 */
  intensity: number;
  /** Distress level 0-1 */
  distressLevel: number;
  /** Emotional arc trajectory */
  trajectory: 'improving' | 'stable' | 'declining' | 'volatile' | 'unknown';
  /** Recommended response approach */
  responseGuidance?: string;
  /** Transition phrase for emotional shifts */
  transitionPhrase?: string;
}

// ============================================================================
// RESPONSE GUIDANCE - How to shape the response
// ============================================================================

/**
 * Guidance for response generation
 */
export interface ResponseGuidance {
  /** Recommended response length */
  length: {
    min: number;
    max: number;
    guidance: string;
  };
  /** Topic transition guidance if topic changed */
  topicTransition?: string;
  /** Story opportunity if detected */
  storyOpportunity?: {
    story: string;
    transitionPhrase: string;
  };
  /** Humor guidance */
  humor?: {
    shouldAttempt: boolean;
    type?: string;
    avoid?: string[];
  };
  /** Pacing based on user's speaking rhythm */
  pacing?: string;
}

// ============================================================================
// IDENTITY CONTEXT - For post-handoff identity reinforcement
// ============================================================================

/**
 * Identity context for the current agent
 */
export interface IdentityContext {
  /** Whether identity reinforcement is needed */
  needsReinforcement: boolean;
  /** The identity injection content */
  injection?: string;
  /** Active agent ID */
  activeAgentId: string;
  /** Session persona ID */
  sessionPersonaId: string;
}

// ============================================================================
// BUNDLE RUNTIME CONTEXT - Rich persona behaviors
// ============================================================================

/**
 * Context from bundle runtime processing
 */
export interface BundleRuntimeContext {
  /** Current persona mode */
  currentMode: string;
  /** Previous mode (for transitions) */
  previousMode?: string;
  /** Mode transition phrase */
  modeTransitionPhrase?: string;
  /** Situational response if detected */
  situationalResponse?: {
    type: 'celebration' | 'condolence';
    situation: string;
    response: string;
    avoidPhrases?: string[];
  };
  /** Pushback detection result */
  pushbackDetected?: {
    type: string;
    response: string;
  };
}

// ============================================================================
// TURN PROCESSOR RESULT - Full output
// ============================================================================

/**
 * Complete result of processing a user turn
 */
export interface TurnProcessorResult {
  /** Analysis of the user's message */
  analysis: TurnAnalysisResult;
  /** Context injections for LLM */
  context: ContextBuildResult;
  /** Emotional state */
  emotional: EmotionalState;
  /** Response guidance */
  response: ResponseGuidance;
  /** Identity context */
  identity: IdentityContext;
  /** Bundle runtime context */
  bundleRuntime?: BundleRuntimeContext;
  /** Whether an easter egg was triggered */
  easterEgg?: {
    type: string;
    response: string;
  };
  /** Value capture event for monetization (optional contribution prompt) */
  valueCapture?: {
    /** Type of value detected (e.g., 'habit_milestone', 'financial_gain') */
    type: string;
    /** ID of the value event for contribution tracking */
    eventId: string;
    /** Whether to prompt for contribution post-conversation */
    shouldPrompt: boolean;
  };
  /** Advanced humanization guidance (10 deep capabilities) */
  advancedHumanization?: {
    /** Response prefix (repair phrase, milestone, affirmation) */
    responsePrefix?: string;
    /** Response suffix (hope, affirmation) */
    responseSuffix?: string;
    /** Whether to stop giving direct advice */
    stopDirectAdvice: boolean;
    /** Tone guidance for response */
    toneGuidance: string;
    /** Length guidance for response */
    lengthGuidance: 'shorter' | 'normal' | 'longer';
  };
}

// ============================================================================
// CACHED MODULE TYPES - For dynamic imports
// ============================================================================

// NOTE: Using explicit function signatures instead of `typeof import(...)`
// to avoid circular dependency with intelligence/context-builders.
// The circular chain was:
// intelligence/context-builders → ... → agents/processors/types → intelligence/context-builders

/** Function signature for buildConversationContext */
type BuildConversationContextFn = (input: unknown) => Promise<ContextInjection[]>;

/** Function signature for formatContextForPrompt */
type FormatContextForPromptFn = (
  injections: ContextInjection[],
  options?: {
    maxLength?: number;
    includeHints?: boolean;
    highEmotionMode?: boolean;
  }
) => string;

/** Function signature for shouldUseHighEmotionMode */
type ShouldUseHighEmotionModeFn = (analysis: unknown) => boolean;

/** Function signature for checkForEasterEgg */
type CheckForEasterEggFn = (
  message: string,
  personaId: string,
  context?: Record<string, unknown>
) => { type: string; response: string } | null;

/** Function signature for getTaskManager */
type GetTaskManagerFn = (options?: Record<string, unknown>) => unknown;

/**
 * Cached module references for performance
 */
export interface CachedModules {
  buildConversationContext: BuildConversationContextFn | null;
  formatContextForPrompt: FormatContextForPromptFn | null;
  // BETTER-THAN-HUMAN: High emotion mode detection for context prioritization
  shouldUseHighEmotionMode: ShouldUseHighEmotionModeFn | null;
  checkForEasterEgg: CheckForEasterEggFn | null;
  getTaskManager: GetTaskManagerFn | null;
}
