/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Combines ranked results from multiple retrieval sources (e.g., BM25 + vector search).
 * RRF is a simple but effective method that doesn't require score normalization.
 *
 * RRF Formula:
 * score(d) = Σ 1 / (k + rank(d))
 *
 * Where:
 * - k is a constant (typically 60) that controls the impact of outlier rankings
 * - rank(d) is the position of document d in each ranked list (1-indexed)
 *
 * Benefits:
 * - No score normalization needed (uses ranks, not scores)
 * - Simple and robust
 * - Works well when combining different retrieval methods
 *
 * @module memory/retrieval/rank-fusion
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RankFusion' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default k parameter for RRF */
const DEFAULT_K = 60;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Ranked item from a single retrieval source
 */
export interface RankedItem<T = unknown> {
  id: string;
  score: number;
  rank?: number;
  data: T;
  source: string;
}

/**
 * Fused result after combining multiple sources
 */
export interface FusedResult<T = unknown> {
  id: string;
  /** Combined RRF score */
  fusedScore: number;
  /** Contributions from each source */
  sourceContributions: Record<string, { rank: number; rrfScore: number }>;
  /** Number of sources that returned this item */
  sourceCount: number;
  /** Original data from the first (highest-scoring) source */
  data: T;
  /** All source IDs that returned this item */
  sources: string[];
}

/**
 * Options for rank fusion
 */
export interface RankFusionOptions {
  /** RRF k parameter (default: 60) */
  k?: number;
  /** Weights for each source (default: equal weights) */
  sourceWeights?: Record<string, number>;
  /** Maximum results to return */
  topK?: number;
  /** Minimum fused score threshold */
  minScore?: number;
  /** Require item to appear in minimum number of sources */
  minSources?: number;
}

// ============================================================================
// RECIPROCAL RANK FUSION
// ============================================================================

/**
 * Perform Reciprocal Rank Fusion on multiple ranked lists
 *
 * @param rankedLists - Map of source name to ranked results
 * @param options - Fusion options
 * @returns Fused results sorted by combined score
 */
export function reciprocalRankFusion<T>(
  rankedLists: Map<string, RankedItem<T>[]>,
  options: RankFusionOptions = {}
): FusedResult<T>[] {
  const { k = DEFAULT_K, sourceWeights = {}, topK = 100, minScore = 0, minSources = 1 } = options;

  // Build a map of item ID -> contributions from each source
  const fusionMap = new Map<
    string,
    {
      data: T;
      contributions: Record<string, { rank: number; rrfScore: number }>;
      sources: string[];
    }
  >();

  // Process each ranked list
  const rankedListEntries = Array.from(rankedLists.entries());
  for (const [source, items] of rankedListEntries) {
    const weight = sourceWeights[source] ?? 1.0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rank = i + 1; // 1-indexed rank
      const rrfScore = weight / (k + rank);

      if (!fusionMap.has(item.id)) {
        fusionMap.set(item.id, {
          data: item.data,
          contributions: {},
          sources: [],
        });
      }

      const entry = fusionMap.get(item.id)!;
      entry.contributions[source] = { rank, rrfScore };
      entry.sources.push(source);
    }
  }

  // Calculate fused scores
  const results: FusedResult<T>[] = [];

  const fusionMapEntries = Array.from(fusionMap.entries());
  for (const [id, entry] of fusionMapEntries) {
    // Sum RRF contributions from all sources
    let fusedScore = 0;
    const contributionValues = Object.values(entry.contributions) as Array<{
      rank: number;
      rrfScore: number;
    }>;
    for (const contribution of contributionValues) {
      fusedScore += contribution.rrfScore;
    }

    const sourceCount = entry.sources.length;

    // Apply filters
    if (fusedScore < minScore) continue;
    if (sourceCount < minSources) continue;

    results.push({
      id,
      fusedScore,
      sourceContributions: entry.contributions,
      sourceCount,
      data: entry.data,
      sources: entry.sources,
    });
  }

  // Sort by fused score (descending) and return top K
  results.sort((a, b) => b.fusedScore - a.fusedScore);
  return results.slice(0, topK);
}

/**
 * Convenience function for combining BM25 and vector search results
 */
