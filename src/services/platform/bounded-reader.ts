/**
 * The one way the "Take your story" export reads Firestore: every read goes through a
 * BoundedReader, and every reader of one request draws on the same ExportBudget.
 *
 * The budget is charged BEFORE the work it pays for. A page is sized so that even if
 * every document in it were Firestore's maximum (1 MiB), it would still fit what is left,
 * and the reservation is refunded down to the bytes the documents actually serialised to.
 * So no page, retry, store, category or parallel read can hold more than the budget,
 * whatever the documents contain. user-records-export.ts holds no Firestore calls of its
 * own (a test greps it), so there is no second path around these bounds.
 *
 * @module services/platform/bounded-reader
 */

import { FieldPath } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../utils/firebase-admin-app.js';

export type ExportLimitReason =
  'docs' | 'bytes' | 'reads' | 'time' | 'busy' | 'rate' | 'unavailable';

/**
 * An export stopped at a limit. 413: too much to send at once (the person can pick fewer
 * categories or ask us for a copy). 429: asked too often. 503: out of time, busy, or a
 * store that couldn't be read ('unavailable'), so the file would be missing part of it.
 */
export class ExportLimitError extends Error {
  constructor(readonly reason: ExportLimitReason) {
    super(`Export stopped at its ${reason} limit`);
    this.name = 'ExportLimitError';
  }

  get status(): 413 | 429 | 503 {
    if (this.reason === 'rate') return 429;
    return ['time', 'busy', 'unavailable'].includes(this.reason) ? 503 : 413;
  }
}

export interface ExportBudgetLimits {
  /** Documents across the whole request */
  maxDocs: number;
  /** Bytes across the whole request: serialised documents, parsed JSON strings, output */
  maxBytes: number;
  /** Firestore calls across the whole request (gets, pages, counts) */
  maxReads: number;
  /** Wall time, inside the UI server's 30 s request limit */
  deadlineMs: number;
  /** The most one document can weigh; Firestore's own limit is 1 MiB */
  maxDocBytes: number;
  /** Documents per page at most (fewer when the bytes left can't cover a full page) */
  maxPageDocs: number;
  /** A JSON-looking string longer than this is left out rather than parsed */
  maxJsonStringBytes: number;
}

export const EXPORT_BUDGET_LIMITS: Readonly<ExportBudgetLimits> = {
  maxDocs: 20_000,
  maxBytes: 32 * 1024 * 1024,
  maxReads: 2_000,
  deadlineMs: 20_000,
  maxDocBytes: 1024 * 1024,
  maxPageDocs: 100,
  maxJsonStringBytes: 64 * 1024,
};

/** What one request may still spend. Create one per request; share it with every reader. */
export class ExportBudget {
  docsLeft: number;
  bytesLeft: number;
  readsLeft: number;
  readonly deadline: number;

  constructor(readonly limits: Readonly<ExportBudgetLimits> = EXPORT_BUDGET_LIMITS) {
    this.docsLeft = limits.maxDocs;
    this.bytesLeft = limits.maxBytes;
    this.readsLeft = limits.maxReads;
    this.deadline = Date.now() + limits.deadlineMs;
  }

  /** Before any Firestore call: one read, and time must be left */
  beginRead(): void {
    this.checkTime();
    if (this.readsLeft < 1) throw new ExportLimitError('reads');
    this.readsLeft -= 1;
  }

  checkTime(): void {
    if (Date.now() >= this.deadline) throw new ExportLimitError('time');
  }

  /** Take bytes before the work that needs them */
  reserveBytes(bytes: number): void {
    if (bytes > this.bytesLeft) throw new ExportLimitError('bytes');
    this.bytesLeft -= bytes;
  }

  /** Give back what a reservation didn't use */
  refundBytes(bytes: number): void {
    this.bytesLeft += Math.max(0, bytes);
  }

  takeDocs(count: number): void {
    if (count > this.docsLeft) throw new ExportLimitError('docs');
    this.docsLeft -= count;
  }
}

/** A document as read: its id and data, with the bytes it was charged */
export interface ReadDoc {
  id: string;
  data: Record<string, unknown>;
}

/** The serialised size of a stored value, the measure the byte budget is charged in */
export function serialisedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
}

