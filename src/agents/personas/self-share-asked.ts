/**
 * Ferni's own day only when they ask (SELF_SHARE_WHEN_ASKED=on, with FERNI_STATE).
 *
 * Calls reviewed 2026-10-18: with FERNI_STATE on, his first reply could carry
 * a detail of his day (his wife, the coffee, a friend's text), callers who
 * didn't know him found that odd, and the same ten details came back call
 * after call. Product call: his life is told when asked, not volunteered.
 *
 * With the flag on:
 * - his first reply of a call holds nothing of his day, even when asked
 *   ("hey, how are you?" gets a short "good", then the call is theirs);
 * - after that, a detail rides a reply only when they asked about him
 *   (callerMove 'about_ferni', turn-shape.ts), never unasked;
 * - each detail at most once a call, and none used on this caller's last
 *   three calls.
 *
 * The recent-calls memory is in this process only (by user id, bounded): the
 * self-share code has no per-user store, so a caller whose next call lands
 * on another worker or after a restart can hear a detail again. Anonymous
 * callers get the per-call rule only. His canon (identity/character.md) is
 * unchanged: the wife is still his, just never volunteered.
 *
 * @module agents/personas/self-share-asked
 */

import { flagOn } from '../../config/env-flag.js';
import { DAY_DETAILS, dayDetailFor, isSelfShare, turnsBack } from './ferni-self-share.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

export function selfShareWhenAskedOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('SELF_SHARE_WHEN_ASKED', env);
}

/** Asked on his first reply: how he is in a few words, nothing of his day yet. */
export const FIRST_REPLY_ASKED =
  "They asked about you: say you're good and glad they called, in a few words, with nothing about your day, family or plans yet, then turn to them.";

/** Not asked about him: nothing of his own life rides this reply. */
export const UNASKED =
  'Keep this reply on them: nothing about your own day, family or plans unless they ask.';

/** Asked, but every detail is spent for this caller: a short, true "good". */
export const ASKED_NO_DETAIL =
  "They asked about you: say you're doing well, in a sentence, without a new story of your day, then ask them something about theirs.";

/**
 * SELF_SHARE_STAY_WHEN_ASKED=on (#3475): when they ask about him, he answers
 * and stops there. Dev calls 2026-11-04: 5 of 6 handed every answer straight
 * back ("What about you, how's your afternoon shaping up?"), and a second ask
 * got "Fair enough, what's on your mind then?". Off: the lines are as before.
 */
export function stayWhenAskedOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('SELF_SHARE_STAY_WHEN_ASKED', env);
}

/** "Your last reply was about you": after a share of his that didn't turn it back to them, unless he stays now. */
export function swingAfter(last: string, stays: boolean | undefined): boolean {
  return isSelfShare(last) && !turnsBack(last) && stays !== true;
}

/** On a call that needed him he never stays: `{ stays: false }` there, flag on; undefined off or otherwise. */
export function noStayWhenNeeded(
  needed: boolean,
  env: Record<string, string | undefined> = process.env
): { stays: false } | undefined {
  return needed && stayWhenAskedOn(env) ? { stays: false } : undefined;
}

const THEN_ASK = 'then ask them something about theirs.';
const THEN_STAY =
  "and leave it there: they want to hear about you, so no question back unless you'd really ask one.";

/**
 * How an answer about himself ends: a question back, or nothing forced when
 * he stays (on, and the turn only asked about him: self-share-stay.ts).
 */
export function afterAnswer(stays: boolean | undefined): string {
  return stays === true ? THEN_STAY : THEN_ASK;
}

/**
 * Asked, every detail spent. Staying: one small true thing about how he is,
 * no new event, person or place (#1511), and no question back.
 */
export function askedNoDetail(stays: boolean | undefined): string {
  if (stays !== true) return ASKED_NO_DETAIL;
  return `They asked about you: in a sentence, one small true thing about how you are today, with no new event, person or place, ${THEN_STAY}`;
}

/** How many of the caller's earlier calls a detail may not come back from. */
export const RECENT_CALLS = 3;
/** Callers whose recent calls are kept in this process (the oldest go first). */
const MAX_CALLERS = 500;

export interface Detail {
  id: string;
  text: string;
}

/** Every detail his day can hold this call: his thread's beat first (FERNI_THREADS), then the day details. */
export function detailPool(threadBeat?: string): Detail[] {
  const days = DAY_DETAILS.map((text, i) => ({ id: `day:${i}`, text }));
  return threadBeat ? [{ id: `thread:${threadBeat}`, text: threadBeat }, ...days] : days;
}

/**
 * The next detail for this call: the first in the pool not used this call or
 * on the caller's recent calls, starting from the thread beat (when there is
 * one) or the call's seeded day detail. Undefined when none is left.
 */
export function pickDetail(
  pool: Detail[],
  seed: string,
  usedThisCall: readonly string[],
  usedRecently: ReadonlySet<string>
): Detail | undefined {
  const seeded = dayDetailFor(seed);
  const start = pool[0]?.id.startsWith('thread:')
    ? 0
    : Math.max(
        0,
        pool.findIndex((d) => d.text === seeded)
      );
  for (let k = 0; k < pool.length; k++) {
    const d = pool[(start + k) % pool.length];
    if (!usedThisCall.includes(d.id) && !usedRecently.has(d.id)) return d;
  }
  return undefined;
}

/** userId → the detail ids of each of their calls, oldest first (this call's list is last). */
const byCaller = new Map<string, string[][]>();

const knownCaller = (userId?: string): userId is string => isMemberIdentity(userId);

/**
 * Start a call's record: the list this call's detail ids go in, and the ids
 * from the caller's last RECENT_CALLS calls.
 */
export function startCallRecord(userId?: string): { used: string[]; recent: Set<string> } {
  const used: string[] = [];
  if (!knownCaller(userId)) return { used, recent: new Set() };
  const calls = byCaller.get(userId) ?? [];
  const recent = new Set(calls.slice(-RECENT_CALLS).flat());
  byCaller.delete(userId);
  byCaller.set(userId, [...calls.slice(-RECENT_CALLS), used]);
  if (byCaller.size > MAX_CALLERS) byCaller.delete(byCaller.keys().next().value as string);
  return { used, recent };
}

/** One call's details: where it starts, what it may use, and what it used. */
export interface AskedRecord {
  seed: string;
  pool: Detail[];
  used: string[];
  recent: Set<string>;
}

/** The record for a new call. `detail` is the call's day (ferni-state.ts): a thread beat or the seeded day detail. */
export function askedRecordFor(
  seed: string,
  userId: string | undefined,
  detail: string
): AskedRecord {
  const pool = detailPool(detail === dayDetailFor(seed) ? undefined : detail);
  return { seed, pool, ...startCallRecord(userId) };
}

/** The detail for this asked turn, marked used; undefined when none is left for this caller. */
export function nextDetail(record: AskedRecord): string | undefined {
  const d = pickDetail(record.pool, record.seed, record.used, record.recent);
  if (d) record.used.push(d.id);
  return d?.text;
}

/** Tests only: forget every caller's recent calls. */
export function resetRecentDetails(): void {
  byCaller.clear();
}
