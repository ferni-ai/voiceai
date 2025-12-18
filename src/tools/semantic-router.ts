/**
 * Semantic Tool Router
 *
 * Uses embeddings to intelligently route user requests to the most relevant tools.
 * This reduces the number of tools shown to the LLM while ensuring the right tool is available.
 *
 * Features:
 * - Pre-compute embeddings for all tool descriptions
 * - Real-time semantic similarity matching
 * - Dynamic tool set construction based on user intent
 * - Caching for performance
 * - Optional OpenAI embeddings for production quality
 */

import { getLogger } from '../utils/safe-logger.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { toolRegistry } from './registry/index.js';
import type { ToolDefinition, ToolDomain, Tool, ToolContext } from './registry/types.js';

// ============================================================================
// EMBEDDER INTERFACE
// ============================================================================

export interface Embedder {
  /** Build vocabulary/initialize the embedder */
  initialize: (descriptions: string[]) => Promise<void>;
  /** Generate embedding for text */
  embed: (text: string) => Promise<number[]>;
  /** Calculate similarity between two vectors */
  similarity: (a: number[], b: number[]) => number;
  /** Name of the embedder for logging */
  name: string;
}

// ============================================================================
// TYPES
// ============================================================================

export interface ToolEmbedding {
  toolId: string;
  domain: ToolDomain;
  description: string;
  embedding: number[];
  keywords: string[];
}

export interface SemanticMatch {
  toolId: string;
  domain: ToolDomain;
  similarity: number;
  description: string;
}

export interface RouterConfig {
  /** Similarity threshold for including a tool (0-1) */
  similarityThreshold: number;
  /** Maximum tools to return */
  maxTools: number;
  /** Always include these domains regardless of similarity */
  alwaysIncludeDomains: ToolDomain[];
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
}

// ============================================================================
// SIMPLE TF-IDF EMBEDDER (Default, no API required)
// ============================================================================

/**
 * Simple TF-IDF-like embedding for tool descriptions.
 * Fast and works offline - good for development and low-latency scenarios.
 */
class TfIdfEmbedder implements Embedder {
  name = 'TF-IDF';
  private vocabulary = new Map<string, number>();
  private idf = new Map<string, number>();
  private documentCount = 0;

  async initialize(descriptions: string[]): Promise<void> {
    this.documentCount = descriptions.length;
    const documentFrequency = new Map<string, number>();

    for (const desc of descriptions) {
      const words = this.tokenize(desc);
      const uniqueWords = new Set(words);

      for (const word of uniqueWords) {
        documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
        if (!this.vocabulary.has(word)) {
          this.vocabulary.set(word, this.vocabulary.size);
        }
      }
    }

    for (const [word, df] of documentFrequency) {
      this.idf.set(word, Math.log(this.documentCount / (1 + df)));
    }

    getLogger().info({ vocabularySize: this.vocabulary.size }, '📊 TF-IDF embedder initialized');
  }

