/**
 * Embedding Providers
 *
 * Different embedding models for semantic similarity.
 * Choose based on quality vs latency tradeoff.
 *
 * @module tools/semantic-router/embedding-providers
 */

import { createLogger } from '../../utils/safe-logger.js';
import { EmbeddingApiError, EmbeddingUnavailableError } from '../../utils/embedding-api-error.js';
import { flagOn } from '../../config/env-flag.js';
import { isGeminiConfigured } from '../../config/gemini-config.js';
import { embedTexts } from '../../config/gemini-embeddings.js';
import { getCachedEmbedding, cacheEmbedding } from './registry.js';
import type { EmbeddingProvider, EmbeddingVector } from './types.js';
// Centralized similarity operations - uses SIMD-ready implementation from rust-accelerator
import { cosineSimilarity } from '../../memory/rust-accelerator.js';

export type { EmbeddingVector };
// Re-export for backwards compatibility with existing consumers
export { cosineSimilarity };

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
      throw new EmbeddingApiError('OpenAI', response.status);
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
          throw new EmbeddingApiError('OpenAI', response.status);
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

/** A live query embedding may not hold a turn for a cold Vertex call (~12 s measured). */
const QUERY_EMBED_TIMEOUT_MS = 1500;

/**
 * Google gemini-embedding-001 provider, on Vertex through the shared client.
 * Behind ROUTER_EMBEDDINGS_VERTEX (off): off, every call fails at once, as the
 * dead GOOGLE_API_KEY did, and callers keep their non-embedding path.
 *
 * Same model memory/vectors uses. text-embedding-004 is retired.
 * Dimensions: 3072
 */
export class GoogleEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'gemini-embedding-001';
  readonly dimensions = 3072;

  private useCache: boolean;

  constructor(options?: { useCache?: boolean }) {
    this.useCache = options?.useCache ?? true;
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const [embedding] = await this.embedBatch([text], QUERY_EMBED_TIMEOUT_MS);
    return embedding;
  }

  async embedBatch(texts: string[], timeoutMs?: number): Promise<EmbeddingVector[]> {
    if (!flagOn('ROUTER_EMBEDDINGS_VERTEX')) {
      throw new EmbeddingUnavailableError('ROUTER_EMBEDDINGS_VERTEX is off');
    }
    const results: EmbeddingVector[] = new Array(texts.length);
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cached = this.useCache ? getCachedEmbedding(texts[i], this.modelName) : undefined;
      if (cached) results[i] = cached;
      else uncachedIndices.push(i);
    }

    if (uncachedIndices.length > 0) {
      const vectors = await embedTexts(
        this.modelName,
        uncachedIndices.map((i) => texts[i]),
        timeoutMs
      );
      uncachedIndices.forEach((globalIndex, j) => {
        results[globalIndex] = vectors[j];
        if (this.useCache) cacheEmbedding(texts[globalIndex], this.modelName, vectors[j]);
      });
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
    // Prefer Google (Vertex through the shared client), then OpenAI, then local
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

    if (isGeminiConfigured()) {
      defaultProvider = new GoogleEmbeddingProvider();
    } else if (hasOpenAIKey) {
      defaultProvider = new OpenAIEmbeddingProvider();
    } else {
      log.warn('No embedding provider configured, using local hash embeddings (testing only)');
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

// Note: cosineSimilarity is imported from rust-accelerator.js and re-exported above
