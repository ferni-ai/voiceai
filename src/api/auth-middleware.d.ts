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
/**
 * Attempt to authenticate a request synchronously (API key and dev mode only).
 * Returns AuthContext if authenticated, null if not.
 * For Firebase auth, use requireAuth() which is async.
 */
export declare function authenticate(req: IncomingMessage): AuthContext | null;
/**
 * Require authentication. Returns AuthContext or sends 401 and returns null.
 *
 * Enhanced with:
 * - Firebase ID token verification (async)
 * - Lockout checking (blocks requests from locked out users/IPs)
 * - Success tracking (clears failed attempt counters)
 * - Anomaly detection (flags unusual patterns)
 */
export declare function requireAuth(req: IncomingMessage, res: ServerResponse, config?: AuthConfig): Promise<AuthContext | null>;
/**
 * Sync version of requireAuth for backwards compatibility.
 * Does NOT verify Firebase tokens (use requireAuth for that).
 */
export declare function requireAuthSync(req: IncomingMessage, res: ServerResponse, config?: AuthConfig): AuthContext | null;
/**
 * Require admin authentication (async - supports Firebase).
 */
export declare function requireAdmin(req: IncomingMessage, res: ServerResponse): Promise<AuthContext | null>;
/**
 * Require admin authentication (sync - no Firebase).
 */
export declare function requireAdminSync(req: IncomingMessage, res: ServerResponse): AuthContext | null;
/**
 * Optional authentication - returns auth context if present, null otherwise.
 * Never sends error response. Uses sync authentication only.
 */
export declare function optionalAuth(req: IncomingMessage): AuthContext | null;
/**
 * Optional authentication with Firebase support (async).
 */
export declare function optionalAuthAsync(req: IncomingMessage): Promise<AuthContext | null>;
/**
 * Get user ID from request (with authentication, async).
 * Returns userId or sends 401 and returns null.
 */
export declare function getAuthenticatedUserId(req: IncomingMessage, res: ServerResponse): Promise<string | null>;
/**
 * Get user ID from request (sync, no Firebase).
 */
export declare function getAuthenticatedUserIdSync(req: IncomingMessage, res: ServerResponse): string | null;
interface RateLimitTier {
    name: string;
    maxRequests: number;
    windowMs: number;
}
export declare const RATE_LIMIT_TIERS: Record<string, RateLimitTier>;
/**
 * Check rate limit for a key (sync version for backwards compatibility).
 * Uses in-memory store. For Redis support, use checkRateLimitAsync.
 */
export declare function checkRateLimit(key: string, maxRequests: number, windowMs: number): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};
/**
 * Check rate limit for a key (async version with Redis support).
 * Uses Redis if available, falls back to in-memory.
 */
export declare function checkRateLimitAsync(key: string, maxRequests: number, windowMs: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
}>;
/**
 * Get rate limit tier based on auth context
 */
export declare function getRateLimitTier(auth: AuthContext | null): RateLimitTier;
/**
 * Rate limit middleware with tier support.
 * Returns true if rate limited (response already sent), false if allowed.
 */
export declare function rateLimit(req: IncomingMessage, res: ServerResponse, options?: {
    maxRequests?: number;
    windowMs?: number;
    tier?: RateLimitTier;
    keyGenerator?: (req: IncomingMessage) => string;
    keyPrefix?: string;
}): boolean;
/**
 * Apply rate limiting for expensive operations (LLM calls, etc.)
 */
export declare function rateLimitExpensive(req: IncomingMessage, res: ServerResponse, operationName: string): boolean;
export {};
//# sourceMappingURL=auth-middleware.d.ts.map