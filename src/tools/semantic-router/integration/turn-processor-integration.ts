/**
 * Turn Processor Integration for Semantic Router
 *
 * Bridges the semantic router into the voice agent's turn processing pipeline.
 * This provides pre-LLM tool routing that can bypass the LLM entirely for
 * high-confidence tool requests, while falling back to JSON function calling
 * (the legacy workaround) for lower confidence matches.
 *
 * ARCHITECTURE:
 * 1. Semantic Router runs in parallel with turn processing
 * 2. High confidence (>0.85) → Execute tool directly, bypass LLM
 * 3. Medium confidence (0.6-0.85) → Add hint to LLM prompt
 * 4. Low confidence → Fall through to JSON function calling workaround
 *
 * @module tools/semantic-router/integration/turn-processor-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { SemanticRouter, createSemanticRouter, routeUserInput } from '../router.js';
import type {
  SemanticRouterConfig,
  SemanticRouterResult,
  RouterAction,
  ToolMatch,
  HolisticContextSummary,
} from '../types.js';
import { DEFAULT_ROUTER_CONFIG, isToolExecutionResult } from '../types.js';
import {
  recordLLMBypass,
  recordHintAdded,
  recordConversation,
  recordRoutingError,
} from './metrics.js';
import { recordRoutingEvent, recordRoutingOutcome } from '../analytics/routing-analytics.js';
import { isSemanticRoutingEnabled as isRoutingEnabledFromConfig } from '../config.js';
import { hasDomainMapping, executeDomainTool } from '../domain-bridge.js';

// SOTA Integration - 4 "Better Than Human" learning systems
import {
  applySOTAPreRouting,
  applySOTAConfidenceAdjustments,
  recordSOTAOutcome,
  type SOTARoutingContext,
  type SOTARoutingResult,
} from './sota-integration.js';

const log = createLogger({ module: 'semantic-router-integration' });

// ============================================================================
// FEATURE FLAG
// ============================================================================

/** Runtime override to enable/disable semantic routing */
let routingOverride: boolean | null = null;

/** Configuration for semantic routing */
let routerConfig: Partial<SemanticRouterConfig> = {};

/**
 * Check if semantic routing is enabled
 * Uses centralized config which defaults to true
 */
export function isRoutingEnabled(): boolean {
  // Check runtime override first
  if (routingOverride !== null) {
    return routingOverride;
  }
  // Fall back to centralized config
  return isRoutingEnabledFromConfig();
}

/**
 * Enable semantic routing (replaces JSON workaround as primary)
 */
export function enableRouting(config?: Partial<SemanticRouterConfig>): void {
  routingOverride = true;
  if (config) {
    routerConfig = { ...routerConfig, ...config };
  }
  log.info('Semantic routing enabled via runtime override');
}

/**
 * Disable semantic routing (falls back to JSON workaround)
 */
export function disableRouting(): void {
  routingOverride = false;
  log.info('Semantic routing disabled via runtime override');
}

/**
 * Reset routing to use default config (no runtime override)
 */
export function resetRoutingOverride(): void {
  routingOverride = null;
  log.info('Semantic routing override reset to default config');
}

// ============================================================================
// TYPES
// ============================================================================

/** Result from turn processor integration */
export interface TurnRouterResult {
  /** Whether routing was attempted */
  attempted: boolean;

  /** Route result from semantic router */
  routeResult?: SemanticRouterResult;

  /** Whether the tool was executed directly */
  executed: boolean;

  /** Execution output if executed */
  output?: string;

  /** Error if execution failed */
  error?: string;

  /** Analytics event ID for outcome tracking */
  analyticsEventId?: string;

  /**
   * Which routing path was taken - for observability.
   * The agent can log this to understand which system handled the call.
   */
  routingPath?: RoutingPath;

  /** SOTA enhancement result (strategy, prosody, cohort priors) */
  sotaResult?: SOTARoutingResult;

  /** SOTA strategy used for this routing decision */
  sotaStrategy?: string;

  /**
   * Holistic NLU context from routing (convenience field).
   * Includes relationship detection, emotional state, urgency, and crisis detection.
   * Also accessible via routeResult?.holisticContext
   */
  holisticContext?: HolisticContextSummary;
}

/** Context for routing decision */
export interface RoutingContext {
  userId: string;
  sessionId: string;
  personaId: string;
  conversationHistory: Array<{ role: string; content: string }>;
  recentTools: string[];

