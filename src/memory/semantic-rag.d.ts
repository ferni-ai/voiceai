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
import { type FirestoreVectorStore } from './firestore-vector-store.js';
import { type VectorStore } from './vector-store.js';
type AnyVectorStore = VectorStore | FirestoreVectorStore;
/**
 * Set the active vector store (called by initializeMemorySystem)
 */
export declare function setActiveVectorStore(store: AnyVectorStore): void;
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
/**
 * Index a piece of persona content into the vector store
 */
export declare function indexPersonaContent(id: string, content: string, category: string, vectorStore?: AnyVectorStore): Promise<void>;
/**
 * Index all persona knowledge content from bundles into the vector store
 * Loads markdown files from bundles/{bundleId}/content/knowledge/
 */
export declare function indexAllPersonaContent(vectorStore?: AnyVectorStore): Promise<void>;
/**
 * Index a conversation summary for future retrieval
 * This is the key function that persists conversation memory!
 */
export declare function indexConversationSummary(userId: string, summary: {
    id: string;
    text: string;
    topics: string[];
    timestamp: Date;
    embedding?: number[];
}, vectorStore?: AnyVectorStore): Promise<void>;
/**
 * Search the knowledge base semantically
 * Uses persistent vector store when available for cross-session search
 * Now with embedding caching and metrics collection
 */
export declare function semanticSearch(query: string, options?: {
    topK?: number;
    sources?: string[];
    categories?: string[];
    userId?: string;
    minScore?: number;
}): Promise<RAGResult[]>;
/**
 * Get RAG context for a user query
 *
 * Sources:
 * - persona: Persona knowledge (stories, wisdom, principles)
 * - conversation: Past conversation summaries
 * - user_memory: User-specific memories (moments, people, goals, etc.)
 */
export declare function getRAGContext(query: string, options?: {
    topK?: number;
    includePersona?: boolean;
    includeConversations?: boolean;
    includeUserMemory?: boolean;
    userId?: string;
    minScore?: number;
    /** User memory categories to include (all if not specified) */
    userMemoryCategories?: string[];
}): Promise<RAGContext>;
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
export declare function getExplainedRAGContext(query: string, options?: {
    topK?: number;
    includePersona?: boolean;
    includeConversations?: boolean;
    userId?: string;
    minScore?: number;
}, explanationContext?: {
    currentTopic?: string;
    currentEmotion?: string;
    personaId?: string;
}): Promise<ExplainedRAGContext>;
/**
 * Format RAG results for injection into prompts
 */
export declare function formatRAGContext(results: RAGResult[]): string;
/**
 * Simple hybrid search combining keyword and semantic
 */
export declare function hybridSearch(query: string, options?: {
    topK?: number;
    keywordWeight?: number;
    semanticWeight?: number;
}): Promise<RAGResult[]>;
/**
 * Drop-in replacement for the old keyword-based ragLookup
 * This provides backward compatibility while using semantic search
 */
export declare function ragLookup(query: string): Promise<string | null>;
declare const _default: {
    indexPersonaContent: typeof indexPersonaContent;
    indexAllPersonaContent: typeof indexAllPersonaContent;
    indexConversationSummary: typeof indexConversationSummary;
    semanticSearch: typeof semanticSearch;
    getRAGContext: typeof getRAGContext;
    hybridSearch: typeof hybridSearch;
    ragLookup: typeof ragLookup;
    setActiveVectorStore: typeof setActiveVectorStore;
};
export default _default;
//# sourceMappingURL=semantic-rag.d.ts.map