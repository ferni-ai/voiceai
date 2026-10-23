/**
 * POST /api/call-telemetry (docs/api/call-telemetry.md), copying POST /api/reports:
 * verified uid from the token, per-person limits plus a Firestore daily quota,
 * a strict body capped at 16 KB, admin-only storage, and every room must be the
 * caller's /token claim. Logs never carry the note or room names.
 *
 * @module api/call-telemetry/call-telemetry-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { Firestore } from '@google-cloud/firestore';
import { roomClaimHolder } from '../../servers/api/routes/token-room-claim.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { rateLimit, requireAuth } from '../auth-middleware.js';
import { BodyTooLargeError } from '../bounded-body.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from '../helpers.js';
import { takeReplyReportQuota } from '../reply-reports/reply-report-quota.js';
import { CALL_TELEMETRY_LIMITS, callTelemetryBodySchema } from './call-telemetry-input.js';
import type { CallTelemetryBody, SummaryBody } from './call-telemetry-input.js';
import * as felt from './call-telemetry-store.js';

const log = createLogger({ module: 'CallTelemetry' });

export const CALL_TELEMETRY_PATH = '/api/call-telemetry';

export interface CallTelemetryDeps {
  /** Verify the caller, or answer 401 and return null. */
  authenticate: (req: IncomingMessage, res: ServerResponse) => Promise<{ userId: string } | null>;
  getDb: () => Firestore | null;
  now: () => number;
  mode: () => felt.CallTelemetryMode;
  roomHolder: (db: Firestore, room: string, uid: string, now: number) => Promise<string>;
  recordSummary: (uid: string, summary: SummaryBody) => Promise<void>;
}

const defaultDeps: CallTelemetryDeps = {
  authenticate: requireAuth,
  getDb: getFirestoreDb,
  now: Date.now,
  mode: () => felt.callTelemetryMode(),
  roomHolder: roomClaimHolder,
  recordSummary: async () => {}, // the BigQuery write is spec PR S2
};

const LIMITS = {
  summary: { keyPrefix: 'call-telemetry', maxRequests: 20, windowMs: 3_600_000 },
  feltOff: { keyPrefix: 'call-felt-off', maxRequests: 5, windowMs: 60_000 },
} as const;

/** The validated body, or null once a 400 or 413 has been sent. */
async function readBody(
  req: IncomingMessage,
  res: ServerResponse
): Promise<CallTelemetryBody | null> {
  let raw: unknown;
  try {
    raw = await parseBody(req, { maxBytes: CALL_TELEMETRY_LIMITS.maxBodyBytes });
  } catch (error) {
    if (!(error instanceof BodyTooLargeError)) sendError(res, 'Invalid JSON body', 400);
    else if (!res.headersSent) sendError(res, 'Too large', 413); // the server answers it itself
    return null;
  }
  const parsed = callTelemetryBodySchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Paths only: an issue message can echo a value the client sent
  const paths = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  sendError(res, `Invalid call telemetry: ${paths}`, 400);
  return null;
}

/** Room check, then the summary sink or the felt-off write (with its daily quota). */
async function store(
  res: ServerResponse,
  deps: CallTelemetryDeps,
  db: Firestore,
  uid: string,
  body: CallTelemetryBody
): Promise<void> {
  const now = deps.now();
  const holders = await Promise.all(body.rooms.map(async (r) => deps.roomHolder(db, r, uid, now)));
  if (holders.includes('theirs')) return sendError(res, 'Forbidden', 403);
  if (body.kind === 'summary') {
    await deps.recordSummary(uid, body);
    return sendJSON(res, { ok: true }, 202);
  }
  const allowed = await takeReplyReportQuota(db, uid, now, felt.PER_DAY, felt.QUOTA_COLLECTION);
  if (!allowed) return sendError(res, 'Too many reports today', 429);
  const roomVerified = holders.every((h) => h === 'mine');
  const ref = db.collection(felt.COLLECTION).doc();
  await ref.set(felt.feltOffRecord(uid, body, roomVerified, now));
  log.info({ reportId: ref.id, roomVerified }, 'Call felt off');
  sendJSON(res, { ok: true, id: ref.id }, 201);
}

export async function handleCallTelemetryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: CallTelemetryDeps = defaultDeps
): Promise<boolean> {
  if (pathname !== CALL_TELEMETRY_PATH) return false;
  const answer = (status: number, message: string): true => (sendError(res, message, status), true);
  const mode = deps.mode();
  if (mode === 'off') return answer(404, 'Not found'); // as if the route did not exist
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  if (req.method !== 'POST') return answer(405, 'Method not allowed');
  const caller = await deps.authenticate(req, res);
  if (!caller) return true;
  const body = await readBody(req, res);
  if (!body) return true;
  if (body.kind === 'summary' && mode !== 'on') return answer(404, 'Not found');
  const keyGenerator = (): string => `user:${caller.userId}`;
  if (rateLimit(req, res, { ...LIMITS[body.kind], keyGenerator })) return true;
  const db = deps.getDb();
  if (!db) return answer(503, 'Call telemetry is unavailable right now');
  try {
    await store(res, deps, db, caller.userId, body);
  } catch (error) {
    log.error({ error: String(error) }, 'Could not store call telemetry');
    sendError(res, 'Could not store call telemetry', 500);
  }
  return true;
}
