/**
 * Intelligent Router Orchestrator
 *
 * The master router that combines ALL intelligent routing strategies:
 * 1. Intent Classifier (fastest, <5ms)
 * 2. Semantic Router (existing, 20-50ms)
 * 3. LLM Fallback (for uncertain cases)
 * 4. ReAct Reasoning (for explainable decisions)
 * 5. Goal Planner (for complex multi-step requests)
 * 6. Multi-Armed Bandit (for RL-based optimization)
 *
 * Routing strategy cascade:
 * - Fast patterns catch 60% of requests in <5ms
 * - Semantic routing handles 30% more in <50ms
 * - LLM fallback handles 8% uncertain cases in <500ms
 * - ReAct/Planning handles 2% complex cases in <2s
 *
 * @module semantic-router/advanced/intelligent/orchestrator
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { SemanticRouterResult } from '../../types.js';

import type { IntentClassifier} from './intent-classifier.js';
import { getIntentClassifier, type ClassificationResult } from './intent-classifier.js';
import type { LLMFallbackRouter} from './llm-fallback.js';
import { getLLMFallbackRouter, type LLMSelectionResult, type LLMProvider } from './llm-fallback.js';
import type { ReActReasoningEngine} from './react-reasoning.js';
import { getReActEngine, type ReActResult, type ReActLLMProvider } from './react-reasoning.js';
import type { GoalPlanner} from './goal-planner.js';
import { getGoalPlanner, type ExecutionPlan, type PlanExecutionState, type GoalPlannerLLMProvider, type ToolExecutor } from './goal-planner.js';
import type { BanditOptimizer} from './bandit-optimizer.js';
import { getBanditOptimizer, type SelectionResult as BanditSelection, type RoutingContext as BanditContext, type ToolArm } from './bandit-optimizer.js';

const log = createLogger({ module: 'intelligent-orchestrator' });

// ============================================================================
// TYPES
// ============================================================================

export interface OrchestratorConfig {
  /** Enable intent classifier (fast first pass) */
  enableIntentClassifier: boolean;
  /** Enable LLM fallback for uncertain cases */
  enableLLMFallback: boolean;
  /** Enable ReAct reasoning for complex queries */
  enableReActReasoning: boolean;
  /** Enable goal planning for multi-step requests */
  enableGoalPlanning: boolean;
  /** Enable bandit optimization */
  enableBanditOptimization: boolean;
  /** Confidence thresholds */
  thresholds: {
    /** Intent classifier confidence to skip semantic routing */
    intentClassifierSkip: number;
    /** Semantic router confidence to skip LLM fallback */
    semanticRouterConfident: number;
    /** Uncertainty level to trigger LLM fallback */
    uncertaintyTrigger: number;
    /** Confidence to auto-execute without confirmation */
    autoExecute: number;
  };
  /** Maximum total routing time before forcing a decision */
  maxRoutingTimeMs: number;
  /** Log detailed routing metrics */
  logMetrics: boolean;
}

export interface RoutingDecision {
  /** Final selected tool ID */
  toolId: string | null;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Overall confidence */
  confidence: number;
  /** Action type */
  action: 'execute' | 'confirm' | 'clarify' | 'conversation' | 'plan';
  /** If action is 'plan', the execution plan */
  plan?: ExecutionPlan;
  /** Which strategy made the final decision */
  decidedBy: RoutingStrategy;
  /** Reasoning explanation (if available) */
  reasoning?: string;
  /** Should we explain the decision to the user? */
  shouldExplain: boolean;
  /** All strategies that were consulted */
  strategiesUsed: RoutingStrategy[];
  /** Timing breakdown */
  timing: {
    total: number;
    intentClassifier?: number;
    semanticRouter?: number;
    llmFallback?: number;
    reactReasoning?: number;
    goalPlanner?: number;
    banditOptimizer?: number;
  };
  /** Raw results from each strategy */
  rawResults: {
    intentClassifier?: ClassificationResult;
    semanticRouter?: SemanticRouterResult;
    llmFallback?: LLMSelectionResult;
    reactReasoning?: ReActResult;
    goalPlanner?: { needsPlanning: boolean; plan?: ExecutionPlan };
    banditOptimizer?: BanditSelection;
  };
}

export type RoutingStrategy =
  | 'intent-classifier'
  | 'semantic-router'
  | 'llm-fallback'
  | 'react-reasoning'
  | 'goal-planner'
  | 'bandit-optimizer'
  | 'cascade';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
}

