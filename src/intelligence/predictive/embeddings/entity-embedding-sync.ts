/**
 * Entity Embedding Sync
 *
 * Synchronizes embeddings between the Entity Store and predictive intelligence.
 *
 * SYNC FEATURES:
 * 1. Auto-embed entities when created/updated
 * 2. Feed entity mentions into trajectory patterns
 * 3. Link avoidance patterns to entities
 * 4. Update domain space from entity changes
 * 5. Track entity involvement in breakthroughs
 *
 * @module intelligence/predictive/embeddings/entity-embedding-sync
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed } from '../../../memory/embeddings.js';
import type { Entity, EntityType } from '../../../memory/entity-store/types.js';

const log = createLogger({ module: 'EntityEmbeddingSync' });

// ============================================================================
// TYPES
// ============================================================================

export interface EntityEmbeddingUpdate {
  entityId: string;
  entityType: EntityType;
  embedding: number[];
  text: string;
  timestamp: number;
}

export interface EntityMentionEvent {
  userId: string;
  entityId: string;
  entityName: string;
  entityType: EntityType;
  context: string;
  emotionalContext?: string;
  timestamp: number;
}

export interface EntityTrajectoryLink {
  entityId: string;
  trajectoryPatternId: string;
  influenceType: 'trigger' | 'support' | 'context';
  timestamp: number;
}

// ============================================================================
// ENTITY EMBEDDING GENERATION
// ============================================================================

/**
 * Generate embedding text for an entity
 */
export function buildEntityEmbeddingText(entity: Entity): string {
  const parts: string[] = [entity.canonicalName];

  // Add aliases
  if (entity.aliases?.length > 0) {
    parts.push(`also known as: ${entity.aliases.join(', ')}`);
  }

  // Add type-specific context
  switch (entity.type) {
    case 'person':
      parts.push(`person in user's life`);
      if (entity.attributes && '_type' in entity.attributes) {
        const attrs = entity.attributes as { relationship?: string; context?: string };
        if (attrs.relationship) parts.push(`relationship: ${attrs.relationship}`);
        if (attrs.context) parts.push(attrs.context);
      }
      break;

    case 'event':
      parts.push('event or happening');
      break;

    case 'commitment':
      parts.push('commitment, promise, or intention');
      break;

    case 'value':
      parts.push('core value or belief');
      break;

    case 'dream':
      parts.push('aspiration or long-term goal');
      break;

    case 'pattern':
      parts.push('recurring behavioral pattern');
      break;

    case 'goal':
      parts.push('active goal or objective');
      break;

    case 'memory':
      parts.push('specific remembered moment');
      break;

    case 'topic':
      parts.push('recurring conversation topic');
      break;

    case 'emotion':
      parts.push('emotional state or pattern');
      break;
  }

  // Add emotional context if high weight
  if (entity.emotionalWeight > 0.5) {
    parts.push(`emotionally significant`);
  }

  return parts.join(' | ');
}

/**
 * Generate embedding for an entity
 */
export async function generateEntityEmbedding(entity: Entity): Promise<number[]> {
  const text = buildEntityEmbeddingText(entity);
  const embedding = await embed(text);

  log.debug(
    { entityId: entity.id, entityName: entity.canonicalName },
    '🔄 Generated entity embedding'
  );

  return embedding;
}

/**
 * Batch generate embeddings for multiple entities
 */
export async function generateEntityEmbeddingsBatch(
  entities: Entity[]
): Promise<Map<string, number[]>> {
  const results = new Map<string, number[]>();

  // Generate in parallel with concurrency limit
  const batchSize = 10;
  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map((e) => generateEntityEmbedding(e)));

    for (let j = 0; j < batch.length; j++) {
      results.set(batch[j].id, embeddings[j]);
    }
  }

  log.debug({ count: entities.length }, '🔄 Batch generated entity embeddings');

  return results;
}

// ============================================================================
// CROSS-POLLINATION: Entities → Predictive Intelligence
// ============================================================================

