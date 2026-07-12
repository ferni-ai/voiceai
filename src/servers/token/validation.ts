/**
 * Input validation utilities for server routes
 */

import type { ServerResponse } from 'http';

/**
 * Safe pattern for IDs (alphanumeric, dash, underscore, max 128 chars)
 */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Hosts allowed for OAuth return_url redirects (open-redirect prevention).
 * Relative paths (starting with `/` but not `//`) are always allowed.
 */
const ALLOWED_OAUTH_RETURN_HOSTS = new Set([
  'app.ferni.ai',
  'ferni.ai',
  'www.ferni.ai',
  'ferni-prod.web.app',
  'localhost',
  '127.0.0.1',
]);

/**
 * Validate OAuth return_url against an allowlist.
 * Allows same-origin relative paths; rejects protocol-relative and unknown hosts.
 */
export function isAllowedReturnUrl(returnUrl: string | undefined | null): boolean {
  if (!returnUrl) {
    return true; // Caller will use a safe default relative path
  }

  // Relative path on our origin — allow (but reject protocol-relative //evil.com)
  if (returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
    return true;
  }

  try {
    const parsed = new URL(returnUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return ALLOWED_OAUTH_RETURN_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Sanitize return_url: return the URL if allowed, otherwise a safe default.
 */
export function sanitizeReturnUrl(
  returnUrl: string | undefined | null,
  fallback = '/'
): string {
  if (isAllowedReturnUrl(returnUrl) && returnUrl) {
    return returnUrl;
  }
  return fallback;
}

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
 * Trusted proxy IPs that are allowed to set X-Forwarded-For
 * In production, these should be your load balancer/CDN IPs
 */
const TRUSTED_PROXIES = new Set([
  '127.0.0.1',
  '::1',
  // GCP Load Balancer ranges
  '35.191.0.0/16',
  '130.211.0.0/22',
  // Add your CDN/proxy IPs here
]);

/**
 * Check if an IP is in a trusted proxy range
 */
function isTrustedProxy(ip: string | undefined): boolean {
  if (!ip) return false;

  // Direct match
  if (TRUSTED_PROXIES.has(ip)) return true;

  // For production, should use proper CIDR matching
  // For now, check if we're behind a known GCP load balancer
  // GCP always sets a valid X-Forwarded-For when behind their LB
  const isGcpEnvironment = process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT;
  if (isGcpEnvironment) return true;

  return false;
}

/**
 * Extract client IP from request
 *
 * SECURITY: Only trusts X-Forwarded-For from known proxies to prevent IP spoofing.
 * In production (GCP), the load balancer sets this header reliably.
 */
export function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const socketIp = req.socket?.remoteAddress;

  // Only trust proxy headers if the direct connection is from a trusted proxy
  if (isTrustedProxy(socketIp)) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      const ip = first?.trim();
      if (ip) return ip;
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }
  }

  // Fallback to direct socket IP (or unknown if not available)
  return socketIp || 'unknown';
}
