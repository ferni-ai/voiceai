/**
 * Ferni Personality Integration
 *
 * Unified entry point for the "Better Than Human" personality system.
 * This module orchestrates all personality subsystems:
 *
 * 1. Context Assembly - Gather all signals
 * 2. Real-time Noticing - Detect what just happened
 * 3. Expression Composition - Generate appropriate response
 * 4. Resonance Learning - Track what works
 *
 * Usage:
 *   const personality = await processTurnPersonality(input);
 *   if (personality) {
 *     // Inject personality.expression into response
 *     // Apply personality.noticing if present
 *   }
 *
 * @module personas/bundles/ferni/personality-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  composeExpression,
  type ComposedExpression,
  type PersonalityContext,
} from './better-than-human-personality.js';
import {
  assemblePersonalityContext,
  type ContextAssemblerInput,
} from './personality-context-assembler.js';
import {
  detectNoticing,
  shouldThrottleNoticing,
  recordNoticing,
  type NoticingInput,
  type NoticingResult,
  type NoticingType,
} from './realtime-noticing.js';
import {
  recordResonanceEvent,
  recordUserTopicMention,
  detectEngagement,
  prewarmResonanceCache,
} from './personality-resonance-store.js';
import {
  getBestExpression,
  prewarmCache,
  requestEmotionalExpressions,
  requestExpression,
  getStats as getLLMStats,
  markExpressionEngagement,
  loadPersistedExpressions,
  type ExpressionContext,
} from './llm-expression-generator.js';
import type { ThemeCategory } from '../../../services/session-variety-tracker.js';
import type { BehaviorEvent, BehaviorEventType, BehaviorMode } from '../../../types/behavior-types.js';

// NEW: Telemetry & Transparency
import {
  personalityTelemetry,
  startTiming,
  recordTelemetry,
  type TelemetrySnapshot,
} from './personality-telemetry.js';

// NEW: Voice Emotion Integration
import {
  voiceEmotionPersonality,
  getVoiceEmotionAdjustment,
  fromVoiceEmotionResult,
  type VoicePersonalityAdjustment,
} from './voice-emotion-personality.js';

// NEW: Memory Callbacks
import {
  memoryPersonalityBridge,
  type MemoryCallback,
} from './memory-personality-bridge.js';

// NEW: Cross-Persona Learning
import { crossPersonaLearning } from '../../shared/cross-persona-learning.js';

// NEW: Voice Pace Integration
import {
  voicePacePersonality,
  getPacePersonalityAdjustment,
  applyPaceToExpression,
  fromVoicePaceData,
  type PacePersonalityAdjustment,
} from './voice-pace-personality.js';

const log = createLogger({ module: 'ferni-personality-integration' });

// ============================================================================
// BEHAVIOR SYSTEM INTEGRATION
// Maps personality noticings to behavior events for the bidirectional loop
// ============================================================================

/**
 * Map a personality noticing to a behavior event type
 */
function mapNoticingToBehaviorEventType(noticingType: NoticingType): BehaviorEventType | null {
  const eventMap: Partial<Record<NoticingType, BehaviorEventType>> = {
    'significant_pause': 'extended_silence',
    'energy_drop': 'energy_drop',
    'energy_rise': 'energy_spike',
    'mismatch': 'emotional_shift',
    'topic_deflection': 'emotional_shift',
    'breakthrough_moment': 'breakthrough_moment',
    'protective_language': 'vulnerability_shared',
    'speech_rate_change': 'speech_pace_changed',
  };
  
  return eventMap[noticingType] ?? null;
}

/**
 * Convert a personality noticing to a behavior event
 */
