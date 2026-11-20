/**
 * What callOnBehalf promises the owner when a call is placed (CALL_RESULT_WATCHDOG).
 *
 * Prod 2026-11-16: the owner was told "I'll let you know how it goes" with the
 * live report and the text both off, so the result reached only the app, and
 * they asked three times whether the call happened. The promise now says what
 * the delivery path (call-result-capture.ts) will do, read from its own switches:
 * the live report or the guarded text tell them; otherwise the app does (its
 * card and push). It is said only once the call's watch is written: a call
 * that might never report gets no promise at all (''). A call held for the
 * recipient's hours never gets this line: its held reply already says when it
 * will ring (deferred-calls.ts). Off, there is none, and callOnBehalf keeps its
 * own line.
 *
 * @module services/outreach/call-result-promise
 */
import type { Env } from '../../config/env-flag.js';
import { callResultLiveReportOn } from './call-result-live.js';
import { callResultTextOn } from './call-result-text.js';
import { callResultWatchdogOn } from './call-result-watchdog.js';

export function callResultPromise(armed: boolean, env: Env = process.env): string | undefined {
  if (!callResultWatchdogOn(env)) return undefined;
  if (!armed) return '';
  if (callResultLiveReportOn(env) || callResultTextOn(env)) return "I'll let you know how it goes.";
  return "You'll see how it went in the app.";
}
