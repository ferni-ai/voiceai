/**
 * Semantic Intelligence Orchestrator
 *
 * Unified entry point that coordinates all 4 phases:
 * 1. Tool Hints - Inject likely tools into LLM context
 * 2. Learning Loop - Record JSON executions, learn from corrections
 * 3. Intent Classification - Fast intent classification
 * 4. Proactive Anticipation - Pattern-based need anticipation
 *
 * This orchestrator provides a single interface for the turn processor
 * to get all semantic intelligence in one call.
 *
 * @module intelligence/semantic-intelligence/orchestrator
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getSemanticToolHints,
  buildToolHintInjection,
  shouldGenerateHints,
  type ToolHint,
  type ToolHintResult,
} from './tool-hints.js';
import {
  recordToolExecution,
  getToolPrediction,
  getUserToolPatterns,
  type ExecutionRecord,
  type ToolPrediction,
} from './learning-loop.js';
import {
  classifyIntent,
  getIntentType,
  needsCrisisSupport,
  type IntentClassification,
} from './intent-classifier.js';
import {
  getProactiveHints,
  recordToolTiming,
  shouldPrewarmTool,
  type ProactiveHint,
  type AnticipationContext,
} from './proactive-anticipation.js';

const log = createLogger({ module: 'SemanticIntelligence.Orchestrator' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context for semantic intelligence processing
 */
export interface SemanticIntelligenceContext {
  /** User ID */
  userId: string;

  /** Session ID */
  sessionId: string;

  /** Current persona */
  personaId: string;

  /** User's input text */
  inputText: string;

  /** Recent tools used in this session */
  recentTools?: string[];

  /** Recent conversation topics */
  recentTopics?: string[];

  /** Upcoming calendar events */
  upcomingEvents?: Array<{
    title: string;
    startsInMinutes: number;
  }>;
}

/**
 * Combined result from all semantic intelligence phases
 */
export interface SemanticIntelligenceResult {
  /** Phase 1: Tool hints for LLM context */
  toolHints: {
    hints: ToolHint[];
    isToolRequest: boolean;
    contextInjection: string;
  };

  /** Phase 2: Learned predictions from user patterns */
  learnedPrediction: ToolPrediction | null;

  /** Phase 3: Intent classification */
  intentClassification: IntentClassification;

  /** Phase 4: Proactive hints */
  proactiveHints: ProactiveHint[];

  /** Whether this needs crisis support */
  needsCrisisSupport: boolean;

  /** Combined context injection string */
  combinedInjection: string;

  /** Total processing time in ms */
  totalProcessingTimeMs: number;

