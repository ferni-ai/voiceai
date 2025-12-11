/**
 * API Authentication Middleware
 *
 * Provides authentication and authorization for API endpoints.
 *
 * AUTHENTICATION STRATEGIES (in order of precedence):
 * 1. API Key (X-API-Key header) - For server-to-server calls
 * 2. Firebase ID Token (Authorization: Bearer) - Primary for frontend/app calls
 * 3. Dev Mode (X-Admin-Key: 'dev-mode') - For development/testing only
 *
 * Firebase Auth Integration:
 * - Frontend sends Firebase ID token in Authorization: Bearer header
 * - Backend verifies token using Firebase Admin SDK
 * - User ID is the Firebase UID (not device ID)
 * - Anonymous Firebase users are supported (zero-friction onboarding)
 *
 * USAGE:
 *   import { requireAuth, requireAdmin, optionalAuth } from './auth-middleware.js';
 *
 *   // In route handler:
 *   const auth = await requireAuth(req, res);
 *   if (!auth) return true; // Already sent 401
 *   const userId = auth.userId;
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { verifyFirebaseToken } from '../services/firebase-auth.js';
import { rateLimiter } from '../services/rate-limiter.js';
import {
  detectAnomalies,
  isLockedOut,
  recordSecurityEvent,
  recordSuccessfulAuth,
  trackFailedAuth,
} from '../services/security-events.js';
import { createLogger } from '../utils/safe-logger.js';
import { API_ERRORS } from './error-messages.js';
import { sendError } from './helpers.js';

const log = createLogger({ module: 'AuthMiddleware' });

// ============================================================================
// TYPES
// ============================================================================

export interface AuthContext {
  /** Primary user identifier (Firebase UID) */
  userId: string;
  /** Firebase UID if authenticated via Firebase */
  firebaseUid?: string;
  /** Whether user is an admin */
  isAdmin: boolean;
  /** Whether running in dev mode */
  isDevMode: boolean;
  /** Which auth method was used */
  authMethod: 'api_key' | 'firebase' | 'dev_mode';
  /** User's email (if available from Firebase) */
  email?: string;
  /** Whether Firebase user is anonymous */
  isAnonymous?: boolean;
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
const VALID_API_KEYS = new Set((process.env.API_KEYS || '').split(',').filter(Boolean));

/** Admin API keys with elevated privileges */
const ADMIN_API_KEYS = new Set((process.env.ADMIN_API_KEYS || '').split(',').filter(Boolean));

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
 * Extract IP address from request (handles proxies)
 */
