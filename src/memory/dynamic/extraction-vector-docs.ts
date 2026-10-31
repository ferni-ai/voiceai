/**
 * Build Firestore-safe vector documents from deep-extraction results.
 *
 * LLM extraction output is untyped at the JSON boundary (`parseJsonArray`
 * casts raw JSON to `T[]`), so fields the type declares as required can
 * come back missing or of the wrong shape. This module is the single place
 * that turns raw `ExtractionResult` entities, facts, and relationships into
 * `VectorDocument`s: it validates each item, drops anything malformed (with
 * a debug log) instead of throwing, and sanitizes every generated Firestore
 * document id so free text (which can contain "/") never produces an
 * invalid path.
 *
 * @module memory/dynamic/extraction-vector-docs
 */

import { sanitizeFirestoreDocId } from '../../utils/firestore-utils.js';
import { isCallerName } from '../domain/person-key.js';
import { entityHygieneOn, isPersonaSubject } from '../entity-hygiene.js';
import { peopleOf } from '../recall/people.js';
import { withoutSpokenCredentials } from '../spoken-credential.js';
import { createLogger, type FallbackLogger } from '../../utils/safe-logger.js';
import type { VectorDocument } from '../vector-store-interface.js';
import type {
  DeepExtractionJob,
  ExtractedEntity,
  ExtractedFact,
  ExtractedRelationship,
  ExtractionResult,
} from './deep-extraction-worker.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Narrows an unknown item to `ExtractedEntity` — requires a non-empty `name`. */
export function isValidEntity(entity: unknown): entity is ExtractedEntity {
  if (entity === null || typeof entity !== 'object') return false;
  return isNonEmptyString((entity as ExtractedEntity).name);
}

/** Narrows an unknown item to `ExtractedFact` — requires `entityName`, `key`, and a defined `value`. */
export function isValidFact(fact: unknown): fact is ExtractedFact {
  if (fact === null || typeof fact !== 'object') return false;
  const f = fact as ExtractedFact;
  return (
    isNonEmptyString(f.entityName) &&
    isNonEmptyString(f.key) &&
    f.value !== undefined &&
    f.value !== null
  );
}

/** Narrows an unknown item to `ExtractedRelationship` — requires `source` and `target`. */
export function isValidRelationship(rel: unknown): rel is ExtractedRelationship {
  if (rel === null || typeof rel !== 'object') return false;
  const r = rel as ExtractedRelationship;
  return isNonEmptyString(r.source) && isNonEmptyString(r.target);
}

type JobContext = Pick<DeepExtractionJob, 'personaId' | 'sessionId' | 'turnNumber'>;
type DebugLogger = Pick<FallbackLogger, 'debug'>;

function buildEntityDocs(
  userId: string,
  entities: ExtractedEntity[],
  job: JobContext,
  timestamp: Date,
  log: DebugLogger
): VectorDocument[] {
  const docs: VectorDocument[] = [];

  for (const entity of entities) {
    if (!isValidEntity(entity)) {
      log.debug(
        { userId, entity },
        '🧠 [MEMORY-AUDIT] Dropping malformed extracted entity (missing name)'
      );
      continue;
    }

    const attributes =
      typeof entity.attributes === 'object' && entity.attributes !== null ? entity.attributes : {};
    const attributeText = Object.entries(attributes)
      .map(([k, v]) => `${k}: ${v}`)
      .join('. ');

    const searchableText = [
      `${entity.name} (${entity.type})`,
      attributeText,
      `Mentioned in conversation with ${job.personaId || 'Ferni'}`,
    ]
      .filter(Boolean)
      .join('. ');

    const idKey = sanitizeFirestoreDocId(entity.name.toLowerCase().replace(/\s+/g, '-'));
    docs.push({
      id: `entity-${userId}-${idKey}-${Date.now()}`,
      text: searchableText,
      metadata: {
        source: 'deep_extraction',
        userId,
        category: 'entity',
        entityName: entity.name,
        entityType: entity.type,
        sessionId: job.sessionId,
        turnNumber: job.turnNumber,
        timestamp,
        confidence: entity.confidence,
      },
    });
  }

  return docs;
}

