/**
 * Deep Context with Entity Resolution
 *
 * Provides advanced context understanding for the semantic router:
 * 1. Entity tracking - Who/what/where across conversation
 * 2. Pronoun resolution - "Play that song" → which song?
 * 3. Topic continuity - Track conversation threads
 * 4. Tool result context - Use results from previous tools
 *
 * This enables handling complex queries like:
 * - "Add it to my calendar" (what is "it"?)
 * - "Play that song we talked about"
 * - "Tell me more about her"
 *
 * @module semantic-router/advanced/deep-context
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SemanticRouter.DeepContext' });

// ============================================================================
// TYPES
// ============================================================================

export type EntityType =
  | 'person'
  | 'location'
  | 'organization'
  | 'date'
  | 'time'
  | 'song'
  | 'artist'
  | 'event'
  | 'habit'
  | 'topic'
  | 'unknown';

export interface TrackedEntity {
  id: string;
  type: EntityType;
  value: string;
  normalizedValue: string;
  aliases: string[];
  confidence: number;

  // Source tracking
  source: 'user' | 'tool_result' | 'memory';
  sourceTurn: number;
  sourceToolId?: string;

  // Temporal info
  firstMentioned: Date;
  lastMentioned: Date;
  mentionCount: number;

  // Relationships
  relatedEntities: string[];
}

export interface ConversationTopic {
  id: string;
  name: string;
  confidence: number;
  startTurn: number;
  endTurn?: number;
  keywords: string[];
  relatedTools: string[];
}

export interface ToolResultContext {
  toolId: string;
  turnIndex: number;
  timestamp: Date;
  result: unknown;
  extractedEntities: TrackedEntity[];
}

export interface DeepContext {
  sessionId: string;
  currentTurn: number;

  // Entity tracking
  entities: Map<string, TrackedEntity>;

  // Topic tracking
  currentTopic: ConversationTopic | null;
  topicHistory: ConversationTopic[];

  // Tool result context
  toolResults: ToolResultContext[];

  // Pronoun resolution
  lastMentioned: {
    person: string | null;
    location: string | null;
    song: string | null;
    event: string | null;
    topic: string | null;
  };
}

export interface ResolutionResult {
  resolved: boolean;
  resolvedValue?: string;
  entity?: TrackedEntity;
  confidence: number;
  method: 'pronoun' | 'context' | 'topic' | 'tool_result' | 'none';
}

// ============================================================================
// CONTEXT STORE
// ============================================================================

const contextStore: Map<string, DeepContext> = new Map();

/**
 * Get or create deep context for a session
 */
export function getDeepContext(sessionId: string): DeepContext {
  let context = contextStore.get(sessionId);

  if (!context) {
    context = {
      sessionId,
      currentTurn: 0,
      entities: new Map(),
      currentTopic: null,
      topicHistory: [],
      toolResults: [],
      lastMentioned: {
        person: null,
        location: null,
        song: null,
        event: null,
        topic: null,
      },
    };
    contextStore.set(sessionId, context);
  }

  return context;
}

/**
 * Clear context for a session
 */
export function clearDeepContext(sessionId: string): void {
  contextStore.delete(sessionId);
}

// ============================================================================
// ENTITY EXTRACTION & TRACKING
// ============================================================================

/**
 * Extract entities from text
 *
 * Uses real NER (compromise.js) when available, falls back to regex patterns.
 */
export async function extractEntitiesWithNER(
  text: string,
  turnIndex: number,
  source: 'user' | 'tool_result' = 'user'
): Promise<TrackedEntity[]> {
  try {
    // Try real NER first
    const { extractEntities: nerExtract, initializeNER } = await import('./ner-engine.js');
    await initializeNER();

    const nerResult = await nerExtract(text);
    const now = new Date();

    return nerResult.entities.map((entity) => ({
      id: `${entity.type}_${entity.text.toLowerCase().replace(/\s+/g, '_')}_${turnIndex}`,
      type: mapNERType(entity.type),
      value: entity.text,
      normalizedValue: entity.normalized || entity.text.toLowerCase().trim(),
      aliases: [],
      confidence: entity.confidence,
      source,
      sourceTurn: turnIndex,
      firstMentioned: now,
      lastMentioned: now,
      mentionCount: 1,
      relatedEntities: [],
    }));
  } catch {
    // Fall back to regex extraction
    return extractEntities(text, turnIndex, source);
  }
}

