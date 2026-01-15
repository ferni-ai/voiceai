/**
 * Knowledge Graph Integration Layer
 *
 * Bridges the new knowledge graph with existing systems:
 * - Data capture pipeline (contacts, commitments, relationships)
 * - Existing superhuman services
 * - Turn processor
 *
 * This enables gradual migration: existing systems continue to work,
 * while the knowledge graph accumulates richer data over time.
 *
 * @module memory/knowledge-graph/integration
 */

import { createLogger } from '../../utils/safe-logger.js';
// NOTE: getKnowledgeGraph and getEntityResolver are imported lazily inside functions
// to avoid circular dependency (integration.ts <- index.ts <- integration.ts)
import type { Entity, EntityType, MentionInput } from './types.js';

// Alias for backward compatibility
type EntityMention = MentionInput;

const log = createLogger({ module: 'KnowledgeGraphIntegration' });

// ============================================================================
// DATA CAPTURE INTEGRATION
// ============================================================================

/**
 * Process a captured contact into the knowledge graph.
 * Call this from the data capture pipeline after extracting a contact.
 */
export async function integrateContact(
  userId: string,
  contact: {
    name?: string;
    relationship?: string;
    phone?: string;
    email?: string;
  },
  context?: {
    sessionId?: string;
    turnNumber?: number;
    sourceText?: string;
  }
): Promise<Entity> {
  const kg = await getKG();

  // Build entity mention from contact
  const mention: EntityMention = {
    text: contact.name || contact.relationship || 'Contact',
    name: contact.name,
    relationship: contact.relationship,
    type: 'person',
    phone: contact.phone,
    email: contact.email,
  };

  // Resolve to entity (creates new or matches existing)
  const entity = await kg.resolveMention(userId, mention, {
    sessionId: context?.sessionId,
    turnNumber: context?.turnNumber,
    sourceText: context?.sourceText,
  });

  // Add facts from the contact data
  if (contact.phone) {
    await kg.addFact(userId, entity.id, `Phone number: ${contact.phone}`, {
      predicate: 'phone',
      value: contact.phone,
      sessionId: context?.sessionId,
      sourceText: context?.sourceText,
    });
  }

  if (contact.email) {
    await kg.addFact(userId, entity.id, `Email: ${contact.email}`, {
      predicate: 'email',
      value: contact.email,
      sessionId: context?.sessionId,
      sourceText: context?.sourceText,
    });
  }

  log.debug(
    { userId, entityId: entity.id, name: entity.canonicalName },
    'Integrated contact into knowledge graph'
  );

  return entity;
}

/**
 * Process a captured commitment into the knowledge graph.
 */
export async function integrateCommitment(
  userId: string,
  commitment: {
    description: string;
    dueDate?: Date;
    priority?: 'high' | 'medium' | 'low';
    relatedPerson?: string;
  },
  context?: {
    sessionId?: string;
    turnNumber?: number;
    sourceText?: string;
  }
): Promise<Entity> {
  const kg = await getKG();
  const resolver = await getResolver();

  // Create commitment entity
  const mention: EntityMention = {
    text: commitment.description,
    type: 'commitment',
  };

  const entity = await kg.resolveMention(userId, mention, {
    sessionId: context?.sessionId,
    turnNumber: context?.turnNumber,
    sourceText: context?.sourceText,
  });

  // Update properties
  const db = (await import('../../utils/firestore-utils.js')).getFirestoreDb();
  if (db) {
    await db
      .collection('knowledge_graph')
      .doc(userId)
      .collection('entities')
      .doc(entity.id)
      .update({
        'properties.dueDate': commitment.dueDate,
        'properties.priority': commitment.priority,
        'properties.completed': false,
      });
  }

  // If there's a related person, create relationship
  if (commitment.relatedPerson) {
    const personResult = await resolver.resolve(userId, {
      name: commitment.relatedPerson,
      type: 'person',
    });

    if (personResult) {
      await resolver.addRelationship(userId, entity.id, personResult.id, 'involves');
    }
  }

  log.debug(
    { userId, entityId: entity.id, description: commitment.description.slice(0, 50) },
    'Integrated commitment into knowledge graph'
  );

  return entity;
}

/**
 * Process a relationship mention into the knowledge graph.
 */
