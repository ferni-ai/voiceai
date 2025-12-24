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
import { assemblePersonalityContext, type ContextAssemblerInput } from './personality-context-assembler.js';
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

const log = createLogger({ module: 'shared-personality-integration' });

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
}

const sessionStates = new Map<string, SessionState>();

function getSessionState(sessionId: string): SessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      initialized: false,
      turnsSinceLastExpression: 100, // Start high so first expression can happen
    };
    sessionStates.set(sessionId, state);
  }
  return state;
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

  // Check if this persona has building blocks
  if (!hasPersonaBuildingBlocks(personaId)) {
    log.debug({ personaId }, 'Persona has no building blocks, skipping personality');
    return createEmptyResult(input);
  }

  const state = getSessionState(sessionId);

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
  }

  // Record topic mentions for future callbacks
  if (userId && input.currentTopics) {
    for (const topic of input.currentTopics) {
      await recordUserTopicMention(userId, topic);
    }
  }

  // Assemble 8-dimensional context
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
    conversationMomentum: input.conversationMomentum as ContextAssemblerInput['conversationMomentum'],
    currentTopics: input.currentTopics,
    lastTopics: input.lastTopics,
    relationshipStage: input.relationshipStage,
    totalConversations: input.totalConversations,
    sharedVulnerabilities: input.sharedVulnerabilities,
    previousTurns: input.previousTurns,
  };

  const context = assemblePersonalityContext(contextInput);

  // Priority 1: Check for real-time noticing (superhuman observation)
  const noticingInput: NoticingInput = {
    sessionId,
    personaId,
    turnCount,
    currentTranscript: input.userTranscript,
    pauseBeforeMs: input.pauseBeforeMs || 0,
    speechRateWPM: input.speechRateWPM,
    voiceEmotion: input.voiceEmotion?.primary && input.voiceEmotion?.confidence !== undefined
      ? {
          primary: input.voiceEmotion.primary,
          confidence: input.voiceEmotion.confidence,
          arousal: input.voiceEmotion.arousal,
          valence: input.voiceEmotion.valence,
        }
      : undefined,
    textEmotion: input.textEmotion?.primary && input.textEmotion?.intensity !== undefined && input.textEmotion?.distressLevel !== undefined
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
  if (noticing && !shouldThrottleNoticing(sessionId, turnCount, noticing)) {
    recordNoticing(sessionId, turnCount, noticing.type);

    log.debug(
      {
        personaId,
        sessionId,
        noticingType: noticing.type,
        confidence: noticing.confidence,
      },
      '🔍 Noticing detected for shared personality'
    );

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
    return createEmptyResult(input, context);
  }

  // Priority 3: Try to compose an expression
  const expression = composeExpression(context);
  if (expression) {
    state.turnsSinceLastExpression = 0;
    state.lastExpressionTheme = expression.theme;
    state.lastExpressionTurn = turnCount;

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

    return {
      shouldInject: true,
      injectionContent: `[PERSONALITY:${expression.theme.toUpperCase()}] ${expression.content}`,
      expression,
      injectionPoint,
      context,
      personaId,
    };
  }

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
 * Cleanup session state
 */
export function cleanupSharedPersonalitySession(sessionId: string, userId?: string): void {
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

