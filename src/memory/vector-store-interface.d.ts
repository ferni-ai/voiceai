/**
 * Vector Store Interface
 *
 * Unified interface for vector storage implementations.
 * Allows swapping between in-memory, Firestore, and future backends.
 */
/**
 * Document stored in the vector store
 */
export interface VectorDocument {
    id: string;
    text: string;
    embedding?: number[];
    metadata: {
        source: string;
        category?: string;
        userId?: string;
        timestamp?: Date;
        [key: string]: unknown;
    };
}
/**
 * Search result with similarity score
 */
export interface VectorSearchResult {
    document: VectorDocument;
    score: number;
}
/**
 * Filter for vector search
 */
export interface VectorFilter {
    source?: string | string[];
    category?: string | string[];
    userId?: string;
    minTimestamp?: Date;
    maxTimestamp?: Date;
    metadata?: Record<string, unknown>;
}
/**
 * Search options
 */
export interface VectorSearchOptions {
    topK?: number;
    filter?: VectorFilter;
    minScore?: number;
}
/**
 * Vector store statistics
 */
export interface VectorStoreStats {
    documentCount: number;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
    usingFallback?: boolean;
}
/**
 * Unified interface for all vector store implementations
 *
 * Implementations:
 * - VectorStore: In-memory, ephemeral (development)
 * - FirestoreVectorStore: Persistent (production)
 */
export interface VectorStoreContract {
    /**
     * Initialize the store
     */
    initialize: () => Promise<void>;
    /**
     * Check if initialized
     */
    readonly isInitialized: boolean;
    /**
     * Add a single document (generates embedding if not provided)
     */
    addDocument: (doc: VectorDocument) => Promise<void>;
    /**
     * Add multiple documents in batch
     */
    addDocuments: (docs: VectorDocument[]) => Promise<void>;
    /**
     * Remove a document by ID
     */
    removeDocument: (id: string) => Promise<boolean> | boolean;
    /**
     * Get a document by ID
     */
    getDocument: (id: string) => Promise<VectorDocument | undefined> | VectorDocument | undefined;
    /**
     * Semantic search by query text
     */
    search: (query: string, options?: VectorSearchOptions) => Promise<VectorSearchResult[]>;
    /**
     * Search by pre-computed embedding
     */
    searchByEmbedding: (embedding: number[], options?: VectorSearchOptions) => Promise<VectorSearchResult[]> | VectorSearchResult[];
    /**
     * List all documents matching a filter
     */
    list: (filter?: VectorFilter) => Promise<VectorDocument[]> | VectorDocument[];
    /**
     * Get store statistics
     */
    getStats: () => Promise<VectorStoreStats> | VectorStoreStats;
    /**
     * Clear all documents
     */
    clear: () => Promise<void> | void;
}
/**
 * Type guard to check if an object implements VectorStoreContract
 */
export declare function isVectorStore(obj: unknown): obj is VectorStoreContract;
declare const _default: {
    isVectorStore: typeof isVectorStore;
};
export default _default;
//# sourceMappingURL=vector-store-interface.d.ts.map