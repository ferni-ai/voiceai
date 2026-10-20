/**
 * Developer Platform API v2 - OAuth Routes
 *
 * Manages OAuth provider configurations and token management.
 * Enables BYOC (Bring Your Own Credentials) pattern where developers
 * register their own OAuth apps for external service integration.
 *
 * Endpoints:
 *   POST   /api/v2/developers/oauth/providers          - Register OAuth provider
 *   GET    /api/v2/developers/oauth/providers          - List providers
 *   GET    /api/v2/developers/oauth/providers/:id      - Get provider
 *   PUT    /api/v2/developers/oauth/providers/:id      - Update provider
 *   DELETE /api/v2/developers/oauth/providers/:id      - Delete provider
 *   POST   /api/v2/developers/oauth/authorize          - Get authorization URL
 *   POST   /api/v2/developers/oauth/callback           - Handle OAuth callback
 *   GET    /api/v2/developers/oauth/tokens             - List tokens
 *   POST   /api/v2/developers/oauth/tokens/:id/refresh - Refresh token using refresh_token
 *   GET    /api/v2/developers/oauth/tokens/:id/access  - Get access token (auto-refreshes if expired)
 *   DELETE /api/v2/developers/oauth/tokens/:id         - Revoke token
 *
 * Security:
 *   - All secrets (clientSecret, accessToken, refreshToken) encrypted with AES-256-GCM
 *   - State tokens expire after 10 minutes
 *   - Access tokens auto-refresh when within 5 minutes of expiration
 *
 * @module api/v2/developers/oauth-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { getLogger } from '../../../utils/safe-logger.js';
import { sendError } from '../../helpers.js';
import { encryptSensitive, decryptSensitive } from '../../../services/privacy-crypto.js';
import {
  requireApiKeyAuth,
  extractIdFromPath,
  parseJsonBody,
  generateId,
  sendItemResponse,
  sendPaginatedResponse,
} from './shared/middleware.js';
import {
  CreateOAuthProviderSchema,
  UpdateOAuthProviderSchema,
  PaginationSchema,
} from './shared/validation.js';
import type { DeveloperOAuthProvider, DeveloperOAuthToken } from './shared/types.js';
import { COLLECTIONS, ID_PREFIXES } from './shared/types.js';

const log = getLogger().child({ module: 'oauth-routes' });

/** Base path for OAuth API */
const BASE_PATH = '/api/v2/developers/oauth';

// ============================================================================
// HELPERS
// ============================================================================

/** Convert Firestore timestamp to Date */
function convertTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
}

/** Parse query string parameters */
function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return params;

  const queryString = url.slice(queryStart + 1);
  for (const pair of queryString.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return params;
}

/**
 * Encrypt OAuth secrets using AES-256-GCM
 * Uses the centralized privacy-crypto module for proper encryption
 */
async function encryptSecret(plaintext: string): Promise<string> {
  return encryptSensitive(plaintext);
}

/**
 * Decrypt OAuth secrets
 * Handles legacy base64-encoded secrets for backward compatibility
 */
async function decryptSecret(ciphertext: string): Promise<string> {
  // Handle legacy base64-encoded secrets (migration path)
  if (!ciphertext.startsWith('enc_')) {
    log.warn('Decrypting legacy base64 secret - consider migrating');
    return Buffer.from(ciphertext, 'base64').toString('utf8');
  }
  return decryptSensitive<string>(ciphertext);
}

/** Generate a secure state token for OAuth */
function generateStateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle all /api/v2/developers/oauth/* routes
 */
