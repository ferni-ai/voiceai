/**
 * Developer Console API Key Routes
 *
 * Provides CRUD operations for API keys:
 * - GET    /api/v1/developers/keys - List all keys (prefix only)
 * - POST   /api/v1/developers/keys - Create new key (full key returned once)
 * - POST   /api/v1/developers/keys/:id/rotate - Rotate key
 * - DELETE /api/v1/developers/keys/:id - Revoke key
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from '../../helpers.js';
import {
  createApiKey,
  listApiKeys,
  rotateApiKey,
  deleteApiKey,
} from '../../publisher-auth.js';

const log = getLogger().child({ module: 'developers-keys' });

// ============================================================================
// TYPES
// ============================================================================

interface CreateKeyRequest {
  type: 'live' | 'test';
  name?: string;
}

interface FirebaseDecodedToken {
  uid: string;
  email?: string;
}

// ============================================================================
// FIREBASE AUTH HELPER
// ============================================================================

let firebaseAdmin: typeof import('firebase-admin') | null = null;

async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  const admin = await import('firebase-admin');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    });
  }
  firebaseAdmin = admin;
  return firebaseAdmin;
}

// ============================================================================
// FIRESTORE HELPERS (for finding publisher by Firebase UID)
// ============================================================================

interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  where: (field: string, op: string, value: unknown) => Query;
}

interface Query {
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

interface QuerySnapshot {
  empty: boolean;
  docs: Array<{ id: string; data: () => Record<string, unknown> | undefined }>;
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
 * Get publisher ID from Firebase token
 */
async function getPublisherFromToken(req: IncomingMessage): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.substring(7);

  try {
    const admin = await getFirebaseAdmin();
    const decodedToken = (await admin.auth().verifyIdToken(idToken)) as FirebaseDecodedToken;

    const db = await getFirestore();
    const query = db.collection('publishers').where('firebaseUid', '==', decodedToken.uid).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].id;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: err.message }, 'Failed to get publisher from token');
    return null;
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleDeveloperKeysRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/v1/developers/keys')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method?.toUpperCase();

  // Authenticate
  const publisherId = await getPublisherFromToken(req);
  if (!publisherId) {
    sendError(res, 'Authentication required', 401);
    return true;
  }

  try {
    // GET /api/v1/developers/keys - List all keys
    if (pathname === '/api/v1/developers/keys' && method === 'GET') {
      const keys = await listApiKeys(publisherId);

      sendJSON(res, {
        success: true,
        keys: keys.map((k) => ({
          id: k.id,
          keyPrefix: k.keyPrefix,
          type: k.type,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString(),
        })),
      });
      return true;
    }

    // POST /api/v1/developers/keys - Create new key
    if (pathname === '/api/v1/developers/keys' && method === 'POST') {
      const body = await parseBody<CreateKeyRequest>(req);

      if (!body.type || !['live', 'test'].includes(body.type)) {
        sendError(res, 'Key type must be "live" or "test"', 400);
        return true;
      }

      // Check key limit (max 10 keys per publisher)
      const existingKeys = await listApiKeys(publisherId);
      if (existingKeys.length >= 10) {
        sendError(res, 'Maximum 10 API keys allowed. Revoke unused keys first.', 400);
        return true;
      }

      try {
        const { apiKey, keyId } = await createApiKey(publisherId, body.type);

        log.info({ publisherId, keyId, keyType: body.type }, 'API key created via console');

        sendJSON(res, {
          success: true,
          key: {
            id: keyId,
            apiKey, // Full key - shown only once!
            type: body.type,
            createdAt: new Date().toISOString(),
          },
          warning: 'Save this API key now. You won\'t be able to see it again!',
        }, 201);
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // Handle specific errors
        if (err.message.includes('verified')) {
          sendError(res, 'Publisher must be verified to create live API keys', 403);
          return true;
        }

        throw err;
      }
    }

    // POST /api/v1/developers/keys/:id/rotate - Rotate key
    const rotateMatch = pathname.match(/^\/api\/v1\/developers\/keys\/([^/]+)\/rotate$/);
    if (rotateMatch && method === 'POST') {
      const keyId = rotateMatch[1];

      try {
        const { apiKey, keyId: newKeyId } = await rotateApiKey(publisherId, keyId);

        log.info({ publisherId, oldKeyId: keyId, newKeyId }, 'API key rotated via console');

        sendJSON(res, {
          success: true,
          key: {
            id: newKeyId,
            apiKey, // Full key - shown only once!
            createdAt: new Date().toISOString(),
          },
          warning: 'Save this new API key now. The old key has been revoked.',
        });
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err.message.includes('not found')) {
          sendError(res, 'API key not found', 404);
          return true;
        }
        if (err.message.includes('Not authorized')) {
          sendError(res, 'Not authorized to rotate this key', 403);
          return true;
        }

        throw err;
      }
    }

    // DELETE /api/v1/developers/keys/:id - Revoke key
    const deleteMatch = pathname.match(/^\/api\/v1\/developers\/keys\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const keyId = deleteMatch[1];

      try {
        await deleteApiKey(publisherId, keyId);

        log.info({ publisherId, keyId }, 'API key revoked via console');

        sendJSON(res, {
          success: true,
          message: 'API key revoked. It will no longer work for authentication.',
        });
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err.message.includes('not found')) {
          sendError(res, 'API key not found', 404);
          return true;
        }
        if (err.message.includes('Not authorized')) {
          sendError(res, 'Not authorized to revoke this key', 403);
          return true;
        }

        throw err;
      }
    }

    // Unknown keys route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname, publisherId }, 'Developer keys error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}
