/**
 * Firestore access for memory control: user-scoped refs, date mapping, and
 * write helpers that can record "before images" into an undo journal.
 *
 * @module services/memory-control/db
 */

import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  Query,
} from '@google-cloud/firestore';
import type { VectorDocument } from '../../memory/vectors/vector-store-interface.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export const USERS = 'bogle_users';

/** Subcollections that hold a user's memory (wiped by deleteAllMemories). */
export const MEMORY_COLLECTIONS = [
  'conversations',
  'conversation_threads',
  'summaries',
  'conversation_summaries',
  'dynamic_facts',
  'dynamic_entities',
  'dynamic_relationships',
  'promoted_entities',
  'extraction_history',
  'extraction_jobs',
  'extracted_facts',
  'memories',
  'memory_tombstones',
] as const;

const PAGE = 300;

export function getDb(): Firestore | null {
  return getFirestoreDb();
}

export function userRef(db: Firestore, userId: string): DocumentReference {
  return db.collection(USERS).doc(userId);
}

export function userCollection(db: Firestore, userId: string, name: string): CollectionReference {
  return userRef(db, userId).collection(name);
}

/** Firestore Timestamp | Date | ISO string | millis → ISO string (or null). */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return toIso((value as { toDate: () => Date }).toDate());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// ============================================================================
// UNDO JOURNAL
// ============================================================================

interface JournalEntry {
  ref: DocumentReference;
  before: DocumentData | null;
}

/**
 * Records the previous state of every document a deletion touches so the
 * whole operation can be reverted (voice "undo"). Held in memory only.
 */
export class UndoJournal {
  private readonly entries: JournalEntry[] = [];
  private readonly seen = new Set<string>();
  readonly vectors: VectorDocument[] = [];

  record(ref: DocumentReference, before: DocumentData | null): void {
    // The first image of a document is its true original state.
    if (this.seen.has(ref.path)) return;
    this.seen.add(ref.path);
    this.entries.push({ ref, before });
  }

  get size(): number {
    return this.entries.length;
  }

  /** Restore every recorded document, newest change first. */
  async restore(): Promise<number> {
    let restored = 0;
    for (const { ref, before } of [...this.entries].reverse()) {
      if (before === null) await ref.delete();
      else await ref.set(before);
      restored++;
    }
    return restored;
  }
}

// ============================================================================
// WRITE HELPERS
// ============================================================================

export async function removeDoc(
  ref: DocumentReference,
  journal?: UndoJournal,
  knownData?: DocumentData
): Promise<void> {
  if (journal) {
    const before = knownData ?? (await ref.get()).data() ?? null;
    journal.record(ref, before);
  }
  await ref.delete();
}

/** Full replace (not merge) so an undo can put back exactly what was there. */
export async function writeDoc(
  ref: DocumentReference,
  data: DocumentData,
  journal?: UndoJournal,
  knownBefore?: DocumentData | null
): Promise<void> {
  if (journal) {
    const before = knownBefore !== undefined ? knownBefore : ((await ref.get()).data() ?? null);
    journal.record(ref, before);
  }
  await ref.set(data);
}

/**
 * Delete every document matched by `query` (and, recursively, the listed
 * nested subcollections of each). Pages until empty. Returns the number of
 * top-level documents removed.
 */
export async function deleteQuery(
  query: Query,
  journal?: UndoJournal,
  nested: readonly string[] = []
): Promise<number> {
  let removed = 0;
  for (;;) {
    const snapshot = await query.limit(PAGE).get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) {
      for (const sub of nested) {
        await deleteQuery(doc.ref.collection(sub), journal);
      }
      await removeDoc(doc.ref, journal, doc.data());
      removed++;
    }
    if (snapshot.size < PAGE) break;
  }
  return removed;
}
