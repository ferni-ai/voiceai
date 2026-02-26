/**
 * Embeddings Utility
 *
 * Generates text embeddings for semantic search and similarity matching.
 * Uses OpenAI's embedding API by default, but supports other providers.
 * Protected by circuit breaker to prevent cascading failures.
 */

import {
  getCircuitBreaker,
  getRedisCircuitBreakerAsync,
  type CircuitBreaker,
} from '../../utils/circuit-breaker.js';
import {
  getAllCoalescerStats,
  getRequestCoalescer,
  hashContent,
  type CoalescerStats,
} from '../../utils/request-coalescer.js';
import { getLogger } from '../../utils/safe-logger.js';
// Centralized similarity operations - uses SIMD-ready implementation from rust-accelerator
import {
  cosineSimilarity,
  type EmbeddingVector as RustEmbeddingVector,
} from './rust-accelerator/index.js';

// Re-export for backwards compatibility with existing consumers
export { cosineSimilarity };
export type { RustEmbeddingVector as EmbeddingVectorLike };

// ============================================================================
// CIRCUIT BREAKERS (Redis-backed for cross-instance coordination)
// ============================================================================

// Start with local breakers, upgrade to Redis async
let openaiEmbeddingBreaker: CircuitBreaker = getCircuitBreaker('openai-embeddings', {
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 2,
});

let googleEmbeddingBreaker: CircuitBreaker = getCircuitBreaker('google-embeddings', {
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 2,
});

// Upgrade to Redis-backed breakers (non-blocking)
// When one instance hits OpenAI rate limits, ALL instances back off
void (async () => {
  try {
    openaiEmbeddingBreaker = await getRedisCircuitBreakerAsync('openai-embeddings', {
      failureThreshold: 5,
      resetTimeout: 30000,
      successThreshold: 2,
    });
    googleEmbeddingBreaker = await getRedisCircuitBreakerAsync('google-embeddings', {
      failureThreshold: 5,
      resetTimeout: 30000,
      successThreshold: 2,
    });
    getLogger().debug('Embedding circuit breakers upgraded to Redis-backed');
  } catch {
    // Keep using local breakers
  }
})();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Embedding result with metadata
 */
export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokenCount?: number;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  results: EmbeddingResult[];
  totalTokens: number;
}

/**
 * Embedding provider configuration
 */
export interface EmbeddingConfig {
  provider: 'openai' | 'google' | 'local';
  model?: string;
  apiKey?: string;
  dimensions?: number;
}

// ============================================================================
// EMBEDDING PROVIDER
// ============================================================================

/**
 * Abstract embedding provider
 */
export abstract class EmbeddingProvider {
  abstract embed(text: string): Promise<number[]>;
  abstract embedBatch(texts: string[]): Promise<number[][]>;
  abstract get dimensions(): number;
  abstract get model(): string;
}

/**
 * OpenAI embedding provider
 */
export class OpenAIEmbeddings extends EmbeddingProvider {
  private _model: string;
  private _dimensions: number;
  private apiKey: string;

  constructor(config?: { model?: string; apiKey?: string }) {
    super();
    this._model = config?.model || 'text-embedding-3-small';
    this._dimensions = this._model === 'text-embedding-3-large' ? 3072 : 1536;
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY || '';

    if (!this.apiKey) {
      getLogger().warn('OpenAI API key not set. Embeddings will fail.');
    }
  }

  get dimensions(): number {
    return this._dimensions;
  }

  get model(): string {
    return this._model;
  }

