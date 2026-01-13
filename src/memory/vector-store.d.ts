/**
 * Vector Store
 *
 * In-memory vector store for semantic search over embeddings.
 * Supports the persona knowledge base and conversation history.
 *
 * Implements VectorStoreContract interface for swappable backends.
 */
import type { VectorStoreContract, VectorDocument, VectorFilter, VectorSearchResult, VectorStoreStats } from './vector-store-interface.js';
export type { VectorDocument, VectorFilter, VectorSearchResult } from './vector-store-interface.js';
/**
 * In-memory vector store for semantic search
 * Implements VectorStoreContract for swappable backends
 */
export declare class VectorStore implements VectorStoreContract {
    private documents;
    private embeddings;
    private _initialized;
    /**
     * Initialize the vector store
     */
    initialize(): Promise<void>;
    /**
     * Check if initialized
     */
    get isInitialized(): boolean;
    /**
     * Add a document to the store
     */
    addDocument(doc: VectorDocument): Promise<void>;
    /**
     * Add multiple documents in batch
     */
    addDocuments(docs: VectorDocument[]): Promise<void>;
    /**
     * Remove a document from the store
     */
    removeDocument(id: string): boolean;
    /**
     * Get a document by ID
     */
    getDocument(id: string): VectorDocument | undefined;
    /**
     * Check if filter matches document
     */
    private matchesFilter;
    /**
     * Semantic search for similar documents
     *
     * Uses SIMD-accelerated topKSimilar for batch similarity + ranking.
     */
    search(query: string, options?: {
        topK?: number;
        filter?: VectorFilter;
        minScore?: number;
    }): Promise<VectorSearchResult[]>;
    /**
     * Search by embedding directly (for pre-computed queries)
     *
     * Uses SIMD-accelerated topKSimilar for batch similarity + ranking.
     */
    searchByEmbedding(queryEmbedding: number[], options?: {
        topK?: number;
        filter?: VectorFilter;
        minScore?: number;
    }): VectorSearchResult[];
    /**
     * Get all documents matching a filter
     */
    list(filter?: VectorFilter): VectorDocument[];
    /**
     * Get store statistics
     */
    getStats(): VectorStoreStats;
    /**
     * Clear all documents
     */
    clear(): void;
}
/**
 * Get the default vector store instance
 */
export declare function getVectorStore(): VectorStore;
/**
 * Reset the default vector store (for testing)
 */
export declare function resetVectorStore(): void;
export default VectorStore;
//# sourceMappingURL=vector-store.d.ts.map