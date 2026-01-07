/**
 * Entity Store Integration
 *
 * This module provides the integration hooks for capturing entities from
 * various sources (data capture, conversation, imports) into the unified store.
 *
 * @module memory/entity-store/integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { resolvePerson } from './entity-resolver.js';
import { createMention, recordMention, hasEntityStore } from './storage.js';
import type {
  PersonCaptureInput,
  CaptureContext,
  CaptureResult,
  MentionType,
  ExtractedFact,
} from './types.js';

const log = createLogger({ module: 'entity-store:integration' });

// ============================================================================
// INITIALIZATION STATE
// ============================================================================

let initialized = false;
let initializationError: string | null = null;

/**
 * Check if entity store is ready to use
 */
export function isEntityStoreReady(): boolean {
  return initialized && !initializationError;
}

/**
 * Initialize entity store
 */
export async function initializeEntityStore(): Promise<void> {
  if (initialized) return;

  try {
    // Verify Firestore connectivity
    const { getFirestore } = await import('@google-cloud/firestore');
    const db = new getFirestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    });

    // Test connectivity
    await db.collection('entity_store').doc('_health').get();

    initialized = true;
    log.info('Entity store initialized');
  } catch (error) {
    initializationError = String(error);
    log.warn({ error: initializationError }, 'Entity store initialization failed - will use legacy collections');
  }
}

// Auto-initialize on module load
initializeEntityStore().catch(() => {
  // Silently fail - we'll use legacy collections
});

// ============================================================================
// PERSON CAPTURE
// ============================================================================

/**
 * Capture a person entity from conversation
 *
 * This is the main entry point for data capture integration.
 * Call this whenever a person is mentioned in conversation.
 */
export async function capturePersonEntity(
  userId: string,
  input: PersonCaptureInput,
  context: CaptureContext
): Promise<CaptureResult> {
  if (!isEntityStoreReady()) {
    throw new Error('Entity store not ready');
  }

  log.debug(
    { userId, name: input.name, relationship: input.relationship },
    'Capturing person entity'
  );

  // Resolve to canonical entity (create or find existing)
  const resolved = await resolvePerson(userId, input);

  // Create mention record
  const mention = await createMention(userId, {
    userId,
    entityId: resolved.entity.id,
    transcript: context.transcript,
    sessionId: context.sessionId,
    personaId: context.personaId,
    timestamp: new Date(),
    mentionType: inferMentionType(context.transcript, input),
    sentiment: 0, // TODO: Sentiment analysis
    emotionalIntensity: context.emotion?.intensity || 0.5,
    topics: extractTopics(context.transcript),
    facts: extractFacts(input, context),
  });

  // Update entity mention count
  await recordMention(userId, resolved.entity.id, {
    sentiment: mention.sentiment,
    topics: mention.topics,
  });

  log.info(
    {
      userId,
      entityId: resolved.entity.id,
      name: resolved.entity.canonicalName,
      isNew: resolved.isNew,
      resolvedFrom: resolved.resolvedFrom,
    },
    resolved.isNew ? '✨ Created new person entity' : '📝 Updated existing entity'
  );

  return {
    entity: resolved.entity,
    isNew: resolved.isNew,
    merged: resolved.merged,
    confidence: resolved.confidence,
  };
}

/**
 * Infer mention type from transcript and input
 */
function inferMentionType(transcript: string, input: PersonCaptureInput): MentionType {
  const lower = transcript.toLowerCase();

  // Check for explicit contact info sharing
  if (input.phone || input.email) {
    return 'fact';
  }

  // Check for planning
  if (
    /\b(meeting|call|see|visit|meet up|hang out|tomorrow|next week|this weekend)\b/.test(lower)
  ) {
    return 'planning';
  }

  // Check for emotional content
  if (/\b(worried|concerned|scared|happy|excited|upset|angry|love|miss|hate)\b/.test(lower)) {
    return 'emotion';
  }

  // Check for story
  if (/\b(told me|said|did|happened|went|came|made)\b/.test(lower)) {
    return 'story';
  }

  // Check for update/status
  if (/\b(just|recently|now|started|got|became|is doing)\b/.test(lower)) {
    return 'update';
  }

  return 'reference';
}

/**
 * Extract topics from transcript (simple keyword extraction)
 */
