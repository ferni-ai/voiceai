/**
 * Voice Agent Integration for Semantic Router
 *
 * Integrates the semantic router into the voice agent pipeline.
 * This module intercepts user input BEFORE it reaches the LLM,
 * routes to tools when appropriate, and provides hints for ambiguous cases.
 *
 * INTEGRATION POINTS:
 *
 * 1. Pre-LLM: Route clear tool requests directly
 * 2. LLM Hint: Pass tool suggestions to LLM for ambiguous cases
 * 3. Post-LLM Fallback: Catch tool intents the LLM missed
 *
 * @module tools/semantic-router/voice-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createEmbeddingProvider } from './embedding-providers.js';
import {
  createSemanticRouter,
  mightNeedTool,
  type ConversationTurn,
  type RouterAction,
  type SemanticRouter,
  type SemanticRouterResult,
  type ToolExecutionResult,
} from './index.js';
import { getToolRegistry } from './registry.js';

// Import tool definitions
import { handoffTools } from './tool-definitions/handoff.semantic.js';
import { musicTools } from './tool-definitions/music.semantic.js';

const log = createLogger({ module: 'semantic-router:voice' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceRouterContext {
  userId: string;
  sessionId: string;
  personaId: string;
  conversationHistory: ConversationTurn[];
  recentTools: string[];
}

export interface VoiceRouterResult {
  /** Whether to bypass LLM entirely and execute tool */
  bypassLLM: boolean;

  /** Tool execution result if bypassed */
  toolResult?: ToolExecutionResult;

  /** Hint to inject into LLM context */
  llmHint?: string;

  /** Original routing result */
  routingResult: SemanticRouterResult;

  /** Processing time in ms */
  processingTimeMs: number;
}

// ============================================================================
// VOICE ROUTER INTEGRATION
// ============================================================================

let initialized = false;
let router: SemanticRouter | null = null;

/**
 * Initialize the voice semantic router
 */
export async function initializeVoiceRouter(): Promise<void> {
  if (initialized) return;

  log.info('Initializing voice semantic router...');
  const startTime = performance.now();

  // Get the registry and register all tools
  const registry = getToolRegistry();

  // Register tool definitions
  registry.registerMany(musicTools);
  registry.registerMany(handoffTools);

  // Add more tool definitions here as they're created
  // registry.registerMany(calendarTools);
  // registry.registerMany(weatherTools);
  // registry.registerMany(memoryTools);

  log.info({ toolCount: registry.size }, 'Tools registered');

  // Create router
  router = createSemanticRouter({
    debug: process.env.NODE_ENV === 'development',
    thresholds: {
      autoExecute: 0.92,
      confirm: 0.8,
      hint: 0.55, // Lower threshold for hints
      minimum: 0.35,
    },
  });

  // Initialize with embedding provider
  // Use OpenAI for production quality, Google for cost savings
  const embeddingModel = process.env.EMBEDDING_MODEL || 'openai';
  const embeddingProvider = createEmbeddingProvider(
    embeddingModel as 'openai' | 'google' | 'local'
  );

  await router.initialize(embeddingProvider);

  // eslint-disable-next-line require-atomic-updates
  initialized = true;
  const duration = performance.now() - startTime;

  log.info(
    {
      toolCount: registry.size,
      embeddingModel,
      durationMs: duration.toFixed(1),
    },
    'Voice semantic router initialized'
  );
}

/**
 * Route user input through the semantic router
 *
 * Call this BEFORE sending to the LLM. It will:
 * 1. Check if input likely needs a tool
 * 2. Route and extract arguments
 * 3. Execute directly if high confidence
 * 4. Return hints for LLM if medium confidence
 */
