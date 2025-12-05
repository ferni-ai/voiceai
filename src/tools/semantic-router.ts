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
 */

import { getLogger } from '../utils/safe-logger.js';
import { toolRegistry } from './registry/index.js';
import type { ToolDefinition, ToolDomain, Tool, ToolContext } from './registry/types.js';

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
// SIMPLE EMBEDDING IMPLEMENTATION
// ============================================================================

/**
 * Simple TF-IDF-like embedding for tool descriptions
 * In production, this would use actual embedding models (OpenAI, Cohere, etc.)
 */
class SimpleEmbedder {
  private vocabulary = new Map<string, number>();
  private idf = new Map<string, number>();
  private documentCount = 0;

  /**
   * Build vocabulary from all tool descriptions
   */
  buildVocabulary(descriptions: string[]): void {
    this.documentCount = descriptions.length;
    const documentFrequency = new Map<string, number>();

    // Build vocabulary and count document frequency
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

    // Calculate IDF
    for (const [word, df] of documentFrequency) {
      this.idf.set(word, Math.log(this.documentCount / (1 + df)));
    }

    getLogger().info({ vocabularySize: this.vocabulary.size }, '📊 Embedder vocabulary built');
  }

  /**
   * Generate embedding for text
   */
  embed(text: string): number[] {
    const words = this.tokenize(text);
    const termFrequency = new Map<string, number>();

    // Count term frequency
    for (const word of words) {
      termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
    }

    // Build TF-IDF vector
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

  /**
   * Calculate cosine similarity between two vectors
   */
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

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .filter((word) => !STOP_WORDS.has(word));
  }
}

/**
 * Common stop words to ignore
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'can', 'will', 'just', 'should', 'now', 'use', 'this', 'that', 'these',
  'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'could',
  'might', 'must', 'shall', 'get', 'gets', 'got', 'your', 'you', 'user',
]);

// ============================================================================
// SEMANTIC ROUTER
// ============================================================================

export class SemanticToolRouter {
  private config: RouterConfig;
  private embedder = new SimpleEmbedder();
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
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the router by building embeddings for all tools
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const allTools = toolRegistry.getAll();
    const descriptions = allTools.map((t) => this.buildToolText(t));

    // Build vocabulary
    this.embedder.buildVocabulary(descriptions);

    // Generate embeddings for all tools
    this.toolEmbeddings = allTools.map((tool) => ({
      toolId: tool.id,
      domain: tool.domain,
      description: tool.description,
      embedding: this.embedder.embed(this.buildToolText(tool)),
      keywords: this.extractKeywords(tool),
    }));

    this.initialized = true;
    getLogger().info(
      { toolCount: this.toolEmbeddings.length },
      '🎯 Semantic router initialized'
    );
  }

  /**
   * Build searchable text for a tool
   */
  private buildToolText(tool: ToolDefinition): string {
    const parts = [
      tool.name,
      tool.description,
      tool.domain,
      ...(tool.tags || []),
    ];
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
   * Find the most relevant tools for a user query
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

    // Generate query embedding
    const queryEmbedding = this.embedder.embed(query);

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
      },
      '🎯 Semantic routing complete'
    );

    return limited;
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

