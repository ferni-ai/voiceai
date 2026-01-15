/**
 * LLM-Based Fact Extractor
 *
 * Extracts facts about entities from conversation transcripts.
 * Facts are atomic pieces of information like:
 * - "Mike's birthday is March 15"
 * - "Sarah works at Google"
 * - "Mom is retiring next month"
 *
 * @module memory/knowledge-graph/extractors/llm-fact-extractor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ExtractedFact } from '../../entity-store/types.js';

const log = createLogger({ module: 'LLMFactExtractor' });

// ============================================================================
// TYPES
// ============================================================================

export interface FactExtractionInput {
  /** The transcript to analyze */
  transcript: string;
  /** Known entities to find facts about */
  knownEntities: Array<{ id: string; name: string; type: string }>;
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
}

export interface FactExtractionResult {
  facts: ExtractedFact[];
  processingTimeMs: number;
  modelUsed: string;
}

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

const FACT_EXTRACTION_PROMPT = `You are an expert at extracting factual information about people and entities from conversation.

Given a conversation and a list of entities, extract any NEW FACTS learned about each entity.

Facts should be:
- Atomic (one piece of information per fact)
- Specific (includes details mentioned)
- Verifiable (something concrete, not opinion)

Fact types:
- attribute: A property of the entity (birthday, job, location)
- event: Something that happened or will happen to them
- relationship: How they relate to another entity
- state: Current state or situation

Examples:
- "Mike's having surgery next week" → type: event, key: surgery, value: next week
- "My mom lives in Chicago" → type: attribute, key: location, value: Chicago
- "Sarah got a promotion" → type: event, key: promotion, value: received promotion
- "He's my brother's friend" → type: relationship, key: connection, value: brother's friend

Return JSON array of facts. Only include facts actually stated, not inferences.`;

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
      return null;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
      },
    });

    return geminiModel;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Gemini for fact extraction');
    return null;
  }
}

/**
 * Extract facts about known entities from transcript
 */
export async function extractFacts(input: FactExtractionInput): Promise<FactExtractionResult> {
  const startTime = Date.now();

  try {
    const model = await getGeminiModel();

    if (!model) {
      return {
        facts: extractFactsRuleBased(input.transcript, input.knownEntities),
        processingTimeMs: Date.now() - startTime,
        modelUsed: 'rule-based-fallback',
      };
    }

    const entityList = input.knownEntities.map((e) => `- ${e.name} (${e.type})`).join('\n');

    const fullPrompt = `${FACT_EXTRACTION_PROMPT}

Known entities:
${entityList}

Conversation to analyze:
"${input.transcript}"

Extract facts as JSON array with: entityId, type (attribute/event/relationship/state), key, value, confidence (0-1):`;

    // @ts-expect-error - Gemini SDK types are dynamic
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    let facts: ExtractedFact[] = [];
    try {
      const parsed = JSON.parse(text);
      facts = Array.isArray(parsed) ? parsed : [];

      // Map entity names to IDs and validate
      facts = facts
        .filter((f) => f.type && f.key && f.value)
        .map((f) => {
          // Find matching entity by name or ID
          const entity = input.knownEntities.find(
            (e) =>
              e.id === f.entityId ||
              e.name.toLowerCase() === (f.entityName || f.entityId || '').toLowerCase()
          );

          return {
            type: validateFactType(f.type),
            key: String(f.key).trim(),
            value: String(f.value).trim(),
            confidence: Math.min(1, Math.max(0, Number(f.confidence) || 0.7)),
            entityId: entity?.id,
          };
        })
        .filter((f) => f.entityId); // Only keep facts with valid entity references
    } catch (parseError) {
      log.warn({ parseError: String(parseError) }, 'Failed to parse fact extraction response');
      facts = extractFactsRuleBased(input.transcript, input.knownEntities);
    }

    log.debug(
      { userId: input.userId, factCount: facts.length, processingTimeMs: Date.now() - startTime },
      'Extracted facts via LLM'
    );

    return {
      facts,
      processingTimeMs: Date.now() - startTime,
      modelUsed: 'gemini-1.5-flash',
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Fact extraction failed');
    return {
      facts: extractFactsRuleBased(input.transcript, input.knownEntities),
      processingTimeMs: Date.now() - startTime,
      modelUsed: 'rule-based-fallback',
    };
  }
}

/**
 * Validate fact type
 */
function validateFactType(type: string): ExtractedFact['type'] {
  const validTypes = ['attribute', 'event', 'relationship', 'state'] as const;
  return validTypes.includes(type as (typeof validTypes)[number])
    ? (type as ExtractedFact['type'])
    : 'attribute';
}

// ============================================================================
// RULE-BASED FALLBACK
// ============================================================================

const FACT_PATTERNS = [
  // Contact info
  { pattern: /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/g, key: 'phone', type: 'attribute' as const },
  {
    pattern: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g,
    key: 'email',
    type: 'attribute' as const,
  },

  // Dates
  { pattern: /birthday\s+(?:is\s+)?(\w+\s+\d+)/i, key: 'birthday', type: 'attribute' as const },
  { pattern: /born\s+(?:on\s+)?(\w+\s+\d+)/i, key: 'birthday', type: 'attribute' as const },

  // Location
  {
    pattern: /lives?\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    key: 'location',
    type: 'attribute' as const,
  },
  {
    pattern: /from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    key: 'origin',
    type: 'attribute' as const,
  },

  // Occupation
  {
    pattern: /works?\s+(?:at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    key: 'employer',
    type: 'attribute' as const,
  },
  {
    pattern: /(?:is\s+a|works\s+as)\s+(\w+(?:\s+\w+)?)/i,
    key: 'occupation',
    type: 'attribute' as const,
  },

  // Events
  {
    pattern: /(surgery|operation|procedure)\s+(?:is\s+)?(\w+)/i,
    key: 'medical',
    type: 'event' as const,
  },
  {
    pattern: /(wedding|married|getting\s+married)\s+(?:on\s+)?(\w+)?/i,
    key: 'wedding',
    type: 'event' as const,
  },
  { pattern: /(retiring|retired)/i, key: 'retirement', type: 'event' as const },
  { pattern: /(promotion|promoted|got\s+a\s+raise)/i, key: 'career', type: 'event' as const },
];

/**
 * Rule-based fact extraction fallback
 */
function extractFactsRuleBased(
  transcript: string,
  entities: Array<{ id: string; name: string; type: string }>
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  for (const { pattern, key, type } of FACT_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      // Try to associate with an entity mentioned nearby
      const entity = findNearestEntity(transcript, match.index || 0, entities);
      if (entity) {
        facts.push({
          type,
          key,
          value: match[1] || match[0],
          confidence: 0.6,
          entityId: entity.id,
        });
      }
    }
  }

  return facts;
}

/**
 * Find entity mentioned closest to a position in text
 */
function findNearestEntity(
  transcript: string,
  position: number,
  entities: Array<{ id: string; name: string; type: string }>
): { id: string; name: string } | null {
  let nearest: { id: string; name: string; distance: number } | null = null;

  for (const entity of entities) {
    const nameIndex = transcript.toLowerCase().indexOf(entity.name.toLowerCase());
    if (nameIndex >= 0) {
      const distance = Math.abs(nameIndex - position);
      if (!nearest || distance < nearest.distance) {
        nearest = { id: entity.id, name: entity.name, distance };
      }
    }
  }

  return nearest ? { id: nearest.id, name: nearest.name } : null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { extractFactsRuleBased };