  // SOTA: Optional audio data for prosody analysis
  audioBuffer?: Float32Array;
  sampleRate?: number;

  // SOTA: Optional complexity signals
  inputComplexity?: number;
  urgencySignal?: number;
}

// ============================================================================
// ROUTER INSTANCE
// ============================================================================

let router: SemanticRouter | null = null;
let routerInitialized = false;

/**
 * Get or create the semantic router instance
 */
async function getRouter(): Promise<SemanticRouter> {
  if (!router || !routerInitialized) {
    // Initialize the router with all tool definitions
    const { initializeSemanticRouter } = await import('./init.js');
    await initializeSemanticRouter();

    const config = { ...DEFAULT_ROUTER_CONFIG, ...routerConfig };
    router = createSemanticRouter(config);
    routerInitialized = true;
    log.info('Semantic router ready');
  }
  return router;
}

// ============================================================================
// INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Routing path type for observability
 */
export type RoutingPath =
  | 'semantic_auto_execute' // Semantic router auto-executed (LLM bypassed)
  | 'semantic_hint' // Semantic router hinted to LLM
  | 'semantic_confirm' // Semantic router requested confirmation
  | 'semantic_conversation' // Semantic router determined no tool needed
  | 'json_fallback' // Fell back to JSON workaround
  | 'disabled' // Semantic routing disabled
  | 'error'; // Routing error

/**
 * Start semantic routing in parallel with turn processing
 *
 * Called at the start of processTurn() to begin routing analysis.
 * Returns a promise that resolves to the routing result.
 *
 * @param userText - User's message text
 * @param context - Routing context (userId, sessionId, etc.)
 */
