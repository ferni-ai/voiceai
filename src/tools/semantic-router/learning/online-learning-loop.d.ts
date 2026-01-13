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
import type { EmbeddingVector } from '../types.js';
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
    centroidDelta: EmbeddingVector;
    dimensionWeights: EmbeddingVector;
    supportingQueries: string[];
    positiveExamples: number;
    negativeExamples: number;
    lastUpdated: number;
}
/** Batch retraining statistics */
export interface RetrainingStats {
    examplesProcessed: number;
    toolsUpdated: number;
    avgEmbeddingDelta: number;
    topImprovements: Array<{
        toolId: string;
        improvement: number;
    }>;
    duration: number;
    timestamp: number;
}
interface OnlineLearningConfig {
    minExamplesForRetrain: number;
    maxExampleAge: number;
    learningRate: number;
    recencyDecay: number;
    contrastiveMargin: number;
    batchSize: number;
    autoRetrainInterval: number;
}
export declare class OnlineLearningEngine {
    private pendingExamples;
    private adjustments;
    private lastRetrainTime;
    private retrainTimer;
    private isRetraining;
    private stats;
    private readonly config;
    constructor(customConfig?: Partial<OnlineLearningConfig>);
    /**
     * Add a correction example for learning
     */
    addCorrection(example: Omit<LearningExample, 'queryEmbedding'>): Promise<void>;
    /**
     * Start automatic periodic retraining
     */
    startAutoRetrain(): void;
    /**
     * Stop automatic retraining
     */
    stopAutoRetrain(): void;
    /**
     * Manually trigger a retraining cycle
     */
    triggerRetrain(): Promise<RetrainingStats | null>;
    /**
     * Get current learning statistics
     */
    getStats(): {
        pendingExamples: number;
        adjustedTools: number;
        lastRetrainTime: number;
        recentStats: RetrainingStats[];
    };
    /**
     * Get the embedding adjustment for a specific tool
     */
    getAdjustment(toolId: string): ToolEmbeddingAdjustment | undefined;
    /**
     * Apply learned adjustments to an embedding for better matching
     */
    applyAdjustmentToQuery(queryEmbedding: EmbeddingVector, toolId: string): EmbeddingVector;
    private shouldTriggerRetrain;
    /**
     * Process examples for a single tool using contrastive learning
     */
    private processToolExamples;
    private computeWeightedCentroid;
    private computeExampleWeight;
    private computeDimensionVariance;
    private blendEmbeddings;
    private applyDeltaToEmbedding;
    private avgSimilarity;
    /**
     * Apply learned adjustments to the tool embedding index
     */
    private applyAdjustmentsToIndex;
    /**
     * Update the learned retriever with new examples
     */
    private updateLearnedRetriever;
}
export declare function getOnlineLearningEngine(): OnlineLearningEngine;
export declare function initializeOnlineLearning(config?: Partial<OnlineLearningConfig>): OnlineLearningEngine;
export declare function shutdownOnlineLearning(): void;
export {};
//# sourceMappingURL=online-learning-loop.d.ts.map