export async function routeVoiceInput(
  inputText: string,
  context: VoiceRouterContext
): Promise<VoiceRouterResult> {
  const startTime = performance.now();

  // Ensure initialized
  if (!initialized || !router) {
    await initializeVoiceRouter();
  }

  // Safe reference to router after initialization check
  const activeRouter = router as SemanticRouter;

  // Quick check - does this even look like a tool request?
  if (!mightNeedTool(inputText)) {
    // Still route for logging/analytics, but expect conversation result
    const routingResult = await activeRouter.route(inputText, context);

    return {
      bypassLLM: false,
      routingResult,
      processingTimeMs: performance.now() - startTime,
    };
  }

  // Full routing
  const routingResult = await activeRouter.route(inputText, context);
  const { action } = routingResult;

  // Handle different action types
  switch (action.type) {
    case 'execute': {
      // High confidence - execute directly, bypass LLM
      log.info(
        {
          toolId: action.toolId,
          confidence: action.confidence,
          args: action.args,
        },
        'Auto-executing tool'
      );

      const toolResult = await activeRouter.execute(action.toolId, action.args, {
        userId: context.userId,
        sessionId: context.sessionId,
        personaId: context.personaId,
        conversationHistory: context.conversationHistory,
        services: undefined,
      });

      return {
        bypassLLM: true,
        toolResult,
        routingResult,
        processingTimeMs: performance.now() - startTime,
      };
    }

    case 'confirm': {
      // High-ish confidence - let LLM confirm naturally
      return {
        bypassLLM: false,
        llmHint: generateLLMHint('confirm', action),
        routingResult,
        processingTimeMs: performance.now() - startTime,
      };
    }

    case 'hint': {
      // Medium confidence - hint to LLM
      return {
        bypassLLM: false,
        llmHint: generateLLMHint('hint', action),
        routingResult,
        processingTimeMs: performance.now() - startTime,
      };
    }

    case 'disambiguate': {
      // Multiple matches - let LLM ask
      return {
        bypassLLM: false,
        llmHint: generateLLMHint('disambiguate', action),
        routingResult,
        processingTimeMs: performance.now() - startTime,
      };
    }

    case 'clarify': {
      // Missing info - let LLM ask
      return {
        bypassLLM: false,
        llmHint: generateLLMHint('clarify', action),
        routingResult,
        processingTimeMs: performance.now() - startTime,
      };
    }

    case 'conversation':
    default:
      // Pure conversation - no tool hints
      return {
        bypassLLM: false,
        routingResult,
        processingTimeMs: performance.now() - startTime,
      };
  }
}

/**
 * Generate a hint for the LLM based on routing result
 */
function generateLLMHint(type: string, action: RouterAction): string {
  switch (type) {
    case 'confirm':
      if (action.type === 'confirm') {
        return `[TOOL HINT] User likely wants: ${action.toolId}. Args: ${JSON.stringify(action.args)}. Confirm naturally before executing.`;
      }
      break;

    case 'hint':
      if (action.type === 'hint') {
        return `[TOOL HINT] Consider using: ${action.toolId} (confidence: ${(action.confidence * 100).toFixed(0)}%)`;
      }
      break;

    case 'disambiguate':
      if (action.type === 'disambiguate') {
        const options = action.options.map((o) => o.description).join(', ');
        return `[TOOL HINT] Multiple tools might apply: ${options}. Ask user to clarify.`;
      }
      break;

    case 'clarify':
      if (action.type === 'clarify') {
        return `[TOOL HINT] To use a tool, need: ${action.missingInfo.join(', ')}. Ask naturally.`;
      }
      break;
  }

  return '';
}

/**
 * Post-LLM fallback: Check if LLM response indicates tool intent but didn't execute
 *
 * Call this AFTER LLM responds, if the response seems like it should have used a tool.
 */
export async function checkMissedToolIntent(
  userInput: string,
  llmResponse: string,
  context: VoiceRouterContext
): Promise<{
  missedTool: boolean;
  suggestedTool?: string;
  suggestedArgs?: Record<string, unknown>;
}> {
  if (!router) {
    return { missedTool: false };
  }

  // Indicators that LLM tried to call a tool but failed
  const missedPatterns = [
    /i (?:can't|cannot|am unable to) (?:play|call|search|set)/i,
    /i don't have (?:access|the ability) to/i,
    /unfortunately.*(?:can't|unable)/i,
    /i would need to.*but/i,
  ];

  const llmTriedButFailed = missedPatterns.some((p) => p.test(llmResponse));

  if (llmTriedButFailed) {
    // Re-route the user input
    const routingResult = await router.route(userInput, context);

    if (routingResult.matches.length > 0 && routingResult.matches[0].confidence > 0.5) {
      return {
        missedTool: true,
        suggestedTool: routingResult.matches[0].toolId,
        suggestedArgs: routingResult.matches[0].extractedArgs,
      };
    }
  }

  return { missedTool: false };
}

/**
 * Get the router instance (for testing/advanced usage)
 */
export function getVoiceRouter(): SemanticRouter | null {
  return router;
}

/**
 * Check if router is initialized
 */
export function isVoiceRouterInitialized(): boolean {
  return initialized;
}

// ============================================================================
// METRICS & ANALYTICS
// ============================================================================

interface RouterMetrics {
  totalRoutes: number;
  autoExecuted: number;
  hinted: number;
  conversations: number;
  avgLatencyMs: number;
  toolUsage: Record<string, number>;
}

const metrics: RouterMetrics = {
  totalRoutes: 0,
  autoExecuted: 0,
  hinted: 0,
  conversations: 0,
  avgLatencyMs: 0,
  toolUsage: {},
};

/**
 * Get router metrics
 */
export function getRouterMetrics(): RouterMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetRouterMetrics(): void {
  metrics.totalRoutes = 0;
  metrics.autoExecuted = 0;
  metrics.hinted = 0;
  metrics.conversations = 0;
  metrics.avgLatencyMs = 0;
  metrics.toolUsage = {};
}
