/**
 * What the caller said they would do ("I'll call my sister Sunday"), kept as a
 * commitment after the call so the next call and the between-call follow-up
 * can ask how it went.
 *
 * The turn-path capture (commitment-keeper-e2e.ts) is a regex over single
 * turns, and on prod it recorded 9 commitments for real callers against 856
 * call summaries (coach audit 2026-10-12). The after-call extraction already
 * reads the whole call and returns "commitment" observations with the caller's
 * own words (world-model/extraction), so this keeps the caller's ones.
 *
 * - Only the caller's own: subject "self", with a quote of their words. The
 *   follow-up repeats that quote back to them, so a paraphrase never goes out.
 * - Dated when they said a day: followed up the evening of that day, their
 *   time; otherwise after three days, as the turn-path writer does.
 * - Deduped against their open commitments and within the call.
 * - Forget-safe: nothing is written when the forgotten topics can't be read,
 *   and nothing about a forgotten topic.
 *
 * Runs as part of the after-call world extraction (register.ts). On unless
 * COACH_COMMITMENT_CAPTURE=off; needs AFTER_CALL_EXTRACTION=on.
 *
 * @module services/superhuman/after-call-commitments
 */

import { flagOn } from '../../config/env-flag.js';
import { forgottenTopicsOrNull, isForgotten } from '../../memory/index.js';
import { getFirestoreDb } from './firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isTeammateTalk } from '../../utils/teammate-talk.js';
import { isActionableCommitment } from '../../utils/commitment-quality.js';

const log = createLogger({ module: 'AfterCallCommitments' });

const DAY_MS = 86_400_000;
const UNDATED_FOLLOW_UP_MS = 3 * DAY_MS;
/** Evening, their time, like the grounded check-ins. */
const FOLLOW_UP_HOUR = 17;
const MIN_CONFIDENCE = 0.6;
/** One call rarely holds more real promises; more is the extractor over-reaching. */
const MAX_PER_CALL = 3;
const SAME_THRESHOLD = 0.6;
/**
 * The quote must say the caller will do something; the extractor sometimes
 * files a thing that happened to them ("my manager moved the deadline up to
 * Friday") as a commitment. Straight or curly apostrophes.
 */
const SAYS_WILL =
  /\b(i['’]ll|i will|i['’]m (going|gonna|planning) to|i am (going|planning) to|i['’]m gonna|gonna|going to|i plan to|i promise|i['’]ve decided to|i need to|i have to|i['’]m about to)\b/i;

export function isCommitmentCaptureOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('COACH_COMMITMENT_CAPTURE', env);
}

const STOP = new Set(
  'the a an to and or of for on in at by with my me i ill i’ll will going gonna get it this that is be am do'.split(
    ' '
  )
);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[’']/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOP.has(w))
  );
}

/** True when two commitments share most of their words (overlap over the smaller set). */
export function sameCommitment(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  const smaller = Math.min(wa.size, wb.size);
  if (smaller === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / smaller >= SAME_THRESHOLD;
}

function tzOffsetMs(at: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - at;
}

/** Epoch ms of `hour`:00 on YYYY-MM-DD in `timezone` (UTC when the name is unknown). */
export function localTimeMs(date: string, hour: number, timezone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  try {
    return guess - tzOffsetMs(guess, timezone);
  } catch {
    return guess;
  }
}

/**
 * The fields of an after-call observation this reads (a structural subset of
 * intelligence/world-model/temporal WorldObservation; services can't import
 * from intelligence).
 */
export interface CommitmentObservation {
  subjectKind: string;
  attribute: string;
  value: string;
  eventDate?: string;
  confidence: number;
  source: { quote?: string };
  by?: 'caller' | 'ferni';
}

/** YYYY-MM-DD of `at` in `timezone` (UTC when the name is unknown). */
export function localDate(at: number, timezone: string): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  try {
    return fmt(timezone);
  } catch {
    return fmt('UTC');
  }
}

export interface CaptureContext {
  userId: string;
  sessionId: string;
  /** When the commitment is recorded (ms). */
  now: number;
  /** The caller's IANA timezone, UTC when unknown. */
  timezone?: string;
}