export interface RoutingContext {
  userId: string;
  sessionId?: string;
  personaId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  recentTools?: string[];
  uncertainty?: { epistemic: number; aleatoric: number; total: number };
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: OrchestratorConfig = {
  enableIntentClassifier: true,
  enableLLMFallback: true,
  enableReActReasoning: true,
  enableGoalPlanning: true,
  enableBanditOptimization: true,
  thresholds: {
    intentClassifierSkip: 0.9,
    semanticRouterConfident: 0.85,
    uncertaintyTrigger: 0.35,
    autoExecute: 0.92,
  },
  maxRoutingTimeMs: 3000,
  logMetrics: true,
};

// ============================================================================
// INTELLIGENT ROUTER ORCHESTRATOR
// ============================================================================

export class IntelligentRouterOrchestrator {
  private config: OrchestratorConfig;
  private intentClassifier: IntentClassifier;
  private llmFallback: LLMFallbackRouter;
  private reactEngine: ReActReasoningEngine;
  private goalPlanner: GoalPlanner;
  private banditOptimizer: BanditOptimizer;

  // Tool definitions for LLM-based strategies
  private toolDefinitions = new Map<string, ToolDefinition>();

  // Callbacks for semantic routing (the existing system)
  private semanticRouterCallback?: (input: string, context?: RoutingContext) => Promise<SemanticRouterResult>;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize all strategies
    this.intentClassifier = getIntentClassifier();
    this.llmFallback = getLLMFallbackRouter();
    this.reactEngine = getReActEngine();
    this.goalPlanner = getGoalPlanner();
    this.banditOptimizer = getBanditOptimizer();
  }

  /**
   * Initialize the orchestrator with tool definitions and LLM providers
   */
  async initialize(options: {
    tools: ToolDefinition[];
    llmProvider?: LLMProvider;
    semanticRouter?: (input: string, context?: RoutingContext) => Promise<SemanticRouterResult>;
    banditPersistence?: {
      save: (arms: Map<string, unknown>) => Promise<void>;
      load: () => Promise<Map<string, unknown>>;
    };
  }): Promise<void> {
    // Store tool definitions
    for (const tool of options.tools) {
      this.toolDefinitions.set(tool.id, tool);
    }

    // Set LLM providers
    if (options.llmProvider) {
      this.llmFallback.setLLMProvider(options.llmProvider);
      this.reactEngine.setLLMProvider(options.llmProvider as ReActLLMProvider);
      this.goalPlanner.setLLMProvider(options.llmProvider as GoalPlannerLLMProvider);
    }

    // Set semantic router callback
    if (options.semanticRouter) {
      this.semanticRouterCallback = options.semanticRouter;
    }

    // Initialize bandit with tool IDs
    await this.banditOptimizer.initialize(options.tools.map((t) => t.id));

    // Set bandit persistence
    if (options.banditPersistence) {
      this.banditOptimizer.setPersistence(
        options.banditPersistence.save as (arms: Map<string, ToolArm>) => Promise<void>,
        options.banditPersistence.load as () => Promise<Map<string, ToolArm>>
      );
    }

    log.info(
      {
        toolCount: options.tools.length,
        enabledStrategies: this.getEnabledStrategies(),
      },
      'Intelligent router orchestrator initialized'
    );
  }

