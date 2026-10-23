/**
 * The window between telling the app a call is over (`conversation_end`) and
 * closing its room (call-wrap-up.ts). The call must never end on crisis risk,
 * and a caller who keeps talking hasn't left, so inside this window:
 * - crisis risk noted on this call (crisis-call-risk.ts) reopens it;
 * - a final caller line reopens it unless it is a sign-off (callerSignsOff:
 *   only goodbyes and "thanks", "you too", "love you", with no risk in it).
 *   A line with risk beyond its goodbye (farewell-risk.ts: "I won't be here
 *   tomorrow. Bye.") is recorded as crisis risk on the call and reopens it as a
 *   crisis hold, so no later goodbye ends it;
 * - interim transcripts HOLD the app's hang-up (`conversation_hold`,
 *   `caller_speaking`), looked at no more than every HOLD_RESEND_MS; a look
 *   that reads a sign-off sends nothing. A hold never reopens the call;
 * - after a sign-off, the turn's crisis read starting holds the app too
 *   (`checking`), and the room is not closed until it settles (readPending).
 * Voice activity does none of this (caller-activity.ts).
 *
 * It reopens at most once. Once the room's teardown has begun, or the caller
 * has left, nothing reopens: crisis risk noted then is logged CRISIS_AFTER_END
 * at error level, for AFTER_END_WATCH_MS, so a person sees it.
 *
 * @module agents/shared/wrap-up-window
 */
import {
  crisisTurnOf,
  noteCrisisRisk,
  onCrisisRiskNoted,
} from '../../services/safety/crisis-call-risk.js';
import { createLogger } from '../../utils/safe-logger.js';
import { callerSignsOff } from './call-farewell.js';
import { awaitTurnReads, type CallerWatch } from './caller-activity.js';
import { farewellRisk } from './farewell-risk.js';

const log = createLogger({ module: 'wrap-up-window' });

export type ContinueReason = 'crisis_hold' | 'caller_spoke';
export type HoldReason = 'caller_speaking' | 'checking';

/** Interim transcripts are looked at for a hold no more than once per this. */
export const HOLD_RESEND_MS = 500;
/** How long after the end crisis risk is still logged CRISIS_AFTER_END. */
export const AFTER_END_WATCH_MS = 30_000;

export interface WrapUpWindow {
  /** The call carried on: nothing may close it now. */
  readonly continued: boolean;
  /** A sign-off was heard and its crisis read hasn't settled (bounded). */
  readPending: () => boolean;
  /** Reopen the call, once, unless teardown has begun or the caller has left. */
  reopen: (reason: ContinueReason) => void;
  /** The room is being closed (or the caller left): stop listening; log late crisis risk. */
  tearDown: () => void;
}

export function openWrapUpWindow(opts: {
  sessionId: string;
  onContinue: (reason: ContinueReason) => void;
  /** Hold the app's hang-up (only an app call has one). */
  onHold?: (reason: HoldReason) => void;
  caller?: CallerWatch;
  /** Anyone besides Ferni still in the room. */
  callerInRoom: () => boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
  now?: () => number;
}): WrapUpWindow {
  const { sessionId } = opts;
  const now = opts.now ?? Date.now;
  const stops: Array<() => void> = [];
  let continued = false;
  let tornDown = false;
  let lastLook = -Infinity;
  const stop = (): void => stops.splice(0).forEach((fn) => fn());
  const afterEnd = (): void =>
    log.error({ sessionId }, 'CRISIS_AFTER_END crisis risk noted after the call ended');
  const ended = (): boolean => tornDown || !opts.callerInRoom();
  const hold = (reason: HoldReason): void => {
    if (opts.onHold && !ended()) opts.onHold(reason);
  };

  const reads = awaitTurnReads({
    sessionId,
    caller: opts.caller,
    setTimer: opts.setTimer,
    onReadStart: () => hold('checking'),
  });
  stops.push(reads.stop);

  const win: WrapUpWindow = {
    get continued() {
      return continued;
    },
    readPending: reads.pending,
    reopen: (reason) => {
      if (continued || ended()) {
        if (!continued && reason === 'crisis_hold') afterEnd();
        return;
      }
      continued = true;
      stop();
      opts.onContinue(reason);
    },
    tearDown: () => {
      if (tornDown || continued) return;
      tornDown = true;
      stop();
      const late = onCrisisRiskNoted((id) => {
        if (id === sessionId) afterEnd();
      });
      opts.setTimer(late, AFTER_END_WATCH_MS);
    },
  };

  stops.push(
    onCrisisRiskNoted((id) => {
      if (id === sessionId) win.reopen('crisis_hold');
    })
  );
  if (opts.caller) {
    stops.push(
      opts.caller.onWords(({ text, final }) => {
        if (final) {
          if (callerSignsOff(text)) return; // the turn's read still holds the end (reads)
          if (!farewellRisk(text)) return win.reopen('caller_spoke');
          // Record it, so no later goodbye can end this call (crisisRiskThisCall, for its TTL);
          // noting it reopens the call as a crisis hold (the listener above)
          noteCrisisRisk(sessionId, Date.now(), crisisTurnOf(text));
          return win.reopen('crisis_hold');
        }
        if (now() - lastLook < HOLD_RESEND_MS) return;
        lastLook = now();
        if (!callerSignsOff(text)) hold('caller_speaking');
      })
    );
  }
  return win;
}
