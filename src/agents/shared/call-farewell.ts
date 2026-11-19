/**
 * After a goodbye, the call ends. GOODBYE_ENDS_CALL (default on, a kill
 * switch) ends it; CALL_WRAP_UP=on also makes Ferni go quiet meanwhile.
 *
 * Before this, a goodbye that didn't end the call left Ferni talking into the
 * line: a silence remark about 15 s after "bye", a whistle, a hum or a snore
 * (presence-watcher.ts), and no hang-up at all.
 *
 * "Farewell said" is per call. It is set by endCall (call-wrap-up.ts); when
 * the caller says goodbye and Ferni's next reply says his, or Ferni had
 * already said his; or when the caller asks Ferni to hang up ("hang up now"),
 * whatever Ferni answers. Ferni carrying on (a reply that isn't a goodbye)
 * clears it, except after a hang-up ask. With CALL_WRAP_UP on, while it
 * holds, stayQuiet() is true: no silence or away remark
 * (silence-response-blockers.ts, session-state-handler.ts), no early
 * check-in, no presence sound. If the caller then says something that isn't a
 * goodbye ("oh wait, one more thing"), it clears and the call carries on.
 *
 * After a farewell, IDLE_AFTER_GOODBYE_MS of quiet once Ferni's goodbye has
 * finished playing ends the call (the watcher's onIdle; call-wrap-up.ts sends
 * `idle_after_goodbye` and hangs up). The caller speaking in that window holds
 * it. Never on a call with crisis risk (crisis-call-risk.ts): that call stays
 * open until the caller leaves. Without a farewell nothing here runs, so the
 * call's idle behaviour is unchanged.
 *
 * Caller goodbyes are whole words in a closing position: "okay bye", "gotta
 * go, talk soon". "goodbye to my old job" and "say bye to grandma for me" are
 * not. happy-exits.ts (#1046) has a looser GOODBYE regex for its goodbye
 * note; this one decides whether the call ends, so it is stricter.
 *
 * @module agents/shared/call-farewell
 */
import { voice } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { goodbyeReadGate } from './goodbye-read.js';
import { isSessionClosing } from './session-closing-tracker.js';
import { farewellRisk } from './farewell-risk.js';
import { goodbyeWatchTally, type GoodbyeWatchTallyOptions } from './goodbye-watch-summary.js';
import { callerAsksToHangUp, callerSaysGoodbye, ferniSaysGoodbye } from './goodbye-phrases.js';

export {
  callerSaysGoodbye,
  callerSignsOff,
  callerAsksToHangUp,
  LEAVING,
  leavingNow,
  ferniSaysGoodbye,
} from './goodbye-phrases.js';

const log = createLogger({ module: 'call-farewell' });

/**
 * Quiet after both goodbyes (Ferni's finished playing) before the call ends:
 * time to say "wait", short enough that the caller isn't left on the line.
 */
export const IDLE_AFTER_GOODBYE_MS = 4_000;

const farewells = new Set<string>();
/** Each watched call's reset, run when it reopens (reopenFarewell). */
const resets = new Map<string, (lines: readonly string[]) => void>();
const sessionIds = new WeakMap<object, string>();

export function markFarewell(
  sessionId: string,
  by: 'end_call' | 'goodbyes' | 'hang_up_asked'
): void {
  if (farewells.has(sessionId)) return;
  farewells.add(sessionId);
  log.info({ sessionId, by }, 'CALL_WRAP_UP farewell said');
}

export function farewellSaid(sessionId: string): boolean {
  return farewells.has(sessionId);
}

export function clearFarewell(sessionId: string): void {
  farewells.delete(sessionId);
}

/**
 * The call reopened after both goodbyes (wrap-up-window.ts): the farewell is
 * cleared and both earlier goodbyes no longer count. Only a FRESH caller
 * goodbye and a NEW one from Ferni end the call again (#2523: a risky line the
 * word check missed, read as none, was then ended by Ferni's "Okay. Bye, take
 * care."). `lines` are the caller's STT finals whose turns' conversation items
 * hadn't arrived: those items follow, and are never that fresh goodbye.
 */
