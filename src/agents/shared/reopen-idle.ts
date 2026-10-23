/**
 * A call reopened after its goodbyes (call-wrap-up.ts, #2291) needs an idle
 * end of its own. The multi-agent path passes no onIdleTimeout to
 * session-state-handler.ts, so a caller who went quiet after a reopen kept the
 * room open for good (the lead's verify: still open at 300 s).
 *
 * After a reopen: REOPEN_CHECK_IN_MS of quiet, and Ferni checks in once with a
 * short, warm line; IDLE_TIMEOUT's DISCONNECT_THRESHOLD_SECONDS of quiet, and
 * the call ends (`end`: wrapUpCall, which never ends a call with crisis risk).
 * The caller speaking, or Ferni replying before the check-in, starts the quiet
 * over. Ferni's own check-in does not.
 *
 * @module agents/shared/reopen-idle
 */
import { voice } from '@livekit/agents';
import { IDLE_TIMEOUT } from './constants.js';

/** Quiet after a reopen before Ferni checks in, once. */
export const REOPEN_CHECK_IN_MS = 60_000;
/** Quiet after a reopen before the call ends (the existing 120 s idle). */
export const REOPEN_IDLE_END_MS = IDLE_TIMEOUT.DISCONNECT_THRESHOLD_SECONDS * 1000;

interface SessionEvents {
  on: (event: string, fn: (ev: never) => void) => unknown;
  off: (event: string, fn: (ev: never) => void) => unknown;
}

const EV = voice.AgentSessionEventTypes;

/** Watch a reopened call for quiet; returns the stop (also run when the session closes). */
export function watchReopenIdle(
  agentSession: object,
  opts: {
    checkIn: () => void;
    end: () => void;
    setTimer: (fn: () => void, ms: number) => unknown;
    clearTimer: (handle: unknown) => void;
  }
): () => void {
  const session = agentSession as SessionEvents;
  const timers: unknown[] = [];
  let checkedIn = false;
  let agent = 'listening';
  let user = 'listening';
  const quiet = (): boolean => agent === 'listening' && user !== 'speaking';
  const cancel = (): void => timers.splice(0).forEach((t) => opts.clearTimer(t));
  const restart = (): void => {
    cancel();
    if (!checkedIn) {
      timers.push(
        opts.setTimer(() => {
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
  const onItem = ({ item }: { item?: { role?: string } }): void => {
    if (item?.role === 'user') callerActive();
  };
  const onUser = (ev: { newState?: string }): void => {
    user = ev.newState ?? user;
    if (user === 'speaking') callerActive();
  };
  const onAgent = (ev: { newState?: string }): void => {
    agent = ev.newState ?? agent;
    if (!checkedIn) restart(); // Ferni's reply; never his check-in
  };
  const stop = (): void => {
    cancel();
    session.off(EV.ConversationItemAdded, onItem);
    session.off(EV.UserStateChanged, onUser);
    session.off(EV.AgentStateChanged, onAgent);
    session.off(EV.Close, stop);
  };
  session.on(EV.ConversationItemAdded, onItem);
  session.on(EV.UserStateChanged, onUser);
  session.on(EV.AgentStateChanged, onAgent);
  session.on(EV.Close, stop);
  restart();
  return stop;
}
