/**
 * Semantic Short-Circuit Optimization
 *
 * PERFORMANCE OPTIMIZATION: For ultra-high confidence tool matches (>0.95),
 * we can skip expensive context building entirely. The tool has already
 * executed and generated its own response - no need to build LLM context.
 *
 * Savings: ~100-150ms per turn for obvious tool requests like:
 * - "play some jazz" → music tool (0.99 confidence)
 * - "what's the weather?" → weather tool (0.98 confidence)
 * - "set a timer for 5 minutes" → timer tool (0.97 confidence)
 *
 * Safety: NEVER short-circuit during crisis detection (safety first)
 *
 * @module agents/processors/semantic-short-circuit
 */

import {
  applyRoutingResult,
  type TurnRouterResult,
} from '../../tools/semantic-router/integration/index.js';
import type {
  TurnContext,
  TurnProcessorResult,
  TurnAnalysisResult,
  EmotionalState,
  ResponseGuidance,
  IdentityContext,
  SemanticRoutingResult,
  ContextInjection,
} from './types.js';
import { diag } from '../../services/diagnostic-logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Minimum confidence threshold for short-circuit.
 * Only bypass context building when we're VERY confident.
 */
const SHORT_CIRCUIT_CONFIDENCE_THRESHOLD = 0.95;

/**
 * Maximum time to wait for routing result before falling back to full processing.
 * If routing takes longer, we proceed with context building in parallel.
 */
const SHORT_CIRCUIT_TIMEOUT_MS = 50;

/**
 * Tools that are safe to short-circuit (no emotional context needed).
 * These are typically utility tools where the response is self-contained.
 */
const SAFE_TO_SHORT_CIRCUIT_TOOLS = new Set([
  'playMusic',
  'stopMusic',
  'pauseMusic',
  'resumeMusic',
  'skipTrack',
  'getWeather',
  'setTimer',
  'setReminder',
  'getTime',
  'getDate',
  'convertUnits',
  'calculate',
  // Add more utility tools as needed
]);

// ============================================================================
// TYPES
// ============================================================================

export interface ShortCircuitResult {
  /** Whether short-circuit was applied */
  shortCircuited: boolean;
  /** The early result if short-circuited */
  result?: TurnProcessorResult;
  /** Reason for decision */
  reason: string;
  /** Time spent checking (ms) */
  checkTimeMs: number;
}

