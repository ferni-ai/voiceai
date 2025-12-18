/**
 * Publisher Authentication System
 *
 * Provides secure authentication for marketplace publishers using API keys.
 * Includes publisher registration, API key management, and request middleware.
 *
 * Key Features:
 * - Publisher registration with unique IDs
 * - API key generation (live/test keys)
 * - Secure key storage (hashed, not plaintext)
 * - Key rotation and lifecycle management
 * - Express/vanilla HTTP middleware
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { removeUndefined } from '../utils/firestore-utils.js';
import { getLogger } from '../utils/safe-logger.js';
import {
  generateApiKey,
  generateApiKeyId,
  generatePublisherId,
  hashApiKey,
  extractKeyPrefix,
} from './publisher-auth-crypto.js';

const log = getLogger().child({ module: 'publisher-auth' });

// ============================================================================
// TYPES
// ============================================================================

export interface Publisher {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  publisherId: string;
  keyHash: string;
  keyPrefix: string; // First 8 chars for display
  type: 'live' | 'test';
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface PublisherSession {
  publisherId: string;
  publisherName: string;
  verified: boolean;
  keyType: 'live' | 'test';
}

interface FirestoreConfig {
  projectId?: string;
  databaseId?: string;
}

interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  where: (field: string, op: string, value: unknown) => Query;
  get: () => Promise<QuerySnapshot>;
}

interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  delete: () => Promise<unknown>;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

interface Query {
  where: (field: string, op: string, value: unknown) => Query;
  get: () => Promise<QuerySnapshot>;
  limit: (n: number) => Query;
}

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let db: Firestore | null = null;
let initPromise: Promise<void> | null = null;

async function getFirestore(): Promise<Firestore> {
  if (db) return db;

  // Prevent race conditions with cached promise
  if (initPromise) {
    await initPromise;
    if (db) return db;
  }

  initPromise = (async () => {
    try {
      const { Firestore } = await import('@google-cloud/firestore');

      const config: FirestoreConfig = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      };

      db = new Firestore(config) as unknown as Firestore;
      log.info({ projectId: config.projectId }, 'Firestore initialized for publisher auth');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Failed to initialize Firestore');
      throw err;
    }
  })();

  await initPromise;
  if (!db) throw new Error('Firestore initialization failed');
  return db;
}

// ============================================================================
// PUBLISHER MANAGEMENT
// ============================================================================

/**
 * Register a new publisher
 */
export async function registerPublisher(
  email: string,
  name: string
): Promise<{ publisher: Publisher; apiKey: string }> {
  const db = await getFirestore();

  // Check if email already registered
  const existingQuery = db.collection('publishers').where('email', '==', email);
  const existing = await existingQuery.get();

  if (!existing.empty) {
    throw new Error('Email already registered');
  }

  // Create publisher
  const publisherId = generatePublisherId();
  const publisher: Publisher = {
    id: publisherId,
    email,
    name,
    verified: false, // Starts unverified
    createdAt: new Date(),
  };

  // Store in Firestore
  await db.collection('publishers').doc(publisherId).set(publisher);

  // Generate initial test API key
  const apiKey = generateApiKey('test');
  const keyId = generateApiKeyId();
  const keyDoc: ApiKey = {
    id: keyId,
    publisherId,
    keyHash: hashApiKey(apiKey),
    keyPrefix: extractKeyPrefix(apiKey),
    type: 'test',
    createdAt: new Date(),
  };

  await db.collection('api_keys').doc(keyId).set(keyDoc);

  log.info({ publisherId, email, name }, 'Publisher registered');

  return { publisher, apiKey };
}

/**
 * Get publisher by ID
 */
export async function getPublisher(publisherId: string): Promise<Publisher | null> {
  const db = await getFirestore();
  const doc = await db.collection('publishers').doc(publisherId).get();

  if (!doc.exists) return null;

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

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Create a new API key for a publisher
 */
export async function createApiKey(
  publisherId: string,
  keyType: 'live' | 'test'
): Promise<{ apiKey: string; keyId: string }> {
  const db = await getFirestore();

  // Verify publisher exists
  const publisher = await getPublisher(publisherId);
  if (!publisher) {
    throw new Error('Publisher not found');
  }

  // Live keys require verified publisher
  if (keyType === 'live' && !publisher.verified) {
    throw new Error('Publisher must be verified to create live API keys');
  }

  // Generate API key
  const apiKey = generateApiKey(keyType);
  const keyId = generateApiKeyId();
  const keyDoc: ApiKey = {
    id: keyId,
    publisherId,
    keyHash: hashApiKey(apiKey),
    keyPrefix: extractKeyPrefix(apiKey),
    type: keyType,
    createdAt: new Date(),
  };

  await db.collection('api_keys').doc(keyId).set(keyDoc);

  log.info({ publisherId, keyId, keyType, keyPrefix: keyDoc.keyPrefix }, 'API key created');

  return { apiKey, keyId };
}

/**
 * Validate an API key and return publisher session
 */
export async function validateApiKey(apiKey: string): Promise<PublisherSession | null> {
  const db = await getFirestore();

  // Hash the provided key
  const keyHash = hashApiKey(apiKey);

  // Find key by hash
  const keysQuery = db.collection('api_keys').where('keyHash', '==', keyHash).limit(1);
  const keysSnapshot = await keysQuery.get();

  if (keysSnapshot.empty) {
    log.warn({ keyPrefix: extractKeyPrefix(apiKey) }, 'Invalid API key');
    return null;
  }

  const keyDoc = keysSnapshot.docs[0];
  const keyData = keyDoc.data();
  if (!keyData) return null;

  const apiKeyData: ApiKey = {
    id: keyDoc.id,
    publisherId: keyData.publisherId as string,
    keyHash: keyData.keyHash as string,
    keyPrefix: keyData.keyPrefix as string,
    type: keyData.type as 'live' | 'test',
    createdAt: (keyData.createdAt as { toDate: () => Date }).toDate(),
    lastUsedAt: keyData.lastUsedAt
      ? (keyData.lastUsedAt as { toDate: () => Date }).toDate()
      : undefined,
  };

  // Get publisher
  const publisher = await getPublisher(apiKeyData.publisherId);
  if (!publisher) {
    log.error({ publisherId: apiKeyData.publisherId }, 'API key references non-existent publisher');
    return null;
  }

  // Update last used timestamp (async, don't wait)
  db.collection('api_keys')
    .doc(keyDoc.id)
    .set(removeUndefined({ lastUsedAt: new Date() }), { merge: true })
    .catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message, keyId: keyDoc.id }, 'Failed to update lastUsedAt');
    });

  log.debug({ publisherId: publisher.id, keyType: apiKeyData.type }, 'API key validated');

  return {
    publisherId: publisher.id,
    publisherName: publisher.name,
    verified: publisher.verified,
    keyType: apiKeyData.type,
  };
}