/**
 * Map NER entity type to our internal type
 */
function mapNERType(nerType: string): EntityType {
  const typeMap: Record<string, EntityType> = {
    person: 'person',
    place: 'location',
    organization: 'organization',
    date: 'date',
    time: 'time',
    song: 'song',
    artist: 'artist',
    money: 'unknown',
    email: 'unknown',
    phone: 'unknown',
    url: 'unknown',
    hashtag: 'topic',
    quantity: 'unknown',
    duration: 'time',
    event: 'event',
  };
  return typeMap[nerType] || 'unknown';
}

/**
 * Extract entities from text (regex fallback)
 */
export function extractEntities(
  text: string,
  turnIndex: number,
  source: 'user' | 'tool_result' = 'user'
): TrackedEntity[] {
  const entities: TrackedEntity[] = [];
  const now = new Date();

  // Person names (regex fallback when NER not available)
  const personPatterns = [
    /(?:my\s+)?(?:wife|husband|son|daughter|mom|dad|brother|sister|friend|boss|colleague)\s+(?:named\s+)?(\w+)/gi,
    /(\w+)(?:'s\s+(?:birthday|anniversary|meeting))/gi,
    /(?:talk to|meet with|call)\s+(\w+)/gi,
  ];

  for (const pattern of personPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (name && name.length > 1 && !isCommonWord(name)) {
        entities.push(createEntity(name, 'person', turnIndex, source, now));
      }
    }
  }

  // Locations
  const locationPatterns = [
    /(?:in|at|to|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    /(?:weather\s+(?:in|for))\s+(\w+(?:\s+\w+)*)/gi,
  ];

  for (const pattern of locationPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const location = match[1];
      if (location && !isCommonWord(location)) {
        entities.push(createEntity(location, 'location', turnIndex, source, now));
      }
    }
  }

  // Songs/Artists
  const musicPatterns = [
    /play\s+(?:some\s+)?["']?([^"']+)["']?\s+(?:by|from)\s+(\w+(?:\s+\w+)*)/gi,
    /(?:song|track|album)\s+(?:called\s+)?["']?([^"']+)["']?/gi,
  ];

  for (const pattern of musicPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        entities.push(createEntity(match[1], 'song', turnIndex, source, now));
      }
      if (match[2]) {
        entities.push(createEntity(match[2], 'artist', turnIndex, source, now));
      }
    }
  }

  // Dates/Times
  const datePatterns = [
    /(today|tomorrow|yesterday|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/gi,
    /(?:on\s+)?(\w+day)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/gi,
  ];

  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entities.push(createEntity(match[0], 'date', turnIndex, source, now));
    }
  }

  // Events
  const eventPatterns = [
    /(?:meeting|appointment|call|dinner|lunch|party|event)\s+(?:with\s+)?([^.!?]+)/gi,
  ];

  for (const pattern of eventPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entities.push(createEntity(match[0], 'event', turnIndex, source, now));
    }
  }

  return entities;
}

function createEntity(
  value: string,
  type: EntityType,
  turnIndex: number,
  source: 'user' | 'tool_result',
  now: Date
): TrackedEntity {
  return {
    id: `${type}_${value.toLowerCase().replace(/\s+/g, '_')}_${turnIndex}`,
    type,
    value,
    normalizedValue: value.toLowerCase().trim(),
    aliases: [],
    confidence: source === 'user' ? 0.8 : 0.9,
    source,
    sourceTurn: turnIndex,
    firstMentioned: now,
    lastMentioned: now,
    mentionCount: 1,
    relatedEntities: [],
  };
}