  /**
   * Route user input through the intelligent cascade
   */
  async route(input: string, context?: RoutingContext): Promise<RoutingDecision> {
    const startTime = performance.now();
    const strategiesUsed: RoutingStrategy[] = [];
    const timing: RoutingDecision['timing'] = { total: 0 };
    const rawResults: RoutingDecision['rawResults'] = {};

    let decision: Omit<RoutingDecision, 'timing' | 'rawResults' | 'strategiesUsed'> | null = null;

    try {
      // ========================================
      // LAYER 1: Intent Classifier (fastest)
      // ========================================
      if (this.config.enableIntentClassifier && !decision) {
        const icStart = performance.now();
        const icResult = this.intentClassifier.classify(input);
        timing.intentClassifier = performance.now() - icStart;
        rawResults.intentClassifier = icResult;
        strategiesUsed.push('intent-classifier');

        if (icResult.intent && icResult.confidence >= this.config.thresholds.intentClassifierSkip) {
          // High confidence intent match - we can skip semantic routing
          decision = {
            toolId: icResult.toolId,
            args: icResult.args,
            confidence: icResult.confidence,
            action: this.determineAction(icResult.confidence),
            decidedBy: 'intent-classifier',
            reasoning: `Matched intent: ${icResult.intent.name}`,
            shouldExplain: false,
          };

          log.debug(
            { input: input.slice(0, 50), intent: icResult.intent.id, confidence: icResult.confidence },
            'Intent classifier made confident decision'
          );
        }
      }

      // ========================================
      // LAYER 2: Goal Planner Check
      // ========================================
      if (this.config.enableGoalPlanning && !decision) {
        const gpStart = performance.now();
        const needsPlanning = this.goalPlanner.needsPlanning(input);
        timing.goalPlanner = performance.now() - gpStart;
        rawResults.goalPlanner = { needsPlanning: needsPlanning.needs };
        strategiesUsed.push('goal-planner');

        if (needsPlanning.needs && needsPlanning.confidence >= 0.7) {
          // Complex request - create execution plan
          const plan = await this.goalPlanner.createPlan(
            input,
            Array.from(this.toolDefinitions.values()),
            {
              conversationHistory: context?.conversationHistory,
              userId: context?.userId,
              personaId: context?.personaId,
            }
          );
          timing.goalPlanner = performance.now() - gpStart;
          rawResults.goalPlanner = { needsPlanning: true, plan };

          if (plan.steps.length > 0 && plan.confidence >= 0.6) {
            decision = {
              toolId: plan.steps[0]?.toolId || null,
              args: plan.steps[0]?.args || {},
              confidence: plan.confidence,
              action: 'plan',
              plan,
              decidedBy: 'goal-planner',
              reasoning: `Created ${plan.steps.length}-step plan: ${plan.summary}`,
              shouldExplain: true,
            };

            log.debug(
              { input: input.slice(0, 50), stepCount: plan.steps.length, confidence: plan.confidence },
              'Goal planner created execution plan'
            );
          }
        }
      }

      // ========================================
      // LAYER 3: Semantic Router (existing)
      // ========================================
      let semanticResult: SemanticRouterResult | null = null;

      if (this.semanticRouterCallback && !decision) {
        const srStart = performance.now();
        semanticResult = await this.semanticRouterCallback(input, context);
        timing.semanticRouter = performance.now() - srStart;
        rawResults.semanticRouter = semanticResult;
        strategiesUsed.push('semantic-router');

        const topMatch = semanticResult.matches[0];
        if (topMatch && topMatch.confidence >= this.config.thresholds.semanticRouterConfident) {
          decision = {
            toolId: topMatch.toolId,
            args: topMatch.extractedArgs || {},
            confidence: topMatch.confidence,
            action: this.determineActionFromSemanticResult(semanticResult),
            decidedBy: 'semantic-router',
            reasoning: `Semantic match: ${topMatch.toolId} (${(topMatch.confidence * 100).toFixed(0)}%)`,
            shouldExplain: false,
          };

          log.debug(
            { input: input.slice(0, 50), toolId: topMatch.toolId, confidence: topMatch.confidence },
            'Semantic router made confident decision'
          );
        }
      }

      // ========================================
      // LAYER 4: Bandit Optimization (re-rank)
      // ========================================
      if (this.config.enableBanditOptimization && semanticResult && !decision) {
        const boStart = performance.now();
        const candidates = semanticResult.matches.slice(0, 5).map((m) => m.toolId);

        if (candidates.length > 1) {
          const banditResult = this.banditOptimizer.select(candidates, {
            intentCategory: rawResults.intentClassifier?.intent?.category,
            personaId: context?.personaId,
            timeOfDay: this.getTimeOfDay(),
          } as BanditContext);

          timing.banditOptimizer = performance.now() - boStart;
          rawResults.banditOptimizer = banditResult;
          strategiesUsed.push('bandit-optimizer');

          // If bandit selected a different tool with good confidence
          if (banditResult.toolId !== semanticResult.matches[0]?.toolId && banditResult.expectedValue > 0.6) {
            const banditMatch = semanticResult.matches.find((m) => m.toolId === banditResult.toolId);
            if (banditMatch) {
              decision = {
                toolId: banditResult.toolId,
                args: banditMatch.extractedArgs || {},
                confidence: Math.max(banditMatch.confidence, banditResult.expectedValue),
                action: this.determineAction(banditResult.expectedValue),
                decidedBy: 'bandit-optimizer',
                reasoning: `Bandit selected: ${banditResult.toolId} (expected: ${(banditResult.expectedValue * 100).toFixed(0)}%, exploration: ${banditResult.wasExploration})`,
                shouldExplain: banditResult.wasExploration,
              };

              log.debug(
                { toolId: banditResult.toolId, expected: banditResult.expectedValue, wasExploration: banditResult.wasExploration },
                'Bandit optimizer re-ranked selection'
              );
            }
          }
        }
      }

      // ========================================
      // LAYER 5: LLM Fallback (for uncertainty)
      // ========================================
      if (this.config.enableLLMFallback && semanticResult && !decision) {
        const shouldFallback = this.llmFallback.shouldTriggerFallback(semanticResult, context?.uncertainty);

        if (shouldFallback.trigger) {
          const lfStart = performance.now();
          const toolDescMap = new Map<string, { name: string; description: string }>();
          for (const [id, def] of this.toolDefinitions) {
            toolDescMap.set(id, { name: def.name, description: def.description });
          }

          const candidates = semanticResult.matches.slice(0, 8).map((m) => ({
            toolId: m.toolId,
            name: this.toolDefinitions.get(m.toolId)?.name || m.toolId,
            description: this.toolDefinitions.get(m.toolId)?.description || '',
            confidence: m.confidence,
            extractedArgs: m.extractedArgs,
          }));

          const llmResult = await this.llmFallback.selectTool(input, candidates, {
            conversationHistory: context?.conversationHistory,
            userId: context?.userId,
            personaId: context?.personaId,
          });

          timing.llmFallback = performance.now() - lfStart;
          rawResults.llmFallback = llmResult;
          strategiesUsed.push('llm-fallback');

          if (llmResult.wasTriggered) {
            const selectedMatch = semanticResult.matches.find((m) => m.toolId === llmResult.selectedToolId);

            decision = {
              toolId: llmResult.selectedToolId,
              args: selectedMatch?.extractedArgs || {},
              confidence: llmResult.confidence,
              action: llmResult.needsClarification ? 'clarify' : this.determineAction(llmResult.confidence),
              decidedBy: 'llm-fallback',
              reasoning: llmResult.reasoning,
              shouldExplain: true,
            };

            log.debug(
              { toolId: llmResult.selectedToolId, confidence: llmResult.confidence, reason: shouldFallback.reason },
              'LLM fallback made decision'
            );
          }
        }
      }

      // ========================================
      // LAYER 6: ReAct Reasoning (for complex)
      // ========================================
      if (this.config.enableReActReasoning && !decision) {
        // Use ReAct for remaining uncertain cases
        const rrStart = performance.now();
        const reactResult = await this.reactEngine.reason(
          input,
          Array.from(this.toolDefinitions.values()),
          {
            conversationHistory: context?.conversationHistory,
            personaId: context?.personaId,
          }
        );

        timing.reactReasoning = performance.now() - rrStart;
        rawResults.reactReasoning = reactResult;
        strategiesUsed.push('react-reasoning');

        decision = {
          toolId: reactResult.decision.toolId,
          args: reactResult.decision.args,
          confidence: reactResult.decision.confidence,
          action: reactResult.decision.actionType as RoutingDecision['action'],
          decidedBy: 'react-reasoning',
          reasoning: reactResult.explanation,
          shouldExplain: reactResult.shouldExplain,
        };

        log.debug(
          { toolId: reactResult.decision.toolId, confidence: reactResult.decision.confidence },
          'ReAct reasoning made final decision'
        );
      }

      // ========================================
      // FALLBACK: Conversation
      // ========================================
      if (!decision) {
        decision = {
          toolId: null,
          args: {},
          confidence: 0.5,
          action: 'conversation',
          decidedBy: 'cascade',
          reasoning: 'No strategy produced a confident tool match',
          shouldExplain: false,
        };
      }

      // Calculate total time
      timing.total = performance.now() - startTime;

      // Log metrics if enabled
      if (this.config.logMetrics) {
        log.info(
          {
            input: input.slice(0, 50),
            decidedBy: decision.decidedBy,
            toolId: decision.toolId,
            confidence: decision.confidence?.toFixed(2),
            action: decision.action,
            totalMs: timing.total.toFixed(1),
            strategiesUsed,
          },
          'Routing complete'
        );
      }

      return {
        ...decision,
        timing,
        rawResults,
        strategiesUsed,
      };
    } catch (error) {
      log.error({ error, input: input.slice(0, 50) }, 'Routing failed');

      timing.total = performance.now() - startTime;

      return {
        toolId: null,
        args: {},
        confidence: 0,
        action: 'conversation',
        decidedBy: 'cascade',
        reasoning: `Routing error: ${error instanceof Error ? error.message : 'unknown'}`,
        shouldExplain: false,
        timing,
        rawResults,
        strategiesUsed,
      };
    }
  }

