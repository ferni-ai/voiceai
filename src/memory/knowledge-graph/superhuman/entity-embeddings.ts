/**
 * Entity Embeddings - Semantic Similarity for Knowledge Graph
 *
 * Generates vector embeddings for entities, enabling:
 * - Find semantically similar entities
 * - Search entities by meaning, not just keywords
 * - Cluster related entities automatically
 * - Detect potential entity merges (same person, different names)
 * - Power predictive memory with semantic context
 *
 * Each entity embedding combines:
 * - Entity name and aliases
 * - Entity type
 * - Key facts about the entity
 * - Relationship context
 * - Emotional associations
 * - Recent mention context
 *
 * This enables "Better Than Human" retrieval where we understand
 * what you mean, not just what you said.
 *
 * @module memory/knowledge-graph/superhuman/entity-embeddings
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  embed,
  embedBatch,
  cosineSimilarity,
  findTopK,
  getEmbeddingProvider,
} from '../../embeddings.js';
import type { Entity, Mention, Relationship, Fact } from '../types.js';

const log = createLogger({ module: 'EntityEmbeddings' });

// ============================================================================
// TYPES
// ============================================================================

export interface EntityEmbedding {
  entityId: string;
  userId: string;
  embedding: number[];
  /** Text used to generate embedding */
  sourceText: string;
  /** Model used to generate embedding */
  model: string;
  /** Dimensions of embedding */
  dimensions: number;
  /** When generated */
  generatedAt: Date;
  /** Version for cache invalidation */
  version: number;
}

export interface SimilarEntity {
  entityId: string;
  entityName: string;
  entityType: string;
  similarity: number;
  /** Why they're similar */
  reason?: string;
}

export interface EntityCluster {
  id: string;
  label: string;
  entities: string[];
  centroid?: number[];
  /** How tight the cluster is (0-1) */
  cohesion: number;
}

export interface PotentialMerge {
  entity1Id: string;
  entity1Name: string;
  entity2Id: string;
  entity2Name: string;
  similarity: number;
  /** Evidence they might be same entity */
  evidence: string[];
}

export interface SemanticSearchResult {
  entityId: string;
  entityName: string;
  entityType: string;
  score: number;
  highlights?: string[];
}

// ============================================================================
// ENTITY EMBEDDINGS ENGINE
// ============================================================================

export class EntityEmbeddingsEngine {
  private embeddingCache: Map<string, EntityEmbedding> = new Map();
  private initialized = false;
  private embeddingVersion = 1;

  /**
   * Initialize the engine and warm up cache
   */
  async initialize(userId: string): Promise<void> {
    if (this.initialized) return;

    try {
      // Load cached embeddings from storage
      await this.loadCachedEmbeddings(userId);
      this.initialized = true;
      log.info({ userId, cacheSize: this.embeddingCache.size }, 'Entity embeddings initialized');
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to initialize embeddings, starting fresh');
      this.initialized = true;
    }
  }

  /**
   * Generate or retrieve embedding for an entity
   */
  async getEntityEmbedding(userId: string, entity: Entity): Promise<EntityEmbedding> {
    const cacheKey = `${userId}:${entity.id}`;
    const cached = this.embeddingCache.get(cacheKey);

    // Return cached if still valid
    if (cached && cached.version === this.embeddingVersion) {
      return cached;
    }

    // Generate new embedding
    const sourceText = await this.buildEntityText(userId, entity);
    const embedding = await embed(sourceText);

    const provider = getEmbeddingProvider();

    const result: EntityEmbedding = {
      entityId: entity.id,
      userId,
      embedding,
      sourceText,
      model: provider.model,
      dimensions: provider.dimensions,
      generatedAt: new Date(),
      version: this.embeddingVersion,
    };

    // Cache it
    this.embeddingCache.set(cacheKey, result);

    // Store persistently
    await this.storeEmbedding(result);

    return result;
  }