function getClientIP(req: IncomingMessage): string {
  return (
    getHeader(req, 'X-Forwarded-For')?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Attempt to authenticate a request synchronously (API key and dev mode only).
 * Returns AuthContext if authenticated, null if not.
 * For Firebase auth, use requireAuth() which is async.
 */
export function authenticate(req: IncomingMessage): AuthContext | null {
  const ip = getClientIP(req);
  const userAgent = getHeader(req, 'User-Agent');

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
    // Invalid API key - track failure
    void trackFailedAuth(`apikey:${apiKey.substring(0, 8)}`, ip, 'invalid_api_key').catch((e) =>
      log.error({ error: String(e) }, 'Failed to track auth failure')
    );
    void recordSecurityEvent({
      type: 'api_key_invalid',
      ip,
      userAgent,
      action: 'Invalid API key attempted',
      outcome: 'failure',
      details: { keyPrefix: apiKey.substring(0, 8) },
    }).catch((e) => log.error({ error: String(e) }, 'Failed to record security event'));
    return null;
  }

  // 2. Check for Bearer token (will be verified async in requireAuth)
  const authHeader = getHeader(req, 'Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // Store token for async Firebase verification
    (req as IncomingMessage & { _pendingFirebaseToken?: string })._pendingFirebaseToken =
      authHeader.slice(7);
    return null; // Will be handled async in requireAuth
  }

  // 3. Check dev mode bypass (header only, no query params)
  if (IS_DEV) {
    const adminKeyHeader = getHeader(req, 'X-Admin-Key');
    if (adminKeyHeader === 'dev-mode') {
      const devUserId = getHeader(req, 'X-User-Id') || 'dev-user';
      return {
        userId: devUserId,
        isAdmin: true,
        isDevMode: true,
        authMethod: 'dev_mode',
      };
    }
  }

  return null;
}

/**
 * Try to verify a pending Firebase token from the request.
 * Returns AuthContext if valid Firebase token, null otherwise.
 */
async function tryFirebaseAuth(req: IncomingMessage): Promise<AuthContext | null> {
  const token = (req as IncomingMessage & { _pendingFirebaseToken?: string })._pendingFirebaseToken;
  if (!token) return null;

  const ip = getClientIP(req);
  const userAgent = getHeader(req, 'User-Agent');

  try {
    const verified = await verifyFirebaseToken(token);
    if (!verified) {
      // Track failed Firebase auth
      void trackFailedAuth(`firebase:${ip}`, ip, 'firebase_token_invalid').catch((e) =>
        log.error({ error: String(e) }, 'Failed to track auth failure')
      );
      return null;
    }

    return {
      userId: verified.uid,
      firebaseUid: verified.uid,
      isAdmin: verified.claims.admin === true,
      isDevMode: false,
      authMethod: 'firebase',
      email: verified.email,
      isAnonymous: verified.isAnonymous,
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Firebase token verification failed');
    void recordSecurityEvent({
      type: 'auth_failure',
      ip,
      userAgent,
      action: 'Firebase token verification failed',
      outcome: 'failure',
      details: { error: String(error) },
    }).catch((e) => log.error({ error: String(e) }, 'Failed to record security event'));
    return null;
  }
}

/**
 * Require authentication. Returns AuthContext or sends 401 and returns null.
 *
 * Enhanced with:
 * - Firebase ID token verification (async)
 * - Lockout checking (blocks requests from locked out users/IPs)
 * - Success tracking (clears failed attempt counters)
 * - Anomaly detection (flags unusual patterns)
 */
export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
  config: AuthConfig = {}
): Promise<AuthContext | null> {
  const { optional = false, requireAdmin = false, allowDevMode = true } = config;
  const ip = getClientIP(req);
  const userAgent = getHeader(req, 'User-Agent');

  // Check if IP is locked out before processing auth
  const ipLockout = isLockedOut(`ip:${ip}`);
  if (ipLockout.locked) {
    log.warn({ ip, lockoutUntil: ipLockout.lockoutUntil }, 'Request from locked out IP');
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil((ipLockout.remainingMs || 0) / 1000),
    });
    res.end(
      JSON.stringify({
        error: 'Too many failed attempts. Please try again later.',
        retryAfter: Math.ceil((ipLockout.remainingMs || 0) / 1000),
      })
    );
    return null;
  }

  // Try sync authentication first (API key, dev mode)
  let auth = authenticate(req);

  // If no sync auth and we have a pending Firebase token, try async Firebase auth
  if (!auth) {
    auth = await tryFirebaseAuth(req);
  }

  // No auth found
  if (!auth) {
    if (optional) return null;
    log.warn({ url: req.url, method: req.method }, 'Unauthorized request');
    sendError(res, API_ERRORS.AUTH_REQUIRED, 401);
    return null;
  }

  // Check if this specific user is locked out
  const userLockout = isLockedOut(auth.userId);
  if (userLockout.locked) {
    log.warn(
      { userId: auth.userId, lockoutUntil: userLockout.lockoutUntil },
      'Locked out user attempting access'
    );
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil((userLockout.remainingMs || 0) / 1000),
    });
    res.end(
      JSON.stringify({
        error: 'Account temporarily locked. Please try again later.',
        retryAfter: Math.ceil((userLockout.remainingMs || 0) / 1000),
      })
    );
    return null;
  }

  // Dev mode not allowed in this context
  if (auth.isDevMode && !allowDevMode && !IS_DEV) {
    log.warn({ url: req.url, userId: auth.userId }, 'Dev mode not allowed');
    sendError(res, API_ERRORS.AUTH_REQUIRED, 401);
    return null;
  }

  // Admin required but not admin
  if (requireAdmin && !auth.isAdmin) {
    log.warn({ url: req.url, userId: auth.userId }, 'Admin access required');
    sendError(res, 'Admin access required', 403);
    return null;
  }

  // Authentication successful - record and clear any failed attempts
  void recordSuccessfulAuth({
    userId: auth.userId,
    method: auth.authMethod === 'api_key' ? 'api_key' : 'firebase',
    ip,
    userAgent,
  });

  // Check for anomalies (fire and forget - doesn't block)
  void detectAnomalies({
    userId: auth.userId,
    ip,
    userAgent,
    action: `${req.method} ${req.url}`,
  });

  return auth;
}

/**
 * Sync version of requireAuth for backwards compatibility.
 * Does NOT verify Firebase tokens (use requireAuth for that).
 */
export function requireAuthSync(
  req: IncomingMessage,
  res: ServerResponse,
  config: AuthConfig = {}
): AuthContext | null {
  const { optional = false, requireAdmin = false, allowDevMode = true } = config;
  const ip = getClientIP(req);
  const userAgent = getHeader(req, 'User-Agent');

  // Check if IP is locked out
  const ipLockout = isLockedOut(`ip:${ip}`);
  if (ipLockout.locked) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil((ipLockout.remainingMs || 0) / 1000),
    });
    res.end(
      JSON.stringify({
        error: 'Too many failed attempts. Please try again later.',
        retryAfter: Math.ceil((ipLockout.remainingMs || 0) / 1000),
      })
    );
    return null;
  }

  const auth = authenticate(req);

  if (!auth) {
    if (optional) return null;
    sendError(res, API_ERRORS.AUTH_REQUIRED, 401);
    return null;
  }

  if (auth.isDevMode && !allowDevMode && !IS_DEV) {
    sendError(res, API_ERRORS.AUTH_REQUIRED, 401);
    return null;
  }

  if (requireAdmin && !auth.isAdmin) {
    sendError(res, 'Admin access required', 403);
    return null;
  }

  void recordSuccessfulAuth({
    userId: auth.userId,
    method: auth.authMethod === 'api_key' ? 'api_key' : 'firebase',
    ip,
    userAgent,
  });

  return auth;
}