function buildFactDocs(
  userId: string,
  facts: ExtractedFact[],
  job: JobContext,
  timestamp: Date,
  log: DebugLogger
): VectorDocument[] {
  const docs: VectorDocument[] = [];

  for (const fact of facts) {
    if (!isValidFact(fact)) {
      log.debug(
        { userId, fact },
        '🧠 [MEMORY-AUDIT] Dropping malformed extracted fact (missing entityName/key/value)'
      );
      continue;
    }

    const searchableText = [
      `${fact.entityName}: ${fact.key} is ${fact.value}`,
      fact.temporalContext ? `(${fact.temporalContext})` : '',
      `Type: ${fact.factType}`,
    ]
      .filter(Boolean)
      .join('. ');

    const idKey = sanitizeFirestoreDocId(
      `${fact.entityName.toLowerCase().replace(/\s+/g, '-')}-${fact.key}`
    );
    docs.push({
      id: `fact-${userId}-${idKey}-${Date.now()}`,
      text: searchableText,
      metadata: {
        source: 'deep_extraction',
        userId,
        category: 'fact',
        entityName: fact.entityName,
        factType: fact.factType,
        factKey: fact.key,
        factValue: fact.value,
        sessionId: job.sessionId,
        turnNumber: job.turnNumber,
        timestamp,
        confidence: fact.confidence,
      },
    });
  }

  return docs;
}

function buildRelationshipDocs(
  userId: string,
  relationships: ExtractedRelationship[],
  job: JobContext,
  timestamp: Date,
  log: DebugLogger
): VectorDocument[] {
  const docs: VectorDocument[] = [];

  for (const rel of relationships) {
    if (!isValidRelationship(rel)) {
      log.debug(
        { userId, rel },
        '🧠 [MEMORY-AUDIT] Dropping malformed extracted relationship (missing source/target)'
      );
      continue;
    }

    const searchableText = [
      `${rel.source} ${rel.type} ${rel.target}`,
      rel.bidirectional ? '(bidirectional relationship)' : '',
      `Relationship strength: ${rel.strength}`,
    ]
      .filter(Boolean)
      .join('. ');

    const idKey = sanitizeFirestoreDocId(`${rel.source.toLowerCase()}-${rel.target.toLowerCase()}`);
    docs.push({
      id: `rel-${userId}-${idKey}-${Date.now()}`,
      text: searchableText,
      metadata: {
        source: 'deep_extraction',
        userId,
        category: 'relationship',
        sourceEntity: rel.source,
        targetEntity: rel.target,
        relationType: rel.type,
        sessionId: job.sessionId,
        turnNumber: job.turnNumber,
        timestamp,
        strength: rel.strength,
      },
    });
  }

  return docs;
}

/**
 * Build the vector documents for one deep-extraction job's entities, facts,
 * and relationships. Items that don't match their declared shape (a common
 * occurrence with LLM JSON output) are dropped and logged at debug level —
 * this function never throws on malformed input.
 */
export interface SanitizedExtractionSlice {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  relationships: ExtractedRelationship[];
  dropped: { entities: number; facts: number; relationships: number };
  /** Facts about a persona (Ferni, or a teammate the caller never tied to themself), not stored. */
  droppedPersona: number;
}

const personaLog = createLogger({ module: 'extraction-persona-filter' });

/**
 * What this result says each name is to the caller (right-moment memory §5.3, ruling 6):
 * an entity's `attributes.relationship`, the type of a relationship row between the name
 * and the caller, or a fact that states it ("Maya | relation to user = User's coworker",
 * the only form the after-call sweep writes). Keyed by lower-cased name.
 */
function statedRelations(
  entities: readonly ExtractedEntity[],
  facts: readonly ExtractedFact[],
  rows: readonly unknown[]
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (name: string, relation: unknown): void => {
    if (typeof relation !== 'string' || relation.trim() === '') return;
    const key = name.trim().toLowerCase();
    out.set(key, [...(out.get(key) ?? []), relation]);
  };
  for (const e of entities) add(e.name, e.attributes.relationship);
  for (const row of rows) {
    if (!isValidRelationship(row)) continue;
    if (isCallerName(row.source)) add(row.target, row.type);
    else if (isCallerName(row.target)) add(row.source, row.type);
  }
  const said = facts.map((f) => ({
    entity: f.entityName,
    key: f.key,
    value: f.value,
    confidence: f.confidence,
  }));
  for (const person of peopleOf(said)) add(person.name, person.relation);
  return out;
}

/**
 * With ENTITY_HYGIENE on, drops facts and entity rows whose subject is persona canon: the
 * extractor reads Ferni's side of the call too, so "I live in Wyoming" came back as a fact
 * about Ferni in the caller's memory. A name with no stated relation resolves toward
 * dropping (ruling 6); the count is logged so the cost of that is visible.
 */
