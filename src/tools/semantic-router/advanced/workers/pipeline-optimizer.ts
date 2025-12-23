/**
 * Pipeline Optimizer - Orchestrates optimized routing pipeline
 *
 * Coordinates all workers and implements:
 * 1. Speculative execution (parallel pattern + embedding paths)
 * 2. Request coalescing (batch similar requests)
 * 3. Predictive pre-fetching (anticipate next queries)
 * 4. Adaptive timeout (adjust based on context)
 *
 * LATENCY TARGETS:
 * - p50: <20ms (cache hit + pattern match)
 * - p95: <100ms (full embedding path)
 * - p99: <200ms (cold start)
 *
 * @module tools/semantic-router/advanced/workers/pipeline-optimizer
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getEmbeddingWorker } from './embedding-worker.js';
import { getScoringWorker } from './scoring-worker.js';
import type { EmbeddingVector } from '../../types.js';

const log = createLogger({ module: 'semantic-router:pipeline-optimizer' });

// ============================================================================
// TYPES
// ============================================================================

interface PipelineRequest {
  id: string;
  query: string;
  userId?: string;
  context?: {
    time?: Date;
    recentTools?: string[];
    conversationTopic?: string;
  };
  timestamp: number;
}

interface PipelineResult {
  request: PipelineRequest;
  bestMatch: {
    toolId: string;
    confidence: number;
    matchPath: 'pattern' | 'keyword' | 'embedding' | 'combined';
  } | null;
  alternatives: Array<{ toolId: string; confidence: number }>;
  latencyMs: number;
  cacheHit: boolean;
}

interface PipelineConfig {
  speculativeExecution: boolean;
  requestCoalescing: boolean;
  predictivePrefetch: boolean;
  maxCoalesceDelayMs: number;
  patternOnlyThreshold: number;
  embeddingThreshold: number;
}

interface PipelineStats {
  totalRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  cacheHitRate: number;
  patternMatchRate: number;
  embeddingMatchRate: number;
}

// ============================================================================
// PIPELINE OPTIMIZER
// ============================================================================

export class PipelineOptimizer {
  private config: PipelineConfig = {
    speculativeExecution: true,
    requestCoalescing: true,
    predictivePrefetch: true,
    maxCoalesceDelayMs: 10,
    patternOnlyThreshold: 0.9,
    embeddingThreshold: 0.7,
  };

  // Request coalescing
  private coalescingQueue = new Map<
    string,
    {
      requests: PipelineRequest[];
      timeout: NodeJS.Timeout;
    }
  >();

  // Stats tracking
  private latencies: number[] = [];
  private readonly maxLatencyHistory = 1000;
  private totalRequests = 0;
  private cacheHits = 0;
  private patternMatches = 0;
  private embeddingMatches = 0;

  // Prediction state
  private recentQueries: string[] = [];
  private readonly maxRecentQueries = 50;

  constructor(customConfig?: Partial<PipelineConfig>) {
    if (customConfig) {
      Object.assign(this.config, customConfig);
    }
  }

  /**
   * Route query through optimized pipeline
   */
  async route(request: PipelineRequest): Promise<PipelineResult> {
    const startTime = Date.now();
    this.totalRequests++;

    // Track for prediction
    this.trackQuery(request.query);

    // Request coalescing: if same query came in recently, batch them
    if (this.config.requestCoalescing) {
      const coalesced = this.tryCoalesce(request);
      if (coalesced) {
        return coalesced;
      }
    }

    // Speculative execution: run pattern and embedding paths in parallel
    const result = this.config.speculativeExecution
      ? await this.routeSpeculative(request)
      : await this.routeSequential(request);

    // Record latency
    const latencyMs = Date.now() - startTime;
    this.recordLatency(latencyMs);

    // Predictive pre-fetch for likely follow-up queries
    if (this.config.predictivePrefetch && result.bestMatch) {
      this.prefetchRelated(result.bestMatch.toolId);
    }

    return {
      ...result,
      latencyMs,
    };
  }

  /**
   * Batch route multiple queries
   */
  async routeBatch(requests: PipelineRequest[]): Promise<PipelineResult[]> {
    // Batch embed all queries
    const queries = requests.map((r) => r.query);
    const embeddings = await getEmbeddingWorker().getEmbeddings(queries);

    // Score all in parallel
    const results = await Promise.all(
      requests.map(async (request, i) => {
        const startTime = Date.now();
        this.totalRequests++;

        const scoringResults = await getScoringWorker().scoreAll(request.query, embeddings[i], 5);

        const latencyMs = Date.now() - startTime;
        this.recordLatency(latencyMs);

        const bestMatch = scoringResults[0]
          ? {
              toolId: scoringResults[0].toolId,
              confidence: scoringResults[0].score,
              matchPath: this.determineMatchPath(scoringResults[0]) as
                | 'pattern'
                | 'keyword'
                | 'embedding'
                | 'combined',
            }
          : null;

        return {
          request,
          bestMatch,
          alternatives: scoringResults.slice(1, 4).map((r) => ({
            toolId: r.toolId,
            confidence: r.score,
          })),
          latencyMs,
          cacheHit: false,
        };
      })
    );

    return results;
  }

  /**
   * Get pipeline statistics
   */
  getStats(): PipelineStats {
    const sorted = [...this.latencies].sort((a, b) => a - b);

    return {
      totalRequests: this.totalRequests,
      avgLatencyMs: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      p50LatencyMs: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : 0,
      p95LatencyMs: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0,
      cacheHitRate: this.totalRequests > 0 ? this.cacheHits / this.totalRequests : 0,
      patternMatchRate: this.totalRequests > 0 ? this.patternMatches / this.totalRequests : 0,
      embeddingMatchRate: this.totalRequests > 0 ? this.embeddingMatches / this.totalRequests : 0,
    };
  }

  /**
   * Warm up the pipeline with common queries
   */
  async warmup(queries: string[]): Promise<void> {
    log.info({ count: queries.length }, 'Warming up pipeline');

    // Pre-compute embeddings
    getEmbeddingWorker().prewarm(queries);

    // Pre-score top queries
    for (const query of queries.slice(0, 20)) {
      const embedding = await getEmbeddingWorker().getEmbedding(query, 'low');
      await getScoringWorker().scoreAll(query, embedding, 3);
    }

    log.info('Pipeline warmup complete');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Speculative execution: pattern matching and embedding scoring in parallel
   */
  private async routeSpeculative(
    request: PipelineRequest
  ): Promise<Omit<PipelineResult, 'latencyMs'>> {
    // Start embedding fetch (async, may be cached)
    const embeddingPromise = getEmbeddingWorker().getEmbedding(request.query, 'normal');

    // Meanwhile, try fast incremental scoring
    const incrementalResult = await getScoringWorker().scoreIncremental(request.query, null);

    // If fast pattern match is definitive, return immediately
    if (
      incrementalResult.fastMatches.length > 0 &&
      incrementalResult.fastMatches[0].score >= this.config.patternOnlyThreshold
    ) {
      this.patternMatches++;
      this.cacheHits++; // Pattern matches don't need embedding

      // Cancel embedding fetch by not awaiting (it will still cache)
      return {
        request,
        bestMatch: {
          toolId: incrementalResult.fastMatches[0].toolId,
          confidence: incrementalResult.fastMatches[0].score,
          matchPath: 'pattern',
        },
        alternatives: incrementalResult.fastMatches.slice(1, 4).map((r) => ({
          toolId: r.toolId,
          confidence: r.score,
        })),
        cacheHit: true,
      };
    }

    // Wait for embedding and do full scoring
    const embedding = await embeddingPromise;
    const fullResults = await getScoringWorker().scoreAll(request.query, embedding, 5);

    if (fullResults.length > 0) {
      this.embeddingMatches++;
    }

    const bestMatch = fullResults[0]
      ? {
          toolId: fullResults[0].toolId,
          confidence: fullResults[0].score,
          matchPath: this.determineMatchPath(fullResults[0]) as
            | 'pattern'
            | 'keyword'
            | 'embedding'
            | 'combined',
        }
      : null;

    return {
      request,
      bestMatch,
      alternatives: fullResults.slice(1, 4).map((r) => ({
        toolId: r.toolId,
        confidence: r.score,
      })),
      cacheHit: false,
    };
  }

  /**
   * Sequential execution: traditional pattern → keyword → embedding
   */
  private async routeSequential(
    request: PipelineRequest
  ): Promise<Omit<PipelineResult, 'latencyMs'>> {
    const embedding = await getEmbeddingWorker().getEmbedding(request.query, 'normal');
    const results = await getScoringWorker().scoreAll(request.query, embedding, 5);

    const bestMatch = results[0]
      ? {
          toolId: results[0].toolId,
          confidence: results[0].score,
          matchPath: this.determineMatchPath(results[0]) as
            | 'pattern'
            | 'keyword'
            | 'embedding'
            | 'combined',
        }
      : null;

    return {
      request,
      bestMatch,
      alternatives: results.slice(1, 4).map((r) => ({
        toolId: r.toolId,
        confidence: r.score,
      })),
      cacheHit: false,
    };
  }

  private determineMatchPath(result: {
    patternScore: number;
    keywordScore: number;
    embeddingScore: number;
  }): string {
    const { patternScore, keywordScore, embeddingScore } = result;

    if (patternScore > keywordScore && patternScore > embeddingScore) {
      return 'pattern';
    }
    if (keywordScore > embeddingScore) {
      return 'keyword';
    }
    if (embeddingScore > 0.5) {
      return 'embedding';
    }
    return 'combined';
  }

  /**
   * Request coalescing: batch identical queries within a time window
   */
  private tryCoalesce(request: PipelineRequest): Promise<PipelineResult> | null {
    const key = request.query.toLowerCase().trim();

    const existing = this.coalescingQueue.get(key);
    if (existing) {
      // Add to existing batch
      existing.requests.push(request);

      // Return promise that will resolve with same result
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const result = this.getCoalescedResult(key);
          if (result) {
            clearInterval(checkInterval);
            resolve(result);
          }
        }, 5);

        // Timeout after max delay
        setTimeout(() => {
          clearInterval(checkInterval);
        }, this.config.maxCoalesceDelayMs * 2);
      });
    }

    // Start new coalescing window
    this.coalescingQueue.set(key, {
      requests: [request],
      timeout: setTimeout(() => {
        this.processCoalescedBatch(key);
      }, this.config.maxCoalesceDelayMs),
    });

    return null;
  }

  private coalescedResults = new Map<string, PipelineResult>();

  private async processCoalescedBatch(key: string): Promise<void> {
    const batch = this.coalescingQueue.get(key);
    if (!batch) return;

    this.coalescingQueue.delete(key);

    // Process once
    const firstRequest = batch.requests[0];
    const result = await this.routeSpeculative(firstRequest);

    this.coalescedResults.set(key, {
      ...result,
      latencyMs: Date.now() - firstRequest.timestamp,
    });

    // Clear after short delay
    setTimeout(() => {
      this.coalescedResults.delete(key);
    }, 100);
  }

  private getCoalescedResult(key: string): PipelineResult | null {
    return this.coalescedResults.get(key) || null;
  }

  /**
   * Predictive pre-fetching based on tool usage patterns
   */
  private prefetchRelated(toolId: string): void {
    // Define common follow-up patterns
    const followUpPatterns: Record<string, string[]> = {
      spotify_play: ['how about something more upbeat', 'pause the music', 'what song is this'],
      calendar_list: ['schedule a meeting', 'delete that event', 'move it to tomorrow'],
      handoff_maya: ['track my habit', 'how am i doing', 'log my meditation'],
      handoff_peter: ['what should i invest in', 'market update', 'portfolio review'],
    };

    const followUps = followUpPatterns[toolId];
    if (followUps) {
      getEmbeddingWorker().prewarm(followUps);
    }
  }

  private trackQuery(query: string): void {
    this.recentQueries.unshift(query);
    if (this.recentQueries.length > this.maxRecentQueries) {
      this.recentQueries.pop();
    }
  }

  private recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxLatencyHistory) {
      this.latencies.shift();
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let optimizerInstance: PipelineOptimizer | null = null;

export function getPipelineOptimizer(): PipelineOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new PipelineOptimizer();
  }
  return optimizerInstance;
}