/**
 * Rotate an API key (invalidate old, create new)
 */
export async function rotateApiKey(
  publisherId: string,
  keyId: string
): Promise<{ apiKey: string; keyId: string }> {
  const db = await getFirestore();

  // Get the old key
  const oldKeyDoc = await db.collection('api_keys').doc(keyId).get();
  if (!oldKeyDoc.exists) {
    throw new Error('API key not found');
  }

  const oldKeyData = oldKeyDoc.data();
  if (!oldKeyData) {
    throw new Error('API key data missing');
  }

  // Verify ownership
  if (oldKeyData.publisherId !== publisherId) {
    throw new Error('Not authorized to rotate this key');
  }

  const keyType = oldKeyData.type as 'live' | 'test';

  // Create new key
  const { apiKey, keyId: newKeyId } = await createApiKey(publisherId, keyType);

  // Delete old key
  await db.collection('api_keys').doc(keyId).delete();

  log.info({ publisherId, oldKeyId: keyId, newKeyId, keyType }, 'API key rotated');

  return { apiKey, keyId: newKeyId };
}

/**
 * List all API keys for a publisher
 */
export async function listApiKeys(publisherId: string): Promise<Array<Omit<ApiKey, 'keyHash'>>> {
  const db = await getFirestore();

  const keysQuery = db.collection('api_keys').where('publisherId', '==', publisherId);
  const keysSnapshot = await keysQuery.get();

  const keys = keysSnapshot.docs.map((doc) => {
    const data = doc.data();
    if (!data) throw new Error(`API key ${doc.id} has no data`);
    return {
      id: doc.id,
      publisherId: data.publisherId as string,
      keyPrefix: data.keyPrefix as string,
      type: data.type as 'live' | 'test',
      createdAt: (data.createdAt as { toDate: () => Date }).toDate(),
      lastUsedAt: data.lastUsedAt
        ? (data.lastUsedAt as { toDate: () => Date }).toDate()
        : undefined,
    };
  });

  return keys;
}

/**
 * Delete an API key
 */
export async function deleteApiKey(publisherId: string, keyId: string): Promise<void> {
  const db = await getFirestore();

  // Get the key
  const keyDoc = await db.collection('api_keys').doc(keyId).get();
  if (!keyDoc.exists) {
    throw new Error('API key not found');
  }

  const keyData = keyDoc.data();
  if (!keyData) {
    throw new Error('API key data missing');
  }

  // Verify ownership
  if (keyData.publisherId !== publisherId) {
    throw new Error('Not authorized to delete this key');
  }

  // Delete key
  await db.collection('api_keys').doc(keyId).delete();

  log.info({ publisherId, keyId }, 'API key deleted');
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Extract API key from request headers
 */
function extractApiKeyFromRequest(req: IncomingMessage): string | null {
  // Try Authorization: Bearer pk_xxx
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try x-api-key: pk_xxx
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Middleware to require publisher authentication
 *
 * Usage:
 *   if (!await requirePublisherAuth(req, res)) return;
 *   // Continue with authenticated request
 */
export async function requirePublisherAuth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<PublisherSession | null> {
  const apiKey = extractApiKeyFromRequest(req);

  if (!apiKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'API key required',
        message: 'Provide API key via Authorization: Bearer <key> or x-api-key header',
      })
    );
    return null;
  }

  const session = await validateApiKey(apiKey);

  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Invalid API key',
        message: 'The provided API key is invalid or has been revoked',
      })
    );
    return null;
  }

  // Attach session to request for downstream handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).publisherSession = session;

  return session;
}

/**
 * Get publisher session from request (after middleware)
 */
export function getPublisherSession(req: IncomingMessage): PublisherSession | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).publisherSession || null;
}
