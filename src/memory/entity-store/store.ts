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
import type {
  Entity,
  EdgeType,
  EntityAttributes,
  EntityMention,
  EntityRelationship,
  EntitySearchOptions,
  EntitySearchResult,
  EntityType,
} from './types.js';
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
// FIRESTORE TYPES
// ============================================================================

interface FirestoreInstance {
  collection: (path: string) => CollectionRef;
  batch: () => WriteBatch;
}

interface CollectionRef {
  doc: (id?: string) => DocRef;
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
  findNearest?: (
    field: string,
    vector: number[],
    options: { limit: number; distanceMeasure: string }
  ) => Query;
}

interface DocRef {
  id: string;
  get: () => Promise<DocSnapshot>;
  set: (data: unknown) => Promise<void>;
  update: (data: unknown) => Promise<void>;
  delete: () => Promise<void>;
  collection: (name: string) => CollectionRef;
}

interface DocSnapshot {
  exists: boolean;
  id: string;
  data: () => Record<string, unknown> | undefined;
}

interface Query {
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocSnapshot[];
  size: number;
}

interface WriteBatch {
  set: (ref: DocRef, data: unknown) => WriteBatch;
  update: (ref: DocRef, data: unknown) => WriteBatch;
  delete: (ref: DocRef) => WriteBatch;
  commit: () => Promise<void>;
}

// ============================================================================
// ENTITY STORE
// ============================================================================

/**
 * Unified Entity Store - the foundation of superhuman memory
 */
export class EntityStore {
  private db: FirestoreInstance | null = null;
  private initialized = false;

  // In-memory cache for fast access
  private entityCache = new Map<string, Entity>();
  private userEntityIndex = new Map<string, Set<string>>(); // userId -> entityIds

