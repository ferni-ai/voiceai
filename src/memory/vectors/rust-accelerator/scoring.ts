/**
 * Rust Accelerator — batch tool scoring (semantic router optimization).
 * @module memory/vectors/rust-accelerator/scoring
 */

import { loadRustPerf, tryLoadRustPerf, NativeRustAcceleratorUnavailableError, metrics, isRustAvailable, getRustInfo, getAcceleratorMetrics, getRustLoadError } from './core.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();
import type {
  ToolProfileInput, ToolScoringResult, BatchScoringConfig,
} from './types.js';

// ============================================================================
// BATCH TOOL SCORING (Semantic Router Optimization)
// ============================================================================

/**
 * Input format matching ScoringWorker's ToolProfile interface.
 */
interface ToolProfileForScoring {
  toolId: string;
  patterns: RegExp[];
  keywords: Map<string, number>;
  embedding: Float32Array | number[] | null;
}

/**
 * Scoring result matching ScoringWorker's result format.
 */
export interface DetailedScoringResult {
  toolId: string;
  score: number;
  patternScore: number;
  keywordScore: number;
  embeddingScore: number;
  matchedPatterns: string[];
  matchedKeywords: string[];
}

/**
 * Convert ToolProfile to Rust-compatible ToolProfileInput format.
 */
function convertToRustProfile(
  profile: ToolProfileForScoring,
  embeddingIndex: number | undefined
): ToolProfileInput {
  const keywordsFlat: string[] = [];
  const keywordWeightsFlat: number[] = [];

  for (const [keyword, weight] of profile.keywords.entries()) {
    keywordsFlat.push(keyword);
    keywordWeightsFlat.push(weight);
  }

  return {
    toolId: profile.toolId,
    patterns: profile.patterns.map((p) => p.source),
    keywordsFlat,
    keywordWeightsFlat,
    hasEmbedding: profile.embedding !== null,
    embeddingIndex,
  };
}

/**
 * Batch tool scoring optimized with Rust SIMD and parallel processing.
 *
 * Performance characteristics:
 * - Rust: ~0.5-2ms for 50 tools (parallel regex + SIMD embeddings)
 *
 * @param query - User query to match against tools
 * @param profiles - Array of tool profiles with patterns, keywords, embeddings
 * @param queryEmbedding - Query embedding vector (optional)
 * @param config - Scoring weights and thresholds
 * @returns Sorted array of scoring results
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchScoreToolsOptimized(
  query: string,
  profiles: ToolProfileForScoring[],
  queryEmbedding: Float32Array | number[] | null = null,
  config: Partial<BatchScoringConfig> = {}
): DetailedScoringResult[] {
  const start = performance.now();

  const fullConfig: BatchScoringConfig = {
    patternWeight: config.patternWeight ?? 0.4,
    keywordWeight: config.keywordWeight ?? 0.3,
    embeddingWeight: config.embeddingWeight ?? 0.3,
    earlyTerminationThreshold: config.earlyTerminationThreshold ?? 0.95,
    minScoreThreshold: config.minScoreThreshold ?? 0.05,
  };

  const perf = loadRustPerf();

  if (!perf.batchScoreTools) {
    throw new NativeRustAcceleratorUnavailableError('batchScoreTools function not found');
  }

  // Build flat embedding array for tools that have embeddings
  const embeddingsWithIndex: Array<{ index: number; embedding: number[] }> = [];
  for (let i = 0; i < profiles.length; i++) {
    if (profiles[i].embedding) {
      const emb = profiles[i].embedding!;
      embeddingsWithIndex.push({
        index: i,
        embedding: Array.isArray(emb) ? emb : Array.from(emb),
      });
    }
  }

  // Convert profiles to Rust format
  const rustProfiles: ToolProfileInput[] = profiles.map((p, i) => {
    const embIdx = embeddingsWithIndex.findIndex((e) => e.index === i);
    return convertToRustProfile(p, embIdx >= 0 ? embIdx : undefined);
  });

  // Build flat embeddings array
  let toolEmbeddings: Float32Array | null = null;
  let embeddingDim: number | null = null;
  if (embeddingsWithIndex.length > 0) {
    embeddingDim = embeddingsWithIndex[0].embedding.length;
    toolEmbeddings = new Float32Array(embeddingsWithIndex.length * embeddingDim);
    for (let i = 0; i < embeddingsWithIndex.length; i++) {
      const emb = embeddingsWithIndex[i].embedding;
      for (let j = 0; j < embeddingDim; j++) {
        toolEmbeddings[i * embeddingDim + j] = emb[j];
      }
    }
  }

  const queryEmbF32 = queryEmbedding
    ? queryEmbedding instanceof Float32Array
      ? queryEmbedding
      : new Float32Array(queryEmbedding)
    : null;

  const rustResults = perf.batchScoreTools(
    query,
    rustProfiles,
    queryEmbF32,
    toolEmbeddings,
    embeddingDim,
    fullConfig
  );

  const elapsed = performance.now() - start;
  metrics.nativeCalls++;
  metrics.totalTimeMs += elapsed;
  metrics.totalBatchItems += profiles.length;

  return rustResults.map((r) => ({
    toolId: r.toolId,
    score: r.score,
    patternScore: r.patternScore,
    keywordScore: r.keywordScore,
    embeddingScore: r.embeddingScore,
    matchedPatterns: [],
    matchedKeywords: [],
  }));
}

/**
 * Check if batch tool scoring can use the native Rust path.
 */
export function isBatchToolScoringNativeAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.batchScoreTools !== undefined;
}

/**
 * Check if the native path should be used for a given operation.
 */
export function shouldUseNativePath(
  operation: 'batch' | 'pairwise' | 'topk' | 'toolScoring',
  itemCount: number
): boolean {
  if (!isRustAvailable()) return false;

  const useNative = process.env.USE_NATIVE_EMBEDDINGS !== 'false';
  if (!useNative) return false;

  const thresholds: Record<string, number> = {
    batch: 5,
    pairwise: 10,
    topk: 10,
    toolScoring: 5,
  };

  return itemCount >= (thresholds[operation] ?? 5);
}

/**
 * Log accelerator status for debugging.
 */
export function logAcceleratorStatus(): void {
  const info = getRustInfo();
  const m = getAcceleratorMetrics();

  if (info.available) {
    log.info(
      {
        rustAvailable: true,
        version: info.version,
        threads: info.threads,
        totalCalls: m.nativeCalls,
        avgTimeMs: m.avgTimeMs.toFixed(3),
        totalBatchItems: m.totalBatchItems,
      },
      '🦀 Rust accelerator status'
    );
  } else {
    log.error(
      {
        rustAvailable: false,
        error: getRustLoadError(),
      },
      '❌ Rust accelerator unavailable'
    );
  }
}

