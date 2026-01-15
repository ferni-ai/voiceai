/**
 * LLM-Based Entity Extractor
 *
 * Uses Gemini to extract entities (people, places, events, concepts) from
 * conversation transcripts. This is the "hearing" part of superhuman memory -
 * we catch every person mentioned, every event discussed, every goal stated.
 *
 * @module memory/knowledge-graph/extractors/llm-entity-extractor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { EntityType } from '../../entity-store/types.js';

const log = createLogger({ module: 'LLMEntityExtractor' });

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedEntity {
  /** Name or identifier */
  name: string;
  /** Type of entity */
  type: EntityType;
  /** Relationship to user (if person) */
  relationship?: string;
  /** Any attributes extracted */
  attributes: Record<string, string | number | boolean>;
  /** Confidence score 0-1 */
  confidence: number;
  /** The text that mentioned this entity */
  sourceText: string;
}

export interface ExtractionContext {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Turn number */
  turnNumber: number;
  /** Current persona */
  personaId?: string;
  /** Recent conversation context */
  recentContext?: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  processingTimeMs: number;
  modelUsed: string;
}

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

const ENTITY_EXTRACTION_PROMPT = `You are an expert at understanding human relationships and extracting structured information from conversations.

Given a conversation turn, extract ALL entities mentioned:
- PEOPLE: Anyone mentioned (family, friends, colleagues, etc.)
- PLACES: Locations mentioned (cities, offices, homes, restaurants)
- EVENTS: Past or future events (meetings, birthdays, trips, surgeries)
- CONCEPTS: Abstract topics discussed (career, health, relationships)
- GOALS: Things the user wants to achieve
- COMMITMENTS: Promises or intentions stated

For each entity, determine:
1. The canonical name/identifier
2. The entity type
3. Relationship to user (for people)
4. Any attributes mentioned
5. Your confidence (0-1)

IMPORTANT:
- Extract relationship terms like "my brother", "my mom" as person entities
- If a name AND relationship are given ("my brother Mike"), combine them
- Capture contact info if mentioned (phone, email)
- Note temporal references ("next Tuesday", "last week")

Return JSON array of entities. Be thorough but only include entities actually mentioned.`;

const RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name or identifier of the entity' },
      type: {
        type: 'string',
        enum: [
          'person',
          'place',
          'event',
          'concept',
          'goal',
          'commitment',
          'dream',
          'value',
          'pattern',
          'memory',
        ],
      },
      relationship: { type: 'string', description: 'Relationship to user (for people)' },
      attributes: {
        type: 'object',
        description: 'Additional attributes extracted',
      },
      confidence: { type: 'number', description: 'Confidence 0-1' },
      sourceText: { type: 'string', description: 'Text that mentioned this entity' },
    },
    required: ['name', 'type', 'confidence', 'sourceText'],
  },
};

// ============================================================================
// EXTRACTOR
// ============================================================================

let geminiModel: unknown | null = null;

async function getGeminiModel() {
  if (geminiModel) return geminiModel;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      log.warn('No Gemini API key found, entity extraction disabled');
      return null;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.1, // Low temperature for structured extraction
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
      },
    });

    return geminiModel;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Gemini for entity extraction');
    return null;
  }
}

/**
 * Extract entities from a conversation transcript using LLM
 */
export async function extractEntities(
  transcript: string,
  context: ExtractionContext
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    const model = await getGeminiModel();

    if (!model) {
      // Fallback to rule-based extraction
      return {
        entities: extractEntitiesRuleBased(transcript),
        processingTimeMs: Date.now() - startTime,
        modelUsed: 'rule-based-fallback',
      };
    }

    // Build prompt with context
    const fullPrompt = `${ENTITY_EXTRACTION_PROMPT}

${context.recentContext ? `Recent conversation context:\n${context.recentContext}\n\n` : ''}Current turn to analyze:
"${transcript}"

Extract all entities as JSON array:`;

    // @ts-expect-error - Gemini SDK types are dynamic
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    let entities: ExtractedEntity[] = [];
    try {
      const parsed = JSON.parse(text);
      entities = Array.isArray(parsed) ? parsed : [];

      // Validate and clean entities
      entities = entities
        .filter((e) => e.name && e.type && e.confidence >= 0)
        .map((e) => ({
          name: String(e.name).trim(),
          type: validateEntityType(e.type),
          relationship: e.relationship ? String(e.relationship).trim() : undefined,
          attributes: e.attributes || {},
          confidence: Math.min(1, Math.max(0, Number(e.confidence) || 0.5)),
          sourceText: e.sourceText ? String(e.sourceText).trim() : transcript.slice(0, 100),
        }));
    } catch (parseError) {
      log.warn(
        { parseError: String(parseError), text },
        'Failed to parse entity extraction response'
      );
      entities = extractEntitiesRuleBased(transcript);
    }

    log.debug(
      {
        userId: context.userId,
        entityCount: entities.length,
        processingTimeMs: Date.now() - startTime,
      },
      'Extracted entities via LLM'
    );

    return {
      entities,
      processingTimeMs: Date.now() - startTime,
      modelUsed: 'gemini-1.5-flash',
    };
  } catch (error) {
    log.error({ error: String(error), userId: context.userId }, 'Entity extraction failed');

    return {
      entities: extractEntitiesRuleBased(transcript),
      processingTimeMs: Date.now() - startTime,
      modelUsed: 'rule-based-fallback',
    };
  }
}

