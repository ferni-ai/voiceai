/**
 * API Utilities
 *
 * Common utilities for API route handlers.
 *
 * @module APIUtils
 */

import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Send a JSON response
 */
export function sendJsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Parse JSON request body
 */
export function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * Get query parameter from URL
 */
export function getQueryParam(
  req: IncomingMessage,
  param: string
): string | null {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    return url.searchParams.get(param);
  } catch {
    return null;
  }
}

/**
 * Extract user ID from request (header, query, or body)
 */
export function getUserId(req: IncomingMessage): string | null {
  // Check header first
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId && typeof headerUserId === 'string') {
    return headerUserId;
  }

  // Check query param
  return getQueryParam(req, 'userId');
}

/**
 * Verify authentication (basic version)
 */
export function verifyAuth(
  req: IncomingMessage
): { authorized: boolean; userId?: string } {
  const authHeader = req.headers.authorization;

  // Dev mode bypass
  if (process.env.NODE_ENV === 'development' && authHeader === 'Bearer dev-mode') {
    return { authorized: true, userId: 'dev-user' };
  }

  // Check for API key
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.API_KEY) {
    return { authorized: true };
  }

  // Check for user ID in header
  const userId = getUserId(req);
  if (userId) {
    return { authorized: true, userId };
  }

  return { authorized: false };
}

/**
 * Extract bearer token from authorization header
 */
export function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [type, token] = authHeader.split(' ');
  if (type?.toLowerCase() !== 'bearer') return null;

  return token || null;
}

/**
 * Send error response with consistent format
 */
export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  details?: unknown
): void {
  sendJsonResponse(res, status, {
    success: false,
    error: message,
    ...(details ? { details } : {}),
  });
}

/**
 * Send success response with consistent format
 */
export function sendSuccess(
  res: ServerResponse,
  data: Record<string, unknown> = {}
): void {
  sendJsonResponse(res, 200, {
    success: true,
    ...data,
  });
}

