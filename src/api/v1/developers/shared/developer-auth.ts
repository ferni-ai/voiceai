/**
 * Shared Developer Auth Helpers
 *
 * Provides Firebase Auth and Firestore utilities for developer console routes.
 * Single source of truth - all developer routes should import from here.
 *
 * @module api/v1/developers/shared/developer-auth
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../../utils/safe-logger.js';
import { sendError } from '../../../helpers.js';
import { accountProblem, linkProblem } from './publisher-link-rules.js';
import { getFirestoreDatabase } from '../../../../config/environment.js';
import {
  isAuthCheckUnavailable,
  verifyIdTokenChecked,
} from '../../../../services/identity/token-revocation.js';

const log = getLogger().child({ module: 'developer-auth' });

// ============================================================================
// TYPES
// ============================================================================

export interface FirebaseDecodedToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
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

let firebaseAuthInstance: Awaited<ReturnType<typeof import('firebase-admin/auth').getAuth>> | null =
  null;
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
    databaseId: getFirestoreDatabase(),
  }) as unknown as Firestore;

  return db;
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

/** The verified facts about a caller that decide whether they may act as a publisher. */
export interface PublisherCaller {
  uid: string;
  email?: string;
  emailVerified: boolean;
  anonymous: boolean;
}

export type PublisherResolution =
  | { ok: true; publisher: { id: string; email: string; name: string; verified: boolean } }
  | { ok: false; status: 401 | 403 | 503; error: string };

export const RELINK_MESSAGE =
  'Re-link your developer account: sign in with an account whose email is verified';

export function callerFromDecodedToken(token: FirebaseDecodedToken): PublisherCaller {
  return {
    uid: token.uid,
    email: token.email,
    emailVerified: token.email_verified === true,
    anonymous: token.firebase?.sign_in_provider === 'anonymous',
  };
}

/**
 * The publisher a caller may act as, checked on every request: a non-anonymous
 * account with a verified email equal to the email on the publisher record.
 * A link made earlier from an unverified or empty email no longer works.
 */
export async function resolvePublisher(caller: PublisherCaller): Promise<PublisherResolution> {
  if (accountProblem(caller)) {
    return { ok: false, status: 403, error: RELINK_MESSAGE };
  }
  const record = await findPublisherByFirebaseUid(caller.uid);
  if (!record) return { ok: false, status: 403, error: 'Publisher account not found' };
  if (linkProblem(record.email, caller)) {
    log.warn({ firebaseUid: caller.uid, publisherId: record.id }, 'Publisher email mismatch');
    return { ok: false, status: 403, error: RELINK_MESSAGE };
  }
  return { ok: true, publisher: record };
}

export function resolvePublisherForToken(
  token: FirebaseDecodedToken
): Promise<PublisherResolution> {
  return resolvePublisher(callerFromDecodedToken(token));
}

/** Resolve the publisher for the request's Bearer token (401 if there is no valid token). */
export async function resolvePublisherFromRequest(
  req: IncomingMessage
): Promise<PublisherResolution> {
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  // JWTs have 3 parts and are at least ~100 chars
  if (idToken.length < 100 || idToken.split('.').length !== 3) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }
  try {
    const auth = await getFirebaseAuth();
    const decodedToken = (await verifyIdTokenChecked(auth, idToken)) as FirebaseDecodedToken;
    return await resolvePublisherForToken(decodedToken);
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get publisher from token');
    return { ok: false, status: isAuthCheckUnavailable(error) ? 503 : 401, error: 'Authentication required' };
  }
}

/**
 * Publisher ID for the request's Firebase token, or null.
 *
 * @param req - HTTP request with Authorization: Bearer <token>
 */
export async function getPublisherFromToken(req: IncomingMessage): Promise<string | null> {
  const result = await resolvePublisherFromRequest(req);
  return result.ok ? result.publisher.id : null;
}

/** Publisher ID for the request, or null after sending the 401/403 that explains why. */
export async function requirePublisherFromToken(
  req: IncomingMessage,
  res: ServerResponse
): Promise<string | null> {
  const result = await resolvePublisherFromRequest(req);
  if (result.ok) return result.publisher.id;
  sendError(res, result.error, result.status);
  return null;
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
    return (await verifyIdTokenChecked(auth, idToken)) as FirebaseDecodedToken;
  } catch (error) {
    if (isAuthCheckUnavailable(error)) throw error; // a 503 for the caller, not a bad token
    const err = error instanceof Error ? error : new Error(String(error));
    // SECURITY: Log only metadata, never any part of the token
    const tokenLength = idToken?.length ?? 0;
    const tokenParts = idToken?.split('.').length ?? 0;
    log.warn({ error: err.message, tokenLength, tokenParts }, 'Invalid Firebase ID token');
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
