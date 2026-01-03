/**
 * Developer Console Authentication Routes
 *
 * Provides Firebase Auth integration for developer console:
 * - POST /api/v1/developers/auth/verify - Verify Firebase ID token and get/create publisher
 * - GET  /api/v1/developers/auth/session - Get current session info
 * - POST /api/v1/developers/auth/logout - Clear session
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from '../../helpers.js';
import {
  registerPublisher,
  getPublisher,
  listApiKeys,
  type Publisher,
} from '../../publisher-auth.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger().child({ module: 'developers-auth' });

// ============================================================================
// TYPES
// ============================================================================

interface FirebaseDecodedToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  firebase?: {
    sign_in_provider?: string;
  };
}

interface VerifyRequest {
  idToken: string;
}

interface DeveloperSession {
  publisherId: string;
  email: string;
  name: string;
  verified: boolean;
  authProvider: string;
  apiKeys: Array<{
    id: string;
    keyPrefix: string;
    type: 'live' | 'test';
    createdAt: string;
    lastUsedAt?: string;
  }>;
}

// ============================================================================
// FIREBASE ADMIN INITIALIZATION
// ============================================================================

let firebaseAdmin: typeof import('firebase-admin') | null = null;
let adminInitPromise: Promise<void> | null = null;

async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  if (adminInitPromise) {
    await adminInitPromise;
    if (firebaseAdmin) return firebaseAdmin;
  }

  adminInitPromise = (async () => {
    try {
      const admin = await import('firebase-admin');

      // Initialize if not already done
      if (admin.apps.length === 0) {
        admin.initializeApp({
          projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        });
      }

      firebaseAdmin = admin;
      log.info('Firebase Admin initialized for developer auth');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Failed to initialize Firebase Admin');
      throw err;
    }
  })();

  await adminInitPromise;
  if (!firebaseAdmin) throw new Error('Firebase Admin initialization failed');
  return firebaseAdmin;
}

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  where: (field: string, op: string, value: unknown) => Query;
}

interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

interface Query {
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
}

let db: Firestore | null = null;

async function getFirestore(): Promise<Firestore> {
  if (db) return db;

  const { Firestore } = await import('@google-cloud/firestore');
  db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  }) as unknown as Firestore;

  return db;
}

/**
 * Find publisher by Firebase UID
 */
async function findPublisherByFirebaseUid(firebaseUid: string): Promise<Publisher | null> {
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
    createdAt: (data.createdAt as { toDate: () => Date }).toDate(),
  };
}

/**
 * Link Firebase UID to existing or new publisher
 */
