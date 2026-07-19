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

import {
  buildSTMContext,
  getFrequentEntities,
  getRecentTopics,
} from '../../../memory/dynamic/stm-buffer.js';
import { getPersistedHumanSignals } from '../../../memory/human-signal-persistence.js';
import type { RetrievedMemory } from '../../../memory/interfaces/index.js';
import { semanticSearch } from '../../../memory/retrieval/index.js';
import {
  mergeHumanSignalSources,
  type HumanMemoryProfileLike,
} from '../../../memory/storage/human-signal-merge.js';
import { getFirestoreDb, toSafeDate } from '../../../utils/firestore-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { createHintInjection, createStandardInjection, registerContextBuilder } from '../index.js';

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
// PROMOTED ENTITY / TOPIC PATTERN TYPES (from STM promotion)
// ============================================================================

interface PromotedEntity {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
  importance: number;
  lastContext: string;
  promotedAt: Date;
}

interface TopicPattern {
  id: string;
  sessionId: string;
  topics: string[];
  transitions: string[];
  dominantTopic: string;
  promotedAt: Date;
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Retrieve promoted entities (from STM promotion at session end)
 * These are frequently mentioned entities that were important enough to persist.
 */
async function getPromotedEntities(userId: string): Promise<PromotedEntity[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('promoted_entities')
      .orderBy('importance', 'desc')
      .limit(15)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        type: data.type || 'person',
        mentionCount: data.mentionCount || 1,
        importance: data.importance || 0.5,
        lastContext: data.lastContext || '',
        promotedAt: toSafeDate(data.promotedAt),
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve promoted entities');
    return [];
  }
}

/**
 * Retrieve recent topic patterns (from STM promotion at session end)
 * Shows conversation themes across sessions.
 */
async function getRecentTopicPatterns(userId: string): Promise<TopicPattern[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('topic_patterns')
      .orderBy('promotedAt', 'desc')
      .limit(5)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        sessionId: data.sessionId || '',
        topics: data.topics || [],
        transitions: data.transitions || [],
        dominantTopic: data.dominantTopic || 'general',
        promotedAt: toSafeDate(data.promotedAt),
      };
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve topic patterns');
    return [];
  }
}

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
 * Map raw signal-like objects to HumanSignal[].
 * Accepts both flat extractor shape ({ value }) and HumanMemory fields
 * ({ label }, { description }, { fear }, etc.).
 */
function mapSignals(arr: unknown[]): HumanSignal[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((item: unknown) => {
    const obj = item as Record<string, unknown>;
    const value = String(
      obj.value ||
        obj.label ||
        obj.description ||
        obj.fear ||
        obj.challenge ||
        obj.trigger ||
        obj.reference ||
        (obj.type && obj.effectiveFor ? `${obj.type} (${obj.effectiveFor})` : '') ||
        ''
    );
    const extractedAtRaw =
      obj.extractedAt || obj.discoveredAt || obj.observedAt || obj.firstMentioned;
    const extractedAt =
      (extractedAtRaw as { toDate?: () => Date })?.toDate?.() ||
      (extractedAtRaw instanceof Date ? extractedAtRaw : new Date());
    return {
      id: String(obj.id || ''),
      type: String(obj.type || ''),
      value,
      context: obj.context
        ? String(obj.context)
        : obj.notes
          ? String(obj.notes)
          : obj.evidence && Array.isArray(obj.evidence)
            ? String(obj.evidence[0] || '')
            : undefined,
      confidence: Number(obj.confidence) || 0.7,
      extractedAt,
    };
  });
}

/**
 * Normalize Firestore human_memory/profile OR profile.humanMemory into HumanMemoryProfile.
 * Handles flat arrays and nested HumanMemory (identity / growthArc / emotionalSignature).
 */
function normalizeHumanMemoryData(data: Record<string, unknown>): HumanMemoryProfile {
  const identity = (data.identity as Record<string, unknown> | undefined) || undefined;
  const growthArc = (data.growthArc as Record<string, unknown> | undefined) || undefined;
  const emotionalSignature =
    (data.emotionalSignature as Record<string, unknown> | undefined) || undefined;

  return {
    importantDates: mapSignals((data.importantDates as unknown[]) || []),
    values: mapSignals((data.values as unknown[]) || (identity?.values as unknown[]) || []),
    dreams: mapSignals((data.dreams as unknown[]) || (identity?.dreams as unknown[]) || []),
    fears: mapSignals((data.fears as unknown[]) || (identity?.fears as unknown[]) || []),
    growthMarkers: mapSignals(
      (data.growthMarkers as unknown[]) || (growthArc?.markers as unknown[]) || []
    ),
    comfortPatterns: mapSignals(
      (data.comfortPatterns as unknown[]) ||
        (emotionalSignature?.comfortPatterns as unknown[]) ||
        []
    ),
    challenges: mapSignals(
      (data.challenges as unknown[]) || (growthArc?.challenges as unknown[]) || []
    ),
    stressTriggers: mapSignals(
      (data.stressTriggers as unknown[]) || (emotionalSignature?.stressTriggers as unknown[]) || []
    ),
    importantPeople: mapSignals((data.importantPeople as unknown[]) || []),
  };
}

