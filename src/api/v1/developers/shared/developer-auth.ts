/**
 * Shared Developer Auth Helpers
 *
 * Provides Firebase Auth and Firestore utilities for developer console routes.
 * Single source of truth - all developer routes should import from here.
 *
 * @module api/v1/developers/shared/developer-auth
 */

import type { IncomingMessage } from 'http';
import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger().child({ module: 'developer-auth' });

// ============================================================================
// TYPES
// ============================================================================

export interface FirebaseDecodedToken {
  uid: string;
  email?: string;
  name?: string;
  firebase?: {
    sign_in_provider?: string;
  };
}

export interface Firestore {
  collection: (path: string) => CollectionReference;
  batch: () => WriteBatch;
}

export interface WriteBatch {
  set: (docRef: DocumentReference, data: unknown, options?: { merge?: boolean }) => WriteBatch;
  update: (docRef: DocumentReference, data: Record<string, unknown>) => WriteBatch;
  delete: (docRef: DocumentReference) => WriteBatch;
  commit: () => Promise<void>;
}

export interface CollectionReference {
  doc: (id?: string) => DocumentReference;
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
}

export interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  update: (data: Record<string, unknown>) => Promise<void>;
  delete: () => Promise<void>;
  collection: (path: string) => CollectionReference;
}

export interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
  ref: DocumentReference;
}

export interface Query {
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  startAfter: (snapshot: DocumentSnapshot) => Query;
}

export interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

// ============================================================================
// FIREBASE AUTH (Singleton)
// ============================================================================

let firebaseAuthInstance: Awaited<ReturnType<typeof import('firebase-admin/auth').getAuth>> | null = null;
let authInitPromise: Promise<void> | null = null;

/**
 * Get Firebase Auth instance for token verification
 * Uses firebase-admin/auth module directly for better ESM compatibility.
 * Singleton pattern ensures one-time initialization across all route files.
 */
export async function getFirebaseAuth() {
  if (firebaseAuthInstance) return firebaseAuthInstance;

  if (authInitPromise) {
    await authInitPromise;
    if (firebaseAuthInstance) return firebaseAuthInstance;
  }

  authInitPromise = (async () => {
    try {
      const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');

      if (getApps().length === 0) {
        initializeApp({
          projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
          credential: applicationDefault(),
        });
        log.info('Firebase Admin initialized for developer routes');
      }

      firebaseAuthInstance = getAuth();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Failed to initialize Firebase Admin');
      throw err;
    }
  })();

  await authInitPromise;
  if (!firebaseAuthInstance) throw new Error('Firebase Admin initialization failed');
  return firebaseAuthInstance;
}

// ============================================================================
// FIRESTORE (Singleton)
// ============================================================================

let db: Firestore | null = null;

/**
 * Get Firestore instance for database operations
 * Singleton pattern ensures one-time initialization across all route files.
 */
export async function getFirestore(): Promise<Firestore> {
  if (db) return db;

  const { Firestore } = await import('@google-cloud/firestore');
  db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  }) as unknown as Firestore;

  return db;
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

/**
 * Get publisher ID from Firebase token in Authorization header
 *
 * @param req - HTTP request with Authorization: Bearer <token>
 * @returns Publisher ID or null if auth fails
 */
export async function getPublisherFromToken(req: IncomingMessage): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    log.debug('No Bearer token in Authorization header');
    return null;
  }

  const idToken = authHeader.substring(7);

  try {
    const auth = await getFirebaseAuth();
    const decodedToken = (await auth.verifyIdToken(idToken)) as FirebaseDecodedToken;

    const db = await getFirestore();
    const query = db.collection('publishers').where('firebaseUid', '==', decodedToken.uid).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
      log.warn({ firebaseUid: decodedToken.uid }, 'No publisher found for Firebase UID');
      return null;
    }
    return snapshot.docs[0].id;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: err.message }, 'Failed to get publisher from token');
    return null;
  }
}

/**
 * Verify Firebase ID token and get decoded payload
 *
 * @param idToken - Firebase ID token string
 * @returns Decoded token or null if invalid
 */
export async function verifyFirebaseToken(idToken: string): Promise<FirebaseDecodedToken | null> {
  try {
    const auth = await getFirebaseAuth();
    return (await auth.verifyIdToken(idToken)) as FirebaseDecodedToken;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: err.message }, 'Invalid Firebase ID token');
    return null;
  }
}

/**
 * Find publisher by Firebase UID
 *
 * @param firebaseUid - Firebase user ID
 * @returns Publisher data or null if not found
 */
export async function findPublisherByFirebaseUid(
  firebaseUid: string
): Promise<{ id: string; email: string; name: string; verified: boolean; createdAt: Date } | null> {
  const db = await getFirestore();

  const query = db.collection('publishers').where('firebaseUid', '==', firebaseUid).limit(1);
  const snapshot = await query.get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  if (!data) return null;

  return {
    id: doc.id,
    email: data.email as string,
    name: data.name as string,
    verified: data.verified as boolean,
    createdAt: toDate(data.createdAt),
  };
}

/**
 * Convert various timestamp formats to Date
 */
function toDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  // Firestore Timestamp with _seconds
  if (typeof (value as { _seconds?: number })._seconds === 'number') {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return new Date();
}

// ============================================================================
// RESET HELPERS (for testing)
// ============================================================================

/**
 * Reset singleton instances (for testing only)
 */
export function resetDeveloperAuth(): void {
  firebaseAuthInstance = null;
  authInitPromise = null;
  db = null;
}