export async function handleOAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method || 'GET';
  const subPath = pathname.slice(BASE_PATH.length);

  // Provider routes
  if (subPath.startsWith('/providers')) {
    const providerSubPath = subPath.slice('/providers'.length);

    // POST /oauth/providers - Create provider
    if (method === 'POST' && (providerSubPath === '' || providerSubPath === '/')) {
      return handleCreateProvider(req, res);
    }

    // GET /oauth/providers - List providers
    if (method === 'GET' && (providerSubPath === '' || providerSubPath === '/')) {
      return handleListProviders(req, res);
    }

    // Extract provider ID
    const providerId = extractIdFromPath(providerSubPath, '/');
    if (providerId) {
      // GET /oauth/providers/:id - Get provider
      if (method === 'GET') {
        return handleGetProvider(req, res, providerId);
      }
      // PUT /oauth/providers/:id - Update provider
      if (method === 'PUT') {
        return handleUpdateProvider(req, res, providerId);
      }
      // DELETE /oauth/providers/:id - Delete provider
      if (method === 'DELETE') {
        return handleDeleteProvider(req, res, providerId);
      }
    }
  }

  // Token routes
  if (subPath.startsWith('/tokens')) {
    const tokenSubPath = subPath.slice('/tokens'.length);

    // GET /oauth/tokens - List tokens
    if (method === 'GET' && (tokenSubPath === '' || tokenSubPath === '/')) {
      return handleListTokens(req, res);
    }

    // Extract token ID and check for sub-actions
    const tokenPathParts = tokenSubPath.slice(1).split('/'); // Remove leading /
    const tokenId = tokenPathParts[0];
    const action = tokenPathParts[1];

    if (tokenId) {
      // POST /oauth/tokens/:id/refresh - Refresh token
      if (method === 'POST' && action === 'refresh') {
        return handleRefreshToken(req, res, tokenId);
      }
      // GET /oauth/tokens/:id/access - Get access token (auto-refresh if needed)
      if (method === 'GET' && action === 'access') {
        return handleGetAccessToken(req, res, tokenId);
      }
      // DELETE /oauth/tokens/:id - Revoke token
      if (method === 'DELETE' && !action) {
        return handleRevokeToken(req, res, tokenId);
      }
    }
  }

  // POST /oauth/authorize - Get authorization URL
  if (method === 'POST' && subPath === '/authorize') {
    return handleAuthorize(req, res);
  }

  // POST /oauth/callback - Handle OAuth callback
  if (method === 'POST' && subPath === '/callback') {
    return handleCallback(req, res);
  }

  return false;
}

// ============================================================================
// CREATE PROVIDER
// ============================================================================

/**
 * POST /oauth/providers - Register a new OAuth provider
 */
async function handleCreateProvider(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate
  const parseResult = CreateOAuthProviderSchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, `Validation error: ${parseResult.error.message}`, 400);
    return true;
  }

  const input = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Create provider document
    const providerId = generateId(ID_PREFIXES.OAUTH_PROVIDER);
    const now = new Date();

    const provider: Omit<DeveloperOAuthProvider, 'id'> = {
      publisherId: auth.publisherId,
      name: input.name,
      authorizationUrl: input.authorizationUrl,
      tokenUrl: input.tokenUrl,
      clientId: input.clientId,
      clientSecret: await encryptSecret(input.clientSecret), // Encrypt secret with AES-256-GCM
      scopes: input.scopes,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId).set(provider);

    log.info(
      { providerId, publisherId: auth.publisherId, name: input.name },
      'OAuth provider created'
    );

    // Return without exposing client secret
    const response: DeveloperOAuthProvider = {
      ...provider,
      id: providerId,
      clientSecret: '***REDACTED***',
    };

    sendItemResponse(res, response);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to create OAuth provider');
    sendError(res, 'Failed to create OAuth provider', 500);
    return true;
  }
}

// ============================================================================
// LIST PROVIDERS
// ============================================================================

/**
 * GET /oauth/providers - List OAuth providers
 */
async function handleListProviders(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse query params
  const queryParams = parseQueryParams(req.url || '');
  const parseResult = PaginationSchema.safeParse(queryParams);
  if (!parseResult.success) {
    sendError(res, `Invalid query parameters: ${parseResult.error.message}`, 400);
    return true;
  }

  const { limit = 50, cursor } = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    let query = db
      .collection(COLLECTIONS.OAUTH_PROVIDERS)
      .where('publisherId', '==', auth.publisherId)
      .orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();

    const providers: DeveloperOAuthProvider[] = [];
    let hasMore = false;

    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i === limit) {
        hasMore = true;
        break;
      }

      const doc = snapshot.docs[i];
      const data = doc.data() as Record<string, unknown>;

      providers.push({
        id: doc.id,
        publisherId: data.publisherId as string,
        name: data.name as string,
        authorizationUrl: data.authorizationUrl as string,
        tokenUrl: data.tokenUrl as string,
        clientId: data.clientId as string,
        clientSecret: '***REDACTED***', // Never expose
        scopes: data.scopes as string[],
        enabled: data.enabled as boolean,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        updatedAt: convertTimestamp(data.updatedAt) || new Date(),
      });
    }

    sendPaginatedResponse(res, providers, {
      limit,
      cursor: hasMore ? providers[providers.length - 1]?.id : undefined,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to list OAuth providers');
    sendError(res, 'Failed to list OAuth providers', 500);
    return true;
  }
}

