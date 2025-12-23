/**
 * Multilingual Embedding Support for Semantic Router
 *
 * Uses multilingual embedding models to enable language-agnostic semantic similarity.
 * This is the "Better Than Human" approach - instead of maintaining translations,
 * we use embeddings that understand meaning across languages.
 *
 * @module semantic-router/i18n/multilingual
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { SemanticToolDefinition, EmbeddingProvider, EmbeddingVector } from '../types.js';

const log = createLogger({ module: 'SemanticRouter.Multilingual' });

// ============================================================================
// TYPES
// ============================================================================

export interface MultilingualConfig {
  /** Primary embedding model for semantic similarity */
  embeddingProvider: EmbeddingProvider;

  /** Fallback to keyword matching in detected language */
  enableKeywordFallback: boolean;

  /** Confidence threshold for embedding-only routing */
  embeddingConfidenceThreshold: number;

  /** List of supported locale codes */
  supportedLocales: string[];
}

export interface MultilingualRoutingResult {
  toolId: string | null;
  confidence: number;
  detectedLanguage: string;
  method: 'embedding' | 'keyword' | 'hybrid';
  embeddingScore?: number;
  keywordScore?: number;
}

// ============================================================================
// TOOL EMBEDDINGS CACHE
// ============================================================================

interface ToolEmbedding {
  toolId: string;
  description: string;
  embedding: EmbeddingVector;
  examples: Array<{ text: string; embedding: EmbeddingVector }>;
}

const toolEmbeddingsCache: Map<string, ToolEmbedding> = new Map();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize multilingual embeddings for all tools
 *
 * This pre-computes embeddings for tool descriptions and examples,
 * enabling fast language-agnostic matching at runtime.
 */
export async function initializeMultilingualEmbeddings(
  tools: SemanticToolDefinition[],
  embeddingProvider: EmbeddingProvider
): Promise<void> {
  log.info({ toolCount: tools.length }, 'Initializing multilingual embeddings');

  for (const tool of tools) {
    try {
      // Embed the tool description
      const descriptionEmbedding = await embeddingProvider.embed(tool.description);

      // Embed examples (limit to 5 for performance)
      const exampleEmbeddings = await Promise.all(
        tool.examples.slice(0, 5).map(async (example: string) => ({
          text: example,
          embedding: await embeddingProvider.embed(example),
        }))
      );

      toolEmbeddingsCache.set(tool.id, {
        toolId: tool.id,
        description: tool.description,
        embedding: descriptionEmbedding,
        examples: exampleEmbeddings,
      });

      log.debug({ toolId: tool.id, exampleCount: exampleEmbeddings.length }, 'Tool embeddings cached');
    } catch (error) {
      log.error({ toolId: tool.id, error: String(error) }, 'Failed to embed tool');
    }
  }

  log.info({ cachedTools: toolEmbeddingsCache.size }, 'Multilingual embeddings initialized');
}

/**
 * Route using multilingual embeddings
 *
 * This is the language-agnostic routing method. It compares the user's input
 * embedding against pre-computed tool embeddings, regardless of language.
 */
export async function routeMultilingual(
  input: string,
  embeddingProvider: EmbeddingProvider,
  config: Partial<MultilingualConfig> = {}
): Promise<MultilingualRoutingResult> {
  const { embeddingConfidenceThreshold = 0.7 } = config;

  // Get embedding for user input
  const inputEmbedding = await embeddingProvider.embed(input);

  let bestMatch: { toolId: string; score: number } | null = null;

  // Compare against all cached tool embeddings
  for (const [toolId, toolData] of toolEmbeddingsCache) {
    // Score against description
    const descriptionScore = cosineSimilarity(inputEmbedding, toolData.embedding);

    // Score against examples (take max)
    const exampleScores = toolData.examples.map((ex) =>
      cosineSimilarity(inputEmbedding, ex.embedding)
    );
    const maxExampleScore = Math.max(0, ...exampleScores);

    // Combined score: weighted average of description and best example
    const combinedScore = descriptionScore * 0.4 + maxExampleScore * 0.6;

    if (!bestMatch || combinedScore > bestMatch.score) {
      bestMatch = { toolId, score: combinedScore };
    }
  }

  if (!bestMatch || bestMatch.score < embeddingConfidenceThreshold) {
    return {
      toolId: null,
      confidence: bestMatch?.score || 0,
      detectedLanguage: 'unknown',
      method: 'embedding',
      embeddingScore: bestMatch?.score,
    };
  }

  return {
    toolId: bestMatch.toolId,
    confidence: bestMatch.score,
    detectedLanguage: 'multilingual', // Embedding-based routing is language-agnostic
    method: 'embedding',
    embeddingScore: bestMatch.score,
  };
}

