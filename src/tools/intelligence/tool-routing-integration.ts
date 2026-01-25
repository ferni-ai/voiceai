/**
 * FTIS Integration Layer
 *
 * Bridges the Ferni Tool Intelligence System with the unified tool orchestrator.
 * Provides complexity-based routing, sequence prediction, and outcome tracking.
 *
 * @module tools/intelligence/tool-routing-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { IntelligentExecutor } from './execution/intelligent-executor.js';
import { getIntelligentExecutor } from './execution/intelligent-executor.js';
import type { OutcomeTracker } from './learning/outcome-tracker.js';
import { getOutcomeTracker } from './learning/outcome-tracker.js';
import type { ComplexityClassifier } from './planning/complexity-classifier.js';
import {
  getComplexityClassifier,
  type ComplexityResult,
} from './planning/complexity-classifier.js';
import type { MCTSPlanner } from './planning/mcts/planner.js';
import { getMCTSPlanner } from './planning/mcts/planner.js';
import type { MCTSPlan, PlanningContext } from './planning/mcts/types.js';
export type { MCTSPlan }; // Re-export for consumers
import type { SequencePredictor } from './planning/sequence-predictor.js';
import {
  getSequencePredictor,
  type ToolSequence as PredictedSequence,
} from './planning/sequence-predictor.js';
import type { TransitionLearner, TransitionMatrix } from './transitions/index.js';
import { getTransitionLearner, getTransitionMatrix } from './transitions/index.js';
import { getTimeOfDay } from './transitions/types.js';

const log = createLogger({ module: 'tool-routing-integration' });

// ============================================================================
// TYPES
// ============================================================================

export interface FTISRoutingRequest {
  /** User query/transcript */
  query: string;
  /** User ID for personalization */
  userId: string;
  /** Active persona */
  personaId: string;
  /** Session ID for tracking */
  sessionId: string;
  /** Available tool IDs from orchestrator */
  availableTools: string[];
  /** Current emotional state */
  emotion?: string;
  /** Recent tools used in session */
  recentTools?: string[];
}

export interface FTISRoutingResult {
  /** Complexity classification */
  complexity: ComplexityResult;
  /** Recommended tool sequence (for medium/complex queries) */
  sequence?: PredictedSequence;
  /** MCTS plan (for complex queries) */
  plan?: MCTSPlan;
  /** Predicted next tools (from transition matrix) */
  predictions?: Array<{ toolId: string; probability: number }>;
  /** Whether to use simple execution (just call tools directly) */
  useSimpleExecution: boolean;
  /** Total routing time in ms */
  routingTimeMs: number;
}

export interface FTISConfig {
  /** Enable complexity-based routing */
  enableComplexityRouting: boolean;
  /** Enable transition matrix predictions */
  enableTransitions: boolean;
  /** Enable outcome tracking */
  enableOutcomeTracking: boolean;
  /** Enable MCTS planning for complex queries */
  enableMCTS: boolean;
  /** Max simulations for MCTS */
  mctsMaxSimulations: number;
  /** MCTS timeout in ms */
  mctsTimeoutMs: number;
}

const DEFAULT_CONFIG: FTISConfig = {
  enableComplexityRouting: true,
  enableTransitions: true,
  enableOutcomeTracking: true,
  enableMCTS: true,
  mctsMaxSimulations: 50,
  mctsTimeoutMs: 200,
};

// ============================================================================
// FTIS INTEGRATION CLASS
// ============================================================================

export class FTISIntegration {
  private config: FTISConfig;
  private initialized = false;
  private classifier: ComplexityClassifier | null = null;
  private sequencePredictor: SequencePredictor | null = null;
  private planner: MCTSPlanner | null = null;
  private executor: IntelligentExecutor | null = null;
  private outcomeTracker: OutcomeTracker | null = null;
  private transitionMatrix: TransitionMatrix | null = null;
  private transitionLearner: TransitionLearner | null = null;

