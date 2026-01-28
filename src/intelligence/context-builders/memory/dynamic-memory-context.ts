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

import { getFirestoreDb, toSafeDate } from '../../../utils/firestore-utils.js';
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
  maxEntities: 15, // Increased from 10 - more entity context
  maxFactsPerEntity: 8, // Increased from 5 - more facts per entity
  maxRelationships: 12, // Increased from 8 - richer relationship context
  lookbackMs: 30 * 24 * 60 * 60 * 1000, // 30 days (was 7 days - too short)
  minImportanceScore: 0.25, // Lowered from 0.3 - don't filter out low-importance facts
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

/**
 * Human signals from LLM extraction (Jan 2026)
 * "Better Than Human" - things a human friend would forget
 */
interface HumanSignal {
  id: string;
  type: string;
  value: string;
  context?: string;
  confidence: number;
  extractedAt: Date;
}

interface HumanMemoryProfile {
  importantDates: HumanSignal[];
  values: HumanSignal[];
  dreams: HumanSignal[];
  fears: HumanSignal[];
  growthMarkers: HumanSignal[];
  comfortPatterns: HumanSignal[];
  challenges: HumanSignal[];
  stressTriggers: HumanSignal[];
  importantPeople: HumanSignal[];
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
        lastMentioned: toSafeDate(data.lastMentioned),
        createdAt: toSafeDate(data.createdAt),
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
          extractedAt: toSafeDate(data.extractedAt),
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
        createdAt: toSafeDate(data.createdAt),
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve dynamic relationships');
    return [];
  }
}

/**
 * Retrieve human signals from LLM extraction (Jan 2026)
 * "Better Than Human" memory - dreams, fears, values, important dates, etc.
 */