function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'like',
    'through',
    'after',
    'over',
    'between',
    'out',
    'against',
    'during',
    'without',
    'before',
    'under',
    'around',
    'among',
    'i',
    'me',
    'my',
    'we',
    'you',
    'your',
    'it',
    'its',
    'this',
    'that',
    'these',
    'those',
    'what',
    'which',
    'who',
    'whom',
    'some',
    'any',
    'no',
    'not',
    'and',
    'but',
    'or',
    'if',
    'then',
    'else',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
  ]);
  return commonWords.has(word.toLowerCase());
}

/**
 * Update context with new user input
 */
export function updateContextWithInput(
  sessionId: string,
  text: string,
  turnIndex: number
): DeepContext {
  const context = getDeepContext(sessionId);
  context.currentTurn = turnIndex;

  // Extract entities
  const newEntities = extractEntities(text, turnIndex, 'user');

  // Merge with existing entities
  for (const entity of newEntities) {
    const existingKey = `${entity.type}_${entity.normalizedValue}`;
    const existing = context.entities.get(existingKey);

    if (existing) {
      existing.lastMentioned = new Date();
      existing.mentionCount++;
      existing.confidence = Math.min(1, existing.confidence + 0.1);
    } else {
      context.entities.set(existingKey, entity);
    }

    // Update lastMentioned by type
    updateLastMentioned(context, entity);
  }

  // Detect topic shift
  detectTopicShift(context, text, turnIndex);

  return context;
}

/**
 * Update context with tool result
 */
export function updateContextWithToolResult(
  sessionId: string,
  toolId: string,
  result: unknown,
  turnIndex: number
): DeepContext {
  const context = getDeepContext(sessionId);

  // Store tool result
  const resultContext: ToolResultContext = {
    toolId,
    turnIndex,
    timestamp: new Date(),
    result,
    extractedEntities: [],
  };

  // Extract entities from result
  if (typeof result === 'string') {
    resultContext.extractedEntities = extractEntities(result, turnIndex, 'tool_result');
  } else if (typeof result === 'object' && result !== null) {
    // Extract from object fields
    const resultObj = result as Record<string, unknown>;
    for (const value of Object.values(resultObj)) {
      if (typeof value === 'string') {
        resultContext.extractedEntities.push(...extractEntities(value, turnIndex, 'tool_result'));
      }
    }
  }

  // Add entities to context
  for (const entity of resultContext.extractedEntities) {
    entity.sourceToolId = toolId;
    const key = `${entity.type}_${entity.normalizedValue}`;
    if (!context.entities.has(key)) {
      context.entities.set(key, entity);
    }
    updateLastMentioned(context, entity);
  }

  // Store result context (keep last 10)
  context.toolResults.push(resultContext);
  if (context.toolResults.length > 10) {
    context.toolResults.shift();
  }

  return context;
}

function updateLastMentioned(context: DeepContext, entity: TrackedEntity): void {
  switch (entity.type) {
    case 'person':
      context.lastMentioned.person = entity.id;
      break;
    case 'location':
      context.lastMentioned.location = entity.id;
      break;
    case 'song':
    case 'artist':
      context.lastMentioned.song = entity.id;
      break;
    case 'event':
      context.lastMentioned.event = entity.id;
      break;
    case 'topic':
      context.lastMentioned.topic = entity.id;
      break;
  }
}

// ============================================================================
// PRONOUN RESOLUTION
// ============================================================================

const PRONOUNS: Record<string, EntityType[]> = {
  // People
  he: ['person'],
  him: ['person'],
  his: ['person'],
  she: ['person'],
  her: ['person'],
  hers: ['person'],
  they: ['person'],
  them: ['person'],
  their: ['person'],

  // Things
  it: ['song', 'event', 'topic', 'location'],
  that: ['song', 'event', 'topic', 'location', 'person'],
  this: ['song', 'event', 'topic', 'location'],
  those: ['event', 'song'],
  these: ['event', 'song'],

  // Places
  there: ['location'],
  here: ['location'],
};