  /**
   * Generate embeddings for multiple entities in batch
   */
  async generateBatchEmbeddings(
    userId: string,
    entities: Entity[]
  ): Promise<Map<string, EntityEmbedding>> {
    const results = new Map<string, EntityEmbedding>();

    // Filter out already cached
    const needsGeneration: Array<{ entity: Entity; text: string }> = [];

    for (const entity of entities) {
      const cacheKey = `${userId}:${entity.id}`;
      const cached = this.embeddingCache.get(cacheKey);

      if (cached && cached.version === this.embeddingVersion) {
        results.set(entity.id, cached);
      } else {
        const text = await this.buildEntityText(userId, entity);
        needsGeneration.push({ entity, text });
      }
    }

    if (needsGeneration.length === 0) {
      return results;
    }

    // Batch generate embeddings
    const texts = needsGeneration.map((ng) => ng.text);
    const embeddings = await embedBatch(texts);

    const provider = getEmbeddingProvider();

    for (let i = 0; i < needsGeneration.length; i++) {
      const { entity, text } = needsGeneration[i];
      const embedding: EntityEmbedding = {
        entityId: entity.id,
        userId,
        embedding: embeddings[i],
        sourceText: text,
        model: provider.model,
        dimensions: provider.dimensions,
        generatedAt: new Date(),
        version: this.embeddingVersion,
      };

      const cacheKey = `${userId}:${entity.id}`;
      this.embeddingCache.set(cacheKey, embedding);
      results.set(entity.id, embedding);

      // Store asynchronously
      this.storeEmbedding(embedding).catch((err) => {
        log.debug({ error: String(err) }, 'Failed to store embedding');
      });
    }

    log.info(
      {
        generated: needsGeneration.length,
        cached: entities.length - needsGeneration.length,
      },
      'Batch embedding generation complete'
    );

    return results;
  }

  /**
   * Find entities similar to a given entity
   */
  async findSimilarEntities(
    userId: string,
    entityId: string,
    options: { limit?: number; minSimilarity?: number; excludeTypes?: string[] } = {}
  ): Promise<SimilarEntity[]> {
    const { limit = 10, minSimilarity = 0.5, excludeTypes = [] } = options;

    try {
      const { getEntity, getAllEntities } = await import('../../entity-store/storage.js');

      const sourceEntity = await getEntity(userId, entityId);
      if (!sourceEntity) {
        return [];
      }

      const sourceEmbedding = await this.getEntityEmbedding(userId, sourceEntity);

      // Get all other entities
      const allEntities = await getAllEntities(userId, { limit: 200 });
      const otherEntities = allEntities.filter(
        (e) => e.id !== entityId && !excludeTypes.includes(e.type)
      );

      if (otherEntities.length === 0) {
        return [];
      }

      // Get embeddings for all
      const embeddings = await this.generateBatchEmbeddings(userId, otherEntities);

      // Calculate similarities
      const similarities: Array<{ entity: Entity; similarity: number }> = [];

      for (const entity of otherEntities) {
        const embedding = embeddings.get(entity.id);
        if (!embedding) continue;

        const similarity = cosineSimilarity(sourceEmbedding.embedding, embedding.embedding);

        if (similarity >= minSimilarity) {
          similarities.push({ entity, similarity });
        }
      }

      // Sort by similarity
      similarities.sort((a, b) => b.similarity - a.similarity);

      return similarities.slice(0, limit).map(({ entity, similarity }) => ({
        entityId: entity.id,
        entityName: entity.canonicalName,
        entityType: entity.type,
        similarity,
        reason: this.inferSimilarityReason(sourceEntity, entity, similarity),
      }));
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to find similar entities');
      return [];
    }
  }

  /**
   * Search entities by semantic query
   */
  async semanticSearch(
    userId: string,
    query: string,
    options: { limit?: number; minScore?: number; types?: string[] } = {}
  ): Promise<SemanticSearchResult[]> {
    const { limit = 10, minScore = 0.4, types } = options;

    try {
      // Get query embedding
      const queryEmbedding = await embed(query);

      // Get all entities
      const { getAllEntities } = await import('../../entity-store/storage.js');
      let entities = await getAllEntities(userId, { limit: 200 });

      if (types && types.length > 0) {
        entities = entities.filter((e) => types.includes(e.type));
      }

      if (entities.length === 0) {
        return [];
      }

      // Get embeddings
      const embeddings = await this.generateBatchEmbeddings(userId, entities);

      // Build vectors array for findTopK
      const entityList: Array<{ entity: Entity; embedding: number[] }> = [];

      for (const entity of entities) {
        const emb = embeddings.get(entity.id);
        if (emb) {
          entityList.push({ entity, embedding: emb.embedding });
        }
      }

      const vectors = entityList.map((e) => e.embedding);
      const topK = findTopK(queryEmbedding, vectors, limit * 2);

      // Filter by minimum score and format results
      const results: SemanticSearchResult[] = [];

      for (const { index, score } of topK) {
        if (score < minScore) continue;
        if (results.length >= limit) break;

        const { entity, embedding: _ } = entityList[index];
        const emb = embeddings.get(entity.id);

        results.push({
          entityId: entity.id,
          entityName: entity.canonicalName,
          entityType: entity.type,
          score,
          highlights: emb ? this.extractHighlights(query, emb.sourceText) : undefined,
        });
      }

      return results;
    } catch (error) {
      log.error({ error: String(error) }, 'Semantic search failed');
      return [];
    }
  }