function extractTopics(transcript: string): string[] {
  const topics: string[] = [];
  const lower = transcript.toLowerCase();

  // Topic patterns
  const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
    { pattern: /\b(work|job|office|career|boss|meeting)\b/, topic: 'work' },
    { pattern: /\b(health|sick|hospital|doctor|surgery|medical)\b/, topic: 'health' },
    { pattern: /\b(family|mom|dad|brother|sister|kids|children)\b/, topic: 'family' },
    { pattern: /\b(money|pay|salary|bills|financial|budget)\b/, topic: 'finances' },
    { pattern: /\b(wedding|engaged|married|anniversary)\b/, topic: 'relationship' },
    { pattern: /\b(birthday|holiday|christmas|thanksgiving|celebration)\b/, topic: 'celebration' },
    { pattern: /\b(school|college|university|class|exam|grade)\b/, topic: 'education' },
    { pattern: /\b(move|moving|house|apartment|home)\b/, topic: 'housing' },
    { pattern: /\b(trip|vacation|travel|flight|visit)\b/, topic: 'travel' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(lower)) {
      topics.push(topic);
    }
  }

  return topics;
}

/**
 * Extract facts from input and context
 */
function extractFacts(input: PersonCaptureInput, context: CaptureContext): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  if (input.phone) {
    facts.push({
      type: 'attribute',
      key: 'phone',
      value: input.phone,
      confidence: 0.95,
    });
  }

  if (input.email) {
    facts.push({
      type: 'attribute',
      key: 'email',
      value: input.email,
      confidence: 0.95,
    });
  }

  if (input.relationship) {
    facts.push({
      type: 'relationship',
      key: 'relationship_to_user',
      value: input.relationship,
      confidence: 0.9,
    });
  }

  return facts;
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Capture multiple people at once (for imports)
 */
export async function captureMultiplePeople(
  userId: string,
  inputs: PersonCaptureInput[],
  context: Omit<CaptureContext, 'transcript'>
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  for (const input of inputs) {
    try {
      const result = await capturePersonEntity(userId, input, {
        ...context,
        transcript: `Imported: ${input.name || input.relationship}`,
      });
      results.push(result);
    } catch (error) {
      log.warn(
        { userId, name: input.name, error: String(error) },
        'Failed to capture person in bulk import'
      );
    }
  }

  log.info(
    { userId, total: inputs.length, captured: results.length },
    'Bulk person capture complete'
  );

  return results;
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Find a contact for telephony (call/text)
 *
 * This replaces the fragmented contact lookup used by telephony tools.
 */
export async function findContactForTelephony(
  userId: string,
  query: string
): Promise<{
  name: string;
  phone: string;
  relationship?: string;
} | null> {
  if (!isEntityStoreReady()) {
    // Fall back to legacy lookup
    return null;
  }

  const { findEntityByAlias, searchEntities } = await import('./storage.js');

  // Try exact match first
  let entity = await findEntityByAlias(userId, query, 'person');

  // Try search if exact match fails
  if (!entity) {
    const results = await searchEntities(userId, query, { types: ['person'], limit: 1 });
    entity = results[0] || null;
  }

  if (!entity || !entity.contact?.phone) {
    return null;
  }

  return {
    name: entity.canonicalName,
    phone: entity.contact.phone,
    relationship: entity.specificRelation,
  };
}

/**
 * Get all contacts for a user (for contact list display)
 */
export async function getAllContacts(userId: string): Promise<
  Array<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    relationship?: string;
  }>
