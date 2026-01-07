/**
 * Natural Language Query Service
 *
 * Enables natural queries like:
 * - "What do we know about Mike?"
 * - "Tell me everything about my brother"
 * - "When did I last talk about my career?"
 * - "What patterns have you noticed about my stress?"
 *
 * This is the "Ask Me Anything" interface to the knowledge graph.
 *
 * @module memory/knowledge-graph/services/natural-language-query
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  Entity,
  Insight,
  Thread,
} from '../types.js';
import type { Mention, EntityRelationship, ExtractedFact } from '../../entity-store/types.js';

const log = createLogger({ module: 'NaturalLanguageQuery' });

// ============================================================================
// TYPES
// ============================================================================

export type QueryType =
  | 'entity_profile' // "What do we know about X?"
  | 'temporal' // "When did I last talk about X?"
  | 'pattern' // "What patterns have you noticed about X?"
  | 'relationship' // "How is X connected to Y?"
  | 'timeline' // "Show me the timeline for X"
  | 'open_loops' // "What were we talking about that we didn't finish?"
  | 'insights' // "What insights do you have about X?"
  | 'general'; // Generic knowledge query

export interface NaturalQueryResult {
  /** Query type detected */
  queryType: QueryType;
  /** Primary entity (if entity-focused query) */
  entity?: Entity | null;
  /** Related entities */
  relatedEntities: Entity[];
  /** Relevant facts */
  facts: ExtractedFact[];
  /** Relevant mentions */
  mentions: Mention[];
  /** Relationships */
  relationships: EntityRelationship[];
  /** Insights */
  insights: Insight[];
  /** Threads */
  threads: Thread[];
  /** Formatted response for LLM to use */
  formattedResponse: string;
  /** Confidence in the response */
  confidence: number;
  /** Processing time */
  processingTimeMs: number;
}

export interface QueryOptions {
  /** Maximum facts to return */
  maxFacts?: number;
  /** Maximum mentions to return */
  maxMentions?: number;
  /** Maximum related entities */
  maxRelated?: number;
  /** Include insights */
  includeInsights?: boolean;
  /** Include threads */
  includeThreads?: boolean;
  /** Time range for temporal queries */
  timeRange?: { start: Date; end: Date };
}

const DEFAULT_OPTIONS: QueryOptions = {
  maxFacts: 10,
  maxMentions: 10,
  maxRelated: 5,
  includeInsights: true,
  includeThreads: true,
};

// ============================================================================
// QUERY DETECTION
// ============================================================================