  /**
   * Detect potential entity merges (same entity, different names)
   */
  async detectPotentialMerges(userId: string, threshold: number = 0.85): Promise<PotentialMerge[]> {
    const merges: PotentialMerge[] = [];

    try {
      const { getAllEntities } = await import('../../entity-store/storage.js');
      const entities = await getAllEntities(userId, { limit: 200, types: ['person'] });

      if (entities.length < 2) return [];

      const embeddings = await this.generateBatchEmbeddings(userId, entities);

      // Compare all pairs
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const entity1 = entities[i];
          const entity2 = entities[j];

          const emb1 = embeddings.get(entity1.id);
          const emb2 = embeddings.get(entity2.id);

          if (!emb1 || !emb2) continue;

          const similarity = cosineSimilarity(emb1.embedding, emb2.embedding);

          if (similarity >= threshold) {
            const evidence = this.gatherMergeEvidence(
              entity1,
              entity2,
              emb1.sourceText,
              emb2.sourceText
            );

            merges.push({
              entity1Id: entity1.id,
              entity1Name: entity1.canonicalName,
              entity2Id: entity2.id,
              entity2Name: entity2.canonicalName,
              similarity,
              evidence,
            });
          }
        }
      }

      return merges.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      log.error({ error: String(error) }, 'Merge detection failed');
      return [];
    }
  }

  /**
   * Cluster entities by semantic similarity
   */
  async clusterEntities(
    userId: string,
    options: { maxClusters?: number; minClusterSize?: number } = {}
  ): Promise<EntityCluster[]> {
    const { maxClusters = 10, minClusterSize = 2 } = options;
    const clusters: EntityCluster[] = [];

    try {
      const { getAllEntities } = await import('../../entity-store/storage.js');
      const entities = await getAllEntities(userId, { limit: 200 });

      if (entities.length < minClusterSize) return [];

      const embeddings = await this.generateBatchEmbeddings(userId, entities);

      // Simple clustering: use type + high similarity
      const typeGroups = new Map<string, Array<{ entity: Entity; embedding: number[] }>>();

      for (const entity of entities) {
        const emb = embeddings.get(entity.id);
        if (!emb) continue;

        if (!typeGroups.has(entity.type)) {
          typeGroups.set(entity.type, []);
        }
        typeGroups.get(entity.type)!.push({ entity, embedding: emb.embedding });
      }

      // Create clusters by type first
      for (const [type, group] of typeGroups) {
        if (group.length < minClusterSize) continue;

        // Calculate centroid
        const centroid = this.calculateCentroid(group.map((g) => g.embedding));

        // Calculate cohesion
        const cohesion = this.calculateCohesion(
          group.map((g) => g.embedding),
          centroid
        );

        clusters.push({
          id: `cluster-${type}`,
          label: `${type.charAt(0).toUpperCase() + type.slice(1)}s`,
          entities: group.map((g) => g.entity.id),
          centroid,
          cohesion,
        });
      }

      // Find sub-clusters for large groups
      for (const cluster of clusters) {
        if (cluster.entities.length > 10) {
          // Could implement k-means here for sub-clustering
          // For now, just note large clusters
          log.debug(
            {
              cluster: cluster.label,
              size: cluster.entities.length,
            },
            'Large cluster detected, consider sub-clustering'
          );
        }
      }

      return clusters.filter((c) => c.entities.length >= minClusterSize).slice(0, maxClusters);
    } catch (error) {
      log.error({ error: String(error) }, 'Clustering failed');
      return [];
    }
  }

  /**
   * Get entities related to a topic/concept by embedding similarity
   */
  async getEntitiesForConcept(
    userId: string,
    concept: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    return this.semanticSearch(userId, concept, { limit });
  }

  /**
   * Invalidate embedding cache for an entity (call when entity is updated)
   */
  invalidateCache(userId: string, entityId: string): void {
    const cacheKey = `${userId}:${entityId}`;
    this.embeddingCache.delete(cacheKey);
  }

  /**
   * Clear all cached embeddings
   */
  clearCache(): void {
    this.embeddingCache.clear();
    log.info('Entity embedding cache cleared');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Build rich text representation of an entity for embedding
   */
  private async buildEntityText(userId: string, entity: Entity): Promise<string> {
    const parts: string[] = [];

    // Basic info
    parts.push(`${entity.canonicalName} is a ${entity.type}.`);

    // Aliases
    if (entity.aliases && entity.aliases.length > 0) {
      parts.push(`Also known as: ${entity.aliases.join(', ')}.`);
    }

    // Get relationships
    try {
      const { getEntityRelationships } = await import('../../entity-store/storage.js');
      const relationships = await getEntityRelationships(userId, entity.id);

      for (const rel of relationships.slice(0, 5)) {
        parts.push(`${rel.label || rel.type}`);
      }
    } catch (error) {
      // Relationships are optional
    }

    // Get recent mentions for emotional context and facts
    try {
      const { getMentionsForEntity } = await import('../../entity-store/storage.js');
      const mentions = await getMentionsForEntity(userId, entity.id, 10);

      // Extract facts from mentions
      const allFacts = mentions.flatMap((m) => m.facts || []);
      for (const fact of allFacts.slice(0, 10)) {
        if (typeof fact === 'string') {
          parts.push(fact);
        } else if (fact.key && fact.value) {
          parts.push(`${fact.key}: ${fact.value}`);
        }
      }

      const emotions = new Set<string>();
      for (const mention of mentions) {
        if (mention.emotion) emotions.add(mention.emotion);
      }

      if (emotions.size > 0) {
        parts.push(`Associated feelings: ${Array.from(emotions).join(', ')}.`);
      }
    } catch (error) {
      // Mentions are optional
    }

    return parts.join(' ');
  }

  private inferSimilarityReason(source: Entity, target: Entity, similarity: number): string {
    if (source.type === target.type) {
      return `Both are ${source.type}s`;
    }

    if (similarity > 0.8) {
      return 'Strongly connected in your conversations';
    }

    if (similarity > 0.6) {
      return 'Often come up in similar contexts';
    }

    return 'Semantically related';
  }

  private extractHighlights(query: string, sourceText: string): string[] {
    const highlights: string[] = [];
    const queryWords = query.toLowerCase().split(/\s+/);
    const sentences = sourceText.split(/[.!?]+/);

    for (const sentence of sentences) {
      const sentLower = sentence.toLowerCase();
      if (queryWords.some((word) => sentLower.includes(word))) {
        highlights.push(sentence.trim());
        if (highlights.length >= 3) break;
      }
    }

    return highlights;
  }

  private gatherMergeEvidence(
    entity1: Entity,
    entity2: Entity,
    text1: string,
    text2: string
  ): string[] {
    const evidence: string[] = [];

    // Check for shared aliases
    const aliases1 = new Set(entity1.aliases?.map((a) => a.toLowerCase()) || []);
    const aliases2 = new Set(entity2.aliases?.map((a) => a.toLowerCase()) || []);

    for (const alias of aliases1) {
      if (aliases2.has(alias) || entity2.canonicalName.toLowerCase().includes(alias)) {
        evidence.push(`Shared alias: ${alias}`);
      }
    }

    // Check for similar name patterns
    const name1Parts = entity1.canonicalName.toLowerCase().split(/\s+/);
    const name2Parts = entity2.canonicalName.toLowerCase().split(/\s+/);

    for (const part of name1Parts) {
      if (name2Parts.includes(part) && part.length > 2) {
        evidence.push(`Shared name component: ${part}`);
      }
    }

    // High embedding similarity
    evidence.push('Very similar context and associations');

    return evidence;
  }

  private calculateCentroid(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];

    const dimensions = embeddings[0].length;
    const centroid = new Array(dimensions).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] += emb[i];
      }
    }

    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  private calculateCohesion(embeddings: number[][], centroid: number[]): number {
    if (embeddings.length === 0) return 0;

    let totalSimilarity = 0;
    for (const emb of embeddings) {
      totalSimilarity += cosineSimilarity(emb, centroid);
    }

    return totalSimilarity / embeddings.length;
  }

  // ============================================================================
  // STORAGE METHODS
  // ============================================================================

  private async loadCachedEmbeddings(userId: string): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      const snapshot = await db
        .collection('users')
        .doc(userId)
        .collection('entity_embeddings')
        .where('version', '==', this.embeddingVersion)
        .limit(500)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const cacheKey = `${userId}:${data.entityId}`;
        this.embeddingCache.set(cacheKey, {
          entityId: data.entityId,
          userId: data.userId,
          embedding: data.embedding,
          sourceText: data.sourceText,
          model: data.model,
          dimensions: data.dimensions,
          generatedAt: new Date(data.generatedAt),
          version: data.version,
        });
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to load cached embeddings');
    }
  }

  private async storeEmbedding(embedding: EntityEmbedding): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      await db
        .collection('users')
        .doc(embedding.userId)
        .collection('entity_embeddings')
        .doc(embedding.entityId)
        .set({
          ...embedding,
          generatedAt: embedding.generatedAt.toISOString(),
        });
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to store embedding');
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let entityEmbeddingsEngine: EntityEmbeddingsEngine | null = null;

export function getEntityEmbeddingsEngine(): EntityEmbeddingsEngine {
  if (!entityEmbeddingsEngine) {
    entityEmbeddingsEngine = new EntityEmbeddingsEngine();
  }
  return entityEmbeddingsEngine;
}

export default EntityEmbeddingsEngine;
