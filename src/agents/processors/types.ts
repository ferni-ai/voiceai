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
import type { HolisticContextSummary } from '../../tools/semantic-router/types.js';

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
 * Crisis detection result from safety guard
 */
export interface CrisisDetection {
  /** Whether a crisis was detected */
  isCrisis: boolean;
  /** Crisis severity 0-1 (0.7+ is crisis threshold) */
  severity: number;
  /** Detected indicators (explicit_crisis_language, voice_high_distress, etc.) */
  indicators: string[];
  /** Pre-generated crisis response if severity is high */
  suggestedResponse?: string;
  /** Whether to override LLM response entirely */
  shouldOverrideLLM: boolean;
}

// ============================================================================
// SEMANTIC ROUTING RESULT - Pre-LLM tool routing
// ============================================================================

/**
 * Semantic routing result for direct tool execution
 *
 * When the semantic router has high confidence, we can bypass the LLM
 * entirely and execute tools directly. This provides:
 * - <20ms latency for common tool requests
 * - Reliable tool execution without JSON parsing
 * - Graceful fallback to LLM for conversation
 */
export interface SemanticRoutingResult {
  /** Whether semantic routing was performed */
  routed: boolean;

  /** Whether to bypass LLM and use tool result directly */
  bypassLLM: boolean;

  /** Tool result if bypassing LLM */
  toolResult?: {
    toolId: string;
    output: string;
    success: boolean;
    speakableResponse: string;
  };

  /** Routing metrics */
  metrics: {
    latencyMs: number;
    cacheHit: boolean;
    confidence: number;
    matchPath: 'pattern' | 'keyword' | 'embedding' | 'combined' | 'none';
  };

  /**
   * Which routing path was taken - for observability.
   * Helps understand whether semantic router handled the call or fell back to JSON workaround.
   */
  routingPath:
    | 'semantic_auto_execute' // Semantic router auto-executed (LLM bypassed)
    | 'semantic_hint' // Semantic router hinted to LLM
    | 'semantic_confirm' // Semantic router requested confirmation
    | 'semantic_conversation' // Semantic router determined no tool needed
    | 'json_fallback' // Fell back to JSON workaround
    | 'disabled' // Semantic routing disabled
    | 'error'; // Routing error

  /**
   * 🧠 Holistic NLU context from semantic routing.
   * Contains relationship detection, emotional state, urgency, and crisis signals.
   * Can be used to enhance crisis detection or personalize responses.
   */
  holisticContext?: HolisticContextSummary;
}

/**
 * Trust context for post-response validation
 * Used by "Better Than Human" trust enforcement system
 */
export interface TrustContextSummary {
  /** Unsaid signals detected (false "I'm fine", deflection, etc.) */
  hasEmotionalMismatch: boolean;
  /** Topics to avoid (boundary tracking) */
  topicsToAvoid: string[];
  /** Growth reflection available (for acknowledgment check) */
  hasGrowthReflection: boolean;
  /** Celebration opportunity (small win to acknowledge) */
  hasCelebration: boolean;
  /** Proactive outreach ("thinking of you") available */
  hasProactiveOutreach: boolean;
  /** Proactive outreach data for frontend notification */
  proactiveOutreach?: {
    type: string;
    message: string;
    personaId?: string;
    context?: string;
  };
}

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
  /** 🚨 SAFETY: Crisis detection result - CANNOT be ignored */
  crisis?: CrisisDetection;
  /**
   * 🤝 TRUST: Trust context summary for post-response validation
   * Used by downstream systems to verify LLM properly addressed trust signals.
   * NOTE: Actual enforcement happens via context injections (pre-response).
   * This is for monitoring/learning from post-response quality.
   */
  trustContext?: TrustContextSummary;

  /**
   * 🎯 SEMANTIC ROUTING: Pre-LLM tool routing result
   * When present with bypassLLM=true, the caller should use toolResult.speakableResponse
   * directly instead of sending to the LLM.
   */
  semanticRouting?: SemanticRoutingResult;
}

// ============================================================================
// CACHED MODULE TYPES - For dynamic imports
// ============================================================================

// NOTE: Type definitions for cached modules have been moved to their
// respective cached-modules.ts files. The CachedModules interface below
// is kept for backward compatibility but is no longer used by the
// processors module (which now uses its own local interface).

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Easter egg result type (matches EasterEggResult from personas/easter-eggs.ts)
 * NOTE: response is optional, triggered indicates if an egg was activated
 */
export interface EasterEggResultType {
  type: string;
  response?: string;
  triggered: boolean;
}

/** Function signature for checkForEasterEgg */
type CheckForEasterEggFn = (
  message: string,
  personaId: string,
  context?: Record<string, unknown>
) => EasterEggResultType;

/** Function signature for getTaskManager */
type GetTaskManagerFn = (options?: Record<string, unknown>) => any;

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Cached module references for performance
 * @deprecated Use the interfaces in cached-modules.ts instead
 */
export interface CachedModules {
  checkForEasterEgg: CheckForEasterEggFn | null;
  getTaskManager: GetTaskManagerFn | null;
}
