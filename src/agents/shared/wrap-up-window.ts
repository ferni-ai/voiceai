/**
 * The window between telling the app a call is over (`conversation_end`) and
 * closing its room (call-wrap-up.ts). The call must never end on crisis risk,
 * and a caller who keeps talking hasn't left, so inside this window either one
 * reopens the call:
 * - crisis risk noted on this call (crisis-call-risk.ts). A crisis read of the
 *   caller's last words (transcription plus up to ~1.5 s of classifier) can
 *   settle after `conversation_end` was already sent;
 * - a new caller line, as transcribed, that isn't itself a goodbye
 *   (callerSaysGoodbye). Transcripts only, never voice activity: VAD fires on
 *   the app's own goodbye sound and on iOS echo, and would reopen every call.
 *
 * It fires at most once, and stops listening when it fires or when the room
 * closes (stop).
 *
 * @module agents/shared/wrap-up-window
 */
import { onCrisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import { callerSaysGoodbye } from './call-farewell.js';

export type ContinueReason = 'crisis_hold' | 'caller_spoke';

/** Subscribe to the call's transcribed caller lines; returns the unsubscribe. */
export type OnCallerLine = (fn: (text: string) => void) => () => void;

export interface WrapUpWindow {
  /** The call carried on: nothing may close it now. */
  readonly continued: boolean;
  /** Reopen the call, once: stops listening, then runs onContinue. */
  reopen(reason: ContinueReason): void;
  /** Stop listening (the room is being closed). */
  stop(): void;
}

export function openWrapUpWindow(opts: {
  sessionId: string;
  onContinue: (reason: ContinueReason) => void;
  onCallerLine?: OnCallerLine;
  /** False: no listening (a phone call hangs up at once); reopen still works. */
  watch?: boolean;
}): WrapUpWindow {
  const stops: Array<() => void> = [];
  let continued = false;
  const stop = (): void => {
    stops.splice(0).forEach((fn) => fn());
  };
  const win: WrapUpWindow = {
    get continued() {
      return continued;
    },
    reopen(reason) {
      if (continued) return;
      continued = true;
      stop();
      opts.onContinue(reason);
    },
    stop,
  };
  if (opts.watch === false) return win;
  stops.push(
    onCrisisRiskNoted((sessionId) => {
      if (sessionId === opts.sessionId) win.reopen('crisis_hold');
    })
  );
  if (opts.onCallerLine) {
    stops.push(
      opts.onCallerLine((text) => {
        if (text.trim() && !callerSaysGoodbye(text)) win.reopen('caller_spoke');
      })
    );
  }
  return win;
}