  async embed(text: string): Promise<number[]> {
    const words = this.tokenize(text);
    const termFrequency = new Map<string, number>();

    for (const word of words) {
      termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
    }

    const vector = new Array(this.vocabulary.size).fill(0);

    for (const [word, tf] of termFrequency) {
      const idx = this.vocabulary.get(word);
      if (idx !== undefined) {
        const idf = this.idf.get(word) || 0;
        vector[idx] = tf * idf;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  similarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .filter((word) => !STOP_WORDS.has(word));
  }
}

// ============================================================================
// GOOGLE/VERTEX AI EMBEDDER (Production quality)
// ============================================================================

/**
 * Google AI or Vertex AI-powered embeddings for production quality semantic matching.
 * Uses the existing embeddings module which supports:
 * - Google AI (text-embedding-004) via API key
 * - Vertex AI (gemini-embedding-001) via service account
 * - OpenAI as fallback
 *
 * Set GOOGLE_API_KEY for Google AI or deploy on GCP with service account for Vertex AI.
 */
class GoogleAIEmbedder implements Embedder {
  name = 'Google AI';
  private cache = new Map<string, number[]>();
  private provider: import('../memory/embeddings.js').EmbeddingProvider | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(_descriptions: string[]): Promise<void> {
    // Dynamically import to avoid circular dependencies
    const embeddings = await import('../memory/embeddings.js');
    this.provider = embeddings.getEmbeddingProvider();
    this.name = this.provider.model;
    getLogger().info(
      { model: this.provider.model, dimensions: this.provider.dimensions },
      '🤖 Embedder initialized'
    );
  }

  async embed(text: string): Promise<number[]> {
    // Check cache
    const cacheKey = text.slice(0, 200);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    if (!this.provider) {
      const embeddings = await import('../memory/embeddings.js');
      this.provider = embeddings.getEmbeddingProvider();
    }

    try {
      const embedding = await this.provider.embed(text);

      // Cache the result (limit cache size)
      if (this.cache.size > 10000) {
        // Clear oldest entries
        const entries = [...this.cache.entries()];
        entries.slice(0, 5000).forEach(([key]) => this.cache.delete(key));
      }
      this.cache.set(cacheKey, embedding);

      return embedding;
    } catch (error) {
      getLogger().warn({ error }, 'Embedding failed');
      throw error;
    }
  }

  similarity(a: number[], b: number[]): number {
    // Use cosine similarity from embeddings module
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  isAvailable(): boolean {
    // Check for Google AI API key or GCP environment
    return !!(
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT
    );
  }
}

// ============================================================================
// EMBEDDER FACTORY
// ============================================================================

/**
 * Create the best available embedder based on environment
 * Priority (production): Google AI/Vertex AI > TF-IDF (local)
 * Priority (development): TF-IDF (instant) > Google AI (87 seconds)
 *
 * TF-IDF is used in development because:
 * - Google AI embeddings take ~190ms per tool × 452 tools = 87 seconds startup
 * - Firestore cache fails (2.9MB > 1MB limit)
 * - TF-IDF is instant and good enough for dev testing
 */
function createEmbedder(): Embedder {
  const isDev = process.env.NODE_ENV === 'development';
  const forceTfIdf = process.env.FORCE_TFIDF_EMBEDDINGS === 'true';

  // In development, use fast TF-IDF to avoid 87-second startup
  if (isDev || forceTfIdf) {
    getLogger().info('Using TF-IDF embeddings for fast startup (dev mode)');
    return new TfIdfEmbedder();
  }

  const googleEmbedder = new GoogleAIEmbedder();
  if (googleEmbedder.isAvailable()) {
    getLogger().info('Using Google AI/Vertex AI embeddings for semantic routing');
    return googleEmbedder;
  }

  getLogger().info('Using TF-IDF embeddings (set GOOGLE_API_KEY for better quality)');
  return new TfIdfEmbedder();
}

/**
 * Common stop words to ignore
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'up',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'can',
  'will',
  'just',
  'should',
  'now',
  'use',
  'this',
  'that',
  'these',
  'those',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'would',
  'could',
  'might',
  'must',
  'shall',
  'get',
  'gets',
  'got',
  'your',
  'you',
  'user',
]);

// ============================================================================
// SEMANTIC ROUTER
// ============================================================================

// Cache version - increment when tool schema or embedding format changes
const EMBEDDING_CACHE_VERSION = '1.0.0';

export class SemanticToolRouter {
  private config: RouterConfig;
  private embedder: Embedder;
  private toolEmbeddings: ToolEmbedding[] = [];
  private queryCache = new Map<string, { matches: SemanticMatch[]; timestamp: number }>();
  private initialized = false;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = {
      similarityThreshold: 0.15,
      maxTools: 15,
      alwaysIncludeDomains: ['memory', 'handoff'],
      cacheTtlMs: 5 * 60 * 1000, // 5 minutes
      ...config,
    };
    // Create the best available embedder
    this.embedder = createEmbedder();
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the router by building embeddings for all tools.
   * Tries to load from Firestore first for faster startup (production only).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = Date.now();
    const allTools = toolRegistry.getAll();
    const isDev = process.env.NODE_ENV === 'development';

    // In development, skip Firestore caching entirely:
    // - Firebase isn't initialized locally (no credentials)
    // - TF-IDF embeddings are fast enough (no API calls)
    // - Cache would be too large anyway (2.9MB > 1MB Firestore limit)
    if (!isDev) {
      // Try to load cached embeddings from Firestore (production only)
      const cached = await this.loadFromFirestore(allTools.length);
      if (cached) {
        this.toolEmbeddings = cached;
        // Still need to initialize embedder vocabulary for queries
        const descriptions = allTools.map((t) => this.buildToolText(t));
        await this.embedder.initialize(descriptions);

        this.initialized = true;
        getLogger().info(
          {
            toolCount: this.toolEmbeddings.length,
            embedder: this.embedder.name,
            source: 'firestore',
            loadTimeMs: Date.now() - startTime,
          },
          '🎯 Semantic router initialized from cache'
        );
        return;
      }
    }

    // Cache miss or dev mode - compute fresh embeddings
    const descriptions = allTools.map((t) => this.buildToolText(t));
    await this.embedder.initialize(descriptions);

    // Generate embeddings for all tools
    const embeddings: ToolEmbedding[] = [];
    for (const tool of allTools) {
      const embedding = await this.embedder.embed(this.buildToolText(tool));
      embeddings.push({
        toolId: tool.id,
        domain: tool.domain,
        description: tool.description,
        embedding,
        keywords: this.extractKeywords(tool),
      });
    }
    this.toolEmbeddings = embeddings;

    // Save to Firestore for next time (production only)
    if (!isDev) {
      await this.saveToFirestore();
    }

    this.initialized = true;
    getLogger().info(
      {
        toolCount: this.toolEmbeddings.length,
        embedder: this.embedder.name,
        source: isDev ? 'computed (dev)' : 'computed',
        computeTimeMs: Date.now() - startTime,
      },
      '🎯 Semantic router initialized (fresh computation)'
    );
  }

  // ==========================================================================
  // FIRESTORE PERSISTENCE
  // ==========================================================================

  /**
   * Load tool embeddings from Firestore cache
   */
  private async loadFromFirestore(expectedToolCount: number): Promise<ToolEmbedding[] | null> {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      const cacheDoc = await db.collection('system_cache').doc('tool_embeddings').get();

      if (!cacheDoc.exists) {
        getLogger().debug('No cached tool embeddings found in Firestore');
        return null;
      }

      const data = cacheDoc.data();
      if (!data) return null;

      // Version check
      if (data.version !== EMBEDDING_CACHE_VERSION) {
        getLogger().info(
          { cachedVersion: data.version, currentVersion: EMBEDDING_CACHE_VERSION },
          'Embedding cache version mismatch, will recompute'
        );
        return null;
      }

      // Tool count check (rough validation that tools haven't changed)
      if (data.toolCount !== expectedToolCount) {
        getLogger().info(
          { cachedCount: data.toolCount, currentCount: expectedToolCount },
          'Tool count changed, will recompute embeddings'
        );
        return null;
      }

      // Embedder type check
      if (data.embedderName !== this.embedder.name) {
        getLogger().info(
          { cachedEmbedder: data.embedderName, currentEmbedder: this.embedder.name },
          'Embedder type changed, will recompute embeddings'
        );
        return null;
      }

      const embeddings = data.embeddings as ToolEmbedding[];
      getLogger().debug({ count: embeddings.length }, 'Loaded tool embeddings from Firestore');
      return embeddings;
    } catch (error) {
      getLogger().warn({ error }, 'Failed to load embeddings from Firestore, will compute fresh');
      return null;
    }
  }

  /**
   * Save tool embeddings to Firestore for future fast startup
   */
  private async saveToFirestore(): Promise<void> {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      await db
        .collection('system_cache')
        .doc('tool_embeddings')
        .set(
          removeUndefined({
            version: EMBEDDING_CACHE_VERSION,
            embedderName: this.embedder.name,
            toolCount: this.toolEmbeddings.length,
            embeddings: this.toolEmbeddings,
            updatedAt: new Date(),
          })
        );

      getLogger().info(
        { toolCount: this.toolEmbeddings.length },
        '💾 Tool embeddings saved to Firestore'
      );
    } catch (error) {
      getLogger().warn({ error }, 'Failed to save embeddings to Firestore (non-fatal)');
    }
  }

