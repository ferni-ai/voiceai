/**
 * Scoring Worker - Parallel tool scoring
 *
 * Optimizes tool scoring by:
 * 1. Parallel scoring across multiple tools
 * 2. Early termination when high-confidence match found
 * 3. Incremental scoring (pattern → keyword → embedding)
 * 4. Score caching for repeated queries
 *
 * @module tools/semantic-router/advanced/workers/scoring-worker
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { cosineSimilarity } from '../../embedding-providers.js';
import type { EmbeddingVector } from '../../types.js';

const log = createLogger({ module: 'semantic-router:scoring-worker' });

// ============================================================================
// TYPES
// ============================================================================

interface ToolProfile {
  toolId: string;
  patterns: RegExp[];
  keywords: Map<string, number>;
  embedding: EmbeddingVector | null;
}

interface ScoringResult {
  toolId: string;
  score: number;
  patternScore: number;
  keywordScore: number;
  embeddingScore: number;
  matchedPatterns: string[];
  matchedKeywords: string[];
}

interface ScoringConfig {
  patternWeight: number;
  keywordWeight: number;
  embeddingWeight: number;
  earlyTerminationThreshold: number;
  parallelBatchSize: number;
}

// ============================================================================
// SCORING WORKER
// ============================================================================

export class ScoringWorker {
  private profiles = new Map<string, ToolProfile>();
  private scoreCache = new Map<string, Map<string, ScoringResult>>();
  private readonly maxCacheSize = 5000;

  private config: ScoringConfig = {
    patternWeight: 0.4,
    keywordWeight: 0.3,
    embeddingWeight: 0.3,
    earlyTerminationThreshold: 0.95,
    parallelBatchSize: 10,
  };

  constructor(customConfig?: Partial<ScoringConfig>) {
    if (customConfig) {
      Object.assign(this.config, customConfig);
    }
  }

  /**
   * Register tool profiles for scoring
   */
  registerProfiles(profiles: ToolProfile[]): void {
    for (const profile of profiles) {
      this.profiles.set(profile.toolId, profile);
    }
    log.info({ count: profiles.length }, 'Registered tool profiles');
  }

  /**
   * Score query against all tools - optimized with early termination
   */
  async scoreAll(
    query: string,
    queryEmbedding: EmbeddingVector | null,
    topK: number = 5
  ): Promise<ScoringResult[]> {
    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = this.tokenize(normalizedQuery);

    // Check cache
    const cacheKey = normalizedQuery;
    const cached = this.getCachedScores(cacheKey);
    if (cached) {
      return cached.slice(0, topK);
    }

    const results: ScoringResult[] = [];
    let foundHighConfidence = false;

    // Process in batches for better parallelization
    const toolIds = Array.from(this.profiles.keys());
    const batches = this.createBatches(toolIds, this.config.parallelBatchSize);

    for (const batch of batches) {
      // Score batch in parallel
      const batchResults = await Promise.all(
        batch.map((toolId) => this.scoreOne(toolId, normalizedQuery, queryTokens, queryEmbedding))
      );

      results.push(...batchResults.filter((r): r is ScoringResult => r !== null));

      // Early termination if we found a very high confidence match
      const topResult = results.sort((a, b) => b.score - a.score)[0];
      if (topResult && topResult.score >= this.config.earlyTerminationThreshold) {
        foundHighConfidence = true;
        break;
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Cache results
    this.cacheScores(cacheKey, results);

    if (foundHighConfidence) {
      log.debug(
        { query, topTool: results[0]?.toolId },
        'Early termination - high confidence match'
      );
    }

    return results.slice(0, topK);
  }

  /**
   * Incremental scoring - fast path first, then deeper scoring
   */
  async scoreIncremental(
    query: string,
    queryEmbedding: EmbeddingVector | null
  ): Promise<{
    fastMatches: ScoringResult[];
    deepMatches: ScoringResult[];
    totalTimeMs: number;
  }> {
    const startTime = Date.now();
    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = this.tokenize(normalizedQuery);

    // Phase 1: Fast pattern matching only
    const fastMatches: ScoringResult[] = [];
    const profileEntries = Array.from(this.profiles.entries());

    for (const [toolId, profile] of profileEntries) {
      const patternScore = this.scorePatterns(normalizedQuery, profile.patterns);

      if (patternScore > 0) {
        fastMatches.push({
          toolId,
          score: patternScore,
          patternScore,
          keywordScore: 0,
          embeddingScore: 0,
          matchedPatterns: this.getMatchedPatterns(normalizedQuery, profile.patterns),
          matchedKeywords: [],
        });
      }
    }

    // If we have high-confidence pattern matches, return early
    fastMatches.sort((a, b) => b.score - a.score);
    if (fastMatches.length > 0 && fastMatches[0].score >= 0.9) {
      return {
        fastMatches,
        deepMatches: [],
        totalTimeMs: Date.now() - startTime,
      };
    }

    // Phase 2: Deep scoring (keywords + embeddings)
    const deepMatches: ScoringResult[] = [];

    for (const [toolId, profile] of profileEntries) {
      const patternScore = this.scorePatterns(normalizedQuery, profile.patterns);
      const keywordScore = this.scoreKeywords(queryTokens, profile.keywords);
      const embeddingScore =
        queryEmbedding && profile.embedding
          ? cosineSimilarity(queryEmbedding, profile.embedding)
          : 0;

      const combinedScore =
        this.config.patternWeight * patternScore +
        this.config.keywordWeight * keywordScore +
        this.config.embeddingWeight * embeddingScore;

      if (combinedScore > 0.1) {
        deepMatches.push({
          toolId,
          score: combinedScore,
          patternScore,
          keywordScore,
          embeddingScore,
          matchedPatterns: this.getMatchedPatterns(normalizedQuery, profile.patterns),
          matchedKeywords: this.getMatchedKeywords(queryTokens, profile.keywords),
        });
      }
    }

    deepMatches.sort((a, b) => b.score - a.score);

    return {
      fastMatches,
      deepMatches,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get scoring stats
   */
  getStats(): {
    profileCount: number;
    cacheSize: number;
    avgScoreTimeMs: number;
  } {
    return {
      profileCount: this.profiles.size,
      cacheSize: this.scoreCache.size,
      avgScoreTimeMs: 0, // Would need to track this
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async scoreOne(
    toolId: string,
    query: string,
    queryTokens: string[],
    queryEmbedding: EmbeddingVector | null
  ): Promise<ScoringResult | null> {
    const profile = this.profiles.get(toolId);
    if (!profile) return null;

    const patternScore = this.scorePatterns(query, profile.patterns);
    const keywordScore = this.scoreKeywords(queryTokens, profile.keywords);
    const embeddingScore =
      queryEmbedding && profile.embedding ? cosineSimilarity(queryEmbedding, profile.embedding) : 0;

    const combinedScore =
      this.config.patternWeight * patternScore +
      this.config.keywordWeight * keywordScore +
      this.config.embeddingWeight * embeddingScore;

    if (combinedScore < 0.05) return null;

    return {
      toolId,
      score: combinedScore,
      patternScore,
      keywordScore,
      embeddingScore,
      matchedPatterns: this.getMatchedPatterns(query, profile.patterns),
      matchedKeywords: this.getMatchedKeywords(queryTokens, profile.keywords),
    };
  }

  private scorePatterns(query: string, patterns: RegExp[]): number {
    if (patterns.length === 0) return 0;

    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        matchCount++;
      }
    }

    return matchCount / patterns.length;
  }

  private scoreKeywords(queryTokens: string[], keywords: Map<string, number>): number {
    if (keywords.size === 0 || queryTokens.length === 0) return 0;

    let weightSum = 0;
    let matchedWeight = 0;

    const keywordEntries = Array.from(keywords.entries());
    for (const [keyword, weight] of keywordEntries) {
      weightSum += weight;
      if (queryTokens.includes(keyword)) {
        matchedWeight += weight;
      }
    }

    return weightSum > 0 ? matchedWeight / weightSum : 0;
  }

  private getMatchedPatterns(query: string, patterns: RegExp[]): string[] {
    return patterns.filter((p) => p.test(query)).map((p) => p.source);
  }

  private getMatchedKeywords(queryTokens: string[], keywords: Map<string, number>): string[] {
    const matched: string[] = [];
    const keywordKeys = Array.from(keywords.keys());

    for (const keyword of keywordKeys) {
      if (queryTokens.includes(keyword)) {
        matched.push(keyword);
      }
    }

    return matched;
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private getCachedScores(key: string): ScoringResult[] | null {
    const toolScores = this.scoreCache.get(key);
    if (!toolScores) return null;

    return Array.from(toolScores.values());
  }

  private cacheScores(key: string, results: ScoringResult[]): void {
    // Evict if at capacity
    if (this.scoreCache.size >= this.maxCacheSize) {
      const firstKey = this.scoreCache.keys().next().value;
      if (firstKey) this.scoreCache.delete(firstKey);
    }

    const scoreMap = new Map<string, ScoringResult>();
    for (const result of results) {
      scoreMap.set(result.toolId, result);
    }

    this.scoreCache.set(key, scoreMap);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let workerInstance: ScoringWorker | null = null;

export function getScoringWorker(): ScoringWorker {
  if (!workerInstance) {
    workerInstance = new ScoringWorker();
  }
  return workerInstance;
}
