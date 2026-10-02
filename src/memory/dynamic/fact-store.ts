/**
 * Fact store: upserts extracted facts, entities and relationships under
 * deterministic ids (see fact-identity.ts).
 *
 * Rules (shared memory contract):
 * - Re-learning a fact merges into the same document; `sourceConversationIds`
 *   gains the conversation, `firstSeenAt` is kept.
 * - A fact the user edited (`userEdited: true`) is never rewritten by
 *   extraction; only its `sourceConversationIds` may grow.
 * - A fact (or entity) with a tombstone at memory_tombstones/{id} is skipped.
 *
 * Each document is written in its own transaction: the read of the tombstone
 * and the current document and the write happen atomically, so two workers or
 * a user edit racing an extraction cannot lose an update.
 *
 * @module memory/dynamic/fact-store
 */

import {
  entityIdFor,
  factIdForExtracted,
  factText,
  relationshipIdFor,
  type IdentifiableFact,
} from './fact-identity.js';
import {
  USERS_COLLECTION,
  type DocData,
  type DocRefLike,
  type FirestoreLike,
} from './firestore-shapes.js';

export const TOMBSTONES_COLLECTION = 'memory_tombstones';

export interface FactProvenance {
  conversationId?: string;
  sessionId: string;
  turnNumber: number;
  personaId?: string;
}

export interface StorableFact extends IdentifiableFact {
  factType: string;
  confidence: number;
  temporalContext?: string;
}

export interface StorableEntity {
  name: string;
  type: string;
  attributes: Record<string, string>;
  confidence: number;
}

export interface StorableRelationship {
  source: string;
  target: string;
  type: string;
  strength: number;
  bidirectional: boolean;
}

export type UpsertOutcome = 'created' | 'updated' | 'provenance_only' | 'tombstoned' | 'unchanged';

export interface UpsertSummary {
  created: number;
  updated: number;
  provenanceOnly: number;
  tombstoned: number;
  unchanged: number;
  /** Ids of documents (facts, entities, relationships) created or changed, for re-indexing. */
  writtenIds: string[];
}

const WORK_KEYS = new Set(['employer', 'job_title', 'team', 'previous_employer', 'occupation']);
const PLACE_KEY_RE =
  /^(lives_in|hometown|lived_in|grew_up_in|moved_to|trip_planned|trip_taken|bucket_list|engaged_in|married_in|met_in|favorite_(restaurant|cafe|place|bar|park|city))$/;

/** Map an extracted fact type (and, for work/places, its key) onto the user-facing category. */
export function categoryForFactType(factType: string, key?: string): string {
  const k = (key ?? '').toLowerCase();
  if (WORK_KEYS.has(k)) return 'work';
  if (PLACE_KEY_RE.test(k)) return 'places';
  switch (factType) {
    case 'preference':
      return 'preference';
    case 'event':
      return 'event';
    case 'relationship':
      return 'relationship';
    case 'state':
      return 'state';
    default:
      return 'personal';
  }
}

function union(existing: unknown, add: string | undefined): { list: string[]; changed: boolean } {
  const list = Array.isArray(existing)
    ? existing.filter((x): x is string => typeof x === 'string')
    : [];
  if (!add || list.includes(add)) return { list, changed: false };
  return { list: [...list, add], changed: true };
}

function clamp01(n: unknown, fallback = 0.5): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/**
 * Upsert one document under the contract's rules. `build` returns the fields
 * extraction wants to set; it receives the existing data (or undefined).
 */
async function upsertDoc(
  db: FirestoreLike,
  userId: string,
  ref: DocRefLike,
  id: string,
  conversationId: string | undefined,
  build: (existing: DocData | undefined) => DocData | null
): Promise<UpsertOutcome> {
  const tombRef = db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection(TOMBSTONES_COLLECTION)
    .doc(id);
  return db.runTransaction(async (tx) => {
    const tomb = await tx.get(tombRef);
    if (tomb.exists) return 'tombstoned';
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : undefined;
    const sources = union(existing?.sourceConversationIds, conversationId);

    if (existing && existing.userEdited === true) {
      if (!sources.changed) return 'unchanged';
      tx.update(ref, { sourceConversationIds: sources.list });
      return 'provenance_only';
    }

    const fields = build(existing);
    if (!fields) {
      if (!sources.changed) return 'unchanged';
      tx.update(ref, { sourceConversationIds: sources.list });
      return 'provenance_only';
    }

    const now = new Date();
    tx.set(
      ref,
      {
        ...fields,
        sourceConversationIds: sources.list,
        firstSeenAt: existing?.firstSeenAt ?? now,
        updatedAt: now,
        userEdited: false,
        syncedToSpanner: false, // L2 -> L3 sync picks the change up
      },
      { merge: true }
    );
    return existing ? 'updated' : 'created';
  });
}

function tally(summary: UpsertSummary, outcome: UpsertOutcome, id: string): void {
  if (outcome === 'created') summary.created++;
  else if (outcome === 'updated') summary.updated++;
  else if (outcome === 'provenance_only') summary.provenanceOnly++;
  else if (outcome === 'tombstoned') summary.tombstoned++;
  else summary.unchanged++;
  if (outcome === 'created' || outcome === 'updated') summary.writtenIds.push(id);
}

