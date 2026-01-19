/**
 * Developer Platform API v2 - Middleware
 *
 * Authentication and authorization middleware for developer APIs.
 * Reuses Firebase Auth from v1 developer-auth but adds v2-specific patterns.
 *
 * @module api/v2/developers/shared/middleware
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { sendError, sendJSON, getCorsHeaders } from '../../../helpers.js';
import {
  getPublisherFromToken,
  verifyFirebaseToken,
  getFirestore,
} from '../../../v1/developers/shared/developer-auth.js';
import { rateLimiter } from '../../../../services/rate-limiter.js';
import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger().child({ module: 'v2-developer-middleware' });

// ============================================================================
// TYPES
// ============================================================================

/** Authenticated request context */
export interface AuthContext {
  publisherId: string;
  firebaseUid: string;
  email?: string;
}

/** Request with auth context attached */
export interface AuthenticatedRequest extends IncomingMessage {
  auth?: AuthContext;
}

/** Route handler signature for v2 APIs */
export type V2RouteHandler = (
  req: AuthenticatedRequest,
  res: ServerResponse,
  params: RouteParams
) => Promise<void>;

/** Route parameters extracted from URL */
export interface RouteParams {
  id?: string;
  action?: string;
  [key: string]: string | undefined;
}

// ============================================================================
// CORS HANDLING
// ============================================================================

/**
 * Handle CORS preflight request
 * Returns true if this was a preflight request (already handled)
 */
export function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin as string | undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }

  // Add CORS headers for all responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  return false;
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Require publisher authentication
 *
 * Extracts and verifies Firebase token, looks up publisher.
 * Attaches auth context to request for downstream handlers.
 *
 * @returns Auth context if successful, null if auth failed (response already sent)
 */
export async function requirePublisherAuth(
  req: AuthenticatedRequest,
  res: ServerResponse
): Promise<AuthContext | null> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 'Missing or invalid Authorization header', 401);
    return null;
  }

  const idToken = authHeader.substring(7).trim();

  // Check for empty or obviously invalid token
  if (!idToken || idToken.length < 100) {
    // SECURITY: Never log any part of the token
    log.warn(
      { tokenLength: idToken?.length ?? 0 },
      'Empty or malformed token received'
    );
    sendError(res, 'Invalid token format', 401);
    return null;
  }

  try {
    // Verify Firebase token
    const decodedToken = await verifyFirebaseToken(idToken);
    if (!decodedToken) {
      sendError(res, 'Invalid or expired token', 401);
      return null;
    }

    // Get publisher ID from Firebase UID
    const publisherId = await getPublisherFromToken(req);
    if (!publisherId) {
      sendError(res, 'Publisher account not found', 403);
      return null;
    }

    const authContext: AuthContext = {
      publisherId,
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
    };

    // Attach to request for downstream handlers
    req.auth = authContext;

    return authContext;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: err.message }, 'Authentication failed');
    sendError(res, 'Authentication failed', 401);
    return null;
  }
}

/**
 * Optional publisher authentication
 *
 * Same as requirePublisherAuth but doesn't fail if no auth provided.
 * Useful for endpoints that work differently for authenticated users.
 */
export async function optionalPublisherAuth(
  req: AuthenticatedRequest,
  res: ServerResponse
): Promise<AuthContext | null> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return null; // No auth provided, but that's OK
  }

  return requirePublisherAuth(req, res);
}

// ============================================================================
// API KEY AUTHENTICATION (Alternative to Firebase)
// ============================================================================

/**
 * Authenticate via API key instead of Firebase token
 *
 * For server-to-server calls where Firebase isn't practical.
 * API keys are stored in the publishers collection.
 */
export async function requireApiKeyAuth(
  req: AuthenticatedRequest,
  res: ServerResponse
): Promise<AuthContext | null> {
  const apiKey =
    req.headers['x-api-key'] as string | undefined ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    sendError(res, 'Missing API key', 401);
    return null;
  }

  // API keys start with pk_live_ or pk_test_
  if (!apiKey.startsWith('pk_live_') && !apiKey.startsWith('pk_test_')) {
    // Not an API key, might be Firebase token
    return requirePublisherAuth(req, res);
  }

  try {
    const db = await getFirestore();

    // Look up API key
    const keysSnapshot = await db
      .collection('developer_api_keys')
      .where('key', '==', apiKey)
      .where('enabled', '==', true)
      .limit(1)
      .get();

    if (keysSnapshot.empty) {
      sendError(res, 'Invalid or disabled API key', 401);
      return null;
    }

    const keyDoc = keysSnapshot.docs[0];
    const keyData = keyDoc.data();

    if (!keyData) {
      sendError(res, 'Invalid API key data', 401);
      return null;
    }

    const authContext: AuthContext = {
      publisherId: keyData.publisherId as string,
      firebaseUid: keyData.firebaseUid as string,
      email: keyData.email as string | undefined,
    };

    req.auth = authContext;

    // Update last used timestamp (fire and forget)
    db.collection('developer_api_keys')
      .doc(keyDoc.id)
      .update({ lastUsedAt: new Date() })
      .catch(() => {
        // Ignore update failures
      });

    return authContext;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: err.message }, 'API key authentication failed');
    sendError(res, 'Authentication failed', 401);
    return null;
  }
}

// ============================================================================
// ROUTE HELPERS
// ============================================================================

