/**
 * Firestore Vector Store Types
 *
 * Type definitions for the Firestore vector store implementation.
 *
 * @module memory/firestore-vector-store/types
 */

import type { VectorDocument, VectorFilter } from '../vector-store-interface.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface FirestoreVectorConfig {
  projectId?: string;
  databaseId?: string;
  collectionName?: string;
  embeddingDimension?: number;
}

// ============================================================================
// FIRESTORE SDK TYPES (simplified interfaces)
// ============================================================================

export interface FirestoreInstance {
  collection: (path: string) => CollectionReference;
  terminate: () => Promise<void>;
}

export interface CollectionReference {
  doc: (id: string) => DocumentReference;
  where: (field: string, op: string, value: unknown) => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
  findNearest?: (options: FindNearestOptions) => Query;
}

export interface FindNearestOptions {
  vectorField: string;
  queryVector: number[];
  limit: number;
  distanceMeasure: 'EUCLIDEAN' | 'COSINE' | 'DOT_PRODUCT';
}

export interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  delete: () => Promise<unknown>;
}

export interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
  ref?: DocumentReference;
}

export interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

export interface Query {
  where: (field: string, op: string, value: unknown) => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

// Firestore vector type
export interface FieldVector {
  toArray: () => number[];
}

// ============================================================================
// HEALTH STATUS
// ============================================================================

export interface VectorStoreHealth {
  healthy: boolean;
  initialized: boolean;
  usingFallback: boolean;
  fallbackReason: string | null;
  risk: 'none' | 'data_loss' | 'degraded_search';
  recoveryAttempts: number;
  lastRecoveryAttempt: number | null;
  cacheSize: number;
}

// ============================================================================
// CACHE ENTRY
// ============================================================================

export interface FallbackCacheEntry {
  doc: VectorDocument;
  embedding: number[];
}

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_COLLECTION_NAME = 'vectors';
export const DEFAULT_EMBEDDING_DIMENSION = 768; // Google's text-embedding-004
export const MAX_FALLBACK_CACHE_SIZE = 10_000;
export const RECOVERY_INTERVAL_MS = 60_000;
export const MAX_RECOVERY_ATTEMPTS = 10;
export const FIRESTORE_BATCH_SIZE = 500;
