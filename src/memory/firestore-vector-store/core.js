/**
 * Firestore Vector Store Core
 *
 * Production-grade persistent vector storage using Google Cloud Firestore's
 * native vector search capabilities.
 *
 * @module memory/firestore-vector-store/core
 */
import { getLogger } from '../../utils/safe-logger.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { embed, embedBatch } from '../embeddings.js';
// Centralized similarity operations - uses SIMD-ready implementation from rust-accelerator
import { topKSimilar } from '../rust-accelerator.js';
import { DEFAULT_COLLECTION_NAME, DEFAULT_EMBEDDING_DIMENSION } from './types.js';
import { extractEmbedding } from './helpers.js';
import { FallbackCache } from './fallback-cache.js';
import { RecoveryManager, migrateCacheToFirestore } from './recovery.js';
import { getVectorSearchCache } from './search-cache.js';
const log = getLogger();
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
export class FirestoreVectorStore {
    db = null;
    config;
    _initialized = false;
    COLLECTION_NAME;
    EMBEDDING_DIMENSION;
    fallbackCache;
    useFallback = false;
    fallbackReason = null;
    recoveryManager;
    searchCache;
    constructor(config) {
        this.config = {
            projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
            databaseId: process.env.FIRESTORE_DATABASE || '(default)',
            collectionName: DEFAULT_COLLECTION_NAME,
            embeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
            ...config,
        };
        this.COLLECTION_NAME = this.config.collectionName || DEFAULT_COLLECTION_NAME;
        this.EMBEDDING_DIMENSION = this.config.embeddingDimension || DEFAULT_EMBEDDING_DIMENSION;
        this.fallbackCache = new FallbackCache();
        this.recoveryManager = new RecoveryManager({
            reinitialize: () => this.reinitialize(),
            onRecoverySuccess: () => this.onRecoverySuccess(),
            isInFallbackMode: () => this.useFallback,
        });
        this.searchCache = getVectorSearchCache();
    }
    /**
     * Initialize the Firestore connection.
     */
    async initialize() {
        if (this._initialized)
            return;
        const hasCredentials = this.checkCredentials();
        if (!hasCredentials && process.env.NODE_ENV !== 'production') {
            this.setFallbackMode('No Google Cloud credentials found');
            this._initialized = true;
            return;
        }
        try {
            const { Firestore } = await import('@google-cloud/firestore');
            this.db = new Firestore({
                projectId: this.config.projectId,
                databaseId: this.config.databaseId,
            });
            // Test if vector search is available
            const testRef = this.db.collection(this.COLLECTION_NAME);
            if (!testRef.findNearest) {
                this.setFallbackMode('Firestore SDK too old or vector index not created');
            }
            // Test connectivity
            try {
                await testRef.limit(1).get();
            }
            catch (connError) {
                this.setFallbackMode(`Firestore connectivity failed: ${connError}`);
                this.db = null;
            }
            this._initialized = true;
            if (this.useFallback) {
                this.recoveryManager.scheduleRecoveryAttempt();
            }
            else {
                log.info({ collection: this.COLLECTION_NAME, healthy: true }, '✅ FirestoreVectorStore initialized successfully');
            }
        }
        catch (error) {
            this.setFallbackMode(`Initialization error: ${error}`);
            this._initialized = true;
            this.recoveryManager.scheduleRecoveryAttempt();
        }
    }
    checkCredentials() {
        return !!(process.env.GOOGLE_APPLICATION_CREDENTIALS ||
            process.env.GCLOUD_SERVICE_KEY ||
            process.env.K_SERVICE ||
            process.env.GCE_METADATA_HOST);
    }
    setFallbackMode(reason) {
        this.useFallback = true;
        this.fallbackReason = reason;
        log.warn({
            reason,
            risk: 'DATA_LOSS_ON_RESTART',
            mode: 'in-memory',
        }, '⚠️ CRITICAL: Vector store running in fallback mode!');
    }
    async reinitialize() {
        this._initialized = false;
        this.useFallback = false;
        this.fallbackReason = null;
        this.db = null;
        await this.initialize();
        return !this.useFallback;
    }
    async onRecoverySuccess() {
        if (this.fallbackCache.size > 0 && this.db) {
            await migrateCacheToFirestore(this.db, this.COLLECTION_NAME, this.fallbackCache);
        }
    }
    get isInitialized() {
        return this._initialized;
    }
    /**
     * Get health status.
     */
    getHealth() {
        const recoveryState = this.recoveryManager.getState();
        return {
            healthy: this._initialized && !this.useFallback,
            initialized: this._initialized,
            usingFallback: this.useFallback,
            fallbackReason: this.fallbackReason,
            risk: this.useFallback ? 'data_loss' : 'none',
            recoveryAttempts: recoveryState.recoveryAttemptCount,
            lastRecoveryAttempt: recoveryState.lastRecoveryAttempt || null,
            cacheSize: this.fallbackCache.size,
        };
    }
    async ensureInitialized() {
        if (this._initialized)
            return;
        await this.initialize();
    }
    /**
     * Add a document to the vector store.
     */
    async addDocument(doc) {
        await this.ensureInitialized();
        let { embedding } = doc;
        if (!embedding) {
            try {
                embedding = await embed(doc.text);
            }
            catch (error) {
                log.warn({ docId: doc.id, error: String(error) }, 'Failed to generate embedding');
                return;
            }
        }
        if (this.useFallback || !this.db) {
            this.fallbackCache.add(doc.id, doc, embedding);
            return;
        }
        try {
            const docRef = this.db.collection(this.COLLECTION_NAME).doc(doc.id);
            const { FieldValue } = await import('@google-cloud/firestore');
            await docRef.set(removeUndefined({
                text: doc.text,
                embedding: FieldValue.vector(embedding),
                metadata: doc.metadata,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        }
        catch (error) {
            log.error({ docId: doc.id, error: String(error) }, 'Failed to add document');
            this.fallbackCache.add(doc.id, doc, embedding);
        }
    }
    /**
     * Add multiple documents in batch.
     */
    async addDocuments(docs) {
        const needsEmbedding = docs.filter((d) => !d.embedding);
        const hasEmbedding = docs.filter((d) => d.embedding);
        if (needsEmbedding.length > 0) {
            try {
                const texts = needsEmbedding.map((d) => d.text);
                const embeddings = await embedBatch(texts);
                for (let i = 0; i < needsEmbedding.length; i++) {
                    needsEmbedding[i].embedding = embeddings[i];
                }
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Batch embedding failed');
                return;
            }
        }
        const allDocs = [...needsEmbedding, ...hasEmbedding];
        for (const doc of allDocs) {
            await this.addDocument(doc);
        }
        log.info({ count: allDocs.length }, 'Added documents to vector store');
    }
    /**
     * Remove a document from the store.
     */
    async removeDocument(id) {
        await this.ensureInitialized();
        this.fallbackCache.delete(id);
        if (this.useFallback || !this.db) {
            return true;
        }
        try {
            const docRef = this.db.collection(this.COLLECTION_NAME).doc(id);
            await docRef.delete();
            return true;
        }
        catch (error) {
            log.error({ docId: id, error: String(error) }, 'Failed to remove document');
            return false;
        }
    }
    /**
     * Get a document by ID.
     */
    async getDocument(id) {
        await this.ensureInitialized();
        const cached = this.fallbackCache.get(id);
        if (cached)
            return cached.doc;
        if (this.useFallback || !this.db) {
            return undefined;
        }
        try {
            const docRef = this.db.collection(this.COLLECTION_NAME).doc(id);
            const snapshot = await docRef.get();
            if (!snapshot.exists)
                return undefined;
            const data = snapshot.data();
            if (!data)
                return undefined;
            const embedding = extractEmbedding(data.embedding, this.EMBEDDING_DIMENSION, snapshot.id);
            if (!embedding)
                return undefined;
            return {
                id: snapshot.id,
                text: data.text,
                embedding,
                metadata: data.metadata,
            };
        }
        catch (error) {
            log.error({ docId: id, error: String(error) }, 'Failed to get document');
            return undefined;
        }
    }
    /**
     * Semantic search for similar documents.
     */
    async search(query, options) {
        await this.ensureInitialized();
        const topK = options?.topK || 5;
        const minScore = options?.minScore || 0;
        let queryEmbedding;
        try {
            queryEmbedding = await embed(query);
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Failed to generate query embedding');
            return [];
        }
        // Check search cache first (exact or fuzzy match)
        const cachedResults = this.searchCache.get(query, queryEmbedding, options?.filter, { topK, minScore });
        if (cachedResults) {
            return cachedResults;
        }
        if (this.useFallback || !this.db) {
            const fallbackResults = this.fallbackCache.search(queryEmbedding, topK, options?.filter, minScore);
            // Cache fallback results too
            this.searchCache.set(query, queryEmbedding, fallbackResults, options?.filter, { topK, minScore });
            return fallbackResults;
        }
        try {
            const collRef = this.db.collection(this.COLLECTION_NAME);
            if (collRef.findNearest) {
                // Apply filters BEFORE findNearest (VectorQuery doesn't support .where())
                // Type is CollectionReference which supports where() and findNearest()
                let baseQuery = collRef;
                if (options?.filter?.source) {
                    const sources = Array.isArray(options.filter.source)
                        ? options.filter.source
                        : [options.filter.source];
                    if (sources.length === 1) {
                        baseQuery = baseQuery.where('metadata.source', '==', sources[0]);
                    }
                }
                if (options?.filter?.userId) {
                    baseQuery = baseQuery.where('metadata.userId', '==', options.filter.userId);
                }
                // Cast back to CollectionReference to access findNearest
                // Non-null assertion is safe here because we're inside the if (collRef.findNearest) check
                const searchQuery = baseQuery.findNearest({
                    vectorField: 'embedding',
                    queryVector: queryEmbedding,
                    limit: topK * 2,
                    distanceMeasure: 'COSINE',
                });
                const snapshot = await searchQuery.get();
                // Extract documents and embeddings for batch processing
                const candidateDocs = [];
                const candidateEmbeddings = [];
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    if (!data)
                        continue;
                    const docEmbedding = extractEmbedding(data.embedding, this.EMBEDDING_DIMENSION, doc.id);
                    if (!docEmbedding)
                        continue;
                    candidateDocs.push({
                        id: doc.id,
                        text: data.text,
                        embedding: docEmbedding,
                        metadata: data.metadata,
                    });
                    candidateEmbeddings.push(docEmbedding);
                }
                if (candidateDocs.length === 0) {
                    // Cache empty results too (to avoid repeated queries)
                    this.searchCache.set(query, queryEmbedding, [], options?.filter, { topK, minScore });
                    return [];
                }
                // Use SIMD-accelerated top-K search (computes all similarities + sorts + filters in one pass)
                const topKResult = topKSimilar(queryEmbedding, candidateEmbeddings, topK, minScore);
                // Map indices back to documents
                const results = topKResult.indices.map((idx, i) => ({
                    document: {
                        id: candidateDocs[idx].id,
                        text: candidateDocs[idx].text,
                        embedding: candidateDocs[idx].embedding,
                        metadata: candidateDocs[idx].metadata,
                    },
                    score: topKResult.similarities[i],
                }));
                // Cache the results
                this.searchCache.set(query, queryEmbedding, results, options?.filter, { topK, minScore });
                return results;
            }
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Firestore search failed, using fallback');
        }
        const fallbackResults = this.fallbackCache.search(queryEmbedding, topK, options?.filter, minScore);
        this.searchCache.set(query, queryEmbedding, fallbackResults, options?.filter, { topK, minScore });
        return fallbackResults;
    }
    /**
     * Search by embedding directly.
     */
    async searchByEmbedding(queryEmbedding, options) {
        await this.ensureInitialized();
        const topK = options?.topK || 5;
        const minScore = options?.minScore || 0;
        // Check cache (uses embedding-based fuzzy matching since no query text)
        const cacheKey = '[embedding]'; // Placeholder - fuzzy matching uses embedding
        const cachedResults = this.searchCache.get(cacheKey, queryEmbedding, options?.filter, { topK, minScore });
        if (cachedResults) {
            return cachedResults;
        }
        if (this.useFallback || !this.db) {
            const fallbackResults = this.fallbackCache.search(queryEmbedding, topK, options?.filter, minScore);
            this.searchCache.set(cacheKey, queryEmbedding, fallbackResults, options?.filter, { topK, minScore });
            return fallbackResults;
        }
        try {
            const collRef = this.db.collection(this.COLLECTION_NAME);
            if (collRef.findNearest) {
                // Request more results to allow for minScore filtering
                const searchQuery = collRef.findNearest({
                    vectorField: 'embedding',
                    queryVector: queryEmbedding,
                    limit: topK * 2,
                    distanceMeasure: 'COSINE',
                });
                const snapshot = await searchQuery.get();
                // Extract documents and embeddings for batch processing
                const candidateDocs = [];
                const candidateEmbeddings = [];
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    if (!data)
                        continue;
                    const docEmbedding = extractEmbedding(data.embedding, this.EMBEDDING_DIMENSION, doc.id);
                    if (!docEmbedding)
                        continue;
                    candidateDocs.push({
                        id: doc.id,
                        text: data.text,
                        embedding: docEmbedding,
                        metadata: data.metadata,
                    });
                    candidateEmbeddings.push(docEmbedding);
                }
                if (candidateDocs.length === 0) {
                    this.searchCache.set(cacheKey, queryEmbedding, [], options?.filter, { topK, minScore });
                    return [];
                }
                // Use SIMD-accelerated top-K search (computes all similarities + sorts + filters in one pass)
                const topKResult = topKSimilar(queryEmbedding, candidateEmbeddings, topK, minScore);
                // Map indices back to documents
                const results = topKResult.indices.map((idx, i) => ({
                    document: {
                        id: candidateDocs[idx].id,
                        text: candidateDocs[idx].text,
                        embedding: candidateDocs[idx].embedding,
                        metadata: candidateDocs[idx].metadata,
                    },
                    score: topKResult.similarities[i],
                }));
                this.searchCache.set(cacheKey, queryEmbedding, results, options?.filter, { topK, minScore });
                return results;
            }
        }
        catch (error) {
            log.warn({ error: String(error) }, 'searchByEmbedding failed');
        }
        const fallbackResults = this.fallbackCache.search(queryEmbedding, topK, options?.filter, minScore);
        this.searchCache.set(cacheKey, queryEmbedding, fallbackResults, options?.filter, { topK, minScore });
        return fallbackResults;
    }
    /**
     * Get all documents matching a filter.
     */
    async list(filter) {
        await this.ensureInitialized();
        const results = this.fallbackCache.list(filter);
        if (this.useFallback || !this.db) {
            return results;
        }
        try {
            let query = this.db.collection(this.COLLECTION_NAME);
            if (filter?.source) {
                const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
                if (sources.length === 1) {
                    query = query.where('metadata.source', '==', sources[0]);
                }
            }
            if (filter?.userId) {
                query = query.where('metadata.userId', '==', filter.userId);
            }
            const PAGE_SIZE = 500;
            const snapshot = await query.limit(PAGE_SIZE).get();
            if (snapshot.size === PAGE_SIZE) {
                log.warn({ limit: PAGE_SIZE, filter }, 'list() result may be truncated - consider pagination');
            }
            for (const doc of snapshot.docs) {
                const data = doc.data();
                if (!data)
                    continue;
                const embedding = extractEmbedding(data.embedding, this.EMBEDDING_DIMENSION, doc.id);
                if (!embedding)
                    continue;
                results.push({
                    id: doc.id,
                    text: data.text,
                    embedding,
                    metadata: data.metadata,
                });
            }
        }
        catch (error) {
            log.error({ error: String(error) }, 'list failed');
        }
        return results;
    }
    /**
     * Get store statistics.
     */
    async getStats() {
        await this.ensureInitialized();
        const cacheStats = this.fallbackCache.getStats();
        let documentCount = cacheStats.count;
        const bySource = { ...cacheStats.bySource };
        const byCategory = { ...cacheStats.byCategory };
        if (!this.useFallback && this.db) {
            try {
                const snapshot = await this.db.collection(this.COLLECTION_NAME).get();
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    if (!data?.metadata)
                        continue;
                    documentCount++;
                    const meta = data.metadata;
                    bySource[meta.source] = (bySource[meta.source] || 0) + 1;
                    if (meta.category) {
                        byCategory[meta.category] = (byCategory[meta.category] || 0) + 1;
                    }
                }
            }
            catch (error) {
                log.warn({ error: String(error) }, 'getStats failed');
            }
        }
        return { documentCount, bySource, byCategory, usingFallback: this.useFallback };
    }
    /**
     * Clear all documents.
     */
    async clear() {
        await this.ensureInitialized();
        this.fallbackCache.clear();
        this.searchCache.clear();
        if (this.useFallback || !this.db)
            return;
        try {
            const snapshot = await this.db.collection(this.COLLECTION_NAME).get();
            for (const doc of snapshot.docs) {
                await doc.ref?.delete?.();
            }
            log.info('Cleared all vectors from Firestore');
        }
        catch (error) {
            log.error({ error: String(error) }, 'clear failed');
        }
    }
    /**
     * Close the connection.
     */
    async close() {
        this.recoveryManager.cleanupTimer();
        if (this.db) {
            await this.db.terminate();
            this.db = null;
        }
        this.fallbackCache.clear();
        this.searchCache.clear();
        this._initialized = false;
        this.useFallback = false;
        this.fallbackReason = null;
        this.recoveryManager.reset();
    }
    /**
     * Get search cache statistics.
     */
    getSearchCacheStats() {
        return this.searchCache.getStats();
    }
    /**
     * Invalidate search cache for a specific user.
     */
    invalidateSearchCacheForUser(userId) {
        return this.searchCache.invalidateForUser(userId);
    }
}
//# sourceMappingURL=core.js.map