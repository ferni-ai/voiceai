/**
 * Graph-RAG Retrieval
 *
 * State-of-the-art retrieval combining:
 * - Hybrid search (BM25 + Vector)
 * - Graph expansion
 * - Cross-encoder reranking (optional)
 * - Temporal/emotional weighting
 *
 * @module memory/entity-store/graph-rag
 */
import type { EntityType, EntitySearchResult } from './types.js';
export interface GraphRAGContext {
    /** Current conversation topic */
    currentTopic?: string;
    /** Current detected emotion */
    currentEmotion?: string;
    /** Active persona */
    personaId?: string;
    /** Conversation turn number */
    conversationTurn?: number;
    /** Recent topics discussed */
    recentTopics?: string[];
    /** User's current mood */
    userMood?: string;
    /** Recent entity mentions in this session */
    recentEntityMentions?: string[];
}
export interface GraphRAGOptions {
    /** Maximum results to return */
    topK?: number;
    /** Minimum score threshold */
    minScore?: number;
    /** Filter to specific entity types */
    types?: EntityType[];
    /** Enable graph expansion (default: true) */
    expandGraph?: boolean;
    /** Max hops for graph expansion (default: 2) */
    maxGraphHops?: number;
    /** Enable hybrid search (default: true) */
    hybrid?: boolean;
    /** Enable cross-encoder reranking (expensive, default: false) */
    rerank?: boolean;
    /** Include explanation in results */
    includeExplanation?: boolean;
}
export interface GraphRAGResult {
    /** Retrieved entities with scores */
    entities: EntitySearchResult[];
    /** Total entities considered */
    totalConsidered: number;
    /** Search latency in ms */
    latencyMs: number;
    /** Debug info */
    debug?: {
        bm25Candidates: number;
        vectorCandidates: number;
        graphExpanded: number;
        afterRerank: number;
    };
}
/**
 * Graph-RAG Retriever - production-grade retrieval for superhuman memory
 */
export declare class GraphRAGRetriever {
    private crossEncoderLoaded;
    private crossEncoder;
    /**
     * Main retrieval function
     */
    retrieve(userId: string, query: string, context?: GraphRAGContext, options?: GraphRAGOptions): Promise<GraphRAGResult>;
    /**
     * Apply context-based boosts to search results
     */
    private applyContextBoosts;
    /**
     * Cross-encoder reranking for more accurate scoring
     *
     * Uses a transformer cross-encoder to score (query, entity) pairs
     * Much more accurate than cosine similarity but ~10x slower
     */
    private crossEncoderRerank;
    /**
     * Convert entity to search-friendly text
     */
    private entityToSearchText;
}
/**
 * Get singleton retriever
 */
export declare function getGraphRAGRetriever(): GraphRAGRetriever;
/**
 * Convenience function for Graph-RAG retrieval
 */
export declare function graphRAGRetrieve(userId: string, query: string, context?: GraphRAGContext, options?: GraphRAGOptions): Promise<GraphRAGResult>;
//# sourceMappingURL=graph-rag.d.ts.map