  /**
   * Force recomputation of embeddings (e.g., after tool changes)
   */
  async invalidateCache(): Promise<void> {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      await db.collection('system_cache').doc('tool_embeddings').delete();
      getLogger().info('Tool embedding cache invalidated');
    } catch (error) {
      getLogger().warn({ error }, 'Failed to invalidate embedding cache');
    }

    // Reset local state
    this.toolEmbeddings = [];
    this.queryCache.clear();
    this.initialized = false;
  }

  /**
   * Build searchable text for a tool
   */
  private buildToolText(tool: ToolDefinition): string {
    const parts = [tool.name, tool.description, tool.domain, ...(tool.tags || [])];
    return parts.join(' ');
  }

  /**
   * Extract keywords from a tool
   */
  private extractKeywords(tool: ToolDefinition): string[] {
    const text = this.buildToolText(tool);
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !STOP_WORDS.has(word));
  }

  // ==========================================================================
  // ROUTING
  // ==========================================================================

  /**
   * Find the most relevant tools for a user query (sync version using cache)
   * For best results with OpenAI embeddings, use findRelevantToolsAsync
   */
  findRelevantTools(query: string): SemanticMatch[] {
    if (!this.initialized) {
      getLogger().warn('Semantic router not initialized');
      return [];
    }

    // Check cache
    const cached = this.queryCache.get(query);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
      return cached.matches;
    }

    // For sync operation, we use a simple keyword-based fallback
    // This allows the sync API to work even with OpenAI embedder
    return this.findByKeywords(query);
  }

  /**
   * Find the most relevant tools for a user query (async version)
   * Uses actual embeddings for better semantic matching
   */
  async findRelevantToolsAsync(query: string): Promise<SemanticMatch[]> {
    if (!this.initialized) {
      getLogger().warn('Semantic router not initialized');
      return [];
    }

    // Check cache
    const cached = this.queryCache.get(query);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
      return cached.matches;
    }

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query);

    // Calculate similarity for each tool
    const matches: SemanticMatch[] = [];

    for (const toolEmb of this.toolEmbeddings) {
      const similarity = this.embedder.similarity(queryEmbedding, toolEmb.embedding);

      // Include if above threshold or in always-include domains
      if (
        similarity >= this.config.similarityThreshold ||
        this.config.alwaysIncludeDomains.includes(toolEmb.domain)
      ) {
        matches.push({
          toolId: toolEmb.toolId,
          domain: toolEmb.domain,
          similarity,
          description: toolEmb.description,
        });
      }
    }

    // Sort by similarity (descending)
    matches.sort((a, b) => b.similarity - a.similarity);

    // Limit results
    const limited = matches.slice(0, this.config.maxTools);

    // Cache result
    this.queryCache.set(query, { matches: limited, timestamp: Date.now() });

    getLogger().debug(
      {
        query: query.slice(0, 50),
        matchCount: limited.length,
        topMatch: limited[0]?.toolId,
        embedder: this.embedder.name,
      },
      '🎯 Semantic routing complete'
    );

    return limited;
  }

  /**
   * Simple keyword-based fallback for sync operations
   */
  private findByKeywords(query: string): SemanticMatch[] {
    const queryWords = new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

    const matches: SemanticMatch[] = [];

    for (const toolEmb of this.toolEmbeddings) {
      // Calculate keyword overlap
      let matchCount = 0;
      for (const keyword of toolEmb.keywords) {
        if (queryWords.has(keyword.toLowerCase())) {
          matchCount++;
        }
      }

      const similarity = matchCount / Math.max(queryWords.size, 1);

      if (similarity > 0 || this.config.alwaysIncludeDomains.includes(toolEmb.domain)) {
        matches.push({
          toolId: toolEmb.toolId,
          domain: toolEmb.domain,
          similarity,
          description: toolEmb.description,
        });
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, this.config.maxTools);
  }

  /**
   * Build a tool set for a specific query
   */
  buildToolSetForQuery(query: string, ctx: ToolContext): Record<string, Tool> {
    const matches = this.findRelevantTools(query);
    const tools: Record<string, Tool> = {};

    for (const match of matches) {
      const toolDef = toolRegistry.get(match.toolId);
      if (toolDef) {
        try {
          tools[toolDef.id] = toolDef.create(ctx);
        } catch (error) {
          getLogger().warn({ toolId: toolDef.id, error }, 'Failed to create tool');
        }
      }
    }

    return tools;
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  /**
   * Explain why tools were selected for a query
   */
  explainSelection(query: string): string {
    const matches = this.findRelevantTools(query);

    let explanation = `Query: "${query}"\n\n`;
    explanation += `Top ${matches.length} matching tools:\n\n`;

    for (let i = 0; i < Math.min(matches.length, 10); i++) {
      const match = matches[i];
      const similarityPct = (match.similarity * 100).toFixed(1);
      explanation += `${i + 1}. ${match.toolId} (${match.domain})\n`;
      explanation += `   Similarity: ${similarityPct}%\n`;
      explanation += `   ${match.description.slice(0, 100)}...\n\n`;
    }

    return explanation;
  }

  /**
   * Get domains that would be loaded for a query
   */
  getDomainsForQuery(query: string): ToolDomain[] {
    const matches = this.findRelevantTools(query);
    const domains = new Set<ToolDomain>();

    for (const match of matches) {
      domains.add(match.domain);
    }

    return Array.from(domains);
  }

  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Clear the query cache
   */
  clearCache(): void {
    this.queryCache.clear();
    getLogger().info('🎯 Semantic router cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.queryCache.size,
      hitRate: 0, // Would need to track hits/misses for accurate hit rate
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const semanticRouter = new SemanticToolRouter();

export default semanticRouter;
