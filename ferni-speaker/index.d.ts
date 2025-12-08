/**
 * ferni-speaker - High-performance speaker embedding extraction
 *
 * TypeScript type definitions
 */

export interface MatchResult {
  /** Index of the matching candidate */
  index: number;
  /** Similarity score (0-1) */
  similarity: number;
}

export interface ModelInfo {
  /** Model name/type (e.g., "ECAPA-TDNN") */
  name: string;
  /** Embedding dimension (typically 192) */
  embeddingDim: number;
  /** Expected sample rate (16000) */
  sampleRate: number;
  /** Minimum audio samples required */
  minSamples: number;
}

/**
 * Initialize the speaker embedding model.
 *
 * Must be called before extracting embeddings, unless using auto-initialization.
 *
 * @param modelPath - Path to the ONNX model file. Uses default model if not provided.
 * @throws Error if model file not found or loading fails
 */
export function initialize(modelPath?: string): void;

/**
 * Check if the model is initialized.
 */
export function isInitialized(): boolean;

/**
 * Extract a speaker embedding from audio samples.
 *
 * @param samples - Float32Array of audio samples (16kHz mono)
 * @returns 192-dimensional embedding vector
 * @throws Error if audio too short (<0.5s) or model not initialized
 *
 * @example
 * ```typescript
 * const audio = new Float32Array(16000); // 1 second of audio
 * const embedding = extractEmbedding(audio);
 * console.log(embedding.length); // 192
 * ```
 */
export function extractEmbedding(samples: Float32Array): Float32Array;

/**
 * Compare two embeddings using cosine similarity.
 *
 * @param emb1 - First embedding vector
 * @param emb2 - Second embedding vector
 * @returns Similarity score between 0 and 1 (higher = more similar)
 *
 * @example
 * ```typescript
 * const similarity = compareEmbeddings(emb1, emb2);
 * if (similarity > 0.7) {
 *   console.log('Same speaker!');
 * }
 * ```
 */
export function compareEmbeddings(emb1: Float32Array, emb2: Float32Array): number;

/**
 * Extract embeddings from multiple audio samples in parallel.
 *
 * More efficient than calling extractEmbedding multiple times.
 *
 * @param samplesList - Array of audio sample arrays
 * @returns Array of embedding vectors
 */
export function extractEmbeddingsBatch(samplesList: Float32Array[]): Float32Array[];

/**
 * Find the best matching embedding from a list of candidates.
 *
 * @param query - The query embedding to match
 * @param candidates - Array of candidate embeddings to search
 * @param threshold - Minimum similarity threshold (default 0.5)
 * @returns Best match result, or null if no match above threshold
 *
 * @example
 * ```typescript
 * const match = findBestMatch(queryEmbedding, storedEmbeddings, 0.6);
 * if (match) {
 *   console.log(`Best match: index ${match.index}, similarity ${match.similarity}`);
 * }
 * ```
 */
export function findBestMatch(
  query: Float32Array,
  candidates: Float32Array[],
  threshold?: number
): MatchResult | null;

/**
 * Find all matches above a similarity threshold.
 *
 * @param query - The query embedding
 * @param candidates - Array of candidate embeddings
 * @param threshold - Minimum similarity threshold
 * @returns Array of matches sorted by similarity (descending)
 */
export function findAllMatches(
  query: Float32Array,
  candidates: Float32Array[],
  threshold: number
): MatchResult[];

/**
 * Get information about the loaded model.
 *
 * @returns Model metadata including name, dimensions, and requirements
 */
export function getModelInfo(): ModelInfo;

/**
 * Compute similarity matrix between two sets of embeddings.
 *
 * Useful for clustering or analyzing speaker similarity across a corpus.
 *
 * @param embeddings1 - First set of embeddings (rows)
 * @param embeddings2 - Second set of embeddings (columns)
 * @returns Flattened similarity matrix as Float32Array (row-major order)
 *
 * @example
 * ```typescript
 * const matrix = computeSimilarityMatrix(embeddings, embeddings);
 * // Access element [i, j]: matrix[i * embeddings.length + j]
 * ```
 */
export function computeSimilarityMatrix(
  embeddings1: Float32Array[],
  embeddings2: Float32Array[]
): Float32Array;

/**
 * Default model path (relative to package root)
 */
export const DEFAULT_MODEL_PATH: string;