async function linkFirebaseToPublisher(
  firebaseUid: string,
  email: string,
  name: string
): Promise<{ publisher: Publisher; isNew: boolean; apiKey?: string }> {
  const db = await getFirestore();

  // Check if already linked
  const existing = await findPublisherByFirebaseUid(firebaseUid);
  if (existing) {
    return { publisher: existing, isNew: false };
  }

  // Check if email already has a publisher (legacy registration)
  const emailQuery = db.collection('publishers').where('email', '==', email).limit(1);
  const emailSnapshot = await emailQuery.get();

  if (!emailSnapshot.empty) {
    // Link Firebase UID to existing publisher
    const doc = emailSnapshot.docs[0];
    await doc.ref.set({ firebaseUid }, { merge: true });

    const data = doc.data();
    if (!data) throw new Error('Publisher data missing');

    const publisher: Publisher = {
      id: doc.id,
      email: data.email as string,
      name: data.name as string,
      verified: data.verified as boolean,
      createdAt: (data.createdAt as { toDate: () => Date }).toDate(),
    };

    log.info({ publisherId: publisher.id, firebaseUid }, 'Linked Firebase UID to existing publisher');
    return { publisher, isNew: false };
  }

  // Create new publisher with Firebase UID
  const { publisher, apiKey } = await registerPublisher(email, name);

  // Add Firebase UID
  await db.collection('publishers').doc(publisher.id).set(
    cleanForFirestore({ firebaseUid }),
    { merge: true }
  );

  log.info({ publisherId: publisher.id, firebaseUid, email }, 'Created new publisher from Firebase auth');
  return { publisher, isNew: true, apiKey };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleDeveloperAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/v1/developers/auth')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method?.toUpperCase();

  try {
    // POST /api/v1/developers/auth/verify
    if (pathname === '/api/v1/developers/auth/verify' && method === 'POST') {
      const body = await parseBody<VerifyRequest>(req);

      if (!body.idToken) {
        sendError(res, 'ID token required', 400);
        return true;
      }

      // Verify Firebase ID token
      const admin = await getFirebaseAdmin();
      let decodedToken: FirebaseDecodedToken;

      try {
        decodedToken = (await admin.auth().verifyIdToken(body.idToken)) as FirebaseDecodedToken;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.warn({ error: err.message }, 'Invalid Firebase ID token');
        sendError(res, 'Invalid or expired token', 401);
        return true;
      }

      const firebaseUid = decodedToken.uid;
      const email = decodedToken.email || '';
      const name = decodedToken.name || email.split('@')[0] || 'Developer';
      const authProvider = decodedToken.firebase?.sign_in_provider || 'unknown';

      // Link/create publisher
      const { publisher, isNew, apiKey } = await linkFirebaseToPublisher(firebaseUid, email, name);

      // Get API keys
      const keys = await listApiKeys(publisher.id);

      const session: DeveloperSession = {
        publisherId: publisher.id,
        email: publisher.email,
        name: publisher.name,
        verified: publisher.verified,
        authProvider,
        apiKeys: keys.map((k) => ({
          id: k.id,
          keyPrefix: k.keyPrefix,
          type: k.type,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString(),
        })),
      };

      log.info(
        { publisherId: publisher.id, isNew, authProvider },
        'Developer authenticated'
      );

      sendJSON(res, {
        success: true,
        session,
        isNewAccount: isNew,
        // Only return full API key for new accounts (shown once)
        newApiKey: isNew ? apiKey : undefined,
      });
      return true;
    }

    // GET /api/v1/developers/auth/session
    if (pathname === '/api/v1/developers/auth/session' && method === 'GET') {
      // Extract Firebase token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        sendError(res, 'Authorization header required', 401);
        return true;
      }

      const idToken = authHeader.substring(7);

      // Verify token
      const admin = await getFirebaseAdmin();
      let decodedToken: FirebaseDecodedToken;

      try {
        decodedToken = (await admin.auth().verifyIdToken(idToken)) as FirebaseDecodedToken;
      } catch (error) {
        sendError(res, 'Invalid or expired token', 401);
        return true;
      }

      // Find publisher
      const publisher = await findPublisherByFirebaseUid(decodedToken.uid);
      if (!publisher) {
        sendError(res, 'Publisher not found. Please sign in first.', 404);
        return true;
      }

      // Get API keys
      const keys = await listApiKeys(publisher.id);

      const session: DeveloperSession = {
        publisherId: publisher.id,
        email: publisher.email,
        name: publisher.name,
        verified: publisher.verified,
        authProvider: decodedToken.firebase?.sign_in_provider || 'unknown',
        apiKeys: keys.map((k) => ({
          id: k.id,
          keyPrefix: k.keyPrefix,
          type: k.type,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString(),
        })),
      };

      sendJSON(res, { success: true, session });
      return true;
    }

    // POST /api/v1/developers/auth/logout
    if (pathname === '/api/v1/developers/auth/logout' && method === 'POST') {
      // Client-side logout - just acknowledge
      // Firebase tokens are stateless, so nothing to invalidate server-side
      sendJSON(res, { success: true, message: 'Logged out' });
      return true;
    }

    // Unknown auth route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname }, 'Developer auth error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// Re-export type for use in other modules
export type { DeveloperSession };