  /**
   * Execute a plan (for complex multi-step requests)
   */
  async executePlan(
    plan: ExecutionPlan,
    executor: ToolExecutor,
    options?: {
      onStepComplete?: (stepId: string, result: unknown) => void;
      onStepError?: (stepId: string, error: Error) => void;
      userId?: string;
    }
  ): Promise<PlanExecutionState> {
    return this.goalPlanner.executePlan(plan, executor, options);
  }

  /**
   * Record that a routing decision led to success/failure
   */
  recordOutcome(
    decision: RoutingDecision,
    outcome: { success: boolean; reward?: number; feedback?: string }
  ): void {
    if (!decision.toolId) return;

    // Record to bandit optimizer
    const reward = outcome.reward ?? (outcome.success ? 1 : 0);
    this.banditOptimizer.recordReward(decision.toolId, reward, {
      intentCategory: decision.rawResults.intentClassifier?.intent?.category,
    } as BanditContext);

    // Learn from corrections
    if (!outcome.success && outcome.feedback) {
      // If there's feedback about what tool should have been used
      const correctionMatch = outcome.feedback.match(/should\s+(?:have\s+)?(?:been|used)\s+(\w+)/i);
      if (correctionMatch) {
        this.intentClassifier.learnPattern(
          decision.rawResults.intentClassifier?.intent?.name || '',
          correctionMatch[1]
        );
      }
    }

    log.debug(
      { toolId: decision.toolId, success: outcome.success, reward },
      'Recorded routing outcome'
    );
  }

