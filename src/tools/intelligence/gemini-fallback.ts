/**
 * FTIS Gemini Embedding Fallback
 *
 * Provides high-accuracy classification fallback using Gemini embeddings
 * when ONNX model confidence is below threshold.
 *
 * @module tools/intelligence/gemini-fallback
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'gemini-fallback' });

// ============================================================================
// TYPES
// ============================================================================

export interface CategoryCentroid {
  category: string;
  superCategory: string;
  centroid: number[];
  examples: number; // Number of examples used to compute centroid
}

export interface GeminiFallbackConfig {
  /** Confidence threshold below which to use Gemini */
  confidenceThreshold: number;
  /** Output dimensionality for embeddings */
  embeddingDimension: number;
  /** Whether fallback is enabled */
  enabled: boolean;
}

export interface FallbackResult {
  category: string;
  superCategory: string;
  confidence: number;
  usedFallback: boolean;
  latencyMs: number;
}

const DEFAULT_CONFIG: GeminiFallbackConfig = {
  confidenceThreshold: 0.85,
  embeddingDimension: 768,
  enabled: true,
};

// ============================================================================
// GOOGLE EMBEDDING API (REST)
// ============================================================================

// Use REST API directly for embeddings (more reliable than SDK)
const EMBEDDING_MODEL = 'text-embedding-004';

function getGoogleApiKey(): string {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
}

// ============================================================================
// EMBEDDING FUNCTIONS
// ============================================================================

/**
 * Get embedding for a single text using Google's REST API
 */
export async function getEmbedding(text: string, _dimension = 768): Promise<number[] | null> {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    log.error('No GOOGLE_API_KEY found');
    return null;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      log.error({ error }, 'Google embedding API error');
      return null;
    }

    const data = (await response.json()) as { embedding: { values: number[] } };
    return data.embedding.values;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get embedding');
    return null;
  }
}

/**
 * Get embeddings for multiple texts (sequentially via REST API)
 */
export async function getBatchEmbeddings(
  texts: string[],
  dimension = 768
): Promise<Array<number[] | null>> {
  const results: Array<number[] | null> = [];

  for (const text of texts) {
    const embedding = await getEmbedding(text, dimension);
    results.push(embedding);
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 50));
  }

  return results;
}

// ============================================================================
// SIMILARITY FUNCTIONS
// ============================================================================

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Find the most similar category using cosine similarity
 */
export function findMostSimilarCategory(
  queryEmbedding: number[],
  centroids: CategoryCentroid[]
): { category: string; superCategory: string; similarity: number } | null {
  if (centroids.length === 0) return null;

  let bestMatch = {
    category: '',
    superCategory: '',
    similarity: -1,
  };

  for (const centroid of centroids) {
    const similarity = cosineSimilarity(queryEmbedding, centroid.centroid);
    if (similarity > bestMatch.similarity) {
      bestMatch = {
        category: centroid.category,
        superCategory: centroid.superCategory,
        similarity,
      };
    }
  }

  return bestMatch.similarity >= 0 ? bestMatch : null;
}

// ============================================================================
// CENTROID COMPUTATION
// ============================================================================

/**
 * Compute centroid (average) of multiple embeddings
 */
export function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];

  const dimension = embeddings[0].length;
  const centroid = new Array(dimension).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimension; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimension; i++) {
    centroid[i] /= embeddings.length;
  }

  // Normalize the centroid
  const norm = Math.sqrt(centroid.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < dimension; i++) {
      centroid[i] /= norm;
    }
  }

  return centroid;
}

// ============================================================================
// FALLBACK CLASSIFIER
// ============================================================================

export class GeminiFallbackClassifier {
  private config: GeminiFallbackConfig;
  private centroids: CategoryCentroid[] = [];
  private initialized = false;

  constructor(config: Partial<GeminiFallbackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load precomputed centroids from file
   */
  async loadCentroids(centroidsPath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(centroidsPath, 'utf-8');
      this.centroids = JSON.parse(data);
      this.initialized = true;
      log.info({ count: this.centroids.length }, 'Loaded category centroids');
    } catch (error) {
      log.error({ error: String(error), path: centroidsPath }, 'Failed to load centroids');
    }
  }

  /**
   * Set centroids directly
   */
  setCentroids(centroids: CategoryCentroid[]): void {
    this.centroids = centroids;
    this.initialized = true;
  }

  /**
   * Classify using Gemini embeddings
   */
  async classify(query: string): Promise<FallbackResult | null> {
    if (!this.initialized || this.centroids.length === 0) {
      log.warn('Fallback classifier not initialized');
      return null;
    }

    const startTime = Date.now();

    const embedding = await getEmbedding(query, this.config.embeddingDimension);
    if (!embedding) {
      return null;
    }

    const match = findMostSimilarCategory(embedding, this.centroids);
    if (!match) {
      return null;
    }

    return {
      category: match.category,
      superCategory: match.superCategory,
      confidence: match.similarity,
      usedFallback: true,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Classify with ONNX primary and Gemini fallback
   */
  async classifyWithFallback(
    query: string,
    onnxResult: { category: string; superCategory: string; confidence: number }
  ): Promise<FallbackResult> {
    const startTime = Date.now();

    // If ONNX confidence is high enough, use it
    if (onnxResult.confidence >= this.config.confidenceThreshold) {
      return {
        category: onnxResult.category,
        superCategory: onnxResult.superCategory,
        confidence: onnxResult.confidence,
        usedFallback: false,
        latencyMs: Date.now() - startTime,
      };
    }

    // Otherwise, use Gemini fallback
    log.debug(
      { query: query.slice(0, 50), onnxConfidence: onnxResult.confidence.toFixed(3) },
      'Using Gemini fallback due to low ONNX confidence'
    );

    const fallbackResult = await this.classify(query);
    if (fallbackResult) {
      return fallbackResult;
    }

    // If fallback fails, return ONNX result anyway
    return {
      category: onnxResult.category,
      superCategory: onnxResult.superCategory,
      confidence: onnxResult.confidence,
      usedFallback: false,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): GeminiFallbackConfig {
    return { ...this.config };
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let fallbackInstance: GeminiFallbackClassifier | null = null;

export function getGeminiFallback(): GeminiFallbackClassifier {
  if (!fallbackInstance) {
    fallbackInstance = new GeminiFallbackClassifier();
  }
  return fallbackInstance;
}

export function resetGeminiFallback(): void {
  fallbackInstance = null;
}
