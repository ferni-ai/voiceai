/**
 * POST /api/soul-stats, copying POST /api/call-telemetry: a verified caller, a
 * per-person limit of 120 an hour, a strict counts-only body capped at 1 KB, and
 * an hourly increment that keeps no uid. SOUL_STATS off: 404, as if the route
 * did not exist, and the browser stops sending for the rest of the page.
 *
 * @module api/soul-stats/soul-stats-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { Firestore } from '@google-cloud/firestore';
import { TimeoutError } from '../../utils/async.js';
import { errorClass } from '../../utils/error-class.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { rateLimit, requireAuth } from '../auth-middleware.js';
import { BodyTooLargeError } from '../bounded-body.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from '../helpers.js';
import { SOUL_STATS_LIMITS, soulStatsBodySchema, type SoulCounts } from './soul-stats-input.js';
import { addSoulCounts, FIRESTORE_SLOW, soulStatsOn } from './soul-stats-store.js';

const log = createLogger({ module: 'SoulStats' });

const SOUL_STATS_PATH = '/api/soul-stats';
// The browser's 60 s timer sends up to 60 an hour; the rest is headroom for page-hide sends.
const LIMIT = { keyPrefix: 'soul-stats', maxRequests: 120, windowMs: 3_600_000 } as const;

export interface SoulStatsDeps {
  /** Verify the caller, or answer 401 and return null. */
  authenticate: (req: IncomingMessage, res: ServerResponse) => Promise<{ userId: string } | null>;
  getDb: () => Firestore | null;
  now: () => number;
  enabled: () => boolean;
  addCounts: (db: Firestore, counts: SoulCounts, now: number) => Promise<boolean>;
}

const defaultDeps: SoulStatsDeps = {
  authenticate: requireAuth,
  getDb: getFirestoreDb,
  now: Date.now,
  enabled: () => soulStatsOn(),
  addCounts: addSoulCounts,
};

/** The validated counts, or null once a 400 or 413 has been sent. */
async function readCounts(req: IncomingMessage, res: ServerResponse): Promise<SoulCounts | null> {
  let raw: unknown;
  try {
    raw = await parseBody(req, { maxBytes: SOUL_STATS_LIMITS.maxBodyBytes });
  } catch (error) {
    if (!(error instanceof BodyTooLargeError)) sendError(res, 'Invalid JSON body', 400);
    else if (!res.headersSent) sendError(res, 'Too large', 413);
    return null;
  }
  const parsed = soulStatsBodySchema.safeParse(raw);
  if (parsed.success) return parsed.data.counts;
  const paths = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  sendError(res, `Invalid soul stats: ${paths}`, 400);
  return null;
}

export async function handleSoulStatsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: SoulStatsDeps = defaultDeps
): Promise<boolean> {
  if (pathname !== SOUL_STATS_PATH) return false;
  const answer = (status: number, message: string): true => (sendError(res, message, status), true);
  if (!deps.enabled()) return answer(404, 'Not found');
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  if (req.method !== 'POST') return answer(405, 'Method not allowed');
  const caller = await deps.authenticate(req, res);
  if (!caller) return true;
  const keyGenerator = (): string => `user:${caller.userId}`;
  if (rateLimit(req, res, { ...LIMIT, keyGenerator })) return true;
  const counts = await readCounts(req, res);
  if (!counts) return true;
  const db = deps.getDb();
  if (!db) return answer(503, 'Soul stats are unavailable right now');
  try {
    const stored = await deps.addCounts(db, counts, deps.now());
    sendJSON(res, { ok: true, stored }, 202);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    log.error({ error: errorClass(error), code }, 'Could not store soul stats');
    if (!(error instanceof TimeoutError)) return answer(500, 'Could not store soul stats');
    sendJSON(res, { error: 'Soul stats are unavailable right now', reason: FIRESTORE_SLOW }, 503);
  }
  return true;
}
