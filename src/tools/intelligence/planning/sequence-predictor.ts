/**
 * Enhanced Sequence Predictor
 *
 * Predicts multi-tool sequences using the FTIS transition matrix.
 * Integrates learned patterns with context-aware predictions.
 *
 * This enhances the existing tool-chain-predictor with:
 * - Transition matrix integration
 * - Context-conditioned predictions (persona, emotion, time)
 * - Confidence-weighted sequence selection
 * - Parallel execution opportunity detection
 *
 * @module tools/intelligence/planning/sequence-predictor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getTransitionMatrix, type TransitionMatrix } from '../transitions/transition-matrix.js';
import type { TransitionPrediction, TimeOfDay } from '../transitions/types.js';
import type { RouterOutput, ToolPrediction } from '../router/inference/types.js';

const log = createLogger({ module: 'ftis:sequence-predictor' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A step in a predicted tool sequence
 */
export interface SequenceStep {
  /** Tool ID */
  toolId: string;
  /** Confidence in this step */
  confidence: number;
  /** Steps this depends on (indices) */
  dependsOn: number[];
  /** Whether this step is optional */
  optional: boolean;
  /** Can run in parallel with previous step */
  parallelizable: boolean;
  /** Source of this prediction */
  source: 'router' | 'transition' | 'pattern';
}

/**
 * A predicted tool sequence
 */
export interface ToolSequence {
  /** Ordered steps */
  steps: SequenceStep[];
  /** Overall sequence confidence */
  confidence: number;
  /** Recommended execution strategy */
  executionStrategy: 'sequential' | 'parallel' | 'mixed';
  /** Estimated total duration in ms */
  estimatedDurationMs: number;
  /** Parallel execution groups */
  parallelGroups?: number[][];
}

/**
 * Context for sequence prediction
 */
export interface SequencePredictionContext {
  /** Active persona */
  personaId: string;
  /** Current emotion */
  emotion?: string;
  /** Time of day */
  timeOfDay: TimeOfDay;
  /** User ID for personalization */
  userId?: string;
  /** Previously executed tools in session */
  previousTools?: string[];
}

/**
 * Configuration for the sequence predictor
 */
export interface SequencePredictorConfig {
  /** Maximum sequence length */
  maxSequenceLength: number;
  /** Minimum confidence to include a step */
  minStepConfidence: number;
  /** Whether to detect parallel opportunities */
  detectParallelism: boolean;
  /** Weight for transition matrix predictions */
  transitionWeight: number;
  /** Weight for router predictions */
  routerWeight: number;
  /** Confidence decay per step */
  confidenceDecay: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: SequencePredictorConfig = {
  maxSequenceLength: 5,
  minStepConfidence: 0.3,
  detectParallelism: true,
  transitionWeight: 0.6,
  routerWeight: 0.4,
  confidenceDecay: 0.85,
};

// ============================================================================
// PARALLELISM DETECTION
// ============================================================================

/**
 * Tool domains for dependency analysis
 */
const INDEPENDENT_DOMAINS = new Set([
  ['weather', 'calendar'],
  ['music', 'tasks'],
  ['habits', 'weather'],
  ['finance', 'calendar'],
  ['notes', 'music'],
]);

/**
 * Check if two tools can run in parallel
 */
function canRunInParallel(toolA: string, toolB: string): boolean {
  // Extract domain from tool ID (e.g., "weather_current" -> "weather")
  const domainA = toolA.split('_')[0];
  const domainB = toolB.split('_')[0];

  // Same domain = likely sequential
  if (domainA === domainB) {
    return false;
  }

  // Check known independent pairs
  for (const [d1, d2] of INDEPENDENT_DOMAINS) {
    if ((domainA === d1 && domainB === d2) || (domainA === d2 && domainB === d1)) {
      return true;
    }
  }

  // Default to sequential for safety
  return false;
}

// ============================================================================
// SEQUENCE PREDICTOR
// ============================================================================

export class SequencePredictor {
  private config: SequencePredictorConfig;
  private matrix: TransitionMatrix;

  constructor(config: Partial<SequencePredictorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.matrix = getTransitionMatrix();
  }

  // ==========================================================================
  // PREDICTION
  // ==========================================================================

