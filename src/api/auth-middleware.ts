/**
 * API Authentication Middleware
 *
 * Provides authentication and authorization for API endpoints.
 *
 * AUTHENTICATION STRATEGIES:
 * 1. API Key (X-API-Key header) - For server-to-server calls
 * 2. JWT Token (Authorization: Bearer) - For frontend/app calls
 * 3. User ID (X-User-Id header) - For authenticated user context
 * 4. Dev Mode (admin_key: 'dev-mode') - For development/testing
 *
 * USAGE:
 *   import { requireAuth, requireAdmin, optionalAuth } from './auth-middleware.js';
 *
 *   // In route handler:
 *   const auth = requireAuth(req, res);
 *   if (!auth) return true; // Already sent 401
 *   const userId = auth.userId;
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { createLogger } from '../utils/safe-logger.js';
import { sendError } from './helpers.js';

const log = createLogger({ module: 'AuthMiddleware' });

// ============================================================================
// TYPES
// ============================================================================

export interface AuthContext {
  userId: string;
  isAdmin: boolean;
  isDevMode: boolean;
  authMethod: 'api_key' | 'jwt' | 'user_id' | 'dev_mode';
}

export interface AuthConfig {
  /** Allow unauthenticated requests (returns null instead of 401) */
  optional?: boolean;
  /** Require admin privileges */
  requireAdmin?: boolean;
  /** Allow dev mode bypass */
  allowDevMode?: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** API keys for server-to-server auth (loaded from env) */
const VALID_API_KEYS = new Set(
  (process.env.API_KEYS || '').split(',').filter(Boolean)
);

/** Admin API keys with elevated privileges */
const ADMIN_API_KEYS = new Set(
  (process.env.ADMIN_API_KEYS || '').split(',').filter(Boolean)
);

/** JWT secret for token verification */
const JWT_SECRET = process.env.JWT_SECRET || '';

/** Whether we're in development mode */
const IS_DEV = process.env.NODE_ENV !== 'production';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract header value (handles array case)
 */
function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * JWT Payload interface
 */
interface JWTPayload {
  sub?: string;
  admin?: boolean;
  exp?: number;
  iat?: number;
}

/**
 * Decode JWT payload without verification (for extracting claims after verification)
 */
function decodeJWTPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload;
  } catch {
    return null;
  }
}

/**
 * Create HMAC-SHA256 signature for JWT verification
 * Uses Node.js built-in crypto module (no external dependencies)
 */
function createJWTSignature(header: string, payload: string, secret: string): string {
  const data = `${header}.${payload}`;
  return createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
}

/**
 * Verify JWT token with cryptographic signature validation
 * Supports HS256 algorithm (HMAC-SHA256)
 */
function verifyJWT(token: string): { userId: string; isAdmin: boolean } | null {
  // Require JWT_SECRET in production
  if (!JWT_SECRET) {
    if (!IS_DEV) {
      log.error('JWT_SECRET not configured - JWT verification disabled in production');
      return null;
    }
    // In dev mode, allow unverified tokens with warning
    log.warn('JWT_SECRET not set - accepting tokens without signature verification (dev mode only)');
    const payload = decodeJWTPayload(token);
    if (!payload || !payload.sub) return null;
    return {
      userId: payload.sub,
      isAdmin: payload.admin === true,
    };
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      log.debug('Invalid JWT format: expected 3 parts');
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify header is HS256
    try {
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
      if (header.alg !== 'HS256') {
        log.warn({ alg: header.alg }, 'Unsupported JWT algorithm (only HS256 supported)');
        return null;
      }
    } catch {
      log.debug('Invalid JWT header');
      return null;
    }

    // Verify signature using timing-safe comparison
    const expectedSignature = createJWTSignature(headerB64, payloadB64, JWT_SECRET);
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
    const actualBuffer = Buffer.from(signatureB64, 'base64url');

    // Timing-safe comparison to prevent timing attacks
    if (expectedBuffer.length !== actualBuffer.length || 
        !timingSafeEqual(expectedBuffer, actualBuffer)) {
      log.debug('JWT signature verification failed');
      return null;
    }

    // Decode and validate payload
    const payload = decodeJWTPayload(token);
    if (!payload || !payload.sub) {
      log.debug('JWT missing required "sub" claim');
      return null;
    }

    // Check expiration
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        log.debug({ exp: payload.exp, now }, 'JWT expired');
        return null;
      }
    }

    return {
      userId: payload.sub,
      isAdmin: payload.admin === true,
    };
  } catch (error) {
    log.error({ error }, 'JWT verification error');
    return null;
  }
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Attempt to authenticate a request.
 * Returns AuthContext if authenticated, null if not.
 */