/**
 * Extract route parameters from URL path
 *
 * Pattern: /api/v2/developers/{resource}/{id}/{action}
 * Examples:
 *   /api/v2/developers/mcp-servers → { }
 *   /api/v2/developers/mcp-servers/mcp_123 → { id: 'mcp_123' }
 *   /api/v2/developers/mcp-servers/mcp_123/test → { id: 'mcp_123', action: 'test' }
 */
export function extractRouteParams(pathname: string, basePath: string): RouteParams {
  const params: RouteParams = {};

  // Remove base path and split remaining segments
  const remaining = pathname.replace(basePath, '').replace(/^\/+/, '');
  const segments = remaining.split('/').filter(Boolean);

  if (segments.length >= 1) {
    params.id = segments[0];
  }
  if (segments.length >= 2) {
    params.action = segments[1];
  }

  return params;
}

/**
 * Match HTTP method and extract params
 *
 * Returns null if method doesn't match, params if it does.
 */
export function matchRoute(
  req: IncomingMessage,
  expectedMethod: string,
  pathname: string,
  basePath: string,
  options: {
    requireId?: boolean;
    requireAction?: string;
  } = {}
): RouteParams | null {
  if (req.method !== expectedMethod) {
    return null;
  }

  if (!pathname.startsWith(basePath)) {
    return null;
  }

  const params = extractRouteParams(pathname, basePath);

  if (options.requireId && !params.id) {
    return null;
  }

  if (options.requireAction && params.action !== options.requireAction) {
    return null;
  }

  return params;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

/**
 * Send paginated list response
 */
export function sendPaginatedResponse<T>(
  res: ServerResponse,
  data: T[],
  options: {
    total?: number;
    page?: number;
    limit?: number;
    cursor?: string;
  } = {}
): void {
  sendJSON(res, {
    success: true,
    data,
    meta: {
      total: options.total ?? data.length,
      page: options.page ?? 1,
      limit: options.limit ?? data.length,
      ...(options.cursor && { cursor: options.cursor }),
    },
  });
}

/**
 * Send single item response
 */
export function sendItemResponse<T>(res: ServerResponse, data: T): void {
  sendJSON(res, {
    success: true,
    data,
  });
}

/**
 * Send success response with optional message
 */
export function sendSuccess(res: ServerResponse, message?: string): void {
  sendJSON(res, {
    success: true,
    ...(message && { message }),
  });
}

// ============================================================================
// REQUEST BODY HELPERS
// ============================================================================

/**
 * Parse JSON body from request
 *
 * Returns null if body is empty or invalid JSON.
 */
export async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      if (!body) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });

    req.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Extract ID from path segment
 *
 * Example: extractIdFromPath('/mcp_123/test', '/') → 'mcp_123'
 */
export function extractIdFromPath(subPath: string, prefix: string): string | null {
  // Remove leading prefix if present
  const path = subPath.startsWith(prefix) ? subPath.slice(prefix.length) : subPath;

  // Split and get first segment
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  return segments[0];
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique ID with prefix
 *
 * Format: {prefix}{timestamp_base36}_{random_base36}
 * Example: mcp_lqx7abc_k3m9
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}${timestamp}_${random}`;
}

// ============================================================================
// OWNERSHIP VERIFICATION
// ============================================================================

/**
 * Verify publisher owns the resource
 *
 * @returns true if owned, false if not (sends 404 response)
 */
export function verifyOwnership(
  res: ServerResponse,
  resourcePublisherId: string | undefined,
  authContext: AuthContext
): boolean {
  if (resourcePublisherId !== authContext.publisherId) {
    // Return 404 instead of 403 to avoid leaking existence info
    sendError(res, 'Resource not found', 404);
    return false;
  }
  return true;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Rate limit tiers for Developer Platform APIs
 */
export const DEVELOPER_RATE_LIMITS = {
  // Standard CRUD operations
  standard: { maxRequests: 100, windowMs: 60000 }, // 100/min
  // Read-heavy operations (list, get)
  read: { maxRequests: 200, windowMs: 60000 }, // 200/min
  // Write operations (create, update, delete)
  write: { maxRequests: 50, windowMs: 60000 }, // 50/min
  // Expensive operations (test connections, execute)
  expensive: { maxRequests: 10, windowMs: 60000 }, // 10/min
  // Webhook delivery logs (can be large)
  logs: { maxRequests: 30, windowMs: 60000 }, // 30/min
};

/**
 * Check rate limit for Developer Platform API
 *
 * @param res - Response object (sends 429 if rate limited)
 * @param auth - Auth context (uses publisherId as rate limit key)
 * @param operation - Operation type for tier selection
 * @returns true if rate limited (response sent), false if allowed
 */
export async function checkDeveloperRateLimit(
  res: ServerResponse,
  auth: AuthContext,
  operation: keyof typeof DEVELOPER_RATE_LIMITS = 'standard'
): Promise<boolean> {
  const tier = DEVELOPER_RATE_LIMITS[operation];
  const key = `devapi:${auth.publisherId}:${operation}`;

  const result = await rateLimiter.check(key, tier.maxRequests, tier.windowMs);

  if (!result.allowed) {
    log.warn(
      { publisherId: auth.publisherId, operation, resetAt: result.resetAt },
      'Developer API rate limited'
    );

    res.setHeader('X-RateLimit-Limit', tier.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());
    res.setHeader('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000).toString());

    sendError(res, 'Rate limit exceeded. Please try again later.', 429);
    return true; // Rate limited
  }

  // Add rate limit headers for non-limited requests too
  res.setHeader('X-RateLimit-Limit', tier.maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());

  return false; // Not rate limited
}
