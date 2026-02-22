/**
 * Cross-Encoder Neural Reranking
 *
 * Implements neural reranking using cross-encoder models for high-precision
 * relevance scoring. Cross-encoders process query-document pairs jointly
 * for more accurate relevance assessment than bi-encoders.
 *
 * Architecture:
 * ```
 * Candidate Documents (from hybrid search)
 *        │
 *        ▼
 * ┌─────────────────┐
 * │  Cross-Encoder  │  Query + Doc → Score
 * │    (Lazy Load)  │
 * └─────────────────┘
 *        │
 *        ▼
 *   Reranked Results
 * ```
 *
 * Benefits:
 * - More accurate relevance scoring than bi-encoders
 * - Captures query-document interactions
 * - Works well with hybrid search results
 *
 * Trade-offs:
 * - Slower than bi-encoders (O(n) inference per query)
 * - Only feasible for small candidate sets (top-50)
 *
 * @module memory/retrieval/cross-encoder
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getExtractionModel } from '../../config/gemini-config.js';

const log = createLogger({ module: 'CrossEncoder' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Document to be reranked
 */
export interface RerankDocument {
  id: string;
  text: string;
  /** Original score from first-stage retrieval */
  originalScore?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Reranked result
 */
export interface RerankResult {
  id: string;
  text: string;
  /** Cross-encoder relevance score (0-1) */
  relevanceScore: number;
  /** Original score from first-stage retrieval */
  originalScore?: number;
  /** Score improvement from reranking */
  scoreImprovement: number;
  /** Original rank before reranking */
  originalRank: number;
  /** New rank after reranking */
  newRank: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Cross-encoder options
 */
export interface CrossEncoderOptions {
  /** Model name/path (default: ms-marco-MiniLM) */
  model?: string;
  /** Maximum sequence length (default: 512) */
  maxLength?: number;
  /** Batch size for inference (default: 8) */
  batchSize?: number;
  /** Device to use (default: 'cpu') */
  device?: 'cpu' | 'cuda' | 'auto';
}

/**
 * Reranking options
 */
export interface RerankOptions {
  /** Maximum documents to rerank (default: 50) */
  maxDocuments?: number;
  /** Top K results to return (default: 20) */
  topK?: number;
  /** Minimum relevance score threshold (default: 0.1) */
  minScore?: number;
  /** Whether to use original scores as tiebreaker (default: true) */
  useOriginalScoresForTies?: boolean;
}

/**
 * Cross-encoder metrics
 */
export interface CrossEncoderMetrics {
  /** Number of documents reranked */
  documentsReranked: number;
  /** Inference latency in ms */
  inferenceLatencyMs: number;
  /** Model load latency (if loaded) in ms */
  modelLoadLatencyMs: number;
  /** Average position change */
  avgPositionChange: number;
  /** Number of documents that moved up */
  movedUp: number;
  /** Number of documents that moved down */
  movedDown: number;
}

// ============================================================================
// CROSS-ENCODER PROVIDER INTERFACE
// ============================================================================

/**
 * Abstract interface for cross-encoder implementations.
 * Allows swapping between local models and API-based services.
 */
export interface CrossEncoderProvider {
  /** Initialize/load the model */
  initialize(): Promise<void>;
  /** Check if model is loaded */
  isLoaded(): boolean;
  /** Score a single query-document pair */
  score(query: string, document: string): Promise<number>;
  /** Score multiple query-document pairs */
  scoreBatch(query: string, documents: string[]): Promise<number[]>;
  /** Get provider name */
  getName(): string;
  /** Unload model to free resources */
  unload(): Promise<void>;
}

// ============================================================================
// GEMINI CROSS-ENCODER (API-based)
// ============================================================================

/**
 * Cross-encoder using Gemini API for relevance scoring.
 * More accessible than local models, good for prototyping.
 */
export class GeminiCrossEncoder implements CrossEncoderProvider {
  private isInitialized = false;
  private apiKey: string | null = null;

  getName(): string {
    return getExtractionModel();
  }

  async initialize(): Promise<void> {
    this.apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null;
    if (!this.apiKey) {
      log.warn('Gemini API key not found, cross-encoder disabled');
    }
    this.isInitialized = true;
  }

  isLoaded(): boolean {
    return this.isInitialized && !!this.apiKey;
  }

  async score(query: string, document: string): Promise<number> {
    if (!this.isLoaded()) {
      throw new Error('Gemini cross-encoder not initialized');
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.apiKey!);
      const model = genAI.getGenerativeModel({ model: getExtractionModel() });

      const prompt = `Rate how relevant the following document is to the query on a scale from 0 to 100, where 0 means completely irrelevant and 100 means perfectly relevant. Only respond with a single number.

Query: ${query}

Document: ${document.slice(0, 1000)}

Relevance score (0-100):`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const score = parseInt(responseText, 10);

      if (isNaN(score)) {
        log.debug({ responseText }, 'Invalid score response, defaulting to 50');
        return 0.5;
      }

      return Math.max(0, Math.min(1, score / 100));
    } catch (error) {
      log.warn({ error: String(error) }, 'Gemini scoring failed');
      return 0.5;
    }
  }

