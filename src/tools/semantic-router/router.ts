/**
 * Semantic Tool Router
 *
 * The main entry point for semantic tool routing. This module:
 * 1. Routes user input to the most likely tool(s)
 * 2. Extracts arguments
 * 3. Decides whether to execute, confirm, or defer to LLM
 *
 * USAGE:
 * ```typescript
 * const router = createSemanticRouter();
 * const result = await router.route("play some jazz");
 *
 * if (result.action.type === 'execute') {
 *   const outcome = await router.execute(result.action.toolId, result.action.args);
 * }
 * ```
 *
 * @module tools/semantic-router/router
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getRequestCoalescer, hashContent } from '../../utils/request-coalescer.js';
import { getToolRegistry, type SemanticToolRegistry } from './registry.js';
import { runCombinedMatching, normalizeText } from './matcher.js';
import { extractToolArguments } from './argument-extractor.js';
import {
  getGeminiConfidenceBoost,
  isGeminiProblemPhrase,
  isUsingGemini,
} from './integration/config.js';
import type {
  SemanticRouterConfig,
  SemanticRouterResult,
  RouterAction,
  ToolExecutionContext,
  ToolExecutionResult,
  EmbeddingProvider,
  EmbeddingVector,
  ConversationTurn,
  ToolMatch,
  RoutingMetadata,
  DEFAULT_ROUTER_CONFIG,
  HolisticContextSummary,
} from './types.js';
import { isSemanticRoutingResult } from './types.js';
import type { HolisticLayerResult } from './holistic-layer.js';

const log = createLogger({ module: 'semantic-router' });

// ============================================================================
// HOLISTIC CONTEXT CONVERSION
// ============================================================================

/**
 * Convert internal HolisticLayerResult to external HolisticContextSummary.
 * This provides a clean, serializable representation for downstream consumers.
 */
function toHolisticContextSummary(holisticResult: HolisticLayerResult): HolisticContextSummary {
  const ctx = holisticResult.holisticContext;
  const multiIntent = holisticResult.multiIntent;

  // Convert Map to Record for serialization
  const domainBoosts: Record<string, number> = {};
  for (const [domain, boost] of ctx.domainBoosts) {
    if (boost > 0) {
      domainBoosts[domain] = boost;
    }
  }

  return {
    relationshipType: ctx.relationship?.type,
    relationshipSentiment: ctx.relationship?.sentiment,
    emotionType: ctx.emotion?.type,
    emotionValence: ctx.emotion?.valence,
    urgency: ctx.overallUrgency, // HolisticContext uses overallUrgency
    sentiment: ctx.sentiment,
    isCrisis: ctx.sentiment === 'crisis',
    isCompoundIntent: multiIntent.isCompound,
    domainBoosts,
  };
}

// ============================================================================
// ROUTING METRICS (P1 FIX: Add observability)
// ============================================================================

/**
 * Routing metrics for observability.
 * These metrics help debug routing failures and tune confidence thresholds.
 */
interface RoutingMetricsData {
  totalRoutes: number;
  byAction: Record<string, number>;
  byTool: Record<string, number>;
  latencyHistogram: number[];
  confidenceHistogram: number[];
  autoExecuteCount: number;
  conversationCount: number;
  lastRoutingTime: number;
}

const routingMetrics: RoutingMetricsData = {
  totalRoutes: 0,
  byAction: {},
  byTool: {},
  latencyHistogram: [],
  confidenceHistogram: [],
  autoExecuteCount: 0,
  conversationCount: 0,
  lastRoutingTime: 0,
};

/**
 * Record a routing decision for metrics.
 */