  /** Processing time breakdown */
  timingBreakdown: {
    toolHintsMs: number;
    learnedPredictionMs: number;
    intentClassificationMs: number;
    proactiveHintsMs: number;
  };
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get all semantic intelligence for a user input
 *
 * This is the main entry point for the turn processor.
 * It runs all 4 phases and returns combined results.
 *
 * @example
 * ```typescript
 * const result = await getSemanticIntelligence({
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 *   personaId: 'ferni',
 *   inputText: 'play some jazz music',
 *   recentTools: ['getWeather'],
 * });
 *
 * // Use the combined injection in LLM context
 * llmContext += result.combinedInjection;
 *
 * // Check if this is a tool request
 * if (result.toolHints.isToolRequest) {
 *   // LLM should prioritize tool execution
 * }
 * ```
 */
export async function getSemanticIntelligence(
  context: SemanticIntelligenceContext
): Promise<SemanticIntelligenceResult> {
  const startTime = performance.now();
  const timingBreakdown = {
    toolHintsMs: 0,
    learnedPredictionMs: 0,
    intentClassificationMs: 0,
    proactiveHintsMs: 0,
  };

  // Skip processing for very short inputs
  if (!shouldGenerateHints(context.inputText)) {
    return createEmptyResult(timingBreakdown, performance.now() - startTime);
  }

  // Phase 1: Tool Hints (async)
  const toolHintsStart = performance.now();
  let toolHintsResult: ToolHintResult;
  try {
    toolHintsResult = await getSemanticToolHints({
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      inputText: context.inputText,
      recentTools: context.recentTools,
      recentTopics: context.recentTopics,
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Tool hints failed, using fallback');
    toolHintsResult = {
      hints: [],
      intentCategory: 'conversation',
      isToolRequest: false,
      processingTimeMs: 0,
      contextInjection: '',
    };
  }
  timingBreakdown.toolHintsMs = performance.now() - toolHintsStart;

  // Phase 2: Learned Prediction (async)
  const predictionStart = performance.now();
  let learnedPrediction: ToolPrediction | null = null;
  try {
    learnedPrediction = await getToolPrediction({
      userId: context.userId,
      inputText: context.inputText,
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Learned prediction failed');
  }
  timingBreakdown.learnedPredictionMs = performance.now() - predictionStart;

  // Phase 3: Intent Classification (sync, very fast)
  const classificationStart = performance.now();
  const intentClassification = classifyIntent(context.inputText);
  timingBreakdown.intentClassificationMs = performance.now() - classificationStart;

  // Phase 4: Proactive Hints (async)
  const proactiveStart = performance.now();
  let proactiveHints: ProactiveHint[] = [];
  try {
    proactiveHints = await getProactiveHints({
      userId: context.userId,
      personaId: context.personaId,
      currentTime: new Date(),
      recentTools: context.recentTools,
      recentTopics: context.recentTopics,
      upcomingEvents: context.upcomingEvents,
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Proactive hints failed');
  }
  timingBreakdown.proactiveHintsMs = performance.now() - proactiveStart;

  // Check for crisis
  const isCrisis = needsCrisisSupport(context.inputText);

  // Build combined injection
  const combinedInjection = buildCombinedInjection(
    toolHintsResult,
    learnedPrediction,
    intentClassification,
    proactiveHints,
    isCrisis
  );

  const totalProcessingTimeMs = performance.now() - startTime;

  log.debug(
    {
      userId: context.userId,
      inputText: context.inputText.substring(0, 50),
      topHint: toolHintsResult.hints[0]?.toolId,
      intentType: intentClassification.type,
      learnedTool: learnedPrediction?.toolId,
      proactiveCount: proactiveHints.length,
      isCrisis,
      totalProcessingTimeMs,
    },
    'Semantic intelligence complete'
  );

  return {
    toolHints: {
      hints: toolHintsResult.hints,
      isToolRequest: toolHintsResult.isToolRequest,
      contextInjection: toolHintsResult.contextInjection,
    },
    learnedPrediction,
    intentClassification,
    proactiveHints,
    needsCrisisSupport: isCrisis,
    combinedInjection,
    totalProcessingTimeMs,
    timingBreakdown,
  };
}

/**
 * Process semantic intelligence as a side effect (non-blocking)
 *
 * Use this when you want to process asynchronously without waiting.
 * Results are logged but not returned.
 */
export function processSemanticIntelligence(context: SemanticIntelligenceContext): void {
  // Fire and forget
  getSemanticIntelligence(context).catch((error) => {
    log.error(
      { error: String(error), userId: context.userId },
      'Background semantic processing failed'
    );
  });
}

/**
 * Record that a tool was executed (for learning)
 *
 * Call this after JSON function execution to feed the learning loop.
 */
export async function recordExecution(params: {
  userId: string;
  sessionId: string;
  personaId: string;
  inputText: string;
  toolId: string;
  args: Record<string, unknown>;
  success: boolean;
  executionTimeMs: number;
  semanticPrediction?: {
    toolId: string;
    confidence: number;
  };
}): Promise<void> {
  try {
    // Record for learning loop
    await recordToolExecution({
      userId: params.userId,
      sessionId: params.sessionId,
      personaId: params.personaId,
      inputText: params.inputText,
      jsonExecution: {
        toolId: params.toolId,
        args: params.args,
        success: params.success,
        executionTimeMs: params.executionTimeMs,
      },
      semanticPrediction: params.semanticPrediction,
    });

    // Record for timing patterns
    await recordToolTiming({
      userId: params.userId,
      toolId: params.toolId,
      timestamp: new Date(),
    });
  } catch (error) {
    log.error({ error: String(error), userId: params.userId }, 'Failed to record execution');
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Create empty result for short inputs
 */
function createEmptyResult(
  timingBreakdown: SemanticIntelligenceResult['timingBreakdown'],
  totalMs: number
): SemanticIntelligenceResult {
  return {
    toolHints: {
      hints: [],
      isToolRequest: false,
      contextInjection: '',
    },
    learnedPrediction: null,
    intentClassification: {
      type: 'unknown',
      confidence: 0.5,
      mood: 'statement',
      urgency: 'normal',
      isCompound: false,
      sentiment: 'neutral',
      processingTimeMs: 0,
      matchedPatterns: [],
    },
    proactiveHints: [],
    needsCrisisSupport: false,
    combinedInjection: '',
    totalProcessingTimeMs: totalMs,
    timingBreakdown,
  };
}

/**
 * Build combined context injection from all phases
 */
function buildCombinedInjection(
  toolHints: ToolHintResult,
  learnedPrediction: ToolPrediction | null,
  intent: IntentClassification,
  proactiveHints: ProactiveHint[],
  isCrisis: boolean
): string {
  const sections: string[] = [];

  // Crisis takes priority
  if (isCrisis) {
    sections.push('[PRIORITY: CRISIS SUPPORT] User may need immediate support. Prioritize safety.');
  }

  // Intent classification
  if (intent.type !== 'unknown' && intent.confidence > 0.6) {
    const urgencyNote = intent.urgency === 'high' ? ' (URGENT)' : '';
    sections.push(`[INTENT: ${intent.type.toUpperCase()}${urgencyNote}]`);
  }

  // Tool hints (if meaningful)
  if (toolHints.contextInjection) {
    sections.push(toolHints.contextInjection);
  }

  // Learned prediction (if confident)
  if (learnedPrediction && learnedPrediction.confidence > 0.7) {
    sections.push(
      `[LEARNED PATTERN] User typically uses ${learnedPrediction.toolId} for this (${Math.round(learnedPrediction.confidence * 100)}% confidence)`
    );
  }

  // Proactive hints (if user isn't clearly requesting something)
  if (proactiveHints.length > 0 && !toolHints.isToolRequest) {
    const topHint = proactiveHints[0];
    if (topHint && topHint.confidence > 0.5) {
      sections.push(`[PROACTIVE] User might want ${topHint.toolId} - ${topHint.reason}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Re-export types for convenience
export type { ToolHint, ToolHintResult } from './tool-hints.js';
export type { ExecutionRecord, ToolPattern, ToolPrediction } from './learning-loop.js';
export type { IntentType, IntentClassification } from './intent-classifier.js';
export type { ProactiveHint, TimingPattern } from './proactive-anticipation.js';

// Re-export key functions
export { getSemanticToolHints, buildToolHintInjection } from './tool-hints.js';
export {
  recordImplicitCorrection,
  recordExplicitCorrection,
  getUserToolPatterns,
} from './learning-loop.js';
export { classifyIntent, getIntentType, isToolRequest } from './intent-classifier.js';
export {
  getProactiveHints,
  shouldPrewarmTool,
  recordToolTiming,
} from './proactive-anticipation.js';
