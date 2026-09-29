/**
 * Admin gate for mutating / per-session endpoints on the voice agent's public
 * health server (GCE :8080).
 *
 * Allowed when either:
 * - the request comes from loopback (in-container tooling), or
 * - it carries `Authorization: Bearer <HEALTH_ADMIN_TOKEN>` (constant-time compare).
 *
 * Liveness/readiness (`/health`, `/health/ready`) stay public.
 */

import { createHash, timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Paths that must not be reachable anonymously from the internet. */
export function isProtectedHealthPath(url: string): boolean {
  const path = url.split('?')[0];
  return path === '/api/memory/cleanup' || path.startsWith('/api/diagnostics/session');
}

function isLoopback(req: IncomingMessage): boolean {
  // A proxy in front would make every caller look local; don't trust loopback then.
  if (req.headers['x-forwarded-for']) return false;
  return LOOPBACK.has(req.socket?.remoteAddress ?? '');
}

function tokensMatch(given: string, expected: string): boolean {
  // Hash first so lengths always match for timingSafeEqual.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function isHealthAdminAuthorized(req: IncomingMessage): boolean {
  if (isLoopback(req)) return true;
  const expected = process.env.HEALTH_ADMIN_TOKEN;
  if (!expected) return false;
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null;
  return !!match && tokensMatch(match[1].trim(), expected);
}
