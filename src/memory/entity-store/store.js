/**
 * Unified Entity Store
 *
 * The single source of truth for all user memory entities.
 * Provides CRUD operations, semantic search, and graph traversal.
 *
 * @module memory/entity-store/store
 */
import { v4 as uuidv4 } from 'uuid';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { embed } from '../embeddings.js';
import { cosineSimilarity } from '../rust-accelerator.js';
import { createEntity, entityToText, tokenize } from './types.js';
const log = createLogger({ module: 'EntityStore' });
// ============================================================================
// CONSTANTS
// ============================================================================
const ENTITIES_COLLECTION = 'entities';
const RELATIONSHIPS_COLLECTION = 'entity_relationships';
const MENTIONS_COLLECTION = 'entity_mentions';
const DEFAULT_EMBEDDING_DIM = 1536;
const DEFAULT_TOP_K = 10;
const DEFAULT_MIN_SCORE = 0.3;
// ============================================================================
// ENTITY STORE
// ============================================================================
/**
 * Unified Entity Store - the foundation of superhuman memory
 */
export class EntityStore {
    db = null;
    initialized = false;
    // In-memory cache for fast access
    entityCache = new Map();
    userEntityIndex = new Map(); // userId -> entityIds
    /**
     * Initialize the store
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            const { Firestore } = await import('@google-cloud/firestore');
            this.db = new Firestore({
                projectId: process.env.GOOGLE_CLOUD_PROJECT,
                databaseId: process.env.FIRESTORE_DATABASE || '(default)',
            });
            this.initialized = true;
            log.info('✅ EntityStore initialized');
        }
        catch (error) {
            log.error({ error: String(error) }, 'Failed to initialize EntityStore');
            throw error;
        }
    }
    /**
     * Ensure initialized before operations
     */
    ensureInitialized() {
        if (!this.initialized || !this.db) {
            throw new Error('EntityStore not initialized. Call initialize() first.');
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // ENTITY CRUD
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Create a new entity
     */
    async createEntity(userId, type, name, attributes, options) {
        this.ensureInitialized();
        const id = uuidv4();
        const entityBase = createEntity(userId, type, name, attributes);
        // Generate embedding
        const textForEmbedding = entityToText({ ...entityBase, id });
        const embedding = await embed(textForEmbedding);
        const entity = {
            ...entityBase,
            id,
            embedding,
            aliases: options?.aliases ?? [],
            searchTokens: tokenize([name, ...(options?.aliases ?? [])].join(' ')),
            confidence: options?.confidence ?? 0.8,
            emotionalWeight: options?.emotionalWeight ?? 0,
            sourceConversations: options?.sourceConversation ? [options.sourceConversation] : [],
            sourcePersonas: options?.sourcePersona ? [options.sourcePersona] : [],
        };
        // Save to Firestore
        await this.db.collection(ENTITIES_COLLECTION).doc(id).set(cleanForFirestore(entity));
        // Update cache
        this.entityCache.set(id, entity);
        if (!this.userEntityIndex.has(userId)) {
            this.userEntityIndex.set(userId, new Set());
        }
        this.userEntityIndex.get(userId).add(id);
        log.info({ entityId: id, type, name, userId: userId.substring(0, 8) }, '🧠 Created entity');
        return entity;
    }
    /**
     * Get entity by ID
     */
    async getEntity(entityId) {
        // Check cache first
        if (this.entityCache.has(entityId)) {
            return this.entityCache.get(entityId);
        }
        this.ensureInitialized();
        const doc = await this.db.collection(ENTITIES_COLLECTION).doc(entityId).get();
        if (!doc.exists)
            return null;
        const entity = this.docToEntity(doc);
        this.entityCache.set(entityId, entity);
        return entity;
    }
    /**
     * Update an entity
     */
    async updateEntity(entityId, updates) {
        this.ensureInitialized();
        const existing = await this.getEntity(entityId);
        if (!existing)
            return null;
        const updated = {
            ...existing,
            ...updates,
            updatedAt: new Date(),
            lastSeen: new Date(),
            mentionCount: existing.mentionCount + 1,
        };
        // Re-embed if name or attributes changed significantly
        if (updates.canonicalName || updates.attributes || updates.aliases) {
            updated.embedding = await embed(entityToText(updated));
            updated.searchTokens = tokenize([updated.canonicalName, ...updated.aliases].join(' '));
        }
        await this.db.collection(ENTITIES_COLLECTION)
            .doc(entityId)
            .update(cleanForFirestore({
            ...updates,
            updatedAt: updated.updatedAt,
            lastSeen: updated.lastSeen,
            mentionCount: updated.mentionCount,
            embedding: updated.embedding,
            searchTokens: updated.searchTokens,
        }));
        // Update cache
        this.entityCache.set(entityId, updated);
        log.debug({ entityId, updates: Object.keys(updates) }, 'Updated entity');
        return updated;
    }
    /**
     * Delete an entity and its relationships
     */
    async deleteEntity(entityId) {
        this.ensureInitialized();
        const entity = await this.getEntity(entityId);
        if (!entity)
            return false;
        const batch = this.db.batch();
        // Delete entity
        batch.delete(this.db.collection(ENTITIES_COLLECTION).doc(entityId));
        // Delete relationships
        const relationships = await this.getEntityRelationships(entityId);
        for (const rel of relationships) {
            batch.delete(this.db.collection(RELATIONSHIPS_COLLECTION).doc(rel.id));
        }
        await batch.commit();
        // Update cache
        this.entityCache.delete(entityId);
        this.userEntityIndex.get(entity.userId)?.delete(entityId);
        log.info({ entityId }, 'Deleted entity and relationships');
        return true;
    }
    /**
     * Get all entities for a user
     */
    async getUserEntities(userId, options) {
        this.ensureInitialized();
        let query = this.db.collection(ENTITIES_COLLECTION).where('userId', '==', userId);
        if (options?.types && options.types.length > 0) {
            query = query.where('type', 'in', options.types);
        }
        if (options?.limit) {
            query = query.limit(options.limit);
        }
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => this.docToEntity(doc));
    }
    /**
     * Alias for searchEntities (for API compatibility)
     */
    async search(userId, options) {
        // If embedding provided, do vector search directly
        // Otherwise use the standard search
        const searchOptions = {
            userId,
            topK: options.limit ?? DEFAULT_TOP_K,
            minScore: options.minScore ?? DEFAULT_MIN_SCORE,
            types: options.types,
            hybrid: true,
        };
        return this.searchEntities(options.query || '', searchOptions);
    }
    /**
     * Get recently mentioned entities
     */
    async getRecentlyMentioned(userId, limit = 20) {
        this.ensureInitialized();
        const snapshot = await this.db.collection(ENTITIES_COLLECTION)
            .where('userId', '==', userId)
            .orderBy('lastSeen', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map((doc) => this.docToEntity(doc));
    }
    /**
     * Get entities by type
     */
    async getByType(userId, type, limit = 50) {
        return this.getUserEntities(userId, { types: [type], limit });
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // ENTITY SEARCH
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Semantic search for entities
     */
    async searchEntities(query, options) {
        this.ensureInitialized();
        const topK = options.topK ?? DEFAULT_TOP_K;
        const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
        // Generate query embedding
        const queryEmbedding = await embed(query);
        // ═══════════════════════════════════════════════════════════════════════
        // HYBRID SEARCH: BM25 + Vector
        // ═══════════════════════════════════════════════════════════════════════
        const [keywordResults, vectorResults] = await Promise.all([
            options.hybrid !== false ? this.bm25Search(query, options) : [],
            this.vectorSearch(queryEmbedding, options),
        ]);
        // Reciprocal Rank Fusion
        const fusedResults = this.reciprocalRankFusion([
            { results: keywordResults, weight: 0.4 },
            { results: vectorResults, weight: 0.6 },
        ], topK * 2);
        // ═══════════════════════════════════════════════════════════════════════
        // GRAPH EXPANSION (optional)
        // ═══════════════════════════════════════════════════════════════════════
        let expandedResults = fusedResults;
        if (options.expandGraph) {
            expandedResults = await this.expandWithGraph(fusedResults, options);
        }
        const weightedResults = expandedResults.map((result) => {
            const { entity, score, graphDistance = 0 } = result;
            // Temporal recency boost
            const daysSinceLastSeen = this.daysBetween(entity.lastSeen, new Date());
            const recencyScore = Math.exp(-daysSinceLastSeen / 30); // 30-day half-life
            // Emotional salience boost (decays slower)
            const { lastEmotionalPeak } = entity.temporalContext;
            const daysSinceEmotionalPeak = lastEmotionalPeak
                ? this.daysBetween(lastEmotionalPeak, new Date())
                : 365;
            const emotionalScore = Math.exp(-daysSinceEmotionalPeak / 90); // 90-day half-life
            // Graph distance penalty
            const graphPenalty = Math.pow(0.8, graphDistance);
            // Combined score
            const finalScore = (score * 0.5 + recencyScore * 0.2 + emotionalScore * 0.2 + entity.salienceScore * 0.1) *
                graphPenalty;
            return {
                entity,
                score: finalScore,
                scoreBreakdown: {
                    semantic: score,
                    keyword: result.keywordScore ?? 0,
                    temporal: recencyScore,
                    emotional: emotionalScore,
                    graphDistance,
                },
                reason: this.buildExplanation(entity, score, recencyScore, emotionalScore),
                graphPath: result.graphPath,
            };
        });
        // Filter and sort
        return weightedResults
            .filter((r) => r.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
    /**
     * BM25 keyword search
     */
    async bm25Search(query, options) {
        const tokens = tokenize(query);
        if (tokens.length === 0)
            return [];
        let dbQuery = this.db.collection(ENTITIES_COLLECTION)
            .where('userId', '==', options.userId)
            .where('searchTokens', 'array-contains-any', tokens);
        if (options.types && options.types.length > 0) {
            dbQuery = dbQuery.where('type', 'in', options.types);
        }
        const snapshot = await dbQuery.limit(50).get();
        return snapshot.docs.map((doc) => {
            const entity = this.docToEntity(doc);
            // Simple BM25 approximation: count token matches
            const entityTokens = entity.searchTokens;
            const matchCount = tokens.filter((t) => entityTokens.includes(t)).length;
            const keywordScore = matchCount / tokens.length;
            return { entity, score: keywordScore, keywordScore };
        });
    }
    /**
     * Vector similarity search
     */
    async vectorSearch(queryEmbedding, options) {
        if (!options.userId) {
            return [];
        }
        // First, get user's entities
        const entities = await this.getUserEntities(options.userId, {
            types: options.types,
            limit: 200, // Cap for performance
        });
        // Compute similarities
        const scored = entities.map((entity) => ({
            entity,
            score: cosineSimilarity(queryEmbedding, entity.embedding),
        }));
        // Sort by score and return top results
        return scored.sort((a, b) => b.score - a.score).slice(0, 50);
    }
    /**
     * Reciprocal Rank Fusion - combine multiple ranked lists
     */
    reciprocalRankFusion(rankedLists, topK) {
        const k = 60; // RRF constant
        const scores = new Map();
        for (const { results, weight } of rankedLists) {
            for (let rank = 0; rank < results.length; rank++) {
                const { entity, keywordScore } = results[rank];
                const rrfScore = weight / (k + rank + 1);
                const existing = scores.get(entity.id);
                if (existing) {
                    existing.score += rrfScore;
                    if (keywordScore)
                        existing.keywordScore = keywordScore;
                }
                else {
                    scores.set(entity.id, { entity, score: rrfScore, keywordScore });
                }
            }
        }
        return Array.from(scores.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
    /**
     * Expand results with graph relationships
     */
    async expandWithGraph(initialResults, options) {
        const maxHops = options.maxGraphHops ?? 2;
        const seen = new Set();
        const expanded = [];
        // Add initial results
        for (const result of initialResults) {
            seen.add(result.entity.id);
            expanded.push({
                ...result,
                graphDistance: 0,
                graphPath: [result.entity.id],
            });
        }
        // Expand via relationships
        for (let hop = 1; hop <= maxHops; hop++) {
            const currentLevel = expanded.filter((e) => e.graphDistance === hop - 1);
            for (const { entity, score, graphPath } of currentLevel) {
                const relationships = await this.getEntityRelationships(entity.id);
                for (const rel of relationships) {
                    const relatedId = rel.fromEntity === entity.id ? rel.toEntity : rel.fromEntity;
                    if (seen.has(relatedId))
                        continue;
                    seen.add(relatedId);
                    const relatedEntity = await this.getEntity(relatedId);
                    if (!relatedEntity || relatedEntity.userId !== options.userId)
                        continue;
                    // Score decays with hops
                    const hopDecay = Math.pow(0.7, hop);
                    const relatedScore = score * hopDecay * rel.strength;
                    expanded.push({
                        entity: relatedEntity,
                        score: relatedScore,
                        graphDistance: hop,
                        graphPath: [...graphPath, relatedId],
                    });
                }
            }
        }
        return expanded;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // RELATIONSHIP MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Create a relationship between entities
     * Uses the proper user-scoped subcollection path
     */
    async createRelationship(fromEntityId, toEntityId, type, options) {
        this.ensureInitialized();
        // Get one of the entities to determine the userId
        const fromEntity = await this.getEntity(fromEntityId);
        if (!fromEntity) {
            throw new Error(`Entity not found: ${fromEntityId}`);
        }
        // Use the storage module which has the correct subcollection path
        const { upsertRelationship } = await import('./storage.js');
        return upsertRelationship(fromEntity.userId, {
            fromEntity: fromEntityId,
            toEntity: toEntityId,
            type,
            strength: options?.strength ?? 0.5,
            firstLinked: new Date(),
            lastReinforced: new Date(),
            reinforcementCount: 1,
            context: options?.context,
            bidirectional: options?.bidirectional ?? false,
        });
    }
    /**
     * Get relationships for an entity
     * Note: Requires userId to locate the entity first, then uses the correct subcollection path
     */
    async getEntityRelationships(entityId) {
        this.ensureInitialized();
        // First get the entity to find its userId
        const entity = await this.getEntity(entityId);
        if (!entity) {
            log.warn({ entityId }, 'Entity not found when fetching relationships');
            return [];
        }
        // Use the storage module which has the correct subcollection path
        const { getRelationshipsForEntity } = await import('./storage.js');
        return getRelationshipsForEntity(entity.userId, entityId);
    }
    /**
     * Reinforce a relationship (increase strength)
     */
    async reinforceRelationship(relationshipId) {
        this.ensureInitialized();
        const docRef = this.db.collection(RELATIONSHIPS_COLLECTION).doc(relationshipId);
        const doc = await docRef.get();
        const data = doc.data();
        if (!doc.exists || !data)
            return;
        const rel = data;
        const newStrength = Math.min(1.0, rel.strength + 0.1);
        await docRef.update({
            strength: newStrength,
            lastReinforced: new Date(),
            reinforcementCount: rel.reinforcementCount + 1,
        });
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // MENTION TRACKING
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Record a mention of an entity
     */
    async recordMention(entityId, context) {
        this.ensureInitialized();
        const mention = {
            id: uuidv4(),
            entityId,
            userId: context.userId,
            conversationId: context.conversationId,
            sessionId: context.sessionId,
            personaId: context.personaId,
            timestamp: new Date(),
            snippet: context.snippet,
            emotionalWeight: context.emotionalWeight ?? 0,
            mentionContext: context.mentionContext ?? 'direct',
        };
        await this.db.collection(MENTIONS_COLLECTION).doc(mention.id).set(cleanForFirestore(mention));
        // Update entity's lastSeen and mentionCount
        await this.updateEntity(entityId, {
            lastSeen: new Date(),
            sourceConversations: [context.conversationId],
            sourcePersonas: [context.personaId],
        });
        // If emotionally significant, update temporal context
        if (context.emotionalWeight && context.emotionalWeight > 0.7) {
            const entity = await this.getEntity(entityId);
            if (entity) {
                await this.updateEntity(entityId, {
                    temporalContext: {
                        ...entity.temporalContext,
                        peakMoments: [...entity.temporalContext.peakMoments, new Date()].slice(-10),
                        lastEmotionalPeak: new Date(),
                    },
                });
            }
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // ENTITY RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Find or create entity by name/alias
     *
     * This is the key to solving the fragmentation problem:
     * "my brother" should always resolve to the same entity
     */
    async resolveEntity(userId, name, type, hints) {
        this.ensureInitialized();
        // First, try exact name/alias match
        const exactMatch = await this.findEntityByNameOrAlias(userId, name, type);
        if (exactMatch) {
            return { entity: exactMatch, isNew: false };
        }
        // Try semantic similarity for fuzzy matching
        const semanticMatches = await this.searchEntities(name, {
            userId,
            types: [type],
            topK: 5,
            minScore: 0.8, // High threshold for entity resolution
        });
        if (semanticMatches.length > 0 && semanticMatches[0].score > 0.85) {
            // Found a good match - add this name as an alias
            const matched = semanticMatches[0].entity;
            if (!matched.aliases.includes(name.toLowerCase())) {
                await this.updateEntity(matched.id, {
                    aliases: [...matched.aliases, name.toLowerCase()],
                });
            }
            return { entity: matched, isNew: false };
        }
        // No match - create new entity
        const attributes = this.buildAttributesForType(type, hints);
        const newEntity = await this.createEntity(userId, type, name, attributes, {
            aliases: hints?.relationship ? [hints.relationship] : [],
        });
        return { entity: newEntity, isNew: true };
    }
    /**
     * Find entity by exact name or alias
     */
    async findEntityByNameOrAlias(userId, name, type) {
        const normalizedName = name.toLowerCase().trim();
        // Search by canonical name
        const byName = await this.db.collection(ENTITIES_COLLECTION)
            .where('userId', '==', userId)
            .where('type', '==', type)
            .where('canonicalName', '==', name)
            .limit(1)
            .get();
        if (!byName.empty) {
            return this.docToEntity(byName.docs[0]);
        }
        // Search by alias
        const byAlias = await this.db.collection(ENTITIES_COLLECTION)
            .where('userId', '==', userId)
            .where('type', '==', type)
            .where('aliases', 'array-contains', normalizedName)
            .limit(1)
            .get();
        if (!byAlias.empty) {
            return this.docToEntity(byAlias.docs[0]);
        }
        return null;
    }
    /**
     * Build default attributes for entity type
     */
    buildAttributesForType(type, hints) {
        switch (type) {
            case 'person':
                return {
                    _type: 'person',
                    relationship: hints?.relationship ?? 'unknown',
                    relationshipCategory: 'other',
                    sentiment: 0,
                };
            case 'commitment':
                return {
                    _type: 'commitment',
                    commitmentType: 'intention',
                    status: 'active',
                    relatedPeople: [],
                    accountability: 'self',
                    originalStatement: hints?.context ?? '',
                };
            case 'event':
                return {
                    _type: 'event',
                    eventType: 'other',
                    isRecurring: false,
                    relatedPeople: [],
                    emotionalSignificance: 'meaningful',
                    status: 'planned',
                };
            case 'value':
                return {
                    _type: 'value',
                    valueCategory: 'other',
                    strength: 'mentioned',
                };
            case 'dream':
                return {
                    _type: 'dream',
                    dreamCategory: 'other',
                    status: 'someday',
                };
            case 'pattern':
                return {
                    _type: 'pattern',
                    patternType: 'behavioral',
                    description: hints?.context ?? '',
                    evidence: [],
                    patternConfidence: 0.5,
                    userAware: false,
                    shouldSurface: true,
                };
            case 'preference':
                return {
                    _type: 'preference',
                    preferenceCategory: 'other',
                    preference: hints?.context ?? '',
                    source: 'inferred',
                    inferenceConfidence: 0.5,
                };
            case 'memory':
                return {
                    _type: 'memory',
                    memoryType: 'insight',
                    content: hints?.context ?? '',
                    emotionalIntensity: 0.5,
                    peopleMentioned: [],
                    topics: [],
                };
            case 'topic':
                return {
                    _type: 'topic',
                    topicCategory: 'other',
                    sentiment: 'neutral',
                    frequency: 'occasionally',
                };
            case 'emotion':
                return {
                    _type: 'emotion',
                    emotionType: 'other',
                };
            case 'goal':
                return {
                    _type: 'goal',
                    goalCategory: 'other',
                    status: 'planning',
                    progress: 0,
                };
            case 'place':
                return {
                    _type: 'place',
                    placeType: 'other',
                };
            default:
                throw new Error(`Unknown entity type: ${type}`);
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    docToEntity(doc) {
        const data = doc.data();
        return {
            ...data,
            id: doc.id,
            firstSeen: this.toDate(data.firstSeen),
            lastSeen: this.toDate(data.lastSeen),
            createdAt: this.toDate(data.createdAt),
            updatedAt: this.toDate(data.updatedAt),
            temporalContext: {
                ...data.temporalContext,
                peakMoments: (data.temporalContext?.peakMoments ?? []).map((d) => this.toDate(d)),
                lastEmotionalPeak: data.temporalContext?.lastEmotionalPeak
                    ? this.toDate(data.temporalContext.lastEmotionalPeak)
                    : undefined,
            },
        };
    }
    toDate(value) {
        if (value instanceof Date)
            return value;
        if (typeof value === 'string')
            return new Date(value);
        if (value && typeof value === 'object' && 'toDate' in value) {
            return value.toDate();
        }
        return new Date();
    }
    daysBetween(date1, date2) {
        const msPerDay = 24 * 60 * 60 * 1000;
        return Math.abs((date2.getTime() - date1.getTime()) / msPerDay);
    }
    buildExplanation(entity, semanticScore, recencyScore, emotionalScore) {
        const reasons = [];
        if (semanticScore > 0.7) {
            reasons.push('highly relevant to query');
        }
        else if (semanticScore > 0.5) {
            reasons.push('related to query');
        }
        if (recencyScore > 0.7) {
            reasons.push('recently mentioned');
        }
        if (emotionalScore > 0.7) {
            reasons.push('emotionally significant');
        }
        if (entity.salienceScore > 0.7) {
            reasons.push('important overall');
        }
        return reasons.length > 0
            ? `Retrieved because: ${reasons.join(', ')}`
            : 'Retrieved based on similarity';
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let entityStoreInstance = null;
/**
 * Get the singleton EntityStore instance
 */
export function getEntityStore() {
    if (!entityStoreInstance) {
        entityStoreInstance = new EntityStore();
    }
    return entityStoreInstance;
}
/**
 * Initialize the EntityStore
 */
export async function initializeEntityStore() {
    const store = getEntityStore();
    await store.initialize();
    return store;
}
//# sourceMappingURL=store.js.map