/**
 * Router Inference Types
 *
 * Type definitions for the Ferni Router Model inference runtime.
 *
 * @module tools/intelligence/router/inference/types
 */

// ============================================================================
// INFERENCE TYPES
// ============================================================================

/**
 * Input to the router model
 */
export interface RouterInput {
  /** The user's query */
  query: string;
  /** Active persona ID */
  personaId: string;
  /** Detected emotion */
  emotion: string;
  /** Time of day */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Recently used tools */
  recentTools: string[];
  /** User's tool affinities */
  userAffinities: Record<string, number>;
}

/**
 * Single tool prediction from the router
 */
export interface ToolPrediction {
  /** Tool ID */
  toolId: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Rank in predictions (1-based) */
  rank: number;
}

/**
 * Output from the router model
 */
export interface RouterOutput {
  /** Ordered list of tool predictions */
  predictions: ToolPrediction[];
  /** Overall confidence in top prediction */
  topConfidence: number;
  /** Whether to skip LLM call (high confidence) */
  skipLLM: boolean;
  /** Inference latency in milliseconds */
  latencyMs: number;
  /** Model version used */
  modelVersion: string;
}

/**
 * Router model configuration
 */
export interface RouterModelConfig {
  /** Path to ONNX model file */
  modelPath: string;
  /** Path to tokenizer files */
  tokenizerPath: string;
  /** Path to label map JSON */
  labelMapPath: string;
  /** Maximum sequence length */
  maxLength: number;
  /** Confidence threshold for skipLLM */
  confidenceThreshold: number;
  /** Top-K predictions to return */
  topK: number;
  /** Use GPU if available */
  useGPU: boolean;
  /** Cache size for tokenized inputs */
  cacheSize: number;
}

/**
 * Encoded features for the model
 */
export interface EncodedFeatures {
  /** Token IDs */
  inputIds: number[];
  /** Attention mask */
  attentionMask: number[];
  /** Additional context features (optional) */
  contextFeatures?: number[];
}

/**
 * Model health status
 */
export interface RouterModelHealth {
  /** Whether model is loaded */
  loaded: boolean;
  /** Model version */
  version: string;
  /** Number of tools supported */
  numTools: number;
  /** Average inference latency (recent) */
  avgLatencyMs: number;
  /** Total inferences performed */
  totalInferences: number;
  /** Last error (if any) */
  lastError?: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_ROUTER_CONFIG: RouterModelConfig = {
  modelPath: 'models/ferni-router.onnx',
  tokenizerPath: 'models/ferni-router-tokenizer',
  labelMapPath: 'models/label_map.json',
  maxLength: 512,
  confidenceThreshold: 0.7,
  topK: 10,
  useGPU: false,
  cacheSize: 1000,
};
