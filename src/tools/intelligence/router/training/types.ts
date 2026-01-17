/**
 * Router Training Types
 *
 * Type definitions for the Ferni Router Model training pipeline.
 *
 * @module tools/intelligence/router/training/types
 */

// ============================================================================
// TRAINING DATA TYPES
// ============================================================================

/**
 * A single training example for the router model
 */
export interface TrainingExample {
  /** Unique identifier */
  id: string;

  // === Input features ===
  /** The user's input query */
  query: string;
  /** Pre-computed query embedding (optional, for efficiency) */
  queryEmbedding?: number[];
  /** Active persona during this query */
  personaId: string;
  /** Detected emotion state */
  emotion: string;
  /** Time of day category */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Recently used tools (for context) */
  recentTools: string[];
  /** User's tool affinity scores */
  userAffinities: Record<string, number>;
  /** Conversation topics */
  topics?: string[];

  // === Labels ===
  /** Tools that were selected/called */
  selectedTools: string[];
  /** Whether the selection was successful */
  wasSuccessful: boolean;
  /** User satisfaction (1-5, if available) */
  userSatisfaction?: number;

  // === Metadata ===
  /** When this example was recorded */
  timestamp: Date;
  /** Source session ID */
  sessionId: string;
  /** Source user ID (anonymized) */
  userId: string;
  /** How this example was collected */
  source: 'production' | 'synthetic' | 'correction';
}

/**
 * Training dataset metadata
 */
export interface DatasetMetadata {
  /** Dataset version */
  version: string;
  /** When the dataset was created */
  createdAt: Date;
  /** Number of examples */
  exampleCount: number;
  /** Unique tools in dataset */
  uniqueTools: number;
  /** Unique personas in dataset */
  uniquePersonas: number;
  /** Label distribution */
  labelDistribution: Record<string, number>;
  /** Data quality metrics */
  qualityMetrics: {
    avgQueryLength: number;
    avgToolsPerExample: number;
    successRate: number;
    syntheticRatio: number;
  };
}

/**
 * Hard negative example (similar query, different correct tool)
 */
export interface HardNegative {
  /** Original example ID */
  originalId: string;
  /** The query */
  query: string;
  /** Tool that was incorrectly predicted */
  wrongTool: string;
  /** Tool that was actually correct */
  correctTool: string;
  /** Similarity score between tools */
  toolSimilarity: number;
  /** Why this is a hard negative */
  reason: string;
}

/**
 * Synthetic example generation config
 */
export interface SyntheticGenerationConfig {
  /** Number of examples to generate per tool */
  examplesPerTool: number;
  /** Paraphrase variations per query */
  paraphraseCount: number;
  /** Include multi-tool examples */
  includeMultiTool: boolean;
  /** Temperature for LLM generation */
  temperature: number;
  /** Persona distribution (weights) */
  personaWeights: Record<string, number>;
  /** Time of day distribution (weights) */
  timeWeights: Record<string, number>;
}

/**
 * Export format options
 */
export interface ExportOptions {
  /** Output format */
  format: 'jsonl' | 'csv' | 'parquet' | 'tfrecord';
  /** Include embeddings in export */
  includeEmbeddings: boolean;
  /** Split ratios */
  splits: {
    train: number;
    validation: number;
    test: number;
  };
  /** Shuffle before splitting */
  shuffle: boolean;
  /** Random seed for reproducibility */
  seed: number;
  /** Maximum examples (for sampling) */
  maxExamples?: number;
}

// ============================================================================
// DEFAULT CONFIGS
// ============================================================================

export const DEFAULT_SYNTHETIC_CONFIG: SyntheticGenerationConfig = {
  examplesPerTool: 10,
  paraphraseCount: 3,
  includeMultiTool: true,
  temperature: 0.7,
  personaWeights: {
    ferni: 0.3,
    maya: 0.2,
    peter: 0.15,
    alex: 0.15,
    jordan: 0.1,
    nayan: 0.1,
  },
  timeWeights: {
    morning: 0.3,
    afternoon: 0.25,
    evening: 0.3,
    night: 0.15,
  },
};

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'jsonl',
  includeEmbeddings: false,
  splits: {
    train: 0.8,
    validation: 0.1,
    test: 0.1,
  },
  shuffle: true,
  seed: 42,
};
