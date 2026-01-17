/**
 * Pre-Computed Embeddings Loader
 *
 * Loads tool embeddings from the pre-built file instead of computing at runtime.
 * This is 30-50x faster than API-based embedding generation!
 *
 * BUILD-TIME: scripts/build-tool-embeddings.ts generates dist/tool-embeddings.json
 * RUNTIME: This module loads and provides access to embeddings
 *
 * PERFORMANCE:
 * - API embedding generation: 3-5 seconds (700 tools × embedding API call)
 * - Pre-computed load: ~100ms (single JSON file)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/safe-logger.js';
import { cosineSimilarity } from '../../memory/rust-accelerator.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ToolEmbedding {
  toolId: string;
  domain: string;
  text: string;
  embedding: number[];
  dimension: number;
}

export interface EmbeddingsManifest {
  version: string;
  buildTime: string;
  model: string;
  dimension: number;
  totalTools: number;
  embeddings: ToolEmbedding[];
  embeddingIndex: Record<string, number>;
}

// ============================================================================
// GLOBAL STATE (Process-wide singleton)
// ============================================================================

const EMBEDDINGS_STATE_KEY = Symbol.for('ferni.toolEmbeddings');

interface EmbeddingsState {
  manifest: EmbeddingsManifest | null;
  loadPromise: Promise<EmbeddingsManifest> | null;
  loadedAt: number | null;
  // Fast lookup: toolId -> embedding vector
  embeddingMap: Map<string, number[]>;
}

function getEmbeddingsState(): EmbeddingsState {
  const g = globalThis as Record<symbol, EmbeddingsState | undefined>;
  if (!g[EMBEDDINGS_STATE_KEY]) {
    g[EMBEDDINGS_STATE_KEY] = {
      manifest: null,
      loadPromise: null,
      loadedAt: null,
      embeddingMap: new Map(),
    };
  }
  return g[EMBEDDINGS_STATE_KEY];
}

// ============================================================================
// EMBEDDINGS LOADING
// ============================================================================

/**
 * Get the path to the embeddings file
 */
function getEmbeddingsPath(): string {
  // Use process.cwd() as base - works in both ESM and CJS
  return path.resolve(process.cwd(), 'dist/tool-embeddings.json');
}

/**
 * Load pre-computed embeddings (singleton, loads once)
 */
export async function loadPrecomputedEmbeddings(): Promise<EmbeddingsManifest> {
  const state = getEmbeddingsState();

  if (state.manifest) {
    return state.manifest;
  }

  if (state.loadPromise) {
    return state.loadPromise;
  }

  state.loadPromise = (async () => {
    const startTime = Date.now();
    const embeddingsPath = getEmbeddingsPath();

    try {
      if (!fs.existsSync(embeddingsPath)) {
        log.warn(
          { embeddingsPath },
          '⚠️ Pre-computed embeddings not found - run `pnpm build:tool-embeddings` first'
        );
        throw new Error('Embeddings not found');
      }

      const content = fs.readFileSync(embeddingsPath, 'utf-8');
      const manifest: EmbeddingsManifest = JSON.parse(content);

      // Build fast lookup map
      for (const embedding of manifest.embeddings) {
        state.embeddingMap.set(embedding.toolId.toLowerCase(), embedding.embedding);
      }

      state.manifest = manifest;
      state.loadedAt = Date.now();

      const elapsed = Date.now() - startTime;
      log.info(
        {
          totalTools: manifest.totalTools,
          dimension: manifest.dimension,
          model: manifest.model,
          buildTime: manifest.buildTime,
          loadTimeMs: elapsed,
        },
        '⚡ Pre-computed embeddings loaded (30-50x faster than API!)'
      );

      return manifest;
    } catch (error) {
      state.loadPromise = null;
      log.error({ error: String(error), embeddingsPath }, '❌ Failed to load embeddings');
      throw error;
    }
  })();

  return state.loadPromise;
}

/**
 * Check if embeddings are loaded
 */
export function areEmbeddingsLoaded(): boolean {
  return getEmbeddingsState().manifest !== null;
}

// ============================================================================
// EMBEDDING QUERIES
// ============================================================================

/**
 * Get embedding for a tool (fast O(1) lookup)
 */
export async function getToolEmbedding(toolId: string): Promise<number[] | null> {
  await loadPrecomputedEmbeddings();
  const state = getEmbeddingsState();
  return state.embeddingMap.get(toolId.toLowerCase()) || null;
}

