/**
 * Embedding Providers
 *
 * Different embedding models for semantic similarity.
 * Choose based on quality vs latency tradeoff.
 *
 * @module tools/semantic-router/embedding-providers
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getCachedEmbedding, cacheEmbedding } from './registry.js';
import type { EmbeddingProvider, EmbeddingVector } from './types.js';

export type { EmbeddingVector };

const log = createLogger({ module: 'semantic-router:embeddings' });

// ============================================================================
// OPENAI EMBEDDING PROVIDER
// ============================================================================

/**
 * OpenAI text-embedding-3-small provider
 *
 * Fast and good quality. Recommended for production.
 * Dimensions: 1536
 * Latency: ~50-100ms
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'text-embedding-3-small';
  readonly dimensions = 1536;

  private apiKey: string;
  private baseUrl: string;
  private useCache: boolean;

  constructor(options?: { apiKey?: string; baseUrl?: string; useCache?: boolean }) {
    this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
    this.useCache = options?.useCache ?? true;

    if (!this.apiKey) {
      log.warn('No OpenAI API key provided - embeddings will fail');
    }
  }

  async embed(text: string): Promise<EmbeddingVector> {
    // CRITICAL: Check for API key before making request to avoid spamming errors
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured - cannot generate embeddings');
    }

    // Check cache
    if (this.useCache) {
      const cached = getCachedEmbedding(text, this.modelName);
      if (cached) return cached;
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    const embedding = data.data[0].embedding;

    // Cache result
    if (this.useCache) {
      cacheEmbedding(text, this.modelName, embedding);
    }

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    // Check cache for all
    const results: EmbeddingVector[] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    if (this.useCache) {
      for (let i = 0; i < texts.length; i++) {
        const cached = getCachedEmbedding(texts[i], this.modelName);
        if (cached) {
          results[i] = cached;
        } else {
          uncachedIndices.push(i);
          uncachedTexts.push(texts[i]);
        }
      }
    } else {
      for (let i = 0; i < texts.length; i++) {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    // Fetch uncached embeddings
    if (uncachedTexts.length > 0) {
      // Batch in chunks of 100 (OpenAI limit)
      const BATCH_SIZE = 100;
      for (let i = 0; i < uncachedTexts.length; i += BATCH_SIZE) {
        const batch = uncachedTexts.slice(i, i + BATCH_SIZE);

        const response = await fetch(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.modelName,
            input: batch,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`OpenAI batch embedding failed: ${error}`);
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
        };

        // Map back to original indices
        for (const item of data.data) {
          const globalIndex = uncachedIndices[i + item.index];
          results[globalIndex] = item.embedding;

          // Cache
          if (this.useCache) {
            cacheEmbedding(texts[globalIndex], this.modelName, item.embedding);
          }
        }
      }
    }

    return results;
  }
}

// ============================================================================
// GOOGLE EMBEDDING PROVIDER
// ============================================================================

/**
 * Google text-embedding-004 provider
 *
 * Free tier available, good quality.
 * Dimensions: 768
 * Latency: ~30-80ms
 */
