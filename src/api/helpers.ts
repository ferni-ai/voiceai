/**
 * Shared API Helper Functions
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Common utilities used across API route handlers.
 * Extracted to reduce duplication and ensure consistency.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { API_ERRORS } from './error-messages.js';
import {
  getCorsHeaders as getSecureCorsHeaders,
  getAPISecurityHeaders,
  isProduction,
} from './security-headers.js';

// ============================================================================
// REQUEST PARSING
// ============================================================================

import { z, type ZodSchema, type ZodError } from 'zod';

/**
 * Parse JSON body from incoming request
 *
 * @param req - Incoming HTTP request
 * @returns Parsed JSON body
 * @throws Error if body is invalid JSON
 */
export async function parseBody<T = unknown>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as T) : ({} as T));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse raw body from incoming request (for webhooks needing signature verification).
 *
 * This returns the raw string body without JSON parsing.
 * Use this for Stripe webhooks or other services that need raw body for signature verification.
 *
 * IMPORTANT: This handles the race condition where:
 * - The stream may have already ended before we attach listeners
 * - The stream may error during reading
 * - Timeout prevents hanging forever on malformed requests
 *
 * @param req - Incoming HTTP request
 * @param options - Configuration options
 * @returns Raw body string
 * @throws Error if body reading fails or times out
 */
