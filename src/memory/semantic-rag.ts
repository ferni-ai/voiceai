/**
 * Semantic RAG (Retrieval-Augmented Generation)
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Provides semantic search over the knowledge base and conversation history.
 * Replaces keyword-based lookup with embedding-based similarity search.
 *
 * Memory isn't just storage - it's connection. When someone mentions
 * something they told you months ago, finding that memory through
 * meaning (not just keywords) is what makes recall feel natural.
 *
 * Supports both ephemeral VectorStore and persistent FirestoreVectorStore.
 */

import { getLogger } from '../utils/safe-logger.js';
import {
  getVectorStore,
  type VectorStore,
  type VectorDocument,
  type VectorFilter,
} from './vector-store.js';
import { getFirestoreVectorStore, type FirestoreVectorStore } from './firestore-vector-store.js';
import { embed } from './embeddings.js';
import { embedCached, getEmbeddingCache } from './embedding-cache.js';
import { getMemoryMetricsCollector } from './memory-metrics.js';
import { isOk } from './result.js';
import { getRetrievalExplainer } from './retrieval-explanations.js';

// Type for any vector store implementation
type AnyVectorStore = VectorStore | FirestoreVectorStore;

// Active vector store reference (set during initialization)
let activeVectorStore: AnyVectorStore | null = null;

/**
 * Set the active vector store (called by initializeMemorySystem)
 */
export function setActiveVectorStore(store: AnyVectorStore): void {
  activeVectorStore = store;
  getLogger().info(`Active vector store set: ${store.constructor.name}`);
}

/**
 * Get the active vector store (uses persistent store if available)
 */
