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
import {
  commitmentLine,
  MAX_CHARS,
  needsContext,
  toSecondPerson,
  type CommitmentLine,
} from '../../utils/commitment-quality.js';
import {
  isCommitmentSingleWriterOn,
  isJudgedRow,
  isSingleWriterRow,
  shownRows,
  type ForgetListLoader,
} from './commitment-single-writer.js';
import { commitmentsShown } from './commitment-forget.js';
import { redactCredentialsIn } from '../../memory/credential-redaction.js';

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
  /** What they said they'd do ("call my sister Sunday"), or their whole line (`whole`). */
  statement: string;
  whole?: true;
  /** Money or a credential (judged-commitments.ts): raised on a call only, never in a text. */
  sensitive?: true;
  createdAt: number;
  targetDate?: number;
  followUpAfter: number;
  followUpCount: number;
  lastFollowUp?: number;
  /** A call Ferni was asked to make that hasn't completed ("call my mom", held till 9): what to say. */
  callNote?: string;
}

/**
 * The line for each statement that asks for a call Ferni hasn't completed
 * (ferniCallNotes in services/outreach/call-status.ts, passed in by the live call).
 */
export type CallNotes = (
  userId: string,
  statements: readonly string[],
  now: number
) => Promise<Map<string, string>>;

/** Asked about three times already: let it go, a coach doesn't nag. */
const MAX_FOLLOW_UPS = 3;
/** Asked about recently (on a call or by push): leave it a couple of days. */
const ASK_AGAIN_AFTER_MS = 2 * DAY_MS;
/** Older than this and it is history, not a commitment. */
const STALE_AFTER_MS = 30 * DAY_MS;
/** Next follow-up after one is made. */
const NEXT_FOLLOW_UP_MS = 3 * DAY_MS;

// Every reader of open commitments (call check-in, push, proactive tick,
// follow-through import, morning brief) comes through here: the stored line is
// cleaned up, goodbyes stored before the writers checked are left out, and a
// line that needs context ("call her tomorrow") is shown only with context.
const MIN_WORDS = 4;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * A judged row is the caller's own words, pronouns and all; who it is about is
 * added when the words don't say ("call her tomorrow (Mindy)").
 */
export function sayBack(statement: string, person: unknown): string {
  const who = typeof person === 'string' ? person.trim() : '';
  return who && !statement.toLowerCase().includes(who.toLowerCase()) ? `${statement} (${who})` : statement; // prettier-ignore
}

/** How a reader asks: `withContext` (its model has the conversation), `judgedOnly` (single writer on). */
export interface OpenCommitmentOptions {
  withContext?: boolean;
  judgedOnly?: boolean;
}

/**
 * The line to ask about, or null when the row shouldn't be. `judgedOnly`
 * (COMMITMENT_SINGLE_WRITER on for this person) keeps only rows the after-call
 * judge wrote and rows a tool wrote at the caller's request; the latter read as
 * on main. Judged rows were judged with the whole call, so the line cleanup
 * meant for the regex captures doesn't apply to them ("text Mindy back").
 * Without `withContext`, a captured line that needs context to make sense is null.
 */
function askableLine(
  d: Record<string, unknown>,
  opts: OpenCommitmentOptions
): CommitmentLine | null {
  const judged = isJudgedRow(d);
  if (opts.judgedOnly === true && !isSingleWriterRow(d)) return null;
  const said = String(d.statement ?? d.summary ?? '')
    .slice(0, MAX_CHARS)
    .trim();
  const words = said.split(/\s+/).length;
  if (judged) return words >= 2 ? { text: sayBack(said, d.person), whole: false } : null;
  const line = words < MIN_WORDS ? null : commitmentLine(said);
  return line === null || (opts.withContext !== true && needsContext(line)) ? null : line;
}