/**
 * Get embedding synchronously (must be loaded first)
 */
export function getToolEmbeddingSync(toolId: string): number[] | null {
  const state = getEmbeddingsState();
  return state.embeddingMap.get(toolId.toLowerCase()) || null;
}

/**
 * Get all tool embeddings (for batch operations)
 */
export async function getAllToolEmbeddings(): Promise<Map<string, number[]>> {
  await loadPrecomputedEmbeddings();
  return getEmbeddingsState().embeddingMap;
}

// cosineSimilarity imported from rust-accelerator (SIMD-optimized)
export { cosineSimilarity };

/**
 * Find most similar tools to a query embedding
 */
export async function findSimilarTools(
  queryEmbedding: number[],
  options: {
    topK?: number;
    minSimilarity?: number;
    excludeToolIds?: string[];
  } = {}
): Promise<Array<{ toolId: string; similarity: number }>> {
  const { topK = 10, minSimilarity = 0.3, excludeToolIds = [] } = options;

  await loadPrecomputedEmbeddings();
  const state = getEmbeddingsState();
  const excludeSet = new Set(excludeToolIds.map((id) => id.toLowerCase()));

  const results: Array<{ toolId: string; similarity: number }> = [];

  // Use Array.from for compatibility with older TypeScript targets
  const entries = Array.from(state.embeddingMap.entries());
  for (const [toolId, embedding] of entries) {
    if (excludeSet.has(toolId)) continue;

    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity >= minSimilarity) {
      results.push({ toolId, similarity });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, topK);
}

/**
 * Generate a query embedding using the same local hash method
 * (Must match build-tool-embeddings.ts)
 */
export function generateQueryEmbedding(text: string, dimension: number = 384): number[] {
  const normalizedText = text.toLowerCase().trim();
  const embedding = new Array(dimension).fill(0);

  const hashFunctions = [
    (s: string, i: number) => {
      let h = 0;
      for (let j = 0; j < s.length; j++) {
        h = ((h << 5) - h + s.charCodeAt(j) * (i + 1)) | 0;
      }
      return h;
    },
    (s: string, i: number) => {
      let h = 5381;
      for (let j = 0; j < s.length; j++) {
        h = ((h << 5) + h + s.charCodeAt(j)) ^ (i * 31);
      }
      return h;
    },
  ];

  const tokens = normalizedText.split(/\s+/);

  for (const token of tokens) {
    for (let i = 0; i < dimension; i++) {
      for (const hashFn of hashFunctions) {
        const hash = hashFn(token, i);
        embedding[i] += (hash % 1000) / 1000;
      }
    }
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = tokens[i] + ' ' + tokens[i + 1];
    for (let j = 0; j < dimension; j++) {
      const hash = hashFunctions[0](bigram, j);
      embedding[j] += (hash % 500) / 500;
    }
  }

  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= normalizedText.length - n; i++) {
      const ngram = normalizedText.substring(i, i + n);
      const idx = Math.abs(hashFunctions[1](ngram, 0)) % dimension;
      embedding[idx] += 0.1;
    }
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimension; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * Semantic search: find tools matching a natural language query
 */
export async function semanticSearchTools(
  query: string,
  options: {
    topK?: number;
    minSimilarity?: number;
  } = {}
): Promise<Array<{ toolId: string; similarity: number }>> {
  const queryEmbedding = generateQueryEmbedding(query);
  return findSimilarTools(queryEmbedding, options);
}

/**
 * Get embedding stats
 */
export async function getEmbeddingsStats(): Promise<{
  totalTools: number;
  dimension: number;
  model: string;
  buildTime: string;
  loadedAt: number | null;
}> {
  const manifest = await loadPrecomputedEmbeddings();
  const state = getEmbeddingsState();

  return {
    totalTools: manifest.totalTools,
    dimension: manifest.dimension,
    model: manifest.model,
    buildTime: manifest.buildTime,
    loadedAt: state.loadedAt,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadPrecomputedEmbeddings,
  areEmbeddingsLoaded,
  getToolEmbedding,
  getToolEmbeddingSync,
  getAllToolEmbeddings,
  cosineSimilarity,
  findSimilarTools,
  generateQueryEmbedding,
  semanticSearchTools,
  getEmbeddingsStats,
};