/**
 * Resolve pronouns in text to actual entities
 */
export function resolvePronouns(
  text: string,
  context: DeepContext
): Map<string, ResolutionResult> {
  const resolutions = new Map<string, ResolutionResult>();
  const lowerText = text.toLowerCase();

  for (const [pronoun, types] of Object.entries(PRONOUNS)) {
    // Check if pronoun appears in text
    const pronounPattern = new RegExp(`\\b${pronoun}\\b`, 'gi');
    if (!pronounPattern.test(lowerText)) continue;

    // Find best matching entity
    let bestEntity: TrackedEntity | undefined;
    let bestScore = 0;

    for (const type of types) {
      // Check lastMentioned first
      const lastMentionedKey = context.lastMentioned[type as keyof typeof context.lastMentioned];
      if (lastMentionedKey) {
        const entity = context.entities.get(lastMentionedKey);
        if (entity && entity.type === type) {
          const score = calculateEntityScore(entity, context.currentTurn);
          if (score > bestScore) {
            bestScore = score;
            bestEntity = entity;
          }
        }
      }

      // Check all entities of this type
      for (const entity of context.entities.values()) {
        if (entity.type === type) {
          const score = calculateEntityScore(entity, context.currentTurn);
          if (score > bestScore) {
            bestScore = score;
            bestEntity = entity;
          }
        }
      }
    }

    if (bestEntity && bestScore > 0.3) {
      resolutions.set(pronoun, {
        resolved: true,
        resolvedValue: bestEntity.value,
        entity: bestEntity,
        confidence: bestScore,
        method: 'pronoun',
      });
    } else {
      resolutions.set(pronoun, {
        resolved: false,
        confidence: 0,
        method: 'none',
      });
    }
  }

  return resolutions;
}

/**
 * Calculate entity relevance score based on recency and frequency
 */
function calculateEntityScore(entity: TrackedEntity, currentTurn: number): number {
  // Recency score (decays with turns)
  const turnsSinceMention = currentTurn - entity.sourceTurn;
  const recencyScore = Math.exp(-turnsSinceMention * 0.3);

  // Frequency score
  const frequencyScore = Math.min(1, entity.mentionCount / 5);

  // Confidence score
  const confidenceScore = entity.confidence;

  // Combined score
  return recencyScore * 0.5 + frequencyScore * 0.2 + confidenceScore * 0.3;
}

/**
 * Resolve "it", "that", etc. in context of a specific tool
 */
export function resolveForTool(
  text: string,
  toolId: string,
  context: DeepContext
): Record<string, string> {
  const resolved: Record<string, string> = {};
  const resolutions = resolvePronouns(text, context);

  // Tool-specific resolution hints
  const toolEntityTypes: Record<string, EntityType[]> = {
    spotify_play: ['song', 'artist'],
    calendar_create_event: ['event', 'person', 'date'],
    calendar_list_events: ['date', 'person'],
    weather_current: ['location'],
    weather_forecast: ['location', 'date'],
    memory_recall: ['person', 'topic'],
    memory_save: ['topic', 'person'],
  };

  const preferredTypes = toolEntityTypes[toolId] || [];

  for (const [pronoun, resolution] of resolutions) {
    if (resolution.resolved && resolution.entity) {
      // Check if entity type matches tool preferences
      if (
        preferredTypes.length === 0 ||
        preferredTypes.includes(resolution.entity.type)
      ) {
        resolved[pronoun] = resolution.resolvedValue!;
      }
    }
  }

  // Also check for tool result references
  if (text.includes('the result') || text.includes('that result')) {
    const lastResult = context.toolResults[context.toolResults.length - 1];
    if (lastResult) {
      resolved['result'] = JSON.stringify(lastResult.result);
    }
  }

  return resolved;
}

// ============================================================================
// TOPIC DETECTION
// ============================================================================