// ============================================================================
// GET PROVIDER
// ============================================================================

/**
 * GET /oauth/providers/:id - Get a single OAuth provider
 */
async function handleGetProvider(
  req: IncomingMessage,
  res: ServerResponse,
  providerId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    const doc = await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId).get();

    if (!doc.exists) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    const provider: DeveloperOAuthProvider = {
      id: doc.id,
      publisherId: data.publisherId as string,
      name: data.name as string,
      authorizationUrl: data.authorizationUrl as string,
      tokenUrl: data.tokenUrl as string,
      clientId: data.clientId as string,
      clientSecret: '***REDACTED***', // Never expose
      scopes: data.scopes as string[],
      enabled: data.enabled as boolean,
      createdAt: convertTimestamp(data.createdAt) || new Date(),
      updatedAt: convertTimestamp(data.updatedAt) || new Date(),
    };

    sendItemResponse(res, provider);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, providerId }, 'Failed to get OAuth provider');
    sendError(res, 'Failed to get OAuth provider', 500);
    return true;
  }
}

// ============================================================================
// UPDATE PROVIDER
// ============================================================================

/**
 * PUT /oauth/providers/:id - Update an OAuth provider
 */
async function handleUpdateProvider(
  req: IncomingMessage,
  res: ServerResponse,
  providerId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate
  const parseResult = UpdateOAuthProviderSchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, `Validation error: ${parseResult.error.message}`, 400);
    return true;
  }

  const input = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId).get();

    if (!doc.exists) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    // Prepare updates
    const updates: Record<string, unknown> = {
      ...input,
      updatedAt: new Date(),
    };

    // Encrypt new client secret if provided
    if (input.clientSecret) {
      updates.clientSecret = await encryptSecret(input.clientSecret);
    }

    await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId).update(updates);

    log.info({ providerId, publisherId: auth.publisherId }, 'OAuth provider updated');

    // Return updated provider
    const updatedDoc = await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId).get();
    const updatedData = updatedDoc.data() as Record<string, unknown>;

    const provider: DeveloperOAuthProvider = {
      id: updatedDoc.id,
      publisherId: updatedData.publisherId as string,
      name: updatedData.name as string,
      authorizationUrl: updatedData.authorizationUrl as string,
      tokenUrl: updatedData.tokenUrl as string,
      clientId: updatedData.clientId as string,
      clientSecret: '***REDACTED***',
      scopes: updatedData.scopes as string[],
      enabled: updatedData.enabled as boolean,
      createdAt: convertTimestamp(updatedData.createdAt) || new Date(),
      updatedAt: convertTimestamp(updatedData.updatedAt) || new Date(),
    };

    sendItemResponse(res, provider);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, providerId }, 'Failed to update OAuth provider');
    sendError(res, 'Failed to update OAuth provider', 500);
    return true;
  }
}

// ============================================================================
// DELETE PROVIDER
// ============================================================================

/**
 * DELETE /oauth/providers/:id - Delete an OAuth provider and associated tokens
 */
async function handleDeleteProvider(
  req: IncomingMessage,
  res: ServerResponse,
  providerId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId).get();

    if (!doc.exists) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    const data = doc.data();
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    // Delete provider and tokens in batch
    const batch = db.batch();

    // Delete provider
    batch.delete(db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId));

    // Delete associated tokens
    const tokensSnapshot = await db
      .collection(COLLECTIONS.OAUTH_TOKENS)
      .where('providerId', '==', providerId)
      .limit(500)
      .get();

    for (const tokenDoc of tokensSnapshot.docs) {
      batch.delete(tokenDoc.ref);
    }

    await batch.commit();

    log.info({ providerId, publisherId: auth.publisherId }, 'OAuth provider deleted');

    sendItemResponse(res, { deleted: true });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, providerId }, 'Failed to delete OAuth provider');
    sendError(res, 'Failed to delete OAuth provider', 500);
    return true;
  }
}

// ============================================================================
// AUTHORIZE
// ============================================================================

/**
 * POST /oauth/authorize - Generate an authorization URL
 *
 * Request body:
 * {
 *   "providerId": "oauth_xxx",
 *   "redirectUri": "https://your-app.com/callback",
 *   "userId": "optional_user_id",
 *   "state": "optional_custom_state"
 * }
 */
