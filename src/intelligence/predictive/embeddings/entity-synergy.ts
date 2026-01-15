/**
 * Entity Store Synergy - Embedding Integration
 *
 * Connects the embedding-powered predictive intelligence with the
 * Entity Store's knowledge graph.
 *
 * SYNERGIES:
 * 1. Use entity embeddings for semantic avoidance detection
 * 2. Link trajectory patterns to involved entities
 * 3. Associate breakthroughs with entity context
 * 4. Enrich ripple space with entity relationships
 * 5. Ground intervention matching in entity knowledge
 *
 * @module intelligence/predictive/embeddings/entity-synergy
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cosineSimilarity } from '../../../memory/embeddings.js';
import type { Entity, EntityType } from '../../../memory/entity-store/types.js';

const log = createLogger({ module: 'EntitySynergy' });

// ============================================================================
// TYPES
// ============================================================================

export interface EntityContext {
  entities: Entity[];
  relationships: Array<{
    from: Entity;
    to: Entity;
    type: string;
  }>;
}

export interface EntityAvoidanceLink {
  entity: Entity;
  avoidanceSimilarity: number;
  possibleReasons: string[];
}

export interface EntityTrajectoryContext {
  involvedEntities: Entity[];
  entityInfluence: Array<{
    entity: Entity;
    influence: 'trigger' | 'support' | 'context';
    confidence: number;
  }>;
}

export interface EntityBreakthroughContext {
  relatedEntities: Entity[];
  entityInsights: Array<{
    entity: Entity;
    connection: string;
  }>;
}

// ============================================================================
// ENTITY STORE ACCESS
// ============================================================================

async function getEntityStore() {
  const { getEntityStore } = await import('../../../memory/entity-store/store.js');
  return getEntityStore();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the display name for an entity
 */
function getEntityName(entity: Entity): string {
  return entity.canonicalName;
}

/**
 * Get entity text for matching (name + aliases)
 */
function getEntitySearchText(entity: Entity): string {
  const parts = [entity.canonicalName, ...entity.aliases];
  return parts.join(' ').toLowerCase();
}

/**
 * Check if entity has significant emotional weight
 */
function hasEmotionalSignificance(entity: Entity): boolean {
  return entity.emotionalWeight > 0.5;
}

/**
 * Get dominant emotion if any (from person attributes)
 */
