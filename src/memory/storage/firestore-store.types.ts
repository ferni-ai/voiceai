/**
 * Firestore Store - types
 *
 * Store config and the minimal Firestore client surface FirestoreStore uses.
 *
 * @module memory/storage/firestore-store.types
 */

export interface FirestoreConfig {
  projectId?: string;
  databaseId?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
  /**
   * Connection pooling settings for performance optimization.
   * These reduce cold start latency by maintaining warm connections.
   */
  pooling?: {
    /** Minimum gRPC channels to maintain (default: 2) */
    minChannels?: number;
    /** Maximum idle gRPC channels (default: 10) */
    maxIdleChannels?: number;
  };
}

export interface Firestore {
  collection: (path: string) => CollectionReference;
  terminate: () => Promise<void>;
}

export interface CollectionReference {
  doc: (id: string) => DocumentReference;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  where: (field: string, op: string, value: unknown) => Query;
  get: () => Promise<QuerySnapshot>;
}

export interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  delete: () => Promise<unknown>;
  collection: (name: string) => CollectionReference;
}

export interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

export interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

export interface Query {
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  offset: (n: number) => Query;
  where: (field: string, op: string, value: unknown) => Query;
  get: () => Promise<QuerySnapshot>;
}