async function handleAuthorize(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  const providerId = body.providerId as string;
  const redirectUri = body.redirectUri as string;
  const userId = body.userId as string | undefined;
  const customState = body.state as string | undefined;

  if (!providerId || !redirectUri) {
    sendError(res, 'Missing required fields: providerId, redirectUri', 400);
    return true;
  }

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Get provider
    const doc = await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId).get();

    if (!doc.exists) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    if (!data?.enabled) {
      sendError(res, 'OAuth provider is disabled', 400);
      return true;
    }

    // Generate state token
    const stateToken = generateStateToken();

    // Store state for callback verification
    const stateData = {
      providerId,
      publisherId: auth.publisherId,
      redirectUri,
      userId,
      customState,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    };

    await db.collection('oauth_states').doc(stateToken).set(stateData);

    // Build authorization URL
    const authUrl = new URL(data.authorizationUrl as string);
    authUrl.searchParams.set('client_id', data.clientId as string);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', (data.scopes as string[]).join(' '));
    authUrl.searchParams.set('state', stateToken);

    log.info({ providerId, publisherId: auth.publisherId }, 'OAuth authorization URL generated');

    sendItemResponse(res, {
      authorizationUrl: authUrl.toString(),
      state: stateToken,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, providerId }, 'Failed to generate authorization URL');
    sendError(res, 'Failed to generate authorization URL', 500);
    return true;
  }
}

// ============================================================================
// CALLBACK
// ============================================================================

/**
 * POST /oauth/callback - Handle OAuth callback and exchange code for tokens
 *
 * Request body:
 * {
 *   "code": "authorization_code_from_provider",
 *   "state": "state_token_from_authorize"
 * }
 */
async function handleCallback(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Note: Callback may not have API key auth if called from redirect
  // We validate via the state token instead

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  const code = body.code as string;
  const state = body.state as string;

  if (!code || !state) {
    sendError(res, 'Missing required fields: code, state', 400);
    return true;
  }

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify state token
    const stateDoc = await db.collection('oauth_states').doc(state).get();

    if (!stateDoc.exists) {
      sendError(res, 'Invalid or expired state token', 400);
      return true;
    }

    const stateData = stateDoc.data();
    if (!stateData) {
      sendError(res, 'Invalid state data', 400);
      return true;
    }

    // Check expiration
    const expiresAt = convertTimestamp(stateData.expiresAt);
    if (expiresAt && expiresAt < new Date()) {
      await stateDoc.ref.delete();
      sendError(res, 'State token has expired', 400);
      return true;
    }

    // Get provider
    const providerId = stateData.providerId as string;
    const providerDoc = await db.collection(COLLECTIONS.OAUTH_PROVIDERS).doc(providerId).get();

    if (!providerDoc.exists) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    const providerData = providerDoc.data() as Record<string, unknown>;

    // Exchange code for tokens
    const tokenResponse = await fetch(providerData.tokenUrl as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: stateData.redirectUri as string,
        client_id: providerData.clientId as string,
        client_secret: await decryptSecret(providerData.clientSecret as string),
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      log.error({ status: tokenResponse.status, error: errorText }, 'Token exchange failed');
      sendError(res, 'Failed to exchange authorization code', 400);
      return true;
    }

    const tokenData = (await tokenResponse.json()) as Record<string, unknown>;

    // Store token
    const tokenId = generateId(ID_PREFIXES.OAUTH_TOKEN);
    const now = new Date();

    const token: Omit<DeveloperOAuthToken, 'id'> = {
      publisherId: stateData.publisherId as string,
      providerId,
      userId: stateData.userId as string | undefined,
      accessToken: await encryptSecret(tokenData.access_token as string),
      refreshToken: tokenData.refresh_token
        ? await encryptSecret(tokenData.refresh_token as string)
        : undefined,
      expiresAt: tokenData.expires_in
        ? new Date(now.getTime() + (tokenData.expires_in as number) * 1000)
        : undefined,
      scopes: providerData.scopes as string[],
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(tokenId).set(token);

    // Delete used state token
    await stateDoc.ref.delete();

    log.info({ tokenId, providerId, publisherId: stateData.publisherId }, 'OAuth token stored');

    sendItemResponse(res, {
      tokenId,
      providerId,
      userId: stateData.userId,
      scopes: token.scopes,
      expiresAt: token.expiresAt?.toISOString(),
      customState: stateData.customState,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, state }, 'Failed to handle OAuth callback');
    sendError(res, 'Failed to handle OAuth callback', 500);
    return true;
  }
}

// ============================================================================
// LIST TOKENS
// ============================================================================