/**
 * Require admin authentication (async - supports Firebase).
 */
export async function requireAdmin(
  req: IncomingMessage,
  res: ServerResponse
): Promise<AuthContext | null> {
  return requireAuth(req, res, { requireAdmin: true });
}

/**
 * Require admin authentication (sync - no Firebase).
 */
export function requireAdminSync(req: IncomingMessage, res: ServerResponse): AuthContext | null {
  return requireAuthSync(req, res, { requireAdmin: true });
}

/**
 * Optional authentication - returns auth context if present, null otherwise.
 * Never sends error response. Uses sync authentication only.
 */
export function optionalAuth(req: IncomingMessage): AuthContext | null {
  return authenticate(req);
}

/**
 * Optional authentication with Firebase support (async).
 */
export async function optionalAuthAsync(req: IncomingMessage): Promise<AuthContext | null> {
  let auth = authenticate(req);
  if (!auth) {
    auth = await tryFirebaseAuth(req);
  }
  return auth;
}

/**
 * Get user ID from request (with authentication, async).
 * Returns userId or sends 401 and returns null.
 */
export async function getAuthenticatedUserId(
  req: IncomingMessage,
  res: ServerResponse
): Promise<string | null> {
  const auth = await requireAuth(req, res);
  return auth?.userId || null;
}

/**
 * Get user ID from request (sync, no Firebase).
 */
export function getAuthenticatedUserIdSync(
  req: IncomingMessage,
  res: ServerResponse
): string | null {
  const auth = requireAuthSync(req, res);
  return auth?.userId || null;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitTier {
  name: string;
  maxRequests: number;
  windowMs: number;
}

/**
 * Rate limit tiers for different access levels
 */
export const RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  anonymous: { name: 'anonymous', maxRequests: 20, windowMs: 60000 },
  free: { name: 'free', maxRequests: 60, windowMs: 60000 },
  friend: { name: 'friend', maxRequests: 200, windowMs: 60000 },
  partner: { name: 'partner', maxRequests: 500, windowMs: 60000 },
  admin: { name: 'admin', maxRequests: 1000, windowMs: 60000 },
  expensive: { name: 'expensive', maxRequests: 10, windowMs: 60000 },
};

/**
 * Check rate limit for a key (sync version for backwards compatibility).
 * Uses in-memory store. For Redis support, use checkRateLimitAsync.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  return rateLimiter.checkSync(key, maxRequests, windowMs);
}

/**
 * Check rate limit for a key (async version with Redis support).
 * Uses Redis if available, falls back to in-memory.
 */
export async function checkRateLimitAsync(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  return rateLimiter.check(key, maxRequests, windowMs);
}

/**
 * Get rate limit tier based on auth context
 */
export function getRateLimitTier(auth: AuthContext | null): RateLimitTier {
  if (!auth) return RATE_LIMIT_TIERS.anonymous;
  if (auth.isAdmin) return RATE_LIMIT_TIERS.admin;
  if (auth.isDevMode) return RATE_LIMIT_TIERS.admin;
  return RATE_LIMIT_TIERS.free;
}

/**
 * Rate limit middleware with tier support.
 * Returns true if rate limited (response already sent), false if allowed.
 */
export function rateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    maxRequests?: number;
    windowMs?: number;
    tier?: RateLimitTier;
    keyGenerator?: (req: IncomingMessage) => string;
    keyPrefix?: string;
  } = {}
): boolean {
  const auth = authenticate(req);
  const defaultTier = getRateLimitTier(auth);

  const {
    maxRequests = options.tier?.maxRequests ?? defaultTier.maxRequests,
    windowMs = options.tier?.windowMs ?? defaultTier.windowMs,
    keyGenerator = (r) => getHeader(r, 'X-Forwarded-For') || r.socket.remoteAddress || 'unknown',
    keyPrefix = '',
  } = options;

  const baseKey = keyGenerator(req);
  const key = keyPrefix ? `${keyPrefix}:${baseKey}` : baseKey;
  const result = checkRateLimit(key, maxRequests, windowMs);

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    log.warn({ key, url: req.url, tier: defaultTier.name }, 'Rate limit exceeded');
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000),
    });
    res.end(
      JSON.stringify({
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      })
    );
    return true;
  }

  return false;
}

/**
 * Apply rate limiting for expensive operations (LLM calls, etc.)
 */
export function rateLimitExpensive(
  req: IncomingMessage,
  res: ServerResponse,
  operationName: string
): boolean {
  return rateLimit(req, res, {
    tier: RATE_LIMIT_TIERS.expensive,
    keyPrefix: `expensive:${operationName}`,
  });
}

// Note: Rate limit cleanup is handled by the rate-limiter service
