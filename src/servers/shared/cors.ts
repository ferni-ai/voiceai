/**
 * CORS configuration and handling for servers
 *
 * Security best practices:
 * - Strict origin validation (no wildcards in production)
 * - Credentials require explicit origin match
 * - Limited allowed headers and methods
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { CorsConfig } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CORS' });

/**
 * Production allowed origins (strict)
 */
export const PRODUCTION_ORIGINS = [
  'https://ferni.ai',
  'https://www.ferni.ai',
  'https://app.ferni.ai',
  'https://ferni-landing.web.app',
  'https://john-bogle-ui-1031920444452.us-central1.run.app',
];

/**
 * Development allowed origins
 */
export const DEVELOPMENT_ORIGINS = [
  'http://localhost:3004',
  'http://localhost:3002',
  'http://localhost:8080',
  'http://localhost:5173', // Vite default
  'http://127.0.0.1:3004',
  'http://127.0.0.1:3002',
];

/**
 * Default allowed origins based on environment
 */
export const DEFAULT_ORIGINS =
  process.env.NODE_ENV === 'production'
    ? PRODUCTION_ORIGINS
    : [...DEVELOPMENT_ORIGINS, ...PRODUCTION_ORIGINS];

/**
 * Get allowed origins from environment or defaults
 */
export function getAllowedOrigins(): string[] {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  }
  return DEFAULT_ORIGINS;
}

/**
 * Validate origin against allowed list
 * Returns true if origin is allowed, false otherwise
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins?: string[]): boolean {
  if (!origin) {
    return false;
  }

  const origins = allowedOrigins ?? getAllowedOrigins();

  // Never allow wildcard in production
  if (process.env.NODE_ENV === 'production' && origins.includes('*')) {
    log.warn('Wildcard CORS origin detected in production - ignoring');
    return origins.filter((o) => o !== '*').includes(origin);
  }

  return origins.includes(origin) || origins.includes('*');
}

/**
 * Get the appropriate CORS origin for a request
 * Returns the origin if allowed, otherwise returns empty string
 */
export function getCorsOrigin(req: IncomingMessage, allowedOrigins?: string[]): string {
  const origin = req.headers.origin;

  if (!origin) {
    // No origin header - might be same-origin request
    return '';
  }

  if (isOriginAllowed(origin, allowedOrigins)) {
    return origin;
  }

  // Log blocked CORS attempt in production
  if (process.env.NODE_ENV === 'production') {
    log.warn({ blockedOrigin: origin }, 'CORS request blocked - origin not allowed');
  }

  return '';
}

/**
 * Default allowed headers (minimal for security)
 */
const DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-User-Id',
  'X-Request-Id',
];

/**
 * Default allowed methods
 */
const DEFAULT_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];

/**
 * Set CORS headers on response
 * Only sets headers if origin is in the allowed list
 */
export function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  config?: Partial<CorsConfig>
): void {
  const corsOrigin = getCorsOrigin(req, config?.origins);

  // If no valid origin, don't set CORS headers (browser will block)
  if (!corsOrigin && req.headers.origin) {
    // Origin was provided but not allowed - don't set any CORS headers
    return;
  }

  // If origin is valid, set headers
  if (corsOrigin) {
    const methods = config?.methods ?? DEFAULT_ALLOWED_METHODS;
    const headers = config?.headers ?? DEFAULT_ALLOWED_HEADERS;
    const credentials = config?.credentials ?? true;

    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours preflight cache

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Expose specific response headers to the client
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, X-RateLimit-Remaining');
  }
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflightRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.writeHead(200);
    res.end();
    return true;
  }
  return false;
}

/**
 * Create CORS middleware
 */
export function corsMiddleware(config?: Partial<CorsConfig>) {
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    setCorsHeaders(req, res, config);
    return handleCorsPreflightRequest(req, res);
  };
}