function isHumanMemoryProfileEmpty(profile: HumanMemoryProfile): boolean {
  return Object.values(profile).every((arr) => arr.length === 0);
}

function emptyProfile(): HumanMemoryProfile {
  return {
    importantDates: [],
    values: [],
    dreams: [],
    fears: [],
    growthMarkers: [],
    comfortPatterns: [],
    challenges: [],
    stressTriggers: [],
    importantPeople: [],
  };
}

/**
 * Retrieve human signals from LLM extraction (Jan 2026)
 * "Better Than Human" memory - dreams, fears, values, important dates, etc.
 *
 * Read path (unified, BTH-B1):
 * 1. Prefer human_memory/profile subcollection
 * 2. If missing/empty, fall back to profile.humanMemory on the main user doc
 * 3. Merge in human_signals/* shards written by `persistHumanSignals` — the
 *    two write paths are dual-write this sprint, so the reader must union
 *    both or shard-only writes silently disappear on the next session.
 */
async function getHumanSignals(userId: string): Promise<HumanMemoryProfile | null> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      log.debug({ userId }, 'Firestore not available, skipping human signals retrieval');
      return null;
    }

    const userRef = db.collection('bogle_users').doc(userId);

    // 1. Prefer dedicated human_memory/profile doc
    const profileDoc = await userRef.collection('human_memory').doc('profile').get();
    const fromSubcollection = profileDoc.exists
      ? normalizeHumanMemoryData(profileDoc.data() || {})
      : null;

    // 2. Fall back to main user profile doc's humanMemory field
    let fromProfile: HumanMemoryProfile | null = null;
    if (!fromSubcollection || isHumanMemoryProfileEmpty(fromSubcollection)) {
      const userDoc = await userRef.get();
      const humanMemory = userDoc.exists
        ? (userDoc.data()?.humanMemory as Record<string, unknown> | undefined)
        : undefined;
      if (humanMemory && typeof humanMemory === 'object') {
        const normalized = normalizeHumanMemoryData(humanMemory);
        if (!isHumanMemoryProfileEmpty(normalized)) {
          log.debug({ userId }, '🧠 [MEMORY] Using profile.humanMemory fallback for human signals');
          fromProfile = normalized;
        }
      }
    }

    const profileHasContent = !!fromSubcollection && !isHumanMemoryProfileEmpty(fromSubcollection);
    const base = profileHasContent ? fromSubcollection : (fromProfile ?? emptyProfile());

    // 3. Merge in human_signals/* shards (BTH-B1 unification).
    // The shard writer (`persistHumanSignals`) mirrors every shard into
    // human_memory/profile on write, so once the profile doc is non-empty it
    // already reflects the shards — skip the extra shard fan-out (10 doc
    // reads) in that case. Still fetch shards when the profile is empty/
    // missing so STM-only shard writes stay visible until the mirror runs.
    const shards = profileHasContent ? {} : await getPersistedHumanSignals(userId);
    // HumanSignal is a closed interface (no index signature); the merge
    // helper's item type is intentionally generic so it stays dependency-free.
    // mapSignals() below re-normalizes every item back into HumanSignal.
    const mergedRaw = mergeHumanSignalSources(base as unknown as HumanMemoryProfileLike, {
      importantDates: shards.importantDates,
      values: shards.values,
      dreams: shards.dreams,
      fears: shards.fears,
      growthMarkers: shards.growthMarkers,
      comfortPatterns: shards.comfortPatterns,
      challenges: shards.challenges,
      stressTriggers: shards.stressTriggers,
    });

    const merged: HumanMemoryProfile = {
      importantDates: mapSignals(mergedRaw.importantDates),
      values: mapSignals(mergedRaw.values),
      dreams: mapSignals(mergedRaw.dreams),
      fears: mapSignals(mergedRaw.fears),
      growthMarkers: mapSignals(mergedRaw.growthMarkers),
      comfortPatterns: mapSignals(mergedRaw.comfortPatterns),
      challenges: mapSignals(mergedRaw.challenges),
      stressTriggers: mapSignals(mergedRaw.stressTriggers),
      importantPeople: base.importantPeople,
    };

    if (isHumanMemoryProfileEmpty(merged)) {
      return null;
    }

    return merged;
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
    lines.push("## Important Dates They've Shared");
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
// SEMANTIC MEMORY RETRIEVAL (BTH Architecture - Feb 2026)
// ============================================================================

