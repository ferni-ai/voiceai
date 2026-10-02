/**
 * Identity merge — moving one user's subcollections into another's.
 *
 * Every chunk moves inside a Firestore transaction: it reads the source docs
 * (and the target docs they land on), writes the merged target doc and
 * deletes the source doc. A doc is therefore always in exactly one place, so a
 * merge that crashes half way simply resumes, and two merges racing on the
 * same pair never duplicate or lose a doc (a source doc already moved by the
 * other run reads as missing and is skipped).
 *
 * @module services/identity/identity-merge-collections
 */

import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
} from '@google-cloud/firestore';
import { factIdFor, factIdForExtracted } from '../../memory/dynamic/fact-identity.js';

/** Docs per transaction. Facts read 3 docs and write 2 per source doc. */
export const MERGE_CHUNK_SIZE = 100;
/** Safety stop per collection; a stopped merge stays resumable. */
const MAX_CHUNKS_PER_COLLECTION = 1000;

export const VECTOR_COLLECTION = 'vectors';

/** What to do with one source doc. The source doc is deleted either way. */
export type MoveDecision = { write: DocumentData } | { drop: 'tombstoned' | 'duplicate' };

export interface MoveSpec {
  /** Merge a source doc onto the target doc (undefined when absent). */
  resolve: (
    source: DocumentData,
    target: DocumentData | undefined,
    guarded: boolean
  ) => MoveDecision;
  /** Target doc id for a source doc (default: same id). */
  targetIdFor?: (sourceId: string, data: DocumentData) => string;
  /** Extra doc to read per target id; its existence is passed as `guarded`. */
  guardFor?: (targetId: string) => DocumentReference;
  /** Child subcollections to move before the parent docs (e.g. turns). Ids are kept. */
  children?: readonly string[];
}

export interface MoveStats {
  moved: number;
  merged: number;
  dropped: number;
  complete: boolean;
}

const emptyStats = (): MoveStats => ({ moved: 0, merged: 0, dropped: 0, complete: true });

function addStats(into: MoveStats, from: MoveStats): void {
  into.moved += from.moved;
  into.merged += from.merged;
  into.dropped += from.dropped;
  into.complete = into.complete && from.complete;
}

/** Target wins on conflicting fields; source fills what the target lacks. */
export const preferTarget: MoveSpec['resolve'] = (source, target) => ({
  write: target ? { ...source, ...target } : source,
});

/**
 * Move every doc of `source` into `target`, chunk by chunk, children first.
 */
export async function moveCollection(
  db: Firestore,
  source: CollectionReference,
  target: CollectionReference,
  spec: MoveSpec
): Promise<MoveStats> {
  const stats = emptyStats();
  const targetIdFor = spec.targetIdFor ?? ((id: string) => id);

  // Children first, via listDocuments() so subcollections under parent docs
  // that were never written themselves ("phantom" parents) are found too.
  // Collections with children keep their doc ids.
  for (const child of spec.children ?? []) {
    for (const parent of await source.listDocuments()) {
      const childStats = await moveCollection(
        db,
        parent.collection(child),
        target.doc(parent.id).collection(child),
        { resolve: preferTarget }
      );
      addStats(stats, childStats);
    }
  }

  for (let chunk = 0; chunk < MAX_CHUNKS_PER_COLLECTION; chunk++) {
    const page = await source.limit(MERGE_CHUNK_SIZE).get();
    if (page.empty) return stats;

    const plans = page.docs.map((doc) => {
      const targetId = targetIdFor(doc.id, doc.data());
      return { src: doc.ref, dst: target.doc(targetId), guard: spec.guardFor?.(targetId) };
    });

    const chunkStats = await db.runTransaction(async (tx) => {
      const srcSnaps = await tx.getAll(...plans.map((p) => p.src));
      const dstSnaps = await tx.getAll(...plans.map((p) => p.dst));
      const guardRefs = plans.flatMap((p) => (p.guard ? [p.guard] : []));
      const guardSnaps = guardRefs.length > 0 ? await tx.getAll(...guardRefs) : [];
      const guarded = new Set(guardSnaps.filter((s) => s.exists).map((s) => s.ref.path));
      // Two source docs can map to the same target id (legacy random-id facts):
      // later ones merge onto what this chunk already wrote.
      const pending = new Map<string, DocumentData>();
      const result = emptyStats();

      plans.forEach((plan, i) => {
        const srcData = srcSnaps[i].exists ? srcSnaps[i].data() : undefined;
        if (!srcData) return; // moved by a concurrent run
        const existing =
          pending.get(plan.dst.path) ?? (dstSnaps[i].exists ? dstSnaps[i].data() : undefined);
        const decision = spec.resolve(
          srcData,
          existing,
          plan.guard ? guarded.has(plan.guard.path) : false
        );
        if ('write' in decision) {
          tx.set(plan.dst, decision.write);
          pending.set(plan.dst.path, decision.write);
          if (existing) result.merged++;
          else result.moved++;
        } else {
          result.dropped++;
        }
        tx.delete(plan.src);
      });
      return result;
    });
    addStats(stats, chunkStats);
  }

  stats.complete = false;
  return stats;
}