  constructor(config: Partial<FTISConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize FTIS components
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const startTime = Date.now();
    log.info('🧠 Initializing FTIS Integration...');

    try {
      // Initialize core components (except executor - lazy loaded when needed)
      this.classifier = getComplexityClassifier();
      this.sequencePredictor = getSequencePredictor();
      this.planner = getMCTSPlanner();
      // NOTE: IntelligentExecutor requires a toolExecutor function which isn't
      // available at FTIS initialization time. It will be lazily initialized
      // when setToolExecutor() is called or when execution is first needed.
      // this.executor = getIntelligentExecutor(); -- REMOVED: causes startup error
      this.outcomeTracker = getOutcomeTracker();
      this.transitionMatrix = getTransitionMatrix();
      this.transitionLearner = getTransitionLearner();

      // Note: Transition matrix loading from Firestore happens lazily
      // when a Firestore connection is established elsewhere in the app.
      // This keeps FTIS initialization fast and independent of Firestore.

      this.initialized = true;
      log.info({ durationMs: Date.now() - startTime }, '✅ FTIS Integration initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize FTIS');
      throw error;
    }
  }

  /**
   * Set the tool executor for plan execution.
   * Call this when a tool executor becomes available (e.g., after session setup).
   */
  setToolExecutor(toolExecutor: Parameters<typeof getIntelligentExecutor>[0]): void {
    if (toolExecutor) {
      this.executor = getIntelligentExecutor(toolExecutor);
      log.debug('✅ FTIS executor initialized');
    }
  }

  /**
   * Get the executor (if available)
   */
  getExecutor(): IntelligentExecutor | null {
    return this.executor;
  }

  // ==========================================================================
  // ROUTING API
  // ==========================================================================

  /**
   * Route a query through FTIS for intelligent tool selection
   */
  async route(request: FTISRoutingRequest): Promise<FTISRoutingResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    // 1. Classify complexity
    const complexity = this.classifier!.classify({
      query: request.query,
      previousToolCount: request.recentTools?.length,
      personaId: request.personaId,
    });

    log.debug(
      {
        query: request.query.slice(0, 50),
        complexity: complexity.complexity,
        confidence: complexity.confidence.toFixed(2),
        approach: complexity.suggestedApproach,
      },
      '🎯 Query complexity classified'
    );

    // 2. Get transition predictions (if we have recent tools)
    let predictions: Array<{ toolId: string; probability: number }> | undefined;
    if (this.config.enableTransitions && request.recentTools?.length) {
      const lastTool = request.recentTools[request.recentTools.length - 1];
      const context = {
        personaId: request.personaId,
        timeOfDay: getTimeOfDay(new Date()),
        emotion: request.emotion,
      };
      const preds = this.transitionMatrix!.getPredictions(lastTool, context, 5);
      if (preds.length > 0) {
        predictions = preds.map((p) => ({
          toolId: p.toolId,
          probability: p.probability,
        }));
        log.debug(
          { lastTool, topPrediction: predictions[0] },
          '📈 Transition predictions available'
        );
      }
    }

    // 3. Route based on complexity
    let sequence: PredictedSequence | undefined;
    let plan: MCTSPlan | undefined;

    if (complexity.suggestedApproach === 'sequence' && this.config.enableComplexityRouting) {
      // Medium complexity - use sequence prediction
      const predContext = {
        personaId: request.personaId,
        emotion: request.emotion,
        timeOfDay: getTimeOfDay(new Date()),
        availableTools: request.availableTools,
      };

      // Use transition-based prediction if we have recent tools
      if (request.recentTools?.length) {
        const lastTool = request.recentTools[request.recentTools.length - 1];
        sequence = this.sequencePredictor!.predictFromTool(lastTool, predContext);
      } else if (predictions?.length) {
        // Use top prediction from transition matrix
        sequence = this.sequencePredictor!.predictFromTool(predictions[0].toolId, predContext);
      }

      if (sequence) {
        log.debug(
          {
            steps: sequence.steps.length,
            confidence: sequence.confidence.toFixed(2),
          },
          '📋 Sequence predicted'
        );
      }
    } else if (complexity.suggestedApproach === 'mcts' && this.config.enableMCTS) {
      // Complex query - use MCTS planning
      const planningContext: PlanningContext = {
        query: request.query,
        personaId: request.personaId,
        availableTools: request.availableTools,
        userId: request.userId,
        sessionTools: request.recentTools,
      };

      plan = this.planner!.plan(planningContext);

      log.debug(
        {
          planLength: plan.tools.length,
          planValue: plan.value.toFixed(2),
        },
        '🌳 MCTS plan generated'
      );
    }

