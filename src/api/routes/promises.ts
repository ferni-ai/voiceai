/**
 * What Ferni is following through on for the caller, and what happened
 * (promise ledger 3.4, docs: voiceai-evidence/promise-ledger-2026-10-18):
 *
 * GET /api/promises → { open: [...], recent: [...] }
 *
 * - open: follow-ups still open or raised (bogle_users/{uid}/follow_through,
 *   status open/surfaced), soonest due first.
 * - recent: follow-ups that closed (done, let go, expired) in the last 7 days,
 *   newest first.
 *
 * Always the verified caller's own (requireUserId; a ?userId= naming someone
 * else is not an identity). A read that fails answers 500, never an empty
 * list that reads as "nothing promised". A follow-up about a topic the caller
 * asked Ferni to forget is left out (forget.ts), and when those topics can't be
 * read the route answers 500 rather than risk showing one. Off (404) unless
 * PROMISES_PANEL=on.
 *
 * @module api/routes/promises
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn } from '../../config/env-flag.js';
import { forgottenTopicsOrNull, isForgotten } from '../../memory/recall/forget.js';
import type { FollowUp, FollowUpStore } from '../../services/follow-through/index.js';
import { firestoreFollowUpStore } from '../../services/stores/follow-through-store.js';
import { createLogger } from '../../utils/safe-logger.js';
import { API_ERRORS } from '../error-messages.js';
import { requireUserId, sendError, sendJSON } from '../helpers.js';

const log = createLogger({ module: 'PromisesAPI' });

const RECENT_DAYS = 7;
const MAX_ROWS = 20;
const CLOSED = new Set(['done', 'released', 'expired']);

/** One row as the Today panel reads it. Never a phone number or a contact id. */
export interface PromiseRow {
  id: string;
  kind: FollowUp['kind'];
  text: string;
  status: FollowUp['status'];
  dueAt: string | null;
  zone: string;
  /** How it was last brought up: in a call's opener, during a call, or by text. */
  raisedVia: 'opener' | 'in-call' | 'text' | null;
  /** A call or text Ferni read back that still waits on the caller's yes. */
  waitingOnYou: boolean;
  /** For a call or text Ferni made: whether it went out. */
  outcome: 'sent' | 'failed' | 'unknown' | null;
  updatedAt: string;
}

export function toRow(f: FollowUp): PromiseRow {
  return {
    id: f.id,
    kind: f.kind,
    text: f.text,
    status: f.status,
    dueAt: f.dueAt,
    zone: f.zone,
    raisedVia: f.surfaced.at(-1)?.via ?? null,
    waitingOnYou: f.action?.waitingOn === 'you',
    outcome: f.action?.outcome ?? null,
    updatedAt: f.updatedAt,
  };
}

const dueOrder = (a: FollowUp, b: FollowUp): number =>
  (a.dueAt ?? '￿').localeCompare(b.dueAt ?? '￿');

/** The caller's open and recently closed follow-ups. Throws when the store can't be read. */
export async function promisesFor(
  store: FollowUpStore,
  userId: string,
  now: Date,
  forgotten: (userId: string) => Promise<string[] | null> = forgottenTopicsOrNull
): Promise<{ open: PromiseRow[]; recent: PromiseRow[] }> {
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const [live, changed, topics] = await Promise.all([
    store.live(userId),
    store.changedBetween(userId, since, now),
    forgotten(userId),
  ]);
  if (topics === null) throw new Error('forgotten topics unreadable');
  // The store reads under bogle_users/{userId}; this keeps a stray row from ever leaking.
  const mine = (f: FollowUp) => f.userId === userId && !isForgotten(f.text, topics);
  return {
    open: live.filter(mine).sort(dueOrder).slice(0, MAX_ROWS).map(toRow),
    recent: changed
      .filter((f) => mine(f) && CLOSED.has(f.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_ROWS)
      .map(toRow),
  };
}

export async function handlePromisesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL,
  store: () => FollowUpStore | null = firestoreFollowUpStore,
  forgotten?: (userId: string) => Promise<string[] | null>
): Promise<boolean> {
  if (!flagOn('PROMISES_PANEL')) return false;
  if (pathname !== '/api/promises' || req.method !== 'GET') return false;
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return true;
  try {
    const s = store();
    if (!s) throw new Error('no Firestore');
    sendJSON(res, { success: true, ...(await promisesFor(s, userId, new Date(), forgotten)) });
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to read promises');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
  return true;
}
