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
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
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
    sentiment: analyzeSentiment(context.transcript),
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

// ============================================================================
// SENTIMENT ANALYSIS
// ============================================================================

/**
 * Positive words for sentiment analysis (weighted by intensity)
 */
const POSITIVE_WORDS: Record<string, number> = {
  // Strong positive (0.8-1.0)
  love: 1.0,
  amazing: 0.9,
  wonderful: 0.9,
  fantastic: 0.9,
  excellent: 0.9,
  thrilled: 0.9,
  ecstatic: 1.0,
  incredible: 0.9,
  // Medium positive (0.5-0.7)
  great: 0.7,
  good: 0.5,
  happy: 0.7,
  excited: 0.7,
  glad: 0.6,
  pleased: 0.6,
  thankful: 0.6,
  grateful: 0.7,
  proud: 0.7,
  hopeful: 0.6,
  // Light positive (0.2-0.4)
  nice: 0.4,
  okay: 0.2,
  fine: 0.2,
  better: 0.4,
  well: 0.3,
  like: 0.3,
  enjoy: 0.5,
  fun: 0.5,
};

/**
 * Negative words for sentiment analysis (weighted by intensity)
 */
const NEGATIVE_WORDS: Record<string, number> = {
  // Strong negative (0.8-1.0)
  hate: 1.0,
  terrible: 0.9,
  awful: 0.9,
  horrible: 0.9,
  devastated: 1.0,
  furious: 0.9,
  heartbroken: 1.0,
  disgusted: 0.9,
  // Medium negative (0.5-0.7)
  angry: 0.7,
  sad: 0.7,
  upset: 0.6,
  frustrated: 0.6,
  worried: 0.6,
  anxious: 0.6,
  disappointed: 0.7,
  hurt: 0.7,
  stressed: 0.6,
  annoyed: 0.5,
  // Light negative (0.2-0.4)
  concerned: 0.4,
  tired: 0.3,
  confused: 0.3,
  unsure: 0.3,
  struggling: 0.5,
  difficult: 0.4,
  hard: 0.3,
  bad: 0.5,
};

/**
 * Negation words that flip sentiment
 */
const NEGATION_WORDS = new Set([
  'not',
  "n't",
  'no',
  'never',
  'without',
  "don't",
  "doesn't",
  "didn't",
  "won't",
  "wouldn't",
  "couldn't",
  "shouldn't",
  "can't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
]);

/**
 * Intensifier words that amplify sentiment
 */
const INTENSIFIERS: Record<string, number> = {
  very: 1.3,
  really: 1.3,
  extremely: 1.5,
  incredibly: 1.5,
  absolutely: 1.4,
  totally: 1.3,
  completely: 1.4,
  so: 1.2,
  quite: 1.1,
  pretty: 1.1,
};

/**
 * Analyze sentiment of text and return a score between -1 and 1
 *
 * This is a fast, rule-based sentiment analyzer optimized for real-time
 * conversation analysis. It doesn't make API calls to avoid latency.
 *
 * Features:
 * - Weighted sentiment words (strong vs light positive/negative)
 * - Negation handling ("not happy" -> negative)
 * - Intensifier detection ("very happy" -> more positive)
 * - Normalized output bounded to [-1, 1]
 *
 * @param text - The text to analyze
 * @returns A sentiment score from -1 (very negative) to 1 (very positive)
 *
 * @example
 * analyzeSentiment("I'm so happy!") // Returns ~0.62
 * analyzeSentiment("I'm not happy") // Returns ~-0.26
 * analyzeSentiment("I hate this")   // Returns ~-0.5
 * analyzeSentiment("Just met Mike") // Returns 0 (neutral)
 */