async function getHumanSignals(userId: string): Promise<HumanMemoryProfile | null> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      log.debug({ userId }, 'Firestore not available, skipping human signals retrieval');
      return null;
    }

    const profileRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('human_memory')
      .doc('profile');

    const doc = await profileRef.get();
    
    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    
    // Map each signal array, ensuring proper date conversion
    const mapSignals = (arr: unknown[]): HumanSignal[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map((item: unknown) => {
        const obj = item as Record<string, unknown>;
        return {
          id: String(obj.id || ''),
          type: String(obj.type || ''),
          value: String(obj.value || ''),
          context: obj.context ? String(obj.context) : undefined,
          confidence: Number(obj.confidence) || 0.7,
          extractedAt: (obj.extractedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
        };
      });
    };

    return {
      importantDates: mapSignals(data.importantDates || []),
      values: mapSignals(data.values || []),
      dreams: mapSignals(data.dreams || []),
      fears: mapSignals(data.fears || []),
      growthMarkers: mapSignals(data.growthMarkers || []),
      comfortPatterns: mapSignals(data.comfortPatterns || []),
      challenges: mapSignals(data.challenges || []),
      stressTriggers: mapSignals(data.stressTriggers || []),
      importantPeople: mapSignals(data.importantPeople || []),
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve human signals');
    return null;
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

/**
 * Format human signals into readable context (Jan 2026)
 * "Better Than Human" - surfaces extracted values, dreams, fears, etc.
 */
function formatHumanSignalsContext(signals: HumanMemoryProfile | null): string {
  if (!signals) return '';

  const lines: string[] = [];
  let hasContent = false;

  // Important dates (upcoming or significant)
  if (signals.importantDates.length > 0) {
    lines.push('## Important Dates They\'ve Shared');
    for (const date of signals.importantDates.slice(0, 5)) {
      const context = date.context ? ` (${date.context})` : '';
      lines.push(`📅 ${date.value}${context}`);
    }
    hasContent = true;
  }

  // Values - what matters to them
  if (signals.values.length > 0) {
    lines.push('\n## Their Core Values');
    for (const value of signals.values.slice(0, 5)) {
      const context = value.context ? ` - "${value.context}"` : '';
      lines.push(`💎 ${value.value}${context}`);
    }
    hasContent = true;
  }

  // Dreams and aspirations
  if (signals.dreams.length > 0) {
    lines.push('\n## Dreams & Aspirations');
    for (const dream of signals.dreams.slice(0, 3)) {
      const context = dream.context ? ` ("${dream.context}")` : '';
      lines.push(`✨ ${dream.value}${context}`);
    }
    hasContent = true;
  }

  // Fears and worries (handle with care)
  if (signals.fears.length > 0) {
    lines.push('\n## Worries & Concerns (Be Gentle)');
    for (const fear of signals.fears.slice(0, 3)) {
      lines.push(`🔒 ${fear.value}`);
    }
    hasContent = true;
  }

  // Growth markers - celebrate progress
  if (signals.growthMarkers.length > 0) {
    lines.push('\n## Growth & Progress');
    for (const growth of signals.growthMarkers.slice(0, 3)) {
      const context = growth.context ? ` - ${growth.context}` : '';
      lines.push(`🌱 ${growth.value}${context}`);
    }
    hasContent = true;
  }

  // Current challenges
  if (signals.challenges.length > 0) {
    lines.push('\n## Current Challenges');
    for (const challenge of signals.challenges.slice(0, 3)) {
      lines.push(`⚡ ${challenge.value}`);
    }
    hasContent = true;
  }

  // Comfort patterns - what helps them
  if (signals.comfortPatterns.length > 0) {
    lines.push('\n## What Helps Them');
    for (const comfort of signals.comfortPatterns.slice(0, 3)) {
      lines.push(`🌊 ${comfort.value}`);
    }
    hasContent = true;
  }

  // Important people
  if (signals.importantPeople.length > 0) {
    lines.push('\n## Important People in Their Life');
    for (const person of signals.importantPeople.slice(0, 5)) {
      const context = person.context ? ` (${person.context})` : '';
      lines.push(`👥 ${person.value}${context}`);
    }
    hasContent = true;
  }

  if (!hasContent) return '';

  return lines.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build dynamic memory context for LLM injection
 * 
 * MEMORY FIX (Jan 2026): Now includes human signals from LLM extraction
 * - Dreams, fears, values, important dates
 * - Growth markers, challenges, comfort patterns
 * - Important people
 */
async function buildDynamicMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userData, persona, analysis } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userId;
  if (!userId) {
    return [];
  }

  try {
    // Retrieve dynamic memories AND human signals in parallel (Jan 2026)
    const [entities, relationships, humanSignals] = await Promise.all([
      getRecentEntities(userId),
      getRelationships(userId),
      getHumanSignals(userId),
    ]);

    // Skip if no data at all
    if (entities.length === 0 && relationships.length === 0 && !humanSignals) {
      log.debug({ userId }, 'No dynamic memory data available');
      return [];
    }

    // Get facts for retrieved entities
    const entityNames = entities.map((e) => e.name);
    const facts = await getFactsForEntities(userId, entityNames);

    // Format context sections
    const entityContext = formatEntityContext(entities, facts);
    const relationshipContext = formatRelationshipContext(relationships);
    const humanSignalsContext = formatHumanSignalsContext(humanSignals);

    // Combine into single injection
    const sections: string[] = [];
    if (entityContext) sections.push(entityContext);
    if (relationshipContext) sections.push(relationshipContext);
    if (humanSignalsContext) sections.push(humanSignalsContext);

    if (sections.length > 0) {
      const fullContext = sections.join('\n\n');

      injections.push(
        createStandardInjection('dynamic_memory', fullContext, {
          category: 'memory',
          confidence: 0.85,
        })
      );

      // Count human signal items for logging
      const signalCount = humanSignals
        ? Object.values(humanSignals).reduce((sum, arr) => sum + arr.length, 0)
        : 0;

      log.info(
        {
          userId,
          entityCount: entities.length,
          factCount: facts.length,
          relationshipCount: relationships.length,
          humanSignalCount: signalCount,
        },
        '🧠 [MEMORY-AUDIT] Injected dynamic memory context (includes human signals)'
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

    // Add hints for relevant human signals based on user message (Jan 2026)
    if (humanSignals) {
      const lowerText = userText.toLowerCase();
      const relevantHints: string[] = [];

      // Check for dream/goal related keywords
      if (lowerText.includes('dream') || lowerText.includes('goal') || lowerText.includes('want to')) {
        const dreamHint = humanSignals.dreams.slice(0, 2).map(d => `✨ ${d.value}`).join('\n');
        if (dreamHint) relevantHints.push(`Their dreams:\n${dreamHint}`);
      }

      // Check for worry/fear related keywords
      if (lowerText.includes('worried') || lowerText.includes('afraid') || lowerText.includes('anxious')) {
        const fearHint = humanSignals.fears.slice(0, 2).map(f => `🔒 ${f.value}`).join('\n');
        if (fearHint) relevantHints.push(`Known worries:\n${fearHint}`);
      }

      // Check for progress/growth keywords
      if (lowerText.includes('progress') || lowerText.includes('better') || lowerText.includes('growth')) {
        const growthHint = humanSignals.growthMarkers.slice(0, 2).map(g => `🌱 ${g.value}`).join('\n');
        if (growthHint) relevantHints.push(`Recent growth:\n${growthHint}`);
      }

      if (relevantHints.length > 0) {
        injections.push(
          createHintInjection(
            'human_signals_relevant',
            `[RELEVANT HUMAN SIGNALS]\n${relevantHints.join('\n\n')}`,
            { category: 'memory', confidence: 0.9 }
          )
        );
      }
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