  async embed(text: string): Promise<number[]> {
    // Validate non-empty text
    const trimmed = text?.trim();
    if (!trimmed) {
      throw new Error('Cannot generate OpenAI embedding for empty text');
    }
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[], retryCount = 0): Promise<number[][]> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Track valid text indices for proper result mapping
    const validIndices: number[] = [];
    const validTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text?.trim()) {
        validIndices.push(i);
        validTexts.push(text);
      }
    }

    // If all texts were empty, return empty arrays
    if (validTexts.length === 0) {
      getLogger().warn('All texts in batch were empty, returning empty results');
      return texts.map(() => []);
    }

    // Check circuit breaker before making request
    if (!openaiEmbeddingBreaker.canRequest()) {
      throw new Error('OpenAI embedding service unavailable (circuit breaker open)');
    }

    try {
      return await openaiEmbeddingBreaker.execute(async () => {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this._model,
            input: validTexts,
          }),
        });

        if (!response.ok) {
          const error = await response.text();

          // Retry on rate limit (429) errors
          if (response.status === 429 && retryCount < MAX_RETRIES) {
            getLogger().warn(
              `Rate limited, retrying in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`
            );
            await new Promise<void>((resolve) => {
              setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1));
            });
            return this.embedBatch(texts, retryCount + 1);
          }

          throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
          usage: { total_tokens: number };
        };

        // Sort by index to maintain order
        const sorted = data.data.sort((a, b) => a.index - b.index);

        // Map results back to original indices, empty arrays for empty texts
        const results: number[][] = texts.map(() => []);
        for (let i = 0; i < validIndices.length; i++) {
          results[validIndices[i]] = sorted[i].embedding;
        }

        getLogger().debug(
          `Generated ${validTexts.length} embeddings, ${data.usage.total_tokens} tokens`
        );
        return results;
      });
    } catch (error) {
      getLogger().error(`Embedding error: ${error}`);
      throw error;
    }
  }
}

/**
 * Google AI embedding provider
 * Uses gemini-embedding-001 model via Google AI Generative Language API
 * Note: text-embedding-004/005 are listed but not actually available in v1beta
 * gemini-embedding-001 returns 3072 dimensions
 */
export class GoogleEmbeddings extends EmbeddingProvider {
  private _model: string;
  private _dimensions: number;
  private apiKey: string;

  constructor(config?: { model?: string; apiKey?: string; dimensions?: number }) {
    super();
    this._model = config?.model || 'gemini-embedding-001';
    this._dimensions = config?.dimensions || 3072; // gemini-embedding-001 returns 3072d
    // Use explicit apiKey if provided (even empty string), otherwise fall back to env var
    this.apiKey = config?.apiKey !== undefined ? config.apiKey : process.env.GOOGLE_API_KEY || '';

    if (!this.apiKey) {
      getLogger().warn('Google API key not set. Embeddings will fail.');
    }
  }

  get dimensions(): number {
    return this._dimensions;
  }

