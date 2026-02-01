/**
 * Turn Processor Integration
 *
 * Bridge between the Memory Intelligence system and the turn processor.
 * Provides a clean integration point without requiring a full refactor
 * of the existing turn processor.
 *
 * Usage in turn-processor.ts:
 * ```typescript
 * import { getMemoryInjection } from './memory-intelligence/turn-processor-integration.js';
 *
 * // In the injection building phase:
 * const memoryInjection = await getMemoryInjection({
 *   userId,
 *   userText,
 *   conversationContext,
 *   emotionalState,
 *   turnCount,
 *   persona,
 * });
 *
 * if (memoryInjection) {
 *   injections.push(memoryInjection);
 * }
 * ```
 *
 * @module intelligence/memory-intelligence/turn-processor-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { TurnContext, PersonaId, TrustLevel, MemoryPreparedContext } from './types.js';
import { getMemoryIntelligence } from './core.js';
import { recordTimingDecision, recordSurfacing, recordResponse, markSessionEnded } from './metrics.js';

const log = createLogger({ module: 'MemoryIntelIntegration' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for the memory injection
 */
export interface MemoryInjectionInput {
  /** User ID */
  userId: string;

  /** User's current message */
  userText: string;

  /** Session ID (optional) */
  sessionId?: string;

  /** Current turn count */
  turnCount: number;

  /** Active persona */
  persona: PersonaId;

  /** Topics detected (optional) */
  detectedTopics?: string[];

  /** People mentioned (optional) */
  peopleMentioned?: string[];

  /** Is crisis detected? */
  crisisDetected?: boolean;

  /** Emotional intensity (0-1) */
  emotionalIntensity?: number;

  /** Emotional valence (-1 to 1) */
  emotionalValence?: number;

  /** Is user vulnerable? */
  isVulnerable?: boolean;

  /** Trust level */
  trustLevel?: TrustLevel;

  /** Recent messages (for conversation context) */
  recentMessages?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;

  /** Turns since last memory surfaced */
  turnsSinceLastMemory?: number;

  /** Already surfaced memory IDs this session */
  memoriesSurfacedThisSession?: string[];

  /** Topics discussed so far */
  topicsDiscussed?: string[];
}

/**
 * Output injection format compatible with turn processor
 */
export interface MemoryInjection {
  /** Injection category */
  category: string;

  /** Content to inject */
  content: string;

  /** Priority (lower = more important) */
  priority: number;

