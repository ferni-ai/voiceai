/**
 * Entity Store Integration
 *
 * Bridges the entity store with existing systems:
 * - Data capture pipeline
 * - Memory orchestrator
 * - Context builders
 *
 * @module memory/entity-store/integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getEntityStore, initializeEntityStore } from './store.js';
import { graphRAGRetrieve } from './graph-rag.js';
import { getProactiveSurfacingEngine } from './proactive-surfacing.js';
import type {
  Entity,
  EntityType,
  PersonAttributes,
  CommitmentAttributes,
  EventAttributes,
  EntitySearchResult,
  SurfacingOpportunity,
} from './types.js';

const log = createLogger({ module: 'EntityStoreIntegration' });

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize entity store integration
 * Call this during application startup
 */
export async function initializeEntityStoreIntegration(): Promise<void> {
  if (initialized) return;

  try {
    await initializeEntityStore();
    initialized = true;
    log.info('✅ Entity store integration initialized');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize entity store integration');
    throw error;
  }
}

/**
 * Check if entity store is ready
 */
export function isEntityStoreReady(): boolean {
  return initialized;
}

// ============================================================================
// DATA CAPTURE INTEGRATION
// ============================================================================

/**
 * Capture a contact/person entity from data capture
 *
 * This is the bridge between data-capture and entity store.
 * Call this when a contact is extracted from conversation.
 */
export async function capturePersonEntity(
  userId: string,
  data: {
    name?: string;
    relationship?: string;
    phone?: string;
    email?: string;
  },
  context: {
    conversationId: string;
    sessionId: string;
    personaId: string;
    transcript: string;
  }
): Promise<Entity | null> {
  if (!initialized) {
    log.warn('Entity store not initialized, skipping capture');
    return null;
  }

  const store = getEntityStore();

  // Determine the best name to use
  const displayName = data.name || data.relationship || 'Unknown';

  try {
    // Use entity resolution to find or create
    const { entity, isNew } = await store.resolveEntity(
      userId,
      displayName,
      'person',
      { relationship: data.relationship }
    );

    // Update with additional data if we have it
    const attrs = entity.attributes as PersonAttributes;
    const updates: Partial<Entity> = {};
    let needsUpdate = false;

    if (data.phone && !attrs.phone) {
      attrs.phone = data.phone;
      needsUpdate = true;
    }

    if (data.email && !attrs.email) {
      attrs.email = data.email;
      needsUpdate = true;
    }

    if (data.relationship && attrs.relationship === 'unknown') {
      attrs.relationship = data.relationship;
      attrs.relationshipCategory = categorizeRelationship(data.relationship);
      needsUpdate = true;
    }

    // Add alias if name differs
    if (data.name && data.relationship && !entity.aliases.includes(data.relationship.toLowerCase())) {
      updates.aliases = [...entity.aliases, data.relationship.toLowerCase()];
      needsUpdate = true;
    }

    if (needsUpdate) {
      updates.attributes = attrs;
      await store.updateEntity(entity.id, updates);
    }

    // Record the mention
    await store.recordMention(entity.id, {
      userId,
      conversationId: context.conversationId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      snippet: context.transcript.substring(0, 200),
      mentionContext: 'direct',
    });

    log.info(
      {
        userId: userId.substring(0, 8),
        entityId: entity.id,
        name: displayName,
        isNew,
      },
      '📇 Captured person entity'
    );

    return entity;
  } catch (error) {
    log.error({ error: String(error), userId, name: displayName }, 'Failed to capture person entity');
    return null;
  }
}

/**
 * Capture a commitment entity from data capture
 */
