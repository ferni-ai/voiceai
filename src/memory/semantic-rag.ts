/**
 * Semantic RAG (Retrieval-Augmented Generation)
 *
 * Provides semantic search over the knowledge base and conversation history.
 * Replaces keyword-based lookup with embedding-based similarity search.
 */

import { log } from '@livekit/agents';
import { VectorStore, getVectorStore, type VectorDocument } from './vector-store.js';
import { embed } from './embeddings.js';

const getLogger = () => log();

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
  vectorStore?: VectorStore
): Promise<void> {
  const store = vectorStore || getVectorStore();

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
 * Index all persona modules into the vector store
 */
export async function indexAllPersonaContent(vectorStore?: VectorStore): Promise<void> {
  const store = vectorStore || getVectorStore();
  await store.initialize();

  // Import all persona modules
  const personaModules = await Promise.all([
    import('../persona/vanguard-principles.js').then((m) => ({
      id: 'vanguard_principles',
      content: m.VANGUARD_PRINCIPLES,
      category: 'principles',
    })),
    import('../persona/historical-anecdotes.js').then((m) => ({
      id: 'historical_anecdotes',
      content: m.HISTORICAL_ANECDOTES,
      category: 'stories',
    })),
    import('../persona/daily-wisdom.js').then((m) => ({
      id: 'daily_wisdom',
      content: m.DAILY_WISDOM,
      category: 'wisdom',
    })),
    import('../persona/behavioral-science.js').then((m) => ({
      id: 'behavioral_science',
      content: m.BEHAVIORAL_SCIENCE,
      category: 'psychology',
    })),
    import('../persona/coaching-frameworks.js').then((m) => ({
      id: 'coaching_frameworks',
      content: m.COACHING_FRAMEWORKS,
      category: 'coaching',
    })),
    import('../persona/financial-history.js').then((m) => ({
      id: 'financial_history',
      content: m.FINANCIAL_HISTORY,
      category: 'history',
    })),
    import('../persona/biography.js').then((m) => ({
      id: 'biography',
      content: m.BIOGRAPHY,
      category: 'personal',
    })),
    import('../persona/core-identity.js').then((m) => ({
      id: 'core_identity',
      content: m.CORE_IDENTITY,
      category: 'identity',
    })),
    import('../persona/personal-life.js').then((m) => ({
      id: 'personal_life',
      content: m.PERSONAL_LIFE,
      category: 'personal',
    })),
    import('../persona/opinions-and-wisdom.js').then((m) => ({
      id: 'opinions_wisdom',
      content: m.OPINIONS_AND_WISDOM,
      category: 'wisdom',
    })),
    import('../persona/conversational-style.js').then((m) => ({
      id: 'conversational_style',
      content: m.CONVERSATIONAL_STYLE,
      category: 'style',
    })),
    import('../persona/cultural-references.js').then((m) => ({
      id: 'cultural_references',
      content: m.CULTURAL_REFERENCES,
      category: 'culture',
    })),
    import('../persona/philadelphia-stories.js').then((m) => ({
      id: 'philadelphia_stories',
      content: m.PHILADELPHIA_STORIES,
      category: 'stories',
    })),
    import('../persona/life-events.js').then((m) => ({
      id: 'life_events',
      content: m.LIFE_EVENTS,
      category: 'coaching',
    })),
    import('../persona/moments-of-firsts.js').then((m) => ({
      id: 'moments_of_firsts',
      content: m.MOMENTS_OF_FIRSTS,
      category: 'coaching',
    })),
  ]);

  // Index each module
  for (const module of personaModules) {
    await indexPersonaContent(module.id, module.content, module.category, store);
  }

  const stats = store.getStats();
  getLogger().info(`Indexed all persona content: ${stats.documentCount} documents`);
}

/**
 * Index a conversation summary for future retrieval
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
  vectorStore?: VectorStore
): Promise<void> {
  const store = vectorStore || getVectorStore();

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
  const store = getVectorStore();
  const topK = options?.topK || 5;
  const minScore = options?.minScore || 0.3;

  // Build filter
  const filter: {
    source?: string[];
    category?: string[];
    userId?: string;
  } = {};

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

  // Get query embedding for potential reuse
  const queryEmbedding = await embed(query);

  getLogger().info(`RAG: Found ${results.length} relevant results for query`);

  return {
    results,
    formattedContext,
    queryEmbedding,
  };
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
    const source = result.source;
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
};
