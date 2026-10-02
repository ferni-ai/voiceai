/**
 * The slice of the Firestore API the memory extraction and recall code uses.
 *
 * Typed structurally so the real client (@google-cloud/firestore) satisfies it
 * and tests can pass a small in-memory double without a database.
 *
 * @module memory/dynamic/firestore-shapes
 */

export type DocData = Record<string, unknown>;

export interface DocSnapLike {
  readonly id: string;
  readonly exists: boolean;
  readonly ref: DocRefLike;
  data(): DocData | undefined;
}

export interface QuerySnapLike {
  readonly docs: DocSnapLike[];
  readonly empty: boolean;
  readonly size: number;
}

export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';

export interface QueryLike {
  where(field: string, op: WhereOp, value: unknown): QueryLike;
  orderBy(field: string, direction?: 'asc' | 'desc'): QueryLike;
  limit(n: number): QueryLike;
  get(): Promise<QuerySnapLike>;
}

export interface CollectionRefLike extends QueryLike {
  doc(id?: string): DocRefLike;
}

export interface DocRefLike {
  readonly id: string;
  readonly path: string;
  readonly parent: { readonly parent: DocRefLike | null; readonly id: string };
  collection(name: string): CollectionRefLike;
  get(): Promise<DocSnapLike>;
  set(data: DocData, options?: { merge?: boolean }): Promise<unknown>;
  update(data: DocData): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface TransactionLike {
  get(ref: DocRefLike): Promise<DocSnapLike>;
  set(ref: DocRefLike, data: DocData, options?: { merge?: boolean }): TransactionLike;
  update(ref: DocRefLike, data: DocData): TransactionLike;
  delete(ref: DocRefLike): TransactionLike;
}

export interface FirestoreLike {
  collection(name: string): CollectionRefLike;
  collectionGroup(name: string): QueryLike;
  runTransaction<T>(fn: (tx: TransactionLike) => Promise<T>): Promise<T>;
}

/** Firestore Timestamp, JS Date, ISO string or epoch millis -> epoch millis (0 when unknown). */
export function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (value && typeof value === 'object') {
    const v = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return v.toDate().getTime();
  }
  return 0;
}

/** The users collection root every memory path starts from. */
export const USERS_COLLECTION = 'bogle_users';
