/**
 * The narrow Firestore shape optimization-persistence.ts writes through. Split out so
 * the service has room to bind the Firestore database (the file is over the 500-line
 * ratchet).
 *
 * @module services/performance/optimization-persistence-types
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FirestoreDB {
  collection: (path: string) => CollectionRef;
  runTransaction: <T>(fn: (transaction: Transaction) => Promise<T>) => Promise<T>;
  batch: () => WriteBatch;
}

export interface CollectionRef {
  doc: (id?: string) => DocumentRef;
  get: () => Promise<QuerySnapshot>;
  orderBy: (field: string, direction?: 'asc' | 'desc') => CollectionRef;
  limit: (count: number) => CollectionRef;
  where: (field: string, op: string, value: unknown) => CollectionRef;
  add: (data: unknown) => Promise<DocumentRef>;
}

export interface DocumentRef {
  get: () => Promise<DocumentSnapshot>;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
  update: (data: unknown) => Promise<void>;
  delete: () => Promise<void>;
  id: string;
}

export interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

export interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
  size: number;
}

export interface Transaction {
  get: (ref: DocumentRef) => Promise<DocumentSnapshot>;
  set: (ref: DocumentRef, data: unknown, options?: { merge?: boolean }) => void;
  update: (ref: DocumentRef, data: unknown) => void;
}

export interface WriteBatch {
  set: (ref: DocumentRef, data: unknown, options?: { merge?: boolean }) => WriteBatch;
  update: (ref: DocumentRef, data: unknown) => WriteBatch;
  delete: (ref: DocumentRef) => WriteBatch;
  commit: () => Promise<void>;
}
