/**
 * Tool Merger Types
 *
 * Type definitions for the tool merging system that identifies and combines
 * semantically equivalent tools to reduce redundancy.
 *
 * @module tools/intelligence/merger/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * JSON Schema type (simplified to avoid external dependency)
 */
export type JsonSchema = Record<string, unknown>;

/**
 * Represents a tool definition for merging analysis
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  domain: string;
  category?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  embedding?: number[];
}

/**
 * A cluster of semantically equivalent tools
 */
export interface ToolCluster {
  /** The canonical tool ID representing this cluster */
  canonicalId: string;
  /** All tool IDs merged into this cluster */
  mergedToolIds: string[];
  /** Unified description for the merged tool */
  unifiedDescription: string;
  /** Combined input schema */
  inputSchema?: JsonSchema;
  /** Similarity scores between tools in cluster */
  internalSimilarities: Array<{
    toolA: string;
    toolB: string;
    similarity: number;
  }>;
  /** When this cluster was created */
  createdAt: Date;
  /** Version for tracking changes */
  version: number;
}

/**
 * Result of comparing two tools for equivalence
 */
export interface EquivalenceResult {
  toolA: string;
  toolB: string;
  /** Cosine similarity between embeddings */
  embeddingSimilarity: number;
  /** LLM-determined functional equivalence */
  functionallyEquivalent: boolean;
  /** Confidence in the equivalence determination */
  confidence: number;
  /** Explanation from LLM */
  reasoning?: string;
}

/**
 * Candidate pair for potential merging
 */
export interface MergeCandidate {
  toolA: string;
  toolB: string;
  similarity: number;
}

/**
 * Configuration for the tool merger
 */
export interface ToolMergerConfig {
  /** Minimum cosine similarity to consider tools as candidates */
  similarityThreshold: number;
  /** Minimum confidence for LLM equivalence classification */
  confidenceThreshold: number;
  /** Maximum number of tools per cluster */
  maxClusterSize: number;
  /** Whether to use LLM for equivalence checking */
  useLLMClassifier: boolean;
  /** Batch size for embedding generation */
  embeddingBatchSize: number;
}

/**
 * Statistics from a merge operation
 */
export interface MergeStats {
  /** Total tools before merging */
  originalToolCount: number;
  /** Total clusters after merging */
  clusterCount: number;
  /** Reduction percentage */
  reductionPercent: number;
  /** Number of candidate pairs evaluated */
  candidatesEvaluated: number;
  /** Number of pairs confirmed equivalent */
  equivalentPairs: number;
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Merge registry entry mapping original ID to canonical ID
 */
export interface MergeRegistryEntry {
  originalId: string;
  canonicalId: string;
  mergedAt: Date;
  version: number;
}

// ============================================================================
// FIRESTORE TYPES
// ============================================================================

/**
 * Firestore document for tool merge cluster
 */
export interface FirestoreToolCluster {
  canonicalId: string;
  mergedToolIds: string[];
  unifiedDescription: string;
  inputSchema?: Record<string, unknown>;
  internalSimilarities: Array<{
    toolA: string;
    toolB: string;
    similarity: number;
  }>;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  version: number;
}

/**
 * Firestore document for merge registry
 */
export interface FirestoreMergeRegistry {
  mappings: Record<string, string>; // originalId -> canonicalId
  version: number;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_MERGER_CONFIG: ToolMergerConfig = {
  similarityThreshold: 0.82,
  confidenceThreshold: 0.75,
  maxClusterSize: 10,
  useLLMClassifier: true,
  embeddingBatchSize: 50,
};