/** The commitment documents a call's observations hold, before dedupe against the store. */
export function callerCommitmentDocs(
  observations: readonly CommitmentObservation[],
  ctx: CaptureContext
): Array<Record<string, unknown>> {
  const docs: Array<Record<string, unknown>> = [];
  for (const o of observations) {
    if (o.attribute !== 'commitment' || o.subjectKind !== 'self' || o.by === 'ferni') continue;
    if (o.confidence < MIN_CONFIDENCE) continue;
    const quote = o.source.quote?.trim();
    if (!quote || quote.split(/\s+/).length < 3 || !SAYS_WILL.test(quote)) continue;
    // A goodbye, or "I'll call her tomorrow": the quote is repeated back word for word, so a
    // bare pronoun is not filled in from the extractor's paraphrase; it is left out.
    if (!isActionableCommitment(quote)) continue;
    if (flagOn('TEAMMATE_TALK_FILTER') && isTeammateTalk(quote)) continue; // "I'm going to talk to Jordan": a teammate, not a plan
    if (docs.some((d) => sameCommitment(String(d.statement), quote))) continue;
    const tz = ctx.timezone ?? 'UTC';
    // A day already past when they said it ("I called her Monday") is not a plan.
    if (o.eventDate && o.eventDate < localDate(ctx.now, tz)) continue;
    const evening = o.eventDate ? localTimeMs(o.eventDate, FOLLOW_UP_HOUR, tz) : undefined;
    // Today, with the evening already gone: ask the next day instead.
    const targetDate =
      evening === undefined ? undefined : evening > ctx.now ? evening : ctx.now + DAY_MS;
    docs.push({
      userId: ctx.userId,
      statement: quote,
      summary: o.value,
      text: o.value,
      type: 'intention',
      source: 'after_call',
      sessionId: ctx.sessionId,
      emotionalWeight: 0.5,
      status: 'active',
      createdAt: ctx.now,
      lastMentioned: ctx.now,
      followUpAfter: targetDate ?? ctx.now + UNDATED_FOLLOW_UP_MS,
      followUpCount: 0,
      ...(targetDate !== undefined && { targetDate }),
    });
    if (docs.length >= MAX_PER_CALL) break;
  }
  return docs;
}

/** The Firestore this needs; injected so tests (and the dry run) touch no database. */
export interface CommitmentSink {
  /** Statements and summaries of the caller's open commitments. */
  openTexts(userId: string): Promise<string[]>;
  add(userId: string, doc: Record<string, unknown>): Promise<void>;
}

function col(userId: string) {
  return getFirestoreDb()?.collection('bogle_users').doc(userId).collection('commitments') ?? null;
}

export const firestoreCommitmentSink: CommitmentSink = {
  async openTexts(userId) {
    const c = col(userId);
    if (!c) return [];
    const snap = await c.where('status', '==', 'active').limit(100).get();
    return snap.docs.flatMap((d) => {
      const x = d.data();
      return [x.statement, x.summary].filter((s): s is string => typeof s === 'string');
    });
  },
  async add(userId, doc) {
    await col(userId)?.add(doc);
  },
};

export interface CaptureDeps {
  sink?: CommitmentSink;
  forgotten?: (userId: string) => Promise<string[] | null>;
  env?: Record<string, string | undefined>;
}

/** Writes the caller's new commitments from one call. Returns how many. Never throws. */
export async function recordCallerCommitments(
  observations: readonly CommitmentObservation[],
  ctx: CaptureContext,
  deps: CaptureDeps = {}
): Promise<number> {
  if (!isCommitmentCaptureOn(deps.env) || !ctx.userId) return 0;
  const candidates = callerCommitmentDocs(observations, ctx);
  if (candidates.length === 0) return 0;
  const sink = deps.sink ?? firestoreCommitmentSink;
  try {
    // Unreadable forgotten topics: write nothing rather than risk one (fails closed).
    const forgotten = await (deps.forgotten ?? forgottenTopicsOrNull)(ctx.userId);
    if (forgotten === null) return 0;
    const open = await sink.openTexts(ctx.userId);
    let written = 0;
    for (const doc of candidates) {
      const text = `${String(doc.statement)} ${String(doc.summary)}`;
      if (isForgotten(text, forgotten)) continue;
      if (open.some((o) => sameCommitment(o, String(doc.statement)))) continue;
      await sink.add(ctx.userId, doc);
      written++;
    }
    log.info(
      { userId: ctx.userId, sessionId: ctx.sessionId, candidates: candidates.length, written },
      'AFTER_CALL_COMMITMENTS'
    );
    return written;
  } catch (error) {
    log.warn({ userId: ctx.userId, error: String(error) }, 'After-call commitments not recorded');
    return 0;
  }
}