/** A read that gives up at the budget's deadline instead of holding the request open */
async function beforeDeadline<T>(read: Promise<T>, budget: ExportBudget): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    const left = Math.max(0, budget.deadline - Date.now());
    timer = setTimeout(() => reject(new ExportLimitError('time')), left);
  });
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}

export interface CollectionRead {
  /** Only documents whose field equals this value (an owner query) */
  where?: { field: string; equals: string };
  /** Called after each page is read (tests count pages) */
  onPage?: (docs: number) => void;
}

/** The database an export reads, for a checked user id (one document, no '/') */
export async function openExportDb(
  userId: string,
  firestore?: FirebaseFirestore.Firestore
): Promise<FirebaseFirestore.Firestore> {
  const { assertErasableUserId } = await import('./erase-user-record.js');
  assertErasableUserId(userId);
  if (firestore) return firestore;
  const { ensureFirebaseAdmin } = await import('../identity/firebase-auth.js');
  if (!ensureFirebaseAdmin()) throw new Error('Firebase Admin is not initialized');
  return getAdminFirestore();
}

export class BoundedReader {
  constructor(
    readonly budget: ExportBudget,
    private readonly db: FirebaseFirestore.Firestore
  ) {}

  /** One document, or null if it doesn't exist */
  async readDoc(path: string): Promise<ReadDoc | null> {
    const docs = await this.fetch(1, () =>
      this.db
        .doc(path)
        .get()
        .then((s) => [s])
    );
    return docs[0] ?? null;
  }

  /** Every document in a collection (or matching an owner field), page by page */
  async readCollection(path: string, read: CollectionRead = {}): Promise<ReadDoc[]> {
    const base = read.where
      ? this.db.collection(path).where(read.where.field, '==', read.where.equals)
      : this.db.collection(path);
    const ordered = base.orderBy(FieldPath.documentId());
    const out: ReadDoc[] = [];
    let after: string | undefined;
    for (;;) {
      const size = this.pageSize();
      const page = after ? ordered.startAfter(after).limit(size) : ordered.limit(size);
      const docs = await this.fetch(size, () => page.get().then((s) => s.docs));
      read.onPage?.(docs.length);
      out.push(...docs);
      if (docs.length < size) return out;
      after = docs[docs.length - 1]?.id;
    }
  }

  /** How many documents a collection holds (or match an owner field): one read, no docs */
  async countCollection(path: string, read: CollectionRead = {}): Promise<number> {
    this.budget.beginRead();
    const base = read.where
      ? this.db.collection(path).where(read.where.field, '==', read.where.equals)
      : this.db.collection(path);
    const snap = await beforeDeadline(base.count().get(), this.budget);
    return snap.data().count;
  }

  /** Whether a document exists: one read, its bytes reserved like any other */
  async docExists(path: string): Promise<boolean> {
    return (await this.readDoc(path)) !== null;
  }

  /**
   * As many documents as the budget can hold even if each weighs maxDocBytes, plus one
   * past the documents left so a store larger than the cap is caught, not cut off.
   */
  private pageSize(): number {
    const { maxPageDocs, maxDocBytes } = this.budget.limits;
    const affordable = Math.floor(this.budget.bytesLeft / maxDocBytes);
    if (affordable < 1) throw new ExportLimitError('bytes');
    return Math.min(maxPageDocs, this.budget.docsLeft + 1, affordable);
  }

  /** Reserve the worst case, read, then charge what the documents serialised to */
  private async fetch(
    maxDocs: number,
    read: () => Promise<FirebaseFirestore.DocumentSnapshot[]>
  ): Promise<ReadDoc[]> {
    this.budget.beginRead();
    const reserved = maxDocs * this.budget.limits.maxDocBytes;
    this.budget.reserveBytes(reserved);
    const snaps = (await beforeDeadline(read(), this.budget)).filter((s) => s.exists);
    const docs = snaps.map((s) => ({
      id: s.id,
      data: (s.data() ?? {}) as Record<string, unknown>,
    }));
    const used = docs.reduce((n, d) => n + serialisedBytes(d.data) + d.id.length, 0);
    this.budget.refundBytes(reserved - used);
    this.budget.takeDocs(docs.length);
    return docs;
  }
}
