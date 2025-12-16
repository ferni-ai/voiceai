/**
 * Input validation utilities for server routes
 */

import type { ServerResponse } from 'http';

/**
 * Safe pattern for IDs (alphanumeric, dash, underscore, max 128 chars)
 */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validate that an ID is safe (prevents injection attacks)
 */
export function isValidId(id: unknown): id is string {
  if (!id || typeof id !== 'string') return false;
  return SAFE_ID_PATTERN.test(id);
}

/**
 * Send 400 error for invalid input
 */
export function sendInvalidIdError(res: ServerResponse, field: string): void {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: 'invalid_input',
      message: `Invalid ${field}: must be 1-128 alphanumeric characters, dashes, or underscores`,
    })
  );
}

/**
 * Validate multiple IDs, returning the first invalid one or null if all valid
 */
export function validateIds(
  ids: Record<string, unknown>
): { field: string; value: unknown } | null {
  for (const [field, value] of Object.entries(ids)) {
    if (value !== undefined && value !== null && !isValidId(value)) {
      return { field, value };
    }
  }
  return null;
}

/**
 * Validate required fields are present
 */
export function validateRequired(
  fields: Record<string, unknown>,
  required: string[]
): string | null {
  for (const field of required) {
    if (!fields[field]) {
      return field;
    }
  }
  return null;
}

/**
 * Send 400 error for missing required field
 */
export function sendMissingFieldError(res: ServerResponse, field: string): void {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: 'missing_field',
      message: `Missing required parameter: ${field}`,
    })
  );
}

/**
 * Extract client IP from request
 */
export function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first?.trim() || 'unknown';
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return req.socket?.remoteAddress || 'unknown';
}
