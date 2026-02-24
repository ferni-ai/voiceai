/**
 * Intelligent Router Integration
 *
 * Integrates the intelligent routing cascade into the voice agent pipeline.
 * Enhances the existing semantic routing with:
 * - Intent classification (< 5ms)
 * - Multi-armed bandit optimization
 * - LLM fallback for uncertain cases
 * - ReAct reasoning for complex queries
 * - Goal planning for multi-step requests
 *
 * @module tools/semantic-router/integration/intelligent-router-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { IntelligentRouterOrchestrator } from '../advanced/intelligent/index.js';
import {
  getIntelligentOrchestrator,
  initializeIntelligentOrchestrator,
  type RoutingDecision,
  type OrchestratorConfig,
  createGeminiProvider,
  createOpenAIProvider,
} from '../advanced/intelligent/index.js';
import { routeUserInput, createSemanticRouter } from '../router.js';
import type { SemanticRouterResult } from '../types.js';
import type { TurnRouterResult, RoutingContext } from './turn-processor-integration.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'intelligent-router-integration' });

// ============================================================================
// STATE
// ============================================================================

let intelligentRouterInitialized = false;
let orchestrator: IntelligentRouterOrchestrator | null = null;

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface IntelligentRouterConfig extends Partial<OrchestratorConfig> {
  /** Use Gemini for LLM-based strategies */
  useGemini?: boolean;
  /** Use OpenAI for LLM-based strategies */
  useOpenAI?: boolean;
  /** Enable Firestore persistence for bandit optimizer */
  enableBanditPersistence?: boolean;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the intelligent router
 *
 * Should be called during voice agent startup.
 */
export async function initializeIntelligentRouter(
  config: IntelligentRouterConfig = {}
): Promise<void> {
  if (intelligentRouterInitialized) {
    log.debug('Intelligent router already initialized');
    return;
  }

  const startTime = performance.now();
  log.info('Initializing intelligent router...');

  try {
    // Create orchestrator
    orchestrator = initializeIntelligentOrchestrator({
      enableIntentClassifier: config.enableIntentClassifier ?? true,
      enableLLMFallback: config.enableLLMFallback ?? true,
      enableReActReasoning: config.enableReActReasoning ?? true,
      enableGoalPlanning: config.enableGoalPlanning ?? true,
      enableBanditOptimization: config.enableBanditOptimization ?? true,
      thresholds: config.thresholds,
      maxRoutingTimeMs: config.maxRoutingTimeMs ?? 3000,
      logMetrics: config.logMetrics ?? true,
    });

    // Get tool definitions from registry
    const { getToolRegistry } = await import('../registry.js');
    const registry = getToolRegistry();
    const semanticTools = registry.getAll();

    const toolDefinitions = semanticTools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description || tool.shortDescription,
      // Parameters are defined in semantic tools but not typed - use empty array as fallback
      parameters: [] as Array<{
        name: string;
        type: string;
        required: boolean;
        description: string;
      }>,
    }));

    // Set up LLM provider - prefer GEMINI_API_KEY for LLM, fallback to GOOGLE_API_KEY
    let llmProvider;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (config.useGemini && geminiKey) {
      llmProvider = createGeminiProvider(geminiKey);
    } else if (config.useOpenAI && process.env.OPENAI_API_KEY) {
      llmProvider = createOpenAIProvider(process.env.OPENAI_API_KEY);
    } else if (geminiKey) {
      llmProvider = createGeminiProvider(geminiKey);
    }

    // Set up bandit persistence
    let banditPersistence;
    if (config.enableBanditPersistence) {
      banditPersistence = await createBanditFirestorePersistence();
    }

    // Create semantic router callback
    const semanticRouterCallback = async (
      input: string,
      context?: { userId?: string; sessionId?: string; personaId?: string }
    ): Promise<SemanticRouterResult> => {
      return routeUserInput(input, context);
    };

    // Initialize orchestrator
    await orchestrator.initialize({
      tools: toolDefinitions,
      llmProvider,
      semanticRouter: semanticRouterCallback,
      banditPersistence,
    });

    intelligentRouterInitialized = true;
    const duration = performance.now() - startTime;

    log.info(
      {
        toolCount: toolDefinitions.length,
        hasLLM: !!llmProvider,
        hasBanditPersistence: !!banditPersistence,
        durationMs: duration.toFixed(1),
      },
      'Intelligent router initialized'
    );
  } catch (error) {
    log.error({ error }, 'Failed to initialize intelligent router');
    throw error;
  }
}