function recordRoutingMetrics(
  action: string,
  toolId: string | null,
  confidence: number,
  latencyMs: number
): void {
  routingMetrics.totalRoutes++;
  routingMetrics.lastRoutingTime = Date.now();

  // Record by action type
  routingMetrics.byAction[action] = (routingMetrics.byAction[action] || 0) + 1;

  // Record by tool (if applicable)
  if (toolId) {
    routingMetrics.byTool[toolId] = (routingMetrics.byTool[toolId] || 0) + 1;
  }

  // Record latency (keep last 100)
  routingMetrics.latencyHistogram.push(latencyMs);
  if (routingMetrics.latencyHistogram.length > 100) {
    routingMetrics.latencyHistogram.shift();
  }

  // Record confidence (keep last 100)
  if (confidence > 0) {
    routingMetrics.confidenceHistogram.push(confidence);
    if (routingMetrics.confidenceHistogram.length > 100) {
      routingMetrics.confidenceHistogram.shift();
    }
  }

  // Track auto-execute vs conversation ratio
  if (action === 'execute') {
    routingMetrics.autoExecuteCount++;
  } else if (action === 'conversation') {
    routingMetrics.conversationCount++;
  }

  // Log periodic summary (every 100 routes)
  if (routingMetrics.totalRoutes % 100 === 0) {
    const avgLatency =
      routingMetrics.latencyHistogram.reduce((a, b) => a + b, 0) /
      routingMetrics.latencyHistogram.length;
    const avgConfidence =
      routingMetrics.confidenceHistogram.length > 0
        ? routingMetrics.confidenceHistogram.reduce((a, b) => a + b, 0) /
          routingMetrics.confidenceHistogram.length
        : 0;

    log.info(
      {
        totalRoutes: routingMetrics.totalRoutes,
        avgLatencyMs: avgLatency.toFixed(1),
        avgConfidence: avgConfidence.toFixed(3),
        autoExecuteRate:
          (
            (routingMetrics.autoExecuteCount /
              (routingMetrics.autoExecuteCount + routingMetrics.conversationCount)) *
            100
          ).toFixed(1) + '%',
        topTools: Object.entries(routingMetrics.byTool)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([t, c]) => `${t}:${c}`),
      },
      '📊 Semantic routing metrics summary'
    );
  }
}

/**
 * Get current routing metrics (for monitoring/debugging).
 */
export function getSemanticRoutingMetrics(): {
  totalRoutes: number;
  avgLatencyMs: number;
  avgConfidence: number;
  autoExecuteRate: number;
  byAction: Record<string, number>;
  topTools: Array<[string, number]>;
} {
  const avgLatency =
    routingMetrics.latencyHistogram.length > 0
      ? routingMetrics.latencyHistogram.reduce((a, b) => a + b, 0) /
        routingMetrics.latencyHistogram.length
      : 0;
  const avgConfidence =
    routingMetrics.confidenceHistogram.length > 0
      ? routingMetrics.confidenceHistogram.reduce((a, b) => a + b, 0) /
        routingMetrics.confidenceHistogram.length
      : 0;
  const autoExecuteRate =
    routingMetrics.autoExecuteCount + routingMetrics.conversationCount > 0
      ? routingMetrics.autoExecuteCount /
        (routingMetrics.autoExecuteCount + routingMetrics.conversationCount)
      : 0;

  return {
    totalRoutes: routingMetrics.totalRoutes,
    avgLatencyMs: avgLatency,
    avgConfidence,
    autoExecuteRate,
    byAction: { ...routingMetrics.byAction },
    topTools: Object.entries(routingMetrics.byTool)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10) as Array<[string, number]>,
  };
}

/**
 * Reset routing metrics (for testing).
 */
export function resetSemanticRoutingMetrics(): void {
  routingMetrics.totalRoutes = 0;
  routingMetrics.byAction = {};
  routingMetrics.byTool = {};
  routingMetrics.latencyHistogram = [];
  routingMetrics.confidenceHistogram = [];
  routingMetrics.autoExecuteCount = 0;
  routingMetrics.conversationCount = 0;
  routingMetrics.lastRoutingTime = 0;
}