  async scoreBatch(query: string, documents: string[]): Promise<number[]> {
    // Gemini API doesn't have native batching, run sequentially
    // (Consider parallel calls with rate limiting for production)
    const scores: number[] = [];
    for (const doc of documents) {
      const score = await this.score(query, doc);
      scores.push(score);
    }
    return scores;
  }

  async unload(): Promise<void> {
    this.isInitialized = false;
    this.apiKey = null;
  }
}

// ============================================================================
// LOCAL CROSS-ENCODER (ONNX-based)
// ============================================================================

/**
 * Local cross-encoder using ONNX Runtime.
 * Not implemented: score/scoreBatch throw. Use GeminiCrossEncoder (getReranker() default)
 * or HeuristicCrossEncoder when no API key. See docs/audits/SRC-ISSUES-AUDIT.md.
 */
export class LocalCrossEncoder implements CrossEncoderProvider {
  private session: unknown = null;
  private tokenizer: unknown = null;
  private modelPath: string;
  private maxLength: number;

  constructor(options: CrossEncoderOptions = {}) {
    this.modelPath = options.model || 'cross-encoder/ms-marco-MiniLM-L-6-v2';
    this.maxLength = options.maxLength || 512;
  }

  getName(): string {
    return this.modelPath;
  }

  async initialize(): Promise<void> {
    // Local ONNX path not implemented. getReranker() uses GeminiCrossEncoder or HeuristicCrossEncoder.
    log.info('Local cross-encoder not implemented, use GeminiCrossEncoder (getReranker default)');
    throw new Error('Local ONNX cross-encoder not implemented');
  }

  isLoaded(): boolean {
    return this.session !== null && this.tokenizer !== null;
  }

  async score(_query: string, _document: string): Promise<number> {
    throw new Error('Local cross-encoder not implemented');
  }

  async scoreBatch(_query: string, _documents: string[]): Promise<number[]> {
    throw new Error('Local cross-encoder not implemented');
  }

