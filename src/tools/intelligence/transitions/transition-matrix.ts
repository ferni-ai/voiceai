/**
 * Transition Matrix
 *
 * Stores and queries tool transition probabilities for sequence prediction.
 * Supports context-conditioned lookups (persona, time, emotion).
 *
 * @module tools/intelligence/transitions/transition-matrix
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  ToolTransition,
  TransitionPrediction,
  TransitionMatrixConfig,
  TransitionMatrixStats,
  TimeOfDay,
  DEFAULT_TRANSITION_CONFIG,
} from './types.js';
import { getTransitionKey } from './types.js';

const log = createLogger({ module: 'transition-matrix' });

// ============================================================================
// TRANSITION MATRIX
// ============================================================================

export class TransitionMatrix {
  private config: TransitionMatrixConfig;

  /** Primary storage: transitionKey -> ToolTransition */
  private transitions = new Map<string, ToolTransition>();

  /** Index: fromTool -> Set of transition keys */
  private fromToolIndex = new Map<string, Set<string>>();

  /** Total observations for normalization */
  private totalObservations = 0;

  constructor(config: Partial<TransitionMatrixConfig> = {}) {
    this.config = {
      minObservations: 3,
      highConfidenceThreshold: 0.7,
      maxTransitionsPerTool: 50,
      timeDecayFactor: 0.95,
      useContextConditioning: true,
      ...config,
    };
  }

  // ==========================================================================
  // RECORDING TRANSITIONS
  // ==========================================================================

  /**
   * Record a tool transition
   */
  recordTransition(
    fromTool: string,
    toTool: string,
    context: {
      personaId: string;
      timeOfDay?: TimeOfDay;
      emotion?: string;
      gapMs?: number;
      success?: boolean;
    }
  ): void {
    // Default to current time of day if not provided
    const timeOfDay = context.timeOfDay || this.getCurrentTimeOfDay();

    const key = this.config.useContextConditioning
      ? getTransitionKey(fromTool, toTool, context.personaId, timeOfDay, context.emotion)
      : getTransitionKey(fromTool, toTool);

    const existing = this.transitions.get(key);
    const now = new Date();

    if (existing) {
      // Update existing transition
      const newCount = existing.count + 1;
      const newAvgGap = context.gapMs
        ? (existing.avgGapMs * existing.count + context.gapMs) / newCount
        : existing.avgGapMs;
      const newSuccessRate =
        context.success !== undefined
          ? (existing.successRate * existing.count + (context.success ? 1 : 0)) / newCount
          : existing.successRate;

      this.transitions.set(key, {
        ...existing,
        count: newCount,
        avgGapMs: newAvgGap,
        successRate: newSuccessRate,
        updatedAt: now,
      });
    } else {
      // Create new transition
      this.transitions.set(key, {
        fromTool,
        toTool,
        personaId: context.personaId,
        timeOfDay,
        emotion: context.emotion || 'neutral',
        count: 1,
        probability: 0, // Will be calculated in normalization
        successRate: context.success !== undefined ? (context.success ? 1 : 0) : 0.5,
        avgGapMs: context.gapMs || 0,
        updatedAt: now,
      });

      // Update from-tool index
      if (!this.fromToolIndex.has(fromTool)) {
        this.fromToolIndex.set(fromTool, new Set());
      }
      this.fromToolIndex.get(fromTool)!.add(key);
    }

    this.totalObservations++;

    // Recalculate probabilities for this source tool
    this.normalizeProbabilities(fromTool);

    // Prune if needed
    this.pruneTransitions(fromTool);
  }

  /**
   * Record a sequence of tool calls
   */
  recordSequence(
    tools: string[],
    timestamps: Date[],
    context: {
      personaId: string;
      emotion?: string;
      success?: boolean[];
    }
  ): void {
    for (let i = 0; i < tools.length - 1; i++) {
      const fromTool = tools[i];
      const toTool = tools[i + 1];
      const gapMs = timestamps[i + 1].getTime() - timestamps[i].getTime();
      const timeOfDay = this.getTimeOfDay(timestamps[i]);
      const success = context.success?.[i + 1];

      this.recordTransition(fromTool, toTool, {
        personaId: context.personaId,
        timeOfDay,
        emotion: context.emotion,
        gapMs,
        success,
      });
    }
  }

  // ==========================================================================
  // QUERYING TRANSITIONS
  // ==========================================================================

  /**
   * Get predicted next tools from a source tool
   */
  getPredictions(
    fromTool: string,
    context?: {
      personaId?: string;
      timeOfDay?: TimeOfDay;
      emotion?: string;
    },
    topK = 5
  ): TransitionPrediction[] {
    const keys = this.fromToolIndex.get(fromTool);
    if (!keys || keys.size === 0) {
      return [];
    }

    // Collect all transitions from this tool
    const candidates: ToolTransition[] = [];
    for (const key of keys) {
      const transition = this.transitions.get(key);
      if (transition) {
        // Apply context filter if specified
        if (context) {
          if (context.personaId && transition.personaId !== context.personaId) continue;
          if (context.timeOfDay && transition.timeOfDay !== context.timeOfDay) continue;
          if (context.emotion && transition.emotion !== context.emotion) continue;
        }
        candidates.push(transition);
      }
    }

    // If no context matches, try without context filtering
    if (candidates.length === 0 && context) {
      return this.getPredictions(fromTool, undefined, topK);
    }

    // Aggregate by toTool (in case of multiple context variants)
    const aggregated = new Map<
      string,
      {
        probability: number;
        count: number;
        successRate: number;
      }
    >();

    for (const t of candidates) {
      const existing = aggregated.get(t.toTool);
      if (existing) {
        existing.probability += t.probability;
        existing.count += t.count;
        existing.successRate =
          (existing.successRate * (existing.count - t.count) + t.successRate * t.count) /
          existing.count;
      } else {
        aggregated.set(t.toTool, {
          probability: t.probability,
          count: t.count,
          successRate: t.successRate,
        });
      }
    }

    // Convert to predictions
    const predictions: TransitionPrediction[] = [];
    for (const [toolId, data] of aggregated) {
      predictions.push({
        toolId,
        probability: data.probability,
        observationCount: data.count,
        successRate: data.successRate,
        skipLLM:
          data.probability >= this.config.highConfidenceThreshold &&
          data.count >= this.config.minObservations,
      });
    }

    // Sort by probability descending
    predictions.sort((a, b) => b.probability - a.probability);

    return predictions.slice(0, topK);
  }

  /**
   * Get the single best prediction
   */
  getBestPrediction(
    fromTool: string,
    context?: {
      personaId?: string;
      timeOfDay?: TimeOfDay;
      emotion?: string;
    }
  ): TransitionPrediction | null {
    const predictions = this.getPredictions(fromTool, context, 1);
    return predictions[0] || null;
  }

  /**
   * Check if we should skip LLM for this transition
   */
  shouldSkipLLM(
    fromTool: string,
    context?: {
      personaId?: string;
      timeOfDay?: TimeOfDay;
      emotion?: string;
    }
  ): { skip: boolean; predictedTool?: string; confidence?: number } {
    const prediction = this.getBestPrediction(fromTool, context);

    if (prediction && prediction.skipLLM) {
      return {
        skip: true,
        predictedTool: prediction.toolId,
        confidence: prediction.probability,
      };
    }

    return { skip: false };
  }

  /**
   * Get transition probability between two specific tools
   */
  getTransitionProbability(
    fromTool: string,
    toTool: string,
    context?: {
      personaId?: string;
      timeOfDay?: TimeOfDay;
      emotion?: string;
    }
  ): number {
    const predictions = this.getPredictions(fromTool, context, 100);
    const match = predictions.find((p) => p.toolId === toTool);
    return match?.probability || 0;
  }

  // ==========================================================================
  // NORMALIZATION
  // ==========================================================================

  /**
   * Normalize probabilities for transitions from a source tool
   */
  private normalizeProbabilities(fromTool: string): void {
    const keys = this.fromToolIndex.get(fromTool);
    if (!keys || keys.size === 0) return;

    // Calculate total count for this source
    let totalCount = 0;
    for (const key of keys) {
      const transition = this.transitions.get(key);
      if (transition) {
        totalCount += transition.count;
      }
    }

    // Normalize
    for (const key of keys) {
      const transition = this.transitions.get(key);
      if (transition) {
        transition.probability = transition.count / totalCount;
      }
    }
  }

  /**
   * Apply time decay to all transitions
   */
  applyTimeDecay(): void {
    for (const [key, transition] of this.transitions) {
      const age = Date.now() - transition.updatedAt.getTime();
      const daysSinceUpdate = age / (1000 * 60 * 60 * 24);

      // Apply exponential decay
      const decayFactor = Math.pow(this.config.timeDecayFactor, daysSinceUpdate);
      transition.count = Math.max(1, Math.floor(transition.count * decayFactor));
    }

    // Renormalize all
    for (const fromTool of this.fromToolIndex.keys()) {
      this.normalizeProbabilities(fromTool);
    }
  }

  // ==========================================================================
  // PRUNING
  // ==========================================================================

  /**
   * Prune low-value transitions for a source tool
   */
  private pruneTransitions(fromTool: string): void {
    const keys = this.fromToolIndex.get(fromTool);
    if (!keys || keys.size <= this.config.maxTransitionsPerTool) return;

    // Get all transitions sorted by count
    const transitions: Array<{ key: string; count: number }> = [];
    for (const key of keys) {
      const t = this.transitions.get(key);
      if (t) {
        transitions.push({ key, count: t.count });
      }
    }
    transitions.sort((a, b) => b.count - a.count);

    // Remove lowest count transitions
    const toRemove = transitions.slice(this.config.maxTransitionsPerTool);
    for (const { key } of toRemove) {
      this.transitions.delete(key);
      keys.delete(key);
    }

    // Renormalize
    this.normalizeProbabilities(fromTool);
  }

  // ==========================================================================
  // BULK OPERATIONS
  // ==========================================================================

  /**
   * Load transitions from an array
   */
  loadTransitions(transitions: ToolTransition[]): void {
    for (const t of transitions) {
      const key = this.config.useContextConditioning
        ? getTransitionKey(t.fromTool, t.toTool, t.personaId, t.timeOfDay, t.emotion)
        : getTransitionKey(t.fromTool, t.toTool);

      this.transitions.set(key, t);

      if (!this.fromToolIndex.has(t.fromTool)) {
        this.fromToolIndex.set(t.fromTool, new Set());
      }
      this.fromToolIndex.get(t.fromTool)!.add(key);

      this.totalObservations += t.count;
    }

    log.info({ transitionCount: transitions.length }, 'Loaded transitions');
  }

  /**
   * Export all transitions
   */
  exportTransitions(): ToolTransition[] {
    return Array.from(this.transitions.values());
  }

  /**
   * Export matrix for serialization
   */
  export(): { transitions: ToolTransition[]; totalObservations: number } {
    return {
      transitions: this.exportTransitions(),
      totalObservations: this.totalObservations,
    };
  }

  /**
   * Import from exported data
   */
  import(data: { transitions: ToolTransition[]; totalObservations?: number }): void {
    this.clear();
    this.loadTransitions(data.transitions);
    if (data.totalObservations !== undefined) {
      this.totalObservations = data.totalObservations;
    }
  }

  /**
   * Clear all transitions
   */
  clear(): void {
    this.transitions.clear();
    this.fromToolIndex.clear();
    this.totalObservations = 0;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get matrix statistics
   */
  getStats(): TransitionMatrixStats {
    const transitions = this.exportTransitions();

    // Get top transitions
    const topTransitions = transitions
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((t) => ({
        from: t.fromTool,
        to: t.toTool,
        count: t.count,
        probability: t.probability,
      }));

    // Find latest update
    let lastUpdate = new Date(0);
    for (const t of transitions) {
      if (t.updatedAt > lastUpdate) {
        lastUpdate = t.updatedAt;
      }
    }

    return {
      totalTransitions: this.transitions.size,
      totalObservations: this.totalObservations,
      uniqueSequences: 0, // Would need sequence storage to track
      avgSequenceLength: 0,
      topTransitions,
      lastUpdate,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getTimeOfDay(date: Date): TimeOfDay {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private getCurrentTimeOfDay(): TimeOfDay {
    return this.getTimeOfDay(new Date());
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let matrixInstance: TransitionMatrix | null = null;

export function getTransitionMatrix(): TransitionMatrix {
  if (!matrixInstance) {
    matrixInstance = new TransitionMatrix();
  }
  return matrixInstance;
}

export function resetTransitionMatrix(): void {
  matrixInstance = null;
}
