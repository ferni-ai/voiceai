/**
 * LLM-Based Relationship Extractor
 *
 * Extracts relationships between entities from conversation.
 * Relationships form the edges of the knowledge graph:
 * - "Mike is Sarah's brother" → Mike --sibling_of--> Sarah
 * - "I'm meeting with John tomorrow" → User --meets_with--> John
 * - "This relates to my career goal" → Event --relates_to--> Goal
 *
 * @module memory/knowledge-graph/extractors/llm-relationship-extractor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { EntityRelationship, EdgeType } from '../../entity-store/types.js';

const log = createLogger({ module: 'LLMRelationshipExtractor' });

// ============================================================================
// TYPES
// ============================================================================

export interface RelationshipExtractionInput {
  /** The transcript to analyze */
  transcript: string;
  /** Known entities to find relationships between */
  knownEntities: Array<{ id: string; name: string; type: string }>;
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
}

export interface ExtractedRelationship {
  /** Source entity ID */
  fromEntityId: string;
  /** Target entity ID */
  toEntityId: string;
  /** Source entity name (for display) */
  fromEntityName?: string;
  /** Target entity name (for display) */
  toEntityName?: string;
  /** Type of relationship */
  type: EdgeType;
  /** Human-readable label */
  label?: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Sentiment of relationship -1 to 1 */
  sentiment?: number;
}

export interface RelationshipExtractionResult {
  relationships: ExtractedRelationship[];
  processingTimeMs: number;
  modelUsed: string;
}

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

const RELATIONSHIP_EXTRACTION_PROMPT = `You are an expert at understanding relationships between people and entities.

Given a conversation and entities, identify relationships between them.

Relationship types:
- knows: General acquaintance
- family_of: Family relationship
- friend_of: Friendship
- works_with: Professional relationship
- reports_to: Manager relationship
- romantic_with: Romantic relationship
- interested_in: Interest in topic/activity
- worried_about: Concern
- wants: Desire/goal
- committed_to: Commitment
- values: Core value
- related_to: Generic relation
- causes: Causal relationship
- part_of: Hierarchical
- blocks: Conflict/obstacle
- enables: Dependency

Also identify:
- Sentiment: Is this relationship positive, negative, or neutral?
- Label: Specific description (e.g., "brother", "boss", "childhood friend")

Return JSON array of relationships. Only include relationships clearly stated or strongly implied.`;

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
    log.error({ error: String(error) }, 'Failed to initialize Gemini for relationship extraction');
    return null;
  }
}

/**
 * Extract relationships between entities from transcript
 */
