/**
 * POST /api/call-telemetry: how a call sounded on the phone, from the iPhone
 * app. One route, two kinds (call-telemetry-input.ts): a per-call `summary` at
 * hang-up, and a `feltOff` report when the person taps "That felt off".
 *
 * Copies POST /api/reports: any verified Firebase user (anonymous included),
 * uid only from the token, per-person rate limits plus a Firestore daily quota,
 * a strict body capped at 16 KB, admin-only storage. Behind CALL_TELEMETRY:
 * `off` answers 404 as if the route did not exist, `reports` takes felt-off
 * only, `on` takes both. Every room must be this person's (livekit_room_claims,
 * kept 4 h by /token): someone else's is 403, an expired claim is accepted with
 * roomVerified false. Logs never carry the note or room names.
 *
 * Summaries are validated and rate limited, then handed to `recordSummary`,
 * which drops them until the BigQuery table lands (spec PR S2).
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
import {
  CALL_TELEMETRY_LIMITS,
  callTelemetryBodySchema,
  type CallTelemetryBody,
  type SummaryBody,
} from './call-telemetry-input.js';
import {
  callTelemetryMode,
  feltOffRecord,
  FELT_OFF_COLLECTION,
  FELT_OFF_PER_DAY,
  FELT_OFF_QUOTA_COLLECTION,
  type CallTelemetryMode,
} from './call-telemetry-store.js';

const log = createLogger({ module: 'CallTelemetry' });

export const CALL_TELEMETRY_PATH = '/api/call-telemetry';

export interface CallTelemetryCaller {
  userId: string;
}

export type RoomHolder = 'mine' | 'theirs' | 'unclaimed';

export interface CallTelemetryDeps {
  /** Verify the caller, or answer 401 and return null. */
  authenticate: (req: IncomingMessage, res: ServerResponse) => Promise<CallTelemetryCaller | null>;
  getDb: () => Firestore | null;
  now: () => number;
  mode: () => CallTelemetryMode;
  roomHolder: (db: Firestore, room: string, uid: string, now: number) => Promise<RoomHolder>;
  recordSummary: (uid: string, summary: SummaryBody) => Promise<void>;
}

const defaultDeps: CallTelemetryDeps = {
  authenticate: requireAuth,
  getDb: getFirestoreDb,
  now: Date.now,
  mode: () => callTelemetryMode(),
  roomHolder: roomClaimHolder,
  recordSummary: async () => {}, // the BigQuery write is spec PR S2
};

/** true when every room is the caller's, false when some claim expired, null when one is someone else's. */
async function roomsVerified(
  deps: CallTelemetryDeps,
  db: Firestore,
  rooms: string[],
  uid: string,
  now: number
): Promise<boolean | null> {
  const holders = await Promise.all(rooms.map(async (r) => deps.roomHolder(db, r, uid, now)));
  if (holders.includes('theirs')) return null;
  return holders.every((h) => h === 'mine');
}

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
  const verified = await roomsVerified(deps, db, body.rooms, uid, now);
  if (verified === null) return sendError(res, 'Forbidden', 403);
  if (body.kind === 'summary') {
    await deps.recordSummary(uid, body);
    return sendJSON(res, { ok: true }, 202);
  }
  if (!(await takeReplyReportQuota(db, uid, now, FELT_OFF_PER_DAY, FELT_OFF_QUOTA_COLLECTION))) {
    return sendError(res, 'Too many reports today', 429);
  }
  const ref = db.collection(FELT_OFF_COLLECTION).doc();
  await ref.set(feltOffRecord(uid, body, verified, now));
  log.info({ reportId: ref.id, roomVerified: verified }, 'Call felt off');
  sendJSON(res, { ok: true, id: ref.id }, 201);
}

const LIMITS = {
  summary: { keyPrefix: 'call-telemetry', maxRequests: 20, windowMs: 3_600_000 },
  feltOff: { keyPrefix: 'call-felt-off', maxRequests: 5, windowMs: 60_000 },
} as const;

export async function handleCallTelemetryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: CallTelemetryDeps = defaultDeps
): Promise<boolean> {
  if (pathname !== CALL_TELEMETRY_PATH) return false;
  const mode = deps.mode();
  if (mode === 'off') {
    sendError(res, 'Not found', 404);
    return true;
  }
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  if (req.method !== 'POST') {
    sendError(res, 'Method not allowed', 405);
    return true;
  }
  const caller = await deps.authenticate(req, res);
  if (!caller) return true;
  const body = await readBody(req, res);
  if (!body) return true;
  if (body.kind === 'summary' && mode !== 'on') {
    sendError(res, 'Not found', 404);
    return true;
  }
  const keyGenerator = (): string => `user:${caller.userId}`;
  if (rateLimit(req, res, { ...LIMITS[body.kind], keyGenerator })) return true;

  const db = deps.getDb();
  if (!db) {
    sendError(res, 'Call telemetry is unavailable right now', 503);
    return true;
  }
  try {
    await store(res, deps, db, caller.userId, body);
  } catch (error) {
    log.error({ error: String(error) }, 'Could not store call telemetry');
    sendError(res, 'Could not store call telemetry', 500);
  }
  return true;
}
