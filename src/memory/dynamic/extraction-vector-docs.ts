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
import type { FallbackLogger } from '../../utils/safe-logger.js';
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
function isValidEntity(entity: unknown): entity is ExtractedEntity {
  if (entity === null || typeof entity !== 'object') return false;
  return isNonEmptyString((entity as ExtractedEntity).name);
}

/** Narrows an unknown item to `ExtractedFact` — requires `entityName`, `key`, and a defined `value`. */
function isValidFact(fact: unknown): fact is ExtractedFact {
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
function isValidRelationship(rel: unknown): rel is ExtractedRelationship {
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
export function buildExtractionVectorDocuments(
  userId: string,
  result: Pick<ExtractionResult, 'entities' | 'facts' | 'relationships'>,
  job: JobContext,
  timestamp: Date,
  log: DebugLogger
): VectorDocument[] {
  return [
    ...buildEntityDocs(userId, result.entities, job, timestamp, log),
    ...buildFactDocs(userId, result.facts, job, timestamp, log),
    ...buildRelationshipDocs(userId, result.relationships, job, timestamp, log),
  ];
}