export function authenticate(req: IncomingMessage): AuthContext | null {
  // 1. Check API Key
  const apiKey = getHeader(req, 'X-API-Key');
  if (apiKey) {
    if (ADMIN_API_KEYS.has(apiKey)) {
      return {
        userId: 'system',
        isAdmin: true,
        isDevMode: false,
        authMethod: 'api_key',
      };
    }
    if (VALID_API_KEYS.has(apiKey)) {
      const userId = getHeader(req, 'X-User-Id') || 'api-user';
      return {
        userId,
        isAdmin: false,
        isDevMode: false,
        authMethod: 'api_key',
      };
    }
    // Invalid API key - don't fall through
    return null;
  }

  // 2. Check JWT Bearer token
  const authHeader = getHeader(req, 'Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const verified = verifyJWT(token);
    if (verified) {
      return {
        userId: verified.userId,
        isAdmin: verified.isAdmin,
        isDevMode: false,
        authMethod: 'jwt',
      };
    }
    // Invalid JWT - don't fall through
    return null;
  }

  // 3. Check User ID header (requires dev mode or trusted context)
  const userId = getHeader(req, 'X-User-Id');
  if (userId && IS_DEV) {
    return {
      userId,
      isAdmin: false,
      isDevMode: true,
      authMethod: 'user_id',
    };
  }

  // 4. Check dev mode bypass
  if (IS_DEV) {
    // Check query params for admin_key
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const adminKey = url.searchParams.get('admin_key');
    if (adminKey === 'dev-mode') {
      const devUserId = url.searchParams.get('userId') || 'dev-user';
      return {
        userId: devUserId,
        isAdmin: true,
        isDevMode: true,
        authMethod: 'dev_mode',
      };
    }

    // Allow userId from query in dev
    const queryUserId = url.searchParams.get('userId');
    if (queryUserId) {
      return {
        userId: queryUserId,
        isAdmin: false,
        isDevMode: true,
        authMethod: 'user_id',
      };
    }
  }

  return null;
}

/**
 * Require authentication. Returns AuthContext or sends 401 and returns null.
 */
export function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
  config: AuthConfig = {}
): AuthContext | null {
  const { optional = false, requireAdmin = false, allowDevMode = true } = config;

  const auth = authenticate(req);

  // No auth found
  if (!auth) {
    if (optional) return null;
    log.warn({ url: req.url, method: req.method }, 'Unauthorized request');
    sendError(res, 'Authentication required', 401);
    return null;
  }

  // Dev mode not allowed in this context
  if (auth.isDevMode && !allowDevMode && !IS_DEV) {
    log.warn({ url: req.url, userId: auth.userId }, 'Dev mode not allowed');
    sendError(res, 'Authentication required', 401);
    return null;
  }

  // Admin required but not admin
  if (requireAdmin && !auth.isAdmin) {
    log.warn({ url: req.url, userId: auth.userId }, 'Admin access required');
    sendError(res, 'Admin access required', 403);
    return null;
  }

  return auth;
}

/**
 * Require admin authentication.
 */
export function requireAdmin(
  req: IncomingMessage,
  res: ServerResponse
): AuthContext | null {
  return requireAuth(req, res, { requireAdmin: true });
}

/**
 * Optional authentication - returns auth context if present, null otherwise.
 * Never sends error response.
 */
export function optionalAuth(req: IncomingMessage): AuthContext | null {
  return authenticate(req);
}

/**
 * Get user ID from request (with authentication).
 * Returns userId or sends 401 and returns null.
 */
export function getAuthenticatedUserId(
  req: IncomingMessage,
  res: ServerResponse
): string | null {
  const auth = requireAuth(req, res);
  return auth?.userId || null;
}

// ============================================================================
// RATE LIMITING (Simple in-memory implementation)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check rate limit for a key.
 * Returns true if allowed, false if rate limited.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Rate limit middleware.
 * Returns true if rate limited (response already sent), false if allowed.
 */
export function rateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    maxRequests?: number;
    windowMs?: number;
    keyGenerator?: (req: IncomingMessage) => string;
  } = {}
): boolean {
  const {
    maxRequests = 100,
    windowMs = 60000, // 1 minute
    keyGenerator = (r) => getHeader(r, 'X-Forwarded-For') || r.socket.remoteAddress || 'unknown',
  } = options;

  const key = keyGenerator(req);
  const allowed = checkRateLimit(key, maxRequests, windowMs);

  if (!allowed) {
    log.warn({ key, url: req.url }, 'Rate limit exceeded');
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }));
    return true;
  }

  return false;
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Every minute

