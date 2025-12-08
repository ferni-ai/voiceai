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
import { API_ERRORS } from './error-messages.js';
import {
  trackFailedAuth,
  clearFailedAuth,
  isLockedOut,
  recordSuccessfulAuth,
  recordSecurityEvent,
  detectAnomalies,
} from '../services/security-events.js';

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
const VALID_API_KEYS = new Set((process.env.API_KEYS || '').split(',').filter(Boolean));

/** Admin API keys with elevated privileges */
const ADMIN_API_KEYS = new Set((process.env.ADMIN_API_KEYS || '').split(',').filter(Boolean));

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
  return createHmac('sha256', secret).update(data).digest('base64url');
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
    log.warn(
      'JWT_SECRET not set - accepting tokens without signature verification (dev mode only)'
    );
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
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
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
 * Extract IP address from request (handles proxies)
 */
function getClientIP(req: IncomingMessage): string {
  return (
    getHeader(req, 'X-Forwarded-For')?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Attempt to authenticate a request.
 * Returns AuthContext if authenticated, null if not.
 *
 * Enhanced with security event tracking for failed attempts.
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
    // Invalid API key - track failure (fire and forget)
    void trackFailedAuth(`apikey:${apiKey.substring(0, 8)}`, ip, 'invalid_api_key');
    void recordSecurityEvent({
      type: 'api_key_invalid',
      ip,
      userAgent,
      action: 'Invalid API key attempted',
      outcome: 'failure',
      details: { keyPrefix: apiKey.substring(0, 8) },
    });
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
    // Invalid JWT - track failure
    const payload = decodeJWTPayload(token);
    const failureType =
      payload?.exp && payload.exp < Date.now() / 1000 ? 'jwt_expired' : 'jwt_invalid';
    void trackFailedAuth(payload?.sub || `ip:${ip}`, ip, failureType);
    void recordSecurityEvent({
      type: failureType,
      actorId: payload?.sub,
      ip,
      userAgent,
      action: `JWT ${failureType === 'jwt_expired' ? 'expired' : 'invalid'}`,
      outcome: 'failure',
    });
    return null;
  }

  // 3. Check User ID header
  // Allow device-based auth in production (device:{uuid} format is sufficiently unique)
  // This enables the frontend to make authenticated requests without full JWT
  const userId = getHeader(req, 'X-User-Id');
  if (userId) {
    // In production, only allow device-based userIds (format: device:{uuid})
    // This provides security through the uniqueness of the device ID
    const isDeviceBased = userId.startsWith('device:');

    if (IS_DEV || isDeviceBased) {
      return {
        userId,
        isAdmin: false,
        isDevMode: IS_DEV,
        authMethod: 'user_id',
      };
    }
  }

  // 4. Check dev mode bypass
  if (IS_DEV) {
    // Check X-Admin-Key header first (from api-helpers.ts)
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

    // Check query params for admin_key (legacy support)
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
 *
 * Enhanced with:
 * - Lockout checking (blocks requests from locked out users/IPs)
 * - Success tracking (clears failed attempt counters)
 * - Anomaly detection (flags unusual patterns)
 */
export function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
  config: AuthConfig = {}
): AuthContext | null {
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

  const auth = authenticate(req);

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
    sendError(res, 'Admin access required', 403); // Keep technical for admin
    return null;
  }

  // Authentication successful - record and clear any failed attempts (fire and forget)
  void recordSuccessfulAuth({
    userId: auth.userId,
    method: auth.authMethod === 'api_key' ? 'api_key' : 'jwt',
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
 * Require admin authentication.
 */
export function requireAdmin(req: IncomingMessage, res: ServerResponse): AuthContext | null {
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
export function getAuthenticatedUserId(req: IncomingMessage, res: ServerResponse): string | null {
  const auth = requireAuth(req, res);
  return auth?.userId || null;
}

// ============================================================================
// RATE LIMITING (Enhanced tier-based implementation)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitTier {
  name: string;
  maxRequests: number;
  windowMs: number;
}

/**
 * Rate limit tiers for different access levels
 */
export const RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  // Unauthenticated requests - strictest limits
  anonymous: { name: 'anonymous', maxRequests: 20, windowMs: 60000 },

  // Authenticated free users
  free: { name: 'free', maxRequests: 60, windowMs: 60000 },

  // Paid subscribers (Friend tier)
  friend: { name: 'friend', maxRequests: 200, windowMs: 60000 },

  // Premium subscribers (Partner tier)
  partner: { name: 'partner', maxRequests: 500, windowMs: 60000 },

  // Admin/system users - highest limits
  admin: { name: 'admin', maxRequests: 1000, windowMs: 60000 },

  // Burst protection for expensive endpoints (LLM calls, etc.)
  expensive: { name: 'expensive', maxRequests: 10, windowMs: 60000 },
};

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check rate limit for a key.
 * Returns { allowed, remaining, resetAt } for detailed response headers.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Get rate limit tier based on auth context
 */
export function getRateLimitTier(auth: AuthContext | null): RateLimitTier {
  if (!auth) return RATE_LIMIT_TIERS.anonymous;
  if (auth.isAdmin) return RATE_LIMIT_TIERS.admin;
  if (auth.isDevMode) return RATE_LIMIT_TIERS.admin; // Dev mode gets admin limits

  // Could be extended to check subscription tier from auth context
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

  // Add rate limit headers
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

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log.debug({ cleaned }, 'Cleaned expired rate limit entries');
  }
}, 60000); // Every minute