export function noticingToBehaviorEvent(noticing: NoticingResult): BehaviorEvent | null {
  const eventType = mapNoticingToBehaviorEventType(noticing.type);
  if (!eventType) return null;
  
  // Determine suggested behavior mode based on noticing type
  const suggestedMode: BehaviorMode | undefined = (() => {
    switch (noticing.type) {
      case 'significant_pause':
      case 'protective_language':
        return 'presence';
      case 'energy_drop':
        return 'grounding';
      case 'mismatch':
        return 'deep_listening';
      case 'breakthrough_moment':
        return 'celebration';
      default:
        return undefined;
    }
  })();
  
  return {
    event: eventType,
    data: {
      noticingType: noticing.type,
      observation: noticing.observation,
      confidence: noticing.confidence,
      subtlety: noticing.subtlety,
    },
    timestamp: Date.now(),
    suggestedResponse: suggestedMode ? { mode: suggestedMode } : undefined,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface PersonalityTurnInput {
  // Session
  sessionId: string;
  userId?: string;
  turnCount: number;

  // Current transcript
  userTranscript: string;

  // Voice signals
  pauseBeforeMs?: number;
  speechRateWPM?: number;
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };

  // Analysis results
  textEmotion?: {
    primary: string;
    intensity: number;
    distressLevel: number;
    valence?: 'positive' | 'negative' | 'neutral';
    trajectory?: 'rising' | 'falling' | 'stable';
  };

  // Conversation state
  momentum?: 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing' | 'stalled';
  topics?: string[];
  lastTopic?: string;

  // Relationship
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  totalConversations?: number;
  sharedVulnerabilities?: number;

  // Turn history
  previousTurns?: Array<{
    userTranscript: string;
    speechRate?: number;
    pauseBefore?: number;
    voiceEmotion?: string;
    topics?: string[];
  }>;

  // Flags
  isHeavyTopic?: boolean;
  wasPersonalSharing?: boolean;
  userIntent?: 'sharing' | 'asking' | 'venting' | 'exploring' | 'celebrating' | 'requesting';

  // Previous expression (for resonance tracking)
  previousExpression?: {
    theme: ThemeCategory;
    content: string;
  };
}

export interface PersonalityTurnResult {
  // What to express (if any)
  expression: ComposedExpression | null;

  // What was noticed (if any)
  noticing: NoticingResult | null;

  // Full context (for debugging/logging)
  context: PersonalityContext;

  // Should this turn have personality injection?
  shouldInject: boolean;

  // Where to inject
  injectionPoint: 'before_response' | 'mid_response' | 'after_response' | 'as_acknowledgment';

  // NEW: Behavior event to dispatch (for bidirectional behavior system)
  behaviorEvent: BehaviorEvent | null;
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process a conversation turn for personality injection
 *
 * This is the main entry point. Call this after analysis but before
 * generating the response.
 */
export async function processTurnPersonality(
  input: PersonalityTurnInput
): Promise<PersonalityTurnResult> {
  // ═══════════════════════════════════════════════════════════════════════════
  // TELEMETRY: Start timing
  // ═══════════════════════════════════════════════════════════════════════════
  const totalTimer = startTiming();
  const contextTimer = startTiming();

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Record resonance & cross-persona learning (FIRE-AND-FORGET)
  // ═══════════════════════════════════════════════════════════════════════════
  let previousEngagement: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (input.userId && input.previousExpression) {
    previousEngagement = detectEngagement(input.userTranscript, input.previousExpression);

    // Fire-and-forget resonance recording
    void recordResonanceEvent(input.userId, {
      theme: input.previousExpression.theme,
      engagement: previousEngagement,
      context: {
        turnCount: input.turnCount,
        momentum: input.momentum || 'cruising',
        emotion: input.textEmotion?.primary,
      },
      timestamp: new Date(),
    });

    // Mark expression engagement for persistence
    const isPositive = previousEngagement === 'positive';
    const exprId =
      (input.previousExpression as { id?: string }).id ||
      `${input.previousExpression.theme}-${input.turnCount}`;
    void markExpressionEngagement(input.userId, exprId, isPositive);

    // NEW: Cross-persona learning - share successful expressions
    if (previousEngagement === 'positive') {
      crossPersonaLearning.learnFromExpression(
        input.previousExpression.content,
        'ferni',
        input.previousExpression.theme,
        {
          emotionalState: input.textEmotion?.primary,
          relationshipStage: input.relationshipStage,
          momentum: input.momentum,
        },
        'positive'
      );
    }
  }

  // STEP 2: Record topic mentions for future callbacks (FIRE-AND-FORGET)
  if (input.userId && input.topics && input.topics.length > 0) {
    for (const topic of input.topics.slice(0, 3)) {
      void recordUserTopicMention(input.userId, topic);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Assemble full context (SYNC - fast)
  // ═══════════════════════════════════════════════════════════════════════════
  const contextInput: ContextAssemblerInput = {
    sessionId: input.sessionId,
    userId: input.userId,
    turnCount: input.turnCount,
    emotion: input.textEmotion,
    momentum: input.momentum,
    topics: input.topics,
    lastTopic: input.lastTopic,
    userSpeechRate: input.speechRateWPM,
    pauseBeforeMs: input.pauseBeforeMs,
    voiceEmotionConfidence: input.voiceEmotion?.confidence,
    relationshipStage: input.relationshipStage,
    totalConversations: input.totalConversations,
    sharedVulnerabilities: input.sharedVulnerabilities,
    userIntent: input.userIntent,
    wasPersonalSharing: input.wasPersonalSharing,
    isHeavyTopic: input.isHeavyTopic,
  };

  const context = assemblePersonalityContext(contextInput);
  const contextMs = contextTimer.elapsed();

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3.5: Voice Emotion Adjustment (NEW!)
  // ═══════════════════════════════════════════════════════════════════════════
  const voiceContext = fromVoiceEmotionResult(input.voiceEmotion);
  const voiceAdjustment = getVoiceEmotionAdjustment(voiceContext);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Detect real-time noticing
  // ═══════════════════════════════════════════════════════════════════════════
  const noticingTimer = startTiming();

  const noticingInput: NoticingInput = {
    sessionId: input.sessionId,
    turnCount: input.turnCount,
    currentTranscript: input.userTranscript,
    pauseBeforeMs: input.pauseBeforeMs || 0,
    speechRateWPM: input.speechRateWPM,
    voiceEmotion: input.voiceEmotion,
    textEmotion: input.textEmotion,
    previousTurns: input.previousTurns,
    currentTopics: input.topics,
  };

  let noticing = detectNoticing(noticingInput);

  // Check if we should throttle noticing
  if (noticing && shouldThrottleNoticing(input.sessionId, input.turnCount, noticing)) {
    log.debug({ sessionId: input.sessionId }, 'Throttling noticing');
    noticing = null;
  }

  // Record the noticing if we're using it
  if (noticing && noticing.shouldAcknowledge) {
    recordNoticing(input.sessionId, input.turnCount, noticing.type);
  }

  const noticingMs = noticingTimer.elapsed();

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Compose expression (with voice emotion adjustment)
  // ═══════════════════════════════════════════════════════════════════════════
  const expressionTimer = startTiming();
  let expression: ComposedExpression | null = null;
  let expressionSource: 'llm' | 'composed' | 'pool' | 'memory' | 'cross-persona' | 'none' = 'none';
  let decisionReason = 'No expression needed';

  // Check for memory callbacks first (NEW!)
  if (input.userId && !noticing) {
    const timing = input.turnCount === 1 ? 'greeting' : 'when_relevant';
    const memoryCallback = memoryPersonalityBridge.getBest(
      input.userId,
      timing,
      input.textEmotion?.primary
    );

    if (memoryCallback) {
      const exprFromMemory = memoryPersonalityBridge.toExpression(memoryCallback);
      expression = {
        content: exprFromMemory.content,
        theme: exprFromMemory.theme,
        intimacyLevel: 0.6,
        compositionReason: `memory-${memoryCallback.type}`,
        shouldBeSubtle: false,
        timing: exprFromMemory.timing,
      };
      expressionSource = 'memory';
      decisionReason = `Memory callback: ${memoryCallback.type}`;
      memoryPersonalityBridge.markDelivered(input.userId, memoryCallback);
    }
  }

  // If no memory callback, try regular expression flow
  if (!expression && !(noticing && noticing.type !== 'breakthrough_moment')) {
    const llmContext: ExpressionContext = {
      emotion: input.textEmotion?.primary,
      topic: input.topics?.[0],
      timeOfDay: context.timeOfDay,
      relationshipStage: input.relationshipStage,
      recentTopics: input.topics || [],
      momentum: mapInputMomentumToExpressionMomentum(input.momentum),
      isHeavyTopic: input.isHeavyTopic,
    };

    // Pick theme with voice emotion adjustment (NEW!)
    let theme = pickExpressionTheme(context, input);

    // Adjust theme based on voice emotion
    if (voiceAdjustment.avoidThemes.includes(theme)) {
      // Voice says avoid this theme - pick a preferred one instead
      const preferred = voiceAdjustment.preferredThemes[0];
      if (preferred) {
        theme = preferred;
        decisionReason = `Voice emotion (${voiceContext.primary}) adjusted theme to ${theme}`;
      }
    }

    // Try cross-persona learned patterns first (NEW!)
    const crossPersonaPatterns = crossPersonaLearning.getBestPatternsForPersona(
      'ferni',
      theme,
      {
        emotionalState: input.textEmotion?.primary,
        relationshipStage: input.relationshipStage,
        momentum: input.momentum,
      },
      1
    );

    if (crossPersonaPatterns.length > 0 && Math.random() < 0.3) {
      // 30% chance to use cross-persona learned pattern
      const { pattern, adaptation } = crossPersonaPatterns[0];
      expression = {
        content: adaptation,
        theme,
        intimacyLevel: 0.5,
        compositionReason: `cross-persona-${pattern.sourcePersona}`,
        shouldBeSubtle: theme !== 'vulnerability',
        timing: voiceAdjustment.suggestedInjectionPoint || 'mid_response',
      };
      expressionSource = 'cross-persona';
      decisionReason = `Cross-persona pattern from ${pattern.sourcePersona}`;
    } else {
      // Standard expression lookup
      const bestExpr = getBestExpression(
        input.userId || 'anonymous',
        input.sessionId,
        theme,
        llmContext
      );

      if (bestExpr) {
        expression = {
          content: bestExpr.ssml || bestExpr.content,
          theme,
          intimacyLevel: voiceAdjustment.prioritizeAcknowledgment ? 0.6 : 0.5,
          compositionReason: `${bestExpr.source}-generated`,
          shouldBeSubtle: voiceAdjustment.preferShorterExpressions || theme !== 'vulnerability',
          timing: voiceAdjustment.suggestedInjectionPoint || 'mid_response',
        };
        expressionSource = bestExpr.source;
        decisionReason = `${bestExpr.source} expression for ${theme}`;
      } else {
        expression = composeExpression(context);
        expressionSource = 'composed';
        decisionReason = 'Composed fallback';
      }
    }

    // Request more LLM expressions for this emotional context (background)
    if (input.textEmotion?.primary) {
      requestEmotionalExpressions(input.textEmotion.primary, llmContext);
    }
  } else if (noticing && noticing.type !== 'breakthrough_moment') {
    decisionReason = `Focus on noticing: ${noticing.type}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5b: Apply voice pace adjustment to expression
  // ═══════════════════════════════════════════════════════════════════════════
  if (expression) {
    const paceContext = fromVoicePaceData(input.speechRateWPM);
    const paceAdjustment = getPacePersonalityAdjustment(paceContext);

    // Apply pace adjustment - truncate long expressions for fast talkers
    expression.content = applyPaceToExpression(expression.content, paceAdjustment);

    // Adjust timing based on pace
    if (paceAdjustment.preferredTiming && expression.timing !== 'immediate') {
      expression.timing = paceAdjustment.preferredTiming as typeof expression.timing;
    }

    log.debug(
      {
        pace: paceContext.paceCategory,
        adjustment: paceAdjustment.expressionLength,
        maxWords: paceAdjustment.maxExpressionWords,
      },
      '⏱️ Applied pace adjustment'
    );
  }

  const expressionMs = expressionTimer.elapsed();

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: Generate behavior event from noticing
  // ═══════════════════════════════════════════════════════════════════════════
  const behaviorEvent = noticing ? noticingToBehaviorEvent(noticing) : null;

  // ═══════════════════════════════════════════════════════════════════════════
  // TELEMETRY: Record timing and decisions
  // ═══════════════════════════════════════════════════════════════════════════
  const totalMs = totalTimer.elapsed();

  recordTelemetry(input.sessionId, {
    sessionId: input.sessionId,
    turnCount: input.turnCount,
    timing: {
      contextAssemblyMs: contextMs,
      noticingDetectionMs: noticingMs,
      expressionLookupMs: expressionMs,
      totalMs,
    },
    decisions: {
      timeOfDay: context.timeOfDay,
      momentum: context.conversationMomentum,
      emotionalState: input.textEmotion?.primary || 'unknown',
      relationshipStage: input.relationshipStage || 'acquaintance',
      distressLevel: context.distressLevel,
      voiceEmotion: voiceContext.primary,
      voiceConfidence: voiceContext.confidence,
      speechPace: voiceContext.speechPace,
      energyLevel: voiceContext.energyLevel,
      noticingType: noticing?.type,
      noticingConfidence: noticing?.confidence,
      noticingShouldAcknowledge: noticing?.shouldAcknowledge,
      expressionTheme: expression?.theme,
      expressionSource,
      injectionPoint: expression?.timing,
      decisionReason,
    },
    output: {
      injected: Boolean(expression || (noticing && noticing.shouldAcknowledge)),
      content: expression?.content,
      acknowledgment: noticing?.acknowledgment,
    },
  });

  // STEP 7: Determine injection strategy
  const result: PersonalityTurnResult = {
    expression,
    noticing,
    context,
    shouldInject: Boolean(expression || (noticing && noticing.shouldAcknowledge)),
    injectionPoint: determineInjectionPoint(expression, noticing),
    behaviorEvent,
  };

  log.debug(
    {
      sessionId: input.sessionId,
      turnCount: input.turnCount,
      hasExpression: !!expression,
      hasNoticing: !!noticing,
      shouldInject: result.shouldInject,
      processingMs: totalMs,
    },
    'Processed personality turn'
  );

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map input momentum to ExpressionContext momentum type
 */
function mapInputMomentumToExpressionMomentum(
  momentum?: string
): 'opening' | 'building' | 'cruising' | 'winding_down' | undefined {
  switch (momentum) {
    case 'opening':
      return 'opening';
    case 'building':
    case 'peaking':
    case 'intimate':
      return 'building';
    case 'closing':
    case 'stalled':
      return 'winding_down';
    case 'cruising':
    default:
      return 'cruising';
  }
}

/**
 * Pick the best expression theme based on context
 */
function pickExpressionTheme(
  context: PersonalityContext,
  input: PersonalityTurnInput
): ThemeCategory {
  // Vulnerability for heavy topics with strong relationship
  if (
    input.isHeavyTopic &&
    (input.relationshipStage === 'friend' || input.relationshipStage === 'trusted_advisor')
  ) {
    return 'vulnerability';
  }

  // Sensory moment when detecting something
  if (input.textEmotion?.intensity && input.textEmotion.intensity > 0.6) {
    return 'sensory_moment';
  }

  // Time-appropriate themes
  if (context.timeOfDay === 'dawn' || context.timeOfDay === 'morning') {
    return Math.random() > 0.5 ? 'warm_drinks' : 'physical_habits';
  }

  if (context.timeOfDay === 'late_night' || context.timeOfDay === 'night') {
    return Math.random() > 0.5 ? 'nature_connection' : 'music_taste';
  }

  // Default variety
  const lightThemes: ThemeCategory[] = [
    'warm_drinks',
    'physical_habits',
    'global_traveler',
    'music_taste',
    'nature_connection',
    'quirky_interests',
  ];

  return lightThemes[Math.floor(Math.random() * lightThemes.length)];
}

function determineInjectionPoint(
  expression: ComposedExpression | null,
  noticing: NoticingResult | null
): PersonalityTurnResult['injectionPoint'] {
  // Noticing always comes before response (acknowledgment)
  if (noticing && noticing.shouldAcknowledge) {
    return 'as_acknowledgment';
  }

  // Expression timing based on composition
  if (expression) {
    switch (expression.timing) {
      case 'immediate':
        return 'before_response';
      case 'mid_response':
        return 'mid_response';
      case 'at_end':
      case 'after_pause':
        return 'after_response';
    }
  }

  return 'mid_response';
}

// ============================================================================
// RESPONSE TRANSFORMATION
// ============================================================================

/**
 * Apply personality to a response
 *
 * Takes the raw response and weaves in personality elements
 */
export function applyPersonalityToResponse(
  rawResponse: string,
  personalityResult: PersonalityTurnResult
): string {
  if (!personalityResult.shouldInject) {
    return rawResponse;
  }

  let result = rawResponse;

  // Apply noticing (acknowledgment before response)
  if (personalityResult.noticing && personalityResult.noticing.shouldAcknowledge) {
    const acknowledgment = personalityResult.noticing.acknowledgment;
    result = `${acknowledgment} <break time="300ms"/>${result}`;
  }

  // Apply expression
  if (personalityResult.expression) {
    const expr = personalityResult.expression;
    const content = expr.shouldBeSubtle
      ? `<break time="150ms"/>${expr.content}`
      : expr.content;

    switch (personalityResult.injectionPoint) {
      case 'before_response':
        result = `${content} <break time="200ms"/>${result}`;
        break;

      case 'mid_response': {
        // Find a natural break point (after first sentence or two)
        const sentences = result.match(/[^.!?]+[.!?]+/g) || [result];
        if (sentences.length >= 2) {
          const midPoint = Math.min(2, Math.floor(sentences.length / 2));
          result = [
            ...sentences.slice(0, midPoint),
            ` ${content} <break time="150ms"/>`,
            ...sentences.slice(midPoint),
          ].join(' ');
        } else {
          // Short response - add at end
          result = `${result} <break time="150ms"/>${content}`;
        }
        break;
      }

      case 'after_response':
        result = `${result} <break time="200ms"/>${content}`;
        break;

      case 'as_acknowledgment':
        // Already handled by noticing
        break;
    }
  }

  // Clean up extra spaces
  return result.replace(/\s+/g, ' ').trim();
}

// ============================================================================
// CLEANUP
// ============================================================================

import { clearNoticingState } from './realtime-noticing.js';
import { clearSessionVariety } from './dynamic-personality.js';
import { clearCache as clearLLMCache } from './llm-expression-generator.js';

/**
 * Cleanup session state
 */
export function cleanupPersonalitySession(sessionId: string): void {
  clearNoticingState(sessionId);
  clearSessionVariety(sessionId);
  clearLLMCache(sessionId);
  log.debug({ sessionId }, 'Cleaned up personality session');
}

/**
 * Pre-warm the LLM expression cache for a session
 * Call this at session start for better expression availability
 *
 * This does two things:
 * 1. Loads persisted high-engagement expressions from Firestore
 * 2. Queues new LLM expression generation for common themes
 */
export async function prewarmPersonalitySession(
  userId: string | undefined,
  context: Pick<PersonalityTurnInput, 'relationshipStage' | 'textEmotion'>
): Promise<void> {
  const expressionContext: ExpressionContext = {
    relationshipStage: context.relationshipStage,
    emotion: context.textEmotion?.primary,
  };

  // 1. Prewarm resonance cache (CRITICAL for hot path performance)
  // This loads from Firestore once, so getCachedResonance() is instant
  if (userId) {
    void prewarmResonanceCache(userId);
  }

  // 2. Load persisted high-engagement expressions from Firestore
  if (userId) {
    const persisted = await loadPersistedExpressions(userId);
    if (persisted.length > 0) {
      log.debug({ userId, count: persisted.length }, 'Loaded persisted expressions');
    }
  }

  // 3. Queue new LLM expression generation for common themes
  prewarmCache(expressionContext);
  log.debug('Pre-warming personality expression cache');
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // From better-than-human-personality
  composeExpression,
  type ComposedExpression,
  type PersonalityContext,

  // From personality-context-assembler
  assemblePersonalityContext,
  type ContextAssemblerInput,

  // From realtime-noticing
  detectNoticing,
  type NoticingResult,

  // From personality-resonance-store
  recordResonanceEvent,
  detectEngagement,
};

export const ferniPersonality = {
  processTurn: processTurnPersonality,
  applyToResponse: applyPersonalityToResponse,
  cleanup: cleanupPersonalitySession,
  prewarm: prewarmPersonalitySession,
  /** Get stats about LLM expression generation */
  getLLMStats,
};

export default ferniPersonality;