/**
 * Retrieve semantically relevant memories using embedding search.
 *
 * Unlike time-based retrieval (getRecentEntities), this finds memories
 * by MEANING — e.g., when a user says "I'm worried about money", this
 * surfaces past conversations about finances, budgeting fears, etc.
 *
 * This is the "Better Than Human" upgrade: no human friend can recall
 * every relevant conversation by semantic similarity.
 */
async function getSemanticMemories(
  userId: string,
  query: string,
  topK = 5
): Promise<RetrievedMemory[]> {
  if (!query || query.trim().length < 3) return [];

  try {
    const memories = await semanticSearch(userId, query, topK);
    log.debug(
      {
        userId,
        query: query.slice(0, 50),
        resultsCount: memories.length,
      },
      '🔍 Semantic memory search completed'
    );
    return memories;
  } catch (error) {
    // Non-fatal — semantic search is an enhancement, not critical path
    log.debug(
      { error: String(error), userId },
      'Semantic memory search unavailable (falling back to time-based)'
    );
    return [];
  }
}

/**
 * Format semantically retrieved memories into context for LLM injection.
 */
function formatSemanticMemories(memories: RetrievedMemory[]): string {
  if (memories.length === 0) return '';

  const lines: string[] = ['## Relevant Memories (Semantic Match)'];

  for (const mem of memories) {
    const matchScore = mem.score ? ` (${Math.round(mem.score * 100)}% match)` : '';
    const typeLabel =
      mem.item.type === 'person'
        ? '👤'
        : mem.item.type === 'moment'
          ? '💬'
          : mem.item.type === 'commitment'
            ? '🤝'
            : mem.item.type === 'preference'
              ? '💡'
              : '🧠';

    const { content } = mem.item;
    if (content) {
      lines.push(`${typeLabel} ${content.slice(0, 150)}${matchScore}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build dynamic memory context for LLM injection
 *
 * Three retrieval strategies:
 * 1. L1: STM (in-memory, current session) — O(1), always available
 * 2. L2 time-based: Firestore entities/facts — recent by timestamp
 * 3. L2 semantic: Embedding search — relevant by meaning (BTH Feb 2026)
 */
async function buildDynamicMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userData, persona, analysis } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userId;
  if (!userId) {
    return [];
  }

  const sessionId = services?.sessionId;

  try {
    // =========================================================================
    // L1: STM Buffer (current session — O(1) access, always available)
    // =========================================================================
    if (sessionId) {
      const stmContext = buildSTMContext(sessionId);
      if (stmContext) {
        injections.push(
          createStandardInjection('stm_current_session', stmContext, {
            category: 'memory',
            confidence: 0.95, // High confidence — this is the current session
          })
        );

        // Also surface frequently mentioned entities from THIS session
        const stmEntities = getFrequentEntities(sessionId, 5);
        const stmTopics = getRecentTopics(sessionId);
        log.debug(
          {
            sessionId,
            stmEntities: stmEntities.length,
            stmTopics: stmTopics.length,
          },
          '🧠 [MEMORY] L1 STM context injected for current session'
        );
      }
    }

    // =========================================================================
    // L2a: Semantic Memory Retrieval (embedding search — BTH Feb 2026)
    // Finds memories by MEANING, not just recency.
    // =========================================================================
    const semanticMemories = await getSemanticMemories(userId, userText, 5);
    if (semanticMemories.length > 0) {
      const semanticContext = formatSemanticMemories(semanticMemories);
      if (semanticContext) {
        injections.push(
          createHintInjection('semantic_memory_matches', semanticContext, {
            category: 'memory',
            confidence: 0.88,
          })
        );
        log.debug(
          {
            userId,
            matchCount: semanticMemories.length,
            topScore: semanticMemories[0]?.score?.toFixed(2),
          },
          '🔍 [MEMORY] Semantic memories injected'
        );
      }
    }

    // =========================================================================
    // L2b: Firestore (persisted memories from past sessions — time-based)
    // =========================================================================

    // Retrieve dynamic memories, promoted entities, topic patterns,
    // and human signals in parallel
    const [entities, relationships, humanSignals, promotedEntities, topicPatterns] =
      await Promise.all([
        getRecentEntities(userId),
        getRelationships(userId),
        getHumanSignals(userId),
        getPromotedEntities(userId),
        getRecentTopicPatterns(userId),
      ]);

    // Skip Firestore injection if no L2 data (L1 may still have content)
    const hasL2Data =
      entities.length > 0 ||
      relationships.length > 0 ||
      humanSignals !== null ||
      promotedEntities.length > 0 ||
      topicPatterns.length > 0;

    if (!hasL2Data) {
      log.debug({ userId }, 'No L2 dynamic memory data available');
      return injections; // Return L1 injections (if any)
    }

    // Get facts for retrieved entities
    const entityNames = entities.map((e) => e.name);
    const facts = await getFactsForEntities(userId, entityNames);

    // Format context sections
    const entityContext = formatEntityContext(entities, facts);
    const relationshipContext = formatRelationshipContext(relationships);
    const humanSignalsContext = formatHumanSignalsContext(humanSignals);

    // Format promoted entities (frequently mentioned across sessions)
    let promotedContext = '';
    if (promotedEntities.length > 0) {
      const lines = ['## Frequently Mentioned (Across Sessions)'];
      for (const pe of promotedEntities.slice(0, 8)) {
        const label = pe.type === 'person' ? '👤' : '📌';
        lines.push(
          `${label} **${pe.name}** — mentioned ${pe.mentionCount}x${pe.lastContext ? ` (${pe.lastContext})` : ''}`
        );
      }
      promotedContext = lines.join('\n');
    }

    // Format topic patterns (recurring themes)
    let topicContext = '';
    if (topicPatterns.length > 0) {
      const allTopics = new Set<string>();
      for (const tp of topicPatterns) {
        for (const topic of tp.topics.slice(0, 5)) {
          allTopics.add(topic);
        }
      }
      if (allTopics.size > 0) {
        topicContext = `## Recurring Themes\n${Array.from(allTopics)
          .slice(0, 8)
          .map((t) => `🔄 ${t}`)
          .join('\n')}`;
      }
    }

    // Combine into single injection
    const sections: string[] = [];
    if (entityContext) sections.push(entityContext);
    if (promotedContext) sections.push(promotedContext);
    if (relationshipContext) sections.push(relationshipContext);
    if (topicContext) sections.push(topicContext);
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
          hasSTM: !!sessionId && !!buildSTMContext(sessionId || ''),
          entityCount: entities.length,
          factCount: facts.length,
          relationshipCount: relationships.length,
          humanSignalCount: signalCount,
        },
        '🧠 [MEMORY] L1+L2 memory context injected'
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

    // Add hints for relevant human signals based on user message
    // BTH Feb 2026: Use semantic signals + lightweight keyword matching
    // (semantic search above handles the heavy lifting; keywords catch obvious signals)
    if (humanSignals) {
      const lowerText = userText.toLowerCase();
      const relevantHints: string[] = [];

      // Surface dreams/goals if semantically or lexically relevant
      const dreamKeywords = ['dream', 'goal', 'want to', 'aspire', 'hope', 'wish', 'plan'];
      if (dreamKeywords.some((kw) => lowerText.includes(kw))) {
        const dreamHint = humanSignals.dreams
          .slice(0, 2)
          .map((d) => `✨ ${d.value}`)
          .join('\n');
        if (dreamHint) relevantHints.push(`Their dreams:\n${dreamHint}`);
      }

      // Surface fears/worries
      const fearKeywords = [
        'worried',
        'afraid',
        'anxious',
        'scared',
        'nervous',
        'concern',
        'stress',
      ];
      if (fearKeywords.some((kw) => lowerText.includes(kw))) {
        const fearHint = humanSignals.fears
          .slice(0, 2)
          .map((f) => `🔒 ${f.value}`)
          .join('\n');
        if (fearHint) relevantHints.push(`Known worries:\n${fearHint}`);
      }

      // Surface growth/progress
      const growthKeywords = ['progress', 'better', 'growth', 'improve', 'proud', 'achievement'];
      if (growthKeywords.some((kw) => lowerText.includes(kw))) {
        const growthHint = humanSignals.growthMarkers
          .slice(0, 2)
          .map((g) => `🌱 ${g.value}`)
          .join('\n');
        if (growthHint) relevantHints.push(`Recent growth:\n${growthHint}`);
      }

      // Surface challenges when struggle is detected
      const challengeKeywords = ['struggle', 'hard', 'difficult', 'tough', 'challenge', 'stuck'];
      if (challengeKeywords.some((kw) => lowerText.includes(kw))) {
        const challengeHint = humanSignals.challenges
          .slice(0, 2)
          .map((c) => `⚡ ${c.value}`)
          .join('\n');
        if (challengeHint) relevantHints.push(`Known challenges:\n${challengeHint}`);
      }

      // Surface comfort patterns when user needs support
      const comfortKeywords = ['help', 'comfort', 'calm', 'relax', 'cope', 'soothe'];
      if (comfortKeywords.some((kw) => lowerText.includes(kw))) {
        const comfortHint = humanSignals.comfortPatterns
          .slice(0, 2)
          .map((c) => `🌊 ${c.value}`)
          .join('\n');
        if (comfortHint) relevantHints.push(`What helps them:\n${comfortHint}`);
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
