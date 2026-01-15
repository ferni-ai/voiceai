/**
 * Dynamic Memory Context Builder
 *
 * Retrieves and formats memories from the new dynamic extraction system:
 * - L1: STM Buffer (in-memory, current session)
 * - L2: Firestore (dynamic_entities, dynamic_facts, dynamic_relationships)
 * - L3: Spanner Graph (future - relationship traversal)
 *
 * This builder integrates with the temporal decoupling architecture:
 * - Fast capture populates immediate context
 * - Deep extraction results become available for next turns
 *
 * @module intelligence/context-builders/memory/dynamic-memory-context
 */

import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createStandardInjection, createHintInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';

const log = createLogger({ module: 'context:dynamic-memory' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface DynamicMemoryConfig {
  /** Maximum entities to retrieve */
  maxEntities: number;
  /** Maximum facts per entity */
  maxFactsPerEntity: number;
  /** Maximum relationships to retrieve */
  maxRelationships: number;
  /** How far back to look (ms) */
  lookbackMs: number;
  /** Minimum importance score to include */
  minImportanceScore: number;
}

const DEFAULT_CONFIG: DynamicMemoryConfig = {
  maxEntities: 10,
  maxFactsPerEntity: 5,
  maxRelationships: 8,
  lookbackMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  minImportanceScore: 0.3,
};

let config = { ...DEFAULT_CONFIG };

/**
 * Configure dynamic memory retrieval
 */
export function configureDynamicMemory(newConfig: Partial<DynamicMemoryConfig>): void {
  config = { ...config, ...newConfig };
}

// ============================================================================
// FIRESTORE TYPES
// ============================================================================

interface DynamicEntity {
  id: string;
  name: string;
  type: 'person' | 'place' | 'organization' | 'event' | 'concept' | 'thing';
  attributes: Record<string, string>;
  importance: number;
  mentionCount: number;
  lastMentioned: Date;
  createdAt: Date;
}

interface DynamicFact {
  id: string;
  entityName: string;
  factType: 'attribute' | 'event' | 'relationship' | 'state' | 'preference';
  key: string;
  value: string;
  confidence: number;
  temporalContext?: string;
  extractedAt: Date;
}

interface DynamicRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  bidirectional: boolean;
  createdAt: Date;
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Retrieve recent dynamic entities for a user
 */
async function getRecentEntities(userId: string): Promise<DynamicEntity[]> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      log.debug({ userId }, 'Firestore not available, skipping entity retrieval');
      return [];
    }
    const cutoff = new Date(Date.now() - config.lookbackMs);

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('dynamic_entities')
      .where('lastMentioned', '>=', cutoff)
      .orderBy('lastMentioned', 'desc')
      .orderBy('importance', 'desc')
      .limit(config.maxEntities)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        type: data.type,
        attributes: data.attributes || {},
        importance: data.importance || 0.5,
        mentionCount: data.mentionCount || 1,
        lastMentioned: data.lastMentioned?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve dynamic entities');
    return [];
  }
}

/**
 * Retrieve facts about specific entities
 */
async function getFactsForEntities(userId: string, entityNames: string[]): Promise<DynamicFact[]> {
  if (entityNames.length === 0) return [];

  try {
    const db = getFirestoreDb();
    if (!db) {
      log.debug({ userId }, 'Firestore not available, skipping facts retrieval');
      return [];
    }
    const allFacts: DynamicFact[] = [];

    // Query facts for each entity (Firestore doesn't support array-contains-any with other filters well)
    for (const entityName of entityNames.slice(0, config.maxEntities)) {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('dynamic_facts')
        .where('entityName', '==', entityName)
        .orderBy('confidence', 'desc')
        .limit(config.maxFactsPerEntity)
        .get();

      const facts = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          entityName: data.entityName,
          factType: data.factType,
          key: data.key,
          value: data.value,
          confidence: data.confidence || 0.5,
          temporalContext: data.temporalContext,
          extractedAt: data.extractedAt?.toDate() || new Date(),
        };
      });

      allFacts.push(...facts);
    }

    return allFacts;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve dynamic facts');
    return [];
  }
}

/**
 * Retrieve relationship graph for user
 */
async function getRelationships(userId: string): Promise<DynamicRelationship[]> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      log.debug({ userId }, 'Firestore not available, skipping relationships retrieval');
      return [];
    }

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('dynamic_relationships')
      .orderBy('strength', 'desc')
      .limit(config.maxRelationships)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        source: data.source,
        target: data.target,
        type: data.type,
        strength: data.strength || 0.5,
        bidirectional: data.bidirectional || false,
        createdAt: data.createdAt?.toDate() || new Date(),
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve dynamic relationships');
    return [];
  }
}

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format entities and facts into readable context
 */
