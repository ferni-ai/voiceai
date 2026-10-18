/**
 * What the crisis checks saw on each call, and handoff wording kept to it
 * (HANDOFF_CRISIS_WORDING=on, off by default).
 *
 * Prod 2026-10-18: a classifier-only crisis read of "Can you pass me to 9?"
 * (STT for Nayan) gave the caller the 988 line. When Alex then handed the
 * caller to Nayan, the handoff tool's summary said they were "earlier in a
 * crisis context", and that went into Nayan's brief.
 *
 * Per call, in memory:
 * - escalated: a real escalation (a pattern match, the crisis script, or a
 *   classifier read the agreement gate or a live adjudicator let stand);
 * - risky: any classifier read that was not none or gave no verdict, or a soft
 *   check-in;
 * - checked: at least one read finished, so "nothing found" means something;
 * - pending: reads still in flight, which count as risk until they finish.
 *
 * Fail closed. With the flag on, a handoff's reason and summary lose only the
 * clauses that say no more than "in a crisis context" (or the like), and only
 * on a known call where reads ran and none found risk, failed or is still
 * running. Text that names anything specific (unsafe, distress, at risk,
 * safety, self-harm, hurt, abuse, not alone, …) anywhere is kept whole.
 *
 * @module CrisisEscalations
 */

import { flagOn, type Env } from '../../config/env-flag.js';

const TTL_MS = 6 * 60 * 60 * 1000;
/** Above this, calls with nothing risky recorded are dropped first; a risky call is never dropped early. */
const MAX_CALLS = 512;

interface CallRecord {
  at: number;
  escalated: boolean;
  risky: boolean;
  checked: boolean;
}

const calls = new Map<string, CallRecord>();
/** Per call: reads in flight, by the caller words they read (a turn). */
const pending = new Map<string, Map<string, number>>();

const turnOf = (latest: string): string =>
  latest
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function evict(now: number): void {
  for (const [id, r] of calls) if (now - r.at > TTL_MS) calls.delete(id);
  for (const [id, r] of calls) {
    if (calls.size < MAX_CALLS) return;
    if (!r.escalated && !r.risky) calls.delete(id); // oldest first: Map order is least recent first
  }
}

/** Record on a call, moving it to the back (least recently used goes first). */
function note(sessionId: string | undefined, now: number, mark: Partial<CallRecord>): void {
  if (!sessionId) return;
  const before = calls.get(sessionId);
  calls.delete(sessionId);
  if (!before) evict(now);
  calls.set(sessionId, {
    escalated: false,
    risky: false,
    checked: false,
    ...before,
    ...mark,
    at: now,
  });
}

const fresh = (sessionId: string, now: number): CallRecord | undefined => {
  const r = calls.get(sessionId);
  return r && now - r.at <= TTL_MS ? r : undefined;
};

/** Record a real escalation on this call (see the module comment for what counts). */
export function noteCrisisEscalation(sessionId: string | undefined, now = Date.now()): void {
  note(sessionId, now, { escalated: true, checked: true });
}

export function crisisEscalatedThisCall(sessionId: string, now = Date.now()): boolean {
  return fresh(sessionId, now)?.escalated === true;
}

/** Record that a read on this call found risk or gave no verdict, or that it got a soft check-in. */
export function noteCrisisRisk(sessionId: string | undefined, now = Date.now()): void {
  note(sessionId, now, { risky: true, checked: true });
}

/**
 * Track one classifier read for this call: in flight until it settles, then
 * noted as risk unless it is a clean none.
 */
export function trackCrisisRead<T extends { risk: string } | null>(
  sessionId: string | undefined,
  latest: string,
  read: Promise<T>
): Promise<T> {
  if (!sessionId) return read;
  const turn = turnOf(latest);
  const reads = pending.get(sessionId) ?? new Map<string, number>();
  reads.set(turn, (reads.get(turn) ?? 0) + 1);
  pending.set(sessionId, reads);
  const settle = (risky: boolean): void => {
    const left = (reads.get(turn) ?? 1) - 1;
    if (left > 0) reads.set(turn, left);
    else reads.delete(turn);
    if (reads.size === 0) pending.delete(sessionId);
    note(sessionId, Date.now(), risky ? { risky: true, checked: true } : { checked: true });
  };
  read.then(
    (v) => settle(v?.risk !== 'none'),
    () => settle(true)
  );
  return read;
}

/**
 * Any risk on this call: an escalation, a risky or failed read, a soft
 * check-in, or a read still in flight. With `latest`, reads in flight of those
 * same words (this turn's other path) are not counted.
 */
export function crisisRiskThisCall(sessionId: string, latest?: string, now = Date.now()): boolean {
  const r = fresh(sessionId, now);
  if (r?.escalated || r?.risky) return true;
  const reads = pending.get(sessionId);
  if (!reads) return false;
  const turn = latest === undefined ? undefined : turnOf(latest);
  return [...reads.keys()].some((t) => t !== turn);
}

/** Reads ran on this call and finished. */
function checkedThisCall(sessionId: string, now: number): boolean {
  return fresh(sessionId, now)?.checked === true;
}

/** For tests. */
export function resetCrisisEscalations(): void {
  calls.clear();
  pending.clear();
}

/** For tests: how many calls are recorded. */
export function recordedCalls(): number {
  return calls.size;
}

/** The classifier-only wording a handoff may carry with nothing behind it. */
const ONLY_A_CRISIS_CONTEXT =
  /\b(?:in (?:a |the )?crisis(?: (?:context|mode|situation|state|moment))?|(?:a |the )?crisis (?:context|mode|situation|state|moment))\b/i;

/** Anything specific about the caller's safety: never removed. */
const SAYS_MORE =
  /\b(?:unsafe|safe\w*|safety|distress\w*|risk\w*|self[- ]?harm\w*|harm\w*|hurt\w*|abus\w*|not alone|suicid\w*|kill\w*|die|dying|dead|death|overdos\w*|988|911|hotline|lifeline|pills?|cut\w*|guns?|weapons?|violen\w*|danger\w*|attempt\w*|threat\w*|scared|afraid|panic\w*)\b/i;

/** Clauses: sentences, semicolons, dashes and commas, each with what ends it. */
const CLAUSE = /[^.!?;,—–]+(?:[.!?;,—–]+\s*|$)/g;

/** The text without each clause that says "in a crisis context"; undefined when nothing is left. */
function withoutCrisisContext(text: string): string | undefined {
  const kept = (text.match(CLAUSE) ?? []).filter((c) => !ONLY_A_CRISIS_CONTEXT.test(c));
  const out = kept
    .join('')
    .replace(/[\s,;—–-]+$/, '')
    .trim();
  return /[a-z0-9]/i.test(out) ? out : undefined;
}

/**
 * A handoff's reason or summary as the teammate may read it: unchanged with the
 * flag off, without a call id, with no reads finished on the call, after any
 * risk on it, when it names anything specific about their safety, or when it
 * holds no "crisis context" clause; otherwise without those clauses.
 */
export function withoutUnescalatedCrisis(
  text: string | undefined,
  sessionId: string | undefined,
  env: Env = process.env,
  now = Date.now()
): string | undefined {
  if (!text || !sessionId || !flagOn('HANDOFF_CRISIS_WORDING', env)) return text;
  // Anything specific about their safety, anywhere in it, keeps all of it.
  if (!ONLY_A_CRISIS_CONTEXT.test(text) || SAYS_MORE.test(text)) return text;
  if (!checkedThisCall(sessionId, now) || crisisRiskThisCall(sessionId, undefined, now)) {
    return text;
  }
  return withoutCrisisContext(text);
}
