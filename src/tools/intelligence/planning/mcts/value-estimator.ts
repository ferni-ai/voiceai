/**
 * Value Estimator
 *
 * Estimates the value of a plan state without full rollout.
 * Uses heuristics and learned patterns to provide fast value estimates.
 *
 * @module tools/intelligence/planning/mcts/value-estimator
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getTransitionMatrix } from '../../transitions/transition-matrix.js';
import type {
  ValueEstimatorInput,
  ValueEstimatorOutput,
  PlanState,
  PlanningContext,
} from './types.js';

const log = createLogger({ module: 'ftis:value-estimator' });

// ============================================================================
// VALUE ESTIMATOR
// ============================================================================

export class ValueEstimator {
  // Feature weights (could be learned from data)
  private weights = {
    transitionProbability: 0.3,
    toolRelevance: 0.25,
    planLength: 0.15,
    confidence: 0.15,
    diversity: 0.15,
  };

  // ==========================================================================
  // ESTIMATION
  // ==========================================================================

  /**
   * Estimate value of taking a tool in a given state
   */
  estimate(input: ValueEstimatorInput): ValueEstimatorOutput {
    const features = this.extractFeatures(input);
    const value = this.computeValue(features);
    const confidence = this.computeConfidence(features);

    return {
      value,
      confidence,
      features,
    };
  }

  /**
   * Estimate value of a complete plan state
   */
  estimateState(state: PlanState, context: PlanningContext): number {
    if (state.executedTools.length === 0) {
      return 0.5; // Neutral for empty state
    }

    let value = 0;

    // Factor 1: Plan confidence
    value += state.confidence * 0.3;

    // Factor 2: Goal coverage (heuristic based on tool count vs query complexity)
    const queryWordCount = context.query.split(/\s+/).length;
    const expectedTools = Math.min(Math.ceil(queryWordCount / 10), 5);
    const toolCoverage = Math.min(state.executedTools.length / expectedTools, 1);
    value += toolCoverage * 0.3;

    // Factor 3: Tool relevance to query
    const relevance = this.estimateRelevance(state.executedTools, context.query);
    value += relevance * 0.2;

    // Factor 4: Remaining intent (less remaining = better)
    const remainingRatio = state.remainingIntent.length / context.query.length;
    value += (1 - remainingRatio) * 0.2;

    return Math.max(0, Math.min(1, value));
  }

  // ==========================================================================
  // FEATURE EXTRACTION
  // ==========================================================================

  /**
   * Extract features for value estimation
   */
  private extractFeatures(input: ValueEstimatorInput): Record<string, number> {
    const { state, nextTool, context } = input;
    const features: Record<string, number> = {};

    // Feature 1: Transition probability from last tool
    const lastTool = state.executedTools[state.executedTools.length - 1];
    if (lastTool) {
      const matrix = getTransitionMatrix();
      const prob = matrix.getTransitionProbability(lastTool, nextTool);
      features.transitionProbability = prob;
    } else {
      features.transitionProbability = 0.5; // First tool
    }

    // Feature 2: Tool relevance to query
    features.toolRelevance = this.computeToolRelevance(nextTool, context.query);

    // Feature 3: Plan length penalty
    const planLength = state.executedTools.length + 1;
    features.planLength = 1 / (1 + Math.log(planLength)); // Logarithmic decay

    // Feature 4: Current state confidence
    features.confidence = state.confidence;

    // Feature 5: Diversity (avoid repeating patterns)
    features.diversity = this.computeDiversity(nextTool, state.executedTools);

    // Feature 6: Tool availability (is it in available tools)
    features.availability = context.availableTools.includes(nextTool) ? 1 : 0;

    // Feature 7: Session context (has this tool been used recently)
    features.sessionContext = context.sessionTools?.includes(nextTool) ? 0.5 : 1;

    return features;
  }

  /**
   * Compute final value from features
   */
  private computeValue(features: Record<string, number>): number {
    let value = 0;

    value += (features.transitionProbability || 0) * this.weights.transitionProbability;
    value += (features.toolRelevance || 0) * this.weights.toolRelevance;
    value += (features.planLength || 0) * this.weights.planLength;
    value += (features.confidence || 0) * this.weights.confidence;
    value += (features.diversity || 0) * this.weights.diversity;

    // Penalize unavailable tools
    if (features.availability === 0) {
      value *= 0.1;
    }

    // Slight penalty for recently used tools
    value *= features.sessionContext || 1;

    return Math.max(0, Math.min(1, value));
  }

  /**
   * Compute confidence in the estimate
   */
  private computeConfidence(features: Record<string, number>): number {
    // Confidence is higher when features are more certain
    let confidence = 0.5;

    // High transition probability = high confidence
    if (features.transitionProbability > 0.6) {
      confidence += 0.2;
    }

    // High tool relevance = high confidence
    if (features.toolRelevance > 0.6) {
      confidence += 0.2;
    }

    // Available tool = high confidence
    if (features.availability === 1) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Compute relevance of a tool to a query
   */
  private computeToolRelevance(toolId: string, query: string): number {
    const queryLower = query.toLowerCase();
    const toolParts = toolId.toLowerCase().split('_');

    // Check if any tool name part appears in query
    let matches = 0;
    for (const part of toolParts) {
      if (part.length >= 3 && queryLower.includes(part)) {
        matches++;
      }
    }

    // Also check for keyword associations
    const keywordScores: Record<string, string[]> = {
      weather: ['weather', 'rain', 'cold', 'hot', 'temperature', 'forecast'],
      calendar: ['schedule', 'meeting', 'appointment', 'event', 'busy', 'free'],
      music: ['music', 'play', 'song', 'listen', 'spotify', 'focus'],
      habit: ['habit', 'routine', 'track', 'daily', 'streak'],
      task: ['task', 'todo', 'do', 'complete', 'finish'],
      finance: ['money', 'budget', 'spending', 'expense', 'financial'],
      notes: ['note', 'remember', 'write', 'save', 'memo'],
      goals: ['goal', 'objective', 'achieve', 'target', 'milestone'],
    };

    for (const [domain, keywords] of Object.entries(keywordScores)) {
      if (toolId.toLowerCase().includes(domain)) {
        for (const keyword of keywords) {
          if (queryLower.includes(keyword)) {
            matches++;
            break;
          }
        }
      }
    }

    return Math.min(1, matches / 3);
  }

  /**
   * Compute diversity score (penalize repeating same domain)
   */
  private computeDiversity(nextTool: string, executedTools: string[]): number {
    if (executedTools.length === 0) {
      return 1;
    }

    const nextDomain = nextTool.split('_')[0];
    const executedDomains = executedTools.map((t) => t.split('_')[0]);

    // Count how many times this domain has been used
    const domainCount = executedDomains.filter((d) => d === nextDomain).length;

    // Penalize heavily for repeated domains
    return 1 / (1 + domainCount);
  }

  /**
   * Estimate relevance of executed tools to query
   */
  private estimateRelevance(tools: string[], query: string): number {
    if (tools.length === 0) return 0;

    let totalRelevance = 0;
    for (const tool of tools) {
      totalRelevance += this.computeToolRelevance(tool, query);
    }

    return totalRelevance / tools.length;
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Update feature weights
   */
  updateWeights(weights: Partial<typeof this.weights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  /**
   * Get current weights
   */
  getWeights(): typeof this.weights {
    return { ...this.weights };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let estimatorInstance: ValueEstimator | null = null;

export function getValueEstimator(): ValueEstimator {
  if (!estimatorInstance) {
    estimatorInstance = new ValueEstimator();
  }
  return estimatorInstance;
}

export function resetValueEstimator(): void {
  estimatorInstance = null;
}