export function analyzeSentiment(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  const lower = text.toLowerCase();
  // Tokenize by word boundaries, keeping contractions
  const words = lower.split(/\s+/).map((w) => w.replace(/[^\w']/g, ''));

  let positiveScore = 0;
  let negativeScore = 0;
  let wordCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;

    // Check for negation in the previous 3 words
    let isNegated = false;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (NEGATION_WORDS.has(words[j])) {
        isNegated = true;
        break;
      }
    }

    // Check for intensifier in the previous word
    let intensifier = 1.0;
    if (i > 0 && INTENSIFIERS[words[i - 1]]) {
      intensifier = INTENSIFIERS[words[i - 1]];
    }

    // Check positive words
    if (POSITIVE_WORDS[word] !== undefined) {
      const score = POSITIVE_WORDS[word] * intensifier;
      if (isNegated) {
        negativeScore += score * 0.5; // Negated positive becomes light negative
      } else {
        positiveScore += score;
      }
      wordCount++;
    }

    // Check negative words
    if (NEGATIVE_WORDS[word] !== undefined) {
      const score = NEGATIVE_WORDS[word] * intensifier;
      if (isNegated) {
        positiveScore += score * 0.5; // Negated negative becomes light positive
      } else {
        negativeScore += score;
      }
      wordCount++;
    }
  }

  // No sentiment words found
  if (wordCount === 0) {
    return 0;
  }

  // Calculate net sentiment, normalized to -1 to 1
  // We use a sigmoid-like normalization to keep values bounded
  const netScore = positiveScore - negativeScore;
  const normalized = netScore / (1 + Math.abs(netScore));

  // Clamp to -1 to 1 range (should already be, but be safe)
  return Math.max(-1, Math.min(1, normalized));
}

// ============================================================================
// TOPIC EXTRACTION
// ============================================================================

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
    canonicalName?: string;
    relationship?: string;
    specificRelation?: string;
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
 * This function combines:
 * - Hybrid search (BM25 keyword + vector similarity)
 * - Graph expansion through relationships (person -> mentioned_with -> topic)
 * - Temporal and emotional weighting
 * - Cross-encoder reranking (optional)
 *
 * Graph-RAG Process:
 * 1. Initial retrieval: Find entities matching the query via hybrid search
 * 2. Graph expansion: Traverse relationships up to 2 hops deep
 * 3. Context boosting: Weight results by current conversation context
 * 4. Temporal/emotional scoring: Boost recent and emotionally significant entities
 * 5. Return enriched results with relationship paths
 */
export async function retrieveMemoriesUnified(
  userId: string,
  query: string,
  options: RetrieveMemoriesOptions = {}
): Promise<UnifiedMemoryResult> {
  if (!isEntityStoreReady()) {
    return { entities: [], formattedContext: '' };
  }

  const startTime = Date.now();

  try {
    // Import Graph-RAG retriever and storage functions
    const { getGraphRAGRetriever } = await import('./graph-rag.js');
    const { getRelationshipsForEntity, getMentionsForEntity } = await import('./storage.js');

    const retriever = getGraphRAGRetriever();
    const limit = options.limit || 10;

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 1: Graph-RAG Retrieval
    // Uses hybrid search + graph expansion + context boosting
    // ═══════════════════════════════════════════════════════════════════════════

    const graphRagResult = await retriever.retrieve(
      userId,
      query,
      {
        currentTopic: options.currentTopic,
        currentEmotion: options.currentEmotion,
        personaId: options.personaId,
        conversationTurn: options.conversationTurn,
        recentTopics: options.recentTopics,
      },
      {
        topK: limit * 2, // Get extra candidates for relationship enrichment
        minScore: 0.3,
        expandGraph: true, // Enable graph traversal
        maxGraphHops: 2, // Up to 2 relationship hops
        hybrid: true, // BM25 + vector
        rerank: false, // Skip cross-encoder for performance (enable for high-stakes queries)
      }
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 2: Relationship Enrichment
    // For top results, fetch relationship context to provide richer explanations
    // ═══════════════════════════════════════════════════════════════════════════

    const enrichedResults: EntityRetrievalResult[] = await Promise.all(
      graphRagResult.entities.slice(0, limit).map(async (searchResult) => {
        const entity = searchResult.entity;

        // Fetch relationships for this entity
        let relationshipContext = '';
        const connectedEntities: string[] = [];

        try {
          const relationships = await getRelationshipsForEntity(userId, entity.id);

          if (relationships.length > 0) {
            // Build relationship context string
            const relationshipDescriptions = relationships
              .slice(0, 3) // Limit to top 3 relationships
              .map((rel) => {
                const direction = rel.fromEntity === entity.id ? 'to' : 'from';
                const targetId = direction === 'to' ? rel.toEntity : rel.fromEntity;
                connectedEntities.push(targetId);
                return `${rel.type} (strength: ${rel.strength.toFixed(2)})`;
              });

            relationshipContext = relationshipDescriptions.length > 0
              ? ` | Connected via: ${relationshipDescriptions.join(', ')}`
              : '';
          }
        } catch {
          // Silently continue if relationship fetch fails
        }

        // Fetch recent mentions for temporal context
        let recentMentionContext = '';
        try {
          const mentions = await getMentionsForEntity(userId, entity.id, 3);
          if (mentions.length > 0) {
            const latestMention = mentions[0];
            const daysAgo = Math.floor(
              (Date.now() - new Date(latestMention.timestamp).getTime()) / (1000 * 60 * 60 * 24)
            );
            recentMentionContext = daysAgo === 0
              ? ' | Mentioned today'
              : daysAgo === 1
                ? ' | Mentioned yesterday'
                : daysAgo < 7
                  ? ` | Mentioned ${daysAgo} days ago`
                  : '';
          }
        } catch {
          // Silently continue if mention fetch fails
        }

        // Convert to unified result format with enriched context
        const lastSeen = entity.lastSeen || entity.lastMentioned || entity.lastMentionedAt;
        const lastSeenStr = lastSeen
          ? typeof (lastSeen as unknown as { toDate?: () => Date }).toDate === 'function'
            ? (lastSeen as unknown as { toDate: () => Date }).toDate().toISOString()
            : new Date(lastSeen as Date | string).toISOString()
          : new Date().toISOString();

        return {
          entity: {
            id: entity.id,
            type: entity.type,
            lastSeen: lastSeenStr,
            emotionalWeight: entity.emotionalWeight || entity.emotionalSalience || 0.5,
            salienceScore: entity.salienceScore || entity.importance || entity.salience || 0.5,
            canonicalName: entity.canonicalName,
            relationship: entity.relationship,
            specificRelation: entity.specificRelation,
            connectedEntities,
          },
          score: searchResult.score,
          scoreBreakdown: {
            semantic: searchResult.scoreBreakdown.semantic,
            temporal: searchResult.scoreBreakdown.temporal,
            emotional: searchResult.scoreBreakdown.emotional,
            graphDistance: searchResult.scoreBreakdown.graphDistance,
          },
          reason: buildEnrichedReason(
            entity,
            searchResult,
            query,
            relationshipContext,
            recentMentionContext
          ),
        };
      })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 3: Format Context for LLM
    // Build a structured context string that the LLM can use
    // ═══════════════════════════════════════════════════════════════════════════

    const formattedContext = formatGraphRAGContext(enrichedResults, query);

    const latencyMs = Date.now() - startTime;
    log.debug(
      {
        userId: userId.substring(0, 8),
        query: query.substring(0, 50),
        resultsCount: enrichedResults.length,
        graphExpanded: graphRagResult.debug?.graphExpanded || 0,
        latencyMs,
      },
      '🧠 Graph-RAG unified retrieval complete'
    );

    return {
      entities: enrichedResults,
      formattedContext,
    };
  } catch (error) {
    log.warn({ error: String(error), userId, query }, 'Failed to retrieve unified memories');
    return { entities: [], formattedContext: '' };
  }
}

/**
 * Build an enriched reason string explaining why this entity was retrieved
 */
function buildEnrichedReason(
  entity: {
    canonicalName?: string;
    type: string;
    salienceScore?: number;
    salience?: number;
    importance?: number;
    emotionalWeight?: number;
    emotionalSalience?: number;
  },
  searchResult: {
    score: number;
    scoreBreakdown: { semantic: number; temporal: number; emotional: number; graphDistance: number };
    graphPath?: string[];
  },
  query: string,
  relationshipContext: string,
  recentMentionContext: string
): string {
  const parts: string[] = [];

  // Primary match reason
  if (searchResult.scoreBreakdown.semantic > 0.7) {
    parts.push(`Highly relevant to "${query.substring(0, 30)}${query.length > 30 ? '...' : ''}"`);
  } else if (searchResult.scoreBreakdown.semantic > 0.5) {
    parts.push(`Related to "${query.substring(0, 30)}${query.length > 30 ? '...' : ''}"`);
  } else if (searchResult.graphPath && searchResult.graphPath.length > 1) {
    parts.push(`Connected via relationship graph`);
  } else {
    parts.push(`Matched query`);
  }

  // Graph path info
  if (searchResult.graphPath && searchResult.graphPath.length > 1) {
    const hops = searchResult.graphPath.length - 1;
    parts.push(`(${hops} hop${hops > 1 ? 's' : ''} away)`);
  }

  // Salience indicator
  const salience = entity.salienceScore ?? entity.salience ?? entity.importance ?? 0.5;
  if (salience > 0.7) {
    parts.push('Important');
  }

  // Emotional significance
  const emotional = entity.emotionalWeight ?? entity.emotionalSalience ?? 0.5;
  if (emotional > 0.7) {
    parts.push('Emotionally significant');
  }

  // Add relationship and temporal context
  const entityName = entity.canonicalName || 'Unknown';
  let reason = `[${entity.type}] ${entityName}: ${parts.join(' | ')}`;
  reason += relationshipContext;
  reason += recentMentionContext;

  return reason;
}

/**
 * Format Graph-RAG results into a structured context string for LLM consumption
 */
function formatGraphRAGContext(results: EntityRetrievalResult[], query: string): string {
  if (results.length === 0) {
    return '';
  }

  const lines: string[] = [
    `Memory retrieval for "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}" found ${results.length} relevant entities:`,
    '',
  ];

  // Group by entity type for organized output
  const byType = new Map<string, EntityRetrievalResult[]>();
  for (const result of results) {
    const type = result.entity.type;
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(result);
  }

  // Format each group
  for (const [type, typeResults] of Array.from(byType.entries())) {
    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
    lines.push(`${capitalizedType}s:`);

    for (const result of typeResults) {
      const entity = result.entity;
      const scoreStr = `(score: ${result.score.toFixed(2)})`;

      let entityLine = `  - ${entity.canonicalName || 'Unknown'} ${scoreStr}`;

      // Add relationship info if present
      if (entity.specificRelation) {
        entityLine += ` [${entity.specificRelation}]`;
      } else if (entity.relationship) {
        entityLine += ` [${entity.relationship}]`;
      }

      // Add graph distance if not direct match
      if (result.scoreBreakdown.graphDistance > 0) {
        entityLine += ` (via ${result.scoreBreakdown.graphDistance}-hop relationship)`;
      }

      lines.push(entityLine);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
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

// ============================================================================
// INITIALIZATION (Alias for backward compatibility)
// ============================================================================

/**
 * Initialize the entity store integration
 * Alias for initializeEntityStore for backward compatibility
 */
export const initializeEntityStoreIntegration = initializeEntityStore;

// ============================================================================
// COMMITMENT ENTITY CAPTURE
// ============================================================================

/**
 * Extended commitment data with full extraction details
 */
export interface CommitmentCaptureData {
  /** The commitment text */
  commitment: string;
  /** Type of commitment */
  type?: 'promise' | 'intention' | 'goal' | 'decision' | 'boundary' | 'conversation' | 'experiment';
  /** When it should be completed */
  dueDate?: Date;
  /** Entity IDs of related people */
  relatedEntityIds?: string[];
  /** Person mentioned (name or relationship, for linking) */
  personInvolved?: string;
  /** Emotional weight (0-1) */
  emotionalWeight?: number;
  /** Topic context */
  topic?: string;
  /** Original statement from transcript */
  originalStatement?: string;
}

/**
 * Extract commitment details from transcript
 *
 * Parses the transcript to extract:
 * - Who the commitment is to/about
 * - When it should happen
 * - What accountability type it represents
 */
function extractCommitmentDetails(transcript: string): {
  personInvolved?: string;
  accountability: 'self' | 'shared' | 'to_other';
  suggestedType:
    | 'promise'
    | 'intention'
    | 'goal'
    | 'decision'
    | 'boundary'
    | 'conversation'
    | 'experiment';
} {
  const lower = transcript.toLowerCase();

  // Extract person mentioned
  let personInvolved: string | undefined;
  let accountability: 'self' | 'shared' | 'to_other' = 'self';

  // Check for person references
  const personPatterns = [
    /\b(talk|speak|call|text|email|tell|ask|confront|meet with|reach out to|contact)\s+(?:my\s+)?(\w+)/i,
    /\b(?:for|to|with)\s+(?:my\s+)?(\w+)(?:\s|$)/i,
    /\bmy\s+(mom|dad|brother|sister|wife|husband|partner|boss|friend|colleague|son|daughter|mother|father)/i,
  ];

  for (const pattern of personPatterns) {
    const match = transcript.match(pattern);
    if (match) {
      // Get the captured group (person name/relationship)
      personInvolved = match[match.length - 1];
      // If committing to talk to someone, accountability is to_other
      if (/\b(talk|speak|tell|confront)\b/i.test(lower)) {
        accountability = 'to_other';
      } else if (/\b(with|together)\b/i.test(lower)) {
        accountability = 'shared';
      }
      break;
    }
  }

  // Infer commitment type from language patterns
  let suggestedType:
    | 'promise'
    | 'intention'
    | 'goal'
    | 'decision'
    | 'boundary'
    | 'conversation'
    | 'experiment' = 'intention';

  if (/\bi promise\b|\bi swear\b|\bi commit\b|\bon god\b/i.test(lower)) {
    suggestedType = 'promise';
  } else if (/\bmy goal\b|\bworking on\b|\blong[- ]?term\b/i.test(lower)) {
    suggestedType = 'goal';
  } else if (/\bi('ve| have) decided\b|\bthat('s| is) it\b|\bno more\b/i.test(lower)) {
    suggestedType = 'decision';
  } else if (/\bneed to stop\b|\bdone with\b|\bsetting a boundary\b/i.test(lower)) {
    suggestedType = 'boundary';
  } else if (/\bneed to (talk|speak|have a conversation)\b/i.test(lower)) {
    suggestedType = 'conversation';
  } else if (/\btry(ing)?\b|\bexperiment\b|\btest\b/i.test(lower)) {
    suggestedType = 'experiment';
  }

  return { personInvolved, accountability, suggestedType };
}

/**
 * Capture a commitment entity from conversation
 *
 * This function:
 * 1. Extracts commitment details (what, when, to whom)
 * 2. Stores in the entity store with proper relationships
 * 3. Links to related person entities
 * 4. Syncs with the Commitment Keeper superhuman service
 */
export async function captureCommitmentEntity(
  userId: string,
  data: CommitmentCaptureData,
  context: {
    sessionId: string;
    personaId: string;
    transcript: string;
    conversationId?: string;
  }
): Promise<CaptureResult> {
  if (!isEntityStoreReady()) {
    throw new Error('Entity store not initialized');
  }

  // Extract additional details from transcript
  const extracted = extractCommitmentDetails(context.transcript);

  // Dynamic import to avoid circular dependency
  const { getEntityStore } = await import('./store.js');
  const store = getEntityStore();

  // Resolve related people to entity IDs
  const relatedPeopleIds: string[] = [...(data.relatedEntityIds || [])];
  const personInvolved = data.personInvolved || extracted.personInvolved;

  if (personInvolved && relatedPeopleIds.length === 0) {
    try {
      // Try to resolve the person to an existing entity
      const resolved = await resolvePerson(userId, {
        name: personInvolved,
        relationship: personInvolved, // May be a relationship term like "mom"
      });
      if (resolved.entity) {
        relatedPeopleIds.push(resolved.entity.id);
      }
    } catch (error) {
      log.debug(
        { error: String(error), personInvolved },
        'Could not resolve person for commitment (non-blocking)'
      );
    }
  }

  // Determine commitment type (explicit > extracted)
  const commitmentType = data.type || extracted.suggestedType;

  // Create the commitment entity
  const entity = await store.createEntity(
    userId,
    'commitment',
    data.commitment,
    {
      _type: 'commitment',
      commitmentType: commitmentType as 'promise' | 'intention' | 'decision' | 'goal',
      targetDate: data.dueDate,
      status: 'active',
      relatedPeople: relatedPeopleIds,
      accountability: extracted.accountability,
      originalStatement: data.originalStatement || context.transcript,
      progressNotes: [],
    },
    {
      emotionalWeight: data.emotionalWeight || 0.5,
      sourceConversation: context.conversationId || context.sessionId,
      sourcePersona: context.personaId,
    }
  );

  // Create relationships to related people
  if (relatedPeopleIds.length > 0) {
    try {
      const { upsertRelationship } = await import('./storage.js');
      for (const personId of relatedPeopleIds) {
        await upsertRelationship(userId, {
          fromEntity: entity.id,
          toEntity: personId,
          type: 'involves',
          strength: 0.7,
          firstLinked: new Date(),
          lastReinforced: new Date(),
          reinforcementCount: 1,
          context: `Commitment: ${data.commitment}`,
          bidirectional: false,
        });
      }
    } catch (error) {
      log.warn(
        { error: String(error), entityId: entity.id },
        'Failed to create commitment-person relationships (non-blocking)'
      );
    }
  }

  // Record the mention
  try {
    await recordMention(userId, entity.id, {
      sentiment: 0,
      topics: data.topic ? [data.topic] : extractTopics(context.transcript),
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to record commitment mention (non-blocking)');
  }

  // Sync with Commitment Keeper superhuman service
  try {
    const { commitmentKeeper } = await import('../../services/superhuman/commitment-keeper.js');

    // Only save to commitment keeper if it meets detection threshold
    // (The commitment keeper has its own detection logic, so we provide the raw data)
    const detectionResult = commitmentKeeper.detect(context.transcript, userId, {
      topic: data.topic,
      personMentioned: personInvolved,
      emotionalIntensity: data.emotionalWeight,
    });

    if (detectionResult.detected && detectionResult.commitment) {
      // Build the full commitment object for the keeper
      // Note: saveCommitment internally sets createdAt, lastMentioned, followUpAfter, status, followUpCount
      // but the type requires them. Provide defaults that will be overwritten.
      const now = Date.now();
      await commitmentKeeper.save({
        ...detectionResult.commitment,
        personaId: context.personaId,
        // Required fields that saveCommitment will overwrite
        createdAt: now,
        lastMentioned: now,
        followUpAfter: now + 3 * 24 * 60 * 60 * 1000, // 3 days
        status: 'active',
        followUpCount: 0,
      });

      log.info(
        { userId, entityId: entity.id, commitmentKeeperId: entity.id },
        '🔗 Commitment synced to Commitment Keeper service'
      );
    }
  } catch (error) {
    // Commitment Keeper sync is optional - don't fail the main capture
    log.debug({ error: String(error), userId }, 'Commitment Keeper sync failed (non-blocking)');
  }

  log.info(
    {
      userId,
      entityId: entity.id,
      commitment: data.commitment,
      type: commitmentType,
      relatedPeople: relatedPeopleIds.length,
      personInvolved,
    },
    '✨ Captured commitment entity with full details'
  );

  return {
    entity,
    isNew: true,
    merged: false,
    confidence: data.emotionalWeight ? Math.min(0.95, 0.7 + data.emotionalWeight * 0.25) : 0.8,
  };
}

/**
 * Update commitment status in entity store
 *
 * Syncs status changes with both the entity store and Commitment Keeper service
 */
export async function updateCommitmentEntityStatus(
  userId: string,
  entityId: string,
  status: 'active' | 'completed' | 'abandoned' | 'deferred',
  options?: {
    progressNote?: string;
  }
): Promise<void> {
  if (!isEntityStoreReady()) {
    throw new Error('Entity store not initialized');
  }

  const { getEntityStore } = await import('./store.js');
  const store = getEntityStore();

  const entity = await store.getEntity(entityId);
  if (!entity || entity.type !== 'commitment') {
    log.warn({ entityId }, 'Commitment entity not found for status update');
    return;
  }

  // Update entity attributes
  const attributes = entity.attributes as import('./types.js').CommitmentAttributes;
  const updatedAttributes: import('./types.js').CommitmentAttributes = {
    ...attributes,
    status,
    lastCheckIn: new Date(),
    progressNotes: options?.progressNote
      ? [...(attributes.progressNotes || []), options.progressNote]
      : attributes.progressNotes,
  };

  await store.updateEntity(entityId, {
    attributes: updatedAttributes,
  });

  // Sync status to Commitment Keeper
  try {
    const { updateCommitmentStatus } = await import('../../services/superhuman/commitment-keeper.js');
    // Map entity status to commitment keeper status
    const keeperStatus =
      status === 'deferred' ? 'deferred' : status === 'abandoned' ? 'abandoned' : status;
    await updateCommitmentStatus(userId, entityId, keeperStatus);
  } catch (error) {
    log.debug({ error: String(error) }, 'Commitment Keeper status sync failed (non-blocking)');
  }

  log.info({ userId, entityId, status }, '✅ Commitment entity status updated');
}
