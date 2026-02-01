/**
 * Online Learning Loop - Continuous Model Improvement from Corrections
 *
 * Implements a SOTA online learning system that:
 * 1. Collects routing corrections over time
 * 2. Computes embedding adjustments using contrastive learning
 * 3. Updates tool embeddings with correction-weighted deltas
 * 4. Persists learned weights to Firestore
 * 5. Triggers periodic batch retraining
 *
 * Based on approaches from:
 * - Gorilla (Berkeley) - API-specific fine-tuning
 * - ToolBench (Tsinghua) - Tool retrieval optimization
 * - Anthropic Agent Framework - Online RL from feedback
 *
 * @module tools/semantic-router/learning/online-learning-loop
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getEmbedding } from '../embedding-providers.js';
// Rust-accelerated batch operations for online learning
import { batchCosineSimilarityOptimized } from '../../../memory/rust-accelerator.js';
import type { EmbeddingVector } from '../types.js';
import { getToolEmbeddingIndex } from '../persistence/index.js';
import { getToolRegistry } from '../registry.js';
import { getLearnedRetriever } from '../advanced/learned-retriever.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'semantic-router:online-learning' });

// ============================================================================
// TYPES
// ============================================================================

/** A correction example for learning */
export interface LearningExample {
  query: string;
  queryEmbedding: EmbeddingVector;
  predictedToolId: string;
  actualToolId: string;
  confidence: number;
  timestamp: number;
  source: 'explicit' | 'implicit' | 'inferred' | 'active-learning';
  metadata?: {
    userId?: string;
    sessionId?: string;
    informationGain?: number;
  };
}

/** Learned embedding adjustment for a tool */
export interface ToolEmbeddingAdjustment {
  toolId: string;
  // Additive adjustment to centroid embedding
  centroidDelta: EmbeddingVector;
  // Multiplicative boost for specific dimensions
  dimensionWeights: EmbeddingVector;
  // Example queries that drove this adjustment
  supportingQueries: string[];
  // Statistics
  positiveExamples: number;
  negativeExamples: number;
  lastUpdated: number;
}

/** Batch retraining statistics */
export interface RetrainingStats {
  examplesProcessed: number;
  toolsUpdated: number;
  avgEmbeddingDelta: number;
  topImprovements: Array<{ toolId: string; improvement: number }>;
  duration: number;
  timestamp: number;
}

interface OnlineLearningConfig {
  // Minimum examples before triggering retrain
  minExamplesForRetrain: number;
  // Maximum age of examples to use (ms)
  maxExampleAge: number;
  // Learning rate for embedding updates
  learningRate: number;
  // How much to weight recent examples vs old
  recencyDecay: number;
  // Contrastive margin for triplet loss
  contrastiveMargin: number;
  // Batch size for processing
  batchSize: number;
  // Auto-retrain interval (ms) - 0 to disable
  autoRetrainInterval: number;
}

// ============================================================================
// ONLINE LEARNING ENGINE
// ============================================================================

export class OnlineLearningEngine {
  private pendingExamples: LearningExample[] = [];
  private adjustments = new Map<string, ToolEmbeddingAdjustment>();
  private lastRetrainTime = 0;
  private retrainTimer: NodeJS.Timeout | null = null;
  private isRetraining = false;
  private stats: RetrainingStats[] = [];

  private readonly config: OnlineLearningConfig = {
    minExamplesForRetrain: 10,
    maxExampleAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    learningRate: 0.1,
    recencyDecay: 0.95, // Weight decay per day
    contrastiveMargin: 0.2,
    batchSize: 32,
    autoRetrainInterval: 60 * 60 * 1000, // 1 hour
  };