// ============================================================================
// REQUEST COALESCER FOR ROUTING
// ============================================================================

/**
 * Feature flag to enable/disable routing coalescing.
 * Can be disabled for debugging or if issues arise.
 */
const ENABLE_ROUTER_COALESCING = process.env.ENABLE_ROUTER_COALESCING !== 'false';

/**
 * Request coalescer for semantic routing.
 * Coalesces identical routing requests to prevent duplicate work when
 * multiple concurrent requests have the same input text and persona.
 *
 * Key: SHA256 hash of normalized input text + personaId
 * Note: Does NOT include userId to keep results user-agnostic
 *
 * Benefits:
 * - Reduces redundant routing work during high-concurrency scenarios
 * - TTL-based cleanup (60s) prevents memory leaks
 * - Built-in stats tracking for observability
 */
const routerCoalescer = getRequestCoalescer<SemanticRouterResult>('semantic-router', {
  pendingTtlMs: 60000,
  maxPending: 5000,
  // Clone results to prevent mutation bugs when multiple callers share the result
  cloneResult: (result) => structuredClone(result),
});

/**
 * Generate a coalescing key for a routing request.
 * Key is based on normalized input + persona (NOT userId) for safety.
 */
function getRoutingCoalesceKey(inputText: string, personaId?: string): string {
  const keyData = JSON.stringify({
    text: normalizeText(inputText),
    personaId: personaId ?? 'default',
    // Note: Do NOT include userId - results should be user-agnostic
    // Note: Do NOT include conversationHistory - too variable
  });
  return hashContent(keyData);
}

// ============================================================================
// ROUTER CLASS
// ============================================================================

export class SemanticRouter {
  private registry: SemanticToolRegistry;
  private config: SemanticRouterConfig;
  private embeddingProvider: EmbeddingProvider | null = null;
  private initialized = false;

  constructor(config: Partial<SemanticRouterConfig> = {}, registry?: SemanticToolRegistry) {
    // Import DEFAULT_ROUTER_CONFIG dynamically to avoid circular dependency
    const defaultConfig: SemanticRouterConfig = {
      thresholds: {
        autoExecute: 0.92,
        confirm: 0.8,
        hint: 0.6,
        minimum: 0.4,
      },
      layerWeights: {
        pattern: 1.0,
        keyword: 0.7,
        embedding: 0.85,
        context: 0.6,
        history: 0.4,
        holistic: 0.85, // Holistic NLU (relationship, emotion, multi-intent)
      },
      maxMatches: 5,
      enabledLayers: ['pattern', 'keyword', 'embedding', 'context', 'holistic'],
      embeddingModel: 'google',
      cacheEmbeddings: true,
      debug: false,
    };

    this.config = { ...defaultConfig, ...config };
    this.registry = registry || getToolRegistry();
  }

  /**
   * Initialize the router (compute embeddings, etc.)
   */
  async initialize(embeddingProvider?: EmbeddingProvider): Promise<void> {
    if (this.initialized) return;

    const startTime = performance.now();
    log.info('Initializing semantic router...');

    if (embeddingProvider) {
      this.embeddingProvider = embeddingProvider;
      this.registry.setEmbeddingProvider(embeddingProvider);
    }

    // Compute embeddings for all registered tools
    if (this.embeddingProvider) {
      await this.registry.computeEmbeddings();
    }

    this.initialized = true;
    const duration = performance.now() - startTime;

    log.info(
      {
        toolCount: this.registry.size,
        hasEmbeddings: this.registry.hasEmbeddings(),
        durationMs: duration.toFixed(1),
      },
      'Semantic router initialized'
    );
  }

