/**
 * CORS configuration and handling for servers
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { CorsConfig } from './types.js';

/**
 * Default allowed origins
 */
export const DEFAULT_ORIGINS = [
  'http://localhost:3004',
  'http://localhost:3002',
  'http://localhost:8080',
  'https://ferni.ai',
  'https://www.ferni.ai',
  'https://app.ferni.ai',
  'https://ferni-landing.web.app',
  'https://john-bogle-ui-1031920444452.us-central1.run.app',
];

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
 * Get the appropriate CORS origin for a request
 */
export function getCorsOrigin(req: IncomingMessage, allowedOrigins?: string[]): string {
  const origins = allowedOrigins ?? getAllowedOrigins();
  const origin = req.headers.origin;

  if (!origin) {
    return origins[0];
  }

  if (origins.includes(origin) || origins.includes('*')) {
    return origin;
  }

  // Return first origin (won't match, effectively blocking)
  return origins[0];
}

/**
 * Set CORS headers on response
 */
export function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  config?: Partial<CorsConfig>
): void {
  const corsOrigin = getCorsOrigin(req, config?.origins);
  const methods = config?.methods ?? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  const headers = config?.headers ?? ['Content-Type', 'Authorization'];
  const credentials = config?.credentials ?? true;

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', headers.join(', '));

  if (credentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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