export async function captureCommitmentEntity(
  userId: string,
  data: {
    statement: string;
    type: 'promise' | 'intention' | 'decision' | 'goal';
    targetDate?: Date;
    relatedPeople?: string[];
  },
  context: {
    conversationId: string;
    sessionId: string;
    personaId: string;
  }
): Promise<Entity | null> {
  if (!initialized) {
    log.warn('Entity store not initialized, skipping capture');
    return null;
  }

  const store = getEntityStore();

  try {
    // Create the commitment entity
    const entity = await store.createEntity(
      userId,
      'commitment',
      data.statement.substring(0, 100),
      {
        _type: 'commitment',
        commitmentType: data.type,
        status: 'active',
        targetDate: data.targetDate,
        relatedPeople: [],
        accountability: 'self',
        originalStatement: data.statement,
      } as CommitmentAttributes,
      {
        sourceConversation: context.conversationId,
        sourcePersona: context.personaId,
      }
    );

    // Link to related people if any
    if (data.relatedPeople && data.relatedPeople.length > 0) {
      for (const personName of data.relatedPeople) {
        // Find the person entity
        const { entity: personEntity } = await store.resolveEntity(
          userId,
          personName,
          'person'
        );

        // Create relationship
        await store.createRelationship(entity.id, personEntity.id, 'involves', {
          context: 'Commitment involves this person',
        });
      }
    }

    log.info(
      { userId: userId.substring(0, 8), entityId: entity.id, type: data.type },
      '📝 Captured commitment entity'
    );

    return entity;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to capture commitment entity');
    return null;
  }
}

/**
 * Capture an event entity
 */
export async function captureEventEntity(
  userId: string,
  data: {
    name: string;
    eventType: EventAttributes['eventType'];
    date?: Date;
    relatedPeople?: string[];
    emotionalSignificance?: EventAttributes['emotionalSignificance'];
  },
  context: {
    conversationId: string;
    sessionId: string;
    personaId: string;
  }
): Promise<Entity | null> {
  if (!initialized) {
    log.warn('Entity store not initialized, skipping capture');
    return null;
  }

  const store = getEntityStore();

  try {
    const entity = await store.createEntity(
      userId,
      'event',
      data.name,
      {
        _type: 'event',
        eventType: data.eventType,
        date: data.date,
        isRecurring: data.eventType === 'birthday' || data.eventType === 'anniversary',
        relatedPeople: [],
        emotionalSignificance: data.emotionalSignificance || 'meaningful',
        status: data.date && data.date > new Date() ? 'upcoming' : 'happened',
      } as EventAttributes,
      {
        sourceConversation: context.conversationId,
        sourcePersona: context.personaId,
      }
    );

    // Link to related people
    if (data.relatedPeople && data.relatedPeople.length > 0) {
      for (const personName of data.relatedPeople) {
        const { entity: personEntity } = await store.resolveEntity(userId, personName, 'person');
        await store.createRelationship(entity.id, personEntity.id, 'involves');
      }
    }

    log.info(
      { userId: userId.substring(0, 8), entityId: entity.id, eventType: data.eventType },
      '📅 Captured event entity'
    );

    return entity;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to capture event entity');
    return null;
  }
}

// ============================================================================
// MEMORY RETRIEVAL INTEGRATION
// ============================================================================

/**
 * Unified memory retrieval using Graph-RAG
 *
 * Replaces fragmented memory retrieval with entity-centric search.
 */