/**
 * GET /oauth/tokens - List OAuth tokens
 */
async function handleListTokens(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse query params
  const queryParams = parseQueryParams(req.url || '');
  const parseResult = PaginationSchema.safeParse(queryParams);
  if (!parseResult.success) {
    sendError(res, `Invalid query parameters: ${parseResult.error.message}`, 400);
    return true;
  }

  const { limit = 50, cursor } = parseResult.data;
  const providerId = queryParams.providerId;
  const userId = queryParams.userId;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    let query = db
      .collection(COLLECTIONS.OAUTH_TOKENS)
      .where('publisherId', '==', auth.publisherId)
      .orderBy('createdAt', 'desc');

    if (providerId) {
      query = query.where('providerId', '==', providerId);
    }
    if (userId) {
      query = query.where('userId', '==', userId);
    }

    if (cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();

    const tokens: (Omit<DeveloperOAuthToken, 'accessToken' | 'refreshToken'> & {
      hasRefreshToken: boolean;
    })[] = [];
    let hasMore = false;

    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i === limit) {
        hasMore = true;
        break;
      }

      const doc = snapshot.docs[i];
      const data = doc.data() as Record<string, unknown>;

      tokens.push({
        id: doc.id,
        publisherId: data.publisherId as string,
        providerId: data.providerId as string,
        userId: data.userId as string | undefined,
        scopes: data.scopes as string[],
        expiresAt: convertTimestamp(data.expiresAt),
        hasRefreshToken: !!data.refreshToken,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        updatedAt: convertTimestamp(data.updatedAt) || new Date(),
      });
    }

    sendPaginatedResponse(res, tokens, {
      limit,
      cursor: hasMore ? tokens[tokens.length - 1]?.id : undefined,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to list OAuth tokens');
    sendError(res, 'Failed to list OAuth tokens', 500);
    return true;
  }
}

// ============================================================================
// REFRESH TOKEN
// ============================================================================

/**
 * POST /oauth/tokens/:id/refresh - Refresh an OAuth token
 *
 * Uses the stored refresh_token to get a new access_token from the provider.
 */
async function handleRefreshToken(
  req: IncomingMessage,
  res: ServerResponse,
  tokenId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Get token
    const tokenDoc = await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(tokenId).get();

    if (!tokenDoc.exists) {
      sendError(res, 'OAuth token not found', 404);
      return true;
    }

    const tokenData = tokenDoc.data() as Record<string, unknown>;
    if (tokenData?.publisherId !== auth.publisherId) {
      sendError(res, 'OAuth token not found', 404);
      return true;
    }

    // Check for refresh token
    if (!tokenData.refreshToken) {
      sendError(res, 'Token does not have a refresh token', 400);
      return true;
    }

    // Get provider for token URL and client credentials
    const providerDoc = await db
      .collection(COLLECTIONS.OAUTH_PROVIDERS)
      .doc(tokenData.providerId as string)
      .get();

    if (!providerDoc.exists) {
      sendError(res, 'OAuth provider not found', 404);
      return true;
    }

    const providerData = providerDoc.data() as Record<string, unknown>;

    // Decrypt secrets
    const clientSecret = await decryptSecret(providerData.clientSecret as string);
    const refreshToken = await decryptSecret(tokenData.refreshToken as string);

    // Exchange refresh token for new access token
    const tokenResponse = await fetch(providerData.tokenUrl as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: providerData.clientId as string,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      log.error({ status: tokenResponse.status, error: errorText }, 'Token refresh failed');
      sendError(res, 'Failed to refresh token', 400);
      return true;
    }

    const newTokenData = (await tokenResponse.json()) as Record<string, unknown>;

    // Update stored token
    const now = new Date();
    const updates: Record<string, unknown> = {
      accessToken: await encryptSecret(newTokenData.access_token as string),
      updatedAt: now,
    };

    // Some providers return a new refresh token
    if (newTokenData.refresh_token) {
      updates.refreshToken = await encryptSecret(newTokenData.refresh_token as string);
    }

    // Update expiration
    if (newTokenData.expires_in) {
      updates.expiresAt = new Date(now.getTime() + (newTokenData.expires_in as number) * 1000);
    }

    await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(tokenId).update(updates);

    log.info(
      { tokenId, providerId: tokenData.providerId, publisherId: auth.publisherId },
      'OAuth token refreshed'
    );

    sendItemResponse(res, {
      tokenId,
      refreshed: true,
      expiresAt: updates.expiresAt ? (updates.expiresAt as Date).toISOString() : undefined,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, tokenId }, 'Failed to refresh OAuth token');
    sendError(res, 'Failed to refresh OAuth token', 500);
    return true;
  }
}

