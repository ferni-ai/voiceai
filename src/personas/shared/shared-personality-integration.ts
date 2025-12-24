/**
 * Shared Personality Integration
 *
 * Main entry point for the "Better Than Human" personality system
 * that works for ALL personas.
 *
 * This orchestrates:
 * - 8-dimensional context assembly
 * - Real-time noticing (superhuman observation)
 * - Expression composition (using persona-specific building blocks)
 * - Cross-session resonance learning
 *
 * Usage:
 *   const result = await sharedPersonality.processTurn(input);
 *   if (result.shouldInject) {
 *     response = result.injectionContent + response;
 *   }
 *
 * @module personas/shared/shared-personality-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ThemeCategory } from '../../services/session-variety-tracker.js';

// Import shared systems
import {
  composeExpression,
  type PersonalityContext,
  type ComposedExpression,
} from './better-than-human-personality.js';
import {
  assemblePersonalityContext,
  type ContextAssemblerInput,
} from './personality-context-assembler.js';
import {
  detectNoticing,
  shouldThrottleNoticing,
  recordNoticing,
  clearNoticingState,
  type NoticingInput,
  type NoticingResult,
} from './realtime-noticing.js';
import {
  prewarmResonanceCache,
  recordResonanceEvent,
  recordUserTopicMention,
  flushResonanceProfile,
  detectEngagement,
} from './personality-resonance-store.js';
import { hasPersonaBuildingBlocks } from './persona-building-blocks.js';
import {
  sharedPersonalityTelemetry,
  type SharedTelemetrySnapshot,
} from './shared-personality-telemetry.js';
import {
  getVariant,
  isFeatureEnabled,
  incrementMetric,
  createSessionMetricsTracker,
  recordSessionEngagement,
  type ExperimentVariant,
  type EngagementMetrics,
} from './personality-ab-testing.js';

const log = createLogger({ module: 'shared-personality-integration' });

// Default experiment ID
const DEFAULT_EXPERIMENT_ID = 'personality_system_v1';

// ============================================================================
// TYPES
// ============================================================================

export interface SharedPersonalityTurnInput {
  // Identifiers
  personaId: string;
  sessionId: string;
  userId?: string;
  turnCount: number;

  // User's input
  userTranscript: string;

  // Voice analysis results
  voiceEmotion?: {
    primary?: string;
    confidence?: number;
    arousal?: number;
    valence?: number;
  };

  // Speech characteristics
  speechRateWPM?: number;
  pauseBeforeMs?: number;

  // Text emotion analysis
  textEmotion?: {
    primary?: string;
    intensity?: number;
    distressLevel?: number;
  };

  // Conversation state
  conversationMomentum?: string;
  currentTopics?: string[];
  lastTopics?: string[];

  // Relationship
  relationshipStage?: string;
  totalConversations?: number;
  sharedVulnerabilities?: number;

  // Turn history (for pattern detection)
  previousTurns?: Array<{
    userTranscript: string;
    speechRate?: number;
    pauseBefore?: number;
    voiceEmotion?: string;
    topics?: string[];
    timestamp: number;
  }>;

  // Previous expression (for resonance learning)
  previousExpression?: {
    theme: ThemeCategory;
    content: string;
  };
}

export interface SharedPersonalityTurnResult {
  /** Whether to inject personality content */
  shouldInject: boolean;

  /** Content to inject (if any) */
  injectionContent?: string;

  /** The composed expression (if any) */
  expression?: ComposedExpression;

  /** The noticing result (if any) */
  noticing?: NoticingResult;

  /** Where to inject */
  injectionPoint: 'before_response' | 'mid_response' | 'after_response' | 'as_acknowledgment';

  /** The full personality context (for debugging/telemetry) */
  context: PersonalityContext;

  /** Persona ID */
  personaId: string;
}

// ============================================================================
// SESSION STATE TRACKING
// ============================================================================

