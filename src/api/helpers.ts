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

// ============================================================================
// REQUEST PARSING
// ============================================================================

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
 * Get user ID from request with proper validation.
 *
 * Checks query params and headers. Returns null if not found
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
 * Uses ALLOWED_ORIGINS env var in production, defaults to '*' for development.
 */
export function getCorsHeaders(): Record<string, string> {
  const allowedOrigins = process.env.ALLOWED_ORIGINS || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigins,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, Authorization',
  };
}

/**
 * Send JSON response
 *
 * @param res - Server response
 * @param data - Data to serialize as JSON
 * @param status - HTTP status code (default 200)
 */
export function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    ...getCorsHeaders(),
  });
  res.end(JSON.stringify(data));
}

/**
 * Send JSON response with caching
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
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': `private, max-age=${maxAge}`,
    ...getCorsHeaders(),
  });
  res.end(JSON.stringify(data));
}

/**
 * Send error response
 *
 * @param res - Server response
 * @param message - Error message
 * @param status - HTTP status code (default 500)
 */
export function sendError(res: ServerResponse, message: string, status = 500): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...getCorsHeaders(),
  });
  res.end(JSON.stringify({ error: message }));
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