/**
 * Create Firestore persistence for bandit optimizer
 *
 * NOTE: Arms contain ToolArm objects with contextWeights as Map<string, number>.
 * Firestore only accepts plain objects, so we must convert all Maps.
 */
async function createBanditFirestorePersistence() {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    return {
      save: async (arms: Map<string, unknown>) => {
        // Convert Map to plain object, handling nested Maps in ToolArm.contextWeights
        const plainArms: Record<string, unknown> = {};

        for (const [armId, arm] of arms) {
          const armObj = arm as Record<string, unknown>;

          // Convert contextWeights Map to plain object
          let contextWeightsPlain: Record<string, number> = {};
          const cw = armObj.contextWeights;
          if (cw) {
            if (cw instanceof Map) {
              contextWeightsPlain = Object.fromEntries(cw);
            } else if (typeof cw === 'object' && cw !== null) {
              // Already object-like, copy properties
              for (const [k, v] of Object.entries(cw as Record<string, unknown>)) {
                if (typeof v === 'number') {
                  contextWeightsPlain[k] = v;
                }
              }
            }
          }

          // Build plain object for Firestore
          plainArms[armId] = {
            toolId: armObj.toolId,
            successes: armObj.successes,
            failures: armObj.failures,
            attempts: armObj.attempts,
            averageReward: armObj.averageReward,
            lastUpdated:
              armObj.lastUpdated instanceof Date
                ? armObj.lastUpdated.toISOString()
                : armObj.lastUpdated || new Date().toISOString(),
            contextWeights: contextWeightsPlain,
          };
        }

        await db
          .collection('system_cache')
          .doc('bandit_arms')
          .set(
            cleanForFirestore({
              arms: plainArms,
              updatedAt: new Date(),
            })
          );
        log.debug({ armCount: arms.size }, 'Bandit arms saved to Firestore');
      },
      load: async () => {
        const doc = await db.collection('system_cache').doc('bandit_arms').get();
        if (!doc.exists) {
          return new Map();
        }
        const data = doc.data()?.arms || {};
        log.debug({ armCount: Object.keys(data).length }, 'Bandit arms loaded from Firestore');
        return new Map(Object.entries(data));
      },
    };
  } catch (error) {
    log.warn({ error }, 'Failed to create Firestore persistence for bandit');
    return undefined;
  }
}

// ============================================================================
// INTELLIGENT ROUTING
// ============================================================================

/**
 * Route using the intelligent cascade
 *
 * Enhanced version of startSemanticRouting that uses all intelligent strategies.
 */
export async function startIntelligentRouting(
  userText: string,
  context: RoutingContext
): Promise<TurnRouterResult & { intelligentDecision?: RoutingDecision }> {
  // Ensure initialized
  if (!intelligentRouterInitialized || !orchestrator) {
    log.warn('Intelligent router not initialized, falling back to standard routing');
    const { startSemanticRouting } = await import('./turn-processor-integration.js');
    return startSemanticRouting(userText, context);
  }

  const startTime = performance.now();

  try {
    // Route through intelligent cascade
    const decision = await orchestrator.route(userText, {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      conversationHistory: context.conversationHistory?.map((h) => ({
        role: h.role,
        content: h.content,
      })),
      recentTools: context.recentTools,
    });

    const latencyMs = performance.now() - startTime;

    log.info(
      {
        userText: userText.slice(0, 50),
        decidedBy: decision.decidedBy,
        toolId: decision.toolId,
        action: decision.action,
        confidence: decision.confidence?.toFixed(2),
        latencyMs: latencyMs.toFixed(1),
      },
      '🧠 Intelligent routing complete'
    );

    // Convert to TurnRouterResult format
    return convertToTurnRouterResult(decision, userText, context, latencyMs);
  } catch (error) {
    log.error({ error, userText: userText.slice(0, 50) }, 'Intelligent routing failed');

    // Fallback to standard semantic routing
    const { startSemanticRouting } = await import('./turn-processor-integration.js');
    return startSemanticRouting(userText, context);
  }
}