  /**
   * Determine action type from confidence
   */
  private determineAction(confidence: number): RoutingDecision['action'] {
    if (confidence >= this.config.thresholds.autoExecute) return 'execute';
    if (confidence >= 0.7) return 'confirm';
    if (confidence >= 0.5) return 'clarify';
    return 'conversation';
  }

  /**
   * Determine action from semantic router result
   */
  private determineActionFromSemanticResult(result: SemanticRouterResult): RoutingDecision['action'] {
    switch (result.action.type) {
      case 'execute':
        return 'execute';
      case 'confirm':
        return 'confirm';
      case 'clarify':
      case 'disambiguate':
        return 'clarify';
      default:
        return 'conversation';
    }
  }

  /**
   * Get current time of day for contextual routing
   */
  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    if (hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Get list of enabled strategies
   */
  private getEnabledStrategies(): RoutingStrategy[] {
    const strategies: RoutingStrategy[] = [];
    if (this.config.enableIntentClassifier) strategies.push('intent-classifier');
    strategies.push('semantic-router'); // Always enabled as base
    if (this.config.enableBanditOptimization) strategies.push('bandit-optimizer');
    if (this.config.enableLLMFallback) strategies.push('llm-fallback');
    if (this.config.enableGoalPlanning) strategies.push('goal-planner');
    if (this.config.enableReActReasoning) strategies.push('react-reasoning');
    return strategies;
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    enabledStrategies: RoutingStrategy[];
    banditStats: { explorationRate: number; totalSelections: number };
    toolCount: number;
  } {
    return {
      enabledStrategies: this.getEnabledStrategies(),
      banditStats: this.banditOptimizer.getExplorationStats(),
      toolCount: this.toolDefinitions.size,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.banditOptimizer.cleanup();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let orchestratorInstance: IntelligentRouterOrchestrator | null = null;

export function getIntelligentOrchestrator(): IntelligentRouterOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new IntelligentRouterOrchestrator();
  }
  return orchestratorInstance;
}

export function initializeIntelligentOrchestrator(
  config?: Partial<OrchestratorConfig>
): IntelligentRouterOrchestrator {
  orchestratorInstance = new IntelligentRouterOrchestrator(config);
  return orchestratorInstance;
}

// ============================================================================
// QUICK ROUTE FUNCTION
// ============================================================================

/**
 * Quick routing using the intelligent orchestrator
 */
export async function intelligentRoute(
  input: string,
  context?: RoutingContext
): Promise<RoutingDecision> {
  const orchestrator = getIntelligentOrchestrator();
  return orchestrator.route(input, context);
}