function getDominantEmotion(entity: Entity): string | undefined {
  // Check if person type with sentiment
  const attrs = entity.attributes;
  if ('_type' in attrs && attrs._type === 'person') {
    if (attrs.sentiment < -0.3) return 'negative';
    if (attrs.sentiment > 0.3) return 'positive';
  }
  return undefined;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Find entities that might be related to avoided topics
 */
export async function findEntitiesRelatedToAvoidance(
  userId: string,
  avoidedTopicEmbedding: number[],
  entityTypes?: EntityType[]
): Promise<EntityAvoidanceLink[]> {
  try {
    const store = await getEntityStore();

    // Get all user entities
    const entities = await store.getUserEntities(userId, {
      types: entityTypes,
      limit: 50,
    });

    // Find entities with similar embeddings
    const scored = entities
      .filter((entity) => entity.embedding && entity.embedding.length > 0)
      .map((entity) => ({
        entity,
        score: cosineSimilarity(avoidedTopicEmbedding, entity.embedding),
      }))
      .filter((item) => item.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return scored.map((item) => ({
      entity: item.entity,
      avoidanceSimilarity: item.score,
      possibleReasons: inferAvoidanceReasons(item.entity),
    }));
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to find avoidance-related entities');
    return [];
  }
}

/**
 * Get entity context for trajectory pattern
 */
export async function getEntityContextForTrajectory(
  userId: string,
  trajectoryDescription: string,
  lifeDomains: string[]
): Promise<EntityTrajectoryContext> {
  try {
    const store = await getEntityStore();

    // Get recent entities (sorted by lastSeen would be ideal, but we get all and sort)
    const allEntities = await store.getUserEntities(userId, { limit: 100 });

    // Sort by lastSeen descending and take top 20
    const sortedEntities = [...allEntities]
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, 20);

    // Filter by relevance to life domains
    const domainRelevantEntities = sortedEntities.filter((entity) =>
      lifeDomains.some((domain) => isEntityRelevantToDomain(entity, domain))
    );

    // Determine influence type for each entity
    const entityInfluence = domainRelevantEntities.map((entity) => ({
      entity,
      influence: inferInfluenceType(entity, trajectoryDescription),
      confidence: entity.salienceScore,
    }));

    return {
      involvedEntities: domainRelevantEntities,
      entityInfluence,
    };
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get entity trajectory context');
    return { involvedEntities: [], entityInfluence: [] };
  }
}

/**
 * Find entities related to a breakthrough
 */
export async function findEntitiesForBreakthrough(
  userId: string,
  breakthroughTopic: string,
  insightEmbedding: number[]
): Promise<EntityBreakthroughContext> {
  try {
    const store = await getEntityStore();

    // Get all entities and score by embedding similarity
    const allEntities = await store.getUserEntities(userId, { limit: 50 });

    const scored = allEntities
      .filter((entity) => entity.embedding && entity.embedding.length > 0)
      .map((entity) => ({
        entity,
        score: cosineSimilarity(insightEmbedding, entity.embedding),
      }))
      .filter((item) => item.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const entityInsights = scored.map((item) => ({
      entity: item.entity,
      connection: describeEntityConnection(item.entity, breakthroughTopic),
    }));

    return {
      relatedEntities: scored.map((item) => item.entity),
      entityInsights,
    };
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to find breakthrough entities');
    return { relatedEntities: [], entityInsights: [] };
  }
}

/**
 * Get entities for ripple effect domain
 */
export async function getEntitiesForDomain(userId: string, domain: string): Promise<Entity[]> {
  try {
    const store = await getEntityStore();

    // Get all entities
    const allEntities = await store.getUserEntities(userId, { limit: 100 });

    // Sort by lastSeen and filter by domain relevance
    const sorted = [...allEntities]
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, 50);

    return sorted.filter((entity) => isEntityRelevantToDomain(entity, domain));
  } catch (error) {
    log.debug({ error: String(error), userId, domain }, 'Failed to get domain entities');
    return [];
  }
}

/**
 * Find people entities that might be involved in situation
 */
export async function findPeopleInSituation(
  userId: string,
  situationTranscript: string
): Promise<Entity[]> {
  try {
    const store = await getEntityStore();

    // Get person entities
    const entities = await store.getUserEntities(userId, { types: ['person'], limit: 50 });

    // Filter by mention in transcript
    const transcriptLower = situationTranscript.toLowerCase();
    const mentioned = entities.filter((entity) => {
      const names = [entity.canonicalName, ...entity.aliases];
      return names.some((name) => transcriptLower.includes(name.toLowerCase()));
    });

    return mentioned;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to find people in situation');
    return [];
  }
}

/**
 * Enrich avoidance with entity knowledge
 */
export async function enrichAvoidanceWithEntities(
  userId: string,
  avoidedTopics: Array<{ topic: string; embedding: number[] }>
): Promise<
  Array<{
    topic: string;
    relatedEntities: Entity[];
    entityPatterns: string[];
  }>
> {
  try {
    const store = await getEntityStore();
    const allEntities = await store.getUserEntities(userId, { limit: 50 });

    const enriched: Array<{
      topic: string;
      relatedEntities: Entity[];
      entityPatterns: string[];
    }> = [];

    for (const avoided of avoidedTopics) {
      // Score entities by embedding similarity
      const scored = allEntities
        .filter((entity) => entity.embedding && entity.embedding.length > 0)
        .map((entity) => ({
          entity,
          score: cosineSimilarity(avoided.embedding, entity.embedding),
        }))
        .filter((item) => item.score >= 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const patterns = scored.map((r) => {
        const name = getEntityName(r.entity);
        if (r.entity.type === 'person') {
          return `Avoidance may involve ${name}`;
        }
        if (r.entity.type === 'event') {
          return `Connected to event: ${name}`;
        }
        if (r.entity.type === 'pattern') {
          return `Part of pattern: ${name}`;
        }
        return `Related to ${r.entity.type}: ${name}`;
      });

      enriched.push({
        topic: avoided.topic,
        relatedEntities: scored.map((r) => r.entity),
        entityPatterns: patterns,
      });
    }

    return enriched;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to enrich avoidance with entities');
    return avoidedTopics.map((a) => ({
      topic: a.topic,
      relatedEntities: [],
      entityPatterns: [],
    }));
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function inferAvoidanceReasons(entity: Entity): string[] {
  const reasons: string[] = [];
  const name = getEntityName(entity);

  if (entity.type === 'person') {
    reasons.push(`May involve ${name}`);
    const emotion = getDominantEmotion(entity);
    if (emotion) {
      reasons.push(`Associated with ${emotion} sentiment`);
    }
  }

  if (entity.type === 'event') {
    reasons.push(`Connected to event: ${name}`);
  }

  if (entity.type === 'memory') {
    reasons.push(`Linked to memory: ${name}`);
  }

  if (entity.type === 'pattern') {
    reasons.push(`Part of pattern: ${name}`);
  }

  if (hasEmotionalSignificance(entity)) {
    reasons.push(`Carries significant emotional weight`);
  }

  return reasons;
}

function isEntityRelevantToDomain(entity: Entity, domain: string): boolean {
  const domainKeywords: Record<string, string[]> = {
    work: ['work', 'job', 'career', 'boss', 'colleague', 'project', 'deadline'],
    relationships: ['partner', 'dating', 'marriage', 'romantic', 'relationship'],
    health: ['health', 'exercise', 'medical', 'doctor', 'fitness'],
    finances: ['money', 'finance', 'budget', 'savings', 'debt'],
    family: ['mother', 'father', 'sibling', 'parent', 'child', 'family'],
    mental_health: ['anxiety', 'depression', 'therapy', 'mental', 'emotional'],
    social: ['friend', 'social', 'community', 'group'],
    creativity: ['creative', 'art', 'music', 'writing', 'project'],
  };

  const keywords = domainKeywords[domain] || [domain];
  const entityText = getEntitySearchText(entity);

  return keywords.some((kw) => entityText.includes(kw));
}

function inferInfluenceType(entity: Entity, description: string): 'trigger' | 'support' | 'context' {
  const descLower = description.toLowerCase();
  const nameLower = getEntityName(entity).toLowerCase();

  // Check if entity name appears in description context
  if (descLower.includes(`${nameLower} caused`) || descLower.includes(`because of ${nameLower}`)) {
    return 'trigger';
  }

  if (descLower.includes(`${nameLower} helped`) || descLower.includes(`support from ${nameLower}`)) {
    return 'support';
  }

  return 'context';
}

function describeEntityConnection(entity: Entity, topic: string): string {
  const name = getEntityName(entity);

  switch (entity.type) {
    case 'person':
      return `${name} may be central to this insight about ${topic}`;
    case 'value':
      return `Connected to core value: ${name}`;
    case 'pattern':
      return `Relates to pattern: ${name}`;
    case 'dream':
      return `Connects to aspiration: ${name}`;
    case 'goal':
      return `Relevant to goal: ${name}`;
    default:
      return `Associated with ${name}`;
  }
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build entity-enriched context for embedding intelligence
 */
export async function buildEntityEnrichedContext(
  userId: string,
  currentTopic?: string
): Promise<string> {
  try {
    const store = await getEntityStore();

    const sections: string[] = [];

    // Get all entities sorted by lastSeen
    const allEntities = await store.getUserEntities(userId, { limit: 50 });
    const sortedEntities = [...allEntities]
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, 20);

    // Get high-salience entities
    const salientEntities = sortedEntities.filter((e) => e.salienceScore > 0.6).slice(0, 5);

    if (salientEntities.length > 0) {
      sections.push('[ENTITY CONTEXT FOR PREDICTIONS]');
      sections.push('Key people/things that may influence patterns:');

      for (const entity of salientEntities) {
        let desc = `• ${getEntityName(entity)} (${entity.type})`;
        if (hasEmotionalSignificance(entity)) {
          desc += ` - emotionally significant`;
        }
        sections.push(desc);
      }
    }

    // If there's a current topic, find related entities
    if (currentTopic) {
      const topicLower = currentTopic.toLowerCase();
      const topicEntities = sortedEntities.filter((e) =>
        getEntitySearchText(e).includes(topicLower)
      );

      if (topicEntities.length > 0) {
        sections.push(`\nEntities related to "${currentTopic}":`);
        for (const entity of topicEntities.slice(0, 3)) {
          sections.push(`• ${getEntityName(entity)}`);
        }
      }
    }

    return sections.join('\n');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to build entity context');
    return '';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const entitySynergy = {
  findEntitiesRelatedToAvoidance,
  getEntityContextForTrajectory,
  findEntitiesForBreakthrough,
  getEntitiesForDomain,
  findPeopleInSituation,
  enrichAvoidanceWithEntities,
  buildEntityEnrichedContext,
};

export default entitySynergy;