export async function retrieveMemoriesUnified(
  userId: string,
  query: string,
  context: {
    currentTopic?: string;
    currentEmotion?: string;
    personaId?: string;
    conversationTurn?: number;
    recentTopics?: string[];
  }
): Promise<{
  entities: EntitySearchResult[];
  formattedContext: string;
}> {
  if (!initialized) {
    log.warn('Entity store not initialized, falling back to empty results');
    return { entities: [], formattedContext: '' };
  }

  try {
    const result = await graphRAGRetrieve(
      userId,
      query,
      {
        currentTopic: context.currentTopic,
        currentEmotion: context.currentEmotion,
        personaId: context.personaId,
        conversationTurn: context.conversationTurn,
        recentTopics: context.recentTopics,
      },
      {
        topK: 10,
        minScore: 0.3,
        expandGraph: true,
        maxGraphHops: 2,
        hybrid: true,
      }
    );

    // Format entities into LLM-friendly context
    const formattedContext = formatEntitiesForLLM(result.entities);

    log.debug(
      {
        userId: userId.substring(0, 8),
        query: query.substring(0, 50),
        results: result.entities.length,
        latencyMs: result.latencyMs,
      },
      '🧠 Unified memory retrieval complete'
    );

    return {
      entities: result.entities,
      formattedContext,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Unified memory retrieval failed');
    return { entities: [], formattedContext: '' };
  }
}

/**
 * Format entities for LLM context injection
 */
function formatEntitiesForLLM(entities: EntitySearchResult[]): string {
  if (entities.length === 0) return '';

  const sections: string[] = [];

  // Group by type
  const byType = new Map<EntityType, EntitySearchResult[]>();
  for (const result of entities) {
    const type = result.entity.type;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(result);
  }

  // Format people
  const people = byType.get('person') || [];
  if (people.length > 0) {
    const peopleLines = people.map((r) => {
      const attrs = r.entity.attributes as PersonAttributes;
      const details = [attrs.relationship];
      if (attrs.lastKnownStatus) details.push(attrs.lastKnownStatus);
      return `- ${r.entity.canonicalName} (${details.join(', ')})`;
    });
    sections.push(`**People mentioned:**\n${peopleLines.join('\n')}`);
  }

  // Format commitments
  const commitments = byType.get('commitment') || [];
  if (commitments.length > 0) {
    const commitmentLines = commitments.map((r) => {
      const attrs = r.entity.attributes as CommitmentAttributes;
      return `- ${attrs.originalStatement} [${attrs.status}]`;
    });
    sections.push(`**Active commitments:**\n${commitmentLines.join('\n')}`);
  }

  // Format events
  const events = byType.get('event') || [];
  if (events.length > 0) {
    const eventLines = events.map((r) => {
      const attrs = r.entity.attributes as EventAttributes;
      const dateStr = attrs.date ? ` (${attrs.date.toLocaleDateString()})` : '';
      return `- ${r.entity.canonicalName}${dateStr}`;
    });
    sections.push(`**Relevant events:**\n${eventLines.join('\n')}`);
  }

  return sections.join('\n\n');
}

// ============================================================================
// PROACTIVE SURFACING INTEGRATION
// ============================================================================

/**
 * Check for proactive surfacing opportunities
 *
 * Call this on each turn to find memories worth proactively mentioning.
 */
export async function checkProactiveSurfacing(
  userId: string,
  currentTurn: string,
  context: {
    sessionId: string;
    personaId: string;
    turnNumber: number;
    surfacingCountThisSession: number;
    sessionTopics: string[];
    conversationMood?: 'exploratory' | 'venting' | 'seeking_help' | 'casual';
    lastTurnWasQuestion?: boolean;
    detectedEmotion?: string;
  }
): Promise<SurfacingOpportunity[]> {
  if (!initialized) {
    return [];
  }

  const engine = getProactiveSurfacingEngine();

  try {
    const opportunities = await engine.analyze({
      userId,
      currentTurn,
      sessionId: context.sessionId,
      personaId: context.personaId,
      turnNumber: context.turnNumber,
      surfacingCountThisSession: context.surfacingCountThisSession,
      sessionTopics: context.sessionTopics,
      conversationMood: context.conversationMood,
      lastTurnWasQuestion: context.lastTurnWasQuestion,
      detectedEmotion: context.detectedEmotion,
    });

    if (opportunities.length > 0) {
      log.debug(
        {
          userId: userId.substring(0, 8),
          opportunities: opportunities.map((o) => ({
            type: o.type,
            entity: o.entity.canonicalName,
            timing: o.timing,
          })),
        },
        '💡 Proactive surfacing opportunities found'
      );
    }

    return opportunities;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Proactive surfacing check failed');
    return [];
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function categorizeRelationship(
  relationship: string
): PersonAttributes['relationshipCategory'] {
  const rel = relationship.toLowerCase();

  if (
    [
      'mother',
      'father',
      'mom',
      'dad',
      'brother',
      'sister',
      'son',
      'daughter',
      'wife',
      'husband',
      'spouse',
      'parent',
      'child',
      'grandparent',
      'aunt',
      'uncle',
      'cousin',
    ].includes(rel)
  ) {
    return 'family';
  }

  if (['friend', 'best friend', 'close friend'].includes(rel)) {
    return 'friend';
  }

  if (['boss', 'coworker', 'colleague', 'manager', 'employee', 'client'].includes(rel)) {
    return 'colleague';
  }

  if (['doctor', 'lawyer', 'therapist', 'accountant', 'advisor'].includes(rel)) {
    return 'professional';
  }

  if (['acquaintance', 'neighbor'].includes(rel)) {
    return 'acquaintance';
  }

  return 'other';
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Re-export core functionality
  getEntityStore,
  graphRAGRetrieve,
  getProactiveSurfacingEngine,
};