  get model(): string {
    return this._model;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('Google API key not configured');
    }
    // Validate non-empty text
    const trimmed = text?.trim();
    if (!trimmed) {
      throw new Error('Cannot generate Google AI embedding for empty text');
    }
    const results = await this.embedBatch([text]);
    if (!results || results.length === 0) {
      throw new Error('No embedding results returned');
    }
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('Google API key not configured');
    }

    // Track valid text indices for proper result mapping
    const validIndices: number[] = [];
    const validTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text?.trim()) {
        validIndices.push(i);
        validTexts.push(text);
      }
    }

    // If all texts were empty, return empty arrays
    if (validTexts.length === 0) {
      getLogger().warn('All texts in batch were empty, returning empty results');
      return texts.map(() => []);
    }

    // Check circuit breaker before making request
    if (!googleEmbeddingBreaker.canRequest()) {
      throw new Error('Google embedding service unavailable (circuit breaker open)');
    }

    try {
      return await googleEmbeddingBreaker.execute(async () => {
        // Use Google AI Generative Language API (simpler, API key auth)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this._model}:batchEmbedContents?key=${this.apiKey}`;

        const requests = validTexts.map((text) => ({
          model: `models/${this._model}`,
          content: { parts: [{ text }] },
        }));

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Google AI API error: ${response.status} - ${error}`);
        }

        const data = (await response.json()) as {
          embeddings: Array<{ values: number[] }>;
        };

        // Map results back to original indices, empty arrays for empty texts
        const results: number[][] = texts.map(() => []);
        for (let i = 0; i < validIndices.length; i++) {
          results[validIndices[i]] = data.embeddings[i].values;
        }

        getLogger().debug(
          `Generated ${validTexts.length} Google AI embeddings (${this._model}), ${this._dimensions}d`
        );
        return results;
      });
    } catch (error) {
      getLogger().error(`Google embedding error: ${error}`);
      throw error;
    }
  }
}

/**
 * Google Vertex AI embedding provider (uses service account auth)
 * For production deployments with Google Cloud
 */
export class VertexAIEmbeddings extends EmbeddingProvider {
  private _model: string;
  private _dimensions: number;
  private projectId: string;
  private location: string;
  private accessToken: string | (() => Promise<string>);

  constructor(config: {
    model?: string;
    projectId: string;
    location?: string;
    dimensions?: number;
    accessToken: string | (() => Promise<string>);
  }) {
    super();
    this._model = config.model || 'gemini-embedding-001';
    this._dimensions = config.dimensions || 768;
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.accessToken = config.accessToken;
  }

  get dimensions(): number {
    return this._dimensions;
  }

  get model(): string {
    return this._model;
  }

  private async getToken(): Promise<string> {
    if (typeof this.accessToken === 'function') {
      return this.accessToken();
    }
    return this.accessToken;
  }

  async embed(text: string): Promise<number[]> {
    // Validate non-empty text
    const trimmed = text?.trim();
    if (!trimmed) {
      throw new Error('Cannot generate Vertex AI embedding for empty text');
    }
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Track valid text indices for proper result mapping
    const validIndices: number[] = [];
    const validTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text?.trim()) {
        validIndices.push(i);
        validTexts.push(text);
      }
    }

    // If all texts were empty, return empty arrays
    if (validTexts.length === 0) {
      getLogger().warn('All texts in batch were empty, returning empty results');
      return texts.map(() => []);
    }

    if (validTexts.length !== texts.length) {
      getLogger().warn(
        { original: texts.length, valid: validTexts.length },
        'Filtered empty texts from Vertex AI embedding batch'
      );
    }

    try {
      const token = await this.getToken();
      const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this._model}:predict`;

      // Vertex AI expects a different format - one request per text for batch
      const validResults: number[][] = [];

      for (const text of validTexts) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            instances: [{ content: text }],
            parameters: { autoTruncate: true },
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Vertex AI API error: ${response.status} - ${error}`);
        }

        const data = (await response.json()) as {
          predictions: Array<{
            embeddings: {
              values: number[];
              statistics: { truncated: boolean; token_count: number };
            };
          }>;
        };

        validResults.push(data.predictions[0].embeddings.values);
      }

      // Map results back to original indices, empty arrays for empty texts
      const results: number[][] = texts.map(() => []);
      for (let i = 0; i < validIndices.length; i++) {
        results[validIndices[i]] = validResults[i];
      }

      getLogger().debug(`Generated ${validTexts.length} Vertex AI embeddings (${this._model})`);
      return results;
    } catch (error) {
      getLogger().error(`Vertex AI embedding error: ${error}`);
      throw error;
    }
  }
}

/**
 * Local/fallback embedding provider using simple hashing
 * For development when no API key is available
 */
export class LocalEmbeddings extends EmbeddingProvider {
  private _dimensions: number;

  constructor(dimensions = 384) {
    super();
    this._dimensions = dimensions;
  }

  get dimensions(): number {
    return this._dimensions;
  }

  readonly model = 'local-hash' as const;

  async embed(text: string): Promise<number[]> {
    // Simple hash-based embedding for development
    // NOT suitable for production - no semantic meaning
    const hash = this.hashString(text);
    const embedding = new Array(this._dimensions);

    for (let i = 0; i < this._dimensions; i++) {
      // Generate pseudo-random values from hash
      const seed = (hash * (i + 1)) % 2147483647;
      embedding[i] = (seed / 2147483647) * 2 - 1; // -1 to 1
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return Promise.resolve(embedding.map((v) => v / magnitude));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(async (t) => this.embed(t)));
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

// ============================================================================
// SIMILARITY FUNCTIONS
// ============================================================================

// Note: cosineSimilarity is imported from rust-accelerator.js (SIMD-accelerated)

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Find top-k most similar vectors
 */
export function findTopK(
  query: number[],
  vectors: number[][],
  k: number,
  similarity: 'cosine' | 'euclidean' = 'cosine'
): Array<{ index: number; score: number }> {
  const scores = vectors.map((vector, index) => {
    const score =
      similarity === 'cosine'
        ? cosineSimilarity(query, vector)
        : 1 / (1 + euclideanDistance(query, vector)); // Convert distance to similarity
    return { index, score };
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, k);
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

let defaultProvider: EmbeddingProvider | null = null;

/**
 * Get access token for Vertex AI using Application Default Credentials
 */
async function getVertexAIAccessToken(): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error('Failed to get Vertex AI access token');
  }
  return tokenResponse.token;
}

/**
 * Get the default embedding provider
 * Priority: Vertex AI (if USE_VERTEX_AI) > OpenAI > Google AI > Local
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    const useVertexAI = process.env.USE_VERTEX_AI !== 'false';
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;

    // Use Vertex AI when configured (default in production)
    if (useVertexAI && projectId) {
      defaultProvider = new VertexAIEmbeddings({
        projectId,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        model: 'text-embedding-005', // Latest Vertex AI embedding model
        accessToken: getVertexAIAccessToken,
      });
      getLogger().info({ projectId, model: 'text-embedding-005' }, 'Using Vertex AI embeddings');
    } else if (process.env.OPENAI_API_KEY) {
      // Prefer OpenAI over Google AI v1beta (more reliable)
      defaultProvider = new OpenAIEmbeddings();
      getLogger().info('Using OpenAI embeddings');
    } else if (process.env.GOOGLE_API_KEY) {
      // Google AI v1beta API - use gemini-embedding-001 (text-embedding-004/005 not actually available)
      defaultProvider = new GoogleEmbeddings({ model: 'gemini-embedding-001' });
      getLogger().info('Using Google AI embeddings (gemini-embedding-001)');
    } else {
      defaultProvider = new LocalEmbeddings();
      getLogger().warn('Using local embeddings (no semantic meaning - for development only)');
    }
  }
  return defaultProvider;
}

/**
 * Set a custom embedding provider
 */
export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  defaultProvider = provider;
  getLogger().info(`Set embedding provider: ${provider.model}`);
}

// ============================================================================
// REQUEST COALESCER (Prevents duplicate concurrent API calls)
// ============================================================================

/**
 * Get the embedding coalescer instance.
 * Uses registry pattern to ensure tests can reset the coalescer.
 */
function getEmbeddingCoalescer() {
  return getRequestCoalescer<number[]>('embeddings', {
    pendingTtlMs: 60000, // 60s max wait for embedding generation
    maxPending: 10000, // Max concurrent pending requests
  });
}

/**
 * Generate embeddings using the default provider with request coalescing.
 *
 * When multiple concurrent requests arrive for the same text, only one
 * actual API call is made and all waiters share the result.
 *
 * @param text - Text to generate embedding for
 * @returns The embedding vector
 * @throws Error if text is empty or whitespace-only
 */
export async function embed(text: string): Promise<number[]> {
  // Validate non-empty text to prevent API errors
  const trimmed = text?.trim();
  if (!trimmed) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const hash = hashContent(text);
  // Clone the result to prevent mutation bugs when requests coalesce.
  // Without cloning, all coalesced callers share the same array reference.
  const result = await getEmbeddingCoalescer().execute(hash, async () =>
    getEmbeddingProvider().embed(text)
  );
  return [...result];
}

/**
 * Generate batch embeddings using the default provider with deduplication.
 *
 * Deduplicates texts within the batch to avoid generating embeddings
 * for the same text multiple times. Empty/whitespace-only texts are filtered out.
 *
 * @param texts - Array of texts to generate embeddings for
 * @returns Array of embedding vectors (preserves original order, empty texts get empty arrays)
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Track which indices have empty text (will return empty arrays for these)
  const emptyIndices = new Set<number>();

  // Deduplicate non-empty texts while preserving order
  const uniqueTexts: string[] = [];
  const textToIndex = new Map<string, number>();
  const originalToUnique: number[] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const trimmed = text?.trim();

    // Skip empty/whitespace-only texts
    if (!trimmed) {
      emptyIndices.add(i);
      originalToUnique.push(-1); // Marker for empty text
      continue;
    }

    const hash = hashContent(text);
    let uniqueIndex = textToIndex.get(hash);

    if (uniqueIndex === undefined) {
      uniqueIndex = uniqueTexts.length;
      uniqueTexts.push(text);
      textToIndex.set(hash, uniqueIndex);
    }

    originalToUnique.push(uniqueIndex);
  }

  // Log empty text filtering
  if (emptyIndices.size > 0) {
    getLogger().debug(
      { total: texts.length, empty: emptyIndices.size },
      'Filtered empty texts from embedding batch'
    );
  }

  // If all texts were empty, return empty arrays
  if (uniqueTexts.length === 0) {
    return texts.map(() => []);
  }

  // Log deduplication stats
  if (uniqueTexts.length < texts.length - emptyIndices.size) {
    getLogger().debug(
      { original: texts.length - emptyIndices.size, unique: uniqueTexts.length },
      'Embedding batch deduplicated'
    );
  }

  // Generate embeddings for unique non-empty texts
  const uniqueEmbeddings = await getEmbeddingProvider().embedBatch(uniqueTexts);

  // Map back to original order, cloning arrays for duplicates to prevent
  // mutation bugs (if caller modifies their array, it shouldn't affect others)
  const usedIndices = new Set<number>();
  return originalToUnique.map((uniqueIndex, originalIndex) => {
    // Return empty array for empty texts
    if (emptyIndices.has(originalIndex)) {
      return [];
    }

    const embedding = uniqueEmbeddings[uniqueIndex];
    if (usedIndices.has(uniqueIndex)) {
      // Clone for duplicates to prevent shared mutation
      return [...embedding];
    }
    usedIndices.add(uniqueIndex);
    return embedding;
  });
}

/**
 * Get embedding coalescer statistics for monitoring
 */
export function getEmbeddingCoalescerStats(): CoalescerStats | undefined {
  return getAllCoalescerStats().find((s) => s.name === 'embeddings');
}

// ============================================================================
// EMBEDDING DIMENSIONS
// ============================================================================

/**
 * Standard embedding dimensions for various models
 */
export const EMBEDDING_DIMENSIONS: Record<string, number> = {
  // OpenAI models
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  // Google models (Vertex AI)
  'text-embedding-005': 768,
  'text-embedding-004': 768,
  'textembedding-gecko': 768,
  'textembedding-gecko@003': 768,
  // Google AI v1beta models
  'gemini-embedding-001': 3072, // Actual dimension from API
  'embedding-001': 768,
  // Local/hash embeddings
  'local-hash': 384,
};

/**
 * Get the dimensions for a specific model
 * Returns undefined for unknown models
 */
export function getModelDimensions(model: string): number | undefined {
  return EMBEDDING_DIMENSIONS[model];
}

/**
 * Validate that two embeddings have compatible dimensions
 */
export function validateEmbeddingDimensions(
  embedding1: number[],
  embedding2: number[],
  context?: string
): void {
  if (embedding1.length !== embedding2.length) {
    const contextStr = context ? ` in ${context}` : '';
    throw new Error(
      `Embedding dimension mismatch${contextStr}: ${embedding1.length} vs ${embedding2.length}`
    );
  }
}

export default {
  embed,
  embedBatch,
  cosineSimilarity,
  euclideanDistance,
  findTopK,
  getEmbeddingProvider,
  setEmbeddingProvider,
  getEmbeddingCoalescerStats,
  OpenAIEmbeddings,
  GoogleEmbeddings,
  VertexAIEmbeddings,
  LocalEmbeddings,
  EMBEDDING_DIMENSIONS,
  getModelDimensions,
  validateEmbeddingDimensions,
};
