/**
 * Persists one deep-extraction result: upserts facts, entities and
 * relationships under deterministic ids (fact-store.ts), records extraction
 * metadata, and indexes what changed in the vector store.
 *
 * Vector documents use the same deterministic ids, so re-learning a fact
 * replaces its vector instead of adding another; tombstoned and user-edited
 * facts are never re-indexed by extraction.
 *
 * @module memory/dynamic/extraction-persistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreVectorStore } from '../firestore-vector-store/index.js';
import type { VectorDocument } from '../vector-store-interface.js';
import { entityIdFor, factIdForExtracted, relationshipIdFor } from './fact-identity.js';
import {
  emptySummary,
  upsertEntities,
  upsertFacts,
  upsertRelationships,
  type FactProvenance,
  type StorableEntity,
  type StorableFact,
  type StorableRelationship,
  type UpsertSummary,
} from './fact-store.js';
import { USERS_COLLECTION, type FirestoreLike } from './firestore-shapes.js';

const log = createLogger({ module: 'ExtractionPersistence' });

export interface PersistableExtraction {
  entities: StorableEntity[];
  facts: StorableFact[];
  relationships: StorableRelationship[];
  categories: string[];
  importanceScore: number;
}

export interface PersistJobInfo extends FactProvenance {
  jobId: string;
  transcript: string;
}

/**
 * Write an extraction. Throws when Firestore writes fail, so the durable
 * queue retries the job (upserts are idempotent, so a retry is safe).
 */
export async function persistExtraction(
  db: FirestoreLike,
  userId: string,
  result: PersistableExtraction,
  job: PersistJobInfo
): Promise<UpsertSummary> {
  const summary = emptySummary();
  await upsertEntities(db, userId, result.entities, job, summary);
  await upsertFacts(db, userId, result.facts, job, summary);
  await upsertRelationships(db, userId, result.relationships, job, summary);

  await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection('extraction_history')
    .doc(job.jobId.replace(/\//g, '_'))
    .set({
      jobId: job.jobId,
      sessionId: job.sessionId,
      ...(job.conversationId ? { conversationId: job.conversationId } : {}),
      turnNumber: job.turnNumber,
      transcript: job.transcript.slice(0, 500),
      entityCount: result.entities.length,
      factCount: result.facts.length,
      relationshipCount: result.relationships.length,
      factsCreated: summary.created,
      factsUpdated: summary.updated,
      skippedTombstoned: summary.tombstoned,
      categories: result.categories,
      importanceScore: result.importanceScore,
      extractedAt: new Date().toISOString(),
    });

  log.debug({ userId, ...summary, writtenIds: summary.writtenIds.length }, 'Persisted extraction');

  await indexInVectorStore(userId, result, job, new Set(summary.writtenIds));
  return summary;
}

/** Index changed items for semantic search. Non-blocking: failures are logged. */
async function indexInVectorStore(
  userId: string,
  result: PersistableExtraction,
  job: PersistJobInfo,
  written: ReadonlySet<string>
): Promise<void> {
  if (written.size === 0) return;
  try {
    const vectorStore = getFirestoreVectorStore();
    if (!vectorStore) return;
    await vectorStore.initialize();

    const timestamp = new Date();
    const common = {
      source: 'deep_extraction',
      userId,
      sessionId: job.sessionId,
      ...(job.conversationId ? { conversationId: job.conversationId } : {}),
      turnNumber: job.turnNumber,
      timestamp,
    };
    const docs: VectorDocument[] = [];

    for (const entity of result.entities) {
      const id = entityIdFor(entity.name, entity.type);
      if (!written.has(id)) continue;
      const attributeText = Object.entries(entity.attributes ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('. ');
      docs.push({
        id: `entity-${userId}-${id}`,
        text: [`${entity.name} (${entity.type})`, attributeText].filter(Boolean).join('. '),
        metadata: {
          ...common,
          category: 'entity',
          entityId: id,
          entityName: entity.name,
          entityType: entity.type,
          confidence: entity.confidence,
        },
      });
    }

    for (const fact of result.facts) {
      const id = factIdForExtracted({ ...fact, value: String(fact.value) });
      if (!written.has(id)) continue;
      docs.push({
        id: `fact-${userId}-${id}`,
        text: [
          `${fact.entityName}: ${fact.key} is ${fact.value}`,
          fact.temporalContext ? `(${fact.temporalContext})` : '',
        ]
          .filter(Boolean)
          .join(' '),
        metadata: {
          ...common,
          category: 'fact',
          factId: id,
          entityName: fact.entityName,
          factType: fact.factType,
          factKey: fact.key,
          factValue: String(fact.value),
          confidence: fact.confidence,
        },
      });
    }

    for (const rel of result.relationships) {
      const id = relationshipIdFor(rel.source, rel.target, rel.type, rel.bidirectional);
      if (!written.has(id)) continue;
      docs.push({
        id: `rel-${userId}-${id}`,
        text: `${rel.source} ${rel.type} ${rel.target}`,
        metadata: {
          ...common,
          category: 'relationship',
          relationshipId: id,
          sourceEntity: rel.source,
          targetEntity: rel.target,
          relationType: rel.type,
          strength: rel.strength,
        },
      });
    }

    if (docs.length > 0) {
      await vectorStore.addDocuments(docs);
      log.info(
        { userId, vectorDocs: docs.length },
        '🧠 [MEMORY-AUDIT] Indexed extraction for semantic search'
      );
    }
  } catch (error) {
    log.warn(
      { error: String(error), userId },
      '🧠 [MEMORY-AUDIT] Vector indexing failed (non-blocking)'
    );
  }
}