  async unload(): Promise<void> {
    this.session = null;
    this.tokenizer = null;
  }
}

// ============================================================================
// HEURISTIC CROSS-ENCODER (Fallback)
// ============================================================================

/**
 * Simple heuristic-based scorer as fallback when neural models unavailable.
 * Uses keyword overlap and positional matching.
 */
export class HeuristicCrossEncoder implements CrossEncoderProvider {
  getName(): string {
    return 'heuristic';
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  isLoaded(): boolean {
    return true; // Always available
  }

  async score(query: string, document: string): Promise<number> {
    const queryTokens = this.tokenize(query);
    const docTokens = this.tokenize(document);

    // Calculate various heuristic signals
    const overlapScore = this.calculateOverlap(queryTokens, docTokens);
    const positionScore = this.calculatePositionalScore(queryTokens, document);
    const lengthPenalty = this.calculateLengthPenalty(document);

    // Weighted combination
    const score = overlapScore * 0.5 + positionScore * 0.3 + lengthPenalty * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  async scoreBatch(query: string, documents: string[]): Promise<number[]> {
    return Promise.all(documents.map((doc) => this.score(query, doc)));
  }

  async unload(): Promise<void> {
    // No cleanup needed
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private calculateOverlap(queryTokens: string[], docTokens: string[]): number {
    const docSet = new Set(docTokens);
    let matches = 0;
    for (const token of queryTokens) {
      if (docSet.has(token)) matches++;
    }
    return queryTokens.length > 0 ? matches / queryTokens.length : 0;
  }

  private calculatePositionalScore(queryTokens: string[], document: string): number {
    const docLower = document.toLowerCase();
    let score = 0;
    const docLength = document.length;

    for (const token of queryTokens) {
      const pos = docLower.indexOf(token);
      if (pos !== -1) {
        // Earlier positions get higher scores
        score += 1 - pos / docLength;
      }
    }

    return queryTokens.length > 0 ? score / queryTokens.length : 0;
  }

  private calculateLengthPenalty(document: string): number {
    // Prefer medium-length documents (100-500 chars)
    const len = document.length;
    if (len < 50) return 0.5;
    if (len < 100) return 0.7;
    if (len < 500) return 1.0;
    if (len < 1000) return 0.9;
    return 0.7;
  }
}

// ============================================================================
// RERANKER
// ============================================================================

/**
 * Document reranker using cross-encoder models
 */
export class Reranker {
  private provider: CrossEncoderProvider;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(provider?: CrossEncoderProvider) {
    this.provider = provider || this.selectBestProvider();
  }

  /**
   * Select the best available provider
   */
  private selectBestProvider(): CrossEncoderProvider {
    // Try providers in order of preference
    const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      log.info('Using Gemini cross-encoder');
      return new GeminiCrossEncoder();
    }

    // Fall back to heuristic
    log.info('Using heuristic cross-encoder (no API key found)');
    return new HeuristicCrossEncoder();
  }

  /**
   * Initialize the reranker (lazy loading)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      await this.provider.initialize();
      this.isInitialized = true;
      log.info({ provider: this.provider.getName() }, 'Reranker initialized');
    })();

    return this.initializationPromise;
  }

  /**
   * Rerank documents based on relevance to query
   */
  async rerank(
    query: string,
    documents: RerankDocument[],
    options: RerankOptions = {}
  ): Promise<{ results: RerankResult[]; metrics: CrossEncoderMetrics }> {
    const startTime = Date.now();
    const modelLoadStart = Date.now();

    // Lazy initialize
    await this.initialize();

    const modelLoadLatencyMs = Date.now() - modelLoadStart;
    const {
      maxDocuments = 50,
      topK = 20,
      minScore = 0.1,
      useOriginalScoresForTies = true,
    } = options;

    // Limit documents to rerank
    const docsToRerank = documents.slice(0, maxDocuments);

    // Score all documents
    const inferenceStart = Date.now();
    const scores = await this.provider.scoreBatch(
      query,
      docsToRerank.map((d) => d.text)
    );
    const inferenceLatencyMs = Date.now() - inferenceStart;

    // Build results with scores
    const results: RerankResult[] = docsToRerank.map((doc, i) => ({
      id: doc.id,
      text: doc.text,
      relevanceScore: scores[i],
      originalScore: doc.originalScore,
      scoreImprovement: scores[i] - (doc.originalScore || 0),
      originalRank: i + 1,
      newRank: 0, // Will be set after sorting
      metadata: doc.metadata,
    }));

    // Sort by relevance score (use original score as tiebreaker if enabled)
    results.sort((a, b) => {
      const scoreDiff = b.relevanceScore - a.relevanceScore;
      if (scoreDiff !== 0 || !useOriginalScoresForTies) return scoreDiff;
      return (b.originalScore || 0) - (a.originalScore || 0);
    });

    // Assign new ranks and calculate metrics
    let movedUp = 0;
    let movedDown = 0;
    let totalPositionChange = 0;

    results.forEach((r, i) => {
      r.newRank = i + 1;
      const positionChange = r.originalRank - r.newRank;
      totalPositionChange += Math.abs(positionChange);
      if (positionChange > 0) movedUp++;
      if (positionChange < 0) movedDown++;
    });

    // Filter by minimum score and take topK
    const filteredResults = results.filter((r) => r.relevanceScore >= minScore).slice(0, topK);

    const metrics: CrossEncoderMetrics = {
      documentsReranked: docsToRerank.length,
      inferenceLatencyMs,
      modelLoadLatencyMs,
      avgPositionChange: results.length > 0 ? totalPositionChange / results.length : 0,
      movedUp,
      movedDown,
    };

    log.debug(
      {
        query: query.slice(0, 50),
        docsReranked: docsToRerank.length,
        resultsReturned: filteredResults.length,
        avgPositionChange: metrics.avgPositionChange.toFixed(2),
        inferenceMs: inferenceLatencyMs,
        totalMs: Date.now() - startTime,
      },
      '🔄 Reranking completed'
    );

    return { results: filteredResults, metrics };
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.provider.getName();
  }

  /**
   * Check if reranker is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.provider.isLoaded();
  }

  /**
   * Unload to free resources
   */
  async unload(): Promise<void> {
    await this.provider.unload();
    this.isInitialized = false;
    this.initializationPromise = null;
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

let rerankerInstance: Reranker | null = null;

/**
 * Get or create the reranker singleton
 */
export function getReranker(): Reranker {
  if (!rerankerInstance) {
    rerankerInstance = new Reranker();
  }
  return rerankerInstance;
}

/**
 * Convenience function to rerank documents
 */
export async function rerankDocuments(
  query: string,
  documents: RerankDocument[],
  options?: RerankOptions
): Promise<RerankResult[]> {
  const reranker = getReranker();
  const { results } = await reranker.rerank(query, documents, options);
  return results;
}

/**
 * Convenience function to rerank hybrid search results
 */
export async function rerankHybridResults<T extends { id: string; text: string; score: number }>(
  query: string,
  results: T[],
  options?: RerankOptions
): Promise<Array<T & { relevanceScore: number; originalRank: number; newRank: number }>> {
  const documents: RerankDocument[] = results.map((r) => ({
    id: r.id,
    text: r.text,
    originalScore: r.score,
    metadata: r as Record<string, unknown>,
  }));

  const reranked = await rerankDocuments(query, documents, options);

  return reranked.map((r) => ({
    ...(r.metadata as T),
    relevanceScore: r.relevanceScore,
    originalRank: r.originalRank,
    newRank: r.newRank,
  }));
}

// ============================================================================
// EXPORTS (classes exported inline above)
// ============================================================================