const TOPIC_KEYWORDS: Record<string, string[]> = {
  weather: ['weather', 'rain', 'sunny', 'cold', 'hot', 'temperature', 'forecast'],
  music: ['music', 'song', 'play', 'spotify', 'artist', 'album', 'playlist'],
  calendar: ['calendar', 'meeting', 'schedule', 'appointment', 'event', 'busy', 'free'],
  habits: ['habit', 'routine', 'track', 'progress', 'streak', 'meditation', 'exercise'],
  wellness: ['stress', 'anxious', 'calm', 'relax', 'breathing', 'grounding', 'sleep'],
  memory: ['remember', 'forget', 'recall', 'save', 'note'],
  people: ['friend', 'family', 'colleague', 'boss', 'wife', 'husband', 'mom', 'dad'],
};

function detectTopicShift(context: DeepContext, text: string, turnIndex: number): void {
  const lowerText = text.toLowerCase();

  // Score each topic
  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const matches = keywords.filter((kw) => lowerText.includes(kw)).length;
    const score = matches / keywords.length;

    if (score > bestScore && score > 0.1) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  if (bestTopic) {
    // Check if topic changed
    if (!context.currentTopic || context.currentTopic.name !== bestTopic) {
      // End previous topic
      if (context.currentTopic) {
        context.currentTopic.endTurn = turnIndex - 1;
        context.topicHistory.push(context.currentTopic);
      }

      // Start new topic
      context.currentTopic = {
        id: `topic_${bestTopic}_${turnIndex}`,
        name: bestTopic,
        confidence: bestScore,
        startTurn: turnIndex,
        keywords: TOPIC_KEYWORDS[bestTopic],
        relatedTools: getTopicTools(bestTopic),
      };

      log.debug({ topic: bestTopic, confidence: bestScore.toFixed(2) }, 'Topic detected');
    } else {
      // Reinforce current topic
      context.currentTopic.confidence = Math.min(1, context.currentTopic.confidence + 0.1);
    }
  }
}

function getTopicTools(topic: string): string[] {
  const topicTools: Record<string, string[]> = {
    weather: ['weather_current', 'weather_forecast'],
    music: ['spotify_play', 'spotify_pause', 'spotify_skip'],
    calendar: ['calendar_list_events', 'calendar_create_event', 'calendar_check_availability'],
    habits: ['habit_track', 'habit_progress', 'habit_suggest'],
    wellness: ['grounding_exercise', 'breathing_exercise', 'sleep_help'],
    memory: ['memory_save', 'memory_recall'],
    people: ['memory_recall_person', 'calendar_list_events'],
  };

  return topicTools[topic] || [];
}

// ============================================================================
// CONTEXT SUMMARY
// ============================================================================

/**
 * Get a summary of current context for debugging/logging
 */
export function getContextSummary(sessionId: string): {
  entities: number;
  topic: string | null;
  topicHistory: number;
  toolResults: number;
  lastMentioned: Record<string, string | null>;
} {
  const context = getDeepContext(sessionId);

  return {
    entities: context.entities.size,
    topic: context.currentTopic?.name || null,
    topicHistory: context.topicHistory.length,
    toolResults: context.toolResults.length,
    lastMentioned: {
      person: context.lastMentioned.person
        ? context.entities.get(context.lastMentioned.person)?.value || null
        : null,
      location: context.lastMentioned.location
        ? context.entities.get(context.lastMentioned.location)?.value || null
        : null,
      song: context.lastMentioned.song
        ? context.entities.get(context.lastMentioned.song)?.value || null
        : null,
    },
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup old contexts (call periodically)
 */
export function cleanupOldContexts(maxAgeMs: number = 30 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, context] of contextStore) {
    // Check if any entity was mentioned recently
    let mostRecent = 0;
    for (const entity of context.entities.values()) {
      const entityTime = entity.lastMentioned.getTime();
      if (entityTime > mostRecent) {
        mostRecent = entityTime;
      }
    }

    if (now - mostRecent > maxAgeMs) {
      contextStore.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log.info({ cleaned }, 'Cleaned up old contexts');
  }

  return cleaned;
}