export function fuseSearchResults<T extends { id: string; score: number }>(
  bm25Results: T[],
  vectorResults: T[],
  options: RankFusionOptions & {
    bm25Weight?: number;
    vectorWeight?: number;
  } = {}
): FusedResult<T>[] {
  const { bm25Weight = 0.4, vectorWeight = 0.6, ...fusionOptions } = options;

  const rankedLists = new Map<string, RankedItem<T>[]>();

  rankedLists.set(
    'bm25',
    bm25Results.map((item, i) => ({
      id: item.id,
      score: item.score,
      rank: i + 1,
      data: item,
      source: 'bm25',
    }))
  );

  rankedLists.set(
    'vector',
    vectorResults.map((item, i) => ({
      id: item.id,
      score: item.score,
      rank: i + 1,
      data: item,
      source: 'vector',
    }))
  );

  return reciprocalRankFusion(rankedLists, {
    ...fusionOptions,
    sourceWeights: {
      bm25: bm25Weight,
      vector: vectorWeight,
    },
  });
}

// ============================================================================
// WEIGHTED SCORE FUSION (Alternative)
// ============================================================================

/**
 * Simple weighted score fusion
 *
 * Unlike RRF, this uses normalized scores directly.
 * Useful when scores from different sources are comparable.
 */
export function weightedScoreFusion<T extends { id: string; score: number }>(
  sources: Array<{ name: string; results: T[]; weight: number }>,
  options: { topK?: number; minScore?: number; normalizeScores?: boolean } = {}
): FusedResult<T>[] {
  const { topK = 100, minScore = 0, normalizeScores = true } = options;

  // Normalize scores if requested
  const normalizedSources = sources.map((source) => {
    if (!normalizeScores || source.results.length === 0) {
      return source;
    }

    const maxScore = Math.max(...source.results.map((r) => r.score));
    const minSourceScore = Math.min(...source.results.map((r) => r.score));
    const range = maxScore - minSourceScore;

    if (range === 0) return source;

    return {
      ...source,
      results: source.results.map((r) => ({
        ...r,
        score: (r.score - minSourceScore) / range,
      })),
    };
  });

  // Build fusion map
  const fusionMap = new Map<
    string,
    {
      data: T;
      weightedScore: number;
      contributions: Record<string, { score: number; weightedScore: number }>;
      sources: string[];
    }
  >();

  for (const source of normalizedSources) {
    for (const item of source.results) {
      const weightedScore = item.score * source.weight;

      if (!fusionMap.has(item.id)) {
        fusionMap.set(item.id, {
          data: item,
          weightedScore: 0,
          contributions: {},
          sources: [],
        });
      }

      const entry = fusionMap.get(item.id)!;
      entry.weightedScore += weightedScore;
      entry.contributions[source.name] = {
        score: item.score,
        weightedScore,
      };
      entry.sources.push(source.name);
    }
  }

  // Convert to results
  const results: FusedResult<T>[] = [];

  const fusionMapEntries2 = Array.from(fusionMap.entries());
  for (const [id, entry] of fusionMapEntries2) {
    if (entry.weightedScore < minScore) continue;

    const contributionEntries = Object.entries(entry.contributions) as Array<
      [string, { score: number; weightedScore: number }]
    >;
    results.push({
      id,
      fusedScore: entry.weightedScore,
      sourceContributions: Object.fromEntries(
        contributionEntries.map(([source, { weightedScore }]) => [
          source,
          { rank: 0, rrfScore: weightedScore }, // Use weighted score as RRF score for compatibility
        ])
      ),
      sourceCount: entry.sources.length,
      data: entry.data,
      sources: entry.sources,
    });
  }

  // Sort by fused score and return top K
  results.sort((a, b) => b.fusedScore - a.fusedScore);
  return results.slice(0, topK);
}

// ============================================================================
// INTERLEAVING (Alternative)
// ============================================================================

/**
 * Team Draft Interleaving
 *
 * Alternates between ranked lists, picking the highest-ranked unpicked item.
 * Useful for A/B testing and fair combination.
 */
export function teamDraftInterleave<T extends { id: string }>(
  listA: T[],
  listB: T[],
  maxResults: number = 20
): T[] {
  const result: T[] = [];
  const seen = new Set<string>();

  let indexA = 0;
  let indexB = 0;
  let useA = true;

  while (result.length < maxResults && (indexA < listA.length || indexB < listB.length)) {
    // Pick from the current list, skipping already-seen items
    const list = useA ? listA : listB;
    let index = useA ? indexA : indexB;

    while (index < list.length && seen.has(list[index].id)) {
      index++;
    }

    if (index < list.length) {
      const item = list[index];
      result.push(item);
      seen.add(item.id);
    }

    // Update indices
    if (useA) {
      indexA = index + 1;
    } else {
      indexB = index + 1;
    }

    // Alternate lists
    useA = !useA;
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DEFAULT_K };
