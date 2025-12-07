/**
 * Embeddings Utility
 *
 * Generates text embeddings for semantic search and similarity matching.
 * Uses OpenAI's embedding API by default, but supports other providers.
 */

import { getLogger } from '../utils/safe-logger.js';

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
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[], retryCount = 0): Promise<number[][]> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this._model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const error = await response.text();

        // Retry on rate limit (429) errors
        if (response.status === 429 && retryCount < MAX_RETRIES) {
          getLogger().warn(
            `Rate limited, retrying in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`
          );
          await new Promise<void>((resolve) => { setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)); });
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

      getLogger().debug(`Generated ${texts.length} embeddings, ${data.usage.total_tokens} tokens`);
      return sorted.map((d) => d.embedding);
    } catch (error) {
      getLogger().error(`Embedding error: ${error}`);
      throw error;
    }
  }
}

/**
 * Google AI embedding provider
 * Uses text-embedding-004 model via Google AI Generative Language API
 * Supports 768 dimensions, 2048 token max sequence length
 */
export class GoogleEmbeddings extends EmbeddingProvider {
  private _model: string;
  private _dimensions: number;
  private apiKey: string;

  constructor(config?: { model?: string; apiKey?: string; dimensions?: number }) {
    super();
    this._model = config?.model || 'text-embedding-004';
    this._dimensions = config?.dimensions || 768;
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

    try {
      // Use Google AI Generative Language API (simpler, API key auth)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this._model}:batchEmbedContents?key=${this.apiKey}`;

      const requests = texts.map((text) => ({
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

      getLogger().debug(
        `Generated ${texts.length} Google AI embeddings (${this._model}), ${this._dimensions}d`
      );
      return data.embeddings.map((e) => e.values);
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
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const token = await this.getToken();
      const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this._model}:predict`;

      // Vertex AI expects a different format - one request per text for batch
      const results: number[][] = [];

      for (const text of texts) {
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

        results.push(data.predictions[0].embeddings.values);
      }

      getLogger().debug(`Generated ${texts.length} Vertex AI embeddings (${this._model})`);
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

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

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
 * Get the default embedding provider
 * Priority: Google AI > OpenAI > Local
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    // Try Google AI first (preferred), then OpenAI, fall back to local
    if (process.env.GOOGLE_API_KEY) {
      defaultProvider = new GoogleEmbeddings();
      getLogger().info('Using Google AI embeddings (text-embedding-004)');
    } else if (process.env.OPENAI_API_KEY) {
      defaultProvider = new OpenAIEmbeddings();
      getLogger().info('Using OpenAI embeddings');
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

/**
 * Generate embeddings using the default provider
 */
export async function embed(text: string): Promise<number[]> {
  return getEmbeddingProvider().embed(text);
}

/**
 * Generate batch embeddings using the default provider
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  return getEmbeddingProvider().embedBatch(texts);
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
  // Google models
  'text-embedding-004': 768,
  'textembedding-gecko': 768,
  'textembedding-gecko@003': 768,
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
  OpenAIEmbeddings,
  GoogleEmbeddings,
  VertexAIEmbeddings,
  LocalEmbeddings,
  EMBEDDING_DIMENSIONS,
  getModelDimensions,
  validateEmbeddingDimensions,
};