  /**
   * Route user input to tools
   */
  async route(
    inputText: string,
    context?: {
      userId?: string;
      sessionId?: string;
      personaId?: string;
      conversationHistory?: ConversationTurn[];
      recentTools?: string[];
    }
  ): Promise<SemanticRouterResult> {
    // Check if coalescing should be used
    // Only coalesce when there's no conversation history (first turn) to avoid context conflicts
    const shouldCoalesce =
      ENABLE_ROUTER_COALESCING &&
      (!context?.conversationHistory || context.conversationHistory.length === 0);

    if (shouldCoalesce) {
      const coalesceKey = getRoutingCoalesceKey(inputText, context?.personaId);
      return routerCoalescer.execute(coalesceKey, () => this.doRoute(inputText, context));
    }

    return this.doRoute(inputText, context);
  }

  /**
   * Internal routing implementation (separated for coalescing)
   */
  private async doRoute(
    inputText: string,
    context?: {
      userId?: string;
      sessionId?: string;
      personaId?: string;
      conversationHistory?: ConversationTurn[];
      recentTools?: string[];
    }
  ): Promise<SemanticRouterResult> {
    const startTime = performance.now();

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Get query embedding if provider available
    let queryEmbedding: EmbeddingVector | undefined;
    if (this.embeddingProvider && this.config.enabledLayers.includes('embedding')) {
      try {
        queryEmbedding = await this.embeddingProvider.embed(inputText);
      } catch (error) {
        log.warn({ error }, 'Failed to get query embedding, proceeding without');
      }
    }

    // Run combined matching (pass sessionId for multi-turn context enrichment)
    const matchResult = runCombinedMatching(inputText, this.registry, this.config, {
      sessionId: context?.sessionId,
      userId: context?.userId,
      personaId: context?.personaId,
      conversationHistory: context?.conversationHistory,
      recentTools: context?.recentTools,
      queryEmbedding,
    });

    // GEMINI RELIABILITY BOOST: Boost confidence for known Gemini problem phrases
    // When using Gemini, these phrases often cause it to "chat about" calling tools
    // instead of actually calling them. By boosting semantic router confidence,
    // we bypass Gemini for these patterns.
    if (isUsingGemini() && matchResult.matches.length > 0) {
      const confidenceBoost = getGeminiConfidenceBoost(inputText);
      if (confidenceBoost > 1.0) {
        for (const match of matchResult.matches) {
          const boostedConfidence = Math.min(1.0, match.confidence * confidenceBoost);
          if (boostedConfidence !== match.confidence) {
            log.debug(
              {
                toolId: match.toolId,
                originalConfidence: match.confidence.toFixed(3),
                boostedConfidence: boostedConfidence.toFixed(3),
                input: inputText.slice(0, 50),
              },
              '🚀 Gemini problem phrase - boosting confidence'
            );
            match.confidence = boostedConfidence;
          }
        }
      }
    }

    // Extract arguments for top matches
    for (const match of matchResult.matches) {
      const toolDef = this.registry.get(match.toolId);
      if (toolDef) {
        const extraction = extractToolArguments(inputText, toolDef, {
          conversationHistory: context?.conversationHistory,
        });
        match.extractedArgs = extraction.args;
        match.missingArgs = extraction.missingRequired;

        // Adjust confidence based on argument extraction
        if (extraction.missingRequired.length > 0) {
          // Penalize if missing required args
          match.confidence *= extraction.confidence;
        }
      }
    }

    // Determine action
    const action = this.determineAction(matchResult.matches, matchResult.intent);

    // Build metadata
    const metadata: RoutingMetadata = {
      totalTimeMs: performance.now() - startTime,
      layerTimesMs: matchResult.timings,
      toolsConsidered: this.registry.size,
      inputText,
      normalizedText: normalizeText(inputText),
      contextUsed: context?.conversationHistory?.map((t) => t.text.slice(0, 50)) || [],
      routerVersion: '1.0.0',
    };

    const result: SemanticRouterResult = {
      intent: matchResult.intent,
      matches: matchResult.matches,
      action,
      extractedArgs:
        action.type === 'execute' || action.type === 'confirm' || action.type === 'hint'
          ? matchResult.matches[0]?.extractedArgs
          : undefined,
      metadata,
      // Include holistic NLU context for downstream consumers
      holisticContext: matchResult.holisticResult
        ? toHolisticContextSummary(matchResult.holisticResult)
        : undefined,
    };

    // Log for debugging
    if (this.config.debug) {
      log.debug(
        {
          input: inputText,
          intent: matchResult.intent,
          topMatch: matchResult.matches[0]?.toolId,
          topConfidence: matchResult.matches[0]?.confidence,
          action: action.type,
        },
        'Routing result'
      );
    }

    // P1 FIX: Record metrics for observability
    recordRoutingMetrics(
      action.type,
      action.type === 'execute' || action.type === 'confirm' || action.type === 'hint'
        ? (matchResult.matches[0]?.toolId ?? null)
        : null,
      matchResult.matches[0]?.confidence ?? 0,
      metadata.totalTimeMs
    );

    return result;
  }