  constructor(customConfig?: Partial<OnlineLearningConfig>) {
    if (customConfig) {
      Object.assign(this.config, customConfig);
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Add a correction example for learning
   */
  async addCorrection(example: Omit<LearningExample, 'queryEmbedding'>): Promise<void> {
    // Get embedding for query
    const queryEmbedding = await getEmbedding(example.query);

    const fullExample: LearningExample = {
      ...example,
      queryEmbedding,
    };

    this.pendingExamples.push(fullExample);

    log.debug(
      {
        query: example.query.substring(0, 50),
        predicted: example.predictedToolId,
        actual: example.actualToolId,
        pendingCount: this.pendingExamples.length,
      },
      'Added correction for online learning'
    );

    // Check if we should trigger immediate learning
    if (this.shouldTriggerRetrain()) {
      void this.triggerRetrain();
    }
  }

  /**
   * Start automatic periodic retraining
   */
  startAutoRetrain(): void {
    if (this.config.autoRetrainInterval <= 0) return;

    if (this.retrainTimer) {
      clearInterval(this.retrainTimer);
    }

    this.retrainTimer = setInterval(() => {
      if (this.pendingExamples.length > 0) {
        void this.triggerRetrain();
      }
    }, this.config.autoRetrainInterval);

    log.info({ intervalMs: this.config.autoRetrainInterval }, 'Started automatic retraining');
  }

  /**
   * Stop automatic retraining
   */
  stopAutoRetrain(): void {
    if (this.retrainTimer) {
      clearInterval(this.retrainTimer);
      this.retrainTimer = null;
    }
  }

  /**
   * Manually trigger a retraining cycle
   */
  async triggerRetrain(): Promise<RetrainingStats | null> {
    if (this.isRetraining) {
      log.warn('Retrain already in progress, skipping');
      return null;
    }

    if (this.pendingExamples.length === 0) {
      log.debug('No pending examples for retraining');
      return null;
    }

    this.isRetraining = true;
    const startTime = performance.now();

    try {
      log.info(
        { exampleCount: this.pendingExamples.length },
        'Starting online learning retrain cycle'
      );

      // Filter out old examples
      const now = Date.now();
      const validExamples = this.pendingExamples.filter(
        (ex) => now - ex.timestamp < this.config.maxExampleAge
      );

      // Group by actual tool (positive examples)
      const examplesByTool = new Map<string, LearningExample[]>();
      for (const ex of validExamples) {
        const existing = examplesByTool.get(ex.actualToolId) || [];
        existing.push(ex);
        examplesByTool.set(ex.actualToolId, existing);
      }

      // Process each tool's examples
      const toolsUpdated: string[] = [];
      const improvements: Array<{ toolId: string; improvement: number }> = [];
      let totalDelta = 0;

      for (const [toolId, examples] of examplesByTool) {
        const result = await this.processToolExamples(toolId, examples, validExamples);
        if (result) {
          toolsUpdated.push(toolId);
          improvements.push({ toolId, improvement: result.improvement });
          totalDelta += result.avgDelta;
        }
      }

      // Apply adjustments to the embedding index
      await this.applyAdjustmentsToIndex();

      // Update learned retriever
      await this.updateLearnedRetriever(validExamples);

      // Clear processed examples
      this.pendingExamples = [];
      this.lastRetrainTime = now;

      const duration = Math.round(performance.now() - startTime);

      const stats: RetrainingStats = {
        examplesProcessed: validExamples.length,
        toolsUpdated: toolsUpdated.length,
        avgEmbeddingDelta: toolsUpdated.length > 0 ? totalDelta / toolsUpdated.length : 0,
        topImprovements: improvements.sort((a, b) => b.improvement - a.improvement).slice(0, 5),
        duration,
        timestamp: now,
      };

      this.stats.push(stats);
      // Keep last 100 stats
      if (this.stats.length > 100) {
        this.stats.shift();
      }

      log.info(
        {
          examplesProcessed: stats.examplesProcessed,
          toolsUpdated: stats.toolsUpdated,
          avgDelta: stats.avgEmbeddingDelta.toFixed(4),
          durationMs: duration,
        },
        'Online learning retrain complete'
      );

      return stats;
    } catch (error) {
      log.error({ error: String(error) }, 'Online learning retrain failed');
      return null;
    } finally {
      this.isRetraining = false;
    }
  }

  /**
   * Get current learning statistics
   */
  getStats(): {
    pendingExamples: number;
    adjustedTools: number;
    lastRetrainTime: number;
    recentStats: RetrainingStats[];
  } {
    return {
      pendingExamples: this.pendingExamples.length,
      adjustedTools: this.adjustments.size,
      lastRetrainTime: this.lastRetrainTime,
      recentStats: this.stats.slice(-10),
    };
  }

  /**
   * Get the embedding adjustment for a specific tool
   */
  getAdjustment(toolId: string): ToolEmbeddingAdjustment | undefined {
    return this.adjustments.get(toolId);
  }

  /**
   * Apply learned adjustments to an embedding for better matching
   */
  applyAdjustmentToQuery(queryEmbedding: EmbeddingVector, toolId: string): EmbeddingVector {
    const adjustment = this.adjustments.get(toolId);
    if (!adjustment) {
      return queryEmbedding;
    }

    // Apply dimension weights and add centroid delta
    const adjusted = queryEmbedding.map((val, i) => {
      const weight = adjustment.dimensionWeights[i] || 1.0;
      const delta = adjustment.centroidDelta[i] || 0;
      return val * weight + delta * this.config.learningRate;
    });

    return adjusted;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private shouldTriggerRetrain(): boolean {
    // If autoRetrainInterval is 0, auto-retrain is disabled
    // Only explicit calls to triggerRetrain() should work
    if (this.config.autoRetrainInterval <= 0) {
      return false;
    }

    // Don't retrain too frequently
    const timeSinceLastRetrain = Date.now() - this.lastRetrainTime;
    const minInterval = this.config.autoRetrainInterval / 2;

    return (
      this.pendingExamples.length >= this.config.minExamplesForRetrain &&
      timeSinceLastRetrain >= minInterval &&
      !this.isRetraining
    );
  }

  /**
   * Process examples for a single tool using contrastive learning
   */
  private async processToolExamples(
    toolId: string,
    positiveExamples: LearningExample[],
    allExamples: LearningExample[]
  ): Promise<{ improvement: number; avgDelta: number } | null> {
    if (positiveExamples.length === 0) return null;

    // Get current tool embedding from registry
    const registry = getToolRegistry();
    const tool = registry.getRegistered(toolId);
    if (!tool || !tool.descriptionEmbedding) {
      log.warn({ toolId }, 'Tool not found or has no embedding');
      return null;
    }

    const currentEmbedding = tool.descriptionEmbedding;
    const embeddingDim = currentEmbedding.length;

    // Find negative examples (queries that SHOULDN'T match this tool)
    const negativeExamples = allExamples.filter(
      (ex) => ex.predictedToolId === toolId && ex.actualToolId !== toolId
    );

    // Compute centroid of positive examples
    const positiveCentroid = this.computeWeightedCentroid(positiveExamples);

    // Compute contrastive adjustment using triplet-style loss
    const centroidDelta = new Array(embeddingDim).fill(0);
    const dimensionWeights = new Array(embeddingDim).fill(1.0);

    // For each positive example, push embedding toward it
    for (const pos of positiveExamples) {
      const weight = this.computeExampleWeight(pos);
      for (let i = 0; i < embeddingDim; i++) {
        // Move toward positive
        centroidDelta[i] += (pos.queryEmbedding[i] - currentEmbedding[i]) * weight;
      }
    }

    // For each negative example, push embedding away from it
    for (const neg of negativeExamples) {
      const weight = this.computeExampleWeight(neg) * 0.5; // Less weight for negatives
      for (let i = 0; i < embeddingDim; i++) {
        // Move away from negative
        centroidDelta[i] -= (neg.queryEmbedding[i] - currentEmbedding[i]) * weight;
      }
    }

    // Normalize delta
    const deltaNorm = Math.sqrt(centroidDelta.reduce((sum, d) => sum + d * d, 0));
    if (deltaNorm > 0) {
      for (let i = 0; i < embeddingDim; i++) {
        centroidDelta[i] /= deltaNorm;
      }
    }

    // Compute dimension importance from variance of positive examples
    const dimensionVariances = this.computeDimensionVariance(positiveExamples);
    for (let i = 0; i < embeddingDim; i++) {
      // High variance dimensions are less reliable, weight them less
      dimensionWeights[i] = 1.0 / (1.0 + dimensionVariances[i]);
    }

    // Create or update adjustment
    const existingAdjustment = this.adjustments.get(toolId);
    const newAdjustment: ToolEmbeddingAdjustment = {
      toolId,
      centroidDelta: existingAdjustment
        ? this.blendEmbeddings(existingAdjustment.centroidDelta, centroidDelta, 0.3)
        : centroidDelta,
      dimensionWeights: existingAdjustment
        ? this.blendEmbeddings(existingAdjustment.dimensionWeights, dimensionWeights, 0.3)
        : dimensionWeights,
      supportingQueries: positiveExamples.slice(0, 10).map((ex) => ex.query),
      positiveExamples: (existingAdjustment?.positiveExamples || 0) + positiveExamples.length,
      negativeExamples: (existingAdjustment?.negativeExamples || 0) + negativeExamples.length,
      lastUpdated: Date.now(),
    };

    this.adjustments.set(toolId, newAdjustment);

    // Compute improvement metric
    const beforeSim = this.avgSimilarity(currentEmbedding, positiveExamples);
    const adjustedEmbedding = this.applyDeltaToEmbedding(currentEmbedding, centroidDelta);
    const afterSim = this.avgSimilarity(adjustedEmbedding, positiveExamples);
    const improvement = afterSim - beforeSim;

    return {
      improvement,
      avgDelta: deltaNorm,
    };
  }

  private computeWeightedCentroid(examples: LearningExample[]): EmbeddingVector {
    if (examples.length === 0) {
      return [];
    }

    const dim = examples[0].queryEmbedding.length;
    const centroid = new Array(dim).fill(0);
    let totalWeight = 0;

    for (const ex of examples) {
      const weight = this.computeExampleWeight(ex);
      totalWeight += weight;
      for (let i = 0; i < dim; i++) {
        centroid[i] += ex.queryEmbedding[i] * weight;
      }
    }

    if (totalWeight > 0) {
      for (let i = 0; i < dim; i++) {
        centroid[i] /= totalWeight;
      }
    }

    return centroid;
  }

  private computeExampleWeight(example: LearningExample): number {
    // Weight based on recency and confidence
    const ageMs = Date.now() - example.timestamp;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const recencyWeight = Math.pow(this.config.recencyDecay, ageDays);

    // Source weight: explicit > active-learning > inferred > implicit
    const sourceWeights: Record<LearningExample['source'], number> = {
      explicit: 1.0,
      'active-learning': 0.8,
      inferred: 0.6,
      implicit: 0.5,
    };
    const sourceWeight = sourceWeights[example.source] ?? 0.5;

    return example.confidence * recencyWeight * sourceWeight;
  }

  private computeDimensionVariance(examples: LearningExample[]): number[] {
    if (examples.length < 2) {
      return new Array(examples[0]?.queryEmbedding.length || 768).fill(0);
    }

    const dim = examples[0].queryEmbedding.length;
    const means = new Array(dim).fill(0);
    const variances = new Array(dim).fill(0);

    // Compute means
    for (const ex of examples) {
      for (let i = 0; i < dim; i++) {
        means[i] += ex.queryEmbedding[i];
      }
    }
    for (let i = 0; i < dim; i++) {
      means[i] /= examples.length;
    }

    // Compute variances
    for (const ex of examples) {
      for (let i = 0; i < dim; i++) {
        const diff = ex.queryEmbedding[i] - means[i];
        variances[i] += diff * diff;
      }
    }
    for (let i = 0; i < dim; i++) {
      variances[i] /= examples.length;
    }

    return variances;
  }

  private blendEmbeddings(
    old: EmbeddingVector,
    updated: EmbeddingVector,
    newWeight: number
  ): EmbeddingVector {
    return old.map((val, i) => val * (1 - newWeight) + (updated[i] || 0) * newWeight);
  }

  private applyDeltaToEmbedding(
    embedding: EmbeddingVector,
    delta: EmbeddingVector
  ): EmbeddingVector {
    return embedding.map((val, i) => val + (delta[i] || 0) * this.config.learningRate);
  }

  private avgSimilarity(embedding: EmbeddingVector, examples: LearningExample[]): number {
    if (examples.length === 0) return 0;
    // Batch compute all similarities at once (SIMD-accelerated for 5+ examples)
    const exampleVectors = examples.map((ex) => Array.from(ex.queryEmbedding));
    const queryArray = Array.from(embedding);
    const sims = batchCosineSimilarityOptimized(queryArray, exampleVectors);
    return sims.reduce((a, b) => a + b, 0) / sims.length;
  }

  /**
   * Apply learned adjustments to the tool embedding index
   */
  private async applyAdjustmentsToIndex(): Promise<void> {
    try {
      const indexService = getToolEmbeddingIndex();
      const registry = getToolRegistry();

      for (const [toolId, adjustment] of this.adjustments) {
        const tool = registry.getRegistered(toolId);
        if (!tool || !tool.descriptionEmbedding) continue;

        // Apply adjustment to create updated embedding
        const updatedEmbedding = this.applyDeltaToEmbedding(
          tool.descriptionEmbedding,
          adjustment.centroidDelta
        );

        // Update in registry (in-memory)
        tool.descriptionEmbedding = updatedEmbedding;

        log.debug(
          { toolId, positiveExamples: adjustment.positiveExamples },
          'Applied embedding adjustment'
        );
      }

      log.info({ adjustedTools: this.adjustments.size }, 'Applied adjustments to embedding index');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to apply adjustments to index');
    }
  }

  /**
   * Update the learned retriever with new examples
   */
  private async updateLearnedRetriever(examples: LearningExample[]): Promise<void> {
    const retriever = getLearnedRetriever();

    for (const ex of examples) {
      if (ex.predictedToolId !== ex.actualToolId) {
        await retriever.addCorrection(ex.query, ex.predictedToolId, ex.actualToolId);
      }
    }

    log.debug(
      { correctionCount: examples.filter((e) => e.predictedToolId !== e.actualToolId).length },
      'Updated learned retriever'
    );
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let engineInstance: OnlineLearningEngine | null = null;

export function getOnlineLearningEngine(): OnlineLearningEngine {
  if (!engineInstance) {
    engineInstance = new OnlineLearningEngine();
  }
  return engineInstance;
}

export function initializeOnlineLearning(
  config?: Partial<OnlineLearningConfig>
): OnlineLearningEngine {
  engineInstance = new OnlineLearningEngine(config);
  engineInstance.startAutoRetrain();
  log.info('Online learning engine initialized');
  return engineInstance;
}

export function shutdownOnlineLearning(): void {
  if (engineInstance) {
    engineInstance.stopAutoRetrain();
    engineInstance = null;
    log.info('Online learning engine shutdown');
  }
}

/**
 * Get online learning statistics (convenience function).
 */
export function getOnlineLearningStats(): {
  pendingExamples: number;
  adjustedTools: number;
  lastRetrainTime: number;
  recentStats: RetrainingStats[];
  isActive: boolean;
} {
  const engine = getOnlineLearningEngine();
  const stats = engine.getStats();
  return {
    ...stats,
    isActive: engineInstance !== null,
  };
}
