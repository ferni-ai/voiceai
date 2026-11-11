/**
 * GOODBYE_WATCH_SUMMARY: one line per call from the farewell watcher
 * (call-farewell.ts), counts and states only, never words. It says whether each
 * side's goodbye was recognised, how often the quiet window after the goodbyes
 * started, what kept it from starting, and how long the call stayed open after
 * them.
 *
 * It only observes: every recorder returns nothing, and every decision about
 * ending a call stays in call-farewell.ts (a crisis-lane file). This file isn't
 * in the crisis lane, so it must never gate anything.
 *
 * Why: on 2026-11-11 prod had ended no call on a goodbye in 7 days (49 calls
 * watched, 4 farewells), and nothing said why.
 *
 * @module agents/shared/goodbye-watch-summary
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'goodbye-watch-summary' });

export interface GoodbyeWatchSummary {
  sessionId: string;
  callerBye: boolean;
  ferniBye: boolean;
  farewell: boolean;
  /** Quiet windows started after a farewell. */
  armed: number;
  /** Quiet windows that ran out and ended the call. */
  fired: number;
  /** Quiet windows that ran out but were held: crisis risk, or an unread goodbye. */
  held: { crisis: number; unread: number };
  /** Why a farewell's quiet window didn't start: `agent_<state>` or `user_speaking`. */
  blocked: Record<string, number>;
  /** From the first farewell to the session closing; null without one. */
  openAfterFarewellMs: number | null;
}

export type GoodbyeWatchReport = (summary: GoodbyeWatchSummary) => void;

/** Logs the summary as GOODBYE_WATCH_SUMMARY. */
export const logGoodbyeWatchSummary: GoodbyeWatchReport = (summary) =>
  log.info(summary, 'GOODBYE_WATCH_SUMMARY');

export interface GoodbyeWatchTallyOptions {
  report?: GoodbyeWatchReport;
  now?: () => number;
}

/** One call's tally: the watcher records what it decided; `close` reports once. */
export function goodbyeWatchTally(sessionId: string, opts: GoodbyeWatchTallyOptions = {}) {
  const report = opts.report ?? logGoodbyeWatchSummary;
  const now = opts.now ?? Date.now;
  const seen = { callerBye: false, ferniBye: false };
  const counts = { armed: 0, fired: 0, held: { crisis: 0, unread: 0 } };
  const blocked: Record<string, number> = {};
  let firstFarewellAt: number | null = null;
  let reported = false;
  return {
    sawCallerBye(bye: boolean): void {
      seen.callerBye ||= bye;
    },
    sawFerniBye(bye: boolean): void {
      seen.ferniBye ||= bye;
    },
    /** A farewell holds when the watcher checks whether to start its quiet window. */
    farewell(): void {
      firstFarewellAt ??= now();
    },
    /** The quiet window didn't start: `agent_<state>` or `user_speaking`. */
    blocked(why: string): void {
      blocked[why] = (blocked[why] ?? 0) + 1;
    },
    armed(): void {
      counts.armed++;
    },
    held(why: 'crisis' | 'unread'): void {
      counts.held[why]++;
    },
    fired(): void {
      counts.fired++;
    },
    close(): void {
      if (reported) return;
      reported = true;
      report({
        sessionId,
        ...seen,
        farewell: firstFarewellAt !== null,
        armed: counts.armed,
        fired: counts.fired,
        held: { ...counts.held },
        blocked: { ...blocked },
        openAfterFarewellMs: firstFarewellAt === null ? null : now() - firstFarewellAt,
      });
    },
  };
}
