/**
 * Vector Store
 *
 * In-memory vector store for semantic search over embeddings.
 * Supports the persona knowledge base and conversation history.
 *
 * Implements VectorStoreContract interface for swappable backends.
 */
import { getLogger } from '../utils/safe-logger.js';
import { embed, embedBatch } from './embeddings.js';
// Centralized similarity operations - uses SIMD-ready implementation from rust-accelerator
import { topKSimilar } from './rust-accelerator.js';
// ============================================================================
// VECTOR STORE IMPLEMENTATION
// ============================================================================
/**
 * In-memory vector store for semantic search
 * Implements VectorStoreContract for swappable backends
 */
export class VectorStore {
    documents = new Map();
    embeddings = new Map();
    _initialized = false;
    /**
     * Initialize the vector store
     */
    async initialize() {
        this._initialized = true;
        getLogger().info('VectorStore initialized');
        return Promise.resolve();
    }
    /**
     * Check if initialized
     */
    get isInitialized() {
        return this._initialized;
    }
    /**
     * Add a document to the store
     */
    async addDocument(doc) {
        // Generate embedding if not provided
        if (!doc.embedding) {
            doc.embedding = await embed(doc.text);
        }
        this.documents.set(doc.id, doc);
        this.embeddings.set(doc.id, doc.embedding);
        getLogger().debug(`Added document: ${doc.id} (${doc.metadata.source})`);
    }
    /**
     * Add multiple documents in batch
     */
    async addDocuments(docs) {
        // Split into docs with and without embeddings
        const needsEmbedding = docs.filter((d) => !d.embedding);
        const hasEmbedding = docs.filter((d) => d.embedding);
        // Generate embeddings in batch
        if (needsEmbedding.length > 0) {
            const texts = needsEmbedding.map((d) => d.text);
            const embeddings = await embedBatch(texts);
            for (let i = 0; i < needsEmbedding.length; i++) {
                needsEmbedding[i].embedding = embeddings[i];
            }
        }
        // Store all documents
        for (const doc of [...needsEmbedding, ...hasEmbedding]) {
            this.documents.set(doc.id, doc);
            this.embeddings.set(doc.id, doc.embedding);
        }
        getLogger().info(`Added ${docs.length} documents to vector store`);
    }
    /**
     * Remove a document from the store
     */
    removeDocument(id) {
        const existed = this.documents.has(id);
        this.documents.delete(id);
        this.embeddings.delete(id);
        return existed;
    }
    /**
     * Get a document by ID
     */
    getDocument(id) {
        return this.documents.get(id);
    }
    /**
     * Check if filter matches document
     */
    matchesFilter(doc, filter) {
        if (!filter)
            return true;
        // Source filter
        if (filter.source) {
            const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
            if (!sources.includes(doc.metadata.source))
                return false;
        }
        // Category filter
        if (filter.category) {
            const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
            if (!doc.metadata.category || !categories.includes(doc.metadata.category))
                return false;
        }
        // User ID filter
        if (filter.userId && doc.metadata.userId !== filter.userId) {
            return false;
        }
        // Timestamp filters
        if (filter.minTimestamp && doc.metadata.timestamp) {
            if (new Date(doc.metadata.timestamp) < filter.minTimestamp)
                return false;
        }
        if (filter.maxTimestamp && doc.metadata.timestamp) {
            if (new Date(doc.metadata.timestamp) > filter.maxTimestamp)
                return false;
        }
        // Custom metadata filters
        if (filter.metadata) {
            for (const [key, value] of Object.entries(filter.metadata)) {
                if (doc.metadata[key] !== value)
                    return false;
            }
        }
        return true;
    }
    /**
     * Semantic search for similar documents
     *
     * Uses SIMD-accelerated topKSimilar for batch similarity + ranking.
     */
    async search(query, options) {
        const topK = options?.topK || 5;
        const minScore = options?.minScore || 0;
        // Generate query embedding
        const queryEmbedding = await embed(query);
        // Filter documents
        const filteredDocs = [];
        for (const [id, doc] of this.documents) {
            if (this.matchesFilter(doc, options?.filter)) {
                const docEmbedding = this.embeddings.get(id);
                if (docEmbedding) {
                    filteredDocs.push({ doc, embedding: docEmbedding });
                }
            }
        }
        if (filteredDocs.length === 0) {
            return [];
        }
        // Extract embeddings for batch comparison
        const candidateEmbeddings = filteredDocs.map(({ embedding }) => embedding);
        // Use SIMD-accelerated top-K search (computes all similarities + sorts + filters in one pass)
        const topKResult = topKSimilar(queryEmbedding, candidateEmbeddings, topK, minScore);
        // Map indices back to documents
        return topKResult.indices.map((idx, i) => ({
            document: filteredDocs[idx].doc,
            score: topKResult.similarities[i],
        }));
    }
    /**
     * Search by embedding directly (for pre-computed queries)
     *
     * Uses SIMD-accelerated topKSimilar for batch similarity + ranking.
     */
    searchByEmbedding(queryEmbedding, options) {
        const topK = options?.topK || 5;
        const minScore = options?.minScore || 0;
        // Filter documents
        const filteredDocs = [];
        for (const [id, doc] of this.documents) {
            if (this.matchesFilter(doc, options?.filter)) {
                const docEmbedding = this.embeddings.get(id);
                if (docEmbedding) {
                    filteredDocs.push({ doc, embedding: docEmbedding });
                }
            }
        }
        if (filteredDocs.length === 0) {
            return [];
        }
        // Extract embeddings for batch comparison
        const candidateEmbeddings = filteredDocs.map(({ embedding }) => embedding);
        // Use SIMD-accelerated top-K search (computes all similarities + sorts + filters in one pass)
        const topKResult = topKSimilar(queryEmbedding, candidateEmbeddings, topK, minScore);
        // Map indices back to documents
        return topKResult.indices.map((idx, i) => ({
            document: filteredDocs[idx].doc,
            score: topKResult.similarities[i],
        }));
    }
    /**
     * Get all documents matching a filter
     */
    list(filter) {
        const results = [];
        for (const doc of this.documents.values()) {
            if (this.matchesFilter(doc, filter)) {
                results.push(doc);
            }
        }
        return results;
    }
    /**
     * Get store statistics
     */
    getStats() {
        const bySource = {};
        const byCategory = {};
        for (const doc of this.documents.values()) {
            bySource[doc.metadata.source] = (bySource[doc.metadata.source] || 0) + 1;
            if (doc.metadata.category) {
                byCategory[doc.metadata.category] = (byCategory[doc.metadata.category] || 0) + 1;
            }
        }
        return {
            documentCount: this.documents.size,
            bySource,
            byCategory,
        };
    }
    /**
     * Clear all documents
     */
    clear() {
        this.documents.clear();
        this.embeddings.clear();
        getLogger().info('VectorStore cleared');
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let defaultVectorStore = null;
/**
 * Get the default vector store instance
 */
export function getVectorStore() {
    if (!defaultVectorStore) {
        defaultVectorStore = new VectorStore();
    }
    return defaultVectorStore;
}
/**
 * Reset the default vector store (for testing)
 */
export function resetVectorStore() {
    if (defaultVectorStore) {
        defaultVectorStore.clear();
        defaultVectorStore = null;
    }
}
export default VectorStore;
//# sourceMappingURL=vector-store.js.map