export async function extractRelationships(
  input: RelationshipExtractionInput
): Promise<RelationshipExtractionResult> {
  const startTime = Date.now();

  try {
    const model = await getGeminiModel();

    if (!model || input.knownEntities.length < 2) {
      return {
        relationships: extractRelationshipsRuleBased(input.transcript, input.knownEntities),
        processingTimeMs: Date.now() - startTime,
        modelUsed: 'rule-based-fallback',
      };
    }

    const entityList = input.knownEntities
      .map((e) => `- ${e.name} (${e.type}, id: ${e.id})`)
      .join('\n');

    const fullPrompt = `${RELATIONSHIP_EXTRACTION_PROMPT}

Known entities:
${entityList}

Conversation to analyze:
"${input.transcript}"

Extract relationships as JSON array with: fromEntityId, toEntityId, type, label, confidence (0-1), sentiment (-1 to 1):`;

    // @ts-expect-error - Gemini SDK types are dynamic
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    let relationships: ExtractedRelationship[] = [];
    try {
      const parsed = JSON.parse(text);
      relationships = Array.isArray(parsed) ? parsed : [];

      // Validate and clean relationships
      relationships = relationships
        .filter((r) => {
          // Validate entities exist
          const fromEntity = input.knownEntities.find(
            (e) =>
              e.id === r.fromEntityId ||
              e.name.toLowerCase() === (r.fromEntityName || r.fromEntityId || '').toLowerCase()
          );
          const toEntity = input.knownEntities.find(
            (e) =>
              e.id === r.toEntityId ||
              e.name.toLowerCase() === (r.toEntityName || r.toEntityId || '').toLowerCase()
          );
          return fromEntity && toEntity;
        })
        .map((r) => {
          // Resolve entity names to IDs
          const fromEntity = input.knownEntities.find(
            (e) =>
              e.id === r.fromEntityId ||
              e.name.toLowerCase() === (r.fromEntityName || r.fromEntityId || '').toLowerCase()
          );
          const toEntity = input.knownEntities.find(
            (e) =>
              e.id === r.toEntityId ||
              e.name.toLowerCase() === (r.toEntityName || r.toEntityId || '').toLowerCase()
          );

          return {
            fromEntityId: fromEntity!.id,
            toEntityId: toEntity!.id,
            type: validateEdgeType(r.type),
            label: r.label ? String(r.label).trim() : undefined,
            confidence: Math.min(1, Math.max(0, Number(r.confidence) || 0.7)),
            sentiment:
              r.sentiment !== undefined
                ? Math.min(1, Math.max(-1, Number(r.sentiment)))
                : undefined,
          };
        });
    } catch (parseError) {
      log.warn(
        { parseError: String(parseError) },
        'Failed to parse relationship extraction response'
      );
      relationships = extractRelationshipsRuleBased(input.transcript, input.knownEntities);
    }

    log.debug(
      {
        userId: input.userId,
        relationshipCount: relationships.length,
        processingTimeMs: Date.now() - startTime,
      },
      'Extracted relationships via LLM'
    );

    return {
      relationships,
      processingTimeMs: Date.now() - startTime,
      modelUsed: 'gemini-1.5-flash',
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Relationship extraction failed');
    return {
      relationships: extractRelationshipsRuleBased(input.transcript, input.knownEntities),
      processingTimeMs: Date.now() - startTime,
      modelUsed: 'rule-based-fallback',
    };
  }
}

/**
 * Validate edge type
 */
function validateEdgeType(type: string): EdgeType {
  const validTypes: EdgeType[] = [
    'knows',
    'family_of',
    'friend_of',
    'works_with',
    'reports_to',
    'romantic_with',
    'interested_in',
    'worried_about',
    'wants',
    'committed_to',
    'values',
    'related_to',
    'causes',
    'part_of',
    'blocks',
    'enables',
  ];
  return validTypes.includes(type as EdgeType) ? (type as EdgeType) : 'related_to';
}

// ============================================================================
// RULE-BASED FALLBACK
// ============================================================================

const RELATIONSHIP_PATTERNS = [
  // Family
  {
    pattern: /(\w+)(?:'s|is\s+(?:my|the))\s+(mother|father|brother|sister|son|daughter)/i,
    type: 'family_of' as EdgeType,
  },
  {
    pattern: /(\w+)\s+and\s+(\w+)\s+are\s+(?:siblings|brothers|sisters)/i,
    type: 'family_of' as EdgeType,
  },

  // Friends
  { pattern: /(\w+)\s+(?:is\s+)?(?:my|a)\s+friend/i, type: 'friend_of' as EdgeType },
  { pattern: /(\w+)\s+and\s+(\w+)\s+are\s+friends/i, type: 'friend_of' as EdgeType },

  // Work
  { pattern: /(\w+)\s+works\s+with\s+(\w+)/i, type: 'works_with' as EdgeType },
  { pattern: /(\w+)\s+is\s+(\w+)'s\s+boss/i, type: 'reports_to' as EdgeType },
  { pattern: /(\w+)\s+reports\s+to\s+(\w+)/i, type: 'reports_to' as EdgeType },

  // Romantic
  { pattern: /(\w+)\s+is\s+dating\s+(\w+)/i, type: 'romantic_with' as EdgeType },
  { pattern: /(\w+)\s+is\s+(?:married|engaged)\s+to\s+(\w+)/i, type: 'romantic_with' as EdgeType },
];

/**
 * Rule-based relationship extraction fallback
 */
function extractRelationshipsRuleBased(
  transcript: string,
  entities: Array<{ id: string; name: string; type: string }>
): ExtractedRelationship[] {
  const relationships: ExtractedRelationship[] = [];

  for (const { pattern, type } of RELATIONSHIP_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      // Try to match names to known entities
      const name1 = match[1];
      const name2 = match[2];

      const entity1 = entities.find((e) => e.name.toLowerCase() === name1?.toLowerCase());
      const entity2 = entities.find((e) => e.name.toLowerCase() === name2?.toLowerCase());

      if (entity1 && entity2) {
        relationships.push({
          fromEntityId: entity1.id,
          toEntityId: entity2.id,
          type,
          label: match[0],
          confidence: 0.6,
        });
      }
    }
  }

  return relationships;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { extractRelationshipsRuleBased };