/**
 * Point the user's vector-store entries (top-level `vectors`, keyed by
 * `metadata.userId`) at the target user.
 */
export async function moveVectorEntries(
  db: Firestore,
  sourceId: string,
  targetId: string
): Promise<MoveStats> {
  const stats = emptyStats();
  for (let chunk = 0; chunk < MAX_CHUNKS_PER_COLLECTION; chunk++) {
    const page = await db
      .collection(VECTOR_COLLECTION)
      .where('metadata.userId', '==', sourceId)
      .limit(MERGE_CHUNK_SIZE)
      .get();
    if (page.empty) return stats;
    const batch = db.batch();
    for (const doc of page.docs) batch.update(doc.ref, { 'metadata.userId': targetId });
    await batch.commit();
    stats.moved += page.size;
  }
  stats.complete = false;
  return stats;
}

// ============================================================================
// FACTS
// ============================================================================

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Deterministic fact id for a fact doc, falling back to its current id. */
export function factTargetId(sourceId: string, data: DocumentData): string {
  // Extracted facts: use extraction's own id scheme, so multi-valued facts
  // ("likes jazz", "likes hiking") keep separate ids instead of collapsing.
  const entityName = str(data.entityName);
  const key = str(data.key);
  const value = str(data.value);
  if (entityName && key && value) {
    return factIdForExtracted({ entityName, key, value, factType: str(data.factType) });
  }
  const subject = str(data.subject) ?? entityName;
  const predicate = str(data.predicate) ?? key;
  return subject && predicate ? factIdFor({ subject, predicate }) : sourceId;
}

/** Milliseconds for a Firestore Timestamp, Date, ISO string or number. */
export function toMillis(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && 'toMillis' in value) {
    const fn = (value as { toMillis: unknown }).toMillis;
    if (typeof fn === 'function') return Number(fn.call(value));
  }
  return 0;
}

function conversationIds(doc: DocumentData): string[] {
  const ids = Array.isArray(doc.sourceConversationIds) ? doc.sourceConversationIds : [];
  const legacy = str(doc.sessionId) ? [doc.sessionId as string] : [];
  return [...ids, ...legacy].filter((id): id is string => typeof id === 'string');
}

const updatedAtOf = (doc: DocumentData): number =>
  toMillis(doc.updatedAt) || toMillis(doc.extractedAt) || toMillis(doc.firstSeenAt);

const pickEarliest = (a: unknown, b: unknown): unknown => {
  const [ma, mb] = [toMillis(a), toMillis(b)];
  if (!ma) return b;
  if (!mb) return a;
  return ma <= mb ? a : b;
};

const pickLatest = (a: unknown, b: unknown): unknown => (toMillis(a) >= toMillis(b) ? a : b);

/**
 * Merge two versions of the same fact.
 *
 * - A user-edited version always wins over an automated one; between two
 *   user-edited versions the most recent edit wins.
 * - Otherwise the most recently updated text wins.
 * - Provenance (`sourceConversationIds`) is the union of both.
 */
export function mergeFactDocs(
  source: DocumentData,
  target: DocumentData | undefined
): DocumentData {
  const sourceIds = conversationIds(source);
  if (!target) {
    return {
      ...source,
      sourceConversationIds: [...new Set(sourceIds)],
      userEdited: source.userEdited === true,
    };
  }

  const srcEdited = source.userEdited === true;
  const dstEdited = target.userEdited === true;
  let sourceWins: boolean;
  if (srcEdited !== dstEdited) sourceWins = srcEdited;
  else if (srcEdited) sourceWins = toMillis(source.editedAt) > toMillis(target.editedAt);
  else sourceWins = updatedAtOf(source) > updatedAtOf(target);

  const [winner, loser] = sourceWins ? [source, target] : [target, source];
  const merged: DocumentData = {
    ...loser,
    ...winner,
    sourceConversationIds: [...new Set([...conversationIds(target), ...sourceIds])],
    userEdited: srcEdited || dstEdited,
  };
  const firstSeen = pickEarliest(source.firstSeenAt, target.firstSeenAt);
  if (firstSeen !== undefined) merged.firstSeenAt = firstSeen;
  const updated = pickLatest(source.updatedAt, target.updatedAt);
  if (updated !== undefined) merged.updatedAt = updated;
  return merged;
}

/** Fact move spec: deterministic ids, tombstones respected, facts merged. */
export function factMoveSpec(target: DocumentReference): MoveSpec {
  return {
    targetIdFor: factTargetId,
    guardFor: (factId) => target.collection('memory_tombstones').doc(factId),
    resolve: (source, existing, tombstoned) =>
      tombstoned ? { drop: 'tombstoned' } : { write: mergeFactDocs(source, existing) },
  };
}
