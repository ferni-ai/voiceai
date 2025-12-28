/**
 * Active Learning Integration for Semantic Router
 *
 * Connects the turn processor to the active learning system to enable:
 * 1. Recording successful routings (reinforcement)
 * 2. Detecting and learning from implicit corrections (LLM used different tool)
 * 3. Detecting and learning from explicit corrections (user says "no, I meant X")
 * 4. Enhancing future routing with learned patterns
 *
 * LEARNING SIGNALS:
 * - Success: Semantic router predicted tool X, tool X was executed successfully
 * - Implicit correction: Semantic router predicted tool X, but LLM used tool Y
 * - Explicit correction: User says "no, I wanted..." after tool execution
 * - User vocabulary: User consistently says phrase P for tool T
 *
 * @module tools/semantic-router/integration/active-learning-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  enhanceWithLearning,
  recordOutcome,
  handleExplicitCorrection,
  recordToolCoOccurrence,
  predictToolChain,
  type LearningContext,
  type LearningOutcome,
  type EnhancedRouting,
} from '../advanced/learning-loop.js';
import {
  recordCorrection,
  recordImplicitCorrection,
  recordToolUsage,
  getUserPreferences,
  initializeCorrectionStore,
} from '../learning/index.js';
import type { SemanticRouterResult, ToolMatch } from '../types.js';
import type { TurnRouterResult, RoutingContext, RoutingPath } from './turn-processor-integration.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'semantic-router:active-learning' });

// ============================================================================
// TYPES
// ============================================================================

/** Tracking state for a single turn */
interface TurnLearningState {
  userId: string;
  sessionId: string;
  personaId: string;
  inputText: string;
  inputLocale: string;
  routingResult?: SemanticRouterResult;
  predictedTool: string | null;
  predictedConfidence: number;
  executedTool: string | null;
  wasSemanticExecution: boolean;
  startTime: number;
  analyticsEventId?: string;
}