> {
  if (!isEntityStoreReady()) {
    return [];
  }

  const { getAllEntities } = await import('./storage.js');
  const entities = await getAllEntities(userId, { types: ['person'], limit: 200 });

  return entities.map((e) => ({
    id: e.id,
    name: e.canonicalName,
    phone: e.contact?.phone,
    email: e.contact?.email,
    relationship: e.specificRelation,
  }));
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Get entity store health status
 */
export async function getEntityStoreHealth(userId: string): Promise<{
  ready: boolean;
  error?: string;
  stats?: {
    entityCount: number;
    mentionCount: number;
    relationshipCount: number;
  };
}> {
  if (!isEntityStoreReady()) {
    return {
      ready: false,
      error: initializationError || 'Not initialized',
    };
  }

  try {
    const { getEntityStoreStats } = await import('./storage.js');
    const stats = await getEntityStoreStats(userId);

    return {
      ready: true,
      stats: {
        entityCount: stats.entityCount,
        mentionCount: stats.mentionCount,
        relationshipCount: stats.relationshipCount,
      },
    };
  } catch (error) {
    return {
      ready: false,
      error: String(error),
    };
  }
}

// ============================================================================
// UNIFIED MEMORY RETRIEVAL
// ============================================================================

/**
 * Options for unified memory retrieval
 */
export interface RetrieveMemoriesOptions {
  currentTopic?: string;
  currentEmotion?: string;
  personaId?: string;
  conversationTurn?: number;
  recentTopics?: string[];
  limit?: number;
}

/**
 * Score breakdown for retrieved entity
 */
interface EntityScoreBreakdown {
  semantic: number;
  temporal: number;
  emotional: number;
  graphDistance: number;
}

/**
 * Retrieved entity result
 */
interface EntityRetrievalResult {
  entity: {
    id: string;
    type: string;
    lastSeen: string;
    emotionalWeight: number;
    salienceScore: number;
    [key: string]: unknown;
  };
  score: number;
  scoreBreakdown: EntityScoreBreakdown;
  reason: string;
}

/**
 * Result of unified memory retrieval
 */
interface UnifiedMemoryResult {
  entities: EntityRetrievalResult[];
  formattedContext: string;
}

/**
 * Retrieve memories from entity store using unified Graph-RAG approach
 *
 * This function combines entity lookup with Graph-RAG for contextual retrieval.
 * TODO: Implement full Graph-RAG retrieval with entity relationships
 */
export async function retrieveMemoriesUnified(
  userId: string,
  query: string,
  options: RetrieveMemoriesOptions = {}
): Promise<UnifiedMemoryResult> {
  if (!isEntityStoreReady()) {
    return { entities: [], formattedContext: '' };
  }

  try {
    // Import entity search functionality
    const { searchEntities } = await import('./storage.js');

    // Search for entities matching the query
    const entities = await searchEntities(userId, query, {
      limit: options.limit || 5,
    });

    // Convert to retrieval results with scores
    const results: EntityRetrievalResult[] = entities.map((entity, index) => ({
      entity: {
        id: entity.id,
        type: entity.type,
        lastSeen: entity.lastMentionedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        emotionalWeight: entity.emotionalWeight || 0.5,
        salienceScore: entity.salience || 0.5,
        canonicalName: entity.canonicalName,
        relationship: entity.relationship,
        specificRelation: entity.specificRelation,
      },
      score: 1 - (index * 0.1), // Simple scoring based on search order
      scoreBreakdown: {
        semantic: 0.7,
        temporal: 0.6,
        emotional: entity.emotionalWeight || 0.5,
        graphDistance: 0,
      },
      reason: `Matched query "${query}" - ${entity.canonicalName}`,
    }));

    // Build formatted context
    const formattedContext = results
      .map((r) => `[${r.entity.type}] ${r.entity.canonicalName}: ${r.reason}`)
      .join('\n');

    return {
      entities: results,
      formattedContext,
    };
  } catch (error) {
    log.warn({ error: String(error), userId, query }, 'Failed to retrieve unified memories');
    return { entities: [], formattedContext: '' };
  }
}

// ============================================================================
// PROACTIVE SURFACING
// ============================================================================

/**
 * Options for checking proactive surfacing opportunities
 */
export interface ProactiveSurfacingOptions {
  sessionId: string;
  personaId: string;
  turnNumber: number;
  surfacingCountThisSession: number;
  sessionTopics: string[];
  conversationMood?: 'exploratory' | 'venting' | 'seeking_help' | 'casual';
  lastTurnWasQuestion?: boolean;
  detectedEmotion?: string;
}

/**
 * Check for proactive surfacing opportunities based on current turn
 *
 * This wraps the ProactiveSurfacingEngine to analyze the current conversation
 * context and find relevant memories worth mentioning.
 */
export async function checkProactiveSurfacing(
  userId: string,
  currentTurn: string,
  options: ProactiveSurfacingOptions
): Promise<import('./types.js').SurfacingOpportunity[]> {
  if (!isEntityStoreReady()) {
    return [];
  }

  try {
    const { getProactiveSurfacingEngine } = await import('./proactive-surfacing.js');
    const engine = getProactiveSurfacingEngine();

    const opportunities = await engine.analyze({
      currentTurn,
      userId,
      sessionId: options.sessionId,
      personaId: options.personaId,
      turnNumber: options.turnNumber,
      detectedEmotion: options.detectedEmotion,
      conversationMood: options.conversationMood,
      lastTurnWasQuestion: options.lastTurnWasQuestion,
      surfacingCountThisSession: options.surfacingCountThisSession,
      sessionTopics: options.sessionTopics,
    });

    log.debug(
      { userId, turnNumber: options.turnNumber, opportunitiesFound: opportunities.length },
      'Proactive surfacing check complete'
    );

    return opportunities;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Proactive surfacing check failed');
    return [];
  }
}