  /**
   * Predict a tool sequence starting from router output
   */
  predict(routerOutput: RouterOutput, context: SequencePredictionContext): ToolSequence {
    const steps: SequenceStep[] = [];
    let currentConfidence = routerOutput.topConfidence;

    // Start with the top router prediction
    if (routerOutput.predictions.length > 0) {
      const firstTool = routerOutput.predictions[0];
      steps.push({
        toolId: firstTool.toolId,
        confidence: firstTool.confidence,
        dependsOn: [],
        optional: false,
        parallelizable: false,
        source: 'router',
      });
    }

    // Predict subsequent steps using transition matrix
    while (
      steps.length < this.config.maxSequenceLength &&
      currentConfidence >= this.config.minStepConfidence
    ) {
      const lastTool = steps[steps.length - 1].toolId;

      // Get transition predictions
      const nextPredictions = this.matrix.getPredictions(lastTool, {
        personaId: context.personaId,
        timeOfDay: context.timeOfDay,
        emotion: context.emotion,
      });

      if (nextPredictions.length === 0) {
        break;
      }

      // Get best prediction that isn't already in sequence
      const existingTools = new Set(steps.map((s) => s.toolId));
      const nextBest = nextPredictions.find((p) => !existingTools.has(p.toolId));

      if (!nextBest || nextBest.probability < this.config.minStepConfidence) {
        break;
      }

      // Calculate step confidence with decay
      currentConfidence *= this.config.confidenceDecay;
      const stepConfidence = Math.min(nextBest.probability, currentConfidence);

      // Check if parallelizable with previous step
      const parallelizable =
        this.config.detectParallelism &&
        steps.length > 0 &&
        canRunInParallel(lastTool, nextBest.toolId);

      steps.push({
        toolId: nextBest.toolId,
        confidence: stepConfidence,
        dependsOn: parallelizable ? [] : [steps.length - 1],
        optional: stepConfidence < 0.5,
        parallelizable,
        source: 'transition',
      });
    }

    // Also consider adding router's secondary predictions as parallel options
    if (steps.length < this.config.maxSequenceLength && routerOutput.predictions.length > 1) {
      const existingTools = new Set(steps.map((s) => s.toolId));

      for (let i = 1; i < Math.min(3, routerOutput.predictions.length); i++) {
        const pred = routerOutput.predictions[i];

        if (
          !existingTools.has(pred.toolId) &&
          pred.confidence >= this.config.minStepConfidence &&
          canRunInParallel(steps[0].toolId, pred.toolId)
        ) {
          steps.push({
            toolId: pred.toolId,
            confidence: pred.confidence * 0.9, // Slight discount for secondary
            dependsOn: [],
            optional: true,
            parallelizable: true,
            source: 'router',
          });
          break;
        }
      }
    }

    // Calculate overall confidence
    const overallConfidence =
      steps.length > 0 ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length : 0;

    // Determine execution strategy
    const hasParallel = steps.some((s) => s.parallelizable);
    const executionStrategy = hasParallel
      ? steps.filter((s) => !s.parallelizable).length > 1
        ? 'mixed'
        : 'parallel'
      : 'sequential';

    // Calculate parallel groups
    const parallelGroups = this.config.detectParallelism
      ? this.computeParallelGroups(steps)
      : undefined;

    // Estimate duration (assume ~300ms per sequential tool, parallel tools run together)
    const estimatedDurationMs = this.estimateDuration(steps, parallelGroups);

    log.debug(
      {
        stepCount: steps.length,
        confidence: overallConfidence.toFixed(2),
        strategy: executionStrategy,
        estimatedMs: estimatedDurationMs,
      },
      'Sequence predicted'
    );

    return {
      steps,
      confidence: overallConfidence,
      executionStrategy,
      estimatedDurationMs,
      parallelGroups,
    };
  }

  /**
   * Predict sequence from just a starting tool
   */
  predictFromTool(toolId: string, context: SequencePredictionContext): ToolSequence {
    // Create a mock router output
    const mockRouterOutput: RouterOutput = {
      predictions: [{ toolId, confidence: 0.9, rank: 1 }],
      topConfidence: 0.9,
      skipLLM: true,
      latencyMs: 0,
      modelVersion: 'mock',
    };

    return this.predict(mockRouterOutput, context);
  }

  /**
   * Get likely next tools given current tool
   */
  getLikelyNext(
    currentTool: string,
    context: SequencePredictionContext,
    topK = 3
  ): Array<{ toolId: string; probability: number; source: string }> {
    const results: Array<{ toolId: string; probability: number; source: string }> = [];

    // Get transition matrix predictions
    const transitionPreds = this.matrix.getPredictions(
      currentTool,
      {
        personaId: context.personaId,
        timeOfDay: context.timeOfDay,
        emotion: context.emotion,
      },
      topK
    );

    for (const pred of transitionPreds) {
      results.push({
        toolId: pred.toolId,
        probability: pred.probability,
        source: 'transition_matrix',
      });
    }

    // Sort by probability and take top K
    results.sort((a, b) => b.probability - a.probability);
    return results.slice(0, topK);
  }

  // ==========================================================================
  // PARALLEL GROUP COMPUTATION
  // ==========================================================================

  /**
   * Compute groups of steps that can run in parallel
   */
  private computeParallelGroups(steps: SequenceStep[]): number[][] {
    if (steps.length <= 1) {
      return [[0]];
    }

    const groups: number[][] = [];
    let currentGroup: number[] = [0];

    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];

      if (step.parallelizable && step.dependsOn.length === 0) {
        // Can run with previous group
        currentGroup.push(i);
      } else {
        // Start new group
        groups.push(currentGroup);
        currentGroup = [i];
      }
    }

    // Add final group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Estimate total duration based on parallel groups
   */
  private estimateDuration(steps: SequenceStep[], parallelGroups?: number[][]): number {
    const TOOL_DURATION_MS = 300;

    if (!parallelGroups || parallelGroups.length === 0) {
      return steps.length * TOOL_DURATION_MS;
    }

    // Duration is sum of max durations per group
    return parallelGroups.length * TOOL_DURATION_MS;
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SequencePredictorConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): SequencePredictorConfig {
    return { ...this.config };
  }

  /**
   * Use a different transition matrix
   */
  setTransitionMatrix(matrix: TransitionMatrix): void {
    this.matrix = matrix;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let predictorInstance: SequencePredictor | null = null;

export function getSequencePredictor(): SequencePredictor {
  if (!predictorInstance) {
    predictorInstance = new SequencePredictor();
  }
  return predictorInstance;
}

export function resetSequencePredictor(): void {
  predictorInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORT
// ============================================================================

/**
 * Quick sequence prediction helper
 */
export function predictSequence(
  routerOutput: RouterOutput,
  context: Partial<SequencePredictionContext> = {}
): ToolSequence {
  const predictor = getSequencePredictor();
  return predictor.predict(routerOutput, {
    personaId: context.personaId || 'ferni',
    timeOfDay: context.timeOfDay || 'afternoon',
    emotion: context.emotion,
    userId: context.userId,
    previousTools: context.previousTools,
  });
}