interface SessionState {
  initialized: boolean;
  turnsSinceLastExpression: number;
  lastExpressionTheme?: ThemeCategory;
  lastExpressionTurn?: number;
  // A/B testing
  abTestVariant?: ExperimentVariant;
  abTestExperimentId?: string;
  sessionMetrics?: EngagementMetrics;
  sessionStartTime?: number;
}

const sessionStates = new Map<string, SessionState>();

function getSessionState(sessionId: string): SessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      initialized: false,
      turnsSinceLastExpression: 100, // Start high so first expression can happen
      sessionStartTime: Date.now(),
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

// ============================================================================
// TELEMETRY HELPER
// ============================================================================

/**
 * Helper to record telemetry snapshot
 */
function recordTelemetrySnapshot(
  sessionId: string,
  personaId: string,
  userId: string | undefined,
  turnCount: number,
  timing: { contextAssemblyMs: number; noticingDetectionMs: number; expressionCompositionMs: number; resonanceLookupMs: number },
  totalMs: number,
  context: PersonalityContext,
  decisions: {
    noticingType?: string;
    noticingConfidence?: number;
    noticingShouldAcknowledge?: boolean;
    noticingThrottled?: boolean;
    expressionTheme?: ThemeCategory;
    expressionIntimacy?: number;
    expressionTiming?: string;
    expressionSource: 'building_blocks' | 'resonance_match' | 'none';
    decisionReason: string;
    abTestVariant?: string;
    abTestId?: string;
  },
  output: { injected: boolean; acknowledgment?: string; contentPreview?: string; injectionPoint?: string }
): void {
  sharedPersonalityTelemetry.record(sessionId, {
    sessionId,
    personaId,
    userId,
    turnCount,
    timing: {
      ...timing,
      totalMs,
    },
    context: {
      timeOfDay: context.timeOfDay,
      momentum: context.conversationMomentum,
      emotionalState: context.currentEmotion,
      emotionalIntensity: context.emotionalIntensity,
      distressLevel: context.distressLevel,
      relationshipStage: context.relationshipStage,
      userSpeechPace: context.userSpeechPace,
      voiceEnergyLevel: context.voiceEnergyLevel,
      currentTopic: context.currentTopic,
      topicShiftDetected: context.topicShiftDetected,
    },
    decisions: {
      voiceEmotion: context.currentEmotion,
      noticingType: decisions.noticingType as SharedTelemetrySnapshot['decisions']['noticingType'],
      noticingConfidence: decisions.noticingConfidence,
      noticingShouldAcknowledge: decisions.noticingShouldAcknowledge,
      noticingThrottled: decisions.noticingThrottled,
      expressionTheme: decisions.expressionTheme,
      expressionIntimacy: decisions.expressionIntimacy,
      expressionTiming: decisions.expressionTiming,
      expressionSource: decisions.expressionSource,
      decisionReason: decisions.decisionReason,
      abTestVariant: decisions.abTestVariant,
      abTestId: decisions.abTestId,
    },
    output,
  });
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process a turn for any persona's "Better Than Human" personality
 */
export async function processSharedPersonalityTurn(
  input: SharedPersonalityTurnInput
): Promise<SharedPersonalityTurnResult> {
  const { personaId, sessionId, userId, turnCount } = input;

  // Start overall timing
  const totalTimer = sharedPersonalityTelemetry.startTiming();

  // Check if this persona has building blocks
  if (!hasPersonaBuildingBlocks(personaId)) {
    log.debug({ personaId }, 'Persona has no building blocks, skipping personality');
    return createEmptyResult(input);
  }

  const state = getSessionState(sessionId);

  // ========================================================================
  // A/B TESTING - Determine variant and track metrics
  // ========================================================================
  if (!state.abTestVariant && userId) {
    state.abTestVariant = getVariant(userId, DEFAULT_EXPERIMENT_ID, personaId);
    state.abTestExperimentId = DEFAULT_EXPERIMENT_ID;
    state.sessionMetrics = createSessionMetricsTracker();
    log.debug(
      { userId, personaId, variant: state.abTestVariant },
      'Assigned A/B test variant'
    );
  }

  // If in control group, return minimal result (personality features disabled)
  if (state.abTestVariant === 'control') {
    // Still track basic engagement metrics for control group
    if (state.sessionMetrics) {
      incrementMetric(state.sessionMetrics, 'turnCount');
    }
    return createEmptyResult(input);
  }

  // Track engagement for treatment group
  if (state.sessionMetrics) {
    incrementMetric(state.sessionMetrics, 'turnCount');
  }

  // Timing for each step
  const timing = {
    contextAssemblyMs: 0,
    noticingDetectionMs: 0,
    expressionCompositionMs: 0,
    resonanceLookupMs: 0,
  };

  // Initialize session if needed (prewarm resonance cache)
  if (!state.initialized && userId) {
    await prewarmResonanceCache(userId);
    state.initialized = true;
  }

  // Record previous expression resonance (if any)
  if (input.previousExpression && userId) {
    const engagement = detectEngagement(input.userTranscript, input.previousExpression);
    await recordResonanceEvent(userId, {
      theme: input.previousExpression.theme,
      engagement,
      personaId,
      context: {
        turnCount,
        momentum: input.conversationMomentum || 'cruising',
        emotion: input.textEmotion?.primary,
      },
      timestamp: new Date(),
    });

    // Track A/B test engagement metrics
    if (state.sessionMetrics) {
      switch (engagement) {
        case 'positive':
          incrementMetric(state.sessionMetrics, 'positiveResponses');
          incrementMetric(state.sessionMetrics, 'expressionsEngaged');
          break;
        case 'negative':
          incrementMetric(state.sessionMetrics, 'negativeResponses');
          break;
        default:
          incrementMetric(state.sessionMetrics, 'neutralResponses');
      }
    }
  }

  // Record topic mentions for future callbacks
  if (userId && input.currentTopics) {
    for (const topic of input.currentTopics) {
      await recordUserTopicMention(userId, topic);
    }
  }

  // Assemble 8-dimensional context (with timing)
  const contextTimer = sharedPersonalityTelemetry.startTiming();
  const contextInput: ContextAssemblerInput = {
    personaId,
    sessionId,
    userId,
    turnCount,
    userTranscript: input.userTranscript,
    voiceEmotion: input.voiceEmotion,
    speechRateWPM: input.speechRateWPM,
    pauseBeforeMs: input.pauseBeforeMs,
    textEmotion: input.textEmotion,
    conversationMomentum:
      input.conversationMomentum as ContextAssemblerInput['conversationMomentum'],
    currentTopics: input.currentTopics,
    lastTopics: input.lastTopics,
    relationshipStage: input.relationshipStage,
    totalConversations: input.totalConversations,
    sharedVulnerabilities: input.sharedVulnerabilities,
    previousTurns: input.previousTurns,
  };

  const context = assemblePersonalityContext(contextInput);
  timing.contextAssemblyMs = contextTimer.elapsed();

  // Priority 1: Check for real-time noticing (superhuman observation) with timing
  const noticingTimer = sharedPersonalityTelemetry.startTiming();
  const noticingInput: NoticingInput = {
    sessionId,
    personaId,
    turnCount,
    currentTranscript: input.userTranscript,
    pauseBeforeMs: input.pauseBeforeMs || 0,
    speechRateWPM: input.speechRateWPM,
    voiceEmotion:
      input.voiceEmotion?.primary && input.voiceEmotion?.confidence !== undefined
        ? {
            primary: input.voiceEmotion.primary,
            confidence: input.voiceEmotion.confidence,
            arousal: input.voiceEmotion.arousal,
            valence: input.voiceEmotion.valence,
          }
        : undefined,
    textEmotion:
      input.textEmotion?.primary &&
      input.textEmotion?.intensity !== undefined &&
      input.textEmotion?.distressLevel !== undefined
        ? {
            primary: input.textEmotion.primary,
            intensity: input.textEmotion.intensity,
            distressLevel: input.textEmotion.distressLevel,
          }
        : undefined,
    previousTurns: input.previousTurns,
    currentTopics: input.currentTopics,
  };

  const noticing = detectNoticing(noticingInput);
  const isNoticingThrottled = noticing ? shouldThrottleNoticing(sessionId, turnCount, noticing) : false;
  timing.noticingDetectionMs = noticingTimer.elapsed();

  if (noticing && !isNoticingThrottled) {
    recordNoticing(sessionId, turnCount, noticing.type);

    // Track A/B test metrics for noticing
    if (state.sessionMetrics) {
      incrementMetric(state.sessionMetrics, 'noticingsTriggered');
      if (noticing.type === 'breakthrough_moment') {
        incrementMetric(state.sessionMetrics, 'breakthroughMoments');
      }
    }

    log.debug(
      {
        personaId,
        sessionId,
        noticingType: noticing.type,
        confidence: noticing.confidence,
      },
      '🔍 Noticing detected for shared personality'
    );

    // Record telemetry for noticing result
    recordTelemetrySnapshot(sessionId, personaId, userId, turnCount, timing, totalTimer.elapsed(), context, {
      noticingType: noticing.type,
      noticingConfidence: noticing.confidence,
      noticingShouldAcknowledge: noticing.shouldAcknowledge,
      expressionSource: 'none',
      decisionReason: `Noticing: ${noticing.type}`,
      abTestVariant: state.abTestVariant,
      abTestId: state.abTestExperimentId,
    }, { injected: true, acknowledgment: noticing.acknowledgment, injectionPoint: noticing.timing === 'immediate' ? 'before_response' : 'mid_response' });

    return {
      shouldInject: true,
      injectionContent: `[NOTICING] ${noticing.acknowledgment}`,
      noticing,
      injectionPoint: noticing.timing === 'immediate' ? 'before_response' : 'mid_response',
      context,
      personaId,
    };
  }

  // Priority 2: Check if it's too soon for another expression
  state.turnsSinceLastExpression++;
  if (state.turnsSinceLastExpression < 3 && turnCount > 2) {
    // Record telemetry for cooldown skip
    recordTelemetrySnapshot(sessionId, personaId, userId, turnCount, timing, totalTimer.elapsed(), context, {
      expressionSource: 'none',
      decisionReason: 'Expression cooldown active',
      noticingThrottled: isNoticingThrottled,
    }, { injected: false });
    return createEmptyResult(input, context);
  }

  // Priority 3: Try to compose an expression (with timing)
  const expressionTimer = sharedPersonalityTelemetry.startTiming();
  const expression = composeExpression(context);
  timing.expressionCompositionMs = expressionTimer.elapsed();

  if (expression) {
    state.turnsSinceLastExpression = 0;
    state.lastExpressionTheme = expression.theme;
    state.lastExpressionTurn = turnCount;

    // Track A/B test metrics for expression
    if (state.sessionMetrics) {
      incrementMetric(state.sessionMetrics, 'expressionsInjected');
      if (expression.theme === 'vulnerability') {
        incrementMetric(state.sessionMetrics, 'vulnerabilityMoments');
      }
    }

    log.debug(
      {
        personaId,
        sessionId,
        theme: expression.theme,
        intimacy: expression.intimacyLevel,
        timing: expression.timing,
      },
      '🎭 Expression composed for shared personality'
    );

    const injectionPoint = mapTimingToInjectionPoint(expression.timing);

    // Record telemetry for expression result
    recordTelemetrySnapshot(sessionId, personaId, userId, turnCount, timing, totalTimer.elapsed(), context, {
      expressionTheme: expression.theme,
      expressionIntimacy: expression.intimacyLevel,
      expressionTiming: expression.timing,
      expressionSource: 'building_blocks',
      decisionReason: expression.compositionReason,
      noticingThrottled: isNoticingThrottled,
      abTestVariant: state.abTestVariant,
      abTestId: state.abTestExperimentId,
    }, {
      injected: true,
      contentPreview: expression.content.slice(0, 100),
      injectionPoint,
    });

    return {
      shouldInject: true,
      injectionContent: `[PERSONALITY:${expression.theme.toUpperCase()}] ${expression.content}`,
      expression,
      injectionPoint,
      context,
      personaId,
    };
  }

  // Record telemetry for no expression
  recordTelemetrySnapshot(sessionId, personaId, userId, turnCount, timing, totalTimer.elapsed(), context, {
    expressionSource: 'none',
    decisionReason: 'No expression conditions met',
    noticingThrottled: isNoticingThrottled,
  }, { injected: false });

  return createEmptyResult(input, context);
}

/**
 * Apply personality result to response text
 */
export function applySharedPersonalityToResponse(
  rawResponse: string,
  result: SharedPersonalityTurnResult
): string {
  if (!result.shouldInject || !result.injectionContent) {
    return rawResponse;
  }

  let response = rawResponse;

  switch (result.injectionPoint) {
    case 'before_response':
      response = `${result.injectionContent} <break time="300ms"/>${response}`;
      break;
    case 'as_acknowledgment':
      response = `${result.injectionContent} <break time="200ms"/>${response}`;
      break;
    case 'mid_response':
      // Find a natural break point (after first sentence)
      const sentenceEnd = response.search(/[.!?]\s/);
      if (sentenceEnd > 20 && sentenceEnd < response.length * 0.6) {
        response =
          response.slice(0, sentenceEnd + 1) +
          ` <break time="200ms"/>${result.injectionContent} <break time="200ms"/>` +
          response.slice(sentenceEnd + 1);
      } else {
        // Fallback to end
        response = `${response} <break time="200ms"/>${result.injectionContent}`;
      }
      break;
    case 'after_response':
    default:
      response = `${response} <break time="200ms"/>${result.injectionContent}`;
      break;
  }

  return response.replace(/\s+/g, ' ').trim();
}

/**
 * Check if a persona has shared personality support
 */
export function hasSharedPersonalitySupport(personaId: string): boolean {
  return hasPersonaBuildingBlocks(personaId);
}

/**
 * Cleanup session state and record A/B test metrics
 */
export function cleanupSharedPersonalitySession(sessionId: string, userId?: string): void {
  const state = sessionStates.get(sessionId);

  // Record A/B test session engagement before cleanup
  if (state?.sessionMetrics && state.abTestExperimentId && userId) {
    // Calculate session duration
    state.sessionMetrics.sessionDurationMs = state.sessionStartTime
      ? Date.now() - state.sessionStartTime
      : 0;

    recordSessionEngagement(userId, state.abTestExperimentId, state.sessionMetrics);
    log.debug(
      {
        sessionId,
        userId,
        variant: state.abTestVariant,
        turnCount: state.sessionMetrics.turnCount,
        noticingsTriggered: state.sessionMetrics.noticingsTriggered,
      },
      'Recorded A/B test session engagement'
    );
  }

  sessionStates.delete(sessionId);
  clearNoticingState(sessionId);

  // Flush resonance profile on session end
  if (userId) {
    void flushResonanceProfile(userId);
  }

  log.debug({ sessionId, userId }, 'Cleaned up shared personality session');
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyResult(
  input: SharedPersonalityTurnInput,
  context?: PersonalityContext
): SharedPersonalityTurnResult {
  return {
    shouldInject: false,
    injectionPoint: 'after_response',
    context: context || ({} as PersonalityContext),
    personaId: input.personaId,
  };
}

function mapTimingToInjectionPoint(
  timing: ComposedExpression['timing']
): SharedPersonalityTurnResult['injectionPoint'] {
  switch (timing) {
    case 'immediate':
      return 'before_response';
    case 'after_pause':
      return 'as_acknowledgment';
    case 'mid_response':
      return 'mid_response';
    case 'at_end':
    default:
      return 'after_response';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sharedPersonality = {
  processTurn: processSharedPersonalityTurn,
  applyToResponse: applySharedPersonalityToResponse,
  hasSupport: hasSharedPersonalitySupport,
  cleanup: cleanupSharedPersonalitySession,
};

export default sharedPersonality;