  /** Metadata */
  metadata?: {
    memoryIds: string[];
    trigger: string;
    confidence: number;
  };
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Get memory injection for the current turn
 *
 * This is the main entry point for the turn processor.
 */
export async function getMemoryInjection(input: MemoryInjectionInput): Promise<MemoryInjection | null> {
  const startTime = Date.now();

  try {
    const intelligence = getMemoryIntelligence();

    // Build full turn context
    const turnContext = buildTurnContext(input);

    // Get prepared memory context
    const prepared = await intelligence.prepareForTurn(turnContext);

    const processingTimeMs = Date.now() - startTime;

    // Record timing decision metric
    recordTimingDecision({
      userId: input.userId,
      sessionId: input.sessionId,
      shouldSurface: prepared.shouldInject,
      confidence: prepared.timingDecision.confidence,
      reason: prepared.shouldInject
        ? prepared.timingDecision.triggerType || 'topic_relevance'
        : prepared.timingDecision.blockingConditions?.[0] || 'no_relevant_memories',
      triggerType: prepared.timingDecision.triggerType,
      processingTimeMs,
    });

    // If nothing to inject, return null
    if (!prepared.shouldInject || !prepared.formattedContent) {
      return null;
    }

    // Record surfacing metric
    if (prepared.surfacedMemoryIds.length > 0) {
      recordSurfacing({
        userId: input.userId,
        memoryIds: prepared.surfacedMemoryIds,
        persona: input.persona,
        warmthLevel: input.isVulnerable ? 0.9 : 0.7,
      });
    }

    // Map priority to number
    const priorityMap = {
      critical: 10,
      high: 20,
      normal: 30,
      low: 40,
    };

    return {
      category: 'memory_intelligence',
      content: prepared.formattedContent,
      priority: priorityMap[prepared.priority] || 30,
      metadata: {
        memoryIds: prepared.surfacedMemoryIds,
        trigger: prepared.timingDecision.triggerType || 'topic_connection',
        confidence: prepared.timingDecision.confidence,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId: input.userId }, 'Error getting memory injection');
    return null;
  }
}

/**
 * Initialize memory intelligence for a session
 */
export async function initMemorySession(userId: string): Promise<void> {
  const intelligence = getMemoryIntelligence();
  await intelligence.initSession(userId);
}

/**
 * End memory intelligence session
 */
export async function endMemorySession(userId: string, sessionId?: string): Promise<void> {
  const intelligence = getMemoryIntelligence();
  await intelligence.endSession(userId);

  // Mark session as ended in metrics
  if (sessionId) {
    markSessionEnded(sessionId);
  }

  log.debug({ userId, sessionId }, 'Memory session ended');
}

/**
 * Record user response to surfaced memories
 */
export async function recordMemoryResponse(
  userId: string,
  userText: string,
  surfacedMemoryIds: string[]
): Promise<void> {
  if (surfacedMemoryIds.length === 0) return;

  const intelligence = getMemoryIntelligence();

  // Analyze the user's response
  const responseTracker = await import('./learning/response-tracker.js');
  const signal = responseTracker.getResponseTracker().analyzeResponseFromText(userText, '');

  await intelligence.recordUserResponse(surfacedMemoryIds, signal);

  // Record response metric
  // Map UserResponseType to ResponseMetric's expected types
  const responseType = signal.type === 'requested_more' ? 'expanded'
    : signal.type === 'emotional_positive' || signal.type === 'emotional_negative' ? 'engaged'
    : signal.type === 'corrected' || signal.type === 'ignored' ? 'neutral'
    : signal.type as 'engaged' | 'deflected' | 'neutral' | 'acknowledged' | 'expanded' | 'redirected';

  recordResponse({
    userId,
    responseType,
    memoryIds: surfacedMemoryIds,
  });

  log.debug(
    { userId, responseType: signal, memoryCount: surfacedMemoryIds.length },
    'Memory response recorded with metrics'
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build full turn context from input
 */
function buildTurnContext(input: MemoryInjectionInput): TurnContext {
  return {
    userId: input.userId,
    userText: input.userText,
    sessionId: input.sessionId,
    turnCount: input.turnCount,
    persona: input.persona,
    detectedTopics: input.detectedTopics,
    peopleMentioned: input.peopleMentioned,
    crisisDetected: input.crisisDetected,
    emotionalState: {
      primary: 'neutral',
      intensity: input.emotionalIntensity ?? 0.5,
      valence: input.emotionalValence ?? 0,
      isVulnerable: input.isVulnerable ?? false,
      trajectory: 'stable',
    },
    conversationContext: {
      recentMessages: input.recentMessages ?? [],
      topicsDiscussed: input.topicsDiscussed ?? [],
      trustLevel: input.trustLevel ?? 'developing',
      turnsSinceLastMemory: input.turnsSinceLastMemory ?? 999,
      memoriesSurfacedThisSession: input.memoriesSurfacedThisSession ?? [],
      sessionStartTime: new Date(),
    },
  };
}

/**
 * Get memory prepared context directly (for advanced use cases)
 */
export async function getMemoryContext(input: MemoryInjectionInput): Promise<MemoryPreparedContext> {
  const intelligence = getMemoryIntelligence();
  const turnContext = buildTurnContext(input);
  return intelligence.prepareForTurn(turnContext);
}