/** Session state for multi-turn learning */
interface SessionLearningState {
  userId: string;
  sessionId: string;
  recentTools: string[];
  conversationHistory: Array<{ role: string; text: string }>;
  turnStates: Map<string, TurnLearningState>;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/** Active session states (keyed by sessionId) */
const sessionStates = new Map<string, SessionLearningState>();

/** Maximum tools to track in recent history */
const MAX_RECENT_TOOLS = 10;

/** Maximum turns to track per session */
const MAX_TRACKED_TURNS = 50;

/** Get or create session state */
function getSessionState(userId: string, sessionId: string): SessionLearningState {
  let state = sessionStates.get(sessionId);

  if (!state) {
    state = {
      userId,
      sessionId,
      recentTools: [],
      conversationHistory: [],
      turnStates: new Map(),
    };
    sessionStates.set(sessionId, state);
  }

  return state;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize the active learning system
 * Call this at agent startup
 */
export async function initializeActiveLearning(): Promise<void> {
  if (initialized) return;

  try {
    // Initialize the correction store (Firestore persistence)
    await initializeCorrectionStore();
    initialized = true;
    log.info('Active learning system initialized');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize active learning');
    // Continue without persistence - will use in-memory only
    initialized = true;
  }
}

// ============================================================================
// PRE-ROUTING ENHANCEMENT
// ============================================================================

/**
 * Enhance routing with learned patterns BEFORE semantic routing
 *
 * Call this before startSemanticRouting() to apply user-specific boosts.
 *
 * @returns Tool boosts to apply to routing
 */
export async function getPreRoutingEnhancements(
  userId: string,
  inputText: string
): Promise<{
  toolBoosts: Map<string, number>;
  userVocabularyMatch?: { toolId: string; confidence: number };
}> {
  const toolBoosts = new Map<string, number>();

  try {
    // Get learned tool preferences for this user
    const prefs = getUserPreferences(userId);

    for (const [toolId, boost] of prefs.toolBoosts.entries()) {
      if (boost !== 0) {
        toolBoosts.set(toolId, boost);
      }
    }

    // Check for user vocabulary matches
    // This is handled in enhanceWithLearning, but we return early signals here
    log.debug(
      { userId, boostCount: toolBoosts.size },
      'Applied pre-routing enhancements'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get pre-routing enhancements');
  }

  return { toolBoosts };
}

// ============================================================================
// TURN TRACKING
// ============================================================================

/**
 * Start tracking a turn for learning
 *
 * Call this at the start of processTurn()
 */
export function startTurnTracking(
  context: RoutingContext,
  inputText: string,
  locale = 'en'
): string {
  const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session = getSessionState(context.userId, context.sessionId);

  // Create turn state
  const turnState: TurnLearningState = {
    userId: context.userId,
    sessionId: context.sessionId,
    personaId: context.personaId,
    inputText,
    inputLocale: locale,
    predictedTool: null,
    predictedConfidence: 0,
    executedTool: null,
    wasSemanticExecution: false,
    startTime: Date.now(),
  };

  // Add to session
  session.turnStates.set(turnId, turnState);

  // Cleanup old turns
  if (session.turnStates.size > MAX_TRACKED_TURNS) {
    const oldestKey = session.turnStates.keys().next().value;
    if (oldestKey) session.turnStates.delete(oldestKey);
  }

  // Add to conversation history
  session.conversationHistory.push({ role: 'user', text: inputText });

  return turnId;
}

/**
 * Record semantic routing result for a turn
 *
 * Call this after startSemanticRouting() returns
 */
export function recordSemanticRoutingResult(
  turnId: string,
  sessionId: string,
  routerResult: TurnRouterResult
): void {
  const session = sessionStates.get(sessionId);
  if (!session) return;

  const turnState = session.turnStates.get(turnId);
  if (!turnState) return;

  turnState.routingResult = routerResult.routeResult;
  turnState.analyticsEventId = routerResult.analyticsEventId;

  if (routerResult.routeResult?.matches?.length) {
    const topMatch = routerResult.routeResult.matches[0];
    turnState.predictedTool = topMatch.toolId;
    turnState.predictedConfidence = topMatch.confidence;
  }

  if (routerResult.executed && routerResult.routeResult?.matches?.[0]) {
    turnState.executedTool = routerResult.routeResult.matches[0].toolId;
    turnState.wasSemanticExecution = true;
  }
}

/**
 * Record LLM tool execution for a turn
 *
 * Call this when LLM executes a tool (via JSON function calling)
 */
export function recordLLMToolExecution(
  turnId: string,
  sessionId: string,
  toolId: string
): void {
  const session = sessionStates.get(sessionId);
  if (!session) return;

  const turnState = session.turnStates.get(turnId);
  if (!turnState) return;

  // Only record if semantic router didn't execute
  if (!turnState.wasSemanticExecution) {
    turnState.executedTool = toolId;
  }
}

/**
 * Record assistant response for conversation history
 */
export function recordAssistantResponse(
  sessionId: string,
  responseText: string
): void {
  const session = sessionStates.get(sessionId);
  if (!session) return;

  session.conversationHistory.push({ role: 'assistant', text: responseText });

  // Trim history
  if (session.conversationHistory.length > 20) {
    session.conversationHistory = session.conversationHistory.slice(-20);
  }
}

// ============================================================================
// LEARNING TRIGGERS
// ============================================================================

/**
 * Complete turn tracking and trigger learning
 *
 * Call this at the end of processTurn()
 */
export async function completeTurnTracking(
  turnId: string,
  sessionId: string,
  outcome: {
    wasSuccessful: boolean;
    userCorrected?: boolean;
    actualToolUsed?: string;
  }
): Promise<void> {
  const session = sessionStates.get(sessionId);
  if (!session) return;

  const turnState = session.turnStates.get(turnId);
  if (!turnState) return;

  const actualTool = outcome.actualToolUsed || turnState.executedTool;

  // Update recent tools
  if (actualTool) {
    session.recentTools.push(actualTool);
    if (session.recentTools.length > MAX_RECENT_TOOLS) {
      session.recentTools.shift();
    }
  }

  // Build learning context
  const learningContext: LearningContext = {
    userId: turnState.userId,
    sessionId: turnState.sessionId,
    personaId: turnState.personaId,
    inputText: turnState.inputText,
    inputLocale: turnState.inputLocale,
    routingResult: turnState.routingResult || {
      matches: [],
      action: { type: 'conversation', reason: 'no routing result' },
      intent: {
        category: 'conversation',
        confidence: 0,
        mood: 'statement',
        urgency: 'normal',
      },
      metadata: {
        totalTimeMs: 0,
        layerTimesMs: { pattern: 0, keyword: 0, embedding: 0, context: 0, history: 0, holistic: 0 },
        toolsConsidered: 0,
        inputText: turnState.inputText,
        normalizedText: turnState.inputText.toLowerCase().trim(),
        contextUsed: [],
        routerVersion: '1.0.0',
      },
    },
    conversationHistory: session.conversationHistory,
    recentTools: session.recentTools,
  };

  // Determine if this was a correction
  const wasCorrection =
    outcome.userCorrected ||
    (turnState.predictedTool !== null &&
      actualTool !== null &&
      turnState.predictedTool !== actualTool &&
      !turnState.wasSemanticExecution);

  // Build learning outcome
  const learningOutcome: LearningOutcome = {
    actualToolUsed: actualTool || null,
    wasCorrection,
    wasSuccess: outcome.wasSuccessful && !wasCorrection,
  };

  // Record to learning system
  try {
    await recordOutcome(learningContext, learningOutcome);

    // Record tool usage for future boosting
    if (actualTool) {
      recordToolUsage(turnState.userId, actualTool);
    }

    // If implicit correction (LLM used different tool), record it
    if (wasCorrection && actualTool && turnState.predictedTool) {
      recordImplicitCorrection(
        turnState.userId,
        turnState.sessionId,
        turnState.inputText,
        turnState.predictedTool,
        actualTool,
        turnState.personaId
      );

      log.info(
        {
          userId: turnState.userId,
          predicted: turnState.predictedTool,
          actual: actualTool,
          input: turnState.inputText.slice(0, 30),
        },
        '📚 Learned from implicit correction'
      );
    }

    // Record tool co-occurrence for chain prediction
    if (session.recentTools.length >= 2) {
      recordToolCoOccurrence(session.recentTools.slice(-3));
    }

    log.debug(
      {
        turnId,
        predicted: turnState.predictedTool,
        actual: actualTool,
        wasCorrection,
        wasSuccess: learningOutcome.wasSuccess,
      },
      'Turn tracking completed'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to record learning outcome');
  }

  // Cleanup turn state
  session.turnStates.delete(turnId);
}

/**
 * Handle explicit user correction
 *
 * Call this when user explicitly corrects routing, e.g.:
 * - "No, I wanted to check my calendar, not play music"
 * - "That's not what I meant, I wanted..."
 */
export async function handleUserCorrection(
  userId: string,
  sessionId: string,
  inputText: string,
  wrongTool: string | null,
  correctTool: string
): Promise<void> {
  try {
    // Record explicit correction (highest confidence)
    await handleExplicitCorrection(userId, inputText, wrongTool, correctTool);

    // Also record in correction store
    await recordCorrection({
      userId,
      sessionId,
      originalQuery: inputText,
      normalizedQuery: inputText.toLowerCase().trim(),
      predictedTool: wrongTool || 'unknown',
      predictedConfidence: 0.8, // Assume high confidence since we auto-executed
      predictedArgs: {},
      actualTool: correctTool,
      correctionSource: 'user_explicit',
      conversationContext: [],
      personaId: 'unknown',
      feedbackType: 'wrong_tool',
      userFeedback: 'Explicit correction',
    });

    log.info(
      {
        userId,
        from: wrongTool,
        to: correctTool,
        phrase: inputText.slice(0, 30),
      },
      '📚 Recorded explicit user correction'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to handle user correction');
  }
}

// ============================================================================
// TOOL CHAIN PREDICTION
// ============================================================================

/**
 * Predict next likely tools based on current context
 *
 * Useful for:
 * - Pre-warming tool caches
 * - Proactive suggestions
 * - UI hints
 */
export async function predictNextTools(
  userId: string,
  sessionId: string,
  currentTool: string
): Promise<Array<{ toolId: string; probability: number; reason: string }>> {
  const session = sessionStates.get(sessionId);

  if (!session) {
    return [];
  }

  try {
    const prediction = await predictToolChain(currentTool, {
      userId,
      sessionId,
      personaId: 'ferni',
      inputText: '',
      inputLocale: 'en',
      routingResult: {
        matches: [],
        action: { type: 'conversation', reason: 'prediction context' },
        intent: {
          category: 'conversation',
          confidence: 0,
          mood: 'statement',
          urgency: 'normal',
        },
        metadata: {
          totalTimeMs: 0,
          layerTimesMs: { pattern: 0, keyword: 0, embedding: 0, context: 0, history: 0, holistic: 0 },
          toolsConsidered: 0,
          inputText: '',
          normalizedText: '',
          contextUsed: [],
          routerVersion: '1.0.0',
        },
      },
      conversationHistory: session.conversationHistory,
      recentTools: session.recentTools,
    });

    return prediction.nextTools;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to predict next tools');
    return [];
  }
}

// ============================================================================
// SESSION CLEANUP
// ============================================================================

/**
 * End a learning session
 *
 * Call this when session ends to:
 * 1. Flush any pending learning
 * 2. Cleanup memory
 */
export function endLearningSession(sessionId: string): void {
  const session = sessionStates.get(sessionId);

  if (session) {
    // Log session summary
    log.info(
      {
        sessionId,
        toolsUsed: session.recentTools.length,
        turnsTracked: session.turnStates.size,
      },
      'Learning session ended'
    );

    // Cleanup
    sessionStates.delete(sessionId);
  }
}

/**
 * Cleanup old sessions (call periodically)
 */
export function cleanupOldSessions(maxAgeMs: number = 30 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of sessionStates.entries()) {
    // Check if all turns are old
    let isOld = true;
    for (const turn of session.turnStates.values()) {
      if (now - turn.startTime < maxAgeMs) {
        isOld = false;
        break;
      }
    }

    if (isOld && session.turnStates.size > 0) {
      sessionStates.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log.info({ cleaned }, 'Cleaned up old learning sessions');
  }

  return cleaned;
}

// ============================================================================
// ANALYTICS & DEBUGGING
// ============================================================================

/**
 * Get learning statistics for debugging
 */
export function getLearningStats(): {
  activeSessions: number;
  totalTrackedTurns: number;
  memoryUsageEstimate: number;
} {
  let totalTurns = 0;
  for (const session of sessionStates.values()) {
    totalTurns += session.turnStates.size;
  }

  return {
    activeSessions: sessionStates.size,
    totalTrackedTurns: totalTurns,
    memoryUsageEstimate: sessionStates.size * 1024 + totalTurns * 512, // Rough estimate in bytes
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Re-export from learning-loop for convenience
  enhanceWithLearning,
  recordOutcome,
  type LearningContext,
  type LearningOutcome,
  type EnhancedRouting,
};