function formatEntityContext(entities: DynamicEntity[], facts: DynamicFact[]): string {
  if (entities.length === 0) return '';

  const lines: string[] = ['## People & Things You Know About'];

  // Group facts by entity
  const factsByEntity = new Map<string, DynamicFact[]>();
  for (const fact of facts) {
    const existing = factsByEntity.get(fact.entityName) || [];
    existing.push(fact);
    factsByEntity.set(fact.entityName, existing);
  }

  // Format each entity with its facts
  for (const entity of entities) {
    const entityFacts = factsByEntity.get(entity.name) || [];
    const typeLabel = entity.type === 'person' ? '👤' : entity.type === 'place' ? '📍' : '📦';

    let entityLine = `${typeLabel} **${entity.name}**`;
    if (entity.type !== 'person') {
      entityLine += ` (${entity.type})`;
    }

    // Add key attributes inline
    const inlineAttrs = Object.entries(entity.attributes)
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (inlineAttrs) {
      entityLine += ` - ${inlineAttrs}`;
    }

    lines.push(entityLine);

    // Add facts as bullet points
    for (const fact of entityFacts.slice(0, 3)) {
      if (fact.temporalContext) {
        lines.push(`  - ${fact.key}: ${fact.value} (${fact.temporalContext})`);
      } else {
        lines.push(`  - ${fact.key}: ${fact.value}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format relationships into readable context
 */
function formatRelationshipContext(relationships: DynamicRelationship[]): string {
  if (relationships.length === 0) return '';

  const lines: string[] = ['## Relationship Network'];

  // Group by relationship type
  const byType = new Map<string, DynamicRelationship[]>();
  for (const rel of relationships) {
    const existing = byType.get(rel.type) || [];
    existing.push(rel);
    byType.set(rel.type, existing);
  }

  for (const [type, rels] of byType) {
    lines.push(`**${type}:**`);
    for (const rel of rels.slice(0, 3)) {
      const arrow = rel.bidirectional ? '↔️' : '→';
      lines.push(`  - ${rel.source} ${arrow} ${rel.target}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build dynamic memory context for LLM injection
 */
async function buildDynamicMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userData, persona, analysis } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userId;
  if (!userId) {
    return [];
  }

  try {
    // Retrieve dynamic memories in parallel
    const [entities, relationships] = await Promise.all([
      getRecentEntities(userId),
      getRelationships(userId),
    ]);

    // Skip if no data
    if (entities.length === 0 && relationships.length === 0) {
      log.debug({ userId }, 'No dynamic memory data available');
      return [];
    }

    // Get facts for retrieved entities
    const entityNames = entities.map((e) => e.name);
    const facts = await getFactsForEntities(userId, entityNames);

    // Format context sections
    const entityContext = formatEntityContext(entities, facts);
    const relationshipContext = formatRelationshipContext(relationships);

    // Combine into single injection
    const sections: string[] = [];
    if (entityContext) sections.push(entityContext);
    if (relationshipContext) sections.push(relationshipContext);

    if (sections.length > 0) {
      const fullContext = sections.join('\n\n');

      injections.push(
        createStandardInjection('dynamic_memory', fullContext, {
          category: 'memory',
          confidence: 0.85,
        })
      );

      log.debug(
        {
          userId,
          entityCount: entities.length,
          factCount: facts.length,
          relationshipCount: relationships.length,
        },
        'Injected dynamic memory context'
      );
    }

    // Add hints for highly relevant entities mentioned in current message
    const currentMentions = entities.filter((e) =>
      userText.toLowerCase().includes(e.name.toLowerCase())
    );

    if (currentMentions.length > 0) {
      const mentionHints = currentMentions
        .map((e) => {
          const entityFacts = facts.filter((f) => f.entityName === e.name);
          const factSummary = entityFacts
            .slice(0, 2)
            .map((f) => `${f.key}: ${f.value}`)
            .join('; ');
          return `💡 ${e.name}: ${factSummary || 'No additional facts'}`;
        })
        .join('\n');

      injections.push(
        createHintInjection(
          'dynamic_memory_mentions',
          `[RELEVANT MEMORIES - ${currentMentions.map((e) => e.name).join(', ')} mentioned]\n${mentionHints}`,
          { category: 'memory', confidence: 0.9 }
        )
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build dynamic memory context');
  }

  return injections;
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Dynamic Memory Context Builder
 *
 * Retrieves and formats memories from the LLM-powered extraction system.
 * Provides entity knowledge, facts, and relationship awareness.
 */
export const dynamicMemoryContextBuilder: ContextBuilder = {
  name: 'dynamic-memory',
  description: 'LLM-extracted entities, facts, and relationships from recent conversations',
  priority: 75, // After core memory, before hints
  category: BuilderCategory.MEMORY,
  build: buildDynamicMemoryContext,
};

// Register the builder
registerContextBuilder(dynamicMemoryContextBuilder);

export { buildDynamicMemoryContext };