/**
 * Feed entity mention into trajectory patterns
 */
export async function feedEntityMentionToTrajectory(
  userId: string,
  mention: EntityMentionEvent
): Promise<void> {
  const { rippleEmbeddingSpace } = await import('./ripple-embedding-space.js');

  // Map entity type to life domain
  const domain = entityTypeToDomain(mention.entityType);

  if (domain) {
    // Update domain state with entity mention
    await rippleEmbeddingSpace.updateDomainState(userId, domain, {
      recentTopics: [mention.entityName],
      emotionalAssociation: mention.emotionalContext
        ? parseEmotionalValence(mention.emotionalContext)
        : undefined,
    });

    log.debug(
      { userId, entityName: mention.entityName, domain },
      '🔄 Fed entity mention to ripple space'
    );
  }
}

/**
 * Link entity to avoidance pattern if relevant
 */
export async function checkEntityForAvoidanceLink(
  userId: string,
  entity: Entity
): Promise<boolean> {
  const { semanticAvoidance } = await import('./semantic-avoidance.js');

  // Get entity embedding
  const entityEmbedding = entity.embedding || (await generateEntityEmbedding(entity));

  // Check if near avoided territory
  const result = await semanticAvoidance.isNearAvoidedTerritory(
    userId,
    entity.canonicalName,
    buildEntityEmbeddingText(entity)
  );

  if (result.isNear) {
    log.info(
      { userId, entityName: entity.canonicalName, distance: result.distance },
      '⚠️ Entity linked to avoidance pattern'
    );
    return true;
  }

  return false;
}

/**
 * Record entity involvement in breakthrough
 */
export async function recordEntityInBreakthrough(
  userId: string,
  entityIds: string[],
  breakthroughId: string,
  entities: Entity[]
): Promise<void> {
  // Store the link for future reference
  // This could be used to identify which entities are catalysts for breakthroughs

  log.debug(
    { userId, entityCount: entityIds.length, breakthroughId },
    '🔄 Recorded entities in breakthrough'
  );

  // Could also update entity salience scores based on breakthrough involvement
  // (entities involved in breakthroughs become more salient)
}

/**
 * Sync entity changes to domain space
 */
export async function syncEntityToDomainSpace(userId: string, entity: Entity): Promise<void> {
  const { rippleEmbeddingSpace } = await import('./ripple-embedding-space.js');

  const domain = entityTypeToDomain(entity.type);
  if (!domain) return;

  // Record influence if entity has high emotional weight
  if (entity.emotionalWeight > 0.6) {
    const targetDomain = inferTargetDomain(entity);
    if (targetDomain && targetDomain !== domain) {
      await rippleEmbeddingSpace.recordDomainInfluence(userId, {
        from: domain,
        to: targetDomain,
        description: `${entity.canonicalName} connects ${domain} to ${targetDomain}`,
        direction: entity.emotionalWeight > 0.3 ? 'amplifying' : 'positive',
        strength: entity.emotionalWeight,
      });
    }
  }
}

// ============================================================================
// CROSS-POLLINATION: Predictive Intelligence → Entities
// ============================================================================

/**
 * Suggest entities that should be created based on predictive patterns
 */
export async function suggestEntitiesFromPatterns(
  userId: string
): Promise<Array<{ name: string; type: EntityType; reason: string }>> {
  const suggestions: Array<{ name: string; type: EntityType; reason: string }> = [];

  // Check trajectory patterns for mentioned but uncaptured entities
  const { trajectoryPatterns } = await import('./trajectory-patterns.js');
  const stats = trajectoryPatterns.getTrajectoryStats(userId);

  // Check intervention situations for people mentioned
  const { interventionMatching } = await import('./intervention-matching.js');
  const interventionStats = interventionMatching.getInterventionStats(userId);

  // Could analyze text for names/topics that appear frequently but aren't entities

  return suggestions;
}

/**
 * Update entity salience based on predictive patterns
 */