// ============================================================================
// GET ACCESS TOKEN
// ============================================================================

/**
 * GET /oauth/tokens/:id/access - Get a usable access token
 *
 * Returns the decrypted access token. Automatically refreshes if:
 * - Token has expired (or will expire within 5 minutes)
 * - A refresh token is available
 */
async function handleGetAccessToken(
  req: IncomingMessage,
  res: ServerResponse,
  tokenId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Get token
    const tokenDoc = await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(tokenId).get();

    if (!tokenDoc.exists) {
      sendError(res, 'OAuth token not found', 404);
      return true;
    }

    const tokenData = tokenDoc.data() as Record<string, unknown>;
    if (tokenData?.publisherId !== auth.publisherId) {
      sendError(res, 'OAuth token not found', 404);
      return true;
    }

    // Check if token needs refresh (expired or expires within 5 minutes)
    const expiresAt = convertTimestamp(tokenData.expiresAt);
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    const needsRefresh = expiresAt && expiresAt.getTime() - bufferMs < Date.now();

    if (needsRefresh && tokenData.refreshToken) {
      // Auto-refresh the token
      log.info({ tokenId }, 'Auto-refreshing expired token');

      const providerDoc = await db
        .collection(COLLECTIONS.OAUTH_PROVIDERS)
        .doc(tokenData.providerId as string)
        .get();

      if (!providerDoc.exists) {
        sendError(res, 'OAuth provider not found', 404);
        return true;
      }

      const providerData = providerDoc.data() as Record<string, unknown>;
      const clientSecret = await decryptSecret(providerData.clientSecret as string);
      const refreshToken = await decryptSecret(tokenData.refreshToken as string);

      const tokenResponse = await fetch(providerData.tokenUrl as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: providerData.clientId as string,
          client_secret: clientSecret,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        log.error({ status: tokenResponse.status, error: errorText }, 'Auto-refresh failed');
        // Continue with old token - may still work
      } else {
        const newTokenData = (await tokenResponse.json()) as Record<string, unknown>;

        // Update stored token
        const now = new Date();
        const updates: Record<string, unknown> = {
          accessToken: await encryptSecret(newTokenData.access_token as string),
          updatedAt: now,
        };

        if (newTokenData.refresh_token) {
          updates.refreshToken = await encryptSecret(newTokenData.refresh_token as string);
        }

        if (newTokenData.expires_in) {
          updates.expiresAt = new Date(now.getTime() + (newTokenData.expires_in as number) * 1000);
        }

        await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(tokenId).update(updates);

        // Re-fetch the updated token
        const updatedDoc = await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(tokenId).get();
        const updatedTokenData = updatedDoc.data() as Record<string, unknown>;

        const accessToken = await decryptSecret(updatedTokenData.accessToken as string);

        sendItemResponse(res, {
          tokenId,
          accessToken,
          expiresAt: updates.expiresAt ? (updates.expiresAt as Date).toISOString() : undefined,
          refreshed: true,
        });

        return true;
      }
    }

    // Return the current access token (decrypted)
    const accessToken = await decryptSecret(tokenData.accessToken as string);

    sendItemResponse(res, {
      tokenId,
      accessToken,
      expiresAt: expiresAt?.toISOString(),
      refreshed: false,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, tokenId }, 'Failed to get access token');
    sendError(res, 'Failed to get access token', 500);
    return true;
  }
}

// ============================================================================
// REVOKE TOKEN
// ============================================================================

/**
 * DELETE /oauth/tokens/:id - Revoke an OAuth token
 */
async function handleRevokeToken(
  req: IncomingMessage,
  res: ServerResponse,
  tokenId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(tokenId).get();

    if (!doc.exists) {
      sendError(res, 'OAuth token not found', 404);
      return true;
    }

    const data = doc.data();
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'OAuth token not found', 404);
      return true;
    }

    // Delete token
    await db.collection(COLLECTIONS.OAUTH_TOKENS).doc(tokenId).delete();

    log.info({ tokenId, publisherId: auth.publisherId }, 'OAuth token revoked');

    sendItemResponse(res, { revoked: true });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, tokenId }, 'Failed to revoke OAuth token');
    sendError(res, 'Failed to revoke OAuth token', 500);
    return true;
  }
}

export default { handleOAuthRoutes };