/**
 * Validate entity type
 */
function validateEntityType(type: string): EntityType {
  const validTypes: EntityType[] = [
    'person',
    'place',
    'event',
    'concept',
    'goal',
    'commitment',
    'dream',
    'value',
    'pattern',
    'memory',
  ];
  return validTypes.includes(type as EntityType) ? (type as EntityType) : 'concept';
}

// ============================================================================
// RULE-BASED FALLBACK
// ============================================================================

const RELATIONSHIP_PATTERNS = [
  // Family
  {
    pattern: /\b(my|the)\s+(mother|mom|mama|mum)\b/i,
    type: 'person' as EntityType,
    relationship: 'mother',
  },
  {
    pattern: /\b(my|the)\s+(father|dad|papa|daddy)\b/i,
    type: 'person' as EntityType,
    relationship: 'father',
  },
  {
    pattern: /\b(my|the)\s+(brother|bro)\b/i,
    type: 'person' as EntityType,
    relationship: 'brother',
  },
  { pattern: /\b(my|the)\s+(sister|sis)\b/i, type: 'person' as EntityType, relationship: 'sister' },
  {
    pattern: /\b(my|the)\s+(wife|husband|partner|spouse)\b/i,
    type: 'person' as EntityType,
    relationship: 'partner',
  },
  {
    pattern: /\b(my|the)\s+(son|daughter|kid|child)\b/i,
    type: 'person' as EntityType,
    relationship: 'child',
  },
  {
    pattern: /\b(my|the)\s+(grandma|grandmother|grandpa|grandfather)\b/i,
    type: 'person' as EntityType,
    relationship: 'grandparent',
  },

  // Professional
  {
    pattern: /\b(my|the)\s+(boss|manager|supervisor)\b/i,
    type: 'person' as EntityType,
    relationship: 'boss',
  },
  {
    pattern: /\b(my|the)\s+(coworker|colleague|teammate)\b/i,
    type: 'person' as EntityType,
    relationship: 'colleague',
  },
  {
    pattern: /\b(my|the)\s+(doctor|therapist|counselor)\b/i,
    type: 'person' as EntityType,
    relationship: 'professional',
  },

  // Friends
  {
    pattern: /\b(my|a)\s+(friend|buddy|pal)\b/i,
    type: 'person' as EntityType,
    relationship: 'friend',
  },
  {
    pattern: /\b(my|the)\s+(best\s+friend)\b/i,
    type: 'person' as EntityType,
    relationship: 'best friend',
  },

  // Events
  { pattern: /\b(meeting|appointment|interview)\b/i, type: 'event' as EntityType },
  { pattern: /\b(birthday|wedding|funeral|ceremony)\b/i, type: 'event' as EntityType },
  { pattern: /\b(trip|vacation|holiday)\b/i, type: 'event' as EntityType },
  { pattern: /\b(surgery|operation|procedure)\b/i, type: 'event' as EntityType },

  // Goals/Commitments
  { pattern: /\bi\s+want\s+to\s+(.+?)(?:\.|,|$)/i, type: 'goal' as EntityType },
  { pattern: /\bi\s+need\s+to\s+(.+?)(?:\.|,|$)/i, type: 'commitment' as EntityType },
  { pattern: /\bi\s+have\s+to\s+(.+?)(?:\.|,|$)/i, type: 'commitment' as EntityType },
  { pattern: /\bi\s+should\s+(.+?)(?:\.|,|$)/i, type: 'commitment' as EntityType },
  { pattern: /\bi('ll|'m going to)\s+(.+?)(?:\.|,|$)/i, type: 'commitment' as EntityType },
];

const NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

/**
 * Rule-based entity extraction fallback
 */
function extractEntitiesRuleBased(transcript: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // Extract relationship mentions
  for (const { pattern, type, relationship } of RELATIONSHIP_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      const name = relationship || match[2] || match[0];
      const key = `${type}:${name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        entities.push({
          name,
          type,
          relationship,
          attributes: {},
          confidence: 0.7,
          sourceText: match[0],
        });
      }
    }
  }

  // Extract proper names (capitalized words)
  const nameMatches = transcript.match(NAME_PATTERN) || [];
  for (const name of nameMatches) {
    // Skip common false positives
    if (
      [
        'I',
        'The',
        'A',
        'An',
        'This',
        'That',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ].includes(name)
    ) {
      continue;
    }
    const key = `person:${name.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({
        name,
        type: 'person',
        attributes: {},
        confidence: 0.5,
        sourceText: name,
      });
    }
  }

  return entities;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { extractEntitiesRuleBased };
