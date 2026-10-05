/**
 * Firestore write payloads for deep-extraction persistence.
 *
 * Applies the same validation as vector docs, then runs cleanForFirestore so
 * undefined never reaches batch.set().
 *
 * @module memory/dynamic/extraction-firestore-docs
 */

import { createHash } from 'node:crypto';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { FallbackLogger } from '../../utils/safe-logger.js';
import type {
  DeepExtractionJob,
  ExtractionResult,
} from './deep-extraction-worker.js';
import { sanitizeExtractionResult } from './extraction-vector-docs.js';

type DebugLogger = Pick<FallbackLogger, 'debug'>;

export interface ExtractionFirestoreWritePayloads {
  entities: Record<string, unknown>[];
  facts: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  dropped: { entities: number; facts: number; relationships: number };
}

/**
 * One document per fact: the same (entity, key, value) always maps to the same
 * id, so re-extracting a fact updates it instead of adding a row (one scripted
 * call stored "sister | pregnancy = Pregnant" as 63 rows, 2026-10-04).
 */
export function factDocId(entityName: string, key: string, value: string): string {
  const norm = (s: string) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `f_${createHash('sha1').update(`${norm(entityName)}|${norm(key)}|${norm(value)}`).digest('hex').slice(0, 24)}`;
}

/**
 * Build Firestore-safe documents for dynamic_entities / dynamic_facts /
 * dynamic_relationships collections.
 */
export function buildExtractionFirestoreWritePayloads(
  userId: string,
  result: Pick<ExtractionResult, 'entities' | 'facts' | 'relationships'>,
  job: Pick<DeepExtractionJob, 'sessionId' | 'turnNumber'>,
  extractedAt: string,
  log: DebugLogger
): ExtractionFirestoreWritePayloads {
  const sanitized = sanitizeExtractionResult(result, userId, log);
  const base = {
    extractedAt,
    sessionId: job.sessionId,
    turnNumber: job.turnNumber,
    source: 'deep_extraction' as const,
    syncedToSpanner: false,
  };

  const entities = sanitized.entities.map((entity) =>
    cleanForFirestore({
      ...base,
      name: entity.name,
      type: entity.type,
      attributes: entity.attributes,
      confidence: entity.confidence,
    })
  );

  const facts = sanitized.facts.map((fact) =>
    cleanForFirestore({
      ...base,
      entityName: fact.entityName,
      factType: fact.factType,
      key: fact.key,
      value: fact.value,
      confidence: fact.confidence,
      temporalContext: fact.temporalContext,
    })
  );

  const relationships = sanitized.relationships.map((rel) =>
    cleanForFirestore({
      ...base,
      source: rel.source,
      target: rel.target,
      type: rel.type,
      strength: rel.strength,
      bidirectional: rel.bidirectional,
    })
  );

  return {
    entities,
    facts,
    relationships,
    dropped: sanitized.dropped,
  };
}