export async function integrateRelationshipMention(
  userId: string,
  mention: {
    personName?: string;
    relationship: string;
    context?: string;
    sentiment?: 'positive' | 'negative' | 'neutral';
  },
  sessionContext?: {
    sessionId?: string;
    turnNumber?: number;
    emotion?: string;
    emotionalIntensity?: number;
  }
): Promise<Entity> {
  const kg = await getKG();

  const entityMention: EntityMention = {
    text: mention.personName || mention.relationship,
    name: mention.personName,
    relationship: mention.relationship,
    type: 'person',
  };

  const entity = await kg.resolveMention(userId, entityMention, {
    sessionId: sessionContext?.sessionId,
    turnNumber: sessionContext?.turnNumber,
    sourceText: mention.context,
    emotionalIntensity: sessionContext?.emotionalIntensity,
  });

  // Record the mention for temporal tracking
  if (sessionContext?.sessionId && sessionContext?.turnNumber !== undefined) {
    await kg.recordMention(userId, entity.id, {
      sessionId: sessionContext.sessionId,
      turnNumber: sessionContext.turnNumber,
      transcript: mention.context || mention.relationship,
      emotion: sessionContext.emotion,
      emotionalIntensity: sessionContext.emotionalIntensity,
    });
  }

  return entity;
}

// ============================================================================
// TURN PROCESSOR INTEGRATION
// ============================================================================

/**
 * Process a conversation turn for knowledge graph updates.
 * Call this from the turn processor after analysis.
 */
export async function processConversationTurn(
  userId: string,
  turn: {
    sessionId: string;
    turnNumber: number;
    userMessage: string;
    currentTopic?: string;
    emotion?: string;
    emotionalIntensity?: number;
    extractedNames?: Array<{ name: string; context: string }>;
    extractedRelationships?: Array<{ relationship: string; name?: string; context: string }>;
  }
): Promise<void> {
  const kg = await getKG();

  // Process extracted names
  if (turn.extractedNames) {
    for (const { name, context } of turn.extractedNames) {
      try {
        const entity = await kg.resolveMention(
          userId,
          {
            text: name,
            name,
            type: 'person',
          },
          {
            sessionId: turn.sessionId,
            turnNumber: turn.turnNumber,
            sourceText: context,
            emotionalIntensity: turn.emotionalIntensity,
          }
        );

        await kg.recordMention(userId, entity.id, {
          sessionId: turn.sessionId,
          turnNumber: turn.turnNumber,
          transcript: context,
          emotion: turn.emotion,
          emotionalIntensity: turn.emotionalIntensity,
        });
      } catch (error) {
        log.warn({ error: String(error), name }, 'Failed to process extracted name');
      }
    }
  }

  // Process extracted relationships
  if (turn.extractedRelationships) {
    for (const { relationship, name, context } of turn.extractedRelationships) {
      try {
        const entity = await kg.resolveMention(
          userId,
          {
            text: name || relationship,
            name,
            relationship,
            type: 'person',
          },
          {
            sessionId: turn.sessionId,
            turnNumber: turn.turnNumber,
            sourceText: context,
            emotionalIntensity: turn.emotionalIntensity,
          }
        );

        await kg.recordMention(userId, entity.id, {
          sessionId: turn.sessionId,
          turnNumber: turn.turnNumber,
          transcript: context,
          emotion: turn.emotion,
          emotionalIntensity: turn.emotionalIntensity,
        });
      } catch (error) {
        log.warn(
          { error: String(error), relationship },
          'Failed to process extracted relationship'
        );
      }
    }
  }

  // If we have a topic, also track it as an entity
  if (turn.currentTopic && turn.currentTopic !== 'general') {
    try {
      const topicEntity = await kg.resolveMention(
        userId,
        {
          text: turn.currentTopic,
          type: 'topic',
        },
        {
          sessionId: turn.sessionId,
          turnNumber: turn.turnNumber,
          sourceText: turn.userMessage,
        }
      );

      await kg.recordMention(userId, topicEntity.id, {
        sessionId: turn.sessionId,
        turnNumber: turn.turnNumber,
        transcript: turn.userMessage.slice(0, 200),
        emotion: turn.emotion,
        emotionalIntensity: turn.emotionalIntensity,
      });
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to track topic entity');
    }
  }
}

// ============================================================================
// SUPERHUMAN SERVICE INTEGRATION
// ============================================================================

