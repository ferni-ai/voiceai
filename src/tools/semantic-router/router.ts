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
import { getToolRegistry, type SemanticToolRegistry } from './registry.js';
import { runCombinedMatching, normalizeText } from './matcher.js';
import { extractToolArguments } from './argument-extractor.js';
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
} from './types.js';
import { isSemanticRoutingResult } from './types.js';

const log = createLogger({ module: 'semantic-router' });

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
      },
      maxMatches: 5,
      enabledLayers: ['pattern', 'keyword', 'embedding', 'context'],
      embeddingModel: 'openai',
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

    // Run combined matching
    const matchResult = runCombinedMatching(inputText, this.registry, this.config, {
      conversationHistory: context?.conversationHistory,
      recentTools: context?.recentTools,
      queryEmbedding,
    });

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
