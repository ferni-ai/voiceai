/**
 * After a goodbye, Ferni goes quiet and the call ends. CALL_WRAP_UP=on.
 *
 * Before this, a goodbye that didn't end the call left Ferni talking into the
 * line: a silence remark about 15 s after "bye", a whistle, a hum or a snore
 * (presence-watcher.ts), and no hang-up at all.
 *
 * "Farewell said" is per call. It is set by endCall (call-wrap-up.ts), or
 * when the caller says goodbye and Ferni's next reply says his. While it
 * holds, stayQuiet() is true: no silence or away remark
 * (silence-response-blockers.ts, session-state-handler.ts), no early
 * check-in, no presence sound. If the caller then says something that isn't a
 * goodbye ("oh wait, one more thing"), it clears and the call carries on.
 *
 * After a farewell, IDLE_AFTER_GOODBYE_MS of quiet ends the call (the
 * watcher's onIdle; call-wrap-up.ts sends `idle_after_goodbye`). Without a
 * farewell nothing here runs, so the call's idle behaviour is unchanged.
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
import { isSessionClosing } from './session-closing-tracker.js';

const log = createLogger({ module: 'call-farewell' });

/** Quiet after both goodbyes before the call ends on its own. */
export const IDLE_AFTER_GOODBYE_MS = 10_000;

const farewells = new Set<string>();
const sessionIds = new WeakMap<object, string>();

export function markFarewell(sessionId: string, by: 'end_call' | 'goodbyes'): void {
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

const LEAD = String.raw`(?:(?:ok(?:ay)?|alright|all right|well|so|anyway|yeah|yep|cool|great|perfect|right|thanks?(?: you)?(?: so much)?|thank you(?: so much)?)[\s,]+)*`;
const CLOSER = String.raw`(?:bye(?:[\s-]?bye)?|goodbye|good ?night|night night|later|see (?:ya|you)(?: later| soon| tomorrow| around| next time)?|talk (?:to you )?(?:later|soon|tomorrow)|catch you later|take care|have a (?:good|great|nice) (?:one|night|day|evening|weekend)|i (?:gotta|got to|have to|need to|should) (?:go|run|get going|head out|hop off)|(?:gotta|got to) (?:go|run|get going)|i'?ll let you go|signing off|i'?m off)`;
const TAIL = String.raw`(?:[\s,]+(?:now|then|ferni|friend|buddy|for now|bye(?:[\s-]?bye)?))*`;
/** A clause that is a goodbye and nothing else. */
const CLOSING_CLAUSE = new RegExp(`^${LEAD}${CLOSER}${TAIL}$`, 'i');
/** A clause that may follow a goodbye without undoing it ("bye, thanks", "bye, love you"). */
const AFTERWORD =
  /^(?:thanks?(?: you)?(?: so much)?|thank you(?: so much)?|ok(?:ay)?|alright|love you|you too|ferni|take care|have a (?:good|great|nice) (?:one|night|day|evening|weekend))$/i;

function clauses(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[.!?,;:]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * The caller is ending the call: the last thing they said (afterwords like
 * "thanks" aside) is a goodbye on its own.
 */
export function callerSaysGoodbye(text: string): boolean {
  if (text.trim().endsWith('?')) return false; // "bye?" is a question, not a goodbye
  const parts = clauses(text);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i] ?? '';
    if (CLOSING_CLAUSE.test(part)) return true;
    if (!AFTERWORD.test(part)) return false;
  }
  return false;
}

const FERNI_GOODBYE =
  /\b(?:bye|goodbye|good ?night|take care|talk (?:to you )?(?:soon|later|tomorrow)|see you (?:soon|later|tomorrow|next time|then|around)|catch you later|have (?:a|an) (?:good|great|nice|lovely|wonderful|fun) (?:one|night|day|evening|weekend|time|dinner|trip)|go (?:enjoy|have fun))\b/i;

/** Ferni's reply says goodbye and doesn't end on a question. */
export function ferniSaysGoodbye(text: string): boolean {
  const t = text.trim();
  return FERNI_GOODBYE.test(t) && !t.endsWith('?');
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
  }
): () => void {
  const { sessionId } = opts;
  const session = agentSession as FarewellSession;
  if (sessionIds.has(agentSession)) return () => {};
  const setT = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  sessionIds.set(session, sessionId);
  let callerSaidBye = false;
  let agent = 'initializing';
  let user = 'listening';
  let timer: unknown = null;

  const cancel = (): void => {
    if (timer !== null) clearT(timer);
    timer = null;
  };
  const arm = (): void => {
    cancel();
    if (!farewellSaid(sessionId) || isSessionClosing(sessionId)) return;
    if (agent !== 'listening' || user === 'speaking') return;
    timer = setT(() => {
      timer = null;
      if (!farewellSaid(sessionId) || isSessionClosing(sessionId)) return;
      log.info({ sessionId }, 'CALL_WRAP_UP idle after goodbye; ending the call');
      opts.onIdle();
    }, opts.idleMs ?? IDLE_AFTER_GOODBYE_MS);
  };

  const onCaller = (text: string): void => {
    callerSaidBye = callerSaysGoodbye(text);
    if (callerSaidBye || isSessionClosing(sessionId)) return;
    if (farewellSaid(sessionId)) log.info({ sessionId }, 'CALL_WRAP_UP caller carried on');
    clearFarewell(sessionId);
    cancel();
  };
  const onItem = ({ item }: ItemEvent): void => {
    if (!item?.textContent) return; // only messages carry text
    if (item.role === 'user') onCaller(item.textContent);
    else if (item.role === 'assistant' && callerSaidBye && ferniSaysGoodbye(item.textContent)) {
      markFarewell(sessionId, 'goodbyes');
      arm();
    }
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
    clearFarewell(sessionId);
    sessionIds.delete(agentSession);
    session.off(EV.ConversationItemAdded, onItem);
    session.off(EV.AgentStateChanged, onAgent);
    session.off(EV.UserStateChanged, onUser);
    session.off(EV.Close, stop);
  };
  session.on(EV.ConversationItemAdded, onItem);
  session.on(EV.AgentStateChanged, onAgent);
  session.on(EV.UserStateChanged, onUser);
  session.on(EV.Close, stop);
  return stop;
}
