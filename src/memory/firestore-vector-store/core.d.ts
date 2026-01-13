/**
 * Firestore Vector Store Core
 *
 * Production-grade persistent vector storage using Google Cloud Firestore's
 * native vector search capabilities.
 *
 * @module memory/firestore-vector-store/core
 */
import type { VectorStoreContract, VectorDocument, VectorFilter, VectorSearchResult } from '../vector-store-interface.js';
import type { FirestoreVectorConfig, VectorStoreHealth } from './types.js';
/**
 * FirestoreVectorStore - Production vector storage with Firestore backend.
 *
 * Features:
 * - Persistent vector storage (survives restarts)
 * - Native KNN similarity search
 * - Automatic embedding generation
 * - Fallback to in-memory when Firestore unavailable
 * - Automatic recovery attempts
 */
export declare class FirestoreVectorStore implements VectorStoreContract {
    private db;
    private config;
    private _initialized;
    private readonly COLLECTION_NAME;
    private readonly EMBEDDING_DIMENSION;
    private fallbackCache;
    private useFallback;
    private fallbackReason;
    private recoveryManager;
    private searchCache;
    constructor(config?: FirestoreVectorConfig);
    /**
     * Initialize the Firestore connection.
     */
    initialize(): Promise<void>;
    private checkCredentials;
    private setFallbackMode;
    private reinitialize;
    private onRecoverySuccess;
    get isInitialized(): boolean;
    /**
     * Get health status.
     */
    getHealth(): VectorStoreHealth;
    private ensureInitialized;
    /**
     * Add a document to the vector store.
     */
    addDocument(doc: VectorDocument): Promise<void>;
    /**
     * Add multiple documents in batch.
     */
    addDocuments(docs: VectorDocument[]): Promise<void>;
    /**
     * Remove a document from the store.
     */
    removeDocument(id: string): Promise<boolean>;
    /**
     * Get a document by ID.
     */
    getDocument(id: string): Promise<VectorDocument | undefined>;
    /**
     * Semantic search for similar documents.
     */
    search(query: string, options?: {
        topK?: number;
        filter?: VectorFilter;
        minScore?: number;
    }): Promise<VectorSearchResult[]>;
    /**
     * Search by embedding directly.
     */
    searchByEmbedding(queryEmbedding: number[], options?: {
        topK?: number;
        filter?: VectorFilter;
        minScore?: number;
    }): Promise<VectorSearchResult[]>;
    /**
     * Get all documents matching a filter.
     */
    list(filter?: VectorFilter): Promise<VectorDocument[]>;
    /**
     * Get store statistics.
     */
    getStats(): Promise<{
        documentCount: number;
        bySource: Record<string, number>;
        byCategory: Record<string, number>;
        usingFallback: boolean;
    }>;
    /**
     * Clear all documents.
     */
    clear(): Promise<void>;
    /**
     * Close the connection.
     */
    close(): Promise<void>;
    /**
     * Get search cache statistics.
     */
    getSearchCacheStats(): {
        size: number;
        maxSize: number;
        hits: number;
        misses: number;
        fuzzyHits: number;
        hitRate: number;
        evictions: number;
    };
    /**
     * Invalidate search cache for a specific user.
     */
    invalidateSearchCacheForUser(userId: string): number;
}
//# sourceMappingURL=core.d.ts.map