/**
 * Convert RoutingDecision to TurnRouterResult
 */
async function convertToTurnRouterResult(
  decision: RoutingDecision,
  userText: string,
  context: RoutingContext,
  latencyMs: number
): Promise<TurnRouterResult & { intelligentDecision?: RoutingDecision }> {
  // Handle plan action
  if (decision.action === 'plan' && decision.plan) {
    // For now, execute first step of plan
    // TODO: Full plan execution with state management
    const firstStep = decision.plan.steps[0];
    if (firstStep) {
      log.info(
        {
          planSteps: decision.plan.steps.length,
          firstTool: firstStep.toolId,
        },
        '📋 Executing first step of plan'
      );

      // Execute first step
      const result = await executeToolForResult(firstStep.toolId, firstStep.args, context);

      return {
        attempted: true,
        executed: true,
        output: result.naturalResponse,
        routeResult: createRouteResultFromDecision(decision),
        routingPath: 'semantic_auto_execute',
        intelligentDecision: decision,
      };
    }
  }

  // Handle execute action
  if (decision.action === 'execute' && decision.toolId) {
    const result = await executeToolForResult(decision.toolId, decision.args, context);

    return {
      attempted: true,
      executed: result.success,
      output: result.naturalResponse,
      routeResult: createRouteResultFromDecision(decision),
      routingPath: 'semantic_auto_execute',
      intelligentDecision: decision,
    };
  }

  // Handle conversation or clarify
  if (decision.action === 'conversation' || decision.action === 'clarify') {
    return {
      attempted: true,
      executed: false,
      routeResult: createRouteResultFromDecision(decision),
      routingPath: 'semantic_conversation',
      intelligentDecision: decision,
    };
  }

  // Handle confirm (pass to LLM with hint)
  return {
    attempted: true,
    executed: false,
    routeResult: createRouteResultFromDecision(decision),
    routingPath: 'semantic_hint',
    intelligentDecision: decision,
  };
}

/**
 * Execute a tool and get the result
 */
async function executeToolForResult(
  toolId: string,
  args: Record<string, unknown>,
  context: RoutingContext
): Promise<{ success: boolean; naturalResponse: string; error?: string }> {
  try {
    const { hasDomainMapping, executeDomainTool } = await import('../domain-bridge/index.js');

    if (hasDomainMapping(toolId)) {
      const execContext = {
        userId: context.userId,
        sessionId: context.sessionId,
        personaId: context.personaId,
        conversationHistory:
          context.conversationHistory?.map((h) => ({
            role: h.role as 'user' | 'assistant',
            text: h.content,
            timestamp: new Date(),
          })) || [],
        services: null,
      };

      const result = await executeDomainTool(toolId, args, execContext);

      // 🚫 DEDUPLICATION: Mark tool as executed to prevent JSON workaround from re-executing
      if (result.success && context.sessionId) {
        try {
          const { markToolExecutedBySemanticRouter } =
            await import('../../../agents/shared/sanitizer/index.js');
          markToolExecutedBySemanticRouter(context.sessionId, toolId);
        } catch {
          // Non-critical - deduplication is defensive
        }
      }

      return {
        success: result.success,
        naturalResponse: result.naturalResponse ?? '',
        error: result.error,
      };
    }

    // Fallback to semantic tool execution
    const { getToolRegistry } = await import('../registry.js');
    const registry = getToolRegistry();
    const tool = registry.get(toolId);

    if (tool?.execute) {
      const execContext: import('../types.js').ToolExecutionContext = {
        userId: context.userId,
        sessionId: context.sessionId,
        personaId: context.personaId,
        conversationHistory:
          context.conversationHistory?.map((h) => ({
            role: h.role as 'user' | 'assistant',
            text: h.content,
            timestamp: new Date(),
          })) || [],
        services: null as unknown, // Services not available in intelligent router context
        originalText: '',
        confidence: 1.0,
      };

      const result = await tool.execute(args, execContext);

      // 🚫 DEDUPLICATION: Mark tool as executed to prevent JSON workaround from re-executing
      if (context.sessionId) {
        try {
          const { markToolExecutedBySemanticRouter } =
            await import('../../../agents/shared/sanitizer/index.js');
          markToolExecutedBySemanticRouter(context.sessionId, toolId);
        } catch {
          // Non-critical - deduplication is defensive
        }
      }

      // Handle string or object result
      if (typeof result === 'string') {
        return { success: true, naturalResponse: result };
      }

      // Type guard for tool execution result
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as {
          success?: boolean;
          naturalResponse?: string;
          error?: string;
        };
        return {
          success: typedResult.success ?? true,
          naturalResponse: typedResult.naturalResponse ?? 'Done.',
          error: typedResult.error,
        };
      }

      return { success: true, naturalResponse: 'Done.' };
    }

    return {
      success: false,
      naturalResponse: "I couldn't find that tool.",
      error: `Tool not found: ${toolId}`,
    };
  } catch (error) {
    return {
      success: false,
      naturalResponse: 'Something went wrong.',
      error: String(error),
    };
  }
}

