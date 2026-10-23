/**
 * The window between telling the app a call is over (`conversation_end`) and
 * closing its room (call-wrap-up.ts). The call must never end on crisis risk,
 * and a caller who keeps talking hasn't left, so inside this window:
 * - crisis risk noted on this call (crisis-call-risk.ts) reopens it. A crisis
 *   read of the caller's last words (transcription plus up to ~1.5 s of
 *   classifier) can settle after `conversation_end` was already sent;
 * - a final caller transcript that isn't a sign-off (callerSignsOff: a goodbye,
 *   "thanks", "you too", "love you") reopens it;
 * - an interim transcript HOLDS the app's hang-up (`conversation_hold`, at
 *   most every HOLD_RESEND_MS) but never reopens: the caller may still be
 *   saying goodbye. Voice activity does neither (caller-activity.ts).
 *
 * It reopens at most once. Once the room's teardown has begun, or the caller
 * has left, nothing reopens: crisis risk noted then is logged CRISIS_AFTER_END
 * at error level, for AFTER_END_WATCH_MS, so a person sees it.
 *
 * @module agents/shared/wrap-up-window
 */
import { onCrisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import { createLogger } from '../../utils/safe-logger.js';
import { callerSignsOff } from './call-farewell.js';
import type { CallerWatch } from './caller-activity.js';

const log = createLogger({ module: 'wrap-up-window' });

export type ContinueReason = 'crisis_hold' | 'caller_spoke';

/** Holds sent to the app while interim transcripts keep arriving: at most one per this. */
export const HOLD_RESEND_MS = 500;
/** How long after the end crisis risk is still logged CRISIS_AFTER_END. */
export const AFTER_END_WATCH_MS = 30_000;

export interface WrapUpWindow {
  /** The call carried on: nothing may close it now. */
  readonly continued: boolean;
  /** Reopen the call, once, unless teardown has begun or the caller has left. */
  reopen: (reason: ContinueReason) => void;
  /** The room is being closed (or the caller left): stop listening; log late crisis risk. */
  tearDown: () => void;
}

export function openWrapUpWindow(opts: {
  sessionId: string;
  onContinue: (reason: ContinueReason) => void;
  /** The caller still holds the app's hang-up (only an app call has one). */
  onHold?: () => void;
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
  let lastHold = -Infinity;
  const stop = (): void => stops.splice(0).forEach((fn) => fn());
  const afterEnd = (): void =>
    log.error({ sessionId }, 'CRISIS_AFTER_END crisis risk noted after the call ended');
  const ended = (): boolean => tornDown || !opts.callerInRoom();

  const win: WrapUpWindow = {
    get continued() {
      return continued;
    },
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
        if (callerSignsOff(text)) return;
        if (final) return win.reopen('caller_spoke');
        if (!opts.onHold || ended() || now() - lastHold < HOLD_RESEND_MS) return;
        lastHold = now();
        opts.onHold();
      })
    );
  }
  return win;
}