/**
 * Hybrid routing: Embeddings + Locale-specific keywords
 *
 * Best of both worlds: Fast keyword matching when available,
 * with embedding fallback for unknown phrases or languages.
 */
export async function routeHybrid(
  input: string,
  tools: SemanticToolDefinition[],
  embeddingProvider: EmbeddingProvider,
  config: Partial<MultilingualConfig> = {}
): Promise<MultilingualRoutingResult> {
  const { embeddingConfidenceThreshold = 0.7 } = config;

  // First, try embedding-based routing
  const embeddingResult = await routeMultilingual(input, embeddingProvider, config);

  // If embedding is confident enough, use it
  if (embeddingResult.toolId && embeddingResult.confidence >= embeddingConfidenceThreshold) {
    return embeddingResult;
  }

  // Fall back to keyword matching (which should use locale-loaded triggers)
  const keywordResult = matchByKeywords(input, tools);

  // If keyword matching found something
  if (keywordResult.toolId && keywordResult.score > 0.5) {
    // If embedding also had a result, combine scores
    if (embeddingResult.toolId === keywordResult.toolId) {
      return {
        toolId: keywordResult.toolId,
        confidence: (embeddingResult.confidence + keywordResult.score) / 2,
        detectedLanguage: keywordResult.detectedLanguage,
        method: 'hybrid',
        embeddingScore: embeddingResult.confidence,
        keywordScore: keywordResult.score,
      };
    }

    // Keyword result differs from embedding - use keyword if more confident
    if (keywordResult.score > embeddingResult.confidence) {
      return {
        toolId: keywordResult.toolId,
        confidence: keywordResult.score,
        detectedLanguage: keywordResult.detectedLanguage,
        method: 'keyword',
        keywordScore: keywordResult.score,
        embeddingScore: embeddingResult.confidence,
      };
    }
  }

  // Return embedding result even if below threshold (let router decide)
  return embeddingResult;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Cosine similarity between two vectors
 * Handles both Float32Array and number[] types
 */
function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) return 0;

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

/**
 * Simple keyword matching (uses loaded locale triggers)
 */
function matchByKeywords(
  input: string,
  tools: SemanticToolDefinition[]
): { toolId: string | null; score: number; detectedLanguage: string } {
  const lowerInput = input.toLowerCase();
  const words = lowerInput.split(/\s+/);

  let bestMatch: { toolId: string; score: number } | null = null;

  for (const tool of tools) {
    let score = 0;
    let antiScore = 0;

    // Check keywords (handle optional)
    const keywords = tool.triggers.keywords || [];
    for (const keyword of keywords) {
      if (words.some((w) => w.includes(keyword.word.toLowerCase()))) {
        score += keyword.weight;
      }
    }

    // Check anti-keywords
    if (tool.triggers.antiKeywords) {
      for (const antiWord of tool.triggers.antiKeywords) {
        if (lowerInput.includes(antiWord.toLowerCase())) {
          antiScore += 0.5;
        }
      }
    }

    // Check phrase exact matches (handle optional)
    const phrases = tool.triggers.phrases || [];
    for (const phrase of phrases) {
      if (lowerInput.includes(phrase.toLowerCase())) {
        score += 2; // Phrase match is strong signal
      }
    }

    // Check pattern matches (handle optional)
    const patterns = tool.triggers.patterns || [];
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        score += 1.5; // Pattern match is strong signal
      }
    }

    const finalScore = Math.max(0, score - antiScore);

    if (!bestMatch || finalScore > bestMatch.score) {
      bestMatch = { toolId: tool.id, score: finalScore };
    }
  }

  // Normalize score (rough heuristic)
  const normalizedScore = bestMatch ? Math.min(1, bestMatch.score / 5) : 0;

  return {
    toolId: bestMatch?.toolId || null,
    score: normalizedScore,
    detectedLanguage: 'auto', // Would be set by locale detection
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  toolEmbeddingsCache,
  cosineSimilarity,
};