const QUERY_PATTERNS: Array<{
  pattern: RegExp;
  type: QueryType;
  extractTarget: (match: RegExpMatchArray) => string;
}> = [
  // Entity profile queries
  {
    pattern: /what\s+(?:do\s+(?:you|we)\s+)?know\s+about\s+(.+?)(?:\?|$)/i,
    type: 'entity_profile',
    extractTarget: (m) => m[1].trim(),
  },
  {
    pattern: /tell\s+me\s+(?:everything\s+)?about\s+(.+?)(?:\?|$)/i,
    type: 'entity_profile',
    extractTarget: (m) => m[1].trim(),
  },
  {
    pattern: /who\s+is\s+(.+?)(?:\?|$)/i,
    type: 'entity_profile',
    extractTarget: (m) => m[1].trim(),
  },

  // Temporal queries
  {
    pattern: /when\s+did\s+(?:I|we)\s+(?:last\s+)?(?:talk|discuss|mention)\s+(?:about\s+)?(.+?)(?:\?|$)/i,
    type: 'temporal',
    extractTarget: (m) => m[1].trim(),
  },
  {
    pattern: /(?:how\s+long|when)\s+since\s+(?:I|we)\s+(?:talked|discussed)\s+(?:about\s+)?(.+?)(?:\?|$)/i,
    type: 'temporal',
    extractTarget: (m) => m[1].trim(),
  },

  // Pattern queries
  {
    pattern: /what\s+patterns?\s+(?:have\s+you|do\s+you)\s+(?:noticed?|seen?)\s+(?:about\s+)?(.+?)(?:\?|$)/i,
    type: 'pattern',
    extractTarget: (m) => m[1].trim(),
  },
  {
    pattern: /(?:have\s+you\s+)?noticed?\s+(?:any\s+)?patterns?\s+(?:about|with|in)\s+(.+?)(?:\?|$)/i,
    type: 'pattern',
    extractTarget: (m) => m[1].trim(),
  },

  // Relationship queries
  {
    pattern: /how\s+(?:is|are)\s+(.+?)\s+(?:connected|related)\s+to\s+(.+?)(?:\?|$)/i,
    type: 'relationship',
    extractTarget: (m) => `${m[1].trim()}|${m[2].trim()}`,
  },
  {
    pattern: /what(?:'s|\s+is)\s+the\s+(?:connection|relationship)\s+between\s+(.+?)\s+and\s+(.+?)(?:\?|$)/i,
    type: 'relationship',
    extractTarget: (m) => `${m[1].trim()}|${m[2].trim()}`,
  },

  // Open loops queries
  {
    pattern: /what\s+(?:were\s+we|was\s+I)\s+(?:talking|discussing)\s+about\s+that\s+(?:we\s+)?(?:didn't|never)\s+finish/i,
    type: 'open_loops',
    extractTarget: () => '',
  },
  {
    pattern: /(?:any\s+)?open\s+(?:threads?|loops?|questions?)/i,
    type: 'open_loops',
    extractTarget: () => '',
  },

  // Insights queries
  {
    pattern: /what\s+insights?\s+(?:do\s+you\s+have|have\s+you\s+(?:got|found))\s+(?:about\s+)?(.+?)(?:\?|$)/i,
    type: 'insights',
    extractTarget: (m) => m[1]?.trim() || '',
  },

  // Timeline queries
  {
    pattern: /(?:show\s+me\s+the\s+)?timeline\s+(?:for|of)\s+(.+?)(?:\?|$)/i,
    type: 'timeline',
    extractTarget: (m) => m[1].trim(),
  },
];

/**
 * Detect query type and extract target from natural language
 */
export function detectQueryType(query: string): { type: QueryType; target: string } {
  for (const { pattern, type, extractTarget } of QUERY_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      return { type, target: extractTarget(match) };
    }
  }

  return { type: 'general', target: query };
}

// ============================================================================
// QUERY EXECUTION
// ============================================================================

/**
 * Execute a natural language query against the knowledge graph
 */
export async function executeNaturalQuery(
  userId: string,
  query: string,
  options: QueryOptions = DEFAULT_OPTIONS
): Promise<NaturalQueryResult> {
  const startTime = Date.now();
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Detect query type
  const { type, target } = detectQueryType(query);

  log.debug({ userId, query, type, target }, 'Executing natural language query');

  try {
    switch (type) {
      case 'entity_profile':
        return executeEntityProfileQuery(userId, target, mergedOptions, startTime);

      case 'temporal':
        return executeTemporalQuery(userId, target, mergedOptions, startTime);

      case 'pattern':
        return executePatternQuery(userId, target, mergedOptions, startTime);

      case 'relationship':
        return executeRelationshipQuery(userId, target, mergedOptions, startTime);

      case 'open_loops':
        return executeOpenLoopsQuery(userId, mergedOptions, startTime);

      case 'insights':
        return executeInsightsQuery(userId, target, mergedOptions, startTime);

      case 'timeline':
        return executeTimelineQuery(userId, target, mergedOptions, startTime);

      default:
        return executeGeneralQuery(userId, query, mergedOptions, startTime);
    }
  } catch (error) {
    log.error({ error: String(error), userId, query }, 'Natural language query failed');

    return {
      queryType: type,
      entity: null,
      relatedEntities: [],
      facts: [],
      mentions: [],
      relationships: [],
      insights: [],
      threads: [],
      formattedResponse: "I couldn't find information about that. Could you tell me more?",
      confidence: 0,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// QUERY TYPE HANDLERS
// ============================================================================

async function executeEntityProfileQuery(
  userId: string,
  target: string,
  options: QueryOptions,
  startTime: number
): Promise<NaturalQueryResult> {
  const { whatDoWeKnowAbout } = await import('../../entity-store/entity-resolver.js');
  const { getAllInsights } = await import('../storage/index.js');
  const { getActiveThreads } = await import('../storage/index.js');

  const result = await whatDoWeKnowAbout(userId, target);

  // Get insights about this entity
  let insights: Insight[] = [];
  if (options.includeInsights && result.entity) {
    insights = await getAllInsights(userId, {
      entityIds: [result.entity.id],
      limit: 5,
    });
  }

  // Get threads involving this entity
  let threads: Thread[] = [];
  if (options.includeThreads && result.entity) {
    const { getThreadsForEntity } = await import('../storage/index.js');
    threads = await getThreadsForEntity(userId, result.entity.id, { limit: 5 });
  }

  // Format response
  const formattedResponse = formatEntityProfileResponse(result, insights, threads);

  return {
    queryType: 'entity_profile',
    entity: result.entity,
    relatedEntities: result.relatedEntities.slice(0, options.maxRelated),
    facts: result.facts.slice(0, options.maxFacts),
    mentions: result.mentions.slice(0, options.maxMentions),
    relationships: result.relationships,
    insights,
    threads,
    formattedResponse,
    confidence: result.entity ? 0.9 : 0.3,
    processingTimeMs: Date.now() - startTime,
  };
}

async function executeTemporalQuery(
  userId: string,
  target: string,
  options: QueryOptions,
  startTime: number
): Promise<NaturalQueryResult> {
  const { findEntityByAlias, getMentionsForEntity } = await import(
    '../../entity-store/storage.js'
  );

  const entity = await findEntityByAlias(userId, target, 'person');

  if (!entity) {
    return {
      queryType: 'temporal',
      entity: null,
      relatedEntities: [],
      facts: [],
      mentions: [],
      relationships: [],
      insights: [],
      threads: [],
      formattedResponse: `I don't have any record of "${target}" in our conversations.`,
      confidence: 0.3,
      processingTimeMs: Date.now() - startTime,
    };
  }

  const mentions = await getMentionsForEntity(userId, entity.id, options.maxMentions || 10);

  // Sort by timestamp and format response
  const sortedMentions = mentions.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const lastMention = sortedMentions[0];
  const formattedResponse = lastMention
    ? formatTemporalResponse(entity, lastMention, sortedMentions.length)
    : `I don't have any mentions of ${entity.canonicalName} in our conversations.`;

  return {
    queryType: 'temporal',
    entity,
    relatedEntities: [],
    facts: [],
    mentions: sortedMentions,
    relationships: [],
    insights: [],
    threads: [],
    formattedResponse,
    confidence: lastMention ? 0.9 : 0.5,
    processingTimeMs: Date.now() - startTime,
  };
}

async function executePatternQuery(
  userId: string,
  target: string,
  options: QueryOptions,
  startTime: number
): Promise<NaturalQueryResult> {
  const { getAllInsights } = await import('../storage/index.js');
  const { findEntityByAlias } = await import('../../entity-store/storage.js');

  // Try to find entity
  const entity = await findEntityByAlias(userId, target, 'person');

  // Get pattern-type insights
  const insights = await getAllInsights(userId, {
    types: ['behavioral_pattern', 'temporal_pattern', 'emotional_pattern', 'correlation'],
    entityIds: entity ? [entity.id] : undefined,
    limit: 10,
  });

  const formattedResponse = formatPatternResponse(target, insights, entity);

  return {
    queryType: 'pattern',
    entity,
    relatedEntities: [],
    facts: [],
    mentions: [],
    relationships: [],
    insights,
    threads: [],
    formattedResponse,
    confidence: insights.length > 0 ? 0.8 : 0.4,
    processingTimeMs: Date.now() - startTime,
  };
}

async function executeRelationshipQuery(
  userId: string,
  target: string,
  options: QueryOptions,
  startTime: number
): Promise<NaturalQueryResult> {
  const [entity1Name, entity2Name] = target.split('|');

  const { findEntityByAlias, getRelationshipsForEntity } = await import(
    '../../entity-store/storage.js'
  );

  const entity1 = await findEntityByAlias(userId, entity1Name, 'person');
  const entity2 = await findEntityByAlias(userId, entity2Name, 'person');

  if (!entity1 || !entity2) {
    return {
      queryType: 'relationship',
      entity: entity1 || entity2,
      relatedEntities: [],
      facts: [],
      mentions: [],
      relationships: [],
      insights: [],
      threads: [],
      formattedResponse: `I couldn't find both ${entity1Name} and ${entity2Name} in our conversations.`,
      confidence: 0.3,
      processingTimeMs: Date.now() - startTime,
    };
  }

  const relationships = await getRelationshipsForEntity(userId, entity1.id);
  const connection = relationships.find(
    (r) => r.fromEntity === entity2.id || r.toEntity === entity2.id
  );

  const formattedResponse = formatRelationshipResponse(entity1, entity2, connection);

  return {
    queryType: 'relationship',
    entity: entity1,
    relatedEntities: [entity2],
    facts: [],
    mentions: [],
    relationships: connection ? [connection] : [],
    insights: [],
    threads: [],
    formattedResponse,
    confidence: connection ? 0.9 : 0.5,
    processingTimeMs: Date.now() - startTime,
  };
}

async function executeOpenLoopsQuery(
  userId: string,
  options: QueryOptions,
  startTime: number
): Promise<NaturalQueryResult> {
  const { getOpenLoopThreads } = await import('../storage/index.js');

  const threads = await getOpenLoopThreads(userId, 10);

  const formattedResponse = formatOpenLoopsResponse(threads);

  return {
    queryType: 'open_loops',
    entity: null,
    relatedEntities: [],
    facts: [],
    mentions: [],
    relationships: [],
    insights: [],
    threads,
    formattedResponse,
    confidence: threads.length > 0 ? 0.9 : 0.5,
    processingTimeMs: Date.now() - startTime,
  };
}

async function executeInsightsQuery(
  userId: string,
  target: string,
  options: QueryOptions,
  startTime: number
): Promise<NaturalQueryResult> {
  const { getAllInsights } = await import('../storage/index.js');
  const { findEntityByAlias } = await import('../../entity-store/storage.js');

  let entity: Entity | null = null;
  if (target) {
    entity = await findEntityByAlias(userId, target, 'person');
  }

  const insights = await getAllInsights(userId, {
    entityIds: entity ? [entity.id] : undefined,
    minConfidence: 0.5,
    limit: 10,
  });

  const formattedResponse = formatInsightsResponse(insights, entity);

  return {
    queryType: 'insights',
    entity,
    relatedEntities: [],
    facts: [],
    mentions: [],
    relationships: [],
    insights,
    threads: [],
    formattedResponse,
    confidence: insights.length > 0 ? 0.85 : 0.4,
    processingTimeMs: Date.now() - startTime,
  };
}

async function executeTimelineQuery(
  userId: string,
  target: string,
  options: QueryOptions,
  startTime: number
): Promise<NaturalQueryResult> {
  const { findEntityByAlias, getMentionsForEntity } = await import(
    '../../entity-store/storage.js'
  );

  const entity = await findEntityByAlias(userId, target, 'person');

  if (!entity) {
    return {
      queryType: 'timeline',
      entity: null,
      relatedEntities: [],
      facts: [],
      mentions: [],
      relationships: [],
      insights: [],
      threads: [],
      formattedResponse: `I couldn't find "${target}" in our conversations.`,
      confidence: 0.3,
      processingTimeMs: Date.now() - startTime,
    };
  }

  const mentions = await getMentionsForEntity(userId, entity.id, 50);
  const sortedMentions = mentions.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const formattedResponse = formatTimelineResponse(entity, sortedMentions);

  return {
    queryType: 'timeline',
    entity,
    relatedEntities: [],
    facts: [],
    mentions: sortedMentions,
    relationships: [],
    insights: [],
    threads: [],
    formattedResponse,
    confidence: 0.85,
    processingTimeMs: Date.now() - startTime,
  };
}

async function executeGeneralQuery(
  userId: string,
  query: string,
  options: QueryOptions,
  startTime: number
): Promise<NaturalQueryResult> {
  // Fall back to semantic search
  const { searchEntities } = await import('../../entity-store/storage.js');

  const entities = await searchEntities(userId, query, {
    limit: options.maxRelated || 5,
  });

  const formattedResponse =
    entities.length > 0
      ? `I found ${entities.length} potentially related items: ${entities.map((e) => e.canonicalName).join(', ')}`
      : "I couldn't find anything related to that in our conversations.";

  return {
    queryType: 'general',
    entity: entities[0] || null,
    relatedEntities: entities.slice(1),
    facts: [],
    mentions: [],
    relationships: [],
    insights: [],
    threads: [],
    formattedResponse,
    confidence: entities.length > 0 ? 0.6 : 0.3,
    processingTimeMs: Date.now() - startTime,
  };
}

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

function formatEntityProfileResponse(
  result: Awaited<ReturnType<typeof import('../../entity-store/entity-resolver.js').whatDoWeKnowAbout>>,
  insights: Insight[],
  threads: Thread[]
): string {
  if (!result.entity) {
    return "I don't have any information about that person in our conversations.";
  }

  const lines: string[] = [];
  const { entity, facts, mentions, relationships, relatedEntities } = result;

  // Basic info
  lines.push(`Here's what I know about ${entity.canonicalName}:`);

  if (entity.specificRelation) {
    lines.push(`• They are your ${entity.specificRelation}`);
  }

  // Contact info
  if (entity.contact?.phone) {
    lines.push(`• Phone: ${entity.contact.phone}`);
  }
  if (entity.contact?.birthday) {
    lines.push(`• Birthday: ${entity.contact.birthday}`);
  }

  // Facts
  if (facts.length > 0) {
    lines.push('\nFacts:');
    for (const fact of facts.slice(0, 5)) {
      lines.push(`• ${fact.content || `${fact.key}: ${fact.value}`}`);
    }
  }

  // Related people
  if (relatedEntities.length > 0) {
    lines.push(`\nConnected to: ${relatedEntities.map((e) => e.canonicalName).join(', ')}`);
  }

  // Mention stats
  lines.push(
    `\nI've heard you mention ${entity.canonicalName} ${entity.mentionCount} times in our conversations.`
  );

  // Insights
  if (insights.length > 0) {
    lines.push('\nPatterns I\'ve noticed:');
    for (const insight of insights.slice(0, 3)) {
      lines.push(`• ${insight.description}`);
    }
  }

  return lines.join('\n');
}

function formatTemporalResponse(
  entity: Entity,
  lastMention: Mention,
  totalMentions: number
): string {
  const lastDate = new Date(lastMention.timestamp);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  let timeAgo: string;
  if (daysDiff === 0) {
    timeAgo = 'earlier today';
  } else if (daysDiff === 1) {
    timeAgo = 'yesterday';
  } else if (daysDiff < 7) {
    timeAgo = `${daysDiff} days ago`;
  } else if (daysDiff < 30) {
    timeAgo = `${Math.floor(daysDiff / 7)} weeks ago`;
  } else {
    timeAgo = `${Math.floor(daysDiff / 30)} months ago`;
  }

  return `You last mentioned ${entity.canonicalName} ${timeAgo}. ` +
    `In total, you've brought them up ${totalMentions} times in our conversations.`;
}

function formatPatternResponse(target: string, insights: Insight[], entity?: Entity | null): string {
  if (insights.length === 0) {
    return `I haven't detected any clear patterns about ${target} yet. ` +
      `The more we talk, the better I'll understand.`;
  }

  const lines: string[] = [`Here are some patterns I've noticed about ${entity?.canonicalName || target}:`];

  for (const insight of insights.slice(0, 5)) {
    lines.push(`• ${insight.description}`);
  }

  return lines.join('\n');
}

function formatRelationshipResponse(
  entity1: Entity,
  entity2: Entity,
  connection?: EntityRelationship
): string {
  if (connection) {
    return `Based on our conversations, ${entity1.canonicalName} and ${entity2.canonicalName} ` +
      `are connected through: ${connection.label || connection.type}`;
  }

  return `I haven't found a direct connection between ${entity1.canonicalName} ` +
    `and ${entity2.canonicalName} in our conversations, but they might still be related.`;
}

function formatOpenLoopsResponse(threads: Thread[]): string {
  if (threads.length === 0) {
    return "I don't have any open threads or unfinished conversations to follow up on.";
  }

  const lines: string[] = ['Here are some things we started discussing but haven\'t fully resolved:'];

  for (const thread of threads.slice(0, 5)) {
    lines.push(`• ${thread.topic}`);
    if (thread.openQuestions.length > 0) {
      lines.push(`  Open question: ${thread.openQuestions[0]}`);
    }
  }

  return lines.join('\n');
}

function formatInsightsResponse(insights: Insight[], entity?: Entity | null): string {
  if (insights.length === 0) {
    const target = entity ? `about ${entity.canonicalName}` : '';
    return `I don't have any specific insights ${target} to share yet.`;
  }

  const lines: string[] = entity
    ? [`Here are some insights about ${entity.canonicalName}:`]
    : ['Here are some insights I\'ve gathered:'];

  for (const insight of insights.slice(0, 5)) {
    lines.push(`• ${insight.title}: ${insight.description}`);
  }

  return lines.join('\n');
}

function formatTimelineResponse(entity: Entity, mentions: Mention[]): string {
  if (mentions.length === 0) {
    return `I don't have a timeline for ${entity.canonicalName}.`;
  }

  const lines: string[] = [`Timeline for ${entity.canonicalName}:`];

  // Group by month
  const byMonth = new Map<string, Mention[]>();
  for (const mention of mentions) {
    const date = new Date(mention.timestamp);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!byMonth.has(key)) {
      byMonth.set(key, []);
    }
    byMonth.get(key)!.push(mention);
  }

  for (const [monthKey, monthMentions] of byMonth) {
    const [year, month] = monthKey.split('-');
    const monthName = new Date(Number(year), Number(month) - 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    lines.push(`\n${monthName}: ${monthMentions.length} mentions`);

    // Show first mention summary
    if (monthMentions[0].transcript) {
      const snippet = monthMentions[0].transcript.slice(0, 100);
      lines.push(`  "${snippet}..."`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// UNIFIED QUERY ENGINE
// ============================================================================

/**
 * Unified Query Engine - facade for natural language queries
 *
 * This provides a singleton-style accessor pattern used by higher-level
 * modules. It wraps executeNaturalQuery with additional convenience methods.
 */
/**
 * Options for entity search
 */
export interface SearchOptions {
  userId: string;
  types?: string[];
  minImportance?: number;
  limit?: number;
  includeRecentMentions?: number;
  query?: string;
  includeFacts?: boolean;
}

/**
 * Result from entity search
 */
export interface SearchResult {
  entity: Entity;
  relevance: number;
  facts?: ExtractedFact[];
  recentMentions?: Mention[];
}

export interface UnifiedQueryEngine {
  /** Execute a natural language query */
  query: (userId: string, query: string, options?: QueryOptions) => Promise<NaturalQueryResult>;
  /** Detect query type without executing */
  detectType: (query: string) => { type: QueryType; target: string };
  /** Check if engine is ready */
  isReady: () => boolean;
  /** Search entities - FULL IMPLEMENTATION */
  search: (options: SearchOptions) => Promise<SearchResult[]>;
}

let unifiedEngineInstance: UnifiedQueryEngine | null = null;

/**
 * Search entities - FULL IMPLEMENTATION
 * 
 * This searches the entity store based on various criteria and returns
 * relevant entities with their facts and mentions.
 */
async function searchImpl(options: SearchOptions): Promise<SearchResult[]> {
  const { 
    userId, 
    types, 
    minImportance = 0, 
    limit = 10,
    includeRecentMentions = 0,
    query,
    includeFacts = false 
  } = options;

  const { getEntityResolver } = await import('../index.js');
  const resolver = getEntityResolver();

  // Get entities based on criteria
  let entities: Entity[] = [];

  if (types && types.length > 0) {
    // Get entities by type
    for (const type of types) {
      const typeEntities = await resolver.getEntitiesByType(userId, type);
      entities.push(...typeEntities);
    }
  } else {
    // Get all people as default
    entities = await resolver.getPeople(userId);
  }

  // Filter by importance/salience
  if (minImportance > 0) {
    entities = entities.filter(e => (e.salienceScore || 0) >= minImportance);
  }

  // If query provided, do text matching
  if (query) {
    const queryLower = query.toLowerCase();
    entities = entities.filter(e => {
      const name = (e.canonicalName || '').toLowerCase();
      const aliases = (e.aliases || []).map(a => a.toLowerCase());
      return name.includes(queryLower) || 
             aliases.some(a => a.includes(queryLower)) ||
             queryLower.includes(name);
    });
  }

  // Sort by salience/importance
  entities.sort((a, b) => (b.salienceScore || 0) - (a.salienceScore || 0));

  // Limit results
  entities = entities.slice(0, limit);

  // Build search results
  const results: SearchResult[] = [];

  for (const entity of entities) {
    const result: SearchResult = {
      entity,
      relevance: entity.salienceScore || 0.5,
    };

    // Include facts if requested
    if (includeFacts) {
      result.facts = await resolver.getFacts(userId, entity.id);
    }

    // Include recent mentions if requested
    if (includeRecentMentions > 0) {
      const { getMentionsForEntity } = await import('../../entity-store/storage.js');
      result.recentMentions = await getMentionsForEntity(userId, entity.id, includeRecentMentions);
    }

    results.push(result);
  }

  return results;
}

/**
 * Get the unified query engine singleton
 */
export function getUnifiedQueryEngine(): UnifiedQueryEngine {
  if (!unifiedEngineInstance) {
    unifiedEngineInstance = {
      query: executeNaturalQuery,
      detectType: detectQueryType,
      isReady: () => true,
      search: searchImpl,
    };
  }
  return unifiedEngineInstance;
}

// Types QueryType, QueryOptions, and NaturalQueryResult are already exported inline above