export async function parseRawBody(
  req: IncomingMessage,
  options: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<string> {
  const { timeoutMs = 30000, maxBytes = 10 * 1024 * 1024 } = options; // 30s timeout, 10MB max

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let resolved = false;

    // Timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        req.removeAllListeners('error');
        reject(new Error('Body parsing timeout'));
      }
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
    };

    // Check if stream already ended (edge case with keep-alive)
    if (req.complete) {
      cleanup();
      // Stream already consumed or empty
      resolve('');
      return;
    }

    req.on('data', (chunk: Buffer) => {
      if (resolved) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        resolved = true;
        cleanup();
        reject(new Error(`Body exceeds maximum size of ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(err);
    });
  });
}

/**
 * Validation result type for parseBodyWithSchema
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; zodError?: ZodError };

/**
 * Parse and validate JSON body using Zod schema.
 *
 * This is the RECOMMENDED way to parse request bodies. It ensures:
 * 1. Valid JSON syntax
 * 2. Data matches expected schema
 * 3. Type-safe data extraction
 *
 * Usage:
 *   const UserSchema = z.object({
 *     email: z.string().email(),
 *     name: z.string().min(1),
 *   });
 *
 *   const result = await parseBodyWithSchema(req, UserSchema);
 *   if (!result.success) {
 *     return sendError(res, result.error, 400);
 *   }
 *   const { email, name } = result.data; // Fully typed!
 *
 * @param req - Incoming HTTP request
 * @param schema - Zod schema to validate against
 * @returns Validation result with typed data or error message
 */
export async function parseBodyWithSchema<T>(
  req: IncomingMessage,
  schema: ZodSchema<T>
): Promise<ValidationResult<T>> {
  try {
    const rawBody = await parseBody<unknown>(req);
    const result = schema.safeParse(rawBody);

    if (!result.success) {
      // Format Zod errors into human-readable message
      const errorMessages = result.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      return {
        success: false,
        error: `Invalid request body: ${errorMessages}`,
        zodError: result.error,
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid JSON body',
    };
  }
}

/**
 * Validate query parameters using Zod schema.
 *
 * Usage:
 *   const QuerySchema = z.object({
 *     limit: z.coerce.number().min(1).max(100).default(10),
 *     offset: z.coerce.number().min(0).default(0),
 *   });
 *
 *   const result = validateQueryParams(parsedUrl, QuerySchema);
 *   if (!result.success) {
 *     return sendError(res, result.error, 400);
 *   }
 *   const { limit, offset } = result.data;
 *
 * @param parsedUrl - Parsed URL with searchParams
 * @param schema - Zod schema to validate against
 * @returns Validation result with typed data or error message
 */
export function validateQueryParams<T>(parsedUrl: URL, schema: ZodSchema<T>): ValidationResult<T> {
  const params: Record<string, string> = {};
  parsedUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = schema.safeParse(params);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    return {
      success: false,
      error: `Invalid query parameters: ${errorMessages}`,
      zodError: result.error,
    };
  }

  return { success: true, data: result.data };
}

/**
 * Get user ID from request with proper validation.
 *
 * Checks query params, headers, and dev mode. Returns null if not found
 * (callers must handle missing userId appropriately).
 *
 * @param req - Incoming HTTP request
 * @param parsedUrl - Parsed URL with searchParams
 * @returns User ID or null if not provided
 */
export function getUserId(req: IncomingMessage, parsedUrl: URL): string | null {
  const fromQuery = parsedUrl.searchParams.get('userId');
  if (fromQuery) return fromQuery;

  const fromHeader = req.headers['x-user-id'];
  if (typeof fromHeader === 'string' && fromHeader) return fromHeader;

  // Dev mode bypass - allows testing without authentication
  // SECURITY: Only works in development environment
  const isDev = process.env.NODE_ENV !== 'production';
  const adminKey =
    parsedUrl.searchParams.get('admin_key') || (req.headers['x-admin-key'] as string);

  if (isDev && adminKey === 'dev-mode') {
    return 'dev-user-123';
  }

  return null;
}

/**
 * Get user ID or return error response if missing.
 *
 * Use this for endpoints that require authentication.
 *
 * @param req - Incoming HTTP request
 * @param res - Server response
 * @param parsedUrl - Parsed URL
 * @returns User ID if present, or sends 401 and returns null
 */
export function requireUserId(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): string | null {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return null;
  }
  return userId;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

/**
 * CORS headers for API responses.
 * Uses ALLOWED_ORIGINS env var in production.
 *
 * SECURITY: In production, ALLOWED_ORIGINS must be set to specific origins.
 * Wildcard '*' is only allowed in development.
 *
 * @param origin - Optional request Origin header for validation
 */
export function getCorsHeaders(origin?: string): Record<string, string> {
  return getSecureCorsHeaders(origin);
}

/**
 * Combined security + CORS headers for API responses.
 */
export function getSecureResponseHeaders(origin?: string): Record<string, string> {
  return {
    ...getAPISecurityHeaders(),
    ...getCorsHeaders(origin),
  };
}

/**
 * Send JSON response with security headers.
 *
 * @param res - Server response
 * @param data - Data to serialize as JSON
 * @param status - HTTP status code (default 200)
 */
export function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...getSecureResponseHeaders(),
  });
  res.end(JSON.stringify(data));
}

/**
 * Send JSON response with caching and security headers.
 *
 * @param res - Server response
 * @param data - Data to serialize
 * @param maxAge - Cache max-age in seconds
 * @param status - HTTP status code
 */
export function sendJSONCached(
  res: ServerResponse,
  data: unknown,
  maxAge = 60,
  status = 200
): void {
  // Get security headers but override Cache-Control for cacheable responses
  const { 'Cache-Control': _, Pragma: __, ...securityHeaders } = getAPISecurityHeaders();
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...securityHeaders,
    ...getCorsHeaders(),
    // Explicit Cache-Control for cacheable responses (override security no-cache)
    'Cache-Control': `private, max-age=${maxAge}`,
  });
  res.end(JSON.stringify(data));
}

/**
 * Send error response with security headers.
 *
 * @param res - Server response
 * @param message - Error message
 * @param status - HTTP status code (default 500)
 */
export function sendError(res: ServerResponse, message: string, status = 500): void {
  // In production, avoid exposing internal error details
  const safeMessage = isProduction() && status >= 500 ? 'Internal server error' : message;

  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...getSecureResponseHeaders(),
  });
  res.end(JSON.stringify({ error: safeMessage }));
}

/**
 * Handle CORS preflight requests
 *
 * @param req - Incoming request
 * @param res - Server response
 * @returns true if this was a preflight request that was handled
 */
export function handleCorsPreflightIfNeeded(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, getCorsHeaders());
    res.end();
    return true;
  }
  return false;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Parse and validate a positive integer from query string
 *
 * @param value - String value to parse
 * @param defaultValue - Default if not provided or invalid
 * @param max - Maximum allowed value
 * @returns Validated integer
 */
export function parsePositiveInt(value: string | null, defaultValue: number, max?: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return defaultValue;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Standard API route handler signature
 */
export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
) => Promise<boolean>;

// ============================================================================
// LEGACY ALIASES (for backward compatibility)
// ============================================================================

/**
 * Alias for parseBody - used in some route handlers
 */
export const parseRequestBody = parseBody;

/**
 * Alias for sendJSON - used in some route handlers
 */
export const sendSuccess = sendJSON;

/**
 * Legacy wrapper for sendJSON with (res, status, data) signature.
 * New code should use sendJSON(res, data, status) instead.
 */
export function sendJsonResponse(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

/**
 * Validate auth and return userId - returns userId or null (sends 401 if missing)
 * Note: This takes raw req/res without parsedUrl - parses URL internally
 */
export async function validateAuth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<string | null> {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return requireUserId(req, res, parsedUrl);
}

// ============================================================================
// SECURE AUTH HELPERS (IDOR Prevention)
// ============================================================================

import type { AuthContext } from './auth-middleware.js';

/**
 * Securely get userId from authenticated context.
 *
 * SECURITY: This prevents IDOR (Insecure Direct Object Reference) attacks
 * by ensuring users can only access their own data unless they're admins.
 *
 * @param auth - Authenticated context from requireAuth()
 * @param requestedUserId - Optional userId from query params (only used by admins)
 * @returns The appropriate userId to use for the request
 */
export function getSecureUserId(auth: AuthContext, requestedUserId?: string | null): string {
  // Admins can access other users' data (for support/debugging)
  if (auth.isAdmin && requestedUserId) {
    return requestedUserId;
  }
  // Everyone else uses their own authenticated ID
  return auth.userId;
}

/**
 * Verify admin access with proper security checks.
 *
 * SECURITY: This function NEVER accepts 'dev-mode' string in production.
 * The dev-mode bypass only works when NODE_ENV is explicitly 'development'.
 *
 * @param req - Incoming HTTP request
 * @param allowDevMode - Whether to allow dev-mode bypass (only works in development)
 * @returns true if request has valid admin credentials
 */
export function verifyAdminAccess(req: IncomingMessage, allowDevMode = false): boolean {
  const adminKey = req.headers['x-admin-key'] as string | undefined;
  const configuredAdminKey = process.env.ADMIN_KEY;
  const isDev = process.env.NODE_ENV === 'development';

  // Primary check: valid ADMIN_KEY from environment
  if (configuredAdminKey && adminKey === configuredAdminKey) {
    return true;
  }

  // Dev mode bypass - ONLY works in development environment
  // SECURITY: Never accept 'dev-mode' string in production
  if (allowDevMode && isDev && adminKey === 'dev-mode') {
    return true;
  }

  return false;
}

/**
 * Verify admin access from query params or headers.
 *
 * @param req - Incoming HTTP request
 * @param parsedUrl - Parsed URL with searchParams
 * @param allowDevMode - Whether to allow dev-mode bypass (only in development)
 * @returns true if request has valid admin credentials
 */
export function verifyAdminAccessFromUrl(
  req: IncomingMessage,
  parsedUrl: URL,
  allowDevMode = false
): boolean {
  const adminKeyFromHeader = req.headers['x-admin-key'] as string | undefined;
  const adminKeyFromQuery = parsedUrl.searchParams.get('admin_key');
  const adminKey = adminKeyFromHeader || adminKeyFromQuery || undefined;

  const configuredAdminKey = process.env.ADMIN_KEY;
  const isDev = process.env.NODE_ENV === 'development';

  // Primary check: valid ADMIN_KEY from environment
  if (configuredAdminKey && adminKey === configuredAdminKey) {
    return true;
  }

  // Dev mode bypass - ONLY works in development environment
  // SECURITY: Never accept 'dev-mode' string in production
  if (allowDevMode && isDev && adminKey === 'dev-mode') {
    return true;
  }

  return false;
}

// ============================================================================
// ZOD RE-EXPORT (for convenience)
// ============================================================================

/**
 * Re-export Zod for convenient imports.
 *
 * Routes can import both validation helpers and Zod from a single place:
 *   import { parseBodyWithSchema, z, sendError } from './helpers.js';
 */
export { z };
