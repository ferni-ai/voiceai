/**
 * A call reopened after its goodbyes (call-wrap-up.ts, #2291) needs an idle
 * end of its own. The multi-agent path passes no onIdleTimeout to
 * session-state-handler.ts, so a caller who went quiet after a reopen kept the
 * room open for good (the lead's verify: still open at 300 s).
 *
 * After a reopen: REOPEN_CHECK_IN_MS of quiet, and Ferni checks in once with a
 * short, warm line; IDLE_TIMEOUT's DISCONNECT_THRESHOLD_SECONDS of quiet, and
 * the call ends (`end`: wrapUpCall, which never ends a call with crisis risk).
 * The caller speaking (voice activity, a transcript or a turn), or Ferni
 * replying before the check-in, starts the quiet over; Ferni's own check-in
 * does not. One watcher per call: a second reopen, or a persona swap's own
 * wrap-up on the same session, replaces it.
 *
 * `heldGoodbyeCheckIn` (HELD_GOODBYE_CHECK_IN, #2695): after
 * HELD_GOODBYE_CHECK_IN_MS of quiet it is asked to check in on a goodbye
 * whose end is held; when it does, that is the one check-in. It never moves
 * the idle end.
 *
 * @module agents/shared/reopen-idle
 */
import { voice } from '@livekit/agents';
import type { CallerWatch } from './caller-activity.js';
import { IDLE_TIMEOUT } from './constants.js';

/** Quiet after a reopen before Ferni checks in, once. */
export const REOPEN_CHECK_IN_MS = 60_000;
/** Quiet after a reopen before the call ends (the existing 120 s idle). */
export const REOPEN_IDLE_END_MS = IDLE_TIMEOUT.DISCONNECT_THRESHOLD_SECONDS * 1000;
/** Quiet after a held goodbye before Ferni checks in, once (#2695). */
export const HELD_GOODBYE_CHECK_IN_MS = 20_000;

interface SessionEvents {
  on: (event: string, fn: (ev: never) => void) => unknown;
  off: (event: string, fn: (ev: never) => void) => unknown;
}

const EV = voice.AgentSessionEventTypes;
/** The running watcher's stop, per AgentSession. */
const watchers = new WeakMap<object, () => void>();

/** Watch a reopened call for quiet; returns the stop (also run when the session closes). */
export function watchReopenIdle(
  agentSession: object,
  opts: {
    checkIn: () => void;
    /** Check in on a held goodbye now; returns whether it did. */
    heldGoodbyeCheckIn?: () => boolean;
    end: () => void;
    /** The caller's transcripts and turns, and whether they are mid-utterance (caller-activity.ts). */
    caller: CallerWatch;
    setTimer: (fn: () => void, ms: number) => unknown;
    clearTimer: (handle: unknown) => void;
  }
): () => void {
  const session = agentSession as SessionEvents;
  watchers.get(agentSession)?.();
  const timers: unknown[] = [];
  let checkedIn = false;
  let agent = 'listening';
  const quiet = (): boolean => agent === 'listening' && !opts.caller.busy();
  const cancel = (): void => timers.splice(0).forEach((t) => opts.clearTimer(t));
  const restart = (): void => {
    cancel();
    const { heldGoodbyeCheckIn } = opts;
    if (!checkedIn && heldGoodbyeCheckIn) {
      timers.push(
        opts.setTimer(() => {
          if (!checkedIn && quiet()) checkedIn = heldGoodbyeCheckIn();
        }, HELD_GOODBYE_CHECK_IN_MS)
      );
    }
    if (!checkedIn) {
      timers.push(
        opts.setTimer(() => {
          if (checkedIn) return; // the held goodbye's check-in was the one
          if (!quiet()) return restart();
          checkedIn = true;
          opts.checkIn();
        }, REOPEN_CHECK_IN_MS)
      );
    }
    timers.push(
      opts.setTimer(() => {
        if (!quiet()) return restart();
        opts.end();
      }, REOPEN_IDLE_END_MS)
    );
  };
  const callerActive = (): void => {
    checkedIn = false;
    restart();
  };
  const onUser = (ev: { newState?: string }): void => {
    if (ev.newState === 'speaking') callerActive();
  };
  const onAgent = (ev: { newState?: string }): void => {
    agent = ev.newState ?? agent;
    if (!checkedIn) restart(); // Ferni's reply; never his check-in
  };
  const unhear = opts.caller.onWords(callerActive);
  const stop = (): void => {
    cancel();
    unhear();
    if (watchers.get(agentSession) === stop) watchers.delete(agentSession);
    session.off(EV.UserStateChanged, onUser);
    session.off(EV.AgentStateChanged, onAgent);
    session.off(EV.Close, stop);
  };
  session.on(EV.UserStateChanged, onUser);
  session.on(EV.AgentStateChanged, onAgent);
  session.on(EV.Close, stop);
  watchers.set(agentSession, stop);
  restart();
  return stop;
}