export class GoogleEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'text-embedding-004';
  readonly dimensions = 768;

  private apiKey: string;
  private useCache: boolean;

  constructor(options?: { apiKey?: string; useCache?: boolean }) {
    this.apiKey = options?.apiKey || process.env.GOOGLE_API_KEY || '';
    this.useCache = options?.useCache ?? true;

    if (!this.apiKey) {
      log.warn('No Google API key provided - embeddings will fail');
    }
  }

  async embed(text: string): Promise<EmbeddingVector> {
    // Check cache
    if (this.useCache) {
      const cached = getCachedEmbedding(text, this.modelName);
      if (cached) return cached;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${this.modelName}`,
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google embedding failed: ${error}`);
    }

    const data = (await response.json()) as {
      embedding: { values: number[] };
    };
    const embedding = data.embedding.values;

    // Cache result
    if (this.useCache) {
      cacheEmbedding(text, this.modelName, embedding);
    }

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    // Check cache for all
    const results: EmbeddingVector[] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    if (this.useCache) {
      for (let i = 0; i < texts.length; i++) {
        const cached = getCachedEmbedding(texts[i], this.modelName);
        if (cached) {
          results[i] = cached;
        } else {
          uncachedIndices.push(i);
          uncachedTexts.push(texts[i]);
        }
      }
    } else {
      for (let i = 0; i < texts.length; i++) {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    // Fetch uncached embeddings using Google's batchEmbedContents API
    if (uncachedTexts.length > 0) {
      // Google batch API supports up to 100 requests per call
      const BATCH_SIZE = 100;

      for (let i = 0; i < uncachedTexts.length; i += BATCH_SIZE) {
        const batch = uncachedTexts.slice(i, i + BATCH_SIZE);
        const batchIndices = uncachedIndices.slice(i, i + BATCH_SIZE);

        // Build batch request
        const requests = batch.map((text) => ({
          model: `models/${this.modelName}`,
          content: { parts: [{ text }] },
        }));

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:batchEmbedContents?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Google batch embedding failed: ${error}`);
        }

        const data = (await response.json()) as {
          embeddings: Array<{ values: number[] }>;
        };

        // Map back to original indices
        for (let j = 0; j < data.embeddings.length; j++) {
          const globalIndex = batchIndices[j];
          const embedding = data.embeddings[j].values;
          results[globalIndex] = embedding;

          // Cache
          if (this.useCache) {
            cacheEmbedding(texts[globalIndex], this.modelName, embedding);
          }
        }
      }
    }

    return results;
  }
}

// ============================================================================
// LOCAL/MOCK EMBEDDING PROVIDER (for testing)
// ============================================================================

/**
 * Simple local embedding using word hashing
 *
 * For testing only - not semantically meaningful!
 * Very fast, no API calls needed.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'local-hash';
  readonly dimensions = 384;

  async embed(text: string): Promise<EmbeddingVector> {
    // Simple hash-based embedding for testing
    const vector = new Array(this.dimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      for (let i = 0; i < word.length; i++) {
        const charCode = word.charCodeAt(i);
        const idx = (charCode * (i + 1) * 17) % this.dimensions;
        vector[idx] += 1 / words.length;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export type EmbeddingModel = 'openai' | 'google' | 'local';

/**
 * Create an embedding provider
 */
export function createEmbeddingProvider(
  model: EmbeddingModel,
  options?: { apiKey?: string; useCache?: boolean }
): EmbeddingProvider {
  switch (model) {
    case 'openai':
      return new OpenAIEmbeddingProvider(options);
    case 'google':
      return new GoogleEmbeddingProvider(options);
    case 'local':
      return new LocalHashEmbeddingProvider();
    default:
      throw new Error(`Unknown embedding model: ${model}`);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Default provider instance (lazy initialized)
let defaultProvider: EmbeddingProvider | null = null;

/**
 * Get the default embedding provider (creates one if needed)
 */
function getDefaultProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    // Prefer Google (free tier), fallback to local
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

    if (hasGoogleKey) {
      defaultProvider = new GoogleEmbeddingProvider();
    } else if (hasOpenAIKey) {
      defaultProvider = new OpenAIEmbeddingProvider();
    } else {
      log.warn('No API key found, using local hash embeddings (testing only)');
      defaultProvider = new LocalHashEmbeddingProvider();
    }
  }
  return defaultProvider;
}

/**
 * Get embedding for text using default provider
 */
export async function getEmbedding(text: string): Promise<EmbeddingVector> {
  return getDefaultProvider().embed(text);
}

/**
 * Get embeddings for multiple texts
 */
export async function getEmbeddings(texts: string[]): Promise<EmbeddingVector[]> {
  return getDefaultProvider().embedBatch(texts);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}