  /**
   * Determine the recommended action based on matches
   */
  private determineAction(
    matches: ToolMatch[],
    intent: SemanticRouterResult['intent']
  ): RouterAction {
    // No matches → pure conversation
    if (matches.length === 0) {
      return {
        type: 'conversation',
        reason: 'No tools matched with sufficient confidence',
      };
    }

    const topMatch = matches[0];
    const toolDef = this.registry.get(topMatch.toolId);

    // Check for missing required arguments
    if (topMatch.missingArgs.length > 0) {
      return {
        type: 'clarify',
        question: `I need more information. What's the ${topMatch.missingArgs[0]}?`,
        missingInfo: topMatch.missingArgs,
      };
    }

    // Very high confidence → auto-execute
    if (topMatch.confidence >= this.config.thresholds.autoExecute) {
      // Unless tool requires confirmation
      if (toolDef?.requiresConfirmation) {
        return {
          type: 'confirm',
          toolId: topMatch.toolId,
          args: topMatch.extractedArgs,
          question: `Should I ${toolDef.shortDescription.toLowerCase()}?`,
        };
      }

      return {
        type: 'execute',
        toolId: topMatch.toolId,
        args: topMatch.extractedArgs,
        confidence: topMatch.confidence,
      };
    }

    // High confidence → confirm
    if (topMatch.confidence >= this.config.thresholds.confirm) {
      return {
        type: 'confirm',
        toolId: topMatch.toolId,
        args: topMatch.extractedArgs,
        question: toolDef
          ? `Would you like me to ${toolDef.shortDescription.toLowerCase()}?`
          : 'Would you like me to do that?',
      };
    }

    // Multiple close matches → disambiguate
    if (
      matches.length >= 2 &&
      matches[1].confidence > this.config.thresholds.hint &&
      topMatch.confidence - matches[1].confidence < 0.15
    ) {
      return {
        type: 'disambiguate',
        options: matches.slice(0, 3).map((m) => ({
          toolId: m.toolId,
          description: this.registry.get(m.toolId)?.shortDescription || m.toolId,
        })),
      };
    }

    // Medium confidence → hint to LLM
    if (topMatch.confidence >= this.config.thresholds.hint) {
      return {
        type: 'hint',
        toolId: topMatch.toolId,
        confidence: topMatch.confidence,
      };
    }

    // Low confidence → pure conversation
    return {
      type: 'conversation',
      reason: `Top match confidence (${(topMatch.confidence * 100).toFixed(0)}%) below hint threshold`,
    };
  }

