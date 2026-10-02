/**
 * LLM steps of deep extraction: entities, facts, relationships and a
 * self-questioning refinement pass (Mem0 / ProMem patterns).
 *
 * Every step degrades instead of throwing: no model -> hint-based entities and
 * no facts; a failed call -> the previous step's result.
 *
 * @module memory/dynamic/extraction-llm
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  ENTITY_EXTRACTION_PROMPT,
  FACT_EXTRACTION_PROMPT,
  RELATIONSHIP_EXTRACTION_PROMPT,
  SELF_QUESTIONING_PROMPT,
} from './extraction-prompts.js';
import type { EntityMention } from './fast-capture.js';

const log = createLogger({ module: 'DeepExtractionLLM' });

export interface ExtractedEntity {
  name: string;
  type: 'person' | 'place' | 'organization' | 'event' | 'concept' | 'thing';
  attributes: Record<string, string>;
  confidence: number;
}

export interface ExtractedFact {
  entityName: string;
  factType: 'attribute' | 'event' | 'relationship' | 'state' | 'preference';
  key: string;
  value: string;
  confidence: number;
  temporalContext?: string;
}

export interface ExtractedRelationship {
  source: string;
  target: string;
  type: string;
  strength: number;
  bidirectional: boolean;
}

export interface ExtractionDraft {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  relationships: ExtractedRelationship[];
}

/** Text in, text out: the slice of a generative model extraction needs. */
export type GenerateText = (prompt: string) => Promise<string>;

export interface ExtractionHints {
  mentionedEntities: EntityMention[];
  topicHints: string[];
}

export function parseJsonArray<T>(text: string): T[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed: unknown = JSON.parse(match[0]);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function parseJsonObject<T>(text: string): T | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

export function fallbackEntities(hints: ExtractionHints): ExtractedEntity[] {
  return hints.mentionedEntities.map((m) => ({
    name: m.name,
    type: m.type as ExtractedEntity['type'],
    attributes: {},
    confidence: m.confidence,
  }));
}

/**
 * Run the extraction steps. `transcriptBlock` is the already formatted
 * transcript (user turn, optionally with the preceding assistant turn).
 */
export async function runExtraction(
  generate: GenerateText | null,
  transcriptBlock: string,
  hints: ExtractionHints
): Promise<ExtractionDraft> {
  if (!generate) {
    return { entities: fallbackEntities(hints), facts: [], relationships: [] };
  }

  let entities: ExtractedEntity[];
  try {
    const text = await generate(`${ENTITY_EXTRACTION_PROMPT}

Hints from fast extraction (may be incomplete):
- Detected entities: ${JSON.stringify(hints.mentionedEntities)}
- Topics: ${hints.topicHints.join(', ')}

Transcript:
${transcriptBlock}

Extract entities as JSON array:`);
    entities = parseJsonArray<ExtractedEntity>(text);
  } catch (error) {
    log.warn({ error: String(error) }, 'LLM entity extraction failed, using hints');
    entities = fallbackEntities(hints);
  }

  const entityList = entities.map((e) => `${e.name} (${e.type})`).join('\n');
  let facts: ExtractedFact[] = [];
  if (entities.length > 0) {
    try {
      facts = parseJsonArray<ExtractedFact>(
        await generate(`${FACT_EXTRACTION_PROMPT}

Entities found:
${entityList}

Transcript:
${transcriptBlock}

Extract facts as JSON array:`)
      );
    } catch (error) {
      log.warn({ error: String(error) }, 'LLM fact extraction failed');
    }
  }

  let relationships: ExtractedRelationship[] = [];
  if (entities.length >= 2) {
    try {
      relationships = parseJsonArray<ExtractedRelationship>(
        await generate(`${RELATIONSHIP_EXTRACTION_PROMPT}

Entities found:
${entityList}

Transcript:
${transcriptBlock}

Extract relationships as JSON array:`)
      );
    } catch (error) {
      log.warn({ error: String(error) }, 'LLM relationship extraction failed');
    }
  }

  const current = { entities, facts, relationships };
  try {
    const refined = parseJsonObject<Partial<ExtractionDraft>>(
      await generate(`${SELF_QUESTIONING_PROMPT}

Current extraction:
Entities: ${JSON.stringify(entities)}
Facts: ${JSON.stringify(facts)}
Relationships: ${JSON.stringify(relationships)}

Original transcript:
${transcriptBlock}

Return refined extraction as JSON with: entities, facts, relationships arrays:`)
    );
    return {
      entities: Array.isArray(refined?.entities) ? refined.entities : current.entities,
      facts: Array.isArray(refined?.facts) ? refined.facts : current.facts,
      relationships: Array.isArray(refined?.relationships)
        ? refined.relationships
        : current.relationships,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Self-questioning refinement failed');
    return current;
  }
}
