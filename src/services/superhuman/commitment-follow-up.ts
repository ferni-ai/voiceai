/**
 * Commitment follow-through: what the caller said they'd do, brought back on
 * the next call and, when it falls due, between calls.
 *
 * Commitments are captured on every call (commitment-keeper-e2e.ts) into
 * bogle_users/{uid}/commitments, but before this nothing read them back at
 * the start of a call, so "I'll send the resume by Thursday" was rarely asked
 * about. COACH_FOLLOW_THROUGH=on (default off) turns the follow-up on.
 *
 * @module services/superhuman/commitment-follow-up
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CommitmentFollowUp' });

const DAY_MS = 86_400_000;

/** COACH_FOLLOW_THROUGH=on brings open commitments back. Default off. */
export function coachFollowThroughMode(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.COACH_FOLLOW_THROUGH?.trim().toLowerCase() === 'on';
}

/** The fields of a stored commitment this module reads (commitment-keeper.ts). */
export interface OpenCommitment {
  id: string;
  statement: string;
  createdAt: number;
  targetDate?: number;
  followUpAfter: number;
  followUpCount: number;
  lastFollowUp?: number;
}

/** Asked about three times already: let it go, a coach doesn't nag. */
const MAX_FOLLOW_UPS = 3;
/** Asked about recently (on a call or by push): leave it a couple of days. */
const ASK_AGAIN_AFTER_MS = 2 * DAY_MS;
/** Older than this and it is history, not a commitment. */
const STALE_AFTER_MS = 30 * DAY_MS;
/** Next follow-up after one is made. */
const NEXT_FOLLOW_UP_MS = 3 * DAY_MS;

// The capture regex takes any "I'll" or "I need to", so the store holds
// sign-offs and filler too ("I need to go", "I'll let you go"). Whole words only.
const OFFHAND =
  /\b(go|run|head out|hop off|let you go|talk (to you )?(later|soon)|call you|see|think about it|try|figure it out|be fine|be okay|be right back|bbl)\b[.!?]?\s*$/i;
const MIN_WORDS = 4;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** A stored document as an open commitment, or null when it isn't one worth asking about. */
export function toOpenCommitment(id: string, d: Record<string, unknown>): OpenCommitment | null {
  if (d.status !== 'active') return null;
  const statement = String(d.statement ?? d.summary ?? '').trim();
  if (statement.split(/\s+/).length < MIN_WORDS || OFFHAND.test(statement)) return null;
  const createdAt = num(d.createdAt);
  if (createdAt === undefined) return null;
  const targetDate = num(d.targetDate);
  const lastFollowUp = num(d.lastFollowUp);
  return {
    id,
    statement,
    createdAt,
    followUpAfter: num(d.followUpAfter) ?? createdAt + NEXT_FOLLOW_UP_MS,
    followUpCount: num(d.followUpCount) ?? 0,
    ...(targetDate !== undefined && { targetDate }),
    ...(lastFollowUp !== undefined && { lastFollowUp }),
  };
}

/** Worth bringing up on a call now: not asked too often or too recently, not stale. */
export function askableOnCall(c: OpenCommitment, now: number): boolean {
  if (c.followUpCount >= MAX_FOLLOW_UPS) return false;
  if (now - c.createdAt > STALE_AFTER_MS) return false;
  return c.lastFollowUp === undefined || now - c.lastFollowUp >= ASK_AGAIN_AFTER_MS;
}

/** Worth a push between calls: as for a call, and its follow-up date has come. */
export function dueForPush(c: OpenCommitment, now: number): boolean {
  return askableOnCall(c, now) && c.followUpAfter <= now;
}

/**
 * The commitments to bring up on this call, most pressing first: ones whose
 * date has passed, then ones with a date, then the newest.
 */