/**
 * Create SemanticRouterResult from RoutingDecision
 */
function createRouteResultFromDecision(decision: RoutingDecision): SemanticRouterResult {
  const intentCategory = decision.rawResults.intentClassifier?.intent?.category || 'unknown';

  const matches: import('../types.js').ToolMatch[] = decision.toolId
    ? [
        {
          toolId: decision.toolId,
          confidence: decision.confidence,
          matchedBy: ['embedding'] as import('../types.js').MatchLayer[],
          layerScores: {
            pattern: 0,
            keyword: 0,
            embedding: decision.confidence,
            context: 0,
            history: 0,
            holistic: 0,
          },
          extractedArgs: decision.args,
          missingArgs: [],
          matchReason: `Intelligent routing via ${decision.decidedBy}`,
        },
      ]
    : [];

  // Build action based on decision
  let action: import('../types.js').RouterAction;

  if (decision.toolId && (decision.action === 'execute' || decision.action === 'plan')) {
    action = {
      type: 'execute',
      toolId: decision.toolId,
      args: decision.args,
      confidence: decision.confidence,
    };
  } else if (decision.toolId && decision.action === 'confirm') {
    action = {
      type: 'hint',
      toolId: decision.toolId,
      confidence: decision.confidence,
    };
  } else if (decision.action === 'clarify') {
    action = {
      type: 'clarify',
      question: decision.reasoning || 'Could you tell me more?',
      missingInfo: [],
    };
  } else {
    action = {
      type: 'conversation',
      reason: decision.reasoning || 'No tool matched',
    };
  }

  return {
    intent: {
      category: intentCategory as
        | import('../types.js').ToolCategory
        | 'conversation'
        | 'clarification'
        | 'unknown',
      confidence: decision.confidence,
      mood: 'request',
      urgency: 'normal',
    },
    matches,
    action,
    extractedArgs: decision.args,
    metadata: {
      totalTimeMs: decision.timing.total,
      layerTimesMs: {
        pattern: decision.timing.intentClassifier || 0,
        keyword: 0,
        embedding: decision.timing.semanticRouter || 0,
        context: decision.timing.banditOptimizer || 0,
        history: 0,
        holistic: 0,
      },
      toolsConsidered: 0,
      inputText: '',
      normalizedText: '',
      contextUsed: [],
      routerVersion: '2.0.0-intelligent',
    },
  };
}

// ============================================================================
// OUTCOME TRACKING
// ============================================================================

/**
 * Record outcome of intelligent routing for learning
 */
export function recordIntelligentOutcome(
  decision: RoutingDecision,
  outcome: { success: boolean; reward?: number; feedback?: string }
): void {
  if (!orchestrator) {
    log.warn('Cannot record outcome: orchestrator not initialized');
    return;
  }

  orchestrator.recordOutcome(decision, outcome);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if intelligent routing is initialized
 */
export function isIntelligentRouterInitialized(): boolean {
  return intelligentRouterInitialized;
}

/**
 * Get the orchestrator instance
 */
export function getOrchestrator(): IntelligentRouterOrchestrator | null {
  return orchestrator;
}

/**
 * Get routing statistics
 */
export function getIntelligentRoutingStats() {
  if (!orchestrator) {
    return null;
  }
  return orchestrator.getStats();
}

/**
 * Reset the intelligent router
 */
export function resetIntelligentRouter(): void {
  if (orchestrator) {
    orchestrator.cleanup();
  }
  orchestrator = null;
  intelligentRouterInitialized = false;
  log.info('Intelligent router reset');
}