export function reopenFarewell(sessionId: string, lines: readonly string[] = []): void {
  farewells.delete(sessionId);
  resets.get(sessionId)?.(lines);
}

/** Words only, for telling one transcript of a line from another. */
const plainWords = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** `text` contains `line`, as whole words: a turn's item contains each of its STT finals. */
export function containsLine(text: string, line: string): boolean {
  return ` ${plainWords(text)} `.includes(` ${plainWords(line)} `);
}

/** With CALL_WRAP_UP on, both sides have said goodbye on this call. */
export function goodbyesSaid(sessionId: string, env: Env = process.env): boolean {
  return flagOn('CALL_WRAP_UP', env) && farewells.has(sessionId);
}

/**
 * Nothing should speak or play into this call: it is closing, or both sides
 * have said goodbye. With CALL_WRAP_UP off this is exactly isSessionClosing.
 */
export function stayQuiet(sessionId: string, env: Env = process.env): boolean {
  return isSessionClosing(sessionId) || goodbyesSaid(sessionId, env);
}

/** stayQuiet for a session object the farewell watcher is attached to. */
export function stayQuietOn(session: object, env: Env = process.env): boolean {
  const sessionId = sessionIds.get(session);
  return sessionId !== undefined && stayQuiet(sessionId, env);
}

interface ItemEvent {
  item?: { role?: string; textContent?: string };
}
interface StateEvent {
  newState?: string;
}

/** The session events the watcher uses, as an EventEmitter-shaped session. */
interface FarewellSession {
  on: (event: string, fn: (ev: never) => void) => unknown;
  off: (event: string, fn: (ev: never) => void) => unknown;
}

const EV = voice.AgentSessionEventTypes;

/**
 * Watches a call for the two goodbyes and, after them, ends it once
 * IDLE_AFTER_GOODBYE_MS pass with neither side speaking. Returns the
 * cleanup (also run when the session closes).
 */