function withoutPersonaSubjects(
  slice: { entities: ExtractedEntity[]; facts: ExtractedFact[] },
  rows: readonly unknown[],
  userId: string,
  writer: string | null
): { entities: ExtractedEntity[]; facts: ExtractedFact[]; droppedPersona: number } {
  if (!entityHygieneOn()) return { ...slice, droppedPersona: 0 };
  const relations = statedRelations(slice.entities, slice.facts, rows);
  const persona = (name: string): boolean => {
    const stated = relations.get(name.trim().toLowerCase()) ?? [];
    return stated.length === 0
      ? isPersonaSubject(name)
      : stated.every((relation) => isPersonaSubject(name, relation));
  };
  const entities = slice.entities.filter((e) => !persona(e.name));
  const facts = slice.facts.filter((f) => !persona(f.entityName));
  const droppedPersona = slice.facts.length - facts.length;
  const droppedEntities = slice.entities.length - entities.length;
  // `writer` null: the vector-doc pass over a result the Firestore pass already counted.
  if (writer !== null && droppedPersona + droppedEntities > 0) {
    personaLog.info(
      {
        event: 'PERSONA_FACT_DROPPED',
        reason: 'persona',
        writer,
        userId: userId.slice(0, 8),
        count: droppedPersona,
        entities: droppedEntities,
      },
      "Persona facts not stored as the caller's"
    );
  }
  return { entities, facts, droppedPersona };
}

/**
 * Validate and normalize extraction items before any Firestore write.
 * Malformed LLM JSON is dropped with a debug log (same rules as vector docs).
 * With SPOKEN_CREDENTIAL_FILTER on, a fact holding a credential is dropped too
 * (memory/spoken-credential.ts), counted under `writer` (null: the caller that
 * sanitizes the same result for Firestore counts it). With ENTITY_HYGIENE on, facts about
 * a persona are dropped as well (`withoutPersonaSubjects`).
 */
export function sanitizeExtractionResult(
  result: Pick<ExtractionResult, 'entities' | 'facts' | 'relationships'>,
  userId: string,
  log: DebugLogger,
  writer: string | null = 'extraction'
): SanitizedExtractionSlice {
  const entities: ExtractedEntity[] = [];
  let droppedEntities = 0;
  for (const entity of result.entities) {
    if (!isValidEntity(entity)) {
      droppedEntities++;
      log.debug(
        { userId, entity },
        '🧠 [MEMORY-AUDIT] Dropping malformed extracted entity (missing name)'
      );
      continue;
    }
    const attributes =
      typeof entity.attributes === 'object' && entity.attributes !== null ? entity.attributes : {};
    entities.push({
      name: entity.name.trim(),
      type: entity.type ?? 'thing',
      attributes,
      confidence: confidenceNumber(entity.confidence),
    });
  }

  const facts: ExtractedFact[] = [];
  let droppedFacts = 0;
  for (const fact of result.facts) {
    if (!isValidFact(fact)) {
      droppedFacts++;
      log.debug(
        { userId, fact },
        '🧠 [MEMORY-AUDIT] Dropping malformed extracted fact (missing entityName/key/value)'
      );
      continue;
    }
    facts.push({
      entityName: fact.entityName.trim(),
      factType: fact.factType ?? 'attribute',
      key: fact.key.trim(),
      value: String(fact.value),
      confidence: confidenceNumber(fact.confidence),
      temporalContext: fact.temporalContext,
    });
  }

  const relationships: ExtractedRelationship[] = [];
  let droppedRelationships = 0;
  for (const rel of result.relationships) {
    if (!isValidRelationship(rel)) {
      droppedRelationships++;
      log.debug(
        { userId, rel },
        '🧠 [MEMORY-AUDIT] Dropping malformed extracted relationship (missing source/target)'
      );
      continue;
    }
    relationships.push({
      source: rel.source.trim(),
      target: rel.target.trim(),
      type: typeof rel.type === 'string' ? rel.type : 'related_to',
      strength: typeof rel.strength === 'number' ? rel.strength : 0.5,
      bidirectional: Boolean(rel.bidirectional),
    });
  }

  const real = withoutPersonaSubjects({ entities, facts }, result.relationships, userId, writer);
  return {
    entities: real.entities,
    facts: withoutSpokenCredentials(real.facts, writer),
    relationships,
    dropped: {
      entities: droppedEntities,
      facts: droppedFacts,
      relationships: droppedRelationships,
    },
    droppedPersona: real.droppedPersona,
  };
}

export function buildExtractionVectorDocuments(
  userId: string,
  result: Pick<ExtractionResult, 'entities' | 'facts' | 'relationships'>,
  job: JobContext,
  timestamp: Date,
  log: DebugLogger
): VectorDocument[] {
  const sanitized = sanitizeExtractionResult(result, userId, log, null);
  return [
    ...buildEntityDocs(userId, sanitized.entities, job, timestamp, log),
    ...buildFactDocs(userId, sanitized.facts, job, timestamp, log),
    ...buildRelationshipDocs(userId, sanitized.relationships, job, timestamp, log),
  ];
}

/** The extractor sometimes writes "high"/"medium"/"low" instead of a number. */
const WORD_CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };
function confidenceNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return WORD_CONFIDENCE[raw.trim().toLowerCase()] ?? 0.5;
  return 0.5;
}