export function emptySummary(): UpsertSummary {
  return { created: 0, updated: 0, provenanceOnly: 0, tombstoned: 0, unchanged: 0, writtenIds: [] };
}

/** Upsert extracted facts. Never throws for one bad fact; the rest still land. */
export async function upsertFacts(
  db: FirestoreLike,
  userId: string,
  facts: readonly StorableFact[],
  prov: FactProvenance,
  summary: UpsertSummary = emptySummary()
): Promise<UpsertSummary> {
  const factsCol = db.collection(USERS_COLLECTION).doc(userId).collection('dynamic_facts');
  // The same fact twice in one extraction counts once (highest confidence wins).
  const byId = new Map<string, StorableFact>();
  for (const f of facts) {
    if (!f?.entityName || !f.key || f.value === undefined || f.value === null) continue;
    const fact = { ...f, value: String(f.value) };
    const id = factIdForExtracted(fact);
    const seen = byId.get(id);
    if (!seen || clamp01(fact.confidence) > clamp01(seen.confidence)) byId.set(id, fact);
  }

  for (const [id, fact] of byId) {
    const confidence = clamp01(fact.confidence);
    const outcome = await upsertDoc(
      db,
      userId,
      factsCol.doc(id),
      id,
      prov.conversationId,
      (existing) => {
        const sameValue =
          existing &&
          String(existing.value ?? '')
            .trim()
            .toLowerCase() === fact.value.trim().toLowerCase();
        // Hearing the same thing again reinforces it; a new value replaces the old one.
        const nextConfidence = sameValue
          ? Math.min(0.99, Math.max(clamp01(existing?.confidence), confidence) + 0.05)
          : confidence;
        return {
          text: factText(fact),
          category: categoryForFactType(fact.factType, fact.key),
          confidence: nextConfidence,
          entityName: fact.entityName,
          factType: fact.factType,
          key: fact.key,
          value: fact.value,
          ...(fact.temporalContext ? { temporalContext: fact.temporalContext } : {}),
          extractedAt: new Date().toISOString(),
          sessionId: prov.sessionId,
          turnNumber: prov.turnNumber,
          ...(prov.personaId ? { personaId: prov.personaId } : {}),
          source: 'deep_extraction',
        };
      }
    );
    tally(summary, outcome, id);
  }
  return summary;
}

/** Upsert extracted entities; attributes merge into what is already known. */
export async function upsertEntities(
  db: FirestoreLike,
  userId: string,
  entities: readonly StorableEntity[],
  prov: FactProvenance,
  summary: UpsertSummary = emptySummary()
): Promise<UpsertSummary> {
  const col = db.collection(USERS_COLLECTION).doc(userId).collection('dynamic_entities');
  for (const entity of entities) {
    if (!entity?.name || !entity.type) continue;
    const id = entityIdFor(entity.name, entity.type);
    const outcome = await upsertDoc(
      db,
      userId,
      col.doc(id),
      id,
      prov.conversationId,
      (existing) => ({
        name: (existing?.name as string | undefined) ?? entity.name,
        type: entity.type,
        attributes: {
          ...((existing?.attributes as Record<string, string> | undefined) ?? {}),
          ...(entity.attributes ?? {}),
        },
        confidence: Math.max(clamp01(existing?.confidence, 0), clamp01(entity.confidence)),
        mentionCount: (typeof existing?.mentionCount === 'number' ? existing.mentionCount : 0) + 1,
        extractedAt: new Date().toISOString(),
        sessionId: prov.sessionId,
        turnNumber: prov.turnNumber,
        source: 'deep_extraction',
      })
    );
    tally(summary, outcome, id);
  }
  return summary;
}

/** Upsert relationship edges. */
export async function upsertRelationships(
  db: FirestoreLike,
  userId: string,
  relationships: readonly StorableRelationship[],
  prov: FactProvenance,
  summary: UpsertSummary = emptySummary()
): Promise<UpsertSummary> {
  const col = db.collection(USERS_COLLECTION).doc(userId).collection('dynamic_relationships');
  for (const rel of relationships) {
    if (!rel?.source || !rel.target || !rel.type) continue;
    const id = relationshipIdFor(rel.source, rel.target, rel.type, rel.bidirectional);
    const outcome = await upsertDoc(
      db,
      userId,
      col.doc(id),
      id,
      prov.conversationId,
      (existing) => ({
        source: rel.source,
        target: rel.target,
        type: rel.type,
        bidirectional: Boolean(rel.bidirectional),
        strength: Math.max(clamp01(existing?.strength, 0), clamp01(rel.strength)),
        extractedAt: new Date().toISOString(),
        sessionId: prov.sessionId,
        turnNumber: prov.turnNumber,
        // Not 'source': that field is the edge's source entity (it used to be overwritten).
        origin: 'deep_extraction',
      })
    );
    tally(summary, outcome, id);
  }
  return summary;
}