export function pickForCall(all: OpenCommitment[], now: number, limit = 2): OpenCommitment[] {
  const rank = (c: OpenCommitment) =>
    c.targetDate === undefined ? 2 : c.targetDate <= now ? 0 : 1;
  return all
    .filter((c) => askableOnCall(c, now))
    .sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt)
    .slice(0, limit);
}

function daysAgo(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  if (days < 1) return 'earlier today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * One line for the model: their words and when they said them. The stored
 * target date is a rough guess ("by Thursday" is always a week out), so the
 * model reads the day from their words and today's date instead.
 */
export function describeCommitment(c: OpenCommitment, now: number): string {
  return `"${c.statement}" (they said this ${daysAgo(now - c.createdAt)})`;
}

/** The note that leads the first recall of the call, or null when nothing is open. */
export function formatCheckIn(open: OpenCommitment[], now: number): string | null {
  if (open.length === 0) return null;
  return [
    '[THINGS THEY SAID THEY WOULD DO]',
    ...open.map((c) => `- ${describeCommitment(c, now)}`),
    'A good coach remembers these. Early in this call, unless you already asked or they are clearly not up for it, ask how one of them went, by name, once, like a friend who was rooting for them. If they did it, be glad with them; if not, be curious, not disappointed. If it sounds offhand rather than something they meant, skip it.',
  ].join('\n');
}

/** The slice of Firestore this module needs; injected so tests need no database. */
export interface CommitmentStore {
  active(userId: string): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  markFollowedUp(userId: string, c: OpenCommitment, now: number): Promise<void>;
}

function commitments(userId: string) {
  const db = getFirestoreDb();
  return db ? db.collection('bogle_users').doc(userId).collection('commitments') : null;
}

export const firestoreCommitmentStore: CommitmentStore = {
  async active(userId) {
    const col = commitments(userId);
    if (!col) return [];
    // status + createdAt desc has an index (firestore.indexes.json).
    const snap = await col
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },
  async markFollowedUp(userId, c, now) {
    const col = commitments(userId);
    if (!col) return;
    await col.doc(c.id).update({
      followUpCount: c.followUpCount + 1,
      lastFollowUp: now,
      followUpAfter: now + NEXT_FOLLOW_UP_MS,
    });
  },
};

/**
 * The commitments to bring up on this call, recorded as followed up so the
 * next call and the between-call push don't ask again straight away. Never throws.
 */
export async function loadCallCheckIns(
  userId: string,
  store: CommitmentStore = firestoreCommitmentStore,
  now: number = Date.now()
): Promise<OpenCommitment[]> {
  try {
    const docs = await store.active(userId);
    const all = docs
      .map((d) => toOpenCommitment(d.id, d.data))
      .filter((c): c is OpenCommitment => c !== null);
    const picked = pickForCall(all, now);
    // Recorded in the background: the greeting is waiting on this.
    for (const c of picked) {
      store.markFollowedUp(userId, c, now).catch((error: unknown) => {
        log.warn({ error: String(error), userId, commitmentId: c.id }, 'Follow-up not recorded');
      });
    }
    log.info({ userId, active: all.length, picked: picked.length }, 'Commitment check-ins loaded');
    return picked;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Commitment check-ins not loaded');
    return [];
  }
}

/**
 * One load per caller per call, shared by the greeting and the first recall
 * note (both start within a second of each other). Entries expire so a later
 * call on the same process loads afresh.
 */
const shared = new Map<string, { at: number; open: Promise<OpenCommitment[]> }>();
const SHARED_TTL_MS = 60_000;

export function callCheckIns(
  userId: string,
  store?: CommitmentStore,
  now: number = Date.now()
): Promise<OpenCommitment[]> {
  for (const [key, entry] of shared) if (now - entry.at > SHARED_TTL_MS) shared.delete(key);
  const hit = shared.get(userId);
  if (hit) return hit.open;
  const open = loadCallCheckIns(userId, store, now);
  shared.set(userId, { at: now, open });
  return open;
}
