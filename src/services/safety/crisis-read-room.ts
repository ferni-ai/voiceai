/**
 * CRISIS_CLASSIFIER_RUN_PER_CALL (#4005): how the short crisis read caches make room
 * (crisis-classifier.ts recentRuns, turnReads, looseReads; crisis-adjudicator.ts recent).
 *
 * Off: main's rule, the oldest entry of any call once a cache holds `max`.
 * On: a twin line's scope makes room only among twin scopes, so twins never push out a call's
 * entries. Calls make room among calls only past CALL_ROOM. A call whose turn reads were pushed
 * out is noted for LOST_MS, and turnVerdicts adds a missing read for it, which every consumer
 * escalates (fail closed): a pushed-out imminent read must never leave a lone crisis read to ease.
 * Calls and twins are noted apart, so twin volume never marks a call missing a read.
 */
import { flagOn } from '../../config/env-flag.js';

type Env = Record<string, string | undefined>;

/** Scopes of the twin's lines (utils/twin-crisis-scope.ts in #4186 names the same prefix). */
const TWIN_SCOPE_PREFIX = 'twin-crisis:';
/** As long as a cache keeps an entry (RECENT_RUN_TTL_MS, RECENT_TTL_MS). */
const LOST_MS = 30_000;
/** Entries of calls (not twins) a cache holds before it pushes out a call's oldest. */
const CALL_ROOM = 1024;

/** Scope → when its turn reads were pushed out, calls and twins apart. EVERY: too many to name,
 * so every scope of that kind fails closed. */
const lost = { call: new Map<string, number>(), twin: new Map<string, number>() };
const EVERY = '\u0000every scope'; // no call id or twin scope starts with NUL

export const perCallReads = (env?: Env): boolean => flagOn('CRISIS_CLASSIFIER_RUN_PER_CALL', env);

const isTwin = (scope: string): boolean => scope.startsWith(TWIN_SCOPE_PREFIX);
const lostOf = (scope: string): Map<string, number> => (isTwin(scope) ? lost.twin : lost.call);

function noteLost(scope: string, now: number): void {
  const table = lostOf(scope);
  for (const [s, at] of table) if (now - at > LOST_MS) table.delete(s);
  table.set(table.size >= CALL_ROOM ? EVERY : scope, now);
}

/**
 * The key to push out before adding an entry for `scope`, or undefined when there is room.
 * `entries` are [key, scope], oldest first. `turnReads`: the cache feeds turnVerdicts, so a
 * pushed-out scope is noted lost; a pushed-out shared run only costs a fresh read.
 */
export function roomFor(
  entries: Iterable<readonly [string, string]>,
  size: number,
  {
    scope,
    max,
    on,
    turnReads,
    now,
  }: {
    scope: string;
    max: number;
    on: boolean;
    turnReads: boolean;
    now: number;
  }
): string | undefined {
  if (!on) return size >= max ? entries[Symbol.iterator]().next().value?.[0] : undefined;
  const twin = isTwin(scope);
  let count = 0;
  let oldest: readonly [string, string] | undefined;
  for (const entry of entries) {
    if (isTwin(entry[1]) !== twin) continue;
    count++;
    oldest ??= entry;
  }
  if (!oldest || count < (twin ? max : CALL_ROOM)) return undefined;
  if (turnReads) noteLost(oldest[1], now);
  return oldest[0];
}

/** A cache's entries as [key, scope], oldest first, for roomFor. */
export function* scopesOf<V>(
  entries: Map<string, V>,
  scopeOf: (key: string, value: V) => string
): Generator<readonly [string, string]> {
  for (const [key, value] of entries) yield [key, scopeOf(key, value)];
}

/**
 * Runs shared for `ttlMs` (a turn's preemptive and final requests), at most `max` (main's room
 * rule; per call with the flag on). In memory only.
 */
export class SharedRuns<R> {
  private readonly runs = new Map<string, { at: number; run: R; scope: string }>();

  constructor(
    private readonly ttlMs: number,
    private readonly max: number
  ) {}

  get(key: string, now: number): { at: number; run: R } | null {
    for (const [k, v] of this.runs) if (now - v.at > this.ttlMs) this.runs.delete(k);
    return this.runs.get(key) ?? null;
  }

  set(key: string, run: R, { scope, on, now }: { scope: string; on: boolean; now: number }): void {
    this.runs.delete(key); // a run too old to join (flag on) is replaced, not kept beside
    const room = { scope, max: this.max, on, turnReads: false, now };
    const out = roomFor(
      scopesOf(this.runs, (_k, v) => v.scope),
      this.runs.size,
      room
    );
    if (out !== undefined) this.runs.delete(out);
    this.runs.set(key, { at: now, run, scope });
  }

  /** Forget `run` (a failed read) unless a newer run has taken its key. */
  drop(key: string, run: R): void {
    if (this.runs.get(key)?.run === run) this.runs.delete(key);
  }

  clear(): void {
    this.runs.clear();
  }
}

/** A call's own turn reads dropped past the cap (looseReads keeps the last `max` per scope). */
export function noteReadsDropped(scope: string, on: boolean, now: number): void {
  if (on) noteLost(scope, now);
}

/** Whether `scope`'s turn reads were pushed out within LOST_MS: a read is missing. */
export function readsLost(scope: string, now = Date.now()): boolean {
  const table = lostOf(scope);
  const since = (key: string) => now - (table.get(key) ?? -Infinity) <= LOST_MS;
  return since(EVERY) || since(scope);
}

/** For tests: forget lost scopes (resetCrisisClassifierCache). */
export function resetLostReads(): void {
  lost.call.clear();
  lost.twin.clear();
}