function getActiveStore(): AnyVectorStore {
  if (activeVectorStore) return activeVectorStore;

  // Fallback: try to detect which store to use
  const storeType = process.env.MEMORY_STORE_TYPE;
  const isProduction = process.env.NODE_ENV === 'production';

  if (storeType === 'firestore' || (isProduction && process.env.GOOGLE_CLOUD_PROJECT)) {
    return getFirestoreVectorStore();
  }

  return getVectorStore();
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * RAG search result
 */
export interface RAGResult {
  content: string;
  source: string;
  category?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * RAG context for injection into prompts
 */
export interface RAGContext {
  results: RAGResult[];
  formattedContext: string;
  queryEmbedding?: number[];
}

/**
 * RAG result with natural language explanation
 */
export interface ExplainedRAGResult extends RAGResult {
  /** Natural language explanation of why this was retrieved */
  explanation?: string;
  /** Suggested way to reference this in conversation */
  suggestedReference?: string;
}

/**
 * Enhanced RAG context with explanations
 */
export interface ExplainedRAGContext extends RAGContext {
  explainedResults: ExplainedRAGResult[];
}

// ============================================================================
// KNOWLEDGE BASE INDEXING
// ============================================================================

/**
 * Index a piece of persona content into the vector store
 */
export async function indexPersonaContent(
  id: string,
  content: string,
  category: string,
  vectorStore?: AnyVectorStore
): Promise<void> {
  const store = vectorStore || getActiveStore();

  // Split into chunks if content is long
  const chunks = chunkText(content, 1000, 100);

  for (let i = 0; i < chunks.length; i++) {
    const doc: VectorDocument = {
      id: `${id}_chunk_${i}`,
      text: chunks[i],
      metadata: {
        source: 'persona',
        category,
        chunkIndex: i,
        totalChunks: chunks.length,
        originalId: id,
      },
    };

    await store.addDocument(doc);
  }

  getLogger().debug(`Indexed persona content: ${id} (${chunks.length} chunks)`);
}

/**
 * Index all persona knowledge content from bundles into the vector store
 * Loads markdown files from bundles/{bundleId}/content/knowledge/
 */
export async function indexAllPersonaContent(vectorStore?: AnyVectorStore): Promise<void> {
  const store = vectorStore || getActiveStore();
  if ('initialize' in store && typeof store.initialize === 'function') {
    await store.initialize();
  }

  // Load knowledge content from jack-bogle bundle
  const { readdir, readFile } = await import('fs/promises');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const bundlesPath = join(__dirname, '..', 'personas', 'bundles');

  try {
    const bundles = await readdir(bundlesPath, { withFileTypes: true });

    for (const bundle of bundles) {
      if (!bundle.isDirectory()) continue;

      const knowledgePath = join(bundlesPath, bundle.name, 'content', 'knowledge');

      try {
        const knowledgeFiles = await readdir(knowledgePath);

        for (const file of knowledgeFiles) {
          if (!file.endsWith('.md') || file.startsWith('_')) continue;

          const filePath = join(knowledgePath, file);
          const content = await readFile(filePath, 'utf-8');
          const id = `${bundle.name}_${file.replace('.md', '')}`;

          // Infer category from file name
          let category = 'knowledge';
          if (file.includes('story') || file.includes('anecdote')) category = 'stories';
          else if (file.includes('wisdom') || file.includes('opinion')) category = 'wisdom';
          else if (file.includes('coach') || file.includes('event')) category = 'coaching';
          else if (file.includes('bio') || file.includes('personal')) category = 'personal';
          else if (file.includes('style') || file.includes('conversation')) category = 'style';
          else if (file.includes('history') || file.includes('finance')) category = 'history';
          else if (file.includes('principle') || file.includes('vanguard')) category = 'principles';

          await indexPersonaContent(id, content, category, store);
        }

        getLogger().debug(`Indexed knowledge from bundle: ${bundle.name}`);
      } catch {
        // Knowledge directory may not exist for all bundles
        continue;
      }
    }

    // Get stats (handle both sync and async versions)
    const statsResult = store.getStats();
    const stats = statsResult instanceof Promise ? await statsResult : statsResult;
    getLogger().info(`Indexed all persona content from bundles: ${stats.documentCount} documents`);
  } catch (error) {
    getLogger().warn(`Failed to index persona content from bundles: ${error}`);
  }
}

/**
 * Index a conversation summary for future retrieval
 * This is the key function that persists conversation memory!
 */
export async function indexConversationSummary(
  userId: string,
  summary: {
    id: string;
    text: string;
    topics: string[];
    timestamp: Date;
    embedding?: number[];
  },
  vectorStore?: AnyVectorStore
): Promise<void> {
  const store = vectorStore || getActiveStore();

  const doc: VectorDocument = {
    id: `conversation_${summary.id}`,
    text: summary.text,
    embedding: summary.embedding,
    metadata: {
      source: 'conversation',
      category: 'summary',
      userId,
      topics: summary.topics,
      timestamp: summary.timestamp,
    },
  };

  await store.addDocument(doc);
  getLogger().debug(`Indexed conversation summary: ${summary.id}`);
}

// ============================================================================
// SEMANTIC SEARCH
// ============================================================================

/**
 * Search the knowledge base semantically
 * Uses persistent vector store when available for cross-session search
 * Now with embedding caching and metrics collection
 */
export async function semanticSearch(
  query: string,
  options?: {
    topK?: number;
    sources?: string[];
    categories?: string[];
    userId?: string;
    minScore?: number;
  }
): Promise<RAGResult[]> {
  const store = getActiveStore();
  const topK = options?.topK || 5;
  const minScore = options?.minScore || 0.3;
  const metrics = getMemoryMetricsCollector();
  const startTime = Date.now();

  // Build filter
  const filter: VectorFilter = {};

  if (options?.sources) {
    filter.source = options.sources;
  }
  if (options?.categories) {
    filter.category = options.categories;
  }
  if (options?.userId) {
    filter.userId = options.userId;
  }

  // Search
  const results = await store.search(query, {
    topK,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    minScore,
  });

  // Record metrics
  const durationMs = Date.now() - startTime;
  const topScore = results.length > 0 ? results[0].score : undefined;
  metrics.recordRetrieval(durationMs, results.length, topScore);

  return results.map((r) => ({
    content: r.document.text,
    source: r.document.metadata.source,
    category: r.document.metadata.category as string | undefined,
    score: r.score,
    metadata: r.document.metadata,
  }));
}

/**
 * Get RAG context for a user query
 */
export async function getRAGContext(
  query: string,
  options?: {
    topK?: number;
    includePersona?: boolean;
    includeConversations?: boolean;
    userId?: string;
    minScore?: number;
  }
): Promise<RAGContext> {
  const opts = {
    topK: 5,
    includePersona: true,
    includeConversations: true,
    minScore: 0.3,
    ...options,
  };

  // Determine sources to search
  const sources: string[] = [];
  if (opts.includePersona) sources.push('persona');
  if (opts.includeConversations) sources.push('conversation');

  // Search
  const results = await semanticSearch(query, {
    topK: opts.topK,
    sources,
    userId: opts.userId,
    minScore: opts.minScore,
  });

  // Format for prompt injection
  const formattedContext = formatRAGContext(results);

  // Get query embedding for potential reuse (using cache)
  const embeddingResult = await embedCached(query);
  const queryEmbedding = isOk(embeddingResult) ? embeddingResult.value : await embed(query);

  getLogger().info(`RAG: Found ${results.length} relevant results for query`);

  return {
    results,
    formattedContext,
    queryEmbedding,
  };
}

/**
 * Get RAG context with natural language explanations for why each result was retrieved.
 *
 * This is useful for:
 * - Making the AI's memory retrieval more transparent
 * - Providing suggested ways to reference past context naturally
 * - Understanding why certain memories surfaced
 *
 * @param query - The search query
 * @param options - Search options
 * @param explanationContext - Context for generating explanations
 * @returns Enhanced RAG context with explanations
 */
export async function getExplainedRAGContext(
  query: string,
  options?: {
    topK?: number;
    includePersona?: boolean;
    includeConversations?: boolean;
    userId?: string;
    minScore?: number;
  },
  explanationContext?: {
    currentTopic?: string;
    currentEmotion?: string;
    personaId?: string;
  }
): Promise<ExplainedRAGContext> {
  // Get base RAG context
  const ragContext = await getRAGContext(query, options);

  // Get the explainer
  const explainer = getRetrievalExplainer();

  // Build retrieval context for explanations
  const retrievalContext = {
    query,
    currentTopic: explanationContext?.currentTopic || extractTopicFromQuery(query),
    currentEmotion: explanationContext?.currentEmotion,
    personaId: explanationContext?.personaId,
  };

  // Explain each result
  const explainedResults: ExplainedRAGResult[] = ragContext.results.map((result) => {
    // Convert RAGResult to a format the explainer understands
    const mockRetrievedMemory = {
      item: {
        id: result.source,
        type: 'summary' as const,
        content: result.content,
        timestamp: new Date(),
        emotionalWeight: 0.5,
        relevanceDecay: 0.5,
        baseImportance: result.score,
        topics: result.category ? [result.category] : [],
        source: {
          collection: result.source,
          documentId: result.source,
        },
      },
      score: result.score,
      scoreBreakdown: {
        semantic: result.score,
        temporal: 0.3,
        emotional: 0.3,
        contextual: 0.3,
      },
      reason: `Retrieved for query: ${query}`,
    };

    const explained = explainer.explain(mockRetrievedMemory, retrievalContext);

    return {
      ...result,
      explanation: explained.naturalExplanation,
      suggestedReference: explained.suggestedReference,
    };
  });

  getLogger().debug(`Explained ${explainedResults.length} RAG results`);

  return {
    ...ragContext,
    explainedResults,
  };
}

/**
 * Extract a topic from a query (simple heuristic)
 */
function extractTopicFromQuery(query: string): string {
  // Simple extraction - could be enhanced with NLP
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return words.slice(0, 3).join(' ') || 'general';
}

/**
 * Format RAG results for injection into prompts
 */
export function formatRAGContext(results: RAGResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // Group by source
  const bySource: Record<string, RAGResult[]> = {};
  for (const result of results) {
    const { source } = result;
    if (!bySource[source]) {
      bySource[source] = [];
    }
    bySource[source].push(result);
  }

  // Format each source
  if (bySource['persona']) {
    const personaContent = bySource['persona'].map((r) => r.content.slice(0, 500)).join('\n\n');
    sections.push(`[RELEVANT KNOWLEDGE]\n${personaContent}`);
  }

  if (bySource['conversation']) {
    const convContent = bySource['conversation']
      .map((r) => `From previous conversation: ${r.content.slice(0, 300)}`)
      .join('\n');
    sections.push(`[CONVERSATION HISTORY]\n${convContent}`);
  }

  return sections.join('\n\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Split text into overlapping chunks
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];

  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep overlap from end of previous chunk
      currentChunk = currentChunk.slice(-overlap) + para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Simple hybrid search combining keyword and semantic
 */
export async function hybridSearch(
  query: string,
  options?: {
    topK?: number;
    keywordWeight?: number;
    semanticWeight?: number;
  }
): Promise<RAGResult[]> {
  const topK = options?.topK || 5;
  const keywordWeight = options?.keywordWeight || 0.3;
  const semanticWeight = options?.semanticWeight || 0.7;

  // Get semantic results
  const semanticResults = await semanticSearch(query, { topK: topK * 2 });

  // Simple keyword scoring
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  // Combine scores
  const combined = semanticResults.map((result) => {
    // Calculate keyword score
    const text = result.content.toLowerCase();
    const keywordMatches = queryWords.filter((w) => text.includes(w)).length;
    const keywordScore = queryWords.length > 0 ? keywordMatches / queryWords.length : 0;

    // Combine scores
    const combinedScore = result.score * semanticWeight + keywordScore * keywordWeight;

    return { ...result, score: combinedScore };
  });

  // Sort by combined score
  combined.sort((a, b) => b.score - a.score);

  return combined.slice(0, topK);
}

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

/**
 * Drop-in replacement for the old keyword-based ragLookup
 * This provides backward compatibility while using semantic search
 */
export async function ragLookup(query: string): Promise<string | null> {
  try {
    const context = await getRAGContext(query, {
      topK: 3,
      includePersona: true,
      includeConversations: false,
      minScore: 0.35,
    });

    if (context.results.length === 0) {
      return null;
    }

    // Return the top result's content (limited length)
    return context.results[0].content.slice(0, 1500);
  } catch (error) {
    getLogger().warn(`Semantic RAG failed, returning null: ${error}`);
    return null;
  }
}

export default {
  indexPersonaContent,
  indexAllPersonaContent,
  indexConversationSummary,
  semanticSearch,
  getRAGContext,
  hybridSearch,
  ragLookup,
  setActiveVectorStore,
};