/**
 * Sync data from an existing superhuman service to the knowledge graph.
 * This enables gradual migration from fragmented stores.
 */
export async function syncFromSuperhumanService(
  userId: string,
  service: 'commitment-keeper' | 'relationship-network' | 'dream-keeper' | 'values-alignment',
  data: unknown[]
): Promise<number> {
  const kg = await getKG();
  let synced = 0;

  switch (service) {
    case 'relationship-network': {
      const people = data as Array<{ name: string; relationship?: string; importance?: number }>;
      for (const person of people) {
        try {
          await kg.resolveMention(userId, {
            text: person.name,
            name: person.name,
            relationship: person.relationship,
            type: 'person',
          });
          synced++;
        } catch {
          // Skip on error
        }
      }
      break;
    }

    case 'commitment-keeper': {
      const commitments = data as Array<{ content: string; dueDate?: Date }>;
      for (const commitment of commitments) {
        try {
          await integrateCommitment(userId, {
            description: commitment.content,
            dueDate: commitment.dueDate,
          });
          synced++;
        } catch {
          // Skip on error
        }
      }
      break;
    }

    case 'dream-keeper': {
      const dreams = data as Array<{ description: string; category?: string }>;
      for (const dream of dreams) {
        try {
          await kg.resolveMention(userId, {
            text: dream.description,
            type: 'dream',
          });
          synced++;
        } catch {
          // Skip on error
        }
      }
      break;
    }

    case 'values-alignment': {
      const values = data as Array<{ name: string; category?: string }>;
      for (const value of values) {
        try {
          await kg.resolveMention(userId, {
            text: value.name,
            type: 'value',
          });
          synced++;
        } catch {
          // Skip on error
        }
      }
      break;
    }
  }

  log.info({ userId, service, synced }, 'Synced from superhuman service');
  return synced;
}

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================

/**
 * Migrate all existing data for a user to the knowledge graph.
 * This is a one-time operation to bootstrap the graph from existing stores.
 */
export async function migrateUserData(userId: string): Promise<{
  contacts: number;
  commitments: number;
  relationships: number;
}> {
  const kg = await getKG();
  const stats = {
    contacts: 0,
    commitments: 0,
    relationships: 0,
  };

  try {
    // 1. Migrate from user_contacts collection
    const { searchContacts } = await import('../../services/identity/contacts.js');
    const contacts = await searchContacts(userId, ''); // Get all
    for (const result of contacts) {
      await integrateContact(userId, {
        name: result.contact.displayName,
        relationship: result.contact.relationship,
        phone: result.contact.phones?.[0]?.number,
        email: result.contact.emails?.[0]?.address,
      });
      stats.contacts++;
    }

    // 2. Migrate from relationship_network
    try {
      const { loadNetwork } = await import('../../services/superhuman/relationship-network.js');
      const network = await loadNetwork(userId);
      for (const person of network) {
        await kg.resolveMention(userId, {
          text: person.name,
          name: person.name,
          relationship: person.type,
          type: 'person',
        });
        stats.relationships++;
      }
    } catch {
      // Service might not exist
    }

    // 3. Migrate from commitment_keeper
    try {
      const { loadUserCommitments } =
        await import('../../services/superhuman/commitment-keeper.js');
      const commitments = await loadUserCommitments(userId);
      for (const commitment of commitments) {
        await integrateCommitment(userId, {
          description: commitment.summary,
          dueDate: commitment.targetDate ? new Date(commitment.targetDate) : undefined,
          priority:
            commitment.emotionalWeight > 0.7
              ? 'high'
              : commitment.emotionalWeight > 0.4
                ? 'medium'
                : 'low',
        });
        stats.commitments++;
      }
    } catch {
      // Service might not exist
    }

    log.info({ userId, ...stats }, 'User data migration complete');
  } catch (error) {
    log.error({ userId, error: String(error) }, 'User data migration failed');
  }

  return stats;
}

// Helper to get knowledge graph lazily (avoids circular dependency)
async function getKG() {
  const { getKnowledgeGraph } = await import('./index.js');
  return getKnowledgeGraph();
}

// Helper to get entity resolver lazily (avoids circular dependency)
async function getResolver() {
  const { getEntityResolver } = await import('./index.js');
  return getEntityResolver();
}