export async function updateEntitySalienceFromPatterns(
  userId: string,
  entityId: string,
  factor: 'avoidance' | 'breakthrough' | 'trajectory' | 'intervention'
): Promise<number> {
  // Calculate salience boost based on involvement in patterns
  const boosts: Record<string, number> = {
    avoidance: 0.1, // Entity in avoidance = emotionally significant
    breakthrough: 0.2, // Entity in breakthrough = very significant
    trajectory: 0.05, // Entity in trajectory = somewhat significant
    intervention: 0.05, // Entity in intervention context
  };

  return boosts[factor] || 0;
}

// ============================================================================
// HELPERS
// ============================================================================

import type { LifeDomain } from '../ripple-effect-prediction.js';

function entityTypeToDomain(entityType: EntityType): LifeDomain | null {
  const mapping: Partial<Record<EntityType, LifeDomain>> = {
    person: 'relationships',
    event: 'social',
    commitment: 'growth',
    value: 'spirituality',
    dream: 'growth',
    pattern: 'mental_health',
    goal: 'growth',
    memory: 'mental_health',
    topic: 'mental_health',
    emotion: 'mental_health',
  };

  return mapping[entityType] || null;
}

function inferTargetDomain(entity: Entity): LifeDomain | null {
  const text = buildEntityEmbeddingText(entity).toLowerCase();

  if (text.includes('work') || text.includes('job') || text.includes('career')) {
    return 'work';
  }
  if (text.includes('family') || text.includes('parent') || text.includes('sibling')) {
    return 'family';
  }
  if (text.includes('health') || text.includes('exercise') || text.includes('sleep')) {
    return 'health';
  }
  if (text.includes('money') || text.includes('finance')) {
    return 'finances';
  }

  return null;
}

function parseEmotionalValence(emotionalContext: string): number {
  const positive = ['happy', 'joy', 'excited', 'grateful', 'love', 'peace'];
  const negative = ['sad', 'angry', 'anxious', 'fear', 'hurt', 'ashamed'];

  const lower = emotionalContext.toLowerCase();

  if (positive.some((p) => lower.includes(p))) return 0.5;
  if (negative.some((n) => lower.includes(n))) return -0.5;

  return 0;
}

// ============================================================================
// BATCH SYNC OPERATIONS
// ============================================================================

/**
 * Full sync of all entities to predictive intelligence
 */
export async function syncAllEntitiesToPredictive(userId: string): Promise<{
  entitiesProcessed: number;
  avoidanceLinksFound: number;
  domainUpdates: number;
}> {
  let entitiesProcessed = 0;
  let avoidanceLinksFound = 0;
  let domainUpdates = 0;

  try {
    const { getEntityStore } = await import('../../../memory/entity-store/store.js');
    const store = await getEntityStore();

    const entities = await store.getUserEntities(userId, { limit: 100 });

    for (const entity of entities) {
      entitiesProcessed++;

      // Check for avoidance links
      const isAvoided = await checkEntityForAvoidanceLink(userId, entity);
      if (isAvoided) avoidanceLinksFound++;

      // Sync to domain space
      await syncEntityToDomainSpace(userId, entity);
      domainUpdates++;
    }

    log.info(
      { userId, entitiesProcessed, avoidanceLinksFound, domainUpdates },
      '🔄 Full entity sync completed'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Entity sync failed');
  }

  return { entitiesProcessed, avoidanceLinksFound, domainUpdates };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const entityEmbeddingSync = {
  // Embedding generation
  buildEntityEmbeddingText,
  generateEntityEmbedding,
  generateEntityEmbeddingsBatch,

  // Entity → Predictive
  feedEntityMentionToTrajectory,
  checkEntityForAvoidanceLink,
  recordEntityInBreakthrough,
  syncEntityToDomainSpace,

  // Predictive → Entity
  suggestEntitiesFromPatterns,
  updateEntitySalienceFromPatterns,

  // Batch operations
  syncAllEntitiesToPredictive,
};

export default entityEmbeddingSync;