export function watchFarewell(
  agentSession: object,
  opts: {
    sessionId: string;
    onIdle: () => void;
    idleMs?: number;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
    /** Crisis risk on this call: never end it then (default crisis-call-risk.ts). */
    crisis?: () => boolean;
    /** The classifier reads each caller turn (default: its mode isn't off; goodbye-read.ts). */
    readsExpected?: () => boolean;
    /** The call's GOODBYE_WATCH_SUMMARY, reported once when it closes (goodbye-watch-summary.ts). */
    summary?: GoodbyeWatchTallyOptions;
  }
): () => void {
  const { sessionId } = opts;
  const session = agentSession as FarewellSession;
  if (sessionIds.has(agentSession)) return () => {};
  const setT = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  sessionIds.set(session, sessionId);
  const crisis = opts.crisis ?? (() => crisisRiskThisCall(sessionId));
  const gate = goodbyeReadGate(sessionId, containsLine, opts.readsExpected);
  let callerSaidBye = false;
  let ferniSaidBye = false;
  let hangUpAsked = false;
  /**
   * STT finals carried over a reopen whose turns' conversation items haven't
   * arrived. An item containing one is that turn's own, however late LiveKit
   * adds it (after the turn's processing and the reply's scheduling, seconds
   * later; one turn's item may even follow the next turn's finals): it is
   * skipped. An item containing none is the caller's next turn and ends the
   * carry. No clock: a timer let a late item through (#2532 verify).
   */
  let carried: readonly string[] = [];
  let agent = 'initializing';
  let user = 'listening';
  let timer: unknown = null;
  const tally = goodbyeWatchTally(sessionId, opts.summary);

  const cancel = (): void => {
    if (timer !== null) clearT(timer);
    timer = null;
  };
  const arm = (): void => {
    cancel();
    if (!farewellSaid(sessionId) || isSessionClosing(sessionId)) return;
    tally.farewell();
    if (agent !== 'listening') return tally.blocked(`agent_${agent}`);
    if (user === 'speaking') return tally.blocked('user_speaking');
    tally.armed();
    timer = setT(() => {
      timer = null;
      if (!farewellSaid(sessionId) || isSessionClosing(sessionId)) return;
      if (crisis()) {
        tally.held('crisis');
        log.info({ sessionId }, 'GOODBYE_END_HELD crisis risk on this call; it stays open');
        return;
      }
      if (gate.unread()) {
        tally.held('unread');
        log.info({ sessionId }, 'GOODBYE_END_HELD no read of the goodbye after a reopen');
        return;
      }
      log.info(
        { sessionId, hangUpAsked },
        'GOODBYE_ENDS_CALL quiet after goodbye; ending the call'
      );
      tally.fired();
      opts.onIdle();
    }, opts.idleMs ?? IDLE_AFTER_GOODBYE_MS);
  };

  const onCaller = (text: string): void => {
    // A carried turn's own item is not a fresh goodbye
    if (carried.length > 0) {
      const left = carried.filter((line) => !containsLine(text, line));
      const own = left.length < carried.length;
      carried = own ? left : [];
      if (own) return;
    }
    // A goodbye carrying risk ("I won't be here tomorrow. Bye.") is never one: it carries on
    const risky = farewellRisk(text);
    callerSaidBye = !risky && callerSaysGoodbye(text);
    tally.sawCallerBye(callerSaidBye);
    if (isSessionClosing(sessionId)) return;
    if (callerSaidBye) {
      gate.goodbye(text);
      hangUpAsked = hangUpAsked || callerAsksToHangUp(text);
      if (hangUpAsked) markFarewell(sessionId, 'hang_up_asked');
      else if (ferniSaidBye) markFarewell(sessionId, 'goodbyes'); // his came first
      arm();
      return;
    }
    if (farewellSaid(sessionId)) log.info({ sessionId }, 'CALL_WRAP_UP caller carried on');
    hangUpAsked = false;
    clearFarewell(sessionId);
    cancel();
  };
  const onFerni = (text: string): void => {
    ferniSaidBye = ferniSaysGoodbye(text);
    tally.sawFerniBye(ferniSaidBye);
    if (callerSaidBye && ferniSaidBye) {
      markFarewell(sessionId, 'goodbyes');
      arm();
    } else if (!ferniSaidBye && !hangUpAsked && farewellSaid(sessionId)) {
      log.info({ sessionId }, 'CALL_WRAP_UP Ferni carried on');
      clearFarewell(sessionId);
      cancel();
    }
  };
  const onItem = ({ item }: ItemEvent): void => {
    if (!item?.textContent) return; // only messages carry text
    if (item.role === 'user') onCaller(item.textContent);
    else if (item.role === 'assistant') onFerni(item.textContent);
  };
  const onAgent = (ev: StateEvent): void => {
    agent = ev.newState ?? agent;
    arm();
  };
  const onUser = (ev: StateEvent): void => {
    user = ev.newState ?? user;
    arm(); // cancels while they speak
  };

  const stop = (): void => {
    cancel();
    if (farewellSaid(sessionId)) tally.farewell();
    tally.close();
    clearFarewell(sessionId);
    resets.delete(sessionId);
    gate.stop();
    sessionIds.delete(agentSession);
    session.off(EV.ConversationItemAdded, onItem);
    session.off(EV.AgentStateChanged, onAgent);
    session.off(EV.UserStateChanged, onUser);
    session.off(EV.Close, stop);
  };
  resets.set(sessionId, (lines) => {
    callerSaidBye = ferniSaidBye = hangUpAsked = false;
    carried = lines;
    gate.reopened();
  });
  session.on(EV.ConversationItemAdded, onItem);
  session.on(EV.AgentStateChanged, onAgent);
  session.on(EV.UserStateChanged, onUser);
  session.on(EV.Close, stop);
  return stop;
}