export async function startSemanticRouting(
  userText: string,
  context: RoutingContext
): Promise<TurnRouterResult> {
  log.info({ userText, enabled: isRoutingEnabled() }, '🎯 Semantic routing started');

  if (!isRoutingEnabled()) {
    log.warn('⚠️ Semantic routing DISABLED - will fall back to JSON workaround');
    return { attempted: false, executed: false, routingPath: 'disabled' };
  }

  const startTime = performance.now();

  // SOTA context for "Better Than Human" enhancements
  let sotaResult: SOTARoutingResult | undefined;

  try {
    await getRouter(); // Ensure router is initialized

    // =========================================================================
    // SOTA PRE-ROUTING: Apply learning enhancements before routing
    // - Select optimal routing strategy (Thompson Sampling)
    // - Apply prosody signals from voice analysis
    // - Get cohort priors for cold-start users
    // =========================================================================
    try {
      const sotaContext: SOTARoutingContext = {
        userId: context.userId,
        sessionId: context.sessionId,
        personaId: context.personaId,
        inputText: userText,
        inputComplexity: context.inputComplexity,
        urgencySignal: context.urgencySignal,
        audioBuffer: context.audioBuffer,
        sampleRate: context.sampleRate,
      };
      sotaResult = await applySOTAPreRouting(sotaContext);
      log.debug(
        {
          strategy: sotaResult.strategy.strategy,
          confidenceBoost: sotaResult.confidenceBoost,
          isColdStart: sotaResult.isColdStart,
          hasProsody: !!sotaResult.prosodyAdjustment,
        },
        '🧠 SOTA pre-routing applied'
      );
    } catch (sotaError) {
      log.debug({ error: String(sotaError) }, 'SOTA pre-routing skipped (non-fatal)');
    }

    log.info({ userText }, '🔍 Routing user input');
    // Map conversation history to expected format (or skip if types mismatch)
    const mappedHistory = context.conversationHistory?.map((turn) => ({
      role: turn.role as 'user' | 'assistant',
      text: turn.content,
      timestamp: new Date(),
    }));
    let routeResult = await routeUserInput(userText, {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      conversationHistory: mappedHistory,
      recentTools: context.recentTools,
    });

    // =========================================================================
    // SOTA POST-ROUTING: Apply confidence adjustments from learning systems
    // - Cohort tool preferences boost confidence
    // - Prosody signals (stress, urgency) boost crisis tools
    // - User history patterns adjust scores
    // =========================================================================
    if (sotaResult && routeResult.matches.length > 0) {
      const adjustedMatches = applySOTAConfidenceAdjustments(routeResult.matches, sotaResult);
      routeResult = { ...routeResult, matches: adjustedMatches };
      log.debug(
        { originalTop: routeResult.matches[0]?.toolId, adjustedTop: adjustedMatches[0]?.toolId },
        '🧠 SOTA confidence adjustments applied'
      );
    }

    const topMatch = routeResult.matches?.[0];
    log.info(
      {
        action: routeResult.action?.type,
        confidence: topMatch?.confidence,
        toolId: topMatch?.toolId,
        sotaStrategy: sotaResult?.strategy.strategy,
      },
      '🎯 Route result'
    );
    const latencyMs = Math.round(performance.now() - startTime);

    // Record to advanced analytics (Firestore persistence + outcome tracking)
    const analyticsEventId = recordRoutingEvent(routeResult, {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      inputText: userText,
    });

    // If no match or conversation, don't execute
    if (!routeResult.action || routeResult.action.type === 'conversation') {
      // Record conversation metric
      recordConversation(context.userId, context.sessionId, userText, latencyMs);

      log.info(
        { userText: userText.slice(0, 50), confidence: topMatch?.confidence || 0 },
        '💬 SEMANTIC → CONVERSATION (no tool needed, LLM handles naturally)'
      );

      return {
        attempted: true,
        routeResult,
        executed: false,
        analyticsEventId,
        routingPath: 'semantic_conversation',
        sotaResult,
        sotaStrategy: sotaResult?.strategy.strategy,
        holisticContext: routeResult.holisticContext,
      };
    }

    // For auto-execute, run the tool directly
    if (routeResult.action.type === 'execute' && routeResult.matches.length > 0) {
      const topMatch = routeResult.matches[0];
      try {
        // Execute the tool using the router
        const executeResult = await executeMatchedTool(topMatch, context);
        const totalLatencyMs = Math.round(performance.now() - startTime);

        if (executeResult.success) {
          // Record successful LLM bypass
          recordLLMBypass(
            context.userId,
            context.sessionId,
            userText,
            topMatch.toolId,
            topMatch.confidence,
            determineMatchPath(topMatch),
            totalLatencyMs,
            false // TODO: track cache hits
          );

          // Record outcome to advanced analytics
          recordRoutingOutcome(analyticsEventId, {
            toolExecuted: topMatch.toolId,
            executionSuccess: true,
            llmFallbackUsed: false,
          });

          // SOTA: Record successful outcome for learning systems
          if (sotaResult) {
            recordSOTAOutcome(
              {
                userId: context.userId,
                sessionId: context.sessionId,
                toolId: topMatch.toolId,
                toolCategory: 'general', // Category not available on ToolMatch
                wasCorrect: true,
                wasCorrected: false,
                confidence: topMatch.confidence,
                latencyMs: totalLatencyMs,
                strategyUsed: sotaResult.strategy.strategy,
              },
              routeResult
            );
          }

          log.info(
            {
              toolId: topMatch.toolId,
              confidence: topMatch.confidence.toFixed(2),
              latencyMs: totalLatencyMs,
              sotaStrategy: sotaResult?.strategy.strategy,
            },
            '🚀 SEMANTIC → AUTO-EXECUTE (LLM bypassed, tool executed directly)'
          );
        } else {
          // Record failed outcome
          recordRoutingOutcome(analyticsEventId, {
            toolExecuted: topMatch.toolId,
            executionSuccess: false,
            llmFallbackUsed: true,
          });

          // SOTA: Record failed outcome for learning systems
          if (sotaResult) {
            recordSOTAOutcome(
              {
                userId: context.userId,
                sessionId: context.sessionId,
                toolId: topMatch.toolId,
                toolCategory: 'general', // Category not available on ToolMatch
                wasCorrect: false,
                wasCorrected: false,
                confidence: topMatch.confidence,
                latencyMs: totalLatencyMs,
                strategyUsed: sotaResult.strategy.strategy,
              },
              routeResult
            );
          }

          log.warn(
            { toolId: topMatch.toolId, error: executeResult.error },
            '⚠️ SEMANTIC → EXECUTION FAILED (falling back to JSON workaround)'
          );
        }

        return {
          attempted: true,
          routeResult,
          executed: executeResult.success,
          output: executeResult.success ? executeResult.naturalResponse : undefined,
          error: executeResult.success ? undefined : executeResult.error,
          analyticsEventId,
          routingPath: executeResult.success ? 'semantic_auto_execute' : 'json_fallback',
          sotaResult,
          sotaStrategy: sotaResult?.strategy.strategy,
          holisticContext: routeResult.holisticContext,
        };
      } catch (execError) {
        log.warn(
          { error: String(execError) },
          '❌ SEMANTIC → EXECUTION ERROR (falling back to JSON workaround)'
        );
        recordRoutingError(
          context.userId,
          context.sessionId,
          userText,
          String(execError),
          latencyMs
        );

        // Record execution error to advanced analytics
        recordRoutingOutcome(analyticsEventId, {
          toolExecuted: topMatch.toolId,
          executionSuccess: false,
          llmFallbackUsed: true,
        });

        return {
          attempted: true,
          routeResult,
          executed: false,
          error: String(execError),
          analyticsEventId,
          routingPath: 'error',
          sotaResult,
          sotaStrategy: sotaResult?.strategy.strategy,
          holisticContext: routeResult.holisticContext,
        };
      }
    }

    // For hint/confirm/clarify, record and pass through to LLM with guidance
    if (routeResult.matches.length > 0) {
      const topMatch = routeResult.matches[0];
      recordHintAdded(
        context.userId,
        context.sessionId,
        userText,
        topMatch.toolId,
        topMatch.confidence,
        determineMatchPath(topMatch),
        latencyMs
      );

      const actionType = routeResult.action?.type || 'hint';
      log.info(
        {
          toolId: topMatch.toolId,
          confidence: topMatch.confidence.toFixed(2),
          action: actionType,
          sotaStrategy: sotaResult?.strategy.strategy,
        },
        `💡 SEMANTIC → ${actionType.toUpperCase()} (guiding LLM toward ${topMatch.toolId})`
      );

      return {
        attempted: true,
        routeResult,
        executed: false,
        analyticsEventId,
        routingPath: actionType === 'confirm' ? 'semantic_confirm' : 'semantic_hint',
        sotaResult,
        sotaStrategy: sotaResult?.strategy.strategy,
        holisticContext: routeResult.holisticContext,
      };
    }

    // No matches at all - pure conversation
    log.info({ userText: userText.slice(0, 50) }, '💬 SEMANTIC → NO MATCH (pure conversation)');

    return {
      attempted: true,
      routeResult,
      executed: false,
      analyticsEventId,
      routingPath: 'semantic_conversation',
      sotaResult,
      sotaStrategy: sotaResult?.strategy.strategy,
      holisticContext: routeResult.holisticContext,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    log.warn(
      { error: String(error) },
      '❌ SEMANTIC → ROUTING ERROR (falling back to JSON workaround)'
    );
    recordRoutingError(context.userId, context.sessionId, userText, String(error), latencyMs);
    // No analytics event ID in error case since we failed before recording
    // sotaResult may be undefined if error occurred before SOTA pre-routing
    return {
      attempted: false,
      executed: false,
      error: String(error),
      routingPath: 'error',
      sotaResult,
      sotaStrategy: sotaResult?.strategy.strategy,
    };
  }
}

/**
 * Execute a matched tool
 *
 * IMPORTANT: This function bridges semantic tools to real domain implementations.
 * When a semantic tool ID has a domain mapping, we execute the real domain tool
 * rather than the semantic tool's mock execute function.
 */
async function executeMatchedTool(
  match: ToolMatch,
  context: RoutingContext
): Promise<{ success: boolean; naturalResponse: string; error?: string }> {
  const toolId = match.toolId;

  // ==========================================================================
  // DOMAIN BRIDGE: Execute real domain tool if mapping exists
  // ==========================================================================
  if (hasDomainMapping(toolId)) {
    log.info(
      { semanticToolId: toolId, confidence: match.confidence },
      '🔗 Using domain bridge for semantic tool execution'
    );

    // Build execution context for domain tool
    const execContext = {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      conversationHistory: context.conversationHistory.map((h) => ({
        role: h.role as 'user' | 'assistant',
        text: h.content,
        timestamp: new Date(),
      })),
      services: null, // Will be null for semantic router execution
    };

    // Execute via domain bridge
    const result = await executeDomainTool(toolId, match.extractedArgs, execContext);

    // 🚫 DEDUPLICATION: Mark tool as executed to prevent JSON workaround from re-executing
    if (result.success && context.sessionId) {
      try {
        const { markToolExecutedBySemanticRouter } = await import(
          '../../../agents/shared/tool-call-sanitizer.js'
        );
        markToolExecutedBySemanticRouter(context.sessionId, toolId);
      } catch {
        // Non-critical - deduplication is defensive
      }
    }

    log.info(
      {
        semanticToolId: toolId,
        success: result.success,
        responsePreview: result.naturalResponse?.slice(0, 100),
      },
      '🔗 Domain bridge execution complete'
    );

    return {
      success: result.success,
      naturalResponse: result.naturalResponse ?? '',
      error: result.error,
    };
  }

  // ==========================================================================
  // FALLBACK: Execute semantic tool directly (mock response)
  // ==========================================================================
  const { getToolRegistry } = await import('../registry.js');
  const registry = getToolRegistry();

  // Look up the tool in the semantic registry
  const tool = registry.get(toolId);
  if (!tool) {
    log.warn({ toolId }, 'Tool not found in semantic registry');
    return {
      success: false,
      naturalResponse: '',
      error: `Tool ${toolId} not found in registry`,
    };
  }

  log.info(
    { toolId, confidence: match.confidence },
    '⚠️ Executing semantic tool directly (no domain bridge)'
  );

  try {
    // Build execution context
    const execContext = {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      conversationHistory: context.conversationHistory.map((h) => ({
        role: h.role as 'user' | 'assistant',
        text: h.content,
        timestamp: new Date(),
      })),
      services: null, // Will be null for semantic router execution
      originalText: (match.extractedArgs?.originalText as string) || '',
      confidence: match.confidence,
    };

    // Execute the tool
    const result = await tool.execute(match.extractedArgs, execContext);

    // 🚫 DEDUPLICATION: Mark tool as executed to prevent JSON workaround from re-executing
    if (context.sessionId) {
      try {
        const { markToolExecutedBySemanticRouter } = await import(
          '../../../agents/shared/tool-call-sanitizer.js'
        );
        markToolExecutedBySemanticRouter(context.sessionId, toolId);
      } catch {
        // Non-critical - deduplication is defensive
      }
    }

    // Handle both ToolExecutionResult and SemanticRoutingResult
    if (isToolExecutionResult(result)) {
      if (result.success) {
        log.info(
          { toolId, naturalResponse: result.naturalResponse },
          'Tool executed successfully'
        );
        return {
          success: true,
          naturalResponse: result.naturalResponse ?? '',
        };
      } else {
        log.warn({ toolId, error: result.error }, 'Tool execution returned failure');
        return {
          success: false,
          naturalResponse: result.naturalResponse ?? '',
          error: result.error,
        };
      }
    }

    // SemanticRoutingResult - treat as successful routing
    log.info({ toolId, targetTool: result.tool }, 'Routing to target tool');
    return {
      success: true,
      naturalResponse: `Routing to ${result.tool}`,
    };
  } catch (error) {
    log.error({ toolId, error: String(error) }, 'Tool execution threw error');
    return {
      success: false,
      naturalResponse: '',
      error: String(error),
    };
  }
}

/**
 * Apply routing result to generate semantic routing result for turn processor
 *
 * @param routerResult - Result from startSemanticRouting
 * @param options - Additional options
 */
export function applyRoutingResult(
  routerResult: TurnRouterResult,
  options: { crisisDetected: boolean; latencyMs: number }
): {
  routed: boolean;
  bypassLLM: boolean;
  toolResult?: {
    toolId: string;
    output: string;
    success: boolean;
    speakableResponse: string;
  };
  metrics: {
    latencyMs: number;
    cacheHit: boolean;
    confidence: number;
    matchPath: 'pattern' | 'keyword' | 'embedding' | 'combined' | 'none';
  };
  /** For observability - which routing system handled this request */
  routingPath: RoutingPath;
  /** Holistic NLU context for downstream crisis/emotion handling */
  holisticContext?: HolisticContextSummary;
} {
  // Safety override: Never bypass LLM during crisis
  if (options.crisisDetected) {
    log.info('🛑 CRISIS DETECTED - bypassing semantic router, LLM handles directly');
    return {
      routed: false,
      bypassLLM: false,
      metrics: {
        latencyMs: options.latencyMs,
        cacheHit: false,
        confidence: 0,
        matchPath: 'none',
      },
      routingPath: 'json_fallback', // Safety fallback to LLM
      holisticContext: routerResult.holisticContext,
    };
  }

  // Not routed
  if (!routerResult.attempted || !routerResult.routeResult) {
    return {
      routed: false,
      bypassLLM: false,
      metrics: {
        latencyMs: options.latencyMs,
        cacheHit: false,
        confidence: 0,
        matchPath: 'none',
      },
      routingPath: routerResult.routingPath || 'json_fallback',
      holisticContext: routerResult.holisticContext,
    };
  }

  const { routeResult, executed, output } = routerResult;
  const topMatch = routeResult.matches[0];

  // Tool executed successfully - bypass LLM
  if (executed && output && topMatch) {
    return {
      routed: true,
      bypassLLM: true,
      toolResult: {
        toolId: topMatch.toolId,
        output,
        success: true,
        speakableResponse: output,
      },
      metrics: {
        latencyMs: options.latencyMs,
        cacheHit: false,
        confidence: topMatch.confidence,
        matchPath: determineMatchPath(topMatch),
      },
      routingPath: 'semantic_auto_execute',
      holisticContext: routerResult.holisticContext,
    };
  }

  // Routed but not executed (hint/confirm/clarify) - let LLM handle with guidance
  return {
    routed: routeResult.matches.length > 0,
    bypassLLM: false,
    metrics: {
      latencyMs: options.latencyMs,
      cacheHit: false,
      confidence: topMatch?.confidence || 0,
      matchPath: topMatch ? determineMatchPath(topMatch) : 'none',
    },
    routingPath: routerResult.routingPath || 'semantic_hint',
    holisticContext: routerResult.holisticContext,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Determine which matching path was primary
 */
function determineMatchPath(match: ToolMatch): 'pattern' | 'keyword' | 'embedding' | 'combined' {
  const scores = match.layerScores;

  // Check which layer contributed most
  const pattern = scores.pattern || 0;
  const keyword = scores.keyword || 0;
  const embedding = scores.embedding || 0;

  // If pattern is dominant, it was the primary match
  if (pattern > 0.8) return 'pattern';

  // If keyword is significantly higher than embedding
  if (keyword > embedding * 1.5) return 'keyword';

  // If embedding is significantly higher than keyword
  if (embedding > keyword * 1.5) return 'embedding';

  // Combined approach
  return 'combined';
}

// ============================================================================
// OBSERVABILITY HELPERS
// ============================================================================

/**
 * Human-readable description of each routing path.
 * Useful for logging and debugging.
 */
export const ROUTING_PATH_DESCRIPTIONS: Record<RoutingPath, string> = {
  semantic_auto_execute: '🚀 Semantic Router auto-executed tool (LLM bypassed)',
  semantic_hint: '💡 Semantic Router hinted tool to LLM',
  semantic_confirm: '❓ Semantic Router requested user confirmation',
  semantic_conversation: '💬 Semantic Router: pure conversation (no tool)',
  json_fallback: '🔄 JSON Workaround (LLM function calling)',
  disabled: '⚠️ Semantic routing disabled',
  error: '❌ Routing error occurred',
};

/**
 * Get a human-readable summary of the routing path
 *
 * @param path - The routing path taken
 * @param toolId - Optional tool ID if a tool was involved
 * @param confidence - Optional confidence score
 */
export function getRoutingPathSummary(
  path: RoutingPath,
  toolId?: string,
  confidence?: number
): string {
  const base = ROUTING_PATH_DESCRIPTIONS[path];

  if (toolId && confidence !== undefined) {
    return `${base} - ${toolId} (${(confidence * 100).toFixed(0)}% confidence)`;
  }

  if (toolId) {
    return `${base} - ${toolId}`;
  }

  return base;
}

/**
 * Log a complete routing decision summary.
 * Call this after routing is complete for full observability.
 *
 * @param result - The routing result
 * @param userText - The original user input
 */
export function logRoutingSummary(
  result: {
    routingPath: RoutingPath;
    toolId?: string;
    confidence?: number;
    latencyMs: number;
    bypassLLM: boolean;
  },
  userText: string
): void {
  const summary = getRoutingPathSummary(result.routingPath, result.toolId, result.confidence);

  log.info(
    {
      input: userText.slice(0, 50),
      path: result.routingPath,
      toolId: result.toolId,
      confidence: result.confidence?.toFixed(2),
      latencyMs: result.latencyMs,
      bypassedLLM: result.bypassLLM,
    },
    `📊 ROUTING SUMMARY: ${summary}`
  );
}