  /**
   * Initialize the store
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { Firestore } = await import('@google-cloud/firestore');
      this.db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      }) as unknown as FirestoreInstance;

      this.initialized = true;
      log.info('✅ EntityStore initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize EntityStore');
      throw error;
    }
  }

  /**
   * Ensure initialized before operations
   */
  private ensureInitialized(): void {
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
  async createEntity(
    userId: string,
    type: EntityType,
    name: string,
    attributes: EntityAttributes,
    options?: {
      aliases?: string[];
      confidence?: number;
      emotionalWeight?: number;
      sourceConversation?: string;
      sourcePersona?: string;
    }
  ): Promise<Entity> {
    this.ensureInitialized();

    const id = uuidv4();
    const entityBase = createEntity(userId, type, name, attributes);

    // Generate embedding
    const textForEmbedding = entityToText({ ...entityBase, id } as Entity);
    const embedding = await embed(textForEmbedding);

    const entity: Entity = {
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
    await this.db!.collection(ENTITIES_COLLECTION).doc(id).set(cleanForFirestore(entity));

    // Update cache
    this.entityCache.set(id, entity);
    if (!this.userEntityIndex.has(userId)) {
      this.userEntityIndex.set(userId, new Set());
    }
    this.userEntityIndex.get(userId)!.add(id);

    log.info({ entityId: id, type, name, userId: userId.substring(0, 8) }, '🧠 Created entity');

    return entity;
  }

  /**
   * Get entity by ID
   */
  async getEntity(entityId: string): Promise<Entity | null> {
    // Check cache first
    if (this.entityCache.has(entityId)) {
      return this.entityCache.get(entityId)!;
    }

    this.ensureInitialized();

    const doc = await this.db!.collection(ENTITIES_COLLECTION).doc(entityId).get();

    if (!doc.exists) return null;

    const entity = this.docToEntity(doc);
    this.entityCache.set(entityId, entity);
    return entity;
  }

  /**
   * Update an entity
   */
  async updateEntity(
    entityId: string,
    updates: Partial<Omit<Entity, 'id' | 'userId' | 'createdAt'>>
  ): Promise<Entity | null> {
    this.ensureInitialized();

    const existing = await this.getEntity(entityId);
    if (!existing) return null;

    const updated: Entity = {
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

    await this.db!.collection(ENTITIES_COLLECTION)
      .doc(entityId)
      .update(
        cleanForFirestore({
          ...updates,
          updatedAt: updated.updatedAt,
          lastSeen: updated.lastSeen,
          mentionCount: updated.mentionCount,
          embedding: updated.embedding,
          searchTokens: updated.searchTokens,
        })
      );

    // Update cache
    this.entityCache.set(entityId, updated);

    log.debug({ entityId, updates: Object.keys(updates) }, 'Updated entity');

    return updated;
  }

  /**
   * Delete an entity and its relationships
   */
  async deleteEntity(entityId: string): Promise<boolean> {
    this.ensureInitialized();

    const entity = await this.getEntity(entityId);
    if (!entity) return false;

    const batch = this.db!.batch();

    // Delete entity
    batch.delete(this.db!.collection(ENTITIES_COLLECTION).doc(entityId));

    // Delete relationships
    const relationships = await this.getEntityRelationships(entityId);
    for (const rel of relationships) {
      batch.delete(this.db!.collection(RELATIONSHIPS_COLLECTION).doc(rel.id));
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
  async getUserEntities(
    userId: string,
    options?: { types?: EntityType[]; limit?: number }
  ): Promise<Entity[]> {
    this.ensureInitialized();

    let query = this.db!.collection(ENTITIES_COLLECTION).where('userId', '==', userId);

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
  async search(
    userId: string,
    options: {
      embedding?: number[];
      query?: string;
      limit?: number;
      minScore?: number;
      types?: EntityType[];
    }
  ): Promise<EntitySearchResult[]> {
    // If embedding provided, do vector search directly
    // Otherwise use the standard search
    const searchOptions: EntitySearchOptions = {
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
  async getRecentlyMentioned(userId: string, limit = 20): Promise<Entity[]> {
    this.ensureInitialized();

    const snapshot = await this.db!.collection(ENTITIES_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('lastSeen', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => this.docToEntity(doc));
  }

  /**
   * Get entities by type
   */
  async getByType(userId: string, type: EntityType, limit = 50): Promise<Entity[]> {
    return this.getUserEntities(userId, { types: [type], limit });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Semantic search for entities
   */
  async searchEntities(query: string, options: EntitySearchOptions): Promise<EntitySearchResult[]> {
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
    const fusedResults = this.reciprocalRankFusion(
      [
        { results: keywordResults, weight: 0.4 },
        { results: vectorResults, weight: 0.6 },
      ],
      topK * 2
    );

    // ═══════════════════════════════════════════════════════════════════════
    // GRAPH EXPANSION (optional)
    // ═══════════════════════════════════════════════════════════════════════

    let expandedResults = fusedResults;

    if (options.expandGraph) {
      expandedResults = await this.expandWithGraph(fusedResults, options);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEMPORAL & EMOTIONAL WEIGHTING
    // ═══════════════════════════════════════════════════════════════════════

    interface SearchResultWithGraph {
      entity: Entity;
      score: number;
      keywordScore?: number;
      graphDistance?: number;
      graphPath?: string[];
    }
    const weightedResults = (expandedResults as SearchResultWithGraph[]).map((result) => {
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
      const finalScore =
        (score * 0.5 + recencyScore * 0.2 + emotionalScore * 0.2 + entity.salienceScore * 0.1) *
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
  private async bm25Search(
    query: string,
    options: EntitySearchOptions
  ): Promise<Array<{ entity: Entity; score: number; keywordScore: number }>> {
    const tokens = tokenize(query);

    if (tokens.length === 0) return [];

    let dbQuery = this.db!.collection(ENTITIES_COLLECTION)
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
  private async vectorSearch(
    queryEmbedding: number[],
    options: EntitySearchOptions
  ): Promise<Array<{ entity: Entity; score: number }>> {
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
  private reciprocalRankFusion(
    rankedLists: Array<{
      results: Array<{ entity: Entity; score: number; keywordScore?: number }>;
      weight: number;
    }>,
    topK: number
  ): Array<{ entity: Entity; score: number; keywordScore?: number }> {
    const k = 60; // RRF constant
    const scores = new Map<string, { entity: Entity; score: number; keywordScore?: number }>();

    for (const { results, weight } of rankedLists) {
      for (let rank = 0; rank < results.length; rank++) {
        const { entity, keywordScore } = results[rank];
        const rrfScore = weight / (k + rank + 1);
        const existing = scores.get(entity.id);

        if (existing) {
          existing.score += rrfScore;
          if (keywordScore) existing.keywordScore = keywordScore;
        } else {
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
  private async expandWithGraph(
    initialResults: Array<{ entity: Entity; score: number; keywordScore?: number }>,
    options: EntitySearchOptions
  ): Promise<
    Array<{
      entity: Entity;
      score: number;
      keywordScore?: number;
      graphDistance: number;
      graphPath?: string[];
    }>
  > {
    const maxHops = options.maxGraphHops ?? 2;
    const seen = new Set<string>();
    const expanded: Array<{
      entity: Entity;
      score: number;
      keywordScore?: number;
      graphDistance: number;
      graphPath: string[];
    }> = [];

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

          if (seen.has(relatedId)) continue;
          seen.add(relatedId);

          const relatedEntity = await this.getEntity(relatedId);
          if (!relatedEntity || relatedEntity.userId !== options.userId) continue;

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
   */
  async createRelationship(
    fromEntityId: string,
    toEntityId: string,
    type: EdgeType,
    options?: {
      strength?: number;
      context?: string;
      bidirectional?: boolean;
    }
  ): Promise<EntityRelationship> {
    this.ensureInitialized();

    const id = uuidv4();
    const now = new Date();

    const relationship: EntityRelationship = {
      id,
      fromEntity: fromEntityId,
      toEntity: toEntityId,
      type,
      strength: options?.strength ?? 0.5,
      firstLinked: now,
      lastReinforced: now,
      reinforcementCount: 1,
      context: options?.context,
      bidirectional: options?.bidirectional ?? false,
    };

    await this.db!.collection(RELATIONSHIPS_COLLECTION)
      .doc(id)
      .set(cleanForFirestore(relationship));

    log.debug(
      { relationshipId: id, from: fromEntityId, to: toEntityId, type },
      'Created relationship'
    );

    return relationship;
  }

  /**
   * Get relationships for an entity
   */
  async getEntityRelationships(entityId: string): Promise<EntityRelationship[]> {
    this.ensureInitialized();

    // Get relationships where entity is source or target
    const [fromQuery, toQuery] = await Promise.all([
      this.db!.collection(RELATIONSHIPS_COLLECTION).where('fromEntity', '==', entityId).get(),
      this.db!.collection(RELATIONSHIPS_COLLECTION).where('toEntity', '==', entityId).get(),
    ]);

    const relationships: EntityRelationship[] = [];

    for (const doc of fromQuery.docs) {
      const data = doc.data();
      if (data) {
        relationships.push({ ...data, id: doc.id } as unknown as EntityRelationship);
      }
    }

    for (const doc of toQuery.docs) {
      const data = doc.data();
      if (!data) continue;
      const rel = { ...data, id: doc.id } as unknown as EntityRelationship;
      // Only include if bidirectional or not already added
      if (rel.bidirectional && !relationships.find((r) => r.id === rel.id)) {
        relationships.push(rel);
      }
    }

    return relationships;
  }

  /**
   * Reinforce a relationship (increase strength)
   */
  async reinforceRelationship(relationshipId: string): Promise<void> {
    this.ensureInitialized();

    const docRef = this.db!.collection(RELATIONSHIPS_COLLECTION).doc(relationshipId);
    const doc = await docRef.get();

    const data = doc.data();
    if (!doc.exists || !data) return;

    const rel = data as unknown as EntityRelationship;
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
  async recordMention(
    entityId: string,
    context: {
      userId: string;
      conversationId: string;
      sessionId: string;
      personaId: string;
      snippet: string;
      emotionalWeight?: number;
      mentionContext?: 'direct' | 'indirect' | 'question' | 'response';
    }
  ): Promise<void> {
    this.ensureInitialized();

    const mention: EntityMention = {
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

    await this.db!.collection(MENTIONS_COLLECTION).doc(mention.id).set(cleanForFirestore(mention));

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
  async resolveEntity(
    userId: string,
    name: string,
    type: EntityType,
    hints?: {
      relationship?: string;
      context?: string;
    }
  ): Promise<{ entity: Entity; isNew: boolean }> {
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
  private async findEntityByNameOrAlias(
    userId: string,
    name: string,
    type: EntityType
  ): Promise<Entity | null> {
    const normalizedName = name.toLowerCase().trim();

    // Search by canonical name
    const byName = await this.db!.collection(ENTITIES_COLLECTION)
      .where('userId', '==', userId)
      .where('type', '==', type)
      .where('canonicalName', '==', name)
      .limit(1)
      .get();

    if (!byName.empty) {
      return this.docToEntity(byName.docs[0]);
    }

    // Search by alias
    const byAlias = await this.db!.collection(ENTITIES_COLLECTION)
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
  private buildAttributesForType(
    type: EntityType,
    hints?: { relationship?: string; context?: string }
  ): EntityAttributes {
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

  private docToEntity(doc: DocSnapshot): Entity {
    const data = doc.data()!;
    return {
      ...data,
      id: doc.id,
      firstSeen: this.toDate(data.firstSeen),
      lastSeen: this.toDate(data.lastSeen),
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.updatedAt),
      temporalContext: {
        ...(data.temporalContext as Entity['temporalContext']),
        peakMoments: ((data.temporalContext as Entity['temporalContext'])?.peakMoments ?? []).map(
          (d: unknown) => this.toDate(d)
        ),
        lastEmotionalPeak: (data.temporalContext as Entity['temporalContext'])?.lastEmotionalPeak
          ? this.toDate((data.temporalContext as Entity['temporalContext']).lastEmotionalPeak)
          : undefined,
      },
    } as Entity;
  }

  private toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    if (value && typeof value === 'object' && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate();
    }
    return new Date();
  }

  private daysBetween(date1: Date, date2: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.abs((date2.getTime() - date1.getTime()) / msPerDay);
  }

  private buildExplanation(
    entity: Entity,
    semanticScore: number,
    recencyScore: number,
    emotionalScore: number
  ): string {
    const reasons: string[] = [];

    if (semanticScore > 0.7) {
      reasons.push('highly relevant to query');
    } else if (semanticScore > 0.5) {
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

let entityStoreInstance: EntityStore | null = null;

/**
 * Get the singleton EntityStore instance
 */
export function getEntityStore(): EntityStore {
  if (!entityStoreInstance) {
    entityStoreInstance = new EntityStore();
  }
  return entityStoreInstance;
}

/**
 * Initialize the EntityStore
 */
export async function initializeEntityStore(): Promise<EntityStore> {
  const store = getEntityStore();
  await store.initialize();
  return store;
}