export interface ShortCircuitContext {
  /** Crisis detection result */
  crisisDetected: boolean;
  /** Severity of crisis (0-1) */
  crisisSeverity: number;
  /** Analysis result (for fallback) */
  analysisResult: TurnAnalysisResult;
  /** Turn context (for building minimal result) */
  ctx: TurnContext;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Check if we can short-circuit context building for this routing result.
 *
 * Short-circuit conditions:
 * 1. Routing completed quickly (< 50ms)
 * 2. Tool executed successfully with bypassLLM: true
 * 3. Confidence > 0.95
 * 4. No crisis detected
 * 5. Tool is in the "safe to short-circuit" list
 *
 * @param routingPromise - The pending routing result
 * @param shortCircuitCtx - Context for making short-circuit decision
 * @returns Short-circuit result with decision and optional early result
 */
export async function checkSemanticShortCircuit(
  routingPromise: Promise<TurnRouterResult>,
  shortCircuitCtx: ShortCircuitContext
): Promise<ShortCircuitResult> {
  const startTime = performance.now();

  // Safety first: NEVER short-circuit during crisis
  if (shortCircuitCtx.crisisDetected || shortCircuitCtx.crisisSeverity > 0.3) {
    return {
      shortCircuited: false,
      reason: 'Crisis detected - proceeding with full context building',
      checkTimeMs: performance.now() - startTime,
    };
  }

  // Race between routing and timeout
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), SHORT_CIRCUIT_TIMEOUT_MS);
  });

  const routingResult = await Promise.race([routingPromise, timeoutPromise]);

  // Timeout - routing didn't complete fast enough
  if (routingResult === null) {
    return {
      shortCircuited: false,
      reason: `Routing timeout (>${SHORT_CIRCUIT_TIMEOUT_MS}ms) - proceeding with full context`,
      checkTimeMs: performance.now() - startTime,
    };
  }

  // Apply routing to get structured result
  const semanticRouting = applyRoutingResult(routingResult, {
    crisisDetected: shortCircuitCtx.crisisDetected,
    latencyMs: performance.now() - startTime,
  });

  // Check if we got a high-confidence tool execution
  if (!semanticRouting.bypassLLM || !semanticRouting.toolResult) {
    return {
      shortCircuited: false,
      reason: 'Routing did not produce bypassLLM result',
      checkTimeMs: performance.now() - startTime,
    };
  }

  // Check confidence threshold
  if (semanticRouting.metrics.confidence < SHORT_CIRCUIT_CONFIDENCE_THRESHOLD) {
    return {
      shortCircuited: false,
      reason: `Confidence ${semanticRouting.metrics.confidence.toFixed(2)} below threshold ${SHORT_CIRCUIT_CONFIDENCE_THRESHOLD}`,
      checkTimeMs: performance.now() - startTime,
    };
  }

  // Check if tool is safe to short-circuit
  const { toolId } = semanticRouting.toolResult;
  if (!SAFE_TO_SHORT_CIRCUIT_TOOLS.has(toolId)) {
    return {
      shortCircuited: false,
      reason: `Tool '${toolId}' not in safe-to-short-circuit list`,
      checkTimeMs: performance.now() - startTime,
    };
  }

  // All conditions met - build minimal result and short-circuit!
  const checkTimeMs = performance.now() - startTime;

  diag.state('⚡ SEMANTIC SHORT-CIRCUIT: Bypassing context building', {
    toolId,
    confidence: semanticRouting.metrics.confidence,
    latencyMs: checkTimeMs,
    savedMs: '~100-150ms (context building skipped)',
  });

  const minimalResult = buildMinimalResult(
    shortCircuitCtx.analysisResult,
    shortCircuitCtx.ctx,
    semanticRouting
  );

  return {
    shortCircuited: true,
    result: minimalResult,
    reason: `Short-circuited for ${toolId} (${(semanticRouting.metrics.confidence * 100).toFixed(0)}% confidence)`,
    checkTimeMs,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a minimal TurnProcessorResult for short-circuit cases.
 * We skip expensive context building since the tool response is self-contained.
 */
function buildMinimalResult(
  analysisResult: TurnAnalysisResult,
  ctx: TurnContext,
  semanticRouting: SemanticRoutingResult
): TurnProcessorResult {
  // Build minimal emotional state (matching types.ts EmotionalState)
  const emotionalState: EmotionalState = {
    primary: analysisResult.analysis.emotion.primary,
    intensity: analysisResult.analysis.emotion.intensity,
    distressLevel: 0, // Tools like music/weather don't have distress
    trajectory: 'stable', // Utility tools don't change trajectory
  };

  // Build minimal response guidance (matching types.ts ResponseGuidance)
  const responseGuidance: ResponseGuidance = {
    length: {
      min: 1,
      max: 3, // Short responses for utility tools
      guidance: 'Keep response brief - this is a utility tool response',
    },
  };

  // Build minimal identity context (matching types.ts IdentityContext)
  const identityContext: IdentityContext = {
    needsReinforcement: false,
    activeAgentId: ctx.persona.id,
    sessionPersonaId: ctx.persona.id,
  };

  // Minimal injections (empty - tool response is self-contained)
  const injections: ContextInjection[] = [];

  return {
    analysis: analysisResult,
    context: {
      injections,
      elapsedMs: 0, // No context building time
    },
    emotional: emotionalState,
    response: responseGuidance,
    identity: identityContext,
    bundleRuntime: undefined,
    easterEgg: undefined,
    valueCapture: undefined,
    advancedHumanization: undefined,
    crisis: {
      isCrisis: false,
      severity: 0,
      indicators: [],
      shouldOverrideLLM: false,
    },
    semanticRouting,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  checkSemanticShortCircuit,
  SHORT_CIRCUIT_CONFIDENCE_THRESHOLD,
  SHORT_CIRCUIT_TIMEOUT_MS,
  SAFE_TO_SHORT_CIRCUIT_TOOLS,
};