    const result: FTISRoutingResult = {
      complexity,
      sequence,
      plan,
      predictions,
      useSimpleExecution: complexity.suggestedApproach === 'direct',
      routingTimeMs: Date.now() - startTime,
    };

    return result;
  }

  // ==========================================================================
  // SESSION LIFECYCLE INTEGRATION
  // ==========================================================================

  /**
   * Start tracking tools for a session
   */
  startSession(userId: string, sessionId: string, personaId: string): void {
    if (!this.transitionLearner) return;

    this.transitionLearner.startSession(userId, sessionId, personaId);

    log.debug({ sessionId }, '📝 Started FTIS session tracking');
  }

  /**
   * Record a tool call in the session
   */
  recordToolCall(sessionId: string, toolId: string, success: boolean, latencyMs?: number): void {
    // Record in transition learner
    if (this.transitionLearner) {
      this.transitionLearner.recordToolCall(sessionId, toolId, success, latencyMs);
    }
  }

  /**
   * Update session context (e.g., when emotion changes)
   */
  updateSessionContext(sessionId: string, context: { personaId?: string; emotion?: string }): void {
    if (!this.transitionLearner) return;
    this.transitionLearner.updateSessionContext(sessionId, context);
  }

  /**
   * End session and learn from tool sequences
   */
  async endSession(sessionId: string): Promise<void> {
    if (!this.transitionLearner) return;

    const sequence = this.transitionLearner.endSession(sessionId);
    if (sequence && sequence.sequence.length >= 2) {
      log.debug(
        { sessionId, toolCount: sequence.sequence.length },
        '📊 Session ended, transitions recorded'
      );

      // Persist transitions to Firestore
      try {
        const { getTransitionSync } = await import('./transitions/firestore-sync.js');
        const sync = getTransitionSync();
        await sync.saveToFirestore();
      } catch {
        // Firestore not available
      }
    }

    // Flush outcome tracker
    if (this.outcomeTracker) {
      await this.outcomeTracker.flush();
    }
  }

  // ==========================================================================
  // METRICS & DIAGNOSTICS
  // ==========================================================================

  /**
   * Get FTIS metrics for observability
   */
  getMetrics(): {
    transitionMatrix: {
      totalTransitions: number;
      totalObservations: number;
    };
    planner: {
      simulationCount: number;
    };
    learner: {
      activeSessions: number;
      recentSequences: number;
    };
  } {
    const matrixStats = this.transitionMatrix?.getStats();
    const plannerStats = this.planner?.getStats();
    const learnerStats = this.transitionLearner?.getStats();

    return {
      transitionMatrix: {
        totalTransitions: matrixStats?.totalTransitions || 0,
        totalObservations: matrixStats?.totalObservations || 0,
      },
      planner: {
        simulationCount: plannerStats?.simulationCount || 0,
      },
      learner: {
        activeSessions: learnerStats?.activeSessions || 0,
        recentSequences: learnerStats?.recentSequences || 0,
      },
    };
  }

  /**
   * Get common tool patterns
   */
  getToolPatterns(): Array<{
    pattern: string[];
    occurrences: number;
    contexts: string[];
  }> {
    if (!this.transitionLearner) return [];
    return this.transitionLearner.getCommonPatterns();
  }

  /**
   * Get tool co-occurrence data
   */
  getToolCooccurrences(): Map<string, string[]> {
    if (!this.transitionLearner) return new Map();
    return this.transitionLearner.getToolCooccurrences();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let ftisInstance: FTISIntegration | null = null;

export function getFTISIntegration(): FTISIntegration {
  if (!ftisInstance) {
    ftisInstance = new FTISIntegration();
  }
  return ftisInstance;
}

export async function initializeFTIS(config?: Partial<FTISConfig>): Promise<FTISIntegration> {
  if (!ftisInstance) {
    ftisInstance = new FTISIntegration(config);
  }
  await ftisInstance.initialize();
  return ftisInstance;
}

export function resetFTIS(): void {
  ftisInstance = null;
}