  /**
   * Execute a tool directly
   */
  async execute(
    toolId: string,
    args: Record<string, unknown>,
    context: Omit<ToolExecutionContext, 'originalText' | 'confidence'>
  ): Promise<ToolExecutionResult> {
    const toolDef = this.registry.get(toolId);
    if (!toolDef) {
      return {
        success: false,
        error: `Tool not found: ${toolId}`,
        naturalResponse: `I don't have a tool called ${toolId}`,
      };
    }

    try {
      const fullContext: ToolExecutionContext = {
        ...context,
        originalText: '',
        confidence: 1.0,
      };

      const result = await toolDef.execute(args, fullContext);

      // Record usage
      this.registry.recordUsage(toolId);

      // Convert SemanticRoutingResult to ToolExecutionResult if needed
      if (isSemanticRoutingResult(result)) {
        // This is a SemanticRoutingResult - convert to ToolExecutionResult
        return {
          success: true,
          data: { toolId: result.tool, args: result.args },
          naturalResponse: `Routing to ${result.tool}`,
        };
      }

      // At this point result is ToolExecutionResult - explicitly construct it to ensure type safety
      const executionResult: ToolExecutionResult = {
        success: 'success' in result ? Boolean(result.success) : true,
        data: 'data' in result ? result.data : undefined,
        naturalResponse:
          'naturalResponse' in result ? (result.naturalResponse as string) : undefined,
        error: 'error' in result ? (result.error as string) : undefined,
        speakImmediately:
          'speakImmediately' in result ? (result.speakImmediately as boolean) : undefined,
      };
      return executionResult;
    } catch (error) {
      log.error({ error, toolId, args }, 'Tool execution failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        naturalResponse: 'I ran into a problem with that. Let me try another way.',
      };
    }
  }

  /**
   * Get the tool registry
   */
  getRegistry(): SemanticToolRegistry {
    return this.registry;
  }

  /**
   * Get router configuration
   */
  getConfig(): SemanticRouterConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SemanticRouterConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

let routerInstance: SemanticRouter | null = null;

/**
 * Create or get the semantic router instance
 */
export function createSemanticRouter(
  config?: Partial<SemanticRouterConfig>,
  registry?: SemanticToolRegistry
): SemanticRouter {
  if (!routerInstance) {
    routerInstance = new SemanticRouter(config, registry);
  }
  return routerInstance;
}

/**
 * Reset the router (for testing)
 */
export function resetSemanticRouter(): void {
  routerInstance = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick route function for simple use cases
 */
export async function routeUserInput(
  inputText: string,
  context?: {
    userId?: string;
    sessionId?: string;
    personaId?: string;
    conversationHistory?: ConversationTurn[];
    recentTools?: string[];
  }
): Promise<SemanticRouterResult> {
  const router = createSemanticRouter();
  return router.route(inputText, context);
}

/**
 * Check if input likely needs a tool (quick check before full routing)
 */
export function mightNeedTool(inputText: string): boolean {
  const lowerText = inputText.toLowerCase();

  // Quick patterns that almost always need tools
  const toolPatterns = [
    /^play\s/i,
    /^stop\s/i,
    /^pause/i,
    /^set\s+(?:a\s+)?(?:reminder|timer|alarm)/i,
    /^remind\s+me/i,
    /^what(?:'s| is)\s+the\s+(?:weather|time|date)/i,
    /^call\s+/i,
    /^text\s+/i,
    /^send\s+/i,
    /^transfer\s+(?:me\s+)?to/i,
    /^(?:hand|switch)\s+(?:me\s+)?(?:off|over)\s+to/i,
    /^talk\s+to\s+/i,
  ];

  return toolPatterns.some((p) => p.test(lowerText));
}

/**
 * Get stats for the router coalescer (for observability)
 */
export function getRouterCoalescerStats(): {
  totalRequests: number;
  coalescedRequests: number;
  actualExecutions: number;
  coalesceRate: number;
  errors: number;
  currentPending: number;
} {
  return routerCoalescer.getStats();
}

/**
 * Check if router coalescing is enabled.
 * Useful for debugging and observability dashboards.
 */
export function isRouterCoalescingEnabled(): boolean {
  return ENABLE_ROUTER_COALESCING;
}