/** A stored document as an open commitment, or null when it isn't one worth asking about. */
export function toOpenCommitment(
  id: string,
  d: Record<string, unknown>,
  opts: OpenCommitmentOptions = {}
): OpenCommitment | null {
  if (d.status !== 'active') return null;
  const line = askableLine(d, opts);
  if (line === null) return null;
  const createdAt = num(d.createdAt);
  if (createdAt === undefined) return null;
  const targetDate = num(d.targetDate);
  const lastFollowUp = num(d.lastFollowUp);
  return {
    id,
    statement: line.text,
    ...(line.whole && { whole: true as const }),
    createdAt,
    followUpAfter: num(d.followUpAfter) ?? createdAt + NEXT_FOLLOW_UP_MS,
    followUpCount: num(d.followUpCount) ?? 0,
    ...(targetDate !== undefined && { targetDate }),
    ...(lastFollowUp !== undefined && { lastFollowUp }),
    ...(d.sensitive === true && { sensitive: true as const }),
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

/** The commitment said back to them: "you'd call your sister Sunday", or their whole line quoted. */
export function youSaidYoud(c: OpenCommitment): string {
  return c.whole ? `"${c.statement}"` : `you'd ${toSecondPerson(c.statement)}`;
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
  const said = `"${c.statement}" (they said this ${daysAgo(now - c.createdAt)})`;
  return c.callNote ? `${said} ${c.callNote}` : said;
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
    const [snap, shown] = await Promise.all([
      col.where('status', '==', 'active').orderBy('createdAt', 'desc').limit(50).get(),
      commitmentsShown(userId),
    ]);
    // Never one they asked Ferni to forget (commitment-forget.ts).
    return snap.docs.filter((d) => shown(d.data())).map((d) => ({ id: d.id, data: d.data() }));
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
  now: number = Date.now(),
  notes?: CallNotes,
  forgotten?: ForgetListLoader
): Promise<OpenCommitment[]> {
  try {
    // Mid-call: process.env holds this caller's flags (applyCallerFlags).
    const judgedOnly = isCommitmentSingleWriterOn();
    const [docs, shown] = await Promise.all([
      store.active(userId),
      shownRows(userId, judgedOnly, forgotten),
    ]);
    const all = docs
      .filter((d) => shown(d.data))
      .map((d) => toOpenCommitment(d.id, d.data, { withContext: true, judgedOnly }))
      .filter((c): c is OpenCommitment => c !== null);
    // A call Ferni was asked to make is asked about only once it has happened (call-status.ts).
    const said = notes
      ? await notes(
          userId,
          all.map((c) => c.statement),
          now
        )
      : new Map();
    const picked = pickForCall(all, now).map((c) =>
      said.has(c.statement) ? { ...c, callNote: said.get(c.statement) } : c
    );
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
 * A plan the caller named on their way out ("dinner with my sister"), as a
 * commitment, so the next call's check-in can ask how it went (HAPPY_EXITS,
 * agents/personas/happy-exits.ts). Stored one short of MAX_FOLLOW_UPS, so the
 * one check-in that asks about it retires it, and with its follow-up date past
 * STALE_AFTER_MS, so the between-call push never nags about it. Null when the
 * check-in would skip it anyway (too short to name).
 */
export function goodbyePlanDoc(
  userId: string,
  plan: string,
  now: number
): Record<string, unknown> | null {
  const statement = `off to ${plan.trim()}`;
  const doc = {
    userId,
    statement,
    summary: statement,
    text: statement,
    type: 'intention',
    source: 'goodbye_plan',
    emotionalWeight: 0.3,
    status: 'active',
    createdAt: now,
    lastMentioned: now,
    // Past the stale cutoff (askableOnCall is > STALE_AFTER_MS), so never due for a push.
    followUpAfter: now + STALE_AFTER_MS + 1,
    followUpCount: MAX_FOLLOW_UPS - 1,
  };
  return toOpenCommitment('new', doc) ? doc : null;
}

export type PlanWriter = (userId: string, doc: Record<string, unknown>) => Promise<void>;

const firestorePlanWriter: PlanWriter = async (userId, doc) => {
  await commitments(userId)?.add(doc);
};

/** Keeps a goodbye plan for the next call's check-in. Never throws. */
export async function rememberGoodbyePlan(
  userId: string,
  plan: string,
  write: PlanWriter = firestorePlanWriter,
  now: number = Date.now()
): Promise<boolean> {
  const doc = goodbyePlanDoc(userId, plan, now);
  if (!doc) return false;
  try {
    await write(userId, redactCredentialsIn(doc));
    log.info({ userId }, 'Goodbye plan kept for the next call');
    return true;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Goodbye plan not kept');
    return false;
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
  now: number = Date.now(),
  notes?: CallNotes
): Promise<OpenCommitment[]> {
  for (const [key, entry] of shared) if (now - entry.at > SHARED_TTL_MS) shared.delete(key);
  const hit = shared.get(userId);
  if (hit) return hit.open;
  const open = loadCallCheckIns(userId, store, now, notes);
  shared.set(userId, { at: now, open });
  return open